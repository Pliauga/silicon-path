<script lang="ts">
	import { getContext, onMount } from 'svelte';
	import { asset } from '$app/paths';
	import { STUDY_FRAME, type StudyFrame } from './frame-mode';
	import type * as Three from 'three';
	import { createBloom, type Bloom } from '$lib/utils/bloom';

	type Algorithm = 'lru' | 'fifo';
	type Outcome = 'idle' | 'hit' | 'fault';
	type FrameSlot = { page: number | null; loadedAt: number; lastUsed: number };
	type FrameAnchor = {
		position: Three.Vector3;
		normal: Three.Vector3;
		quaternion: Three.Quaternion;
		target: Three.Vector3;
		pageQuaternion: Three.Quaternion;
	};
	type PageHome = { position: Three.Vector3; quaternion: Three.Quaternion };
	type Trail = {
		group: Three.Group;
		line: Three.Line;
		material: Three.LineBasicMaterial;
		geometry: Three.BufferGeometry;
		positions: Float32Array;
		lineColors: Float32Array;
		ribbon: Three.Mesh;
		ribbonMaterial: Three.MeshBasicMaterial;
		ribbonGeometry: Three.BufferGeometry;
		ribbonPositions: Float32Array;
		ribbonColors: Float32Array;
		halo: Three.Sprite;
		haloMaterial: Three.SpriteMaterial;
		fade: { o: number };
		color: Three.Color;
		light: Three.PointLight;
	};
	type PageGlow = {
		k: number;
		materials: { material: Three.MeshStandardMaterial; weight: number }[];
	};

	type Props = {
		class?: string;
		eyebrow?: string;
		title?: string;
		lede?: string;
		scrollCue?: string;
		/** Set by the Gallery route explicitly; lessons set it through LazyStudy's context. */
		embedded?: boolean;
	};

	let {
		class: className = '',
		eyebrow = 'Silicon Path / Virtual memory',
		title = 'Every page has a place.',
		lede = 'Click a page on the disk to request it. Request a resident page from the page table — or from its frame — to score a hit. A miss costs a fault: the oldest page leaves, the new one takes its place, and the clock moves on.',
		scrollCue = 'Scroll to close in on the frame array',
		embedded = false
	}: Props = $props();

	const frame = getContext<StudyFrame | undefined>(STUDY_FRAME);
	const embeddedMode = $derived(embedded || frame?.embedded === true);

	const FRAME_TOTAL = 16;
	const PAGE_TOTAL = 20;
	const HIT_COLOR = 0x2b8272;
	const FAULT_COLOR = 0xc2432b;
	const INSERT_COLOR = 0x2b8272;
	const HOVER_COLOR = 0xd97757;
	const HIT_EMISSIVE = 0x2b8272;
	const FAULT_EMISSIVE = 0xc2432b;
	const FLIGHT_EMISSIVE = 0x2b8272;
	const TRAIL_POINTS = 40;
	const TRAIL_TAIL = 0.46;
	/** Height of the hover point above a slot where the fast flight ends and the seat begins. */
	const SEAT_HEIGHT = 0.075;

	const pad = (value: number) => String(value).padStart(2, '0');
	const pageLabel = (page: number) => `P${pad(page)}`;
	const frameLabel = (frame: number) => `F${pad(frame)}`;
	const pageName = (page: number | null) => (page === null ? '—' : pageLabel(page));

	let sectionEl: HTMLElement;
	let canvasHost: HTMLDivElement;

	let loading = $state(true);
	let ready = $state(false);
	let error = $state<string | null>(null);
	let progress = $state(0);

	let algorithm = $state<Algorithm>('lru');
	let hits = $state(0);
	let faults = $state(0);
	let clock = $state(0);
	let frames = $state<FrameSlot[]>([]);
	let pageFrames = $state<number[]>([]);

	let busy = $state(false);
	let outcome = $state<Outcome>('idle');
	let status = $state('Request any page from the disk.');
	let activePage = $state<number | null>(null);
	let targetFrame = $state<number | null>(null);
	let victimFrame = $state<number | null>(null);
	let flyingPage = $state<number | null>(null);
	let flyingVictim = $state<number | null>(null);
	let hoveredPage = $state<number | null>(null);
	let queuedCount = $state(0);
	let reducedMotion = $state(false);

	let residentCount = $derived(frames.filter((frame) => frame.page !== null).length);
	let hitRate = $derived(hits + faults > 0 ? Math.round((hits / (hits + faults)) * 100) : 0);
	let occupancy = $derived(frames.length ? (residentCount / frames.length) * 100 : 0);

	let victimCandidate = $derived.by(() => {
		if (!frames.length) return null;
		let empty = -1;
		for (let i = 0; i < frames.length; i += 1) {
			if (frames[i].page === null) {
				empty = i;
				break;
			}
		}
		if (empty >= 0) return { frame: empty, page: null as number | null, empty: true };
		let best = 0;
		for (let i = 1; i < frames.length; i += 1) {
			const current = frames[i];
			const contender = frames[best];
			const older =
				algorithm === 'fifo'
					? current.loadedAt < contender.loadedAt
					: current.lastUsed < contender.lastUsed;
			if (older) best = i;
		}
		return { frame: best, page: frames[best].page, empty: false };
	});

	let evictionLabel = $derived.by(() => {
		const candidate = victimCandidate;
		if (!candidate) return '—';
		if (candidate.empty) return `${frameLabel(candidate.frame)} free`;
		return `${frameLabel(candidate.frame)} · ${pageName(candidate.page)}`;
	});

	let orderPreview = $derived.by(() => {
		const resident = frames
			.map((frame, index) => ({ ...frame, index }))
			.filter((frame) => frame.page !== null);
		resident.sort((a, b) =>
			algorithm === 'lru' ? a.lastUsed - b.lastUsed : a.loadedAt - b.loadedAt
		);
		if (!resident.length) return '—';
		const head = resident
			.slice(0, 3)
			.map((frame) => frameLabel(frame.index))
			.join(' · ');
		return resident.length > 3 ? `${head}  +${resident.length - 3}` : head;
	});

	let framesSummary = $derived(
		`Frame array: ${residentCount} of ${frames.length} frames occupied. ${
			victimCandidate
				? victimCandidate.empty
					? `${frameLabel(victimCandidate.frame)} is free.`
					: `Next victim is ${frameLabel(victimCandidate.frame)} holding ${pageName(victimCandidate.page)}.`
				: ''
		}`
	);

	// ---------------------------------------------------------------------------
	// Three.js runtime
	// ---------------------------------------------------------------------------

	let THREE!: typeof import('three');
	let gsap!: typeof import('gsap').gsap;
	let ScrollTrigger!: typeof import('gsap/ScrollTrigger').ScrollTrigger;

	let renderer: Three.WebGLRenderer | null = null;
	let bloom: Bloom | null = null;
	let scene: Three.Scene | null = null;
	let camera: Three.PerspectiveCamera | null = null;
	let environmentTexture: Three.Texture | null = null;
	let keyLight: Three.DirectionalLight | null = null;
	let pageGlows: PageGlow[] = [];
	let haloTexture: Three.Texture | null = null;
	let scrollTrigger: { kill: () => void } | null = null;
	let resizeObserver: ResizeObserver | null = null;
	let intersectionObserver: IntersectionObserver | null = null;

	let pageNodes: Three.Object3D[] = [];
	let frameAnchors: FrameAnchor[] = [];
	let pageHomes: PageHome[] = [];
	let glowMeshes: Three.Mesh[] = [];
	let glowMaterials: Three.MeshBasicMaterial[] = [];
	let hoverRing: Three.Mesh | null = null;
	let hoverMaterial: Three.MeshBasicMaterial | null = null;
	let trails: Trail[] = [];
	let trailTokens = [0, 0];
	let raycaster: Three.Raycaster | null = null;

	let activeTimeline: ReturnType<typeof gsap.timeline> | null = null;
	let queueTimer = 0;
	let scrollRefreshTimer: number | undefined;
	let hoverRaf = 0;

	let disposed = false;
	let needsRender = true;
	let isVisible = false;
	let scrollTarget = 0;
	let scrollEased = 0;
	let cameraFit = 1;
	let parallaxTarget = { x: 0, y: 0 };
	let parallaxEased = { x: 0, y: 0 };
	let lastPointer = { x: 0, y: 0 };
	let pointerDownAt = { x: 0, y: 0 };
	let animating = false;

	// ---------------------------------------------------------------------------
	// Small helpers
	// ---------------------------------------------------------------------------

	function markDirty() {
		needsRender = true;
	}

	function setAlgorithm(next: Algorithm) {
		if (algorithm === next) return;
		algorithm = next;
		if (ready) {
			outcome = 'idle';
			status =
				next === 'lru'
					? 'Policy set to LRU · the least recently used frame is evicted.'
					: 'Policy set to FIFO · the frame loaded first is evicted.';
		}
	}



	function pickTargetFrame() {
		for (let i = 0; i < frames.length; i += 1) {
			if (frames[i].page === null) return i;
		}
		let best = 0;
		for (let i = 1; i < frames.length; i += 1) {
			const current = frames[i];
			const contender = frames[best];
			const older =
				algorithm === 'fifo'
					? current.loadedAt < contender.loadedAt
					: current.lastUsed < contender.lastUsed;
			if (older) best = i;
		}
		return best;
	}

	function clearFrameAt(index: number) {
		const frame = frames[index];
		if (!frame) return;
		if (frame.page !== null) pageFrames[frame.page] = -1;
		frames[index] = { page: null, loadedAt: 0, lastUsed: 0 };
	}

	// ---------------------------------------------------------------------------
	// Paging behaviour
	// ---------------------------------------------------------------------------

	function finishActivity() {
		if (disposed) return;
		busy = false;
		activeTimeline = null;
		needsRender = true;
		pumpQueue(130);
	}

	const accessQueue: number[] = [];

	function pumpQueue(delay = 0) {
		if (disposed || busy || !accessQueue.length) return;
		clearTimeout(queueTimer);
		queueTimer = window.setTimeout(() => {
			queueTimer = 0;
			if (disposed || busy || !accessQueue.length) return;
			const next = accessQueue.shift();
			queuedCount = accessQueue.length;
			if (next !== undefined) startAccess(next);
		}, delay);
	}

	function accessPage(page: number) {
		if (!ready || disposed || page < 0 || page >= pageFrames.length) return;
		if (busy || queueTimer !== 0 || accessQueue.length) {
			if (accessQueue.length < 3) {
				accessQueue.push(page);
				queuedCount = accessQueue.length;
				status = `Controller busy · ${pageLabel(page)} queued.`;
			} else {
				status = 'Controller busy · the access queue is full.';
			}
			return;
		}
		startAccess(page);
	}

	function startAccess(page: number) {
		if (!ready || disposed) return;
		activePage = page;
		if (pageFrames[page] >= 0) handleHit(page);
		else handleFault(page);
	}

	function handleHit(page: number) {
		const frame = pageFrames[page];
		if (frame === undefined || frame < 0) {
			handleFault(page);
			return;
		}
		const anchor = frameAnchors[frame];
		const node = pageNodes[page];
		if (!anchor || !node) return;

		busy = true;
		animating = true;
		hits += 1;
		clock += 1;
		frames[frame].lastUsed = clock;
		outcome = 'hit';
		targetFrame = frame;
		victimFrame = null;
		flyingPage = null;
		flyingVictim = null;
		status = `Page hit · ${pageLabel(page)} is resident in ${frameLabel(frame)}.`;
		pulseRing(frame, HIT_COLOR, 0.95);
		glowPage(page, HIT_EMISSIVE, reducedMotion ? 2.4 : 3.4, { hold: 0.14, decay: 1.5 });

		const base = anchor.target.clone();
		const normal = anchor.normal.clone();
		const duration = reducedMotion ? 0.16 : 0.54;
		const proxy = { t: 0 };
		const tl = gsap.timeline({ onUpdate: markDirty });
		activeTimeline = tl;
		tl.to(
			proxy,
			{
				t: 1,
				duration,
				ease: 'power2.out',
				onUpdate: () => {
					const bump = Math.sin(proxy.t * Math.PI) * (reducedMotion ? 0.012 : 0.055);
					node.position.copy(base).addScaledVector(normal, bump);
					needsRender = true;
				}
			},
			0
		);
		tl.call(
			() => {
				node.position.copy(base);
				node.quaternion.copy(anchor.pageQuaternion);
				animating = false;
				needsRender = true;
			},
			undefined,
			duration
		);
		tl.call(
			() => {
				finishActivity();
			},
			undefined,
			duration + 0.04
		);
	}

	function handleFault(page: number) {
		if (pageFrames[page] >= 0) {
			handleHit(page);
			return;
		}
		busy = true;
		animating = true;
		faults += 1;
		outcome = 'fault';
		const target = pickTargetFrame();
		const victim = frames[target]?.page ?? null;
		const victimLabel = victim === null ? null : pageLabel(victim);
		targetFrame = target;
		victimFrame = victim;
		flyingPage = page;
		flyingVictim = victim;
		status =
			victimLabel === null
				? `Page fault · loading ${pageLabel(page)} into ${frameLabel(target)}.`
				: `Page fault · swapping ${victimLabel} out of ${frameLabel(target)} for ${pageLabel(page)}.`;
		pulseRing(target, FAULT_COLOR, 1);
		if (victim !== null) {
			glowPage(victim, FAULT_EMISSIVE, reducedMotion ? 2.2 : 3.0, {
				hold: reducedMotion ? 0.2 : 0.55,
				decay: 1.1
			});
		}
		glowPage(page, FLIGHT_EMISSIVE, 1.15, { hold: 0.9, decay: 0.9 });

		const tl = gsap.timeline({ onUpdate: markDirty });
		activeTimeline = tl;
		const quick = reducedMotion;
		let insertAt = quick ? 0.1 : 0.12;

		if (victim !== null) {
			const victimNode = pageNodes[victim];
			const home = pageHomes[victim];
			if (victimNode && home) {
				addFlight(tl, victimNode, home.position, home.quaternion, {
					at: 0,
					duration: quick ? 0.16 : 0.6,
					lift: 0.55,
					trailIndex: 1,
					trailColor: FAULT_COLOR
				});
				tl.call(
					() => {
						clearFrameAt(target);
						victimFrame = null;
						flyingVictim = null;
						needsRender = true;
					},
					undefined,
					quick ? 0.16 : 0.6
				);
			} else {
				clearFrameAt(target);
				victimFrame = null;
				flyingVictim = null;
			}
			insertAt = quick ? 0.2 : 0.36;
		}

		const node = pageNodes[page];
		const anchor = frameAnchors[target];
		if (node && anchor) {
			addFlight(tl, node, anchor.target, anchor.pageQuaternion, {
				at: insertAt,
				duration: quick ? 0.16 : 0.74,
				lift: 0.48,
				trailIndex: 0,
				trailColor: INSERT_COLOR,
				seatNormal: anchor.normal
			});
		}

		const arrive = insertAt + (quick ? 0.16 : 0.74);
		tl.call(
			() => {
				clock += 1;
				frames[target] = { page, loadedAt: clock, lastUsed: clock };
				pageFrames[page] = target;
				flyingPage = null;
				flyingVictim = null;
				targetFrame = target;
				victimFrame = null;
				outcome = 'fault';
				status =
					victimLabel === null
						? `Page fault · ${pageLabel(page)} loaded into ${frameLabel(target)}.`
						: `Page fault · ${victimLabel} evicted from ${frameLabel(target)} · ${pageLabel(page)} now resident.`;
				animating = false;
				pulseRing(target, HIT_COLOR, 0.9);
				glowPage(page, HIT_EMISSIVE, reducedMotion ? 1.6 : 2.2, { hold: 0.08, decay: 1.3 });
				needsRender = true;
			},
			undefined,
			arrive
		);
		tl.call(
			() => {
				finishActivity();
			},
			undefined,
			arrive + 0.04
		);
	}

	function resetSimulation() {
		if (!ready || disposed) return;
		clearTimeout(queueTimer);
		queueTimer = 0;
		accessQueue.length = 0;
		queuedCount = 0;
		activeTimeline?.kill();
		activeTimeline = null;

		busy = true;
		animating = true;
		hits = 0;
		faults = 0;
		clock = 0;
		outcome = 'idle';
		activePage = null;
		targetFrame = null;
		victimFrame = null;
		flyingPage = null;
		flyingVictim = null;
		frames = frames.map(() => ({ page: null, loadedAt: 0, lastUsed: 0 }));
		pageFrames = pageFrames.map(() => -1);

		for (const material of glowMaterials) {
			gsap.killTweensOf(material);
			material.opacity = 0;
		}
		for (const mesh of glowMeshes) {
			gsap.killTweensOf(mesh.scale);
			mesh.scale.setScalar(1);
		}
		for (const trail of trails) hideTrail(trail);
		for (let page = 0; page < pageGlows.length; page += 1) clearPageGlow(page);
		if (hoverRing) hoverRing.visible = false;

		status = 'Simulation reset · all twenty pages returned to the disk.';

		const tl = gsap.timeline({
			onUpdate: markDirty,
			onComplete: () => {
				busy = false;
				animating = false;
				activeTimeline = null;
				needsRender = true;
			}
		});
		activeTimeline = tl;

		pageNodes.forEach((node, index) => {
			const home = pageHomes[index];
			if (!home) return;
			const atHome =
				node.position.distanceToSquared(home.position) < 1e-7 &&
				node.quaternion.angleTo(home.quaternion) < 1e-4;
			if (atHome) {
				node.position.copy(home.position);
				node.quaternion.copy(home.quaternion);
				return;
			}
			addFlight(tl, node, home.position, home.quaternion, {
				at: index * 0.012,
				duration: reducedMotion ? 0.14 : 0.62,
				lift: 0.3
			});
		});
		tl.to({}, { duration: 0.01 }, 0);
	}

	// ---------------------------------------------------------------------------
	// Three.js helpers (called only after initialise)
	// ---------------------------------------------------------------------------

	function pulseRing(index: number, color: number, strength = 1) {
		const mesh = glowMeshes[index];
		const material = glowMaterials[index];
		if (!mesh || !material) return;
		gsap.killTweensOf(material);
		gsap.killTweensOf(mesh.scale);
		material.color.setHex(color);
		material.opacity = 0.92 * strength;
		mesh.scale.setScalar(0.985);
		gsap.to(material, {
			opacity: 0,
			duration: 1.15,
			ease: 'power2.out',
			onUpdate: markDirty
		});
		gsap.to(mesh.scale, {
			x: 1.055,
			y: 1.055,
			z: 1.055,
			duration: 1.15,
			ease: 'power2.out',
			onUpdate: markDirty
		});
	}

	function applyTrailFade(trail: Trail) {
		const o = trail.fade.o;
		trail.material.opacity = 0.95 * o;
		trail.ribbonMaterial.opacity = 0.62 * o;
		trail.haloMaterial.opacity = 0.9 * o;
		trail.light.intensity = 5.5 * o;
		needsRender = true;
	}

	function hideTrail(trail: Trail) {
		gsap.killTweensOf(trail.fade);
		trail.fade.o = 0;
		trail.group.visible = false;
		applyTrailFade(trail);
	}

	function applyPageGlow(glow: PageGlow) {
		for (const entry of glow.materials) {
			entry.material.emissiveIntensity = glow.k > 0.002 ? glow.k * entry.weight : 0;
		}
	}

	function clearPageGlow(page: number) {
		const glow = pageGlows[page];
		if (!glow) return;
		gsap.killTweensOf(glow);
		glow.k = 0;
		applyPageGlow(glow);
	}

	/**
	 * Emissive pulse on a single page. Page materials are cloned per page, so a hit
	 * lights exactly one page. `intensity` is the emissiveIntensity at the peak;
	 * it holds for `hold` seconds and then eases out over `decay` seconds.
	 */
	function glowPage(
		page: number,
		color: number,
		intensity: number,
		timing: { hold: number; decay: number }
	) {
		const glow = pageGlows[page];
		if (!glow) return;
		gsap.killTweensOf(glow);
		for (const entry of glow.materials) entry.material.emissive.setHex(color);
		glow.k = intensity;
		applyPageGlow(glow);
		needsRender = true;
		gsap.to(glow, {
			k: 0,
			duration: timing.decay,
			delay: timing.hold,
			ease: 'power2.out',
			onUpdate: () => {
				applyPageGlow(glow);
				needsRender = true;
			},
			onComplete: () => applyPageGlow(glow)
		});
	}

	function drawTrail(
		trail: Trail,
		start: Three.Vector3,
		control: Three.Vector3,
		end: Three.Vector3,
		t: number
	) {
		const count = TRAIL_POINTS;
		const head = Math.max(0.0001, t);
		const tail = Math.max(0, head - TRAIL_TAIL);
		const pos = trail.positions;
		const cam = camera?.position;
		const cx = cam?.x ?? 0;
		const cy = cam?.y ?? 0;
		const cz = cam?.z ?? 0;
		const r = trail.color.r;
		const g = trail.color.g;
		const b = trail.color.b;

		for (let i = 0; i < count; i += 1) {
			const u = tail + (head - tail) * (i / (count - 1));
			const inverse = 1 - u;
			pos[i * 3] = inverse * inverse * start.x + 2 * inverse * u * control.x + u * u * end.x;
			pos[i * 3 + 1] = inverse * inverse * start.y + 2 * inverse * u * control.y + u * u * end.y;
			pos[i * 3 + 2] = inverse * inverse * start.z + 2 * inverse * u * control.z + u * u * end.z;
		}

		for (let i = 0; i < count; i += 1) {
			const f = i / (count - 1);
			const fade = f * f * (1.6 - 0.6 * f);
			trail.lineColors[i * 3] = r * fade;
			trail.lineColors[i * 3 + 1] = g * fade;
			trail.lineColors[i * 3 + 2] = b * fade;

			// Camera-facing ribbon, tapering to nothing at the tail.
			const a = Math.max(0, i - 1);
			const c = Math.min(count - 1, i + 1);
			const tx = pos[c * 3] - pos[a * 3];
			const ty = pos[c * 3 + 1] - pos[a * 3 + 1];
			const tz = pos[c * 3 + 2] - pos[a * 3 + 2];
			const vx = cx - pos[i * 3];
			const vy = cy - pos[i * 3 + 1];
			const vz = cz - pos[i * 3 + 2];
			let sx = ty * vz - tz * vy;
			let sy = tz * vx - tx * vz;
			let sz = tx * vy - ty * vx;
			const length = Math.hypot(sx, sy, sz) || 1;
			const half = 0.05 * Math.pow(f, 1.35);
			sx = (sx / length) * half;
			sy = (sy / length) * half;
			sz = (sz / length) * half;
			const k = i * 6;
			trail.ribbonPositions[k] = pos[i * 3] + sx;
			trail.ribbonPositions[k + 1] = pos[i * 3 + 1] + sy;
			trail.ribbonPositions[k + 2] = pos[i * 3 + 2] + sz;
			trail.ribbonPositions[k + 3] = pos[i * 3] - sx;
			trail.ribbonPositions[k + 4] = pos[i * 3 + 1] - sy;
			trail.ribbonPositions[k + 5] = pos[i * 3 + 2] - sz;
			const rf = fade * 0.8;
			trail.ribbonColors[k] = r * rf;
			trail.ribbonColors[k + 1] = g * rf;
			trail.ribbonColors[k + 2] = b * rf;
			trail.ribbonColors[k + 3] = r * rf;
			trail.ribbonColors[k + 4] = g * rf;
			trail.ribbonColors[k + 5] = b * rf;
		}

		const headIndex = (count - 1) * 3;
		trail.halo.position.set(pos[headIndex], pos[headIndex + 1], pos[headIndex + 2]);
		trail.light.position.set(pos[headIndex], pos[headIndex + 1] + 0.18, pos[headIndex + 2] + 0.12);

		trail.geometry.attributes.position.needsUpdate = true;
		trail.geometry.attributes.color.needsUpdate = true;
		trail.ribbonGeometry.attributes.position.needsUpdate = true;
		trail.ribbonGeometry.attributes.color.needsUpdate = true;
		trail.group.visible = true;
	}

	/**
	 * Flies `node` along a quadratic arc. With `seatNormal` the flight is the fast,
	 * accelerating `power3.in` approach to a hover point just off the slot, followed by
	 * a short `back.out` seat that overshoots a hair into the slot and settles — weight
	 * on arrival. Without it the page simply glides with `power3.inOut`.
	 */
	function addFlight(
		tl: ReturnType<typeof gsap.timeline>,
		node: Three.Object3D,
		toPosition: Three.Vector3,
		toQuaternion: Three.Quaternion,
		options: {
			at: number;
			duration: number;
			lift?: number;
			trailIndex?: 0 | 1;
			trailColor?: number;
			seatNormal?: Three.Vector3;
		}
	) {
		const start = node.position.clone();
		const startQuaternion = node.quaternion.clone();
		const seated = !reducedMotion && !!options.seatNormal;
		const approach = toPosition.clone();
		if (seated && options.seatNormal) approach.addScaledVector(options.seatNormal, SEAT_HEIGHT);
		const control = start.clone().lerp(approach, 0.52);
		control.y += options.lift ?? 0.4;

		const flightDuration = seated ? options.duration * 0.78 : options.duration;
		const seatDuration = options.duration - flightDuration;

		let trail: Trail | null = null;
		let trailToken = 0;
		if (options.trailIndex !== undefined) {
			trail = trails[options.trailIndex] ?? null;
			if (trail) {
				trailTokens[options.trailIndex] += 1;
				trailToken = trailTokens[options.trailIndex];
				gsap.killTweensOf(trail.fade);
				trail.color.setHex(options.trailColor ?? INSERT_COLOR);
				trail.haloMaterial.color.setHex(options.trailColor ?? INSERT_COLOR);
				trail.light.color.setHex(options.trailColor ?? INSERT_COLOR);
				trail.fade.o = 1;
				applyTrailFade(trail);
				trail.group.visible = false;
				const owned = trail;
				gsap.to(trail.fade, {
					o: 0,
					duration: 0.6,
					delay: options.at + options.duration,
					ease: 'power2.out',
					onUpdate: () => applyTrailFade(owned),
					onComplete: () => {
						if (trailTokens[options.trailIndex as number] === trailToken) {
							owned.group.visible = false;
							owned.light.intensity = 0;
						}
					}
				});
			}
		}

		const proxy = { t: 0 };
		tl.to(
			proxy,
			{
				t: 1,
				duration: flightDuration,
				ease: seated ? 'power3.in' : 'power3.inOut',
				onUpdate: () => {
					const t = proxy.t;
					const inverse = 1 - t;
					node.position.set(
						inverse * inverse * start.x + 2 * inverse * t * control.x + t * t * approach.x,
						inverse * inverse * start.y + 2 * inverse * t * control.y + t * t * approach.y,
						inverse * inverse * start.z + 2 * inverse * t * control.z + t * t * approach.z
					);
					node.quaternion.copy(startQuaternion).slerp(toQuaternion, t);
					if (trail) drawTrail(trail, start, control, approach, t);
					needsRender = true;
				}
			},
			options.at
		);

		if (seated && options.seatNormal) {
			const normal = options.seatNormal.clone();
			const seat = { s: 0 };
			tl.to(
				seat,
				{
					s: 1,
					duration: seatDuration,
					ease: 'back.out(1.9)',
					onUpdate: () => {
						node.position.copy(toPosition).addScaledVector(normal, SEAT_HEIGHT * (1 - seat.s));
						node.quaternion.copy(toQuaternion);
						needsRender = true;
					}
				},
				options.at + flightDuration
			);
		}
	}

	// ---------------------------------------------------------------------------
	// Hover + picking
	// ---------------------------------------------------------------------------

	function pageIdFromObject(object: Three.Object3D): number | null {
		let current: Three.Object3D | null = object;
		while (current) {
			const id = current.userData?.pageIndex;
			if (typeof id === 'number') return id;
			current = current.parent;
		}
		return null;
	}

	function pickPage(clientX: number, clientY: number): number | null {
		if (!renderer || !camera || !raycaster) return null;
		const rect = renderer.domElement.getBoundingClientRect();
		if (
			clientX < rect.left ||
			clientX > rect.right ||
			clientY < rect.top ||
			clientY > rect.bottom
		) {
			return null;
		}
		const x = ((clientX - rect.left) / rect.width) * 2 - 1;
		const y = -((clientY - rect.top) / rect.height) * 2 + 1;
		raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
		scene?.updateMatrixWorld();
		const intersections = raycaster.intersectObjects(pageNodes, true);
		if (!intersections.length) return null;
		return pageIdFromObject(intersections[0].object);
	}

	function refreshHover(clientX: number, clientY: number) {
		if (!ready || disposed || busy || !renderer) {
			hoveredPage = null;
			if (hoverRing) hoverRing.visible = false;
			needsRender = true;
			return;
		}
		const page = pickPage(clientX, clientY);
		hoveredPage = page;
		renderer.domElement.style.cursor = page === null ? 'default' : 'pointer';

		if (!hoverRing || !hoverMaterial || !THREE) return;
		if (page === null) {
			hoverRing.visible = false;
			needsRender = true;
			return;
		}
		const node = pageNodes[page];
		const frame = pageFrames[page];
		if (!node) return;
		if (frame >= 0 && frameAnchors[frame]) {
			const anchor = frameAnchors[frame];
			hoverRing.position.copy(anchor.target).addScaledVector(anchor.normal, 0.06);
			hoverRing.quaternion.copy(anchor.pageQuaternion);
			hoverMaterial.color.setHex(HIT_COLOR);
		} else {
			hoverRing.position.set(node.position.x, node.position.y + 0.038, node.position.z);
			hoverRing.quaternion.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
			hoverMaterial.color.setHex(HOVER_COLOR);
		}
		hoverMaterial.opacity = 0.68;
		hoverRing.visible = true;
		needsRender = true;
	}

	function hideHover() {
		hoveredPage = null;
		if (hoverRing) hoverRing.visible = false;
		if (renderer) renderer.domElement.style.cursor = 'default';
		needsRender = true;
	}

	function onPointerMove(event: PointerEvent) {
		if (event.pointerType !== 'mouse') return;
		parallaxTarget.x = (event.clientX / window.innerWidth) * 2 - 1;
		parallaxTarget.y = (event.clientY / window.innerHeight) * 2 - 1;
		lastPointer.x = event.clientX;
		lastPointer.y = event.clientY;
		if (hoverRaf) return;
		hoverRaf = window.requestAnimationFrame(() => {
			hoverRaf = 0;
			refreshHover(lastPointer.x, lastPointer.y);
		});
	}

	function onPointerDown(event: PointerEvent) {
		if (event.button !== 0) return;
		pointerDownAt.x = event.clientX;
		pointerDownAt.y = event.clientY;
	}

	function onPointerUp(event: PointerEvent) {
		if (event.button !== 0) return;
		if (Math.hypot(event.clientX - pointerDownAt.x, event.clientY - pointerDownAt.y) > 9) return;
		const page = pickPage(event.clientX, event.clientY);
		if (page !== null) accessPage(page);
	}

	function onPointerLeave() {
		hideHover();
		parallaxTarget.x = 0;
		parallaxTarget.y = 0;
	}

	// ---------------------------------------------------------------------------
	// Camera + frame loop
	// ---------------------------------------------------------------------------

	function updateCamera() {
		if (!camera || !THREE) return;
		const p = scrollEased;
		const smooth = p * p * (3 - 2 * p);
		// Low, oblique three-quarter orbit: the disk foreshortens toward the camera while the
		// RAM board stands behind it, so the gap between the two reads as real depth.
		const position = new THREE.Vector3(8.9, 4.7, 10.4).lerp(
			new THREE.Vector3(4.9, 3.75, 7.6),
			smooth
		);
		const target = new THREE.Vector3(0.1, 2.25, 0.55).lerp(
			new THREE.Vector3(0, 2.6, -0.35),
			smooth
		);
		position.sub(target).multiplyScalar(cameraFit).add(target);
		position.x += parallaxEased.x * 0.34;
		position.y += parallaxEased.y * 0.16;
		camera.position.copy(position);
		camera.lookAt(target);
	}

	function updateCameraFit(aspect: number) {
		if (aspect < 0.72) cameraFit = 1.36;
		else if (aspect < 1) cameraFit = 1.16;
		else cameraFit = 1;
	}

	function resize() {
		if (!renderer || !camera || !canvasHost) return;
		const width = canvasHost.clientWidth;
		const height = canvasHost.clientHeight;
		if (!width || !height) return;
		renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
		renderer.setSize(width, height, false);
		bloom?.setSize(width, height);
		camera.aspect = width / height;
		camera.updateProjectionMatrix();
		updateCameraFit(width / height);
		needsRender = true;
	}

	function onWindowResize() {
		resize();
		clearTimeout(scrollRefreshTimer);
		scrollRefreshTimer = window.setTimeout(() => {
			if (!disposed) ScrollTrigger?.refresh();
		}, 160);
	}

	// ---------------------------------------------------------------------------
	// Initialisation
	// ---------------------------------------------------------------------------

	function makeReticleTexture() {
		const canvas = document.createElement('canvas');
		canvas.width = 256;
		canvas.height = 256;
		const context = canvas.getContext('2d');
		if (!context) throw new Error('2D canvas is unavailable.');
		context.clearRect(0, 0, 256, 256);

		const wash = context.createRadialGradient(128, 128, 12, 128, 128, 124);
		wash.addColorStop(0, 'rgba(43,37,32,0.10)');
		wash.addColorStop(0.72, 'rgba(43,37,32,0.05)');
		wash.addColorStop(1, 'rgba(43,37,32,0)');
		context.fillStyle = wash;
		context.fillRect(0, 0, 256, 256);

		context.strokeStyle = '#2b2520';
		context.lineWidth = 2.2;
		context.shadowColor = 'rgba(43,37,32,0.25)';
		context.shadowBlur = 10;

		const x = 26;
		const y = 26;
		const size = 204;
		const radius = 16;
		context.beginPath();
		context.moveTo(x + radius, y);
		context.lineTo(x + size - radius, y);
		context.quadraticCurveTo(x + size, y, x + size, y + radius);
		context.lineTo(x + size, y + size - radius);
		context.quadraticCurveTo(x + size, y + size, x + size - radius, y + size);
		context.lineTo(x + radius, y + size);
		context.quadraticCurveTo(x, y + size, x, y + size - radius);
		context.lineTo(x, y + radius);
		context.quadraticCurveTo(x, y, x + radius, y);
		context.stroke();

		context.shadowBlur = 4;
		context.lineWidth = 4;
		const arm = 34;
		const inset = 14;
		const left = inset;
		const top = inset;
		const right = 256 - inset;
		const bottom = 256 - inset;
		context.beginPath();
		context.moveTo(left, top + arm);
		context.lineTo(left, top);
		context.lineTo(left + arm, top);
		context.moveTo(right - arm, top);
		context.lineTo(right, top);
		context.lineTo(right, top + arm);
		context.moveTo(right, bottom - arm);
		context.lineTo(right, bottom);
		context.lineTo(right - arm, bottom);
		context.moveTo(left + arm, bottom);
		context.lineTo(left, bottom);
		context.lineTo(left, bottom - arm);
		context.stroke();

		context.shadowBlur = 0;
		context.globalAlpha = 0.45;
		context.lineWidth = 1;
		context.beginPath();
		context.moveTo(128, 66);
		context.lineTo(128, 88);
		context.moveTo(128, 168);
		context.lineTo(128, 190);
		context.moveTo(66, 128);
		context.lineTo(88, 128);
		context.moveTo(168, 128);
		context.lineTo(190, 128);
		context.stroke();
		context.globalAlpha = 1;

		const texture = new THREE.CanvasTexture(canvas);
		texture.colorSpace = THREE.SRGBColorSpace;
		texture.anisotropy = Math.min(4, renderer?.capabilities.getMaxAnisotropy() ?? 1);
		return texture;
	}

	function makeHaloTexture() {
		const size = 128;
		const canvas = document.createElement('canvas');
		canvas.width = size;
		canvas.height = size;
		const context = canvas.getContext('2d');
		if (!context) throw new Error('2D canvas is unavailable.');
		const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
		gradient.addColorStop(0, 'rgba(43,37,32,0.9)');
		gradient.addColorStop(0.18, 'rgba(43,37,32,0.4)');
		gradient.addColorStop(0.5, 'rgba(43,37,32,0.1)');
		gradient.addColorStop(1, 'rgba(43,37,32,0)');
		context.fillStyle = gradient;
		context.fillRect(0, 0, size, size);
		const texture = new THREE.CanvasTexture(canvas);
		texture.colorSpace = THREE.SRGBColorSpace;
		return texture;
	}

	async function initialise() {
		try {
			const [
				threeModule,
				gltfModule,
				dracoModule,
				ktx2Module,
				hdrModule,
				gsapModule,
				scrollTriggerModule
			] = await Promise.all([
				import('three'),
				import('three/examples/jsm/loaders/GLTFLoader.js'),
				import('three/examples/jsm/loaders/DRACOLoader.js'),
				import('three/examples/jsm/loaders/KTX2Loader.js'),
				import('three/examples/jsm/loaders/HDRLoader.js'),
				import('gsap'),
				import('gsap/ScrollTrigger')
			]);

			if (disposed || !canvasHost || !sectionEl) return;

			THREE = threeModule;
			gsap = gsapModule.gsap;
			ScrollTrigger = scrollTriggerModule.ScrollTrigger;
			gsap.registerPlugin(ScrollTrigger);
			ScrollTrigger.config({ ignoreMobileResize: true });

			reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

			const url = (path: Parameters<typeof asset>[0]) => asset(`/${path}`);
			const decoderPath = (file: Parameters<typeof asset>[0]) =>
				asset(`/${file}`).replace(/[^/]*$/, '');

			const width = canvasHost.clientWidth || window.innerWidth;
			const height = canvasHost.clientHeight || window.innerHeight;

			try {
				renderer = new THREE.WebGLRenderer({
					antialias: true,
					alpha: true,
					powerPreference: 'high-performance'
				});
			} catch {
				throw new Error('WebGL could not be created in this browser.');
			}

			renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
			renderer.setSize(width, height, false);
			renderer.setClearColor(0x000000, 0);
			renderer.outputColorSpace = THREE.SRGBColorSpace;
			renderer.toneMapping = THREE.ACESFilmicToneMapping;
			renderer.toneMappingExposure = 1.12;
			renderer.shadowMap.enabled = true;
			renderer.shadowMap.type = THREE.PCFShadowMap;
			renderer.domElement.className = 'vm3d__webgl';
			renderer.domElement.setAttribute('aria-hidden', 'true');
			// eslint-disable-next-line svelte/no-dom-manipulating -- the WebGL canvas is owned by three.js, not the Svelte tree
			canvasHost.appendChild(renderer.domElement);

			scene = new THREE.Scene();
			camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 80);
			updateCameraFit(width / height);
			updateCamera();

			progress = 9;

			const pmrem = new THREE.PMREMGenerator(renderer);
			const hdrLoader = new hdrModule.HDRLoader();
			try {
				const hdr = await hdrLoader.loadAsync(url('hdri/studio_small_08_1k.hdr'));
				if (disposed) {
					hdr.dispose();
					pmrem.dispose();
					return;
				}
				hdr.mapping = THREE.EquirectangularReflectionMapping;
				environmentTexture = pmrem.fromEquirectangular(hdr).texture;
				scene.environment = environmentTexture;
				scene.environmentIntensity = 0.92;
				hdr.dispose();
			} catch (environmentError) {
				console.warn('[VirtualMemory3D] HDRI environment failed to load.', environmentError);
			} finally {
				pmrem.dispose();
			}

			if (disposed) return;
			progress = 22;

			// Raking key: low and from the side so it skims across the frame plates, throwing
			// every bevel, rail and stud into relief instead of lighting the board flat.
			keyLight = new THREE.DirectionalLight(0xffe9cf, 4.1);
			keyLight.position.set(9.2, 5.4, 2.4);
			keyLight.castShadow = true;
			keyLight.shadow.mapSize.set(1024, 1024);
			keyLight.shadow.camera.near = 0.5;
			keyLight.shadow.camera.far = 36;
			keyLight.shadow.camera.left = -6.5;
			keyLight.shadow.camera.right = 6.5;
			keyLight.shadow.camera.top = 8;
			keyLight.shadow.camera.bottom = -2;
			keyLight.shadow.bias = -0.0004;
			keyLight.shadow.normalBias = 0.025;
			keyLight.shadow.radius = 3;
			keyLight.target.position.set(0, 2.4, -0.4);
			scene.add(keyLight.target);
			scene.add(keyLight);

			// Counter-rake from the opposite flank, cool and weaker, so the shadow side keeps shape.
			const rake = new THREE.DirectionalLight(0x9ab8ff, 1.9);
			rake.position.set(-9, 3.2, 3.2);
			rake.target.position.set(0, 2.4, -0.4);
			scene.add(rake.target);
			scene.add(rake);

			// Rim lights from behind the board: they catch only the silhouette edges.
			const rim = new THREE.DirectionalLight(0x8ff0e6, 6.2);
			rim.position.set(-4.2, 5.4, -8.6);
			rim.target.position.set(0, 2.4, -1.5);
			scene.add(rim.target);
			scene.add(rim);

			const rimWarm = new THREE.DirectionalLight(0xffc98a, 4.2);
			rimWarm.position.set(5.2, 4.2, -8);
			rimWarm.target.position.set(0, 2.4, -1.5);
			scene.add(rimWarm.target);
			scene.add(rimWarm);

			const hemi = new THREE.HemisphereLight(0xf0eee6, 0x87867f, 0.5);
			scene.add(hemi);

			const ground = new THREE.Mesh(
				new THREE.PlaneGeometry(60, 60),
				new THREE.ShadowMaterial({ color: 0x1f1e1d, opacity: 0.22 })
			);
			ground.rotation.x = -Math.PI / 2;
			ground.position.y = -0.004;
			ground.receiveShadow = true;
			scene.add(ground);

			const ringMaterial = new THREE.MeshBasicMaterial({
				color: 0x87867f,
				transparent: true,
				opacity: 0.12,
				side: THREE.DoubleSide,
				depthWrite: false
			});
			for (const [radius, opacity] of [
				[3.3, 0.13],
				[3.92, 0.07]
			]) {
				const ring = new THREE.Mesh(
					new THREE.RingGeometry(radius - 0.0035, radius + 0.0035, 256),
					ringMaterial.clone()
				);
				(ring.material as Three.MeshBasicMaterial).opacity = opacity;
				ring.rotation.x = -Math.PI / 2;
				ring.position.set(0, -0.002, 1.55);
				scene.add(ring);
			}

			progress = 27;

			const draco = new dracoModule.DRACOLoader();
			draco.setDecoderPath(decoderPath('draco/draco_decoder.js'));
			const ktx2 = new ktx2Module.KTX2Loader();
			ktx2.setTranscoderPath(decoderPath('basis/basis_transcoder.js'));
			ktx2.detectSupport(renderer);

			const loader = new gltfModule.GLTFLoader()
				.setDRACOLoader(draco)
				.setKTX2Loader(ktx2);

			const gltf = await loader.loadAsync(url('models/paging-model.glb'), (event) => {
				if (event.total > 0) {
					progress = Math.min(92, 27 + (event.loaded / event.total) * 65);
				}
			});

			if (disposed) {
				draco.dispose();
				ktx2.dispose();
				return;
			}

			const model = gltf.scene;

			// three.js only reads material.envMapIntensity when the material owns an envMap
			// (otherwise it substitutes scene.environmentIntensity), so every PBR material is
			// given the scene's one shared PMREM texture, then tuned. The texture is owned by the
			// scene and disposed exactly once in disposeScene().
			const sharedEnv = scene.environment;
			const maxAnisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
			// eslint-disable-next-line svelte/prefer-svelte-reactivity -- plain bookkeeping of three.js objects, never rendered
			const tuned = new Map<Three.Material, Three.MeshStandardMaterial>();

			const toPhysical = (source: Three.MeshStandardMaterial) => {
				if ((source as Three.MeshPhysicalMaterial).isMeshPhysicalMaterial) {
					return source as Three.MeshPhysicalMaterial;
				}
				const physical = new THREE.MeshPhysicalMaterial();
				physical.name = source.name;
				physical.color.copy(source.color);
				physical.map = source.map;
				physical.metalness = source.metalness;
				physical.roughness = source.roughness;
				physical.metalnessMap = source.metalnessMap;
				physical.roughnessMap = source.roughnessMap;
				physical.normalMap = source.normalMap;
				physical.aoMap = source.aoMap;
				physical.emissive.copy(source.emissive);
				physical.emissiveMap = source.emissiveMap;
				physical.side = source.side;
				physical.userData = { ...source.userData };
				return physical;
			};

			/**
			 * Per-material finish, keyed by glTF material name. Roughness/metalness on textured
			 * materials multiply the ORM texture channels; the GLB itself is untouched.
			 */
			const finishMaterial = (source: Three.MeshStandardMaterial) => {
				let m = source;
				switch (source.name) {
					case 'Frame recess': {
						// Dark glassy acrylic slot: a deep tinted base under a hard clearcoat.
						const glass = toPhysical(source);
						glass.color.setRGB(0.62, 0.7, 0.74);
						glass.metalness = 0.34;
						glass.roughness = 0.5;
						glass.clearcoat = 1;
						glass.clearcoatRoughness = 0.06;
						glass.specularIntensity = 1;
						glass.ior = 1.49;
						glass.envMapIntensity = 1.9;
						m = glass;
						break;
					}
					case 'Frame body': {
						const acrylic = toPhysical(source);
						acrylic.color.setRGB(0.5, 0.58, 0.62);
						acrylic.metalness = 0.4;
						acrylic.roughness = 0.2;
						acrylic.clearcoat = 0.85;
						acrylic.clearcoatRoughness = 0.1;
						acrylic.envMapIntensity = 1.5;
						m = acrylic;
						break;
					}
					case 'Frame rail':
						source.color.setRGB(0.62, 0.66, 0.7);
						source.roughness = 0.2;
						source.envMapIntensity = 2.1;
						break;
					case 'ENIG gold':
						// Subtle metallic contacts: bright F0, low roughness, strong reflection.
						source.color.setRGB(0.86, 0.66, 0.34);
						source.roughness = 0.17;
						source.envMapIntensity = 2.3;
						break;
					case 'Disk platter':
					case 'RAM backplane': {
						// Dark solder-mask lacquer over copper: clearcoat lets the raking key stretch
						// a soft highlight across the traces while the base stays deep.
						const pcb = toPhysical(source);
						pcb.color.setRGB(1.55, 1.7, 1.7);
						pcb.metalness = source.name === 'Disk platter' ? 0.62 : 0.5;
						pcb.roughness = 0.62;
						pcb.clearcoat = 0.7;
						pcb.clearcoatRoughness = 0.22;
						pcb.envMapIntensity = 1.35;
						m = pcb;
						break;
					}
					case 'Board chassis':
					case 'Disk chassis':
						source.roughness = 0.34;
						source.envMapIntensity = 1.5;
						break;
					case 'Bus copper':
						source.roughness = 0.24;
						source.envMapIntensity = 2.1;
						break;
					case 'Frame label':
						source.envMapIntensity = 0.7;
						break;
					case 'Status LED':
						source.emissiveIntensity = 1.6;
						source.envMapIntensity = 0.8;
						break;
					case 'Page substrate':
						source.roughness = 0.2;
						source.envMapIntensity = 1.5;
						break;
					case 'Page face':
						source.color.setRGB(1.25, 1.25, 1.25);
						source.envMapIntensity = 1.4;
						break;
					default:
						source.envMapIntensity = 1.1;
				}
				m.envMap = sharedEnv;
				m.needsUpdate = true;
				return m;
			};

			const pageMaterialSources = new Set(['Page substrate', 'Page face']);
			model.traverse((object) => {
				const mesh = object as Three.Mesh;
				if (!mesh.isMesh) return;
				mesh.castShadow = true;
				mesh.receiveShadow = true;
				const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
				const next = list.map((material) => {
					const standard = material as Three.MeshStandardMaterial;
					if (!standard.isMeshStandardMaterial) return material;
					if (pageMaterialSources.has(standard.name)) {
						// Pages share one source material in the GLB; clone it per page below.
						return standard;
					}
					let finished = tuned.get(standard);
					if (!finished) {
						finished = finishMaterial(standard);
						tuned.set(standard, finished);
						if (finished !== standard) standard.dispose();
					}
					return finished;
				});
				mesh.material = Array.isArray(mesh.material) ? next : next[0];
			});

			// Per-page materials: a hit or a fault lights exactly one page.
			pageGlows = [];
			for (let index = 0; index < PAGE_TOTAL; index += 1) {
				const node = model.getObjectByName(`page-${pad(index)}`);
				const glow: PageGlow = { k: 0, materials: [] };
				node?.traverse((object) => {
					const mesh = object as Three.Mesh;
					if (!mesh.isMesh) return;
					const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
					const next = list.map((material) => {
						const standard = material as Three.MeshStandardMaterial;
						if (!standard.isMeshStandardMaterial) return material;
						const clone = standard.clone();
						finishMaterial(clone);
						clone.emissive.setHex(0x000000);
						clone.emissiveIntensity = 0;
						glow.materials.push({
							material: clone,
							weight: standard.name === 'Page face' ? 1 : 0.55
						});
						return clone;
					});
					mesh.material = Array.isArray(mesh.material) ? next : next[0];
				});
				pageGlows.push(glow);
			}
			model.traverse((object) => {
				const mesh = object as Three.Mesh;
				if (!mesh.isMesh) return;
				const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
				for (const material of list) {
					const standard = material as Three.MeshStandardMaterial;
					for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap'] as const) {
						const texture = standard[key];
						if (texture && texture.anisotropy !== maxAnisotropy) {
							texture.anisotropy = maxAnisotropy;
							texture.needsUpdate = true;
						}
					}
				}
			});
			scene.add(model);
			model.updateMatrixWorld(true);

			pageNodes = [];
			for (let index = 0; index < PAGE_TOTAL; index += 1) {
				const node = model.getObjectByName(`page-${pad(index)}`);
				if (!node) throw new Error(`Paging asset is missing page-${pad(index)}.`);
				node.userData.pageIndex = index;
				node.traverse((child) => {
					child.userData.pageIndex = index;
				});
				pageNodes.push(node);
			}

			frameAnchors = [];
			for (let index = 0; index < FRAME_TOTAL; index += 1) {
				const node = model.getObjectByName(`frame-${pad(index)}`);
				if (!node) throw new Error(`Paging asset is missing frame-${pad(index)}.`);
				const position = new THREE.Vector3().setFromMatrixPosition(node.matrixWorld);
				const quaternion = new THREE.Quaternion().setFromRotationMatrix(node.matrixWorld);
				const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion);
				frameAnchors.push({
					position,
					normal,
					quaternion,
					target: position.clone().addScaledVector(normal, 0.0105),
					pageQuaternion: quaternion.clone().multiply(
						new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2)
					)
				});
			}

			pageHomes = pageNodes.map((node) => ({
				position: node.position.clone(),
				quaternion: node.quaternion.clone()
			}));

			raycaster = new THREE.Raycaster();
			raycaster.params.Line = { threshold: 0.01 };

			const reticle = makeReticleTexture();
			const glowGeometry = new THREE.PlaneGeometry(0.99, 0.99);
			glowMeshes = [];
			glowMaterials = [];
			frameAnchors.forEach((anchor) => {
				const material = new THREE.MeshBasicMaterial({
					map: reticle,
					color: 0xffffff,
					transparent: true,
					opacity: 0,
					blending: THREE.NormalBlending,
					depthWrite: false,
					depthTest: true,
					side: THREE.DoubleSide,
					toneMapped: false
				});
				const mesh = new THREE.Mesh(glowGeometry, material);
				mesh.position.copy(anchor.position).addScaledVector(anchor.normal, 0.065);
				mesh.quaternion.copy(anchor.quaternion);
				mesh.renderOrder = 4;
				scene!.add(mesh);
				glowMeshes.push(mesh);
				glowMaterials.push(material);
			});

			const hoverGeometry = new THREE.PlaneGeometry(0.88, 0.88);
			hoverMaterial = new THREE.MeshBasicMaterial({
				map: reticle,
				color: HOVER_COLOR,
				transparent: true,
				opacity: 0.5,
				blending: THREE.NormalBlending,
				depthWrite: false,
				side: THREE.DoubleSide,
				toneMapped: false
			});
			hoverRing = new THREE.Mesh(hoverGeometry, hoverMaterial);
			hoverRing.renderOrder = 5;
			hoverRing.visible = false;
			scene.add(hoverRing);

			haloTexture = makeHaloTexture();
			trails = [];
			for (let index = 0; index < 2; index += 1) {
				const group = new THREE.Group();
				group.visible = false;
				group.renderOrder = 3;

				// Bright leading line (vertex-colour fade tail -> head).
				const positions = new Float32Array(TRAIL_POINTS * 3);
				const lineColors = new Float32Array(TRAIL_POINTS * 3);
				const geometry = new THREE.BufferGeometry();
				geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
				geometry.setAttribute('color', new THREE.BufferAttribute(lineColors, 3));
				const material = new THREE.LineBasicMaterial({
					color: 0xffffff,
					vertexColors: true,
					transparent: true,
					opacity: 0,
					blending: THREE.NormalBlending,
					depthWrite: false,
					toneMapped: false
				});
				const line = new THREE.Line(geometry, material);
				line.frustumCulled = false;
				line.renderOrder = 3;
				group.add(line);

				// Soft camera-facing ribbon: the glow body of the trail, tapered at the tail.
				const ribbonPositions = new Float32Array(TRAIL_POINTS * 2 * 3);
				const ribbonColors = new Float32Array(TRAIL_POINTS * 2 * 3);
				const ribbonGeometry = new THREE.BufferGeometry();
				ribbonGeometry.setAttribute('position', new THREE.BufferAttribute(ribbonPositions, 3));
				ribbonGeometry.setAttribute('color', new THREE.BufferAttribute(ribbonColors, 3));
				const indices: number[] = [];
				for (let i = 0; i < TRAIL_POINTS - 1; i += 1) {
					const a = i * 2;
					indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
				}
				ribbonGeometry.setIndex(indices);
				const ribbonMaterial = new THREE.MeshBasicMaterial({
					color: 0xffffff,
					vertexColors: true,
					transparent: true,
					opacity: 0,
					blending: THREE.NormalBlending,
					depthWrite: false,
					side: THREE.DoubleSide,
					toneMapped: false
				});
				const ribbon = new THREE.Mesh(ribbonGeometry, ribbonMaterial);
				ribbon.frustumCulled = false;
				ribbon.renderOrder = 3;
				group.add(ribbon);

				// Glow head riding the leading edge of the page.
				const haloMaterial = new THREE.SpriteMaterial({
					map: haloTexture,
					color: INSERT_COLOR,
					transparent: true,
					opacity: 0,
					blending: THREE.NormalBlending,
					depthWrite: false,
					toneMapped: false
				});
				const halo = new THREE.Sprite(haloMaterial);
				halo.scale.setScalar(0.95);
				halo.frustumCulled = false;
				halo.renderOrder = 3;
				group.add(halo);

				// A travelling point light is created up-front (intensity 0) so the light count
				// never changes at runtime and no shader recompiles mid-flight.
				const light = new THREE.PointLight(INSERT_COLOR, 0, 3.4, 2);
				scene.add(light);

				scene.add(group);
				trails.push({
					group,
					line,
					material,
					geometry,
					positions,
					lineColors,
					ribbon,
					ribbonMaterial,
					ribbonGeometry,
					ribbonPositions,
					ribbonColors,
					halo,
					haloMaterial,
					fade: { o: 0 },
					color: new THREE.Color(INSERT_COLOR),
					light
				});
			}

			frames = Array.from({ length: FRAME_TOTAL }, () => ({
				page: null,
				loadedAt: 0,
				lastUsed: 0
			}));
			pageFrames = Array.from({ length: PAGE_TOTAL }, () => -1);

			if (!reducedMotion) {
				// Gallery: tall scroll track (top top → bottom bottom).
				// Lesson frame: scrub across the element itself (top bottom → bottom top)
				// so the reader's scroll position is the only clock driving the camera.
				const trigger = ScrollTrigger.create({
					trigger: sectionEl,
					start: embeddedMode ? 'top bottom' : 'top top',
					end: embeddedMode ? 'bottom top' : 'bottom bottom',
					invalidateOnRefresh: true,
					onUpdate: (self: { progress: number }) => {
						scrollTarget = self.progress;
						sectionEl?.style.setProperty('--p', self.progress.toFixed(3));
						if (sectionEl) sectionEl.dataset.scrub = self.progress.toFixed(3);
						needsRender = true;
					}
				});
				scrollTrigger = trigger;
				scrollTarget = trigger.progress;
				scrollEased = scrollTarget;
			} else {
				scrollTarget = 0.22;
				scrollEased = scrollTarget;
				sectionEl.style.setProperty('--p', '0');
			}

			resizeObserver = new ResizeObserver(() => {
				resize();
			});
			resizeObserver.observe(canvasHost);

			intersectionObserver = new IntersectionObserver(
				(entries) => {
					const entry = entries[0];
					isVisible = entry?.isIntersecting ?? false;
					if (isVisible) needsRender = true;
				},
				{ rootMargin: '260px 0px' }
			);
			intersectionObserver.observe(sectionEl);

			resize();
			window.addEventListener('resize', onWindowResize, { passive: true });
			renderer.domElement.addEventListener('pointermove', onPointerMove, { passive: true });
			renderer.domElement.addEventListener('pointerdown', onPointerDown, { passive: true });
			renderer.domElement.addEventListener('pointerup', onPointerUp, { passive: true });
			renderer.domElement.addEventListener('pointerleave', onPointerLeave, { passive: true });

			bloom = await createBloom(THREE, renderer, scene, camera);
			if (disposed) {
				bloom?.dispose();
				bloom = null;
				return;
			}
			bloom?.setSize(canvasHost.clientWidth, canvasHost.clientHeight);

			let lastFrame = 0;
			renderer.setAnimationLoop((time) => {
				if (disposed || !renderer || !scene || !camera) return;
				if (!isVisible) return;
				const now = time / 1000;
				const dt = Math.min(0.05, Math.max(0.001, now - (lastFrame || now)));
				lastFrame = now;
				let dirty = false;

				const scrollDelta = scrollTarget - scrollEased;
				if (Math.abs(scrollDelta) > 0.0004) {
					scrollEased += scrollDelta * Math.min(1, dt * 7);
					dirty = true;
				} else if (scrollEased !== scrollTarget) {
					scrollEased = scrollTarget;
					dirty = true;
				}

				const px = parallaxTarget.x - parallaxEased.x;
				const py = parallaxTarget.y - parallaxEased.y;
				if (Math.abs(px) > 0.0004 || Math.abs(py) > 0.0004) {
					parallaxEased.x += px * Math.min(1, dt * 6);
					parallaxEased.y += py * Math.min(1, dt * 6);
					dirty = true;
				}

				if (!dirty && !needsRender && !animating) return;

				updateCamera();
				if (bloom) bloom.render();
				else renderer.render(scene, camera);
				needsRender = false;
			});

			ready = true;
			progress = 100;
			status = 'Frame array ready · request a page from the disk.';
			needsRender = true;

			await new Promise((resolve) => window.setTimeout(resolve, 220));
			if (disposed) return;
			loading = false;

			requestAnimationFrame(() => {
				if (!disposed) ScrollTrigger.refresh();
			});

			if (import.meta.env.DEV) {
				(window as unknown as Record<string, unknown>).__vm3d = {
					access: (page: number) => accessPage(page),
					reset: () => resetSimulation(),
					snapshot: () => ({
						ready,
						hits,
						faults,
						algorithm,
						busy,
						queued: queuedCount,
						frames: frames.map((frame) => frame.page),
						pageFrames: [...pageFrames],
						status,
						outcome
					}),
					probe: () => {
// eslint-disable-next-line svelte/prefer-svelte-reactivity -- dedupe set used while traversing the scene graph
						const seen = new Set<Three.Material>();
						const report: Record<string, unknown>[] = [];
						scene?.traverse((object) => {
							const mesh = object as Three.Mesh;
							if (!mesh.isMesh) return;
							const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
							for (const material of list) {
								const pbr = material as Three.MeshStandardMaterial;
								if (!pbr.isMeshStandardMaterial || seen.has(pbr)) continue;
								seen.add(pbr);
								report.push({
									name: pbr.name,
									type: pbr.type,
									ownsSharedEnv: pbr.envMap === environmentTexture && !!environmentTexture,
									envMapIntensity: pbr.envMapIntensity,
									emissiveIntensity: pbr.emissiveIntensity
								});
							}
						});
						return {
							materials: report,
							calls: renderer?.info.render.calls,
							triangles: renderer?.info.render.triangles,
							programs: renderer?.info.programs?.length,
							frame: renderer?.info.render.frame,
							pageGlow: pageGlows.map((glow) => glow.k)
						};
					},
					pageScreen: (page: number) => {
						if (!renderer || !camera || !pageNodes[page]) return null;
						scene?.updateMatrixWorld();
						const position = new THREE.Vector3();
						pageNodes[page].getWorldPosition(position);
						position.project(camera);
						const rect = renderer.domElement.getBoundingClientRect();
						return {
							x: rect.left + (position.x * 0.5 + 0.5) * rect.width,
							y: rect.top + (-position.y * 0.5 + 0.5) * rect.height,
							visible: position.z < 1
						};
					}
				};
			}
		} catch (initialiseError) {
			console.error('[VirtualMemory3D]', initialiseError);
			error =
				initialiseError instanceof Error
					? initialiseError.message
					: 'The virtual memory model could not be initialised.';
			loading = false;
		}
	}

	function disposeScene() {
		clearTimeout(queueTimer);
		clearTimeout(scrollRefreshTimer);
		if (hoverRaf) window.cancelAnimationFrame(hoverRaf);
		scrollTrigger?.kill();
		scrollTrigger = null;
		activeTimeline?.kill();
		activeTimeline = null;
		resizeObserver?.disconnect();
		intersectionObserver?.disconnect();
		window.removeEventListener('resize', onWindowResize);

		if (renderer) {
			renderer.domElement.removeEventListener('pointermove', onPointerMove);
			renderer.domElement.removeEventListener('pointerdown', onPointerDown);
			renderer.domElement.removeEventListener('pointerup', onPointerUp);
			renderer.domElement.removeEventListener('pointerleave', onPointerLeave);
			renderer.setAnimationLoop(null);
		}

		if (gsap) {
			for (const material of glowMaterials) gsap.killTweensOf(material);
			for (const mesh of glowMeshes) gsap.killTweensOf(mesh.scale);
			for (const trail of trails) gsap.killTweensOf(trail.fade);
			for (const glow of pageGlows) gsap.killTweensOf(glow);
			for (const node of pageNodes) {
				gsap.killTweensOf(node.position);
				gsap.killTweensOf(node.quaternion);
			}
		}

		// The PMREM texture is shared by every PBR material (material.envMap) and by
		// scene.environment, so it is skipped here and disposed exactly once below.
// eslint-disable-next-line svelte/prefer-svelte-reactivity -- plain bookkeeping of three.js objects, never rendered
		const disposedTextures = new Set<Three.Texture>();
// eslint-disable-next-line svelte/prefer-svelte-reactivity -- plain bookkeeping of three.js objects, never rendered
		const disposedMaterials = new Set<Three.Material>();
		scene?.traverse((object) => {
			const mesh = object as Three.Mesh;
			if (mesh.geometry) mesh.geometry.dispose();
			const materials = Array.isArray(mesh.material)
				? mesh.material
				: mesh.material
					? [mesh.material]
					: [];
			for (const material of materials) {
				if (disposedMaterials.has(material)) continue;
				disposedMaterials.add(material);
				for (const value of Object.values(material)) {
					const texture = value as Three.Texture;
					if (
						texture &&
						texture.isTexture &&
						texture !== environmentTexture &&
						!disposedTextures.has(texture)
					) {
						disposedTextures.add(texture);
						texture.dispose();
					}
				}
				material.dispose();
			}
		});
		for (const trail of trails) {
			trail.ribbonGeometry.dispose();
			trail.light.dispose();
		}
		if (scene) scene.environment = null;
		if (haloTexture && !disposedTextures.has(haloTexture)) haloTexture.dispose();
		haloTexture = null;
		pageGlows = [];

		environmentTexture?.dispose();
		environmentTexture = null;
		keyLight?.shadow.map?.dispose();
		bloom?.dispose();
		bloom = null;
		renderer?.dispose();
		renderer?.forceContextLoss();
		renderer?.domElement.remove();
		delete (window as unknown as Record<string, unknown>).__vm3d;
		renderer = null;
		scene = null;
		camera = null;
	}

	onMount(() => {
		void initialise();
		return () => {
			disposed = true;
			disposeScene();
		};
	});
