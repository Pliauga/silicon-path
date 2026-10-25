<script lang="ts">
	import { disposeObject3D } from '$lib/utils/three-dispose';
	import { getContext, onMount } from 'svelte';
	import { asset as resolveAsset } from '$app/paths';
	import { STUDY_FRAME, type StudyFrame } from './frame-mode';
	import type * as Three from 'three';
	import { createBloom, type Bloom } from '$lib/utils/bloom';
	import { createParallax, type Parallax } from '$lib/utils/parallax';

	type Level = {
		index: string;
		label: string;
		detail: string;
		latency: string;
		bar: number;
		description: string;
	};

	type Props = {
		id?: string;
		eyebrow?: string;
		title?: string;
		subtitle?: string;
		scrollLabel?: string;
		class?: string;
		/** Set by the Gallery route explicitly; lessons set it through LazyStudy's context. */
		embedded?: boolean;
	};

	let {
		id = 'memory-hierarchy',
		eyebrow = 'Silicon Path / Memory hierarchy',
		title = 'The memory hierarchy.',
		subtitle = 'A byte crosses seven orders of magnitude of latency to reach a register. Scroll to follow one — from spinning platter, through DRAM and cache, to the execution core.',
		scrollLabel = 'Scroll to follow a byte',
		class: className = '',
		embedded = false
	}: Props = $props();

	const frame = getContext<StudyFrame | undefined>(STUDY_FRAME);
	const embeddedMode = $derived(embedded || frame?.embedded === true);


	const levels: Level[] = [
		{
			index: '01',
			label: 'Storage',
			detail: '3.5" HDD',
			latency: '~5.2 ms',
			bar: 100,
			description:
				'A page miss falls through to mass storage. The drive must seek, wait for the platter to rotate under the head, and stream the sector over SATA. This is the slowest step by far: milliseconds, not nanoseconds.'
		},
		{
			index: '02',
			label: 'Memory',
			detail: 'DDR5 DIMM',
			latency: '~80 ns',
			bar: 34,
			description:
				'The requested 64-byte cache line is copied from DRAM into the CPU cache. The memory controller drives the DIMMs across the board, roughly eighty nanoseconds for a hit in an open row.'
		},
		{
			index: '03',
			label: 'Cache',
			detail: 'L3 · on-die',
			latency: '~12 ns',
			bar: 22,
			description:
				'The L3 cache is shared silicon on the same die. A cache line can be served without leaving the package, an order of magnitude faster than DRAM.'
		},
		{
			index: '04',
			label: 'Registers',
			detail: 'CPU core',
			latency: '~0.3 ns',
			bar: 6,
			description:
				'Registers are the handful of values the core can use immediately. Loading one is effectively free: a fraction of a nanosecond, less than a single clock cycle. The journey is over.'
		}
	];

	type FlowPoint = [number, number, number];
	type FlowPath = { points: FlowPoint[]; closed?: boolean };
	type FlowData = {
		paths: Record<string, FlowPath>;
		anchors?: Record<string, FlowPoint>;
		cache?: { x: number; y: number; z: number; radius: number };
	};

	const cacheFallbackPoint = (angle: number): FlowPoint => [
		-0.67 + Math.cos(angle) * 0.48,
		0.404,
		-0.55 + Math.sin(angle) * 0.48
	];

	/**
	 * Component-side mirror of the routes baked into the GLB by
	 * scripts/build-memory-model.mjs. Used only if the model loses its extras.
	 */
	const fallbackFlow: FlowData = {
		paths: {
			hddToRam: {
				points: [
					[-2.98, 0.56, 2.42],
					[-3.18, 0.3, 2.68],
					[-3.1, 0.13, 2.92],
					[-1.6, 0.13, 2.96],
					[0.1, 0.13, 2.96],
					[0.54, 0.15, 2.74],
					[0.628, 0.3, 2.2],
					[0.628, 0.6, 1.6],
					[0.628, 0.82, 1.3],
					[0.628, 0.95, 1.14]
				]
			},
			ramToCache: {
				points: [
					[0.628, 0.96, 1.12],
					[0.74, 1.06, 0.86],
					[0.55, 1.08, 0.4],
					[0.2, 0.95, -0.02],
					[-0.3, 0.72, -0.35],
					[-0.55, 0.5, -0.5],
					[-0.67, 0.4, -0.55]
				]
			},
			cacheLoop: {
				closed: true,
				points: Array.from({ length: 20 }, (_, index) =>
					cacheFallbackPoint((index / 20) * Math.PI * 2)
				)
			},
			cacheToRegisters: {
				points: [
					[-0.67, 0.4, -0.55],
					[-0.91, 0.402, -0.55],
					[-1.15, 0.404, -0.55]
				]
			}
		},
		cache: { x: -1.15, y: 0.4, z: -0.55, radius: 0.48 }
	};

	type PacketState = {
		travel: number;
		memory: number;
		cache: number;
		register: number;
		opacity: number;
		scale: number;
	};

	type Packet = {
		group: Three.Group;
		sprite: Three.Sprite;
		trail: Three.Sprite;
		core: Three.Mesh;
		coreMaterial: Three.MeshStandardMaterial;
		material: Three.SpriteMaterial;
		trailMaterial: Three.SpriteMaterial;
		state: PacketState;
	};

	type ActiveTimeline = {
		progress(): number;
		kill(): void;
	};

	let sectionEl: HTMLElement | undefined;
	let canvasHost: HTMLDivElement | undefined;

	let loading = $state(true);
	let ready = $state(false);
	let error = $state<string | null>(null);
	let loadPercent = $state(0);
	let reducedMotion = $state(false);
	let activeLevel = $state(0);
	let progress = $state(0);
	let announcement = $state('Loading the memory hierarchy model.');

	const headingId = $derived(`${id}-title`);
	const summaryId = $derived(`${id}-summary`);
	const percentLabel = $derived(String(Math.round(progress * 100)).padStart(3, '0'));
	const phaseLabels = ['Storage → DRAM', 'DRAM → L3', 'Cache line', 'Register file'];
	const phaseLabel = $derived(phaseLabels[activeLevel] ?? phaseLabels[0]);

	$effect(() => {
		if (loading) {
			announcement = 'Loading the memory hierarchy model.';
			return;
		}
		if (error) {
			announcement =
				'The 3D memory hierarchy model is unavailable. A written description of every level follows.';
			return;
		}
		const timer = window.setTimeout(() => {
			announcement =
				'Memory hierarchy model ready. Scroll to follow a data packet from the hard drive, through memory and cache, to the register file.';
		}, 600);
		return () => window.clearTimeout(timer);
	});

	onMount(() => {
		let disposed = false;
		let renderer: Three.WebGLRenderer | null = null;
		let bloom: Bloom | null = null;
		let scene: Three.Scene | null = null;
		let camera: Three.PerspectiveCamera | null = null;
		let modelRoot: Three.Group | null = null;
		let packets: Packet[] = [];
		let environmentTexture: Three.Texture | null = null;
		let keyLight: Three.DirectionalLight | null = null;
		let busMaterials: Three.MeshStandardMaterial[] = [];
		let cacheMaterials: Three.MeshStandardMaterial[] = [];
		let registerMaterials: Three.MeshStandardMaterial[] = [];

		let travelCurve!: Three.CatmullRomCurve3;
		let memoryCurve!: Three.CatmullRomCurve3;
		let cacheCurve!: Three.CatmullRomCurve3;
		let registerCurve!: Three.CatmullRomCurve3;

		let timeline: ActiveTimeline | null = null;
		let scrollTrigger: { kill(): void } | null = null;
		let refreshScroll: (() => void) | null = null;
		let resizeObserver: ResizeObserver | null = null;
		let intersectionObserver: IntersectionObserver | null = null;
		let motionQuery: MediaQueryList | null = null;
		let onMotionChange: ((event: MediaQueryListEvent) => void) | null = null;
		let dracoLoader: { dispose(): void } | null = null;
		let ktx2Loader: { dispose(): void } | null = null;
		let glowTexture: Three.Texture | null = null;
		let coreGeometry: Three.SphereGeometry | null = null;
		let refreshTimer = 0;
		let isVisible = false;
		let needsRender = true;
		let parallax: Parallax | null = null;

		const url = (path: Parameters<typeof resolveAsset>[0]) => resolveAsset(`/${path}`);
		const decoderPath = (file: Parameters<typeof resolveAsset>[0]) =>
			resolveAsset(`/${file}`).replace(/[^/]*$/, '');

		// Populated once Three has loaded.
		let THREE!: typeof import('three');
		let gsap!: typeof import('gsap').gsap;
		let ScrollTrigger!: typeof import('gsap/ScrollTrigger').ScrollTrigger;
		let cameraPath!: Three.CatmullRomCurve3;
		let targetPath!: Three.CatmullRomCurve3;
		let cameraTarget!: Three.Vector3;
		let packetLight!: Three.PointLight;

		const clamp = (value: number) => Math.max(0, Math.min(1, value));
		const CORE_RADIUS = 0.05;

		/**
		 * Per-material finish, keyed by the glTF material name. Roughness/metalness on
		 * 'Solder mask' are multipliers on the ORM texture channels; everything else
		 * is an absolute value. The GLB itself is untouched.
		 */
		const tuneMaterial = (m: Three.MeshStandardMaterial) => {
			switch (m.name) {
				case 'Solder mask':
					// Deep resist with a subtle gloss: texture G ~0.4-0.67 x 0.62 -> 0.25-0.41,
					// which lets the raking key stretch a soft highlight across the traces.
					m.color.setScalar(0.82);
					m.roughness = 0.62;
					m.metalness = 0.5;
					m.envMapIntensity = 0.85;
					break;
				case 'Board edge':
				case 'Board underside':
					m.envMapIntensity = 0.55;
					break;
				case 'DIMM heatspreader':
					// Satin brushed aluminium: bright F0, mid roughness for a stretched,
					// soft reflection, strong environment so it reads as metal.
					m.color.setRGB(0.8, 0.82, 0.84);
					m.metalness = 1;
					m.roughness = 0.36;
					m.envMapIntensity = 1.7;
					break;
				case 'HDD aluminium':
					m.color.setRGB(0.62, 0.64, 0.66);
					m.roughness = 0.34;
					m.envMapIntensity = 1.5;
					break;
				case 'Chipset heatsink':
					m.color.setRGB(0.68, 0.7, 0.72);
					m.roughness = 0.34;
					m.envMapIntensity = 1.5;
					break;
				case 'ENIG gold':
					m.envMapIntensity = 1.5;
					break;
				case 'Socket steel':
				case 'Solder silver':
				case 'I/O shield':
					m.envMapIntensity = 1.35;
					break;
				case 'Silicon':
				case 'Silicon floorplan':
					m.envMapIntensity = 1.5;
					break;
				case 'Data bus':
					m.envMapIntensity = 1.6;
					break;
				case 'L3 cache':
				case 'Register file':
					m.envMapIntensity = 1.8;
					break;
				case 'HDD activity LED':
					m.envMapIntensity = 1.2;
					break;
				default:
					break;
			}
		};

		const destroyTimeline = () => {
			scrollTrigger?.kill();
			scrollTrigger = null;
			timeline?.kill();
			timeline = null;
		};

		const currentProgress = () => {
			if (reducedMotion) return 1;
			return timeline ? timeline.progress() : 0;
		};

		const syncHud = (value: number) => {
			const clamped = clamp(value);
			if (Math.abs(clamped - progress) > 0.002) {
				progress = clamped;
			}
			const step = clamped < 0.34 ? 0 : clamped < 0.6 ? 1 : clamped < 0.82 ? 2 : 3;
			if (step !== activeLevel) {
				activeLevel = step;
			}
		};

		/**
		 * Cinematic dolly. Five evenly spaced keys (progress 0, .25, .5, .75, 1) are
		 * joined by centripetal Catmull-Rom splines, so velocity never stops and
		 * restarts mid-shot. The keys line up with the packet legs:
		 *   0.00  establishing, wide and high, HDD in the near-left foreground
		 *   0.25  storage -> DRAM, dropping low along the front edge
		 *   0.50  DRAM -> L3, parallax past the DIMMs with a low raking angle
		 *   0.75  cache loop / register snap, sweeping round to the die
		 *   1.00  slow push-in on the register file, held through the end pad
		 */
		const updateCameraLayout = (aspect: number) => {
			if (!THREE) return;
			const frame = aspect >= 1 ? 1.12 : 1.12 * (1 + 1.25 * (1 / aspect - 1));
			const eye: FlowPoint[] = [
				[7.2, 5.0, 10.4],
				[5.9, 3.9, 9.9],
				[3.9, 3.3, 8.7],
				[2.0, 3.7, 7.9],
				[1.1, 4.1, 8.0]
			];
			const look: FlowPoint[] = [
				[-0.2, 0.3, 0.45],
				[-0.1, 0.38, 0.95],
				[0.3, 0.5, 0.35],
				[-0.55, 0.5, -0.2],
				[-0.85, 0.46, -0.4]
			];
			cameraPath = new THREE.CatmullRomCurve3(
				eye.map(([x, y, z]) => new THREE.Vector3(x, y, z).multiplyScalar(frame)),
				false,
				'centripetal'
			);
			targetPath = new THREE.CatmullRomCurve3(
				look.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
				false,
				'centripetal'
			);
		};

		const updateCamera = (value: number) => {
			if (!camera) return;
			const p = clamp(value);
			// Ease the shot in and out without ever fully stalling mid-leg.
			const smooth = p * p * (3 - 2 * p);
			const u = p + (smooth - p) * 0.55;
			cameraPath.getPoint(u, camera.position);
			targetPath.getPoint(u, cameraTarget);
			camera.lookAt(cameraTarget);
		};

		const buildCurve = (flow: FlowData, key: string) => {
			const path = flow.paths[key] ?? fallbackFlow.paths[key];
			return new THREE.CatmullRomCurve3(
				path.points.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
				Boolean(path.closed),
				'centripetal',
				0.5
			);
		};

		const readFlow = (root: Three.Object3D): FlowData => {
			const board = root.getObjectByName('motherboard');
			const candidate = board?.userData?.flow as FlowData | undefined;
			const valid = (key: string) => {
				const path = candidate?.paths?.[key];
				if (!Array.isArray(path?.points) || path.points.length < 2) return false;
				return path.points.every(
					(entry) =>
						Array.isArray(entry) &&
						entry.length === 3 &&
						entry.every((axis) => Number.isFinite(axis))
				);
			};
			if (valid('hddToRam') && valid('ramToCache') && valid('cacheLoop') && valid('cacheToRegisters')) {
				return candidate as FlowData;
			}
			console.warn('[MemoryHierarchy3D] GLB flow extras missing; using component fallback routes.');
			return fallbackFlow;
		};

		const createGlowTexture = () => {
			const size = 128;
			const canvas = document.createElement('canvas');
			canvas.width = size;
			canvas.height = size;
			const context = canvas.getContext('2d');
			if (!context) return null;
			const gradient = context.createRadialGradient(
				size / 2,
				size / 2,
				0,
				size / 2,
				size / 2,
				size / 2
			);
			gradient.addColorStop(0, 'rgba(217, 119, 87, 1)');
			gradient.addColorStop(0.12, 'rgba(217, 119, 87, 0.9)');
			gradient.addColorStop(0.28, 'rgba(43, 130, 114, 0.62)');
			gradient.addColorStop(0.52, 'rgba(43, 130, 114, 0.22)');
			gradient.addColorStop(0.78, 'rgba(43, 130, 114, 0.05)');
			gradient.addColorStop(1, 'rgba(43, 130, 114, 0)');
			context.fillStyle = gradient;
			context.fillRect(0, 0, size, size);
			const texture = new THREE.CanvasTexture(canvas);
			texture.colorSpace = THREE.SRGBColorSpace;
			texture.minFilter = THREE.LinearFilter;
			texture.magFilter = THREE.LinearFilter;
			texture.generateMipmaps = false;
			return texture;
		};

		const createPackets = () => {
			if (!THREE || !modelRoot) return;
			const glow = createGlowTexture();
			if (!glow) throw new Error('Could not create the packet glow texture.');
			glowTexture = glow;

			const packetLightColor = 0x2b8272;
			packetLight = new THREE.PointLight(packetLightColor, 0, 3.2, 2);
			packetLight.castShadow = false;
			modelRoot.add(packetLight);

			// Shared PBR bead: gives each packet a hot, glossy core that picks up the
			// studio environment, while the additive sprite supplies the halo.
			const bead = new THREE.SphereGeometry(1, 24, 16);
			coreGeometry = bead;
			const environment = scene?.environment ?? null;

			packets = Array.from({ length: 3 }, (_, index) => {
				const group = new THREE.Group();
				group.name = `data-packet-${index + 1}`;
				const material = new THREE.SpriteMaterial({
					map: glow,
					color: 0xffffff,
					transparent: true,
					opacity: 0,
					blending: THREE.NormalBlending,
					depthWrite: false,
					depthTest: true,
					toneMapped: false
				});
				const trailMaterial = material.clone();
				trailMaterial.opacity = 0;
				const sprite = new THREE.Sprite(material);
				sprite.scale.setScalar(0.4);
				const trail = new THREE.Sprite(trailMaterial);
				trail.scale.setScalar(0.24);
				const coreMaterial = new THREE.MeshStandardMaterial({
					color: 0x1f1e1d,
					emissive: 0x2b8272,
					emissiveIntensity: 1.1,
					metalness: 0.3,
					roughness: 0.14,
					envMap: environment,
					envMapIntensity: 3,
					transparent: true,
					opacity: 0
				});
				const core = new THREE.Mesh(bead, coreMaterial);
				core.scale.setScalar(CORE_RADIUS);
				core.castShadow = false;
				core.receiveShadow = false;
				core.visible = false;
				group.add(trail);
				group.add(sprite);
				group.add(core);
				modelRoot?.add(group);
				return {
					group,
					sprite,
					trail,
					core,
					coreMaterial,
					material,
					trailMaterial,
					state: {
						travel: 0,
						memory: 0,
						cache: 0,
						register: 0,
						opacity: 0,
						scale: 1
					}
				};
			});
		};

		const positionPackets = () => {
			for (let index = 0; index < packets.length; index += 1) {
				const packet = packets[index];
				const state = packet.state;
				if (state.register > 0) {
					packet.group.position.copy(registerCurve.getPointAt(clamp(state.register)));
				} else if (state.cache > 0) {
					packet.group.position.copy(cacheCurve.getPointAt(clamp(state.cache)));
				} else if (state.memory > 0) {
					packet.group.position.copy(memoryCurve.getPointAt(clamp(state.memory)));
				} else {
					packet.group.position.copy(travelCurve.getPointAt(clamp(state.travel)));
				}

				const behind = 0.035;
				if (state.register > 0) {
					packet.trail.position.copy(packet.group.position);
					packet.trailMaterial.opacity = 0;
				} else if (state.cache > 0) {
					packet.trail.position.copy(cacheCurve.getPointAt(clamp(state.cache - behind)));
					packet.trailMaterial.opacity = state.opacity * 0.28;
				} else if (state.memory > 0) {
					packet.trail.position.copy(memoryCurve.getPointAt(clamp(state.memory - behind)));
					packet.trailMaterial.opacity = state.opacity * 0.28;
				} else {
					packet.trail.position.copy(travelCurve.getPointAt(clamp(state.travel - behind)));
					packet.trailMaterial.opacity = state.opacity * 0.28;
				}

				packet.material.opacity = state.opacity;
				packet.sprite.scale.setScalar(0.4 * state.scale);
				packet.trail.scale.setScalar(0.24 * state.scale);
				packet.core.visible = state.opacity > 0.01;
				packet.coreMaterial.opacity = state.opacity;
				packet.core.scale.setScalar(CORE_RADIUS * state.scale);

				if (index === 0) {
					packetLight.position.copy(packet.group.position);
					packetLight.intensity = 2.4 * state.opacity;
				}
			}
		};

		const updateScene = (value: number) => {
			const p = clamp(value);
			const smooth = p * p * (3 - 2 * p);
			updateCamera(p);
			if (modelRoot) {
				modelRoot.rotation.y = -0.07 + smooth * 0.14;
			}
			positionPackets();
			for (const material of busMaterials) {
				material.emissiveIntensity = 0.7 + smooth * 1.5;
			}
			for (const material of cacheMaterials) {
				material.emissiveIntensity = 1.1 + smooth * 1.8;
			}
			const registerReveal = clamp((p - 0.6) / 0.4);
			for (const material of registerMaterials) {
				material.emissiveIntensity = 1.2 + registerReveal * 3.4;
			}
		};

		const configureMotion = () => {
			if (!packets.length) return;
			destroyTimeline();
			if (reducedMotion) {
				for (const packet of packets) {
					packet.state.travel = 1;
					packet.state.memory = 1;
					packet.state.cache = 1;
					packet.state.register = 1;
					packet.state.opacity = 0.42;
					packet.state.scale = 0.6;
				}
				progress = 1;
				activeLevel = levels.length - 1;
				updateScene(1);
				needsRender = true;
				requestAnimationFrame(() => {
					if (!disposed) refreshScroll?.();
				});
				return;
			}

			for (const packet of packets) {
				packet.state.travel = 0;
				packet.state.memory = 0;
				packet.state.cache = 0;
				packet.state.register = 0;
				packet.state.opacity = 0;
				packet.state.scale = 1;
			}
			progress = 0;
			activeLevel = 0;

			const tl = gsap.timeline({ paused: true, defaults: { ease: 'none' } });
			tl.to({}, { duration: 0.02 }, 0);
			packets.forEach((packet, index) => {
				const start = 0.02 + index * 0.07;
				tl.to(packet.state, { opacity: 1, duration: 0.04 }, start);
				tl.to(packet.state, { travel: 1, duration: 0.34 }, start);
				tl.to(packet.state, { memory: 1, duration: 0.22 }, start + 0.34);
				tl.to(packet.state, { cache: 1, duration: 0.09 }, start + 0.56);
				tl.to(
					packet.state,
					{ register: 1, duration: 0.012, ease: 'power4.in' },
					start + 0.65
				);
				tl.to(packet.state, { opacity: 0.42, scale: 0.6, duration: 0.06 }, start + 0.662);
			});
			// Hold on the register file so the final glow is readable.
			tl.to({ pad: 0 }, { pad: 1, duration: 0.148 }, 0.852);

			tl.eventCallback('onUpdate', () => {
				needsRender = true;
			});

			timeline = tl;

			// Gallery: the study owns a tall scroll track (top top → bottom bottom).
			// Lesson frame: that same timeline is scrubbed across the element itself
			// (top bottom → bottom top), so the reader's scroll wheel drives it.
			const trigger = ScrollTrigger.create({
				trigger: sectionEl,
				start: embeddedMode ? 'top bottom' : 'top top',
				end: embeddedMode ? 'bottom top' : 'bottom bottom',
				scrub: embeddedMode ? 1.5 : 1.4,
				animation: tl,
				invalidateOnRefresh: true,
				onUpdate: (self: { progress: number }) => {
					if (sectionEl) sectionEl.dataset.scrub = self.progress.toFixed(3);
					needsRender = true;
				}
			});

			scrollTrigger = trigger;
			refreshScroll = () => ScrollTrigger.refresh();
			updateScene(0);
			needsRender = true;
			requestAnimationFrame(() => {
				if (!disposed) ScrollTrigger.refresh();
			});
		};

		const initialise = async () => {
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

				motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
				reducedMotion = motionQuery.matches;

				const width = canvasHost.clientWidth || window.innerWidth;
				const height = canvasHost.clientHeight || window.innerHeight;

				try {
					// MSAA only below 2x DPR: at 2x the pixel density already hides
					// edge stair-stepping and 4x MSAA would quadruple fill cost.
					renderer = new THREE.WebGLRenderer({
						antialias: (window.devicePixelRatio || 1) < 2,
						stencil: false,
						alpha: true,
						powerPreference: 'high-performance'
					});
				} catch {
					throw new Error('WebGL could not be created.');
				}

				renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
				renderer.setSize(width, height, false);
				renderer.setClearColor(0x000000, 0);
				renderer.outputColorSpace = THREE.SRGBColorSpace;
				renderer.toneMapping = THREE.ACESFilmicToneMapping;
				renderer.toneMappingExposure = 1.16;
				renderer.shadowMap.enabled = true;
				renderer.shadowMap.type = THREE.PCFShadowMap;
				renderer.domElement.className = 'memory__webgl';
				renderer.domElement.setAttribute('aria-hidden', 'true');
				// eslint-disable-next-line svelte/no-dom-manipulating -- the WebGL canvas is owned by three.js, not the Svelte tree
				canvasHost.appendChild(renderer.domElement);

				scene = new THREE.Scene();
				camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 100);
				cameraTarget = new THREE.Vector3();
				updateCameraLayout(width / height);
				updateCamera(0);

				loadPercent = 12;

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
					console.warn('[MemoryHierarchy3D] HDRI environment failed to load.', environmentError);
				} finally {
					pmrem.dispose();
				}

				if (disposed) return;
				loadPercent = 24;

				// Key: low and from the right so it rakes along the PCB, picking the
				// copper bundles and via fields out of the solder mask with long shadows.
				keyLight = new THREE.DirectionalLight(0xffecd6, 4.1);
				keyLight.position.set(7.4, 4.3, 3.4);
				keyLight.castShadow = true;
				keyLight.shadow.mapSize.set(2048, 2048);
				keyLight.shadow.camera.near = 0.5;
				keyLight.shadow.camera.far = 34;
				keyLight.shadow.camera.left = -6.6;
				keyLight.shadow.camera.right = 6.6;
				keyLight.shadow.camera.top = 6.8;
				keyLight.shadow.camera.bottom = -6.4;
				keyLight.shadow.bias = -0.0004;
				keyLight.shadow.normalBias = 0.032;
				keyLight.shadow.radius = 3;
				scene.add(keyLight);

				// Fill: kept cool and weak so shadow sides stay deep.
				const fill = new THREE.DirectionalLight(0x7f9eff, 0.95);
				fill.position.set(-6, 3.5, 4);
				scene.add(fill);

				// Rim: grazing from behind-left, a thin teal edge on the board lip,
				// DIMM spreaders and the heatsink.
				const rim = new THREE.DirectionalLight(0x7fd8d0, 3.2);
				rim.position.set(-5.2, 2.3, -6.6);
				scene.add(rim);

				const hemi = new THREE.HemisphereLight(0xf0eee6, 0x87867f, 0.5);
				scene.add(hemi);

				const ground = new THREE.Mesh(
					new THREE.PlaneGeometry(40, 40),
					new THREE.ShadowMaterial({ color: 0x1f1e1d, opacity: 0.22 })
				);
				ground.rotation.x = -Math.PI / 2;
				ground.position.y = -0.17;
				ground.receiveShadow = true;
				scene.add(ground);

				const ringMaterial = new THREE.MeshBasicMaterial({
					color: 0x87867f,
					transparent: true,
					opacity: 0.45,
					depthWrite: false,
					side: THREE.DoubleSide
				});
				for (const [inner, outer] of [
					[5.0, 5.006],
					[5.72, 5.726]
				]) {
					const ring = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 160), ringMaterial);
					ring.rotation.x = -Math.PI / 2;
					ring.position.y = -0.168;
					scene.add(ring);
				}

				const draco = new dracoModule.DRACOLoader();
				draco.setDecoderPath(decoderPath('draco/draco_decoder.js'));
				dracoLoader = draco;

				const ktx2 = new ktx2Module.KTX2Loader();
				ktx2.setTranscoderPath(decoderPath('basis/basis_transcoder.js'));
				ktx2.detectSupport(renderer);
				ktx2Loader = ktx2;

				const loader = new gltfModule.GLTFLoader();
				loader.setDRACOLoader(draco);
				loader.setKTX2Loader(ktx2);

				const gltf = await loader.loadAsync(url('models/memory-hierarchy.glb'), (event) => {
					if (event.total > 0) {
						const value = 28 + (event.loaded / event.total) * 64;
						loadPercent = Math.max(loadPercent, Math.min(94, Math.round(value)));
					}
				});

				if (disposed) return;
				draco.dispose();
				ktx2.dispose();
				dracoLoader = null;
				ktx2Loader = null;
				loadPercent = 96;

				const required = [
					'motherboard',
					'cpu',
					'cpu-cache',
					'cpu-registers',
					'ram-0',
					'ram-1',
					'ssd',
					'hdd',
					'bus'
				];
				for (const name of required) {
					if (!gltf.scene.getObjectByName(name)) {
						throw new Error(`Model is missing the "${name}" memory-hierarchy part.`);
					}
				}

				// three.js only reads material.envMapIntensity when the material owns an
				// envMap (otherwise it substitutes scene.environmentIntensity), so share the
				// scene's PMREM texture with every PBR material, then set per-material values.
				const sharedEnv = scene.environment;
				const maxAnisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
