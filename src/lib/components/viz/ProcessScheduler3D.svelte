<script lang="ts">
	import { getContext, onMount } from 'svelte';
	import { STUDY_FRAME, type StudyFrame } from './frame-mode';
	import { asset as resolveAsset } from '$app/paths';
	import type * as Three from 'three';
	import { createBloom, type Bloom } from '$lib/utils/bloom';
	import {
		ALGORITHM_META,
		EPS,
		FIXED_SCENARIO,
		QUANTUM,
		averageMetrics,
		cloneScenario,
		formatUnits,
		randomScenario,
		simulate,
		snapshotAt,
		type Algorithm,
		type ProcessResult,
		type ProcessSpec,
		type TimeRange
	} from '$lib/scheduler/simulation';

	type Props = {
		id?: string;
		class?: string;
		/** Set by the Gallery route explicitly; lessons set it through LazyStudy's context. */
		embedded?: boolean;
	};

	type Zone = 'run' | 'ready' | 'io' | 'done';

	type SchedulerController = {
		aim(x: number, y: number, enabled: boolean): void;
		clearPointer(): void;
		pick(x: number, y: number): void;
		seek(time: number, immediate: boolean): void;
		pause(): void;
		invalidate(): void;
	};

	let { id = 'process-scheduler', class: className = '', embedded = false }: Props = $props();

	const frame = getContext<StudyFrame | undefined>(STUDY_FRAME);
	const embeddedMode = $derived(embedded || frame?.embedded === true);

	const algorithmOrder: Algorithm[] = ['fcfs', 'sjf', 'rr'];
	const speeds = [0.5, 1, 2, 4];
	const UNITS_PER_SECOND = 1.8;

	let algorithm = $state<Algorithm>('fcfs');
	let scenario = $state<ProcessSpec[]>(cloneScenario(FIXED_SCENARIO));
	let playing = $state(false);
	let speed = $state(1);
	let clock = $state(0);
	let loading = $state(true);
	let ready = $state(false);
	let interactive = $state(false);
	let loadPercent = $state(0);
	let error = $state<string | null>(null);
	let reducedMotion = $state(false);
	let selectedId = $state<string | null>(null);
	let announcement = $state('Loading the scheduling model.');

	let sectionEl: HTMLElement | undefined;
	let stageEl: HTMLElement | undefined;
	let canvasHost: HTMLDivElement | undefined;

	const schedule = $derived.by(() => simulate(scenario, algorithm));
	const snapshot = $derived.by(() => snapshotAt(schedule, clock));
	const metrics = $derived.by(() => averageMetrics(schedule));
	const meta = $derived(ALGORITHM_META[algorithm]);
	const total = $derived(schedule.total);
	const percent = $derived(total > 0 ? Math.max(0, Math.min(1, clock / total)) : 0);
	const complete = $derived(total > 0 && clock >= total - 0.001);
	const headingId = $derived(`${id}-title`);
	const summaryId = $derived(`${id}-summary`);

	let controller: SchedulerController | null = null;

	function stateOf(pid: string): Zone {
		if (snapshot.running === pid) return 'run';
		if (snapshot.waiting.includes(pid)) return 'io';
		if (snapshot.done.includes(pid)) return 'done';
		return 'ready';
	}

	function stateLabel(state: Zone): string {
		return state === 'run' ? 'CPU' : state === 'io' ? 'I/O' : state === 'done' ? 'DONE' : 'READY';
	}

	function announce(message: string) {
		announcement = message;
	}

	function barStyle(range: TimeRange, color?: string): string {
		const span = total > 0 ? total : 1;
		const left = Math.max(0, (range.start / span) * 100);
		const width = Math.max(0.4, ((range.end - range.start) / span) * 100);
		const tint = color ? `;background:${color}` : '';
		return `left:${left}%;width:${width}%${tint}`;
	}

	function chooseAlgorithm(next: Algorithm) {
		if (next === algorithm) return;
		algorithm = next;
		playing = false;
		clock = 0;
		selectedId = null;
		controller?.seek(0, true);
		announce(`${ALGORITHM_META[next].label} selected. The schedule and clock were reset.`);
	}

	function togglePlay() {
		if (!interactive) return;
		if (playing) {
			playing = false;
			controller?.pause();
			announce(`Paused at time ${clock.toFixed(2)}.`);
			return;
		}
		if (complete) {
			clock = 0;
			controller?.seek(0, true);
		}
		playing = true;
		announce(`Running ${ALGORITHM_META[algorithm].label}.`);
	}

	function resetClock() {
		playing = false;
		clock = 0;
		selectedId = null;
		controller?.seek(0, true);
		announce('Clock reset. All processes are back at the start of the schedule.');
	}

	function newWorkload() {
		scenario = randomScenario();
		playing = false;
		clock = 0;
		selectedId = null;
		controller?.seek(0, true);
		announce('A new workload of five jobs was generated. The clock is reset.');
	}

	function seekTo(time: number, immediate = false) {
		clock = Math.max(0, Math.min(total, time));
		controller?.seek(clock, immediate);
	}

	function stepForward() {
		playing = false;
		controller?.pause();
		seekTo(Math.min(total, clock + 1));
	}

	function selectProcess(pid: string) {
		selectedId = selectedId === pid ? null : pid;
		controller?.invalidate();
		if (selectedId) {
			const process = schedule.processes.find((item: ProcessResult) => item.spec.id === selectedId);
			announce(
				`Process ${selectedId} selected. ${process?.spec.burst ?? 0} units of CPU work, ${
					process?.spec.ioAfter !== null ? 'one I/O block' : 'CPU only'
				}.`
			);
		} else {
			announce('Process focus cleared.');
		}
	}

	function handlePolicyKey(event: KeyboardEvent) {
		if (event.key === '1') chooseAlgorithm('fcfs');
		else if (event.key === '2') chooseAlgorithm('sjf');
		else if (event.key === '3') chooseAlgorithm('rr');
	}

	function handleGlobalKey(event: KeyboardEvent) {
		const target = event.target as HTMLElement | null;
		if (target?.closest('input, textarea, select, button, a, [contenteditable="true"]')) return;
		if (event.metaKey || event.ctrlKey || event.altKey) return;
		if (event.code === 'Space') {
			event.preventDefault();
			togglePlay();
		} else if (event.key === 'r' || event.key === 'R') {
			event.preventDefault();
			resetClock();
		} else {
			handlePolicyKey(event);
		}
	}

	function seekFromChart(event: MouseEvent) {
		const plot = (event.currentTarget as HTMLElement).getBoundingClientRect();
		if (plot.width <= 0) return;
		playing = false;
		const ratio = (event.clientX - plot.left) / plot.width;
		seekTo(ratio * total);
	}

	function timelineKey(event: KeyboardEvent) {
		if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
			event.preventDefault();
			playing = false;
			const delta = event.key === 'ArrowLeft' ? -0.5 : 0.5;
			seekTo(Math.max(0, Math.min(total, clock + delta)));
		} else if (event.key === 'Home') {
			event.preventDefault();
			seekTo(0);
		} else if (event.key === 'End') {
			event.preventDefault();
			seekTo(total);
		}
	}

	function handlePointerMove(event: PointerEvent) {
		if (event.pointerType === 'touch') return;
		const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
		if (rect.width <= 0 || rect.height <= 0) return;
		controller?.aim(
			((event.clientX - rect.left) / rect.width) * 2 - 1,
			((event.clientY - rect.top) / rect.height) * 2 - 1,
			true
		);
	}

	function clearPointer() {
		controller?.clearPointer();
	}

	function pickProcess(event: PointerEvent) {
		const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
		if (rect.width <= 0 || rect.height <= 0) return;
		controller?.pick(
			((event.clientX - rect.left) / rect.width) * 2 - 1,
			-(((event.clientY - rect.top) / rect.height) * 2 - 1)
		);
	}

	onMount(() => {
		let disposed = false;
		let renderer: Three.WebGLRenderer | null = null;
		let bloom: Bloom | null = null;
		let scene: Three.Scene | null = null;
		let camera: Three.PerspectiveCamera | null = null;
		let modelRoot: Three.Group | null = null;
		let environmentTexture: Three.Texture | null = null;
		let keyLight: Three.DirectionalLight | null = null;
		let dracoLoader: { dispose(): void } | null = null;
		let ktx2Loader: { dispose(): void } | null = null;
		let resizeObserver: ResizeObserver | null = null;
		let intersectionObserver: IntersectionObserver | null = null;
		let motionQuery: MediaQueryList | null = null;
		let onMotionChange: ((event: MediaQueryListEvent) => void) | null = null;
		let isVisible = false;
		let needsRender = true;
		let now = 0;
		let lastHud = 0;
		let pointerX = 0;
		let pointerY = 0;
		let pointerOn = false;
		let introDone = false;
		let immediateSeek = true;

		let THREE!: typeof import('three');
		let gsap!: typeof import('gsap').gsap;
		let tick: ((time: number, deltaTime: number) => void) | null = null;

		let cameraBase!: Three.Vector3;
		let cameraTarget!: Three.Vector3;
		let cameraDesired!: Three.Vector3;
		let raycaster!: Three.Raycaster;
		let pointerNdc!: Three.Vector2;

		type Rig = {
			index: number;
			id: string;
			group: Three.Group;
			node: Three.Object3D;
			meshes: Three.Mesh[];
			body: Three.MeshStandardMaterial | null;
			accent: Three.MeshStandardMaterial | null;
			bodyBase: number;
			accentBase: number;
			bodyEmissive: Three.Color;
			accentEmissive: Three.Color;
			glow: number;
			zone: Zone | null;
			slot: number;
			route: { kill(): void } | null;
			scale: number;
		};

		let rigs: Rig[] = [];
		let queueAnchors: Three.Vector3[] = [];
		let ioAnchors: Three.Vector3[] = [];
		let retiredAnchors: Three.Vector3[] = [];
		let returnAnchors: Three.Vector3[] = [];
		let entryAnchor!: Three.Vector3;
		let cpuAnchor!: Three.Vector3;
		let exitIoAnchor!: Three.Vector3;
		let exitDoneAnchor!: Three.Vector3;
		let ioExitAnchor!: Three.Vector3;
		let spawnAnchor!: Three.Vector3;
		let progressBar: Three.Object3D | null = null;
		let beltMaterial: Three.MeshStandardMaterial | null = null;
		let dispatchMaterial: Three.MeshStandardMaterial | null = null;
		let dispatchBase = 1;

		const anchor = (root: Three.Object3D, name: string): Three.Vector3 => {
			const object = root.getObjectByName(name);
			if (!object) throw new Error(`Model is missing the "${name}" anchor.`);
			return object.position.clone();
		};

		/* Per-state glow: tint mixed into each block's own emissive colour, plus an
		   intensity multiplier. Running blocks burn hottest inside the CPU. */
		const STATE_GLOW: Record<Zone, { color: number; mix: number; level: number }> = {
			ready: { color: 0x2b8272, mix: 0.5, level: 1.05 },
			io: { color: 0x5e7edf, mix: 0.6, level: 0.95 },
			run: { color: 0xd97757, mix: 0.62, level: 2.15 },
			done: { color: 0x647200, mix: 0.55, level: 0.5 }
		};
		/* Clean isometric overview: equal X/Z azimuth (45deg), ~33deg elevation. */
		const CAM_BASE = { x: 12.6, y: 9.2, z: 12.6 };
		const CAM_TARGET = { x: -0.9, y: 1.7, z: 0.2 };
		let glowColor!: Three.Color;
		let glowTarget!: Three.Color;

		const updateCameraLayout = (width: number, height: number) => {
			if (!camera) return;
			const aspect = Math.max(0.4, width / Math.max(1, height));
			const fit = Math.max(1, 1.22 / Math.max(aspect, 0.62));
			camera.aspect = aspect;
			camera.updateProjectionMatrix();
			cameraBase.set(CAM_BASE.x, CAM_BASE.y, CAM_BASE.z).multiplyScalar(fit);
			cameraTarget.set(CAM_TARGET.x, CAM_TARGET.y, CAM_TARGET.z);
			if (introDone) {
				camera.position.copy(cameraBase);
				camera.lookAt(cameraTarget);
				needsRender = true;
			}
		};

		const setCam = () => {
			if (!camera) return;
			camera.position.copy(cameraBase);
			camera.lookAt(cameraTarget);
		};

		const localAnchor = (rig: Rig, zone: Zone, slot: number): Three.Vector3 => {
			if (zone === 'run') return cpuAnchor;
			if (zone === 'io') return ioAnchors[Math.min(slot, ioAnchors.length - 1)] ?? ioAnchors[0]!;
			if (zone === 'done')
				return retiredAnchors[Math.min(slot, retiredAnchors.length - 1)] ?? retiredAnchors[0]!;
			return queueAnchors[Math.min(slot, queueAnchors.length - 1)] ?? queueAnchors[0]!;
		};

		const killRoute = (rig: Rig) => {
			rig.route?.kill();
			rig.route = null;
		};

		const snapTo = (rig: Rig, target: Three.Vector3) => {
			killRoute(rig);
			rig.group.position.set(target.x, target.y, target.z);
			rig.node.position.set(0, 0, 0);
			needsRender = true;
		};

		const flyThrough = (rig: Rig, points: Three.Vector3[], duration: number) => {
			killRoute(rig);
			if (points.length === 0) return;
			const tl = gsap.timeline({
				onUpdate: () => {
					needsRender = true;
				},
				onComplete: () => {
					if (rig.route === tl) rig.route = null;
				}
			});
			const slice = Math.max(0.1, duration / points.length);
			const last = points.length - 1;
			points.forEach((point, index) => {
				/* Weighty: accelerate hard out of the slot, glide through waypoints,
				   and land with a short settle on the final leg. */
				const landing = index === last;
				tl.to(rig.group.position, {
					x: point.x,
					y: point.y,
					z: point.z,
					duration: landing ? slice * 1.05 : slice,
					ease: landing
						? points.length === 1 || reducedMotion
							? 'power3.out'
							: 'back.out(1.35)'
						: index === 0
							? 'power3.in'
							: 'power2.inOut'
				});
			});
			rig.route = tl;
		};

		const routeFor = (rig: Rig, zone: Zone, slot: number, immediate: boolean) => {
			const target = localAnchor(rig, zone, slot);
			if (immediate) {
				snapTo(rig, target);
				return;
			}
			if (!introDone) {
				snapTo(rig, target);
				return;
			}

			const factor = Math.max(0.4, 1 / Math.sqrt(speed));
			const previous = rig.zone;
			let points: Three.Vector3[] = [target];
			let duration = 0.5;

			if (zone === 'run') {
				if (previous === 'io') {
					points = [
						new THREE.Vector3(3.7, 1.75, 1.7),
						entryAnchor.clone(),
						target.clone()
					];
					duration = 0.74;
				} else {
					points = [entryAnchor.clone(), target.clone()];
					duration = 0.5;
				}
			} else if (zone === 'io') {
				points = [exitIoAnchor.clone(), target.clone()];
				duration = 0.6;
			} else if (zone === 'done') {
				points = [exitDoneAnchor.clone(), target.clone()];
				duration = 0.56;
			} else if (previous === 'io') {
				points = [
					ioExitAnchor.clone(),
					returnAnchors[1]!.clone(),
					returnAnchors[3]!.clone(),
					returnAnchors[5]!.clone(),
					returnAnchors[7]!.clone(),
					spawnAnchor.clone(),
					target.clone()
				];
				duration = 1.45;
			} else if (previous === 'run') {
				points = [
					new THREE.Vector3(-1.1, 1.18, 0),
					target.clone()
				];
				duration = 0.6;
			} else {
				const current = rig.group.position;
				const distance = current.distanceTo(target);
				if (distance < 0.04) return;
				if (previous === null) {
					snapTo(rig, target);
					return;
				}
				points = [
					new THREE.Vector3((current.x + target.x) / 2, 0.98, 0.12),
					target.clone()
				];
				duration = 0.42;
			}

			flyThrough(rig, points, duration * factor);
		};

		let lastBeltOffset = 0;

		const syncScene = (immediate: boolean) => {
			const snap = snapshotAt(schedule, now);
			const hasRigs = rigs.length > 0;

			if (hasRigs) {
				for (const rig of rigs) {
					let zone: Zone;
					let slot = 0;
					if (snap.running === rig.id) {
						zone = 'run';
					} else if (snap.waiting.includes(rig.id)) {
						zone = 'io';
						slot = Math.max(0, snap.waiting.indexOf(rig.id));
					} else if (snap.done.includes(rig.id)) {
						zone = 'done';
						slot = Math.max(0, snap.done.indexOf(rig.id));
					} else {
						zone = 'ready';
						slot = Math.max(0, snap.ready.indexOf(rig.id));
					}

					if (immediate || rig.zone === null || rig.zone !== zone || rig.slot !== slot) {
						routeFor(rig, zone, slot, immediate);
						rig.zone = zone;
						rig.slot = slot;
					}

					if (!reducedMotion) {
						const bob = zone === 'run' ? Math.sin(now * 5.2 + rig.index * 1.7) * 0.012 : 0;
						rig.node.position.y += (bob - rig.node.position.y) * 0.18;
						const targetScale = selectedId === rig.id ? 1.055 : 1;
						rig.scale += (targetScale - rig.scale) * 0.12;
						rig.node.scale.setScalar(rig.scale);
						if (Math.abs(rig.node.position.y - bob) > 0.0004) needsRender = true;
						if (Math.abs(rig.scale - targetScale) > 0.0004) needsRender = true;
					} else {
						rig.node.scale.setScalar(selectedId === rig.id ? 1.05 : 1);
					}

					const state = STATE_GLOW[zone];
					const pulse =
						playing && zone === 'run' && !reducedMotion
							? 1 + 0.12 * Math.sin(now * 7.4)
							: 1;
					const focus = selectedId === rig.id ? 1.45 : 1;
					const targetGlow = state.level;
					rig.glow = immediate || reducedMotion ? targetGlow : rig.glow + (targetGlow - rig.glow) * 0.16;
					if (Math.abs(rig.glow - targetGlow) > 0.004) needsRender = true;
					const level = rig.glow * pulse * focus;
					glowTarget.setHex(state.color);
					if (rig.body) {
						glowColor.copy(rig.bodyEmissive).lerp(glowTarget, state.mix * 0.75);
						rig.body.emissive.copy(glowColor);
						rig.body.emissiveIntensity = rig.bodyBase * level;
					}
					if (rig.accent) {
						glowColor.copy(rig.accentEmissive).lerp(glowTarget, state.mix * 0.4);
						rig.accent.emissive.copy(glowColor);
						rig.accent.emissiveIntensity = rig.accentBase * level;
					}
				}
			}

			if (progressBar) {
				const progress = snap.running ? Math.max(0.001, snap.runProgress) : 0.001;
				progressBar.scale.x = progress;
			}

			if (dispatchMaterial) {
				const pulse = playing && snap.running ? 0.82 + 0.22 * Math.sin(now * 4.6) : 1;
				dispatchMaterial.emissiveIntensity = dispatchBase * pulse;
			}

			if (beltMaterial?.map && playing && !reducedMotion) {
				const next = lastBeltOffset - 0.055 * speed * (1 / 60);
				beltMaterial.map.offset.x = next;
				lastBeltOffset = next;
			}
		};

		const renderIfNeeded = () => {
			if (!needsRender || !renderer || !scene || !camera) return;
			if (bloom) bloom.render();
			else renderer.render(scene, camera);
			needsRender = false;
		};

		const ticker = (time: number, deltaMs: number) => {
			if (disposed) return;
			if (!isVisible) return;
			const delta = Math.min(deltaMs / 1000, 0.05);
			if (playing) {
				now = Math.min(schedule.total, now + delta * UNITS_PER_SECOND * speed);
				needsRender = true;
				if (time - lastHud > 0.06) {
					clock = now;
					lastHud = time;
				}
				if (now >= schedule.total - EPS) {
					now = schedule.total;
					playing = false;
					clock = schedule.total;
					announce(
						`Simulation complete. ${ALGORITHM_META[algorithm].label}: average waiting time ${metrics.waiting.toFixed(1)} units, average turnaround ${metrics.turnaround.toFixed(1)} units.`
					);
				}
			}

			if (immediateSeek) {
				for (const rig of rigs) {
					rig.zone = null;
				}
				immediateSeek = false;
				needsRender = true;
			}

			syncScene(false);

			if (camera && !reducedMotion && introDone) {
				cameraDesired.copy(cameraBase);
				if (pointerOn) {
					cameraDesired.x += pointerX * 0.45;
					cameraDesired.y -= pointerY * 0.22;
				}
				if (camera.position.distanceToSquared(cameraDesired) > 0.000002) {
					camera.position.lerp(cameraDesired, 0.075);
					camera.lookAt(cameraTarget);
					needsRender = true;
				}
			}

			renderIfNeeded();
		};

		controller = {
			aim(x, y, enabled) {
				pointerOn = enabled;
				pointerX = x;
				pointerY = y;
				needsRender = true;
			},
			clearPointer() {
				pointerOn = false;
				pointerX = 0;
				pointerY = 0;
				needsRender = true;
			},
			pick(x, y) {
				if (!camera || !renderer || rigs.length === 0) return;
				pointerNdc.set(x, y);
				raycaster.setFromCamera(pointerNdc, camera);
				const hits = raycaster.intersectObjects(
					rigs.map((rig) => rig.node),
					true
				);
				const hit = hits[0]?.object;
				const found = hit?.userData?.procId as string | undefined;
				if (found) selectProcess(found);
				else if (selectedId) selectProcess(selectedId);
			},
			seek(time, immediate) {
				now = Math.max(0, Math.min(schedule.total, time));
				clock = now;
				immediateSeek = immediate;
				if (immediate) {
					for (const rig of rigs) {
						rig.zone = null;
						rig.slot = -1;
					}
				}
				needsRender = true;
			},
			pause() {
				clock = now;
				needsRender = true;
			},
			invalidate() {
				needsRender = true;
			}
		};

		const initialise = async () => {
			try {
				const [threeModule, gltfModule, dracoModule, ktx2Module, hdrModule, gsapModule] =
					await Promise.all([
						import('three'),
						import('three/examples/jsm/loaders/GLTFLoader.js'),
						import('three/examples/jsm/loaders/DRACOLoader.js'),
						import('three/examples/jsm/loaders/KTX2Loader.js'),
						import('three/examples/jsm/loaders/HDRLoader.js'),
						import('gsap')
					]);

				if (disposed || !stageEl || !canvasHost) return;

				THREE = threeModule;
				cameraBase = new THREE.Vector3();
				cameraTarget = new THREE.Vector3();
				cameraDesired = new THREE.Vector3();
				raycaster = new THREE.Raycaster();
				pointerNdc = new THREE.Vector2();
				entryAnchor = new THREE.Vector3();
				cpuAnchor = new THREE.Vector3();
				exitIoAnchor = new THREE.Vector3();
				exitDoneAnchor = new THREE.Vector3();
				ioExitAnchor = new THREE.Vector3();
				spawnAnchor = new THREE.Vector3();
				gsap = gsapModule.gsap;
				gsap.registerPlugin();
				gsap.ticker.lagSmoothing(400, 33);
				if (!tick) {
					tick = ticker;
					gsap.ticker.add(tick);
				}

				motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
				reducedMotion = motionQuery.matches;

				const width = canvasHost.clientWidth || stageEl.clientWidth || 800;
				const height = canvasHost.clientHeight || stageEl.clientHeight || 600;

				try {
					renderer = new THREE.WebGLRenderer({
						antialias: true,
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
				renderer.toneMappingExposure = 1.12;
				renderer.shadowMap.enabled = true;
				renderer.shadowMap.type = THREE.PCFShadowMap;
				renderer.domElement.className = 'scheduler__webgl';
				renderer.domElement.setAttribute('aria-hidden', 'true');
				// eslint-disable-next-line svelte/no-dom-manipulating -- the WebGL canvas is owned by three.js, not the Svelte tree
				canvasHost.appendChild(renderer.domElement);

				scene = new THREE.Scene();
				camera = new THREE.PerspectiveCamera(32, width / height, 0.1, 90);
				cameraTarget.set(CAM_TARGET.x, CAM_TARGET.y, CAM_TARGET.z);
				cameraBase.set(CAM_BASE.x, CAM_BASE.y, CAM_BASE.z);
				updateCameraLayout(width, height);
				setCam();

				loadPercent = 10;

				const pmrem = new THREE.PMREMGenerator(renderer);
				const hdrLoader = new hdrModule.HDRLoader();

				try {
					const hdr = await hdrLoader.loadAsync(resolveAsset('/hdri/studio_small_08_1k.hdr'));
					if (disposed) {
						hdr.dispose();
						pmrem.dispose();
						return;
					}
					hdr.mapping = THREE.EquirectangularReflectionMapping;
					environmentTexture = pmrem.fromEquirectangular(hdr).texture;
					scene.environment = environmentTexture;
					scene.environmentIntensity = 0.8;
					hdr.dispose();
				} catch (environmentError) {
					console.warn('[ProcessScheduler3D] HDRI environment failed to load.', environmentError);
				} finally {
					pmrem.dispose();
				}

				if (disposed) return;
				loadPercent = 22;

				keyLight = new THREE.DirectionalLight(0xffe9cf, 3.9);
				keyLight.position.set(10.5, 6.8, 5.2);
				keyLight.castShadow = true;
				keyLight.shadow.mapSize.set(2048, 2048);
				keyLight.shadow.camera.near = 0.5;
				keyLight.shadow.camera.far = 38;
				keyLight.shadow.camera.left = -11;
				keyLight.shadow.camera.right = 11;
				keyLight.shadow.camera.top = 8;
				keyLight.shadow.camera.bottom = -8;
				keyLight.shadow.bias = -0.0003;
				keyLight.shadow.normalBias = 0.03;
				keyLight.shadow.radius = 4;
				keyLight.target.position.set(-1, 0.6, 0);
				scene.add(keyLight.target);
				scene.add(keyLight);

				const fill = new THREE.DirectionalLight(0x6f8fff, 0.8);
				fill.position.set(-8, 3.4, 6);
				scene.add(fill);

				const rim = new THREE.DirectionalLight(0x86e6dc, 3.4);
				rim.position.set(-9, 3.6, -7.5);
				scene.add(rim);

				const hemi = new THREE.HemisphereLight(0xf0eee6, 0x87867f, 0.5);
				scene.add(hemi);

				const draco = new dracoModule.DRACOLoader();
				draco.setDecoderPath(
					resolveAsset('/draco/draco_decoder.js').replace(/[^/]*$/, '')
				);
				dracoLoader = draco;

				const ktx2 = new ktx2Module.KTX2Loader();
				ktx2.setTranscoderPath(
					resolveAsset('/basis/basis_transcoder.js').replace(/[^/]*$/, '')
				);
				ktx2.detectSupport(renderer);
				ktx2Loader = ktx2;

				const loader = new gltfModule.GLTFLoader();
				loader.setDRACOLoader(draco);
				loader.setKTX2Loader(ktx2);

				const gltf = await loader.loadAsync(
					resolveAsset('/models/scheduler.glb'),
					(event) => {
						if (event.total > 0) {
							loadPercent = Math.max(loadPercent, 24 + Math.round((event.loaded / event.total) * 60));
						}
					}
				);

				if (disposed) return;
				draco.dispose();
				ktx2.dispose();
				dracoLoader = null;
				ktx2Loader = null;
				loadPercent = 92;

				const required = [
					'queue-slot-0',
					'queue-slot-4',
					'cpu-entry',
					'cpu-slot',
					'cpu-exit-io',
					'cpu-exit-done',
					'io-slot-0',
					'io-slot-4',
					'retired-slot-0',
					'retired-slot-4',
					'io-exit',
					'return-0',
					'return-7',
					'spawn',
					'cpu-progress-bar'
				];
				for (const name of required) {
					if (!gltf.scene.getObjectByName(name)) {
						throw new Error(`Model is missing the "${name}" anchor.`);
					}
				}

				glowColor = new THREE.Color();
				glowTarget = new THREE.Color();
				const maxAnisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
// eslint-disable-next-line svelte/prefer-svelte-reactivity -- plain bookkeeping of three.js objects, never rendered
				const tunedMaterials = new Set<Three.Material>();
				/* envMapIntensity is only honoured when the material owns an envMap, so
				   bind the shared PMREM texture explicitly and tune per surface class. */
				const tuneMaterial = (pbr: Three.MeshStandardMaterial) => {
					if (!('envMapIntensity' in pbr) || tunedMaterials.has(pbr)) return;
					tunedMaterials.add(pbr);
					const name = pbr.name;
					let intensity = 1;
					if (name === 'Belt rubber') {
						pbr.color.multiplyScalar(0.7);
						pbr.roughness = 0.82;
						pbr.metalness = 0.04;
						intensity = 0.3;
					} else if (name === 'Belt carcass') {
						pbr.roughness = 0.9;
						intensity = 0.25;
					} else if (name === 'Graphite frame') {
						pbr.metalness = 0.92;
						pbr.roughness = 0.24;
						intensity = 1.5;
					} else if (name === 'Soft graphite') {
						pbr.metalness = 0.7;
						pbr.roughness = 0.34;
						intensity = 1.15;
					} else if (name === 'Brushed brass') {
						pbr.roughness = 0.2;
						intensity = 1.7;
					} else if (name === 'Oxidised brass') {
						intensity = 1.2;
					} else if (name === 'Stage print') {
						intensity = 0.35;
					} else if (name.endsWith(' body')) {
						pbr.roughness = Math.min(pbr.roughness, 0.26);
						intensity = 1.25;
					} else if (name.endsWith(' accent')) {
						pbr.roughness = Math.min(pbr.roughness, 0.2);
						intensity = 1.4;
					} else if (name.endsWith('plate')) {
						intensity = 0.5;
					} else if (name.endsWith('glow') || name === 'Dispatch core') {
						intensity = 0.4;
					}
					pbr.envMap = environmentTexture ?? null;
					pbr.envMapIntensity = intensity;
					pbr.needsUpdate = true;
				};
				gltf.scene.traverse((object) => {
					const mesh = object as Three.Mesh;
					if (!mesh.isMesh) return;
					mesh.receiveShadow = true;
					const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
					mesh.castShadow = !materials.some((material) => material.name === 'Stage print');
					for (const material of materials) {
						const pbr = material as Three.MeshStandardMaterial;
						tuneMaterial(pbr);
						if (pbr.name === 'Belt rubber') beltMaterial = pbr;
						if (pbr.name === 'Dispatch core') {
							dispatchMaterial = pbr;
							dispatchBase = pbr.emissiveIntensity || 1;
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

				queueAnchors = [0, 1, 2, 3, 4].map((index) =>
					anchor(gltf.scene, `queue-slot-${index}`)
				);
				ioAnchors = [0, 1, 2, 3, 4].map((index) => anchor(gltf.scene, `io-slot-${index}`));
				retiredAnchors = [0, 1, 2, 3, 4].map((index) =>
					anchor(gltf.scene, `retired-slot-${index}`)
				);
				returnAnchors = [0, 1, 2, 3, 4, 5, 6, 7].map((index) =>
					anchor(gltf.scene, `return-${index}`)
				);
				entryAnchor = anchor(gltf.scene, 'cpu-entry');
				cpuAnchor = anchor(gltf.scene, 'cpu-slot');
				exitIoAnchor = anchor(gltf.scene, 'cpu-exit-io');
				exitDoneAnchor = anchor(gltf.scene, 'cpu-exit-done');
				ioExitAnchor = anchor(gltf.scene, 'io-exit');
				spawnAnchor = anchor(gltf.scene, 'spawn');
				progressBar = gltf.scene.getObjectByName('cpu-progress-bar') ?? null;
				if (progressBar) progressBar.scale.x = 0.001;

				modelRoot = new THREE.Group();
				modelRoot.name = 'process-scheduler-model';
				modelRoot.add(gltf.scene);
				scene.add(modelRoot);

				rigs = [0, 1, 2, 3, 4].map((index) => {
					const node = gltf.scene.getObjectByName(`proc-${index}`);
					if (!node) throw new Error(`Model is missing the "proc-${index}" process block.`);
					const group = new THREE.Group();
					group.name = `proc-rig-${index}`;
					group.position.copy(node.position);
					group.add(node);
					node.position.set(0, 0, 0);
					modelRoot?.add(group);

					const meshes: Three.Mesh[] = [];
					group.traverse((object) => {
						const mesh = object as Three.Mesh;
						if (!mesh.isMesh) return;
						mesh.userData.procId = `P${index + 1}`;
						meshes.push(mesh);
					});

					const blockMaterials = meshes.flatMap((mesh) =>
						Array.isArray(mesh.material) ? mesh.material : [mesh.material]
					) as Three.MeshStandardMaterial[];
					const body =
						blockMaterials.find((material) => material.name.endsWith(' body')) ?? null;
					const accent =
						blockMaterials.find((material) => material.name.endsWith(' accent')) ?? null;

					return {
						index,
						id: `P${index + 1}`,
						group,
						node,
						meshes,
						body,
						accent,
						bodyBase: body?.emissiveIntensity ?? 1,
						accentBase: accent?.emissiveIntensity ?? 1,
						bodyEmissive: body ? body.emissive.clone() : new THREE.Color(0),
						accentEmissive: accent ? accent.emissive.clone() : new THREE.Color(0),
						glow: 1,
						zone: null,
						slot: -1,
						route: null,
						scale: 1
					};
				});



				const initialSnap = snapshotAt(schedule, 0);
				for (const rig of rigs) {
					const zone: Zone =
						initialSnap.running === rig.id
							? 'run'
							: initialSnap.ready.includes(rig.id)
								? 'ready'
								: 'io';
					const slot = initialSnap.ready.indexOf(rig.id);
					routeFor(rig, zone, Math.max(0, slot), true);
					rig.zone = zone;
					rig.slot = Math.max(0, slot);
				}

				introDone = true;
				syncScene(true);
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
				interactive = true;
				loading = false;
				announcement =
					'Scheduler model ready. Choose a dispatch policy, then press play to run the simulation.';

				if (!reducedMotion) {
					gsap.killTweensOf(camera!.position);
					gsap.fromTo(
						camera!.position,
						{
							x: cameraBase.x * 1.16,
							y: cameraBase.y * 1.1,
							z: cameraBase.z * 1.16
						},
						{
							x: cameraBase.x,
							y: cameraBase.y,
							z: cameraBase.z,
							duration: 2.1,
							ease: 'power3.out',
							onUpdate: () => {
								needsRender = true;
								camera?.lookAt(cameraTarget);
							}
						}
					);
				}

				onMotionChange = (event) => {
					reducedMotion = event.matches;
					if (reducedMotion) {
						gsap.killTweensOf(camera!.position);
						setCam();
					}
					needsRender = true;
				};
				motionQuery.addEventListener('change', onMotionChange);

				resizeObserver = new ResizeObserver(() => {
					if (disposed || !renderer || !canvasHost) return;
					const nextWidth = canvasHost.clientWidth || 800;
					const nextHeight = canvasHost.clientHeight || 600;
					renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
					renderer.setSize(nextWidth, nextHeight, false);
					bloom?.setSize(nextWidth, nextHeight);
					updateCameraLayout(nextWidth, nextHeight);
					needsRender = true;
				});
				resizeObserver.observe(canvasHost);

				intersectionObserver = new IntersectionObserver(
					(entries) => {
						isVisible = entries[0]?.isIntersecting ?? false;
						if (isVisible) needsRender = true;
					},
					{ rootMargin: '160px 0px', threshold: 0.01 }
				);
				intersectionObserver.observe(sectionEl ?? canvasHost);

				if (!tick) {
					tick = ticker;
					gsap.ticker.add(tick);
				}
			} catch (cause) {
				console.error('[ProcessScheduler3D]', cause);
				if (!disposed) {
					loading = false;
					ready = false;
					error =
						'This browser could not build the 3D scheduler. The controls and timeline still run the simulation.';
					interactive = true;
					announcement =
						'The 3D model is unavailable. The schedule, timeline, and controls still work.';
				}
			}
		};

		window.addEventListener('keydown', handleGlobalKey);
		void initialise();

		return () => {
			disposed = true;
			window.removeEventListener('keydown', handleGlobalKey);
			if (tick) gsap.ticker.remove(tick);
			tick = null;
			if (motionQuery && onMotionChange) {
				motionQuery.removeEventListener('change', onMotionChange);
			}
			for (const rig of rigs) {
				rig.route?.kill();
			}
			resizeObserver?.disconnect();
			intersectionObserver?.disconnect();
			dracoLoader?.dispose();
			ktx2Loader?.dispose();
			if (renderer) {
				bloom?.dispose();
				bloom = null;
				renderer.dispose();
				renderer.forceContextLoss();
				renderer.domElement.remove();
			}
			if (modelRoot) {
				// eslint-disable-next-line svelte/prefer-svelte-reactivity -- plain bookkeeping of three.js objects, never rendered
			const disposedTextures = new Set<Three.Texture>();
				modelRoot.traverse((object) => {
					const mesh = object as Three.Mesh;
					if (!mesh.isMesh) return;
					mesh.geometry?.dispose();
					const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
					for (const material of materials) {
						for (const value of Object.values(material)) {
							if (value && typeof value === 'object' && 'isTexture' in value) {
								const texture = value as Three.Texture;
								if (texture !== environmentTexture && !disposedTextures.has(texture)) {
									disposedTextures.add(texture);
									texture.dispose();
								}
							}
						}
						material.dispose();
					}
				});
			}
			environmentTexture?.dispose();
			keyLight?.shadow.map?.dispose();
			controller = null;
			scene = null;
			camera = null;
			renderer = null;
			rigs = [];
		};
	});
</script>

<section
	id={id}
	class="scheduler {className} {ready ? 'is-ready' : ''} {error ? 'has-error' : ''} {embeddedMode
		? 'is-embedded'
		: ''}"
	aria-labelledby={headingId}
	aria-describedby={summaryId}
	bind:this={sectionEl}
>
	<div class="scheduler__stage" role="presentation" bind:this={stageEl} onpointermove={handlePointerMove} onpointerleave={clearPointer}>
		<div class="scheduler__canvas" role="presentation" bind:this={canvasHost} onpointerdown={pickProcess}></div>
		<div class="scheduler__vignette" aria-hidden="true"></div>
		<div class="scheduler__grain" aria-hidden="true"></div>

		<header class="scheduler__intro">
			<p class="scheduler__eyebrow"><span>02</span> / Process scheduling</p>
			<h1 id={headingId}>The queue,<br />the core,<br />the wait.</h1>
			<p class="scheduler__lede" id={summaryId}>
				Five jobs arrive at once. Pick a dispatch policy and watch the belt feed one core &mdash;
				and see what happens to everyone who has to wait.
			</p>
		</header>

		<div class="scheduler__status" aria-hidden="true">
			<span class="scheduler__status-dot" class:is-live={playing}></span>
			<span>{playing ? 'Running' : complete ? 'Complete' : 'Paused'}</span>
			<span class="scheduler__status-rule"></span>
			<span>{meta.short}{algorithm === 'rr' ? ` · q${QUANTUM}` : ''}</span>
		</div>

		<div class="scheduler__legend" aria-hidden="true">
			<span class="scheduler__legend-item"><i class="is-gold"></i>Running</span>
			<span class="scheduler__legend-item"><i class="is-teal"></i>Ready queue</span>
			<span class="scheduler__legend-item"><i class="is-violet"></i>Blocked on I/O</span>
			<span class="scheduler__legend-item"><i class="is-faint"></i>Retired</span>
		</div>

		<div class="scheduler__readout" aria-hidden="true">
			<span class="scheduler__readout-label">T +</span>
			<strong>{clock.toFixed(2)}</strong>
			<span class="scheduler__readout-total">/ {formatUnits(total)} u</span>
		</div>

		<p class="scheduler__sr" aria-live="polite">{announcement}</p>

		{#if loading}
			<div class="scheduler__loader" role="status" aria-live="polite">
				<div class="scheduler__loader-mark" aria-hidden="true">
					<span></span><span></span><span></span><span></span>
				</div>
				<p>Loading scheduler model</p>
				<div class="scheduler__loader-track" aria-hidden="true">
					<i style="width: {loadPercent}%"></i>
				</div>
				<span class="scheduler__loader-value">{loadPercent}%</span>
			</div>
		{/if}

		{#if error}
			<div class="scheduler__error" role="alert">
				<p>{error}</p>
			</div>
		{/if}
	</div>

	<aside class="scheduler__panel" aria-label="Scheduler controls">
		<div class="scheduler__panel-head">
			<p class="scheduler__kicker">Dispatch policy</p>
			<div class="scheduler__algorithms" role="group" aria-label="Scheduling algorithm">
				{#each algorithmOrder as policy, index (policy)}
					<button
						type="button"
						class="algo"
						class:is-active={algorithm === policy}
						aria-pressed={algorithm === policy}
						onclick={() => chooseAlgorithm(policy)}
					>
						<span class="algo__index">0{index + 1}</span>
						<span class="algo__short">{ALGORITHM_META[policy].short}</span>
					</button>
				{/each}
			</div>
			<p class="scheduler__policy-desc">{meta.description}</p>
		</div>

		<div class="scheduler__transport">
			<button
				type="button"
				class="scheduler__play"
				onclick={togglePlay}
				disabled={!interactive}
			>
				{#if playing}
					<svg viewBox="0 0 12 12" aria-hidden="true" focusable="false">
						<path d="M3.3 2h1.8v8H3.3zM6.9 2h1.8v8H6.9z"></path>
					</svg>
					Pause
				{:else}
					<svg viewBox="0 0 12 12" aria-hidden="true" focusable="false">
						<path d="M3.1 1.8 10.2 6 3.1 10.2z"></path>
					</svg>
					{complete ? 'Replay' : 'Play simulation'}
				{/if}
			</button>
			<button
				type="button"
				class="scheduler__icon-btn"
				onclick={stepForward}
				disabled={!interactive}
				title="Advance one time unit"
				aria-label="Advance one time unit"
			>
				+1
			</button>
			<button
				type="button"
				class="scheduler__icon-btn"
				onclick={resetClock}
				disabled={!interactive}
				title="Reset the clock"
				aria-label="Reset the clock"
			>
				<svg viewBox="0 0 12 12" aria-hidden="true" focusable="false">
					<path
						d="M6 2.2a3.8 3.8 0 1 1-3.6 2.7"
						fill="none"
						stroke="currentColor"
						stroke-width="1.15"
					/>
					<path d="M2 1.8v3.1h3.1" fill="none" stroke="currentColor" stroke-width="1.15" />
				</svg>
			</button>
			<button
				type="button"
				class="scheduler__icon-btn"
				onclick={newWorkload}
				disabled={!interactive}
				title="Generate a new workload"
				aria-label="Generate a new workload"
			>
				<svg viewBox="0 0 12 12" aria-hidden="true" focusable="false">
					<path d="M2 3.2h5.6M6.3 1.5l1.9 1.7-1.9 1.7" fill="none" stroke="currentColor" stroke-width="1.05"></path>
					<path d="M10 8.8H4.4M5.7 7.1 3.8 8.8l1.9 1.7" fill="none" stroke="currentColor" stroke-width="1.05"></path>
				</svg>
			</button>
		</div>

		<div class="scheduler__timeline-line">
			<div class="scheduler__time">
				<span class="scheduler__time-now">T+ {clock.toFixed(2)}</span>
				<span class="scheduler__time-total">/ {formatUnits(total)} units</span>
				{#if complete}<span class="scheduler__chip">complete</span>{/if}
			</div>
			<div class="scheduler__speed" role="group" aria-label="Playback speed">
				<span class="scheduler__speed-label">Speed</span>
				{#each speeds as rate (rate)}
					<button
						type="button"
						class="scheduler__speed-btn"
						class:is-active={speed === rate}
						aria-pressed={speed === rate}
						onclick={() => (speed = rate)}
					>
						{rate}×
					</button>
				{/each}
			</div>
		</div>

		<div class="scheduler__metrics">
			<div class="scheduler__metric">
				<span>Avg wait</span>
				<strong>{metrics.waiting.toFixed(1)}</strong>
				<em>units</em>
			</div>
			<div class="scheduler__metric">
				<span>Avg turn</span>
				<strong>{metrics.turnaround.toFixed(1)}</strong>
				<em>units</em>
			</div>
			<div class="scheduler__metric">
				<span>Busy</span>
				<strong>{Math.round(schedule.utilization * 100)}</strong>
				<em>%</em>
			</div>
		</div>

		<p class="scheduler__plan-note">
			<span>{schedule.dispatches} dispatches</span>
			<span>{algorithm === 'rr' ? `quantum ${schedule.quantum} u` : 'non-preemptive'}</span>
			<span>plan at completion</span>
		</p>

		<div class="scheduler__processes">
			<div class="scheduler__process-head" aria-hidden="true">
				<span>Proc</span>
				<span>Burst</span>
				<span>State</span>
				<span class="is-right">Left</span>
			</div>
			{#each schedule.processes as process (process.spec.id)}
				{@const state = stateOf(process.spec.id)}
				{@const remaining = snapshot.remaining[process.spec.id] ?? 0}
				{@const ratio = process.spec.burst > 0 ? remaining / process.spec.burst : 0}
				<button
					type="button"
					class="scheduler__row"
					class:is-selected={selectedId === process.spec.id}
					aria-pressed={selectedId === process.spec.id}
					onclick={() => selectProcess(process.spec.id)}
				>
					<span class="scheduler__proc">
						<i style:background={process.spec.color}></i>
						{process.spec.id}
					</span>
					<span class="scheduler__burst">
						{process.spec.burst}
						{#if process.spec.ioAfter !== null}
							<em>io {process.spec.ioAfter}/{process.spec.ioDuration}</em>
						{/if}
					</span>
					<span class="scheduler__state is-{state}">{stateLabel(state)}</span>
					<span class="scheduler__remaining">
						{formatUnits(remaining)}
						<i class="scheduler__remaining-track" aria-hidden="true">
							<i style="width: {Math.max(0, Math.min(1, ratio)) * 100}%"></i>
						</i>
					</span>
				</button>
			{/each}
		</div>

		<div class="scheduler__gantt-wrap">
			<div class="scheduler__gantt-head">
				<p class="scheduler__kicker">Schedule map</p>
				<span>click to scrub</span>
			</div>

			<div class="scheduler__gantt">
				<div class="scheduler__gantt-rows">
					<div class="scheduler__gantt-row">
						<span class="scheduler__gantt-label">CPU</span>
						<div class="scheduler__gantt-plot">
							{#each schedule.cpuSegments as segment, index (index)}
								<span
									class="scheduler__bar is-cpu"
									class:is-idle={segment.kind === 'idle'}
									style={barStyle(segment)}
									title={`${segment.pid ?? 'idle'} · ${formatUnits(segment.start)}–${formatUnits(segment.end)}`}
								></span>
							{/each}
						</div>
					</div>
					{#each schedule.processes as process (process.spec.id)}
						<div class="scheduler__gantt-row">
							<span class="scheduler__gantt-label">{process.spec.id}</span>
							<div class="scheduler__gantt-plot">
								{#each process.cpu as range, index (index)}
									<span
										class="scheduler__bar is-process"
										style={barStyle(range, process.spec.color)}
										title={`${process.spec.id} CPU · ${formatUnits(range.start)}–${formatUnits(range.end)}`}
									></span>
								{/each}
								{#each process.io as range, index (index)}
									<span
										class="scheduler__bar is-io"
										style={barStyle(range)}
										title={`${process.spec.id} I/O · ${formatUnits(range.start)}–${formatUnits(range.end)}`}
									></span>
								{/each}
							</div>
						</div>
					{/each}
				</div>

				<div
					class="scheduler__gantt-overlay"
					role="slider"
					tabindex="0"
					aria-label="Schedule playhead"
					aria-valuemin="0"
					aria-valuemax={total}
					aria-valuenow={clock}
					aria-valuetext={`${clock.toFixed(2)} of ${formatUnits(total)} time units`}
					onclick={seekFromChart}
					onkeydown={timelineKey}
				>
					<span class="scheduler__gantt-future" style="left: {percent * 100}%"></span>
					<span class="scheduler__gantt-playhead" style="left: {percent * 100}%"></span>
				</div>
			</div>

			<div class="scheduler__gantt-axis" aria-hidden="true">
				{#each [0, 0.25, 0.5, 0.75, 1] as tick, index (index)}
					<span style="left: {tick * 100}%">{formatUnits(total * tick)}</span>
				{/each}
			</div>
		</div>

		<p class="scheduler__hint">
			<span><kbd>Space</kbd> play / pause</span>
			<span><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> policy</span>
			<span><kbd>R</kbd> reset</span>
		</p>
	</aside>
</section>

<style>
	.scheduler {
		--sched-bg: var(--rubin-ivory);
		--sched-panel: var(--rubin-ivory);
		--sched-text: var(--rubin-slate);
		--sched-muted: var(--rubin-muted);
		--sched-soft: var(--rubin-dark-gray);
		--sched-faint: var(--rubin-muted);
		--sched-gold: var(--rubin-clay-ink);
		--sched-teal: var(--rubin-teal-ink);
		--sched-violet: var(--rubin-riso);
		--sched-line: rgba(138, 130, 116, 0.38);
		--sched-line-strong: rgba(138, 130, 116, 0.62);
		--sched-mono: var(--font-mono);
		--sched-ease: cubic-bezier(0.16, 1, 0.3, 1);

		display: grid;
		grid-template-columns: minmax(0, 1fr) 25.5rem;
		height: calc(100svh - 4.25rem);
		min-height: 40rem;
		overflow: hidden;
		border-top: 1px solid var(--sched-line);
		background: var(--sched-bg);
		color: var(--sched-text);
		font-family: var(--font-sans);
		-webkit-font-smoothing: antialiased;
		-moz-osx-font-smoothing: grayscale;
		text-rendering: optimizeLegibility;
		font-feature-settings: 'cv11', 'ss01', 'tnum';
	}

	.scheduler button {
		font-feature-settings: 'tnum', 'zero';
	}

	.scheduler__stage {
		position: relative;
		min-width: 0;
		overflow: hidden;
		background:
			radial-gradient(78% 68% at 52% 42%, color-mix(in srgb, var(--rubin-ivory) 58%, transparent), transparent 72%),
			radial-gradient(42% 38% at 84% 8%, rgba(217, 119, 87, 0.05), transparent 72%),
			var(--rubin-ivory);
	}

	.scheduler__canvas {
		position: absolute;
		inset: 0;
		z-index: 1;
	}

	.scheduler__canvas :global(canvas) {
		display: block;
		width: 100%;
		height: 100%;
		opacity: 0;
		transition: opacity 1.1s ease;
	}

	.scheduler.is-ready .scheduler__canvas :global(canvas) {
		opacity: 1;
	}

	.scheduler__vignette {
		position: absolute;
		inset: 0;
		z-index: 2;
		pointer-events: none;
		box-shadow: inset 0 0 170px 34px color-mix(in srgb, var(--rubin-ivory) 90%, transparent);
	}

	.scheduler__grain {
		position: absolute;
		inset: 0;
		z-index: 3;
		pointer-events: none;
		opacity: 0.05;
		mix-blend-mode: soft-light;
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.86' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.5'/%3E%3C/svg%3E");
		background-size: 160px 160px;
	}

	.scheduler__intro {
		position: absolute;
		top: clamp(2rem, 6.2vh, 4.4rem);
		left: clamp(1.5rem, 4.2vw, 4.2rem);
		z-index: 4;
		width: min(30rem, 52%);
		pointer-events: none;
	}

	.scheduler__eyebrow {
		margin: 0 0 1.6rem;
		color: var(--sched-muted);
		font-family: var(--sched-mono);
		font-size: 0.694rem;
		letter-spacing: 0.1em;
		line-height: 1.5;
		text-transform: uppercase;
	}

	.scheduler__eyebrow span {
		color: var(--sched-gold);
	}

	.scheduler__intro h1 {
		margin: 0;
		color: var(--rubin-slate);
		font-size: clamp(2.7rem, 4.6vw, 4.9rem);
		font-weight: 300;
		letter-spacing: -0.055em;
		line-height: 0.93;
		font-feature-settings: 'ss01', 'cv11';
	}

	.scheduler__lede {
		position: relative;
		z-index: 0;
		max-width: 24rem;
		margin: 1.5rem 0 0;
		color: var(--sched-soft);
		font-size: 0.81rem;
		font-weight: 400;
		line-height: 1.72;
		text-shadow: 0 1px 2px color-mix(in srgb, var(--rubin-ivory) 90%, transparent), 0 0 18px color-mix(in srgb, var(--rubin-ivory) 90%, transparent);
		letter-spacing: -0.005em;
	}

	.scheduler__lede::before {
		content: '';
		position: absolute;
		inset: -0.9rem -1.2rem -0.8rem -1.3rem;
		z-index: -1;
		border-radius: 0;
		background: linear-gradient(90deg, color-mix(in srgb, var(--rubin-ivory) 90%, transparent), color-mix(in srgb, var(--rubin-ivory) 78%, transparent) 75%, color-mix(in srgb, var(--rubin-ivory) 55%, transparent));
		-webkit-backdrop-filter: blur(8px);
		backdrop-filter: blur(8px);
		-webkit-mask-image: radial-gradient(130% 140% at 30% 50%, var(--rubin-ivory) 62%, transparent 100%);
		mask-image: radial-gradient(130% 140% at 30% 50%, var(--rubin-ivory) 62%, transparent 100%);
		pointer-events: none;
	}

	.scheduler__status {
		position: absolute;
		top: clamp(2rem, 6.2vh, 4.4rem);
		right: clamp(1.4rem, 3.4vw, 3rem);
		z-index: 4;
		display: inline-flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.5rem 0.7rem;
		border: 1px solid var(--sched-line);
		background: color-mix(in srgb, var(--rubin-ivory) 42%, transparent);
		color: var(--sched-muted);
		font-family: var(--sched-mono);
		font-size: 0.672rem;
		letter-spacing: 0.1em;
		line-height: 1;
		text-transform: uppercase;
		backdrop-filter: blur(10px);
		pointer-events: none;
	}

	.scheduler__status-dot {
		width: 4px;
		height: 4px;
		border-radius: 0;
		background: var(--sched-faint);
	}

	.scheduler__status-dot.is-live {
		background: var(--sched-gold);
		animation: sched-pulse 1.9s ease-in-out infinite;
	}

	.scheduler__status-rule {
		width: 1px;
		height: 0.55rem;
		background: var(--sched-line);
	}

	.scheduler__legend {
		position: absolute;
		bottom: 1.6rem;
		left: clamp(1rem, 3.2vw, 3.4rem);
		z-index: 4;
		display: flex;
		flex-wrap: wrap;
		gap: 1.1rem;
		padding: 0.55rem 0.8rem;
		background: color-mix(in srgb, var(--rubin-ivory) 72%, transparent);
		-webkit-backdrop-filter: blur(8px);
		backdrop-filter: blur(8px);
		color: var(--sched-muted);
		font-family: var(--sched-mono);
		font-size: 0.666rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		pointer-events: none;
	}

	.scheduler__legend-item {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
	}

	.scheduler__legend i {
		width: 7px;
		height: 7px;
		border-radius: 0;
	}

	.scheduler__legend i.is-gold {
		background: var(--sched-gold);
	}

	.scheduler__legend i.is-teal {
		background: var(--sched-teal);
	}

	.scheduler__legend i.is-violet {
		background: var(--sched-violet);
	}

	.scheduler__legend i.is-faint {
		border: 1px solid var(--sched-faint);
	}

	.scheduler__readout {
		position: absolute;
		right: clamp(1.4rem, 3.4vw, 3rem);
		bottom: 1.6rem;
		z-index: 4;
		display: flex;
		align-items: baseline;
		gap: 0.45rem;
		padding: 0.55rem 0.8rem;
		background: color-mix(in srgb, var(--rubin-ivory) 72%, transparent);
		-webkit-backdrop-filter: blur(8px);
		backdrop-filter: blur(8px);
		color: var(--sched-muted);
		font-family: var(--sched-mono);
		pointer-events: none;
	}

	.scheduler__readout-label {
		font-size: 0.678rem;
		letter-spacing: 0.1em;
	}

	.scheduler__readout strong {
		color: var(--sched-text);
		font-size: 1.05rem;
		font-weight: 400;
		letter-spacing: 0.02em;
		font-variant-numeric: tabular-nums;
	}

	.scheduler__readout-total {
		color: var(--sched-faint);
		font-size: 0.685rem;
		letter-spacing: 0.08em;
	}

	.scheduler__sr {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	.scheduler__loader {
		position: absolute;
		inset: 0;
		z-index: 8;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1.1rem;
		background:
			radial-gradient(40% 40% at 50% 50%, color-mix(in srgb, var(--rubin-ivory) 66%, transparent), transparent 75%),
			var(--rubin-ivory);
		color: var(--sched-muted);
		font-family: var(--sched-mono);
		font-size: 0.698rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		transition: opacity 0.6s ease;
	}

	.scheduler__loader p {
		margin: 0;
	}

	.scheduler__loader-mark {
		display: grid;
		grid-template-columns: repeat(2, 10px);
		grid-template-rows: repeat(2, 10px);
		gap: 5px;
		transform: rotate(45deg);
	}

	.scheduler__loader-mark span {
		border: 1px solid rgba(217, 119, 87, 0.7);
		background: rgba(217, 119, 87, 0.08);
	}

	.scheduler__loader-mark span:nth-child(2),
	.scheduler__loader-mark span:nth-child(3) {
		background: rgba(43, 130, 114, 0.15);
	}

	.scheduler__loader-track {
		position: relative;
		width: 10rem;
		height: 1px;
		overflow: hidden;
		background: var(--sched-line);
	}

	.scheduler__loader-track i {
		display: block;
		height: 100%;
		background: var(--sched-gold);
		transition: width 0.4s ease;
	}

	.scheduler__loader-value {
		color: var(--sched-faint);
		font-size: 0.678rem;
		letter-spacing: 0.1em;
	}

	.scheduler__error {
		position: absolute;
		bottom: 5.2rem;
		left: clamp(1.5rem, 4.2vw, 4.2rem);
		z-index: 8;
		width: min(27rem, calc(100% - 3rem));
		padding: 1rem 1.2rem;
		border: 1px solid var(--sched-line);
		background: color-mix(in srgb, var(--rubin-ivory) 88%, transparent);
		backdrop-filter: blur(12px);
	}

	.scheduler__error p {
		margin: 0;
		color: var(--sched-muted);
		font-size: 0.72rem;
		line-height: 1.65;
	}

	/* panel ------------------------------------------------------------- */
	.scheduler__panel {
		display: flex;
		min-width: 0;
		flex-direction: column;
		gap: 0.85rem;
		max-height: calc(100svh - 4.25rem);
		padding: 1.2rem 1.3rem 1rem;
		overflow-y: auto;
		overscroll-behavior: contain;
		border-left: 1px solid var(--sched-line);
		background:
			linear-gradient(180deg, color-mix(in srgb, var(--rubin-ivory) 42%, transparent), transparent 15rem),
			var(--sched-panel);
		scrollbar-width: thin;
		scrollbar-color: rgba(138, 130, 116, 0.46) transparent;
	}

	.scheduler__panel::-webkit-scrollbar {
		width: 5px;
	}

	.scheduler__panel::-webkit-scrollbar-thumb {
		background: rgba(138, 130, 116, 0.46);
	}

	.scheduler__kicker {
		margin: 0;
		color: var(--sched-faint);
		font-family: var(--sched-mono);
		font-size: 0.678rem;
		letter-spacing: 0.1em;
		line-height: 1.4;
		text-transform: uppercase;
	}

	.scheduler__panel-head {
		display: grid;
		gap: 0.62rem;
	}

	.scheduler__algorithms {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		border: 1px solid var(--sched-line);
	}

	.algo {
		display: grid;
		grid-template-columns: auto 1fr;
		align-items: baseline;
		gap: 0.3rem;
		padding: 0.62rem 0.66rem 0.58rem;
		border: 0;
		border-right: 1px solid var(--sched-line);
		background: transparent;
		color: var(--sched-muted);
		font-family: var(--sched-mono);
		text-align: left;
		cursor: pointer;
		transition:
			color 0.2s ease,
			background 0.2s ease,
			box-shadow 0.2s ease;
	}

	.algo:active {
		background: rgba(138, 130, 116, 0.24);
	}

	.algo:last-child {
		border-right: 0;
	}

	.algo:hover {
		color: var(--sched-text);
		background: rgba(138, 130, 116, 0.17);
	}

	.algo:focus-visible {
		outline: 2px solid var(--sched-teal);
		outline-offset: -2px;
	}

	.algo.is-active {
		color: var(--sched-text);
		background: linear-gradient(180deg, rgba(217, 119, 87, 0.14), rgba(217, 119, 87, 0.05));
		box-shadow:
			inset 0 2px 0 var(--sched-gold),
			inset 0 0 0 1px rgba(217, 119, 87, 0.22);
	}

	.algo__index {
		color: var(--sched-faint);
		font-size: 0.659rem;
		letter-spacing: 0.05em;
	}

	.algo.is-active .algo__index {
		color: var(--sched-gold);
	}

	.algo__short {
		font-size: 0.72rem;
		letter-spacing: 0.1em;
	}

	.scheduler__policy-desc {
		min-height: 2.6rem;
		margin: 0;
		color: var(--sched-muted);
		font-size: 0.72rem;
		line-height: 1.7;
	}

	.scheduler__transport {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 2.4rem 2.4rem 2.4rem;
		gap: 0.35rem;
	}

	.scheduler__play {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.55rem;
		height: 2.65rem;
		padding: 0 0.9rem;
		border: 1px solid rgba(217, 119, 87, 0.8);
		background: linear-gradient(180deg, var(--rubin-clay), var(--rubin-clay));
		box-shadow:
			inset 0 1px 0 rgba(31, 30, 29, 0.32),
			0 0 0 0 rgba(217, 119, 87, 0);
		color: var(--rubin-ivory);
		font-family: var(--sched-mono);
		font-size: 0.698rem;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		cursor: pointer;
		transition:
			background 0.2s ease,
			border-color 0.2s ease,
			box-shadow 0.3s var(--sched-ease),
			transform 0.15s var(--sched-ease);
	}

	.scheduler__play:active:not(:disabled) {
		transform: translateY(1px);
	}

	.scheduler__play svg {
		width: 10px;
		height: 10px;
		fill: currentColor;
	}

	.scheduler__play:hover:not(:disabled) {
		background: linear-gradient(180deg, var(--rubin-clay), var(--rubin-clay));
		border-color: var(--rubin-clay);
		box-shadow:
			inset 0 1px 0 rgba(31, 30, 29, 0.4),
			0 0 22px -4px rgba(217, 119, 87, 0.55);
	}

	.scheduler__play:focus-visible {
		outline: 2px solid var(--sched-teal);
		outline-offset: 2px;
	}

	.scheduler__play:disabled,
	.scheduler__icon-btn:disabled {
		cursor: not-allowed;
		opacity: 0.42;
	}

	.scheduler__icon-btn {
		display: grid;
		place-items: center;
		height: 2.65rem;
		padding: 0;
		border: 1px solid var(--sched-line);
		background: transparent;
		color: var(--sched-muted);
		font-family: var(--sched-mono);
		font-size: 0.694rem;
		letter-spacing: 0.08em;
		cursor: pointer;
		transition:
			color 0.25s ease,
			border-color 0.25s ease;
	}

	.scheduler__icon-btn svg {
		width: 13px;
		height: 13px;
	}

	.scheduler__icon-btn:hover:not(:disabled) {
		border-color: var(--sched-line-strong);
		color: var(--sched-text);
	}

	.scheduler__icon-btn:focus-visible {
		outline: 2px solid var(--sched-teal);
		outline-offset: 2px;
	}

	.scheduler__timeline-line {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.scheduler__time {
		display: flex;
		align-items: baseline;
		gap: 0.4rem;
		font-family: var(--sched-mono);
		white-space: nowrap;
	}

	.scheduler__time-now {
		color: var(--sched-text);
		font-size: 0.72rem;
		letter-spacing: 0.04em;
		font-variant-numeric: tabular-nums;
	}

	.scheduler__time-total {
		color: var(--sched-faint);
		font-size: 0.672rem;
		letter-spacing: 0.08em;
	}

	.scheduler__chip {
		padding: 0.18rem 0.32rem;
		border: 1px solid rgba(43, 130, 114, 0.34);
		background: rgba(43, 130, 114, 0.06);
		color: var(--sched-teal);
		font-size: 0.646rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.scheduler__speed {
		display: inline-flex;
		align-items: center;
		gap: 0.18rem;
		padding: 0.14rem;
		border: 1px solid var(--sched-line);
		background: rgba(138, 130, 116, 0.16);
		font-family: var(--sched-mono);
		font-variant-numeric: tabular-nums;
	}

	.scheduler__speed-label {
		margin-right: 0.22rem;
		color: var(--sched-faint);
		font-size: 0.659rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.scheduler__speed-btn {
		padding: 0.22rem 0.4rem;
		border: 0;
		background: transparent;
		color: var(--sched-muted);
		font-family: var(--sched-mono);
		font-size: 0.672rem;
		font-variant-numeric: tabular-nums;
		cursor: pointer;
		transition:
			color 0.18s ease,
			background 0.18s ease;
	}

	.scheduler__speed-btn.is-active {
		background: rgba(217, 119, 87, 0.16);
		color: var(--sched-gold);
		box-shadow: inset 0 0 0 1px rgba(217, 119, 87, 0.4);
	}

	.scheduler__speed-btn:hover:not(.is-active) {
		color: var(--sched-text);
		background: rgba(138, 130, 116, 0.22);
	}

	.scheduler__speed-btn:focus-visible {
		outline: 2px solid var(--sched-teal);
		outline-offset: 1px;
	}

	.scheduler__metrics {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		border-top: 1px solid var(--sched-line);
		border-bottom: 1px solid var(--sched-line);
	}

	.scheduler__metric {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		column-gap: 0.28rem;
		padding: 0.52rem 0.7rem 0.5rem;
		border-right: 1px solid var(--sched-line);
	}

	.scheduler__metric:first-child {
		padding-left: 0;
	}

	.scheduler__metric:last-child {
		border-right: 0;
		padding-right: 0;
	}

	.scheduler__metric span {
		width: 100%;
		color: var(--sched-faint);
		font-family: var(--sched-mono);
		font-size: 0.659rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.scheduler__metric strong {
		margin-top: 0.32rem;
		color: var(--sched-text);
		font-size: 1.16rem;
		font-weight: 400;
		letter-spacing: -0.03em;
		line-height: 1;
		font-family: var(--sched-mono);
		font-variant-numeric: tabular-nums slashed-zero;
	}

	.scheduler__metric em {
		color: var(--sched-faint);
		font-family: var(--sched-mono);
		font-size: 0.646rem;
		font-style: normal;
	}

	.scheduler__plan-note {
		display: flex;
		flex-wrap: wrap;
		gap: 0.55rem;
		margin: -0.55rem 0 0;
		color: var(--sched-faint);
		font-family: var(--sched-mono);
		font-size: 0.653rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.scheduler__plan-note span + span::before {
		content: '·';
		margin-right: 0.55rem;
		color: var(--sched-line-strong);
	}

	.scheduler__processes {
		display: grid;
		gap: 1px;
	}

	.scheduler__process-head,
	.scheduler__row {
		display: grid;
		grid-template-columns: minmax(0, 0.72fr) minmax(0, 1.42fr) minmax(0, 0.78fr) minmax(0, 0.9fr);
		align-items: center;
		gap: 0.45rem;
	}

	.scheduler__process-head {
		padding-bottom: 0.2rem;
		color: var(--sched-faint);
		font-family: var(--sched-mono);
		font-size: 0.653rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.scheduler__process-head .is-right {
		text-align: right;
	}

	.scheduler__row {
		padding: 0.36rem 0.4rem;
		border: 1px solid transparent;
		border-top-color: var(--sched-line);
		background: transparent;
		color: var(--sched-muted);
		font-family: var(--sched-mono);
		font-variant-numeric: tabular-nums;
		text-align: left;
		cursor: pointer;
		transition:
			background 0.2s ease,
			border-color 0.2s ease;
	}

	.scheduler__row:hover {
		background: rgba(138, 130, 116, 0.19);
	}

	.scheduler__row:focus-visible {
		outline: 1px solid var(--sched-teal);
		outline-offset: -1px;
	}

	.scheduler__row.is-selected {
		border-color: rgba(217, 119, 87, 0.34);
		background: rgba(217, 119, 87, 0.05);
	}

	.scheduler__proc {
		display: inline-flex;
		align-items: center;
		gap: 0.38rem;
		color: var(--sched-text);
		font-size: 0.704rem;
		letter-spacing: 0.06em;
	}

	.scheduler__proc i {
		width: 6px;
		height: 6px;
		border-radius: 0;
	}

	.scheduler__burst {
		display: flex;
		align-items: baseline;
		gap: 0.32rem;
		color: var(--sched-muted);
		font-size: 0.698rem;
		line-height: 1.2;
	}

	.scheduler__burst em {
		color: var(--sched-faint);
		font-size: 0.64rem;
		font-style: normal;
		letter-spacing: 0.04em;
	}

	.scheduler__state {
		justify-self: start;
		padding: 0.16rem 0.3rem;
		border: 1px solid var(--sched-line);
		color: var(--sched-faint);
		font-size: 0.646rem;
		letter-spacing: 0.1em;
		line-height: 1;
		text-transform: uppercase;
	}

	.scheduler__state.is-run {
		border-color: rgba(217, 119, 87, 0.5);
		color: var(--sched-gold);
	}

	.scheduler__state.is-ready {
		border-color: rgba(43, 130, 114, 0.4);
		color: var(--sched-teal);
	}

	.scheduler__state.is-io {
		border-color: rgba(94, 126, 223, 0.38);
		color: var(--sched-violet);
	}

	.scheduler__state.is-done {
		opacity: 0.6;
	}

	.scheduler__remaining {
		justify-self: end;
		display: grid;
		gap: 0.22rem;
		width: 100%;
		color: var(--sched-text);
		font-size: 0.691rem;
		text-align: right;
		font-variant-numeric: tabular-nums;
	}

	.scheduler__remaining-track {
		display: block;
		width: 100%;
		height: 1px;
		background: rgba(138, 130, 116, 0.34);
	}

	.scheduler__remaining-track i {
		display: block;
		height: 100%;
		background: var(--sched-gold);
	}

	/* gantt ------------------------------------------------------------- */
	.scheduler__gantt-wrap {
		display: grid;
		gap: 0.4rem;
		margin-top: auto;
	}

	.scheduler__gantt-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.scheduler__gantt-head span {
		color: var(--sched-faint);
		font-family: var(--sched-mono);
		font-size: 0.646rem;
		letter-spacing: 0.08em;
	}

	.scheduler__gantt {
		position: relative;
		padding-bottom: 0.1rem;
	}

	.scheduler__gantt-rows {
		display: grid;
		gap: 2px;
	}

	.scheduler__gantt-row {
		display: grid;
		grid-template-columns: 2.2rem minmax(0, 1fr);
		align-items: center;
		gap: 0.45rem;
		height: 1.14rem;
	}

	.scheduler__gantt-label {
		color: var(--sched-faint);
		font-family: var(--sched-mono);
		font-size: 0.653rem;
		letter-spacing: 0.08em;
		line-height: 1;
	}

	.scheduler__gantt-plot {
		position: relative;
		height: 100%;
		overflow: hidden;
		background: rgba(138, 130, 116, 0.21);
		box-shadow: inset 0 0 0 1px rgba(138, 130, 116, 0.2);
	}

	.scheduler__bar {
		position: absolute;
		top: 3px;
		bottom: 3px;
		opacity: 0.9;
		border-radius: 0;
		box-shadow: inset 0 1px 0 rgba(31, 30, 29, 0.18);
	}

	.scheduler__bar.is-cpu {
		background: var(--sched-gold);
		opacity: 0.85;
	}

	.scheduler__bar.is-cpu.is-idle {
		background: repeating-linear-gradient(
			135deg,
			rgba(138, 130, 116, 0.32),
			rgba(138, 130, 116, 0.32) 2px,
			transparent 2px,
			transparent 5px
		);
		opacity: 0.7;
	}

	.scheduler__bar.is-process {
		opacity: 0.82;
	}

	.scheduler__bar.is-io {
		top: 5px;
		bottom: 5px;
		background: repeating-linear-gradient(
			135deg,
			rgba(94, 126, 223, 0.55),
			rgba(94, 126, 223, 0.55) 2px,
			rgba(94, 126, 223, 0.2) 2px,
			rgba(94, 126, 223, 0.2) 4px
		);
		opacity: 0.85;
	}

	.scheduler__gantt-overlay {
		position: absolute;
		top: 0;
		bottom: 0;
		left: 2.65rem;
		right: 0;
		cursor: ew-resize;
		touch-action: none;
	}

	.scheduler__gantt-overlay:focus-visible {
		outline: 2px solid rgba(43, 130, 114, 0.8);
		outline-offset: 2px;
	}

	.scheduler__gantt-future {
		position: absolute;
		top: 0;
		bottom: 0;
		right: 0;
		background: linear-gradient(90deg, color-mix(in srgb, var(--rubin-ivory) 50%, transparent), color-mix(in srgb, var(--rubin-ivory) 78%, transparent));
		pointer-events: none;
	}

	.scheduler__gantt-playhead {
		position: absolute;
		top: -2px;
		bottom: -2px;
		width: 2px;
		margin-left: -1px;
		background: var(--sched-teal);
		pointer-events: none;
		transition: left 90ms linear;
	}

	.scheduler__gantt-playhead::before {
		content: '';
		position: absolute;
		top: -2px;
		left: -2px;
		width: 6px;
		height: 6px;
		border-radius: 0;
		background: var(--sched-teal);
	}

	.scheduler__gantt-axis {
		position: relative;
		height: 1.1rem;
		margin-left: 2.65rem;
		color: var(--sched-faint);
		font-family: var(--sched-mono);
		font-size: 0.64rem;
		letter-spacing: 0.02em;
		font-variant-numeric: tabular-nums;
	}

	.scheduler__gantt-axis span {
		position: absolute;
		top: 0.3rem;
		transform: translateX(-50%);
	}

	.scheduler__gantt-axis span:first-child {
		transform: none;
	}

	.scheduler__gantt-axis span:last-child {
		transform: translateX(-100%);
	}

	.scheduler__hint {
		display: flex;
		flex-wrap: wrap;
		gap: 0.9rem;
		margin: 0;
		color: var(--sched-faint);
		font-family: var(--sched-mono);
		font-size: 0.646rem;
		letter-spacing: 0.06em;
		line-height: 1.6;
	}

	.scheduler__hint {
		text-shadow: none;
	}

	.scheduler__hint kbd {
		padding: 0.08rem 0.22rem;
		border: 1px solid var(--sched-line);
		color: var(--sched-muted);
		font-family: inherit;
		font-size: 0.64rem;
	}

	@keyframes sched-pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.35;
		}
	}

	@media (max-width: 1180px) {
		.scheduler {
			grid-template-columns: minmax(0, 1fr) 22rem;
		}

		.scheduler__intro {
			width: 58%;
		}

		.scheduler__lede {
			font-size: 0.76rem;
		}
	}

	@media (max-width: 920px) {
		.scheduler {
			grid-template-columns: minmax(0, 1fr);
			height: auto;
			min-height: 0;
			overflow: visible;
		}

		.scheduler__stage {
			height: 58svh;
			min-height: 26rem;
		}

		.scheduler__panel {
			max-height: none;
			padding: 1.4rem 1.1rem 1.6rem;
			border-top: 1px solid var(--sched-line);
			border-left: 0;
		}

		.scheduler__intro {
			top: 1.6rem;
			left: 1.2rem;
			width: 72%;
		}

		.scheduler__intro h1 {
			font-size: clamp(2rem, 7.4vw, 3.1rem);
		}

		.scheduler__eyebrow {
			margin-bottom: 1rem;
			font-size: 0.672rem;
		}

		.scheduler__lede {
			max-width: 20rem;
			margin-top: 1rem;
			font-size: 0.72rem;
			line-height: 1.6;
		}

		.scheduler__status {
			top: 1.55rem;
			right: 1rem;
			padding: 0.42rem 0.5rem;
			font-size: 0.646rem;
		}

		.scheduler__legend {
			display: none;
		}

		.scheduler__readout {
			right: 1.1rem;
			bottom: 1rem;
		}

		.scheduler__gantt-wrap {
			margin-top: 0.5rem;
		}
	}

	@media (max-width: 520px) {
		.scheduler__stage {
			height: 52svh;
			min-height: 23rem;
		}

		.scheduler__status-rule,
		.scheduler__status span:last-child {
			display: none;
		}

		.scheduler__transport {
			grid-template-columns: minmax(0, 1fr) 2.3rem 2.3rem 2.3rem;
		}

		.scheduler__timeline-line {
			flex-wrap: wrap;
			gap: 0.5rem;
		}

		.scheduler__process-head,
		.scheduler__row {
			grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr) minmax(0, 0.8fr) minmax(0, 0.8fr);
		}

		.scheduler__state {
			font-size: 0.634rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.scheduler__status-dot.is-live {
			animation: none;
		}

		.scheduler__gantt-playhead {
			transition: none;
		}

		.scheduler__canvas :global(canvas) {
			transition: none;
		}

		.algo,
		.scheduler__row,
		.scheduler__play,
		.scheduler__icon-btn {
			transition: none;
		}
	}

	/* Embedded (lesson) mode: the workbench stacks inside the article frame.
	   The canvas keeps the top, the dispatch controls move to a compact dock,
	   and the narrative overlays are suppressed (the lesson prose carries them). */
	.scheduler.is-embedded {
		height: 100%;
		min-height: 0;
		grid-template-columns: minmax(0, 1fr);
		grid-template-rows: minmax(0, 1fr) auto;
		background: transparent;
	}

	.scheduler.is-embedded .scheduler__stage {
		height: 100%;
		min-height: 0;
		background: none;
	}

	/* Transparent frame: the workbench floats on the page, the dock is the only chip. */
	.scheduler.is-embedded .scheduler__vignette {
		display: none;
	}

	.scheduler.is-embedded .scheduler__intro,
	.scheduler.is-embedded .scheduler__legend,
	.scheduler.is-embedded .scheduler__readout,
	.scheduler.is-embedded .scheduler__policy-desc,
	.scheduler.is-embedded .scheduler__metrics,
	.scheduler.is-embedded .scheduler__processes,
	.scheduler.is-embedded .scheduler__gantt-wrap,
	.scheduler.is-embedded .scheduler__hint {
		display: none;
	}

	.scheduler.is-embedded .scheduler__panel {
		width: 100%;
		max-height: 14rem;
		overflow-y: auto;
		border-left: 0;
		border-top: 1px solid var(--sched-line);
	}
</style>