</script>

<svelte:head>
	<meta
		name="description"
		content="An interactive 3D study of virtual memory: sixteen physical frames, twenty disk pages, and a controller that swaps them under LRU or FIFO."
	/>
</svelte:head>

<section
	bind:this={sectionEl}
	class="vm3d {className}"
	class:is-embedded={embeddedMode}
	class:is-ready={ready}
	aria-labelledby="vm3d-title"
>
	<div class="vm3d__stage">
		<div class="vm3d__canvas" bind:this={canvasHost}></div>
		<div class="vm3d__vignette" aria-hidden="true"></div>
		<div class="vm3d__grain" aria-hidden="true"></div>

		<header class="vm3d__intro">
			<p class="vm3d__eyebrow">
				<span class="vm3d__dot" aria-hidden="true"></span>
				{eyebrow}
			</p>
			<h2 id="vm3d-title">{title}</h2>
			<p class="vm3d__lede">{lede}</p>
			<div class="vm3d__cue" aria-hidden="true">
				<span class="vm3d__cue-rule"></span>
				{scrollCue}
			</div>
			<p class="vm3d__legend" aria-hidden="true">
				<span class="vm3d__legend-item"><i class="is-hit"></i>Page hit</span>
				<span class="vm3d__legend-item"><i class="is-fault"></i>Page fault</span>
				<span class="vm3d__legend-item"><i class="is-gold"></i>Selectable</span>
			</p>
		</header>

		{#if ready}
			<aside class="vm3d__hud" aria-label="Paging simulator">
				<div class="vm3d__hud-head">
					<span class="vm3d__hud-title">Memory controller</span>
					<span class="vm3d__hud-tag">VM—02</span>
				</div>

				<p class="vm3d__hud-status" data-tone={outcome} aria-hidden="true">{status}</p>

				<div class="vm3d__stats">
					<div class="vm3d__stat">
						<span>Hits</span>
						<strong data-stat="hits">{pad(hits)}</strong>
					</div>
					<div class="vm3d__stat">
						<span>Faults</span>
						<strong data-stat="faults">{pad(faults)}</strong>
					</div>
					<div class="vm3d__stat">
						<span>Hit rate</span>
						<strong>{hitRate}<em>%</em></strong>
					</div>
				</div>

				<div class="vm3d__algo" role="group" aria-label="Page replacement algorithm">
					<button
						type="button"
						class:is-active={algorithm === 'lru'}
						aria-pressed={algorithm === 'lru'}
						onclick={() => setAlgorithm('lru')}
					>
						LRU
					</button>
					<button
						type="button"
						class:is-active={algorithm === 'fifo'}
						aria-pressed={algorithm === 'fifo'}
						onclick={() => setAlgorithm('fifo')}
					>
						FIFO
					</button>
				</div>
				<p class="vm3d__algo-copy">
					{algorithm === 'lru'
						? 'Evict the frame with the oldest access.'
						: 'Evict the frame that was loaded first.'}
				</p>

				<div class="vm3d__frames-block">
					<div class="vm3d__block-head">
						<span>Frame array</span>
						<span>{residentCount} / {frames.length || FRAME_TOTAL} resident</span>
					</div>
					<div class="vm3d__frames" role="img" aria-label={framesSummary}>
						{#each frames as frame, index (frame.page ?? index)}
							<div
								class="vframe"
								class:is-filled={frame.page !== null}
								class:is-victim={victimFrame === index}
								class:is-target={targetFrame === index}
								data-frame={index}
								data-page={frame.page ?? ''}
							>
								<span>{frameLabel(index)}</span>
								<b>{pageName(frame.page)}</b>
							</div>
						{/each}
					</div>
					<div class="vm3d__order">
						<span>{algorithm === 'lru' ? 'LRU order' : 'FIFO order'}</span>
						<b>{orderPreview}</b>
					</div>
					<div class="vm3d__evict">
						<span>Next eviction</span>
						<b>{evictionLabel}</b>
					</div>
				</div>

				<div class="vm3d__pages-block">
					<div class="vm3d__block-head">
						<span>Page table</span>
						<span>tap to access</span>
					</div>
					<div class="vm3d__chips">
						{#each pageFrames as frameIndex, page (page)}
							<button
								type="button"
								class="pchip"
								class:is-resident={frameIndex >= 0}
								class:is-active={activePage === page}
								class:is-hover={hoveredPage === page}
								class:is-flying={flyingPage === page || flyingVictim === page}
								data-page-id={page}
								data-state={frameIndex >= 0 ? 'resident' : 'disk'}
								aria-pressed={activePage === page}
								aria-label={`${pageLabel(page)}, ${
									frameIndex >= 0 ? `resident in frame ${frameLabel(frameIndex)}` : 'on disk'
								}. Request this page.`}
								onclick={() => accessPage(page)}
							>
								<span>{pageLabel(page)}</span>
								<i>{frameIndex >= 0 ? frameLabel(frameIndex) : 'DISK'}</i>
							</button>
						{/each}
					</div>
				</div>

				<div class="vm3d__foot">
					<button type="button" class="vm3d__reset" onclick={resetSimulation}>
						Reset simulation
					</button>
					<span class="vm3d__foot-note">
						{#if queuedCount > 0}+{queuedCount} queued{:else}{algorithm.toUpperCase()} · 4 KB pages{/if}
					</span>
				</div>
			</aside>
		{/if}

		<div class="vm3d__status" data-tone={outcome} role="status" aria-live="polite">
			<span class="vm3d__status-badge">
				{outcome === 'hit' ? 'HIT' : outcome === 'fault' ? 'FAULT' : 'READY'}
			</span>
			<span class="vm3d__status-text">{status}</span>
			{#if queuedCount > 0}
				<span class="vm3d__status-queue">+{queuedCount} queued</span>
			{/if}
		</div>

		<div class="vm3d__readout" aria-hidden="true">
			<span class="vm3d__readout-label">Frame occupancy</span>
			<span class="vm3d__meter"><i style={`width:${occupancy}%`}></i></span>
			<span class="vm3d__readout-value">{pad(residentCount)} / {pad(frames.length || FRAME_TOTAL)}</span>
		</div>

		{#if loading}
			<div class="vm3d__loader" role="status" aria-live="polite">
				<div class="vm3d__loader-inner">
					<span class="vm3d__loader-index">SP—02 / FRAME ARRAY</span>
					<p class="vm3d__loader-title">Assembling virtual memory</p>
					<div
						class="vm3d__loader-meter"
						role="progressbar"
						aria-valuemin={0}
						aria-valuemax={100}
						aria-valuenow={Math.round(progress)}
					>
						<i style={`width:${progress}%`}></i>
					</div>
					<div class="vm3d__loader-meta">
						<span>{Math.round(progress)}%</span>
						<span>Draco · KTX2 · HDRI</span>
					</div>
				</div>
			</div>
		{/if}

		{#if error}
			<div class="vm3d__error" role="alert">
				<div>
					<span class="vm3d__loader-index">SP—02 / INTERRUPT</span>
					<h3>Frames unavailable</h3>
					<p>{error}</p>
				</div>
			</div>
		{/if}

		<noscript>
			<p class="vm3d__no-js">
				This paging study needs JavaScript and WebGL. The disk holds twenty 4 KB pages; the frame
				array holds sixteen. A fault evicts the least recently used page.
			</p>
		</noscript>
	</div>


	<div class="vm3d__sr">
		<h3>Virtual memory paging, in three dimensions</h3>
		<p>
			The vertical board is physical RAM: sixteen frames arranged four by four. The horizontal
			platter is the disk: twenty pages. Selecting a page requests a memory access. A hit lights its
			frame green. A fault lights the target frame red, flies the victim page back to the disk, and
			flies the requested page into the freed frame. LRU evicts the least recently used frame; FIFO
			evicts the frame loaded first. The overlay reports hits, faults, hit rate, and the exact
			eviction order held in component state.
		</p>
		<p>
			Keyboard and screen-reader users can request any page with the page-table buttons in the
			memory controller panel, and reset the simulation at any time.
		</p>
	</div>
</section>

<style>
	.vm3d {
		--ink: var(--rubin-slate);
		--muted: var(--rubin-muted);
		--faint: var(--rubin-muted);
		--line: rgba(138, 130, 116, 0.42);
		--mono: var(--font-mono);
		--line-strong: rgba(217, 119, 87, 0.7);
		--accent: var(--rubin-clay-ink);
		--cool: var(--rubin-teal-ink);
		--hit: var(--rubin-teal-ink);
		--fault: #a8321f;
		--fault-ink: #a8321f;
		position: relative;
		height: 236svh;
		min-height: 1260px;
		background: var(--rubin-ivory);
		color: var(--ink);
		font-family:
			'Inter', var(--font-sans);
		font-feature-settings: 'tnum' 1, 'cv11' 1;
		-webkit-font-smoothing: antialiased;
		isolation: isolate;
		overflow-x: clip;
	}

	.vm3d *,
	.vm3d *::before,
	.vm3d *::after {
		box-sizing: border-box;
	}

	.vm3d__stage {
		position: sticky;
		top: 0;
		height: 100svh;
		min-height: 600px;
		overflow: hidden;
		background:
			radial-gradient(78% 62% at 56% 42%, color-mix(in srgb, var(--rubin-ivory) 20%, transparent), transparent 68%),
			radial-gradient(46% 46% at 50% 50%, var(--rubin-ivory) 0%, var(--rubin-ivory) 78%);
	}

	.vm3d__stage::before {
		content: '';
		position: absolute;
		inset: 0;
		z-index: 2;
		pointer-events: none;
		background:
			linear-gradient(180deg, color-mix(in srgb, var(--rubin-ivory) 78%, transparent) 0%, transparent 26%, transparent 72%, color-mix(in srgb, var(--rubin-ivory) 74%, transparent) 100%),
			linear-gradient(90deg, color-mix(in srgb, var(--rubin-ivory) 50%, transparent) 0%, transparent 34%, transparent 76%, color-mix(in srgb, var(--rubin-ivory) 30%, transparent) 100%);
	}

	.vm3d__canvas {
		position: absolute;
		inset: 0;
		z-index: 1;
	}

	.vm3d__canvas :global(canvas) {
		display: block;
		width: 100%;
		height: 100%;
		opacity: 0;
		touch-action: pan-y;
		transition: opacity 1.1s ease;
	}

	.vm3d.is-ready .vm3d__canvas :global(canvas) {
		opacity: 1;
	}

	.vm3d__vignette {
		position: absolute;
		inset: 0;
		z-index: 2;
		pointer-events: none;
		box-shadow: inset 0 0 160px 34px color-mix(in srgb, var(--rubin-ivory) 84%, transparent);
	}

	.vm3d__grain {
		position: absolute;
		inset: 0;
		z-index: 3;
		pointer-events: none;
		opacity: 0.055;
		mix-blend-mode: soft-light;
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.86' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.5'/%3E%3C/svg%3E");
		background-size: 160px 160px;
	}

	.vm3d__intro {
		position: absolute;
		top: calc(clamp(1.6rem, 6.4vh, 4.6rem) + var(--vm3d-top, 0px));
		left: clamp(1.25rem, 5vw, 5rem);
		z-index: 4;
		width: min(27rem, 38vw);
		pointer-events: none;
	}

	.vm3d__eyebrow {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		margin: 0 0 1.35rem;
		color: var(--muted);
		font-family: var(--mono);
		font-variant-numeric: tabular-nums;
		font-size: 0.625rem;
		font-weight: 500;
		letter-spacing: 0.23em;
		line-height: 1.5;
		text-transform: uppercase;
	}

	.vm3d__dot {
		width: 5px;
		height: 5px;
		flex: 0 0 auto;
		border-radius: 0;
		background: var(--accent);
	}

	.vm3d__intro h2 {
		max-width: 12ch;
		margin: 0;
		color: var(--rubin-slate);
		font-size: clamp(2.5rem, 4.15vw, 4.65rem);
		font-weight: 300;
		letter-spacing: -0.055em;
		line-height: 0.94;
		text-wrap: balance;
	}

	.vm3d__lede {
		max-width: 23.5rem;
		margin: 1.45rem 0 0;
		color: var(--muted);
		font-size: 0.82rem;
		font-weight: 400;
		letter-spacing: 0.005em;
		line-height: 1.72;
	}

	.vm3d__cue {
		display: flex;
		align-items: center;
		gap: 0.8rem;
		margin-top: 2.2rem;
		color: var(--faint);
		font-family: var(--mono);
		font-variant-numeric: tabular-nums;
		font-size: 0.625rem;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		opacity: clamp(0, calc(1 - var(--p, 0) * 2.2), 1);
	}

	.vm3d__cue-rule {
		position: relative;
		display: block;
		width: 1px;
		height: 2.2rem;
		overflow: hidden;
		background: var(--line);
	}

	.vm3d__cue-rule::after {
		content: '';
		position: absolute;
		inset: 0;
		background: var(--accent);
		animation: vm3d-cue 2.6s ease-in-out infinite;
	}

	@keyframes vm3d-cue {
		0%,
		100% {
			transform: translateY(-70%);
			opacity: 0;
		}
		45% {
			opacity: 1;
		}
		70% {
			transform: translateY(70%);
			opacity: 0;
		}
	}

	.vm3d__legend {
		display: flex;
		flex-wrap: wrap;
		gap: 1.1rem;
		margin: 1.8rem 0 0;
		color: var(--faint);
		font-family: var(--mono);
		font-variant-numeric: tabular-nums;
		font-size: 0.625rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	.vm3d__legend-item {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
	}

	.vm3d__legend i {
		display: block;
		width: 5px;
		height: 5px;
		border-radius: 0;
	}

	.vm3d__legend i.is-hit {
		background: var(--hit);
	}

	.vm3d__legend i.is-fault {
		background: var(--fault);
	}

	.vm3d__legend i.is-gold {
		background: var(--accent);
	}

	/* HUD ------------------------------------------------------------------ */

	.vm3d__hud {
		position: absolute;
		top: calc(clamp(1.2rem, 4.6vh, 2.4rem) + var(--vm3d-top, 0px));
		right: clamp(1.2rem, 4vw, 4rem);
		z-index: 6;
		width: 21.5rem;
		max-height: calc(100svh - 2.4rem - var(--vm3d-top, 0px));
		overflow-y: auto;
		padding: 1.05rem 1.1rem 1rem;
		border: 1px solid var(--line);
		border-radius: 0;
		background:
			linear-gradient(158deg, color-mix(in srgb, var(--rubin-ivory) 90%, transparent), color-mix(in srgb, var(--rubin-ivory) 80%, transparent));
		box-shadow:
			0 28px 80px rgba(31, 30, 29, 0.38),
			inset 0 1px 0 rgba(31, 30, 29, 0.035);
		backdrop-filter: blur(16px) saturate(1.05);
		scrollbar-width: thin;
		scrollbar-color: rgba(138, 130, 116, 0.54) transparent;
	}

	.vm3d__hud-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding-bottom: 0.7rem;
		border-bottom: 1px solid var(--line);
	}

	.vm3d__hud-title {
		color: var(--muted);
		font-family: var(--mono);
		font-variant-numeric: tabular-nums;
		font-size: 0.625rem;
		letter-spacing: 0.19em;
		text-transform: uppercase;
	}

	.vm3d__hud-tag {
		color: var(--accent);
		font-family: var(--mono);
		font-variant-numeric: tabular-nums;
		font-size: 0.625rem;
		letter-spacing: 0.16em;
		opacity: 0.75;
	}

	.vm3d__hud-status {
		display: none;
		margin: 0.6rem 0 0;
		color: var(--muted);
		font-size: 0.6875rem;
		line-height: 1.5;
	}

	.vm3d__hud-status[data-tone='hit'] {
		color: var(--hit);
	}

	.vm3d__hud-status[data-tone='fault'] {
		color: var(--fault-ink);
	}

	.vm3d__stats {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.5rem;
		padding: 0.85rem 0 0.8rem;
	}

	.vm3d__stat {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}

	.vm3d__stat span {
		color: var(--faint);
		font-family: var(--mono);
		font-variant-numeric: tabular-nums;
		font-size: 0.625rem;
		letter-spacing: 0.17em;
		text-transform: uppercase;
	}

	.vm3d__stat strong {
		color: var(--ink);
		font-size: 1.55rem;
		font-weight: 300;
		font-variant-numeric: tabular-nums;
		letter-spacing: -0.03em;
		line-height: 1;
	}

	.vm3d__stat strong em {
		margin-left: 0.1rem;
		color: var(--faint);
		font-family: var(--mono);
		font-variant-numeric: tabular-nums;
		font-size: 0.625rem;
		font-style: normal;
		font-weight: 400;
	}

	.vm3d__algo {
		display: grid;
		grid-template-columns: 1fr 1fr;
		border: 1px solid var(--line);
		border-radius: 0;
		overflow: hidden;
	}

	.vm3d__algo button {
		appearance: none;
		padding: 0.5rem 0.4rem;
		border: 0;
		background: transparent;
		color: var(--faint);
		font-family: var(--mono);
		font-variant-numeric: tabular-nums;
		font-size: 0.625rem;
		letter-spacing: 0.17em;
		text-transform: uppercase;
		cursor: pointer;
		transition:
			color 0.2s ease,
			background 0.2s ease;
	}

	.vm3d__algo button + button {
		border-left: 1px solid var(--line);
	}

	.vm3d__algo button:hover {
		color: var(--ink);
		background: rgba(31, 30, 29, 0.03);
	}

	.vm3d__algo button.is-active {
		color: var(--accent);
		background: rgba(217, 119, 87, 0.09);
		box-shadow: inset 0 -1px 0 rgba(217, 119, 87, 0.55);
	}

	.vm3d__algo-copy {
		margin: 0.5rem 0 0;
		color: var(--faint);
		font-size: 0.625rem;
		line-height: 1.5;
	}

	.vm3d__block-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.75rem;
		margin-bottom: 0.45rem;
		color: var(--faint);
		font-family: var(--mono);
		font-variant-numeric: tabular-nums;
		font-size: 0.625rem;
		letter-spacing: 0.15em;
		text-transform: uppercase;
	}

	.vm3d__block-head span:last-child {
		letter-spacing: 0.08em;
		text-align: right;
	}

	.vm3d__frames-block {
		margin-top: 0.9rem;
		padding-top: 0.8rem;
		border-top: 1px solid var(--line);
	}

	.vm3d__frames {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.25rem;
	}

	.vframe {
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		height: 2.05rem;
		padding: 0.26rem 0.3rem;
		border: 1px solid rgba(138, 130, 116, 0.3);
		border-radius: 0;
		background: rgba(31, 30, 29, 0.015);
		color: var(--faint);
		font-family: var(--mono);
		font-variant-numeric: tabular-nums;
		transition:
			border-color 0.25s ease,
			background 0.25s ease;
	}

	.vframe span {
		font-size: 0.625rem;
		letter-spacing: 0.12em;
		opacity: 0.75;
	}

	.vframe b {
		font-size: 0.625rem;
		font-weight: 500;
		letter-spacing: 0.04em;
		color: var(--faint);
	}

	.vframe.is-filled {
		border-color: rgba(43, 130, 114, 0.3);
		background: rgba(43, 130, 114, 0.055);
	}

	.vframe.is-filled b {
		color: var(--ink);
	}

	.vframe.is-victim {
		border-color: rgba(168, 50, 31, 0.75);
		background: rgba(168, 50, 31, 0.09);
	}

	.vframe.is-target {
		border-color: rgba(217, 119, 87, 0.65);
	}

	.vm3d__order,
	.vm3d__evict {
		display: flex;
		justify-content: space-between;
		gap: 0.6rem;
		margin-top: 0.42rem;
		color: var(--faint);
		font-family: var(--mono);
		font-variant-numeric: tabular-nums;
		font-size: 0.625rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.vm3d__order b,
	.vm3d__evict b {
		color: var(--muted);
		font-weight: 500;
		letter-spacing: 0.06em;
		text-align: right;
	}

	.vm3d__evict b {
		color: var(--accent);
	}

	.vm3d__pages-block {
		margin-top: 0.85rem;
		padding-top: 0.75rem;
		border-top: 1px solid var(--line);
	}

	.vm3d__chips {
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		gap: 0.25rem;
	}

	.pchip {
		appearance: none;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		justify-content: center;
		gap: 0.08rem;
		height: 2.05rem;
		padding: 0.2rem 0.3rem;
		border: 1px solid rgba(138, 130, 116, 0.3);
		border-radius: 0;
		background: rgba(31, 30, 29, 0.015);
		color: var(--faint);
		font-family: var(--mono);
		font-variant-numeric: tabular-nums;
		text-align: left;
		cursor: pointer;
		transition:
			border-color 0.2s ease,
			background 0.2s ease,
			color 0.2s ease,
			opacity 0.2s ease;
	}

	.pchip span {
		font-size: 0.625rem;
		letter-spacing: 0.05em;
		line-height: 1;
	}

	.pchip i {
		color: var(--faint);
		font-size: 0.625rem;
		font-style: normal;
		letter-spacing: 0.09em;
		line-height: 1;
		opacity: 0.85;
	}

	.pchip:hover {
		border-color: rgba(217, 119, 87, 0.55);
		color: var(--ink);
		background: rgba(217, 119, 87, 0.05);
	}

	.pchip.is-resident {
		border-color: rgba(43, 130, 114, 0.34);
		background: rgba(43, 130, 114, 0.06);
		color: var(--ink);
	}

	.pchip.is-resident i {
		color: var(--cool);
	}

	.pchip.is-active {
		border-color: var(--accent);
		box-shadow: inset 0 0 0 1px rgba(217, 119, 87, 0.25);
	}

	.pchip.is-hover {
		border-color: rgba(217, 119, 87, 0.8);
	}

	.pchip.is-flying {
		opacity: 0.45;
		border-style: dashed;
	}

	.vm3d__foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		margin-top: 0.85rem;
		padding-top: 0.75rem;
		border-top: 1px solid var(--line);
	}

	.vm3d__reset {
		appearance: none;
		padding: 0.42rem 0.6rem;
		border: 1px solid rgba(138, 130, 116, 0.46);
		border-radius: 0;
		background: transparent;
		color: var(--muted);
		font-family: var(--mono);
		font-variant-numeric: tabular-nums;
		font-size: 0.625rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		cursor: pointer;
		transition:
			color 0.2s ease,
			border-color 0.2s ease,
			background 0.2s ease;
	}

	.vm3d__reset:hover {
		color: var(--ink);
		border-color: rgba(217, 119, 87, 0.55);
		background: rgba(217, 119, 87, 0.06);
	}

	.vm3d__foot-note {
		color: var(--faint);
		font-family: var(--mono);
		font-variant-numeric: tabular-nums;
		font-size: 0.625rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		text-align: right;
	}

	/* Status / readout ----------------------------------------------------- */

	.vm3d__status {
		position: absolute;
		left: clamp(1.25rem, 5vw, 5rem);
		bottom: 4.4rem;
		z-index: 5;
		pointer-events: none;
		pointer-events: none;
		display: flex;
		align-items: center;
		gap: 0.7rem;
		max-width: min(44rem, 52vw);
		padding: 0.55rem 0.75rem 0.55rem 0.6rem;
		border: 1px solid var(--line);
		border-radius: 0;
		background: color-mix(in srgb, var(--rubin-ivory) 66%, transparent);
		backdrop-filter: blur(12px);
		color: var(--muted);
		font-size: 0.6875rem;
		letter-spacing: 0.01em;
		line-height: 1.45;
	}

	.vm3d__status-badge {
		flex: 0 0 auto;
		padding: 0.16rem 0.38rem;
		border: 1px solid var(--line);
		border-radius: 0;
		color: var(--faint);
		font-family: var(--mono);
		font-variant-numeric: tabular-nums;
		font-size: 0.625rem;
		letter-spacing: 0.16em;
	}

	.vm3d__status[data-tone='hit'] .vm3d__status-badge {
		color: var(--hit);
		border-color: rgba(43, 130, 114, 0.4);
	}

	.vm3d__status[data-tone='fault'] .vm3d__status-badge {
		color: var(--fault);
		border-color: rgba(168, 50, 31, 0.42);
	}

	.vm3d__status-text {
		color: var(--muted);
	}

	.vm3d__status[data-tone='hit'] .vm3d__status-text {
		color: var(--rubin-teal-ink);
	}

	.vm3d__status[data-tone='fault'] .vm3d__status-text {
		color: var(--rubin-slate);
	}

	.vm3d__status-queue {
		flex: 0 0 auto;
		color: var(--accent);
		font-family: var(--mono);
		font-variant-numeric: tabular-nums;
		font-size: 0.625rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.vm3d__readout {
		position: absolute;
		left: clamp(1.25rem, 5vw, 5rem);
		bottom: 2.1rem;
		z-index: 5;
		pointer-events: none;
		pointer-events: none;
		display: flex;
		align-items: center;
		gap: 0.7rem;
		color: var(--faint);
		font-family: var(--mono);
		font-variant-numeric: tabular-nums;
		font-size: 0.625rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	.vm3d__readout-label {
		white-space: nowrap;
	}

	.vm3d__meter {
		position: relative;
		display: block;
		width: clamp(5rem, 9vw, 8rem);
		height: 1px;
		overflow: hidden;
		background: rgba(138, 130, 116, 0.44);
	}

	.vm3d__meter i {
		position: absolute;
		inset: 0 auto 0 0;
		background: linear-gradient(90deg, rgba(43, 130, 114, 0.35), var(--accent));
		transition: width 0.5s ease;
	}

	.vm3d__readout-value {
		color: var(--muted);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	/* Loader / error ------------------------------------------------------- */

	.vm3d__loader,
	.vm3d__error {
		position: absolute;
		inset: 0;
		z-index: 9;
		display: grid;
		place-items: center;
		padding: 1.5rem;
		background:
			radial-gradient(60% 54% at 50% 44%, color-mix(in srgb, var(--rubin-ivory) 72%, transparent), color-mix(in srgb, var(--rubin-ivory) 90%, transparent)),
			var(--rubin-ivory);
	}

	.vm3d__loader-inner {
		width: min(20rem, 80vw);
	}

	.vm3d__loader-index {
		display: block;
		color: var(--accent);
		font-family: var(--mono);
		font-variant-numeric: tabular-nums;
		font-size: 0.625rem;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		opacity: 0.8;
	}

	.vm3d__loader-title {
		margin: 0.9rem 0 1.5rem;
		color: var(--ink);
		font-size: 1.45rem;
		font-weight: 300;
		letter-spacing: -0.03em;
	}

	.vm3d__loader-meter {
		position: relative;
		height: 1px;
		overflow: hidden;
		background: rgba(138, 130, 116, 0.46);
	}

	.vm3d__loader-meter i {
		position: absolute;
		inset: 0 auto 0 0;
		background: linear-gradient(90deg, var(--cool), var(--accent));
		transition: width 0.35s ease;
	}

	.vm3d__loader-meta {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		margin-top: 0.6rem;
		color: var(--faint);
		font-family: var(--mono);
		font-variant-numeric: tabular-nums;
		font-size: 0.625rem;
		letter-spacing: 0.15em;
		text-transform: uppercase;
	}

	.vm3d__error {
		background: var(--rubin-ivory);
	}

	.vm3d__error h3 {
		margin: 0.9rem 0 0.6rem;
		color: var(--ink);
		font-size: 1.3rem;
		font-weight: 300;
	}

	.vm3d__error p {
		max-width: 30rem;
		margin: 0;
		color: var(--muted);
		font-size: 0.75rem;
		line-height: 1.6;
	}

	.vm3d__no-js {
		position: absolute;
		z-index: 10;
		inset: auto 1.5rem 1.5rem;
		max-width: 34rem;
		color: var(--muted);
		font-size: 0.8rem;
		line-height: 1.6;
	}

	.vm3d__sr {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
		border: 0;
	}

	.vm3d button:focus-visible {
		outline: 1px solid var(--accent);
		outline-offset: 2px;
	}

	/* Responsive ----------------------------------------------------------- */

	@media (max-width: 860px) {
		.vm3d {
			height: 200svh;
			min-height: 1040px;
		}

		.vm3d__stage {
			display: flex;
			flex-direction: column;
			height: 100svh;
			min-height: 560px;
			padding-top: var(--vm3d-top, 0px);
		}

		.vm3d__canvas {
			position: relative;
			inset: auto;
			flex: 1 1 auto;
			min-height: 0;
			width: 100%;
		}

		.vm3d__intro {
			top: calc(1.35rem + var(--vm3d-top, 0px));
			left: 1.1rem;
			width: calc(100% - 2.2rem);
		}

		.vm3d__eyebrow {
			margin-bottom: 0.85rem;
			font-size: 0.625rem;
		}

		.vm3d__intro h2 {
			max-width: 13ch;
			font-size: clamp(2.15rem, 9.6vw, 3.05rem);
			line-height: 0.96;
		}

		.vm3d__lede,
		.vm3d__cue,
		.vm3d__legend {
			display: none;
		}

		.vm3d__hud {
			position: relative;
			top: auto;
			right: auto;
			bottom: auto;
			left: auto;
			flex: 0 0 auto;
			width: 100%;
			max-height: 47svh;
			padding: 0.8rem 1rem 0.95rem;
			border-right: 0;
			border-bottom: 0;
			border-left: 0;
			border-radius: 0;
			background: linear-gradient(180deg, color-mix(in srgb, var(--rubin-ivory) 92%, transparent), color-mix(in srgb, var(--rubin-ivory) 97%, transparent));
			box-shadow: 0 -22px 60px rgba(31, 30, 29, 0.35);
		}

		.vm3d__hud-head {
			padding-bottom: 0.45rem;
		}

		.vm3d__hud-status {
			display: block;
		}

		.vm3d__stats {
			padding: 0.55rem 0 0.5rem;
		}

		.vm3d__stat strong {
			font-size: 1.2rem;
		}

		.vm3d__algo {
			margin-top: 0.15rem;
		}

		.vm3d__algo button {
			padding: 0.4rem;
		}

		.vm3d__algo-copy,
		.vm3d__frames-block,
		.vm3d__order {
			display: none;
		}

		.vm3d__pages-block {
			margin-top: 0.55rem;
			padding-top: 0.55rem;
		}

		.vm3d__chips {
			grid-template-columns: repeat(5, minmax(0, 1fr));
			gap: 0.22rem;
		}

		.pchip {
			height: 1.85rem;
			padding: 0.18rem 0.28rem;
		}

		.pchip span {
			font-size: 0.625rem;
		}

		.pchip i {
			font-size: 0.625rem;
		}

		.vm3d__foot {
			margin-top: 0.55rem;
			padding-top: 0.55rem;
		}

		.vm3d__status {
			position: absolute;
			width: 1px;
			height: 1px;
			padding: 0;
			margin: -1px;
			overflow: hidden;
			clip: rect(0 0 0 0);
			white-space: nowrap;
			border: 0;
		}

		.vm3d__readout {
			display: none;
		}
	}

	@media (max-width: 1150px) and (min-width: 861px) {
		.vm3d__frames-block {
			display: none;
		}
	}

	@media (max-width: 860px) and (max-height: 720px) {
		.vm3d__hud {
			padding: 0.65rem 0.9rem 0.72rem;
		}

		.vm3d__hud-head {
			display: none;
		}

		.vm3d__stats {
			padding: 0.55rem 0 0.5rem;
		}

		.vm3d__stat strong {
			font-size: 1.15rem;
		}

		.vm3d__algo button {
			padding: 0.42rem 0.35rem;
		}

		.vm3d__algo-copy {
			display: none;
		}

		.pchip {
			height: 1.85rem;
		}

		.vm3d__pages-block {
			margin-top: 0.6rem;
			padding-top: 0.55rem;
		}

		.vm3d__foot {
			margin-top: 0.45rem;
			padding-top: 0.45rem;
		}
	}

	@media (max-height: 720px) and (min-width: 861px) {
		.vm3d__intro h2 {
			font-size: clamp(2.2rem, 3.5vw, 3.5rem);
		}

		.vm3d__lede {
			font-size: 0.76rem;
		}

		.vm3d__cue {
			margin-top: 1.3rem;
		}

		.vm3d__hud {
			padding: 0.8rem 0.9rem;
		}

		.vm3d__stats {
			padding: 0.55rem 0;
		}

		.vm3d__stat strong {
			font-size: 1.25rem;
		}

		.vm3d__order {
			display: none;
		}

		.vm3d__frames-block {
			margin-top: 0.65rem;
			padding-top: 0.6rem;
		}

		.vframe {
			height: 1.75rem;
		}

		.pchip {
			height: 1.75rem;
		}

		.vm3d__pages-block {
			margin-top: 0.6rem;
			padding-top: 0.6rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.vm3d {
			height: auto;
			min-height: 0;
		}

		.vm3d__stage {
			position: relative;
			height: 100svh;
			min-height: 620px;
		}

		.vm3d__cue,
		.vm3d__cue-rule {
			display: none;
		}

		.vm3d__canvas :global(canvas) {
			transition: none;
		}

		.vm3d * {
			transition-duration: 0.01ms !important;
			animation-duration: 0.01ms !important;
		}
	}

	/* Embedded (lesson) mode: the study fills a bounded frame. The narrative
	   overlays are hidden (the lesson prose carries them) and the simulator HUD
	   stays, narrower, so the page table remains in reach. */
	.vm3d.is-embedded {
		height: 100%;
		min-height: 0;
		background: transparent;
	}

	.vm3d.is-embedded .vm3d__stage {
		position: relative;
		top: auto;
		height: 100%;
		min-height: 0;
		background: none;
	}

	/* Transparent frame: the board floats on the page, the shadow grounds it. */
	.vm3d.is-embedded .vm3d__stage::before,
	.vm3d.is-embedded .vm3d__vignette,
	.vm3d.is-embedded .vm3d__grain {
		display: none;
	}

	.vm3d.is-embedded .vm3d__intro {
		max-width: 55%;
		padding: 1rem 1.15rem;
	}

	.vm3d.is-embedded .vm3d__intro h2 {
		margin: 0;
		font-size: 1.3rem;
		line-height: 1.2;
		letter-spacing: -0.01em;
	}

	.vm3d.is-embedded .vm3d__eyebrow,
	.vm3d.is-embedded .vm3d__lede,
	.vm3d.is-embedded .vm3d__cue,
	.vm3d.is-embedded .vm3d__legend {
		display: none;
	}

	.vm3d.is-embedded .vm3d__readout {
		display: none;
	}

	.vm3d.is-embedded .vm3d__status {
		max-width: 14rem;
	}

	.vm3d.is-embedded .vm3d__status-text {
		min-width: 0;
		white-space: normal;
		line-height: 1.3;
	}

	/* Wide frame: the model owns the left of the frame, the simulator HUD a
	   column on the right, so nothing is drawn over the board. */
	.vm3d.is-embedded .vm3d__canvas {
		right: 16.5rem;
	}

	.vm3d.is-embedded .vm3d__hud {
		top: 0;
		right: 0;
		bottom: 0;
		width: 16rem;
		max-height: none;
		padding: 1rem 1.1rem;
		border: 0;
		border-left: 1px solid var(--line);
		background: var(--rubin-ivory-med);
		box-shadow: none;
		backdrop-filter: none;
		font-size: 0.72rem;
	}

	.vm3d.is-embedded .vm3d__foot-note {
		display: none;
	}

	/* Compact simulator: every control (policy, all twenty page chips, reset)
	   must be reachable without scrolling the HUD column. */
	.vm3d.is-embedded .vm3d__hud {
		display: flex;
		flex-direction: column;
		gap: 0;
		padding: 0.75rem 1rem 0.8rem;
	}

	.vm3d.is-embedded .vm3d__stats {
		padding: 0.55rem 0 0.5rem;
	}

	.vm3d.is-embedded .vm3d__stat strong {
		font-size: 1.25rem;
	}

	.vm3d.is-embedded .vm3d__algo-copy,
	.vm3d.is-embedded .vm3d__order,
	.vm3d.is-embedded .vm3d__evict {
		display: none;
	}

	.vm3d.is-embedded .vm3d__frames-block {
		margin-top: 0.6rem;
	}

	.vm3d.is-embedded .vframe,
	.vm3d.is-embedded .pchip {
		height: 1.7rem;
	}

	.vm3d.is-embedded .vm3d__pages-block {
		margin-top: 0.6rem;
		padding-top: 0.55rem;
	}

	.vm3d.is-embedded .vm3d__foot {
		margin-top: auto;
		padding-top: 0.55rem;
	}

	@media (max-width: 899px) {
		.vm3d.is-embedded .vm3d__stage {
			display: flex;
			flex-direction: column;
			height: auto;
		}

		.vm3d.is-embedded .vm3d__canvas {
			position: relative;
			inset: auto;
			right: auto;
			height: 380px;
			flex: none;
		}

		.vm3d.is-embedded .vm3d__hud {
			position: static;
			width: 100%;
			border-left: 0;
			border-top: 1px solid var(--line);
		}

		.vm3d.is-embedded .vm3d__intro {
			max-width: 100%;
		}
	}



</style>