// eslint-disable-next-line svelte/prefer-svelte-reactivity -- plain bookkeeping of three.js objects, never rendered
				const tuned = new Set<Three.Material>();
				gltf.scene.traverse((object) => {
					const mesh = object as Three.Mesh;
					if (!mesh.isMesh) return;
					mesh.castShadow = true;
					mesh.receiveShadow = true;
					const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
					for (const material of materials) {
						const pbr = material as Three.MeshStandardMaterial;
						if (!pbr.isMeshStandardMaterial) continue;
						if (!tuned.has(pbr)) {
							tuned.add(pbr);
							pbr.envMap = sharedEnv;
							pbr.envMapIntensity = 0.9;
							tuneMaterial(pbr);
							pbr.needsUpdate = true;
						}
						for (const map of [
							pbr.map,
							pbr.normalMap,
							pbr.roughnessMap,
							pbr.metalnessMap,
							pbr.aoMap,
							pbr.emissiveMap
						]) {
							if (map) {
								map.anisotropy = maxAnisotropy;
								map.needsUpdate = true;
							}
						}
					}
				});

				const collectMaterials = (name: string) => {
					const found: Three.MeshStandardMaterial[] = [];
					gltf.scene.traverse((object) => {
						const mesh = object as Three.Mesh;
						if (!mesh.isMesh) return;
						const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
						for (const material of materials) {
							if (material.name === name && !found.includes(material as Three.MeshStandardMaterial)) {
								found.push(material as Three.MeshStandardMaterial);
							}
						}
					});
					return found;
				};
				busMaterials = collectMaterials('Data bus');
				cacheMaterials = collectMaterials('L3 cache');
				registerMaterials = collectMaterials('Register file');

				modelRoot = new THREE.Group();
				modelRoot.name = 'memory-hierarchy-model';
				modelRoot.rotation.y = -0.07;
				modelRoot.add(gltf.scene);
				scene.add(modelRoot);

				const flow = readFlow(gltf.scene);
				travelCurve = buildCurve(flow, 'hddToRam');
				memoryCurve = buildCurve(flow, 'ramToCache');
				cacheCurve = buildCurve(flow, 'cacheLoop');
				registerCurve = buildCurve(flow, 'cacheToRegisters');

				createPackets();

				onMotionChange = (event) => {
					if (disposed) return;
					reducedMotion = event.matches;
					configureMotion();
					needsRender = true;
				};
				motionQuery.addEventListener('change', onMotionChange);

				configureMotion();
				updateScene(currentProgress());
				bloom = await createBloom(THREE, renderer, scene, camera);
				if (disposed) {
					bloom?.dispose();
					bloom = null;
					return;
				}
				if (bloom) bloom.render();
				else renderer.render(scene, camera);
				needsRender = false;
				loadPercent = 100;
				ready = true;
				loading = false;

				parallax = createParallax(sectionEl, { strength: 0.5 });
				renderer.setAnimationLoop(() => {
					if (disposed || !renderer || !scene || !camera) return;
					if (!isVisible) return;
					if (parallax?.step()) needsRender = true;
					if (!needsRender) return;
					const p = currentProgress();
					updateScene(p);
					syncHud(p);
					parallax?.apply(camera);
					if (bloom) bloom.render();
					else renderer.render(scene, camera);
					parallax?.restore(camera);
					needsRender = false;
				});

				resizeObserver = new ResizeObserver(() => {
					if (!renderer || !camera || !canvasHost) return;
					const nextWidth = canvasHost.clientWidth;
					const nextHeight = canvasHost.clientHeight;
					if (!nextWidth || !nextHeight) return;
					renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
					renderer.setSize(nextWidth, nextHeight, false);
					bloom?.setSize(nextWidth, nextHeight);
					camera.aspect = nextWidth / nextHeight;
					camera.updateProjectionMatrix();
					updateCameraLayout(camera.aspect);
					updateScene(currentProgress());
					needsRender = true;
					window.clearTimeout(refreshTimer);
					refreshTimer = window.setTimeout(() => refreshScroll?.(), 160);
				});
				resizeObserver.observe(canvasHost);

				intersectionObserver = new IntersectionObserver(
					(entries) => {
						isVisible = entries[0]?.isIntersecting ?? false;
						if (isVisible) needsRender = true;
					},
					{ rootMargin: '220px 0px', threshold: 0.01 }
				);
				intersectionObserver.observe(sectionEl);

				requestAnimationFrame(() => {
					if (!disposed) refreshScroll?.();
				});
			} catch (cause) {
				console.error('[MemoryHierarchy3D]', cause);
				if (!disposed) {
					loading = false;
					ready = false;
					error =
						'This browser could not load the interactive 3D model. The written description below covers the same memory hierarchy.';
				}
			}
		};

		void initialise();

		return () => {
			disposed = true;
			parallax?.destroy();
			window.clearTimeout(refreshTimer);
			if (motionQuery && onMotionChange) {
				motionQuery.removeEventListener('change', onMotionChange);
			}
			destroyTimeline();
			resizeObserver?.disconnect();
			intersectionObserver?.disconnect();
			dracoLoader?.dispose();
			ktx2Loader?.dispose();
			for (const packet of packets) {
				packet.material.dispose();
				packet.trailMaterial.dispose();
				packet.coreMaterial.dispose();
			}
			coreGeometry?.dispose();
			glowTexture?.dispose();
			if (renderer) {
				renderer.setAnimationLoop(null);
				bloom?.dispose();
				bloom = null;
				renderer.forceContextLoss();
				renderer.dispose();
				renderer.domElement.remove();
			}
			if (modelRoot) disposeObject3D(modelRoot, [environmentTexture]);
			environmentTexture?.dispose();
			keyLight?.shadow.map?.dispose();
			scene = null;
			camera = null;
			renderer = null;
		};
	});
</script>

<section
	bind:this={sectionEl}
	class="memory {className}"
	class:is-embedded={embeddedMode}
	class:is-ready={ready}
	style={`--p:${progress.toFixed(4)};--cue-opacity:${Math.max(0, 1 - progress * 2.4).toFixed(3)}`}
	data-reduced-motion={reducedMotion}
	aria-labelledby={embeddedMode ? undefined : headingId}
	aria-label={embeddedMode ? title : undefined}
	aria-describedby={summaryId}
>
	<div class="memory__stage" aria-busy={loading}>
		<div class="memory__canvas" bind:this={canvasHost}></div>
		<div class="memory__vignette" aria-hidden="true"></div>
		<div class="memory__grain" aria-hidden="true"></div>

		{#if !embeddedMode}
			<div class="memory__intro">
				<p class="memory__eyebrow">
					<span class="memory__dot" aria-hidden="true"></span>
					{eyebrow}
				</p>
				<h2 id={headingId}>{title}</h2>
				<p class="memory__lede">{subtitle}</p>
				{#if reducedMotion}
					<p class="memory__static-note">Reduced motion · static register view</p>
				{:else}
					<div class="memory__scroll-cue">
						<span class="memory__scroll-rule" aria-hidden="true"></span>
						<span>{scrollLabel}</span>
					</div>
				{/if}
			</div>
		{/if}

		<div class="memory__meta" aria-hidden="true">
			<span>SP—02</span>
			<span>DDR5</span>
			<span>4 LEVELS</span>
		</div>

		<div class="memory__levels">
			<p class="memory__levels-caption" aria-hidden="true">Latency / log scale</p>
			<ol aria-label="Memory hierarchy, slowest to fastest">
				{#each levels as level, index (level.index)}
					<li
						class:is-active={index === activeLevel}
						class:is-past={index < activeLevel}
						aria-current={index === activeLevel ? 'step' : undefined}
					>
						<span class="memory__level-index">{level.index}</span>
						<span class="memory__level-name">{level.label}</span>
						<span class="memory__level-detail">{level.detail}</span>
						<span class="memory__level-latency">{level.latency}</span>
						<span class="memory__level-bar" aria-hidden="true">
							<i style={`--w:${level.bar}%`}></i>
						</span>
					</li>
				{/each}
			</ol>
		</div>

		<div class="memory__readout" aria-hidden="true">
			<span class="memory__phase">{phaseLabel}</span>
			<span class="memory__track"><i></i></span>
			<span class="memory__count">{percentLabel}<em> / 100</em></span>
		</div>


		<p class="memory__sr" aria-live="polite">{announcement}</p>

		{#if loading}
			<div class="memory__loader" role="status" aria-live="polite">
				<div class="memory__loader-mark" aria-hidden="true">
					<span></span><span></span><span></span><span></span>
				</div>
				<p>Routing the memory bus</p>
				<div class="memory__loader-track" aria-hidden="true">
					<i style={`width:${loadPercent}%`}></i>
				</div>
				<span class="memory__loader-value" aria-hidden="true">{loadPercent}%</span>
			</div>
		{/if}

		{#if error}
			<div class="memory__error" role="alert">
				<p class="memory__error-title">3D view unavailable</p>
				<p>{error}</p>
			</div>
		{/if}

		<noscript>
			<p class="memory__no-script">
				JavaScript is needed for the interactive 3D view. The description below covers the memory
				hierarchy.
			</p>
		</noscript>
	</div>

	<p id={summaryId} class="memory__sr">
		A four-level memory hierarchy on a stylised motherboard: a 3.5-inch hard drive, two DDR5 DIMMs, an
		L3 cache ring on the processor die, and the register file at its centre. Glowing data packets
		travel from storage to memory, memory to cache, and finally snap into the registers.
	</p>

	<div class="memory__description">
		<details>
			<summary>Text description: the memory hierarchy</summary>
			<p>
				The interactive model is a stylised motherboard. A hard drive sits at the front left, an M.2
				SSD along the front edge, two DDR5 DIMMs on the right, and a processor package at the centre
				left. A thin copper bus links them in a single path.
			</p>
			<p>
				Scroll to move three glowing packets along the bus. They linger on the slow storage leg,
				accelerate across the memory bus, orbit the cache ring on the die, then snap to the centre of
				the processor. The lag between each stop is the point: every level trades capacity for
				latency.
			</p>
			<ol>
				{#each levels as level (level.index)}
					<li>
						<strong>{level.index} · {level.label} ({level.latency})</strong>
						<span>{level.description}</span>
					</li>
				{/each}
			</ol>
			<p>Four levels, from milliseconds to a fraction of a nanosecond: seven orders of magnitude.</p>
		</details>
	</div>
</section>

<style>
	.memory {
		/* Contrast on var(--rubin-ivory): ink 16:1, muted 8.1:1, faint 6.6:1 (all >= WCAG AA 4.5:1) */
		--ink: var(--rubin-slate);
		--muted: var(--rubin-muted);
		--faint: var(--rubin-muted);
		--mono: var(--font-mono);
		--line: rgba(138, 130, 116, 0.42);
		--line-strong: rgba(217, 119, 87, 0.7);
		--line-cool: rgba(43, 130, 114, 0.55);
		--accent: var(--rubin-clay-ink);
		--cool: var(--rubin-teal-ink);
		position: relative;
		height: 305svh;
		min-height: 1500px;
		background: var(--rubin-ivory);
		color: var(--ink);
		font-family:
			'Inter', -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', 'Segoe UI',
			sans-serif;
		font-feature-settings:
			'cv11' 1,
			'ss03' 1;
		-webkit-font-smoothing: antialiased;
		-moz-osx-font-smoothing: grayscale;
		text-rendering: optimizeLegibility;
		isolation: isolate;
	}

	.memory *,
	.memory *::before,
	.memory *::after {
		box-sizing: border-box;
	}

	.memory__stage {
		position: sticky;
		top: 0;
		height: 100svh;
		min-height: 520px;
		overflow: hidden;
		background:
			radial-gradient(90% 72% at 54% 43%, color-mix(in srgb, var(--rubin-ivory) 20%, transparent), transparent 66%),
			radial-gradient(46% 46% at 50% 50%, var(--rubin-ivory) 0%, var(--rubin-ivory) 76%);
	}

	.memory__stage::before {
		content: '';
		position: absolute;
		inset: 0;
		z-index: 2;
		pointer-events: none;
		background:
			linear-gradient(180deg, color-mix(in srgb, var(--rubin-ivory) 80%, transparent) 0%, transparent 29%, transparent 74%, color-mix(in srgb, var(--rubin-ivory) 70%, transparent) 100%),
			linear-gradient(90deg, color-mix(in srgb, var(--rubin-ivory) 55%, transparent) 0%, transparent 36%);
	}

	.memory__canvas {
		position: absolute;
		inset: 0;
		z-index: 1;
	}

	.memory__canvas :global(canvas) {
		display: block;
		width: 100%;
		height: 100%;
		opacity: 0;
		transition: opacity 1.2s ease;
	}

	.memory.is-ready .memory__canvas :global(canvas) {
		opacity: 1;
	}

	.memory__vignette {
		position: absolute;
		inset: 0;
		z-index: 2;
		pointer-events: none;
		box-shadow: inset 0 0 150px 30px color-mix(in srgb, var(--rubin-ivory) 82%, transparent);
	}

	.memory__grain {
		position: absolute;
		inset: 0;
		z-index: 3;
		pointer-events: none;
		opacity: 0.055;
		mix-blend-mode: soft-light;
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.86' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.5'/%3E%3C/svg%3E");
		background-size: 160px 160px;
	}

	.memory__intro {
		position: absolute;
		top: clamp(1.6rem, 7vh, 5.6rem);
		left: clamp(1.25rem, 5vw, 5rem);
		z-index: 4;
		width: min(27rem, 38vw);
		pointer-events: none;
	}

	.memory__eyebrow {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		margin: 0 0 1.4rem;
		color: var(--muted);
		font-family: var(--mono);
		font-size: 0.66rem;
		font-weight: 500;
		letter-spacing: 0.14em;
		line-height: 1.5;
		text-transform: uppercase;
	}

	.memory__dot {
		width: 5px;
		height: 5px;
		flex: 0 0 auto;
		border-radius: 0;
		background: var(--cool);
	}

	.memory__intro h2 {
		max-width: 12ch;
		margin: 0;
		color: var(--rubin-slate);
		background: linear-gradient(180deg, var(--rubin-slate) 20%, var(--rubin-muted) 118%);
		-webkit-background-clip: text;
		background-clip: text;
		-webkit-text-fill-color: transparent;
		font-size: clamp(2.6rem, 4.3vw, 4.8rem);
		font-weight: 500;
		letter-spacing: -0.045em;
		line-height: 0.98;
		text-wrap: balance;
	}

	.memory__lede {
		max-width: 24rem;
		margin: 1.5rem 0 0;
		color: var(--muted);
		font-size: 0.94rem;
		font-weight: 400;
		letter-spacing: -0.011em;
		line-height: 1.6;
		text-wrap: pretty;
	}

	.memory__scroll-cue {
		display: flex;
		align-items: center;
		gap: 0.8rem;
		margin-top: 2.4rem;
		color: var(--faint);
		font-family: var(--mono);
		font-size: 0.64rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		opacity: var(--cue-opacity);
	}

	.memory__scroll-rule {
		position: relative;
		display: block;
		width: 1px;
		height: 2.3rem;
		overflow: hidden;
		background: var(--line);
	}

	.memory__scroll-rule::after {
		content: '';
		position: absolute;
		inset: 0;
		background: var(--cool);
		transform-origin: top;
		animation: memory-cue 2.6s cubic-bezier(0.65, 0, 0.35, 1) infinite;
	}

	.memory__static-note {
		margin-top: 1.7rem;
		color: var(--cool);
		font-family: var(--mono);
		font-size: 0.64rem;
		letter-spacing: 0.12em;
		line-height: 1.6;
		text-transform: uppercase;
	}

	.memory__meta {
		position: absolute;
		top: clamp(1.7rem, 7vh, 5.7rem);
		right: clamp(1.25rem, 4vw, 4.5rem);
		z-index: 4;
		display: flex;
		gap: 1.25rem;
		color: var(--faint);
		font-family: var(--mono);
		font-size: 0.64rem;
		letter-spacing: 0.12em;
		line-height: 1;
	}

	.memory__levels {
		position: absolute;
		top: 50%;
		right: clamp(1.15rem, 4vw, 4.5rem);
		z-index: 4;
		width: min(17.5rem, 25vw);
		transform: translateY(-50%);
		pointer-events: none;
	}

	.memory__levels-caption {
		margin: 0 0 0.55rem 2.1rem;
		color: var(--faint);
		font-family: var(--mono);
		font-size: 0.62rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.memory__levels ol {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.memory__levels li {
		display: grid;
		grid-template-areas:
			'index name latency'
			'. detail detail'
			'. bar bar';
		grid-template-columns: 1.9rem 1fr auto;
		padding: 0.62rem 0 0.58rem;
		border-top: 1px solid var(--line);
		color: var(--faint);
		transition: border-color 0.55s ease;
	}

	.memory__levels li:last-child {
		border-bottom: 1px solid var(--line);
	}

	.memory__levels li.is-active {
		border-top-color: var(--line-cool);
	}

	.memory__level-index {
		grid-area: index;
		padding-top: 0.08rem;
		color: var(--faint);
		font-family: var(--mono);
		font-size: 0.64rem;
		font-variant-numeric: tabular-nums;
		letter-spacing: 0.06em;
		transition: color 0.55s ease;
	}

	.memory__levels li.is-active .memory__level-index {
		color: var(--cool);
	}

	.memory__level-name {
		grid-area: name;
		color: var(--muted);
		font-size: 0.84rem;
		font-weight: 500;
		letter-spacing: -0.012em;
		line-height: 1.35;
		transition: color 0.55s ease;
	}

	.memory__levels li.is-past .memory__level-name {
		color: var(--rubin-dark-gray);
	}

	.memory__levels li.is-active .memory__level-name {
		color: var(--ink);
	}

	.memory__level-detail {
		grid-area: detail;
		margin-top: 0.16rem;
		color: var(--faint);
		font-family: var(--mono);
		font-size: 0.6rem;
		letter-spacing: 0.1em;
		line-height: 1.45;
		text-transform: uppercase;
	}

	.memory__level-latency {
		grid-area: latency;
		padding-top: 0.05rem;
		color: var(--faint);
		font-family: var(--mono);
		font-size: 0.66rem;
		font-variant-numeric: tabular-nums;
		letter-spacing: 0;
		text-align: right;
		white-space: nowrap;
		transition: color 0.55s ease;
	}

	.memory__levels li.is-past .memory__level-latency {
		color: var(--muted);
	}

	.memory__levels li.is-active .memory__level-latency {
		color: var(--accent);
	}

	.memory__level-bar {
		grid-area: bar;
		display: block;
		height: 1px;
		margin-top: 0.42rem;
		background: rgba(138, 130, 116, 0.3);
	}

	.memory__level-bar i {
		display: block;
		width: var(--w);
		height: 100%;
		background: linear-gradient(90deg, rgba(43, 130, 114, 0.15), rgba(43, 130, 114, 0.7));
		opacity: 0.45;
		transform: scaleX(0.2);
		transform-origin: left center;
		transition:
			transform 0.6s ease,
			opacity 0.55s ease;
	}

	.memory__levels li.is-past .memory__level-bar i,
	.memory__levels li.is-active .memory__level-bar i {
		opacity: 1;
		transform: scaleX(1);
	}

	.memory__levels li.is-active .memory__level-bar i {
		background: linear-gradient(90deg, rgba(217, 119, 87, 0.2), rgba(217, 119, 87, 0.85));
	}

	.memory__readout {
		position: absolute;
		right: clamp(1.25rem, 4vw, 4.5rem);
		bottom: clamp(1rem, 3.3vh, 2.1rem);
		left: clamp(1.25rem, 5vw, 5rem);
		z-index: 4;
		display: grid;
		grid-template-columns: auto minmax(2rem, 1fr) auto;
		align-items: center;
		gap: 1rem;
		pointer-events: none;
	}

	.memory__phase {
		color: var(--faint);
		font-family: var(--mono);
		font-size: 0.64rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.memory__track {
		position: relative;
		display: block;
		height: 1px;
		overflow: hidden;
		background: var(--line);
	}

	.memory__track i {
		position: absolute;
		inset: 0;
		display: block;
		background: linear-gradient(90deg, rgba(43, 130, 114, 0.45), var(--cool));
		transform: scaleX(var(--p));
		transform-origin: left center;
	}

	.memory__count {
		color: var(--muted);
		font-family: var(--mono);
		font-size: 0.68rem;
		font-variant-numeric: tabular-nums;
		letter-spacing: 0.06em;
	}

	.memory__count em {
		color: var(--faint);
		font-style: normal;
	}

	.memory__sr {
		position: absolute !important;
		width: 1px !important;
		height: 1px !important;
		padding: 0 !important;
		margin: -1px !important;
		overflow: hidden !important;
		clip: rect(0, 0, 0, 0) !important;
		white-space: nowrap !important;
		border: 0 !important;
	}

	.memory__description {
		position: absolute !important;
		width: 1px !important;
		height: 1px !important;
		padding: 0 !important;
		margin: -1px !important;
		overflow: hidden !important;
		clip: rect(0, 0, 0, 0) !important;
		white-space: nowrap !important;
		border: 0 !important;
	}

	.memory__description:focus-within {
		position: fixed !important;
		right: 1rem !important;
		bottom: 1rem !important;
		left: 1rem !important;
		z-index: 50 !important;
		width: auto !important;
		height: auto !important;
		max-height: min(66vh, 34rem) !important;
		padding: 1rem 1.2rem !important;
		margin: 0 !important;
		overflow: auto !important;
		clip: auto !important;
		white-space: normal !important;
		background: var(--rubin-ivory);
		border: 1px solid var(--line);
	}

	.memory__description summary {
		cursor: pointer;
		color: var(--ink);
		font-family: var(--mono);
		font-size: 0.68rem;
		letter-spacing: 0.1em;
		line-height: 1.5;
		text-transform: uppercase;
	}

	.memory__description p,
	.memory__description li {
		color: var(--muted);
		font-size: 0.78rem;
		line-height: 1.65;
	}

	.memory__description ol {
		padding-left: 1.1rem;
	}

	.memory__description li {
		margin: 0.55rem 0;
	}

	.memory__description strong {
		color: var(--ink);
		font-weight: 500;
	}

	.memory__description li span {
		display: block;
		margin-top: 0.1rem;
	}

	.memory__loader {
		position: absolute;
		inset: 0;
		z-index: 8;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1.1rem;
		background:
			radial-gradient(40% 40% at 50% 50%, color-mix(in srgb, var(--rubin-ivory) 70%, transparent), transparent 75%),
			var(--rubin-ivory);
		color: var(--muted);
		font-family: var(--mono);
		font-size: 0.66rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	.memory__loader p {
		margin: 0;
	}

	.memory__loader-mark {
		position: relative;
		display: grid;
		grid-template-columns: repeat(2, 10px);
		grid-template-rows: repeat(2, 10px);
		gap: 5px;
		transform: rotate(45deg);
	}

	.memory__loader-mark span {
		display: block;
		border: 1px solid rgba(217, 119, 87, 0.7);
		background: rgba(217, 119, 87, 0.08);
	}

	.memory__loader-mark span:nth-child(2),
	.memory__loader-mark span:nth-child(3) {
		background: rgba(43, 130, 114, 0.15);
	}

	.memory__loader-track {
		position: relative;
		width: 10rem;
		height: 1px;
		overflow: hidden;
		background: var(--line);
	}

	.memory__loader-track i {
		display: block;
		height: 100%;
		background: var(--cool);
		transition: width 0.4s ease;
	}

	.memory__loader-value {
		color: var(--faint);
		font-size: 0.62rem;
		letter-spacing: 0.08em;
	}

	.memory__error {
		position: absolute;
		bottom: clamp(4.2rem, 11vh, 7rem);
		left: clamp(1.25rem, 5vw, 5rem);
		z-index: 8;
		width: min(28rem, calc(100vw - 2.5rem));
		padding: 1.2rem 1.35rem;
		border: 1px solid var(--line);
		background: color-mix(in srgb, var(--rubin-ivory) 86%, transparent);
		backdrop-filter: blur(12px);
	}

	.memory__error p {
		margin: 0;
		color: var(--muted);
		font-size: 0.76rem;
		line-height: 1.65;
	}

	.memory__error .memory__error-title {
		margin-bottom: 0.45rem;
		color: var(--ink);
		font-family: var(--mono);
		font-size: 0.66rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.memory__no-script {
		position: absolute;
		right: 1.25rem;
		bottom: 4.4rem;
		left: 1.25rem;
		z-index: 8;
		margin: 0;
		color: var(--muted);
		font-size: 0.75rem;
	}

	@keyframes memory-cue {
		0% {
			transform: scaleY(0);
			transform-origin: top;
		}
		45% {
			transform: scaleY(1);
			transform-origin: top;
		}
		55% {
			transform: scaleY(1);
			transform-origin: bottom;
		}
		100% {
			transform: scaleY(0);
			transform-origin: bottom;
		}
	}

	@media (max-width: 1024px) {
		.memory__intro {
			width: min(24rem, 46vw);
		}

		.memory__intro h2 {
			font-size: clamp(2.3rem, 5.4vw, 3.5rem);
		}

		.memory__levels {
			width: 12.5rem;
		}

		.memory__levels-caption {
			display: none;
		}

		.memory__level-detail {
			display: none;
		}

		.memory__levels li {
			grid-template-areas:
				'index name latency'
				'. bar bar';
		}
	}

	@media (max-width: 740px) {
		.memory {
			height: 275svh;
			min-height: 1300px;
		}

		.memory__stage {
			min-height: 540px;
		}

		.memory__intro {
			top: 4.6rem;
			right: 1.25rem;
			left: 1.25rem;
			width: auto;
		}

		.memory__eyebrow {
			margin-bottom: 0.9rem;
			font-size: 0.62rem;
			letter-spacing: 0.12em;
		}

		.memory__intro h2 {
			max-width: 11ch;
			font-size: clamp(2.2rem, 9.6vw, 3.2rem);
		}

		.memory__lede {
			max-width: 19rem;
			margin-top: 0.9rem;
			font-size: 0.86rem;
			line-height: 1.5;
		}

		.memory__scroll-cue {
			margin-top: 1.25rem;
		}

		.memory__meta {
			display: none;
		}

		.memory__levels {
			top: auto;
			right: 1.25rem;
			bottom: 4.1rem;
			left: 1.25rem;
			width: auto;
			transform: none;
		}

		.memory__levels ol {
			display: flex;
			gap: 0.28rem;
		}

		.memory__levels li {
			display: block;
			flex: 1;
			min-width: 0;
			padding: 0.48rem 0 0;
			border-top: 1px solid var(--line);
			border-bottom: 0;
		}

		.memory__levels li:last-child {
			border-bottom: 0;
		}

		.memory__level-index,
		.memory__level-detail,
		.memory__level-bar {
			display: none;
		}

		.memory__level-name {
			display: block;
			overflow: hidden;
			color: var(--muted);
			font-size: 0.62rem;
			letter-spacing: -0.005em;
			line-height: 1.25;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		.memory__level-latency {
			display: block;
			padding-top: 0.14rem;
			font-size: 0.56rem;
			letter-spacing: 0;
			text-align: left;
		}

		.memory__readout {
			bottom: 1rem;
			grid-template-columns: auto minmax(1rem, 1fr) auto;
			gap: 0.65rem;
		}

		.memory__phase {
			font-size: 0.58rem;
		}

		.memory__count {
			font-size: 0.6rem;
		}

		.memory__count em {
			display: none;
		}

		.memory__error {
			bottom: 6.4rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.memory {
			height: auto;
			min-height: 0;
		}

		.memory__stage {
			position: relative;
			height: min(88svh, 860px);
		}

		.memory__scroll-cue {
			display: none;
		}

		.memory__levels li,
		.memory__level-bar i {
			transition: none;
		}

		.memory__canvas :global(canvas) {
			transition: none;
		}

		.memory__scroll-rule::after {
			animation: none;
		}
	}

	/* Embedded (lesson) mode: a bounded frame that keeps the article's scroll. */
	.memory.is-embedded {
		height: 100%;
		min-height: 0;
		background: transparent;
	}

	.memory.is-embedded .memory__stage {
		position: relative;
		top: auto;
		height: 100%;
		min-height: 0;
		background: none;
	}

	/* Transparent frame: the model floats on the page, its shadow grounds it. */
	.memory.is-embedded .memory__stage::before,
	.memory.is-embedded .memory__vignette,
	.memory.is-embedded .memory__grain {
		display: none;
	}

	.memory.is-embedded .memory__intro {
		max-width: 68%;
		padding: 1rem 1.15rem;
	}

	.memory.is-embedded .memory__intro h2 {
		margin: 0;
		font-size: 1.35rem;
		line-height: 1.2;
	}

	.memory.is-embedded .memory__eyebrow,
	.memory.is-embedded .memory__lede,
	.memory.is-embedded .memory__scroll-cue,
	.memory.is-embedded .memory__meta,
	.memory.is-embedded .memory__levels,
	.memory.is-embedded .memory__levels-caption,
	.memory.is-embedded .memory__readout,
	.memory.is-embedded .memory__description {
		display: none;
	}



</style>
