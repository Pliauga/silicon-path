<script lang="ts">
	import { disposeObject3D } from '$lib/utils/three-dispose';
	import { getContext, onMount } from 'svelte';
	import { STUDY_FRAME, type StudyFrame } from './frame-mode';
	import { asset as resolveAsset } from '$app/paths';
	import type * as Three from 'three';
	import { createBloom, type Bloom } from '$lib/utils/bloom';
	import { loadEnvironment, PREMIUM_HDRIS } from '$lib/utils/three-environment';
	import { createParallax, type Parallax } from '$lib/utils/parallax';
	import { warmEnvironment, WARM_AMBIENT } from '$lib/utils/warm-environment';

	type Stage = {
		index: string;
		label: string;
		detail: string;
		description: string;
	};

	type Props = {
		id?: string;
		eyebrow?: string;
		title?: string;
		subtitle?: string;
		scrollLabel?: string;
		class?: string;
		embedded?: boolean;
	};

	let {
		id = 'compiler-pipeline',
		eyebrow = 'Silicon Path / Toolchain assembly',
		title = 'From source to silicon.',
		subtitle = 'A translation unit rides the line: preprocessed, compiled to object code, linked, and emitted as an executable. Scroll to run the toolchain.',
		scrollLabel = 'Scroll to compile',
		class: className = '',
		embedded = false
	}: Props = $props();

	// A lesson frame (LazyStudy) is only ~500px tall; adapt to a compact scene
	// instead of the full-height scroll track used by the Gallery route.
	const frame = getContext<StudyFrame | undefined>(STUDY_FRAME);
	const embeddedMode = $derived(embedded || frame?.embedded === true);

	const stages: Stage[] = [
		{
			index: '01',
			label: 'Source',
			detail: 'Translation unit · .c',
			description:
				'A C source file and the headers it includes form a translation unit. The feeder stages the file on the belt; nothing has been interpreted yet.'
		},
		{
			index: '02',
			label: 'Preprocess',
			detail: 'Macros · includes · .i',
			description:
				'The preprocessor expands macros, resolves include directives, and strips comments. The result is a single, self-contained translation unit written as .i.'
		},
		{
			index: '03',
			label: 'Compile',
			detail: 'Parse · optimise · .o',
			description:
				'The compiler parses the translation unit, builds an intermediate representation, optimises it, and generates relocatable machine code. The output is an object file, .o.'
		},
		{
			index: '04',
			label: 'Link',
			detail: 'Relocate · resolve · .exe',
			description:
				'The linker resolves symbols across object files and libraries, relocates addresses, and writes the final executable. The .exe block is the artefact the operating system can run.'
		}
	];

	/**
	 * Per-material finish, keyed by lowercased glTF material name. Values are absolute, so applying
	 * them is idempotent. `env` is applied through `material.envMap` + `envMapIntensity`: three only
	 * reads `envMapIntensity` when the material owns an `envMap`, and once it does, the scene-wide
	 * `scene.environmentIntensity` no longer applies, so these numbers are the whole story.
	 * Textured materials keep their authored maps; `emissive` scales the authored emissive strength
	 * (captured once, so it never compounds) to keep the payload vivid without any bloom pass.
	 */
	type Finish = { env: number; roughness?: number; metalness?: number; emissive?: number };
	const finishes: Record<string, Finish> = {
		// Matte industrial rubber: the authored ORM map is ~0.88 rough / near-dielectric; a low env
		// level stops the HDRI from lifting it into a plastic sheen and keeps the chevrons legible.
		'conveyor belt': { env: 0.5 },
		// Brushed rails and rollers.
		'conveyor steel': { env: 1.0, roughness: 0.34, metalness: 0.92 },
		// Heavy anodised casings: dark dyed base colour, high metalness, a satin (not mirror) lobe so
		// the key and rim lights roll along the panels instead of pooling into hot spots.
		'machine dark': { env: 0.95, roughness: 0.46, metalness: 0.82 },
		'machine housing': { env: 1.15, roughness: 0.4, metalness: 0.88 },
		'machine accent': { env: 1.3, roughness: 0.22 },
		'gear bronze': { env: 1.24, roughness: 0.25 },
		'piston chrome': { env: 1.4, roughness: 0.12 },
		'blank stock': { env: 0.82 },
		'payload body': { env: 1.15, roughness: 0.18 },
		'plaque infeed': { env: 0.8, emissive: 1.1 },
		'plaque preprocess': { env: 0.8, emissive: 1.1 },
		'plaque compile': { env: 0.8, emissive: 1.1 },
		'plaque link': { env: 0.8, emissive: 1.1 },
		'plaque output': { env: 0.8, emissive: 1.1 },
		// Emissive payload faces: low reflection so the ACES shoulder does not wash the hue out.
		'label c': { env: 0.55, emissive: 1.25 },
		'label i': { env: 0.55, emissive: 1.25 },
		'label o': { env: 0.55, emissive: 1.25 },
		'label exe': { env: 0.55, emissive: 1.25 },
		'payload glow c': { env: 0.4, emissive: 1.3 },
		'payload glow i': { env: 0.4, emissive: 1.3 },
		'payload glow o': { env: 0.4, emissive: 1.3 },
		'payload glow exe': { env: 0.4, emissive: 1.3 },
		'aperture pre': { env: 0.9 },
		'aperture compile': { env: 0.9 },
		'aperture link': { env: 0.9 },
		'aperture output': { env: 0.9 },
		'beacon amber': { env: 0.8, emissive: 1.15 },
		'terminal screen': { env: 0.8, emissive: 1.1 }
	};

	const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);
	const easeInOutSine = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * x);
	const smoothstep = (x: number) => x * x * (3 - 2 * x);
	const smootherstep = (x: number) => x * x * x * (x * (x * 6 - 15) + 10);

	// Layout matches scripts/build-compiler-model.mjs.
	const BELT_START = -4.78;
	const BELT_END = 4.78;
	const PRESS_OFFSET = 0.54;
	const VARIANT_SWITCHES = [0.21, 0.45, 0.65];
	const STAGE_SWITCHES = [0.155, 0.37, 0.615];
	const VARIANT_COLORS = [0x7ff0df, 0x5ff0c8, 0xffb45c, 0x9cf5af];

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
	let activeStage = $state(0);
	let progress = $state(0);
	let announcement = $state('Loading the compiler pipeline model.');

	const headingId = $derived(`${id}-title`);
	const summaryId = $derived(`${id}-summary`);
	const percentLabel = $derived(String(Math.round(progress * 100)).padStart(3, '0'));
	const phaseLabel = $derived.by(() => {
		if (progress < 0.03) return 'Staged · .c';
		if (progress < VARIANT_SWITCHES[0]) return 'Preprocess · .c';
		if (progress < STAGE_SWITCHES[1]) return 'Preprocess · .i';
		if (progress < VARIANT_SWITCHES[1]) return 'Compile · .i';
		if (progress < STAGE_SWITCHES[2]) return 'Compile · .o';
		if (progress < VARIANT_SWITCHES[2]) return 'Link · .o';
		if (progress < 0.71) return 'Link · .exe';
		if (progress < 0.965) return 'Emit · .exe';
		return 'Executable · .exe';
	});

	$effect(() => {
		if (loading) {
			announcement = 'Loading the compiler pipeline model.';
			return;
		}
		if (error) {
			announcement =
				'The 3D toolchain model is unavailable. A written description of every compiler stage follows.';
			return;
		}
		const timer = window.setTimeout(() => {
			announcement =
				'Compiler pipeline ready. Scroll to move a source file through preprocessing, compilation, and linking.';
		}, 600);
		return () => window.clearTimeout(timer);
	});

	onMount(() => {
		let disposed = false;
		const loadAbort = new AbortController();
		let renderer: Three.WebGLRenderer | null = null;
		let bloom: Bloom | null = null;
		let scene: Three.Scene | null = null;
		let camera: Three.PerspectiveCamera | null = null;
		let modelRoot: Three.Group | null = null;
		let environmentTexture: Three.Texture | null = null;
		let keyLight: Three.DirectionalLight | null = null;
		let beltTextures: Three.Texture[] = [];
		let apertureSpecs: { material: Three.MeshStandardMaterial; base: number }[] = [];

		let payloadNode: Three.Object3D | null = null;
		let payloadVariants: Three.Object3D[] = [];
		let gearMain: Three.Object3D | null = null;
		let gearIdler: Three.Object3D | null = null;
		let pressRam: Three.Object3D | null = null;
		let glowLight: Three.PointLight | null = null;
		let pressBaseY = 0;

		let timeline: ActiveTimeline | null = null;
		let scrollTrigger: { kill(): void } | null = null;
		let refreshScroll: (() => void) | null = null;
		let resizeObserver: ResizeObserver | null = null;
		let intersectionObserver: IntersectionObserver | null = null;
		let motionQuery: MediaQueryList | null = null;
		let onMotionChange: ((event: MediaQueryListEvent) => void) | null = null;
		let dracoLoader: { dispose(): void } | null = null;
		let ktx2Loader: { dispose(): void } | null = null;
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
		let vStart!: Three.Vector3;
		let vEnd!: Three.Vector3;
		let tStart!: Three.Vector3;
		let tEnd!: Three.Vector3;
		let cameraTarget!: Three.Vector3;

		const variantFor = (value: number) => {
			const p = clamp01(value);
			if (p < VARIANT_SWITCHES[0]) return 0;
			if (p < VARIANT_SWITCHES[1]) return 1;
			if (p < VARIANT_SWITCHES[2]) return 2;
			return 3;
		};

		const stageFor = (value: number) => {
			const p = clamp01(value);
			if (p < STAGE_SWITCHES[0]) return 0;
			if (p < STAGE_SWITCHES[1]) return 1;
			if (p < STAGE_SWITCHES[2]) return 2;
			return 3;
		};

		const setPayloadVariant = (index: number) => {
			payloadVariants.forEach((node, nodeIndex) => {
				node.visible = nodeIndex === index;
			});
			glowLight?.color.setHex(VARIANT_COLORS[index]);
		};

		const resetPose = () => {
			if (payloadNode) payloadNode.position.x = BELT_START;
			if (pressRam) pressRam.position.y = pressBaseY;
			if (gearMain) gearMain.rotation.x = 0;
			if (gearIdler) gearIdler.rotation.x = 0;
			for (const texture of beltTextures) texture.offset.x = 0;
			for (const spec of apertureSpecs) spec.material.emissiveIntensity = spec.base;
			if (glowLight) glowLight.intensity = 2.4;
			setPayloadVariant(0);
		};

		const setFinalPose = () => {
			if (payloadNode) payloadNode.position.x = BELT_END;
			if (pressRam) pressRam.position.y = pressBaseY;
			if (gearMain) gearMain.rotation.x = Math.PI * 0.4;
			if (gearIdler) gearIdler.rotation.x = -Math.PI * 0.6;
			for (const texture of beltTextures) texture.offset.x = -3.4;
			for (const spec of apertureSpecs) spec.material.emissiveIntensity = spec.base;
			if (glowLight) glowLight.intensity = 2.4;
			setPayloadVariant(3);
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
			const clamped = Math.max(0, Math.min(1, value));
			if (Math.abs(clamped - progress) > 0.002) {
				progress = clamped;
			}
			const stage = stageFor(clamped);
			if (stage !== activeStage) {
				activeStage = stage;
			}
		};

		const updateCameraLayout = (aspect: number) => {
			if (!THREE) return;
			const frame = Math.max(1.06, 1.0 / Math.min(aspect, 1));
			// Embedded studies carry no text overlay, so the line stays centred.
			const xOffset = aspect < 1 || embeddedMode ? 0 : -1.15;
			tStart = new THREE.Vector3(-0.55 + xOffset, 1.38, 0);
			tEnd = new THREE.Vector3(1.35 + xOffset, 1.5, 0);
			// Pull the camera back along its view ray rather than scaling absolute positions, so the
			// off-centre look-at targets keep the line centred with breathing room on every edge.
			const pullback = 1.1;
			vStart = new THREE.Vector3(11.9, 7.5, 13.0)
				.multiplyScalar(frame)
				.sub(tStart)
				.multiplyScalar(pullback)
				.add(tStart);
			vEnd = new THREE.Vector3(10.5, 6.6, 11.7)
				.multiplyScalar(frame)
				.sub(tEnd)
				.multiplyScalar(pullback)
				.add(tEnd);
		};

		const updateCamera = (value: number) => {
			if (!camera) return;
			const p = clamp01(value);
			// Three channels on three different curves: the dolly is the gentlest (sine), the lateral
			// arc follows a smoothstep, and the look-at target is half payload position, half quintic
			// lead, so the camera drifts with the block toward the output gate without snapping.
			const dolly = easeInOutSine(p);
			const arc = Math.sin(smoothstep(p) * Math.PI);
			const lead = smootherstep(clamp01((p - 0.08) / 0.92));
			// Blend in the payload's real position along the belt so the look-at genuinely rides
			// with the block. The block dwells inside each machine, so a pure follow would stall and
			// lurch; the monotonic `lead` term keeps the target moving through every dwell.
			const beltU = payloadNode
				? clamp01((payloadNode.position.x - BELT_START) / (BELT_END - BELT_START))
				: lead;
			const track = beltU * 0.5 + lead * 0.5;
			camera.position.lerpVectors(vStart, vEnd, dolly);
			camera.position.x += arc * 0.5;
			camera.position.y += arc * 0.16;
			camera.position.z += arc * 0.3;
			cameraTarget.lerpVectors(tStart, tEnd, track);
			camera.lookAt(cameraTarget);
		};

		const updateScene = (value: number) => {
			if (!THREE) return;
			const p = clamp01(value);
			updateCamera(p);
			setPayloadVariant(variantFor(p));
			if (modelRoot) {
				modelRoot.rotation.y = -0.12 + easeInOutSine(p) * 0.2;
			}
		};

		const pulse = (
			tl: ReturnType<typeof gsap.timeline>,
			target: object,
			property: string,
			amount: number,
			at: number
		) => {
			tl.to(
				target,
				{
					[property]: amount,
					duration: 0.18,
					ease: 'sine.inOut',
					yoyo: true,
					repeat: 1
				},
				at
			);
		};

		const configureMotion = () => {
			if (!payloadNode || !gearMain || !gearIdler || !pressRam) return;
			destroyTimeline();

			if (reducedMotion) {
				setFinalPose();
				progress = 1;
				activeStage = stages.length - 1;
				updateScene(1);
				needsRender = true;
				requestAnimationFrame(() => {
					if (!disposed) refreshScroll?.();
				});
				return;
			}

			resetPose();
			progress = 0;
			activeStage = 0;

			const tl = gsap.timeline({ paused: true, defaults: { ease: 'none' } });

			// The belt runs continuously, even while a block dwells inside a machine.
			if (beltTextures.length) {
				tl.to(beltTextures.map((texture) => texture.offset), { x: -7.6, duration: 10 }, 0);
			}

			// Payload: feeder → preprocessor → compiler → linker → outfeed.
			tl.to(payloadNode.position, { x: -3.2, duration: 1.3, ease: 'sine.inOut' }, 0.25);
			tl.to(payloadNode.position, { x: 0, duration: 1.45, ease: 'sine.inOut' }, 2.25);
			tl.to(payloadNode.position, { x: 3.2, duration: 1.4, ease: 'sine.inOut' }, 4.75);
			tl.to(payloadNode.position, { x: BELT_END, duration: 1.2, ease: 'sine.inOut' }, 7.1);

			// Compiler gear train. The idler turns faster and the other way, as a meshed pair should.
			tl.to(gearMain.rotation, { x: Math.PI * 5.2, duration: 3.45 }, 2.2);
			tl.to(gearIdler.rotation, { x: -Math.PI * 5.2 * (18 / 12), duration: 3.45 }, 2.2);

			// Linker press: down, hold just long enough for the swap, then lift.
			tl.to(pressRam.position, { y: pressBaseY - PRESS_OFFSET, duration: 0.38, ease: 'power3.in' }, 6.12);
			tl.to(pressRam.position, { y: pressBaseY, duration: 0.36, ease: 'power2.out' }, 6.52);

			// Aperture flashes at the moment each machine commits its output.
			const flashes: [number, number][] = [
				[2.06, 0],
				[4.42, 1],
				[6.48, 2],
				[8.35, 3]
			];
			for (const [at, index] of flashes) {
				const spec = apertureSpecs[index];
				if (spec) pulse(tl, spec.material, 'emissiveIntensity', spec.base + 2.1, at);
			}
			if (glowLight) {
				for (const [at] of flashes) {
					pulse(tl, glowLight, 'intensity', 7.2, at);
				}
			}

			// Trailing hold so the output frame composes before the pinned section releases.
			tl.to({}, { duration: 0.4 }, '>');

			tl.eventCallback('onUpdate', () => {
				needsRender = true;
			});

			const trigger = ScrollTrigger.create({
				trigger: sectionEl,
				start: embeddedMode ? 'top bottom' : 'top top',
				end: embeddedMode ? 'bottom top' : 'bottom bottom',
				scrub: 1.8,
				animation: tl,
				invalidateOnRefresh: true,
				onUpdate: () => {
					needsRender = true;
				}
			});

			timeline = tl;
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
					gsapModule,
					scrollTriggerModule
				] = await Promise.all([
					import('three'),
					import('three/examples/jsm/loaders/GLTFLoader.js'),
					import('three/examples/jsm/loaders/DRACOLoader.js'),
					import('three/examples/jsm/loaders/KTX2Loader.js'),
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

				// MSAA only where it pays off: on 2x+ displays the 4x pixel count already hides edge
				// aliasing, so skipping the multisampled framebuffer saves fill-rate and memory.
				const devicePixelRatio = window.devicePixelRatio || 1;

				try {
					renderer = new THREE.WebGLRenderer({
						antialias: devicePixelRatio < 2,
						alpha: true,
						stencil: false,
						powerPreference: 'high-performance'
					});
				} catch {
					throw new Error('WebGL could not be created.');
				}

				renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
				renderer.setSize(width, height, false);
				renderer.setClearColor(0x000000, 0);
				renderer.outputColorSpace = THREE.SRGBColorSpace;
				renderer.toneMapping = THREE.ACESFilmicToneMapping;
				renderer.toneMappingExposure = 1.04;
				renderer.shadowMap.enabled = true;
				renderer.shadowMap.type = THREE.PCFShadowMap;
				renderer.domElement.className = 'compiler-pipeline__webgl';
				renderer.domElement.setAttribute('aria-hidden', 'true');
				canvasHost.appendChild(renderer.domElement);

				scene = new THREE.Scene();
				camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 100);
				cameraTarget = new THREE.Vector3();
				updateCameraLayout(width / height);
				updateCamera(0);

				loadPercent = 12;

				// Neutral studio cyclorama, warmed before PMREM so the ivory-and-clay
				// room keeps its current tint. `prepareHdr` runs for both the CDN and
				// bundled tiers, so the fallback stays colour-matched.
				const environment = await loadEnvironment(renderer, scene, loadAbort.signal, () => disposed, {
					premium: PREMIUM_HDRIS.monochromeStudio,
					fallbackUrl: url('hdri/studio_small_08_1k.hdr'),
					intensity: 0.84,
					label: 'CompilerPipeline',
					prepareHdr: warmEnvironment
				});
				if (disposed) {
					environment?.texture.dispose();
					return;
				}
				environmentTexture = environment?.texture ?? null;

				loadPercent = 24;

				// Key: warm and low, raking across the belt so the brass and the gear teeth catch it.
				keyLight = new THREE.DirectionalLight(0xfff0dc, 3.2);
				keyLight.position.set(7.2, 8.6, 5.2);
				keyLight.castShadow = true;
				keyLight.shadow.mapSize.set(2048, 2048);
				keyLight.shadow.camera.near = 0.5;
				keyLight.shadow.camera.far = 40;
				keyLight.shadow.camera.left = -8;
				keyLight.shadow.camera.right = 8;
				keyLight.shadow.camera.top = 8;
				keyLight.shadow.camera.bottom = -7;
				keyLight.shadow.bias = -0.0004;
				keyLight.shadow.normalBias = 0.025;
				keyLight.shadow.radius = 3;
				scene.add(keyLight);

				// Fill: cool and low, just enough to keep the shadow side from going muddy.
				const fill = new THREE.DirectionalLight(0x86a4ff, 1.2);
				fill.position.set(-6, 3, 4.5);
				scene.add(fill);

				// Rim: behind and left, stronger for crisp edge glints on the plates.
				const rim = new THREE.DirectionalLight(0xa8e8e2, 2.9);
				rim.position.set(-4.4, 4.6, -7);
				scene.add(rim);

				const hemi = new THREE.HemisphereLight(WARM_AMBIENT, 0x050607, 0.36);
				scene.add(hemi);

				const ground = new THREE.Mesh(
					new THREE.PlaneGeometry(40, 40),
					new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.38 })
				);
				ground.rotation.x = -Math.PI / 2;
				ground.position.y = -0.018;
				ground.receiveShadow = true;
				scene.add(ground);

				const ringMaterial = new THREE.MeshBasicMaterial({
					color: 0x7e9ba7,
					transparent: true,
					opacity: 0.13,
					depthWrite: false,
					side: THREE.DoubleSide
				});
				for (const [inner, outer] of [
					[6.0, 6.006],
					[6.85, 6.856]
				]) {
					const ring = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 160), ringMaterial);
					ring.rotation.x = -Math.PI / 2;
					ring.position.y = -0.016;
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

				const gltf = await loader.loadAsync(
					url('models/compiler-pipeline.glb'),
					(event) => {
						if (event.total > 0) {
							const value = 28 + (event.loaded / event.total) * 64;
							loadPercent = Math.max(loadPercent, Math.min(94, Math.round(value)));
						}
					}
				);

				if (disposed) return;
				draco.dispose();
				ktx2.dispose();
				dracoLoader = null;
				ktx2Loader = null;
				loadPercent = 96;

				const required = [
					'conveyor',
					'feeder',
					'outfeed',
					'station-preprocessor',
					'station-compiler',
					'station-linker',
					'gear-main',
					'gear-idler',
					'press-ram',
					'payload',
					'payload-c',
					'payload-i',
					'payload-o',
					'payload-exe'
				];
				for (const name of required) {
					if (!gltf.scene.getObjectByName(name)) {
						throw new Error(`Model is missing the "${name}" node.`);
					}
				}

				const maxAnisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
				const tunedMaterials = new Set<Three.Material>();
				gltf.scene.traverse((object) => {
					const mesh = object as Three.Mesh;
					if (!mesh.isMesh) return;
					mesh.castShadow = true;
					mesh.receiveShadow = true;
					const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
					for (const material of materials) {
						const pbr = material as Three.MeshStandardMaterial;
						if (!tunedMaterials.has(pbr)) {
							tunedMaterials.add(pbr);
							const key = (pbr.name || '').toLowerCase();
							const finish = finishes[key];
							// Golden Template: give every material the shared PMREM texture as its own
							// envMap, otherwise `envMapIntensity` is silently ignored.
							const sceneEnvironment = scene?.environment ?? environmentTexture;
							if (sceneEnvironment) pbr.envMap = sceneEnvironment;
							pbr.envMapIntensity = finish?.env ?? 1;
							if (finish?.emissive !== undefined && pbr.emissiveIntensity !== undefined) {
								pbr.emissiveIntensity *= finish.emissive;
							}
							if (finish?.roughness !== undefined) pbr.roughness = finish.roughness;
							if (finish?.metalness !== undefined) pbr.metalness = finish.metalness;

							if (key === 'conveyor belt') {
								if (pbr.map) beltTextures.push(pbr.map);
								if (pbr.metalnessMap) beltTextures.push(pbr.metalnessMap);
							}

							if (key.startsWith('aperture ')) {
								apertureSpecs.push({ material: pbr, base: pbr.emissiveIntensity });
							}
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

				// Keep the aperture records in pipeline order (pre, compile, link, output) so the
				// timeline can flash the right machine without another name lookup.
				apertureSpecs = ['aperture pre', 'aperture compile', 'aperture link', 'aperture output']
					.map((name) => apertureSpecs.find((spec) => spec.material.name.toLowerCase() === name))
					.filter((spec): spec is { material: Three.MeshStandardMaterial; base: number } =>
						Boolean(spec)
					);

				payloadNode = gltf.scene.getObjectByName('payload') as Three.Object3D;
				payloadNode.position.x = BELT_START;
				payloadVariants = ['payload-c', 'payload-i', 'payload-o', 'payload-exe']
					.map((name) => gltf.scene.getObjectByName(name))
					.filter((node): node is Three.Object3D => Boolean(node));
				gearMain = gltf.scene.getObjectByName('gear-main') as Three.Object3D;
				gearIdler = gltf.scene.getObjectByName('gear-idler') as Three.Object3D;
				pressRam = gltf.scene.getObjectByName('press-ram') as Three.Object3D;
				pressBaseY = pressRam.position.y;

				// A single travelling point light makes the payload feel hot as it enters each machine.
				glowLight = new THREE.PointLight(VARIANT_COLORS[0], 2.4, 4.2, 2);
				glowLight.position.set(0, 0.3, 0);
				glowLight.castShadow = false;
				payloadNode.add(glowLight);

				modelRoot = new THREE.Group();
				modelRoot.name = 'compiler-pipeline-model';
				modelRoot.rotation.y = -0.12;
				modelRoot.add(gltf.scene);
				scene.add(modelRoot);

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
					updateCamera(currentProgress());
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
				console.error('[CompilerPipeline]', cause);
				if (!disposed) {
					loading = false;
					ready = false;
					error =
						'This browser could not load the interactive 3D model. The written description below covers the same compiler stages.';
				}
			}
		};

		void initialise();

		return () => {
			loadAbort.abort();
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
			if (renderer) {
				renderer.setAnimationLoop(null);
				bloom?.dispose();
				bloom = null;
				renderer.forceContextLoss();
				renderer.dispose();
				renderer.domElement.remove();
			}
			if (modelRoot) disposeObject3D(modelRoot, [environmentTexture]);
			glowLight?.dispose();
			environmentTexture?.dispose();
			keyLight?.shadow.map?.dispose();
			scene = null;
			camera = null;
			renderer = null;
		};
	});
</script>

<section
	id={id}
	bind:this={sectionEl}
	class="compiler-pipeline {className}"
	class:is-ready={ready}
	class:is-embedded={embeddedMode}
	style={`--p:${progress.toFixed(4)};--cue-opacity:${Math.max(0, 1 - progress * 2.4).toFixed(3)}`}
	data-reduced-motion={reducedMotion}
	aria-labelledby={embeddedMode ? undefined : headingId}
	aria-label={embeddedMode ? title : undefined}
	aria-describedby={summaryId}
>
	<div class="compiler-pipeline__stage" aria-busy={loading}>
		<div class="compiler-pipeline__canvas" bind:this={canvasHost}></div>
		<div class="compiler-pipeline__vignette" aria-hidden="true"></div>
		<div class="compiler-pipeline__grain" aria-hidden="true"></div>

		{#if !embeddedMode}
			<div class="compiler-pipeline__intro">
				<p class="compiler-pipeline__eyebrow">
					<span class="compiler-pipeline__dot" aria-hidden="true"></span>
					{eyebrow}
				</p>
				<h2 id={headingId}>{title}</h2>
				<p class="compiler-pipeline__lede">{subtitle}</p>
				{#if reducedMotion}
					<p class="compiler-pipeline__static-note">Reduced motion · linked executable shown</p>
				{:else}
					<div class="compiler-pipeline__scroll-cue">
						<span class="compiler-pipeline__scroll-rule" aria-hidden="true"></span>
						<span>{scrollLabel}</span>
					</div>
				{/if}
			</div>
		{/if}

		<div class="compiler-pipeline__meta" aria-hidden="true">
			<span>SP—04</span>
			<span>C11</span>
			<span>X86-64</span>
		</div>

		<ol class="compiler-pipeline__stages" aria-label="Compiler stages, in order">
			{#each stages as stage, index (stage.index)}
				<li
					class:is-active={index === activeStage}
					class:is-past={index < activeStage}
					aria-current={index === activeStage ? 'step' : undefined}
				>
					<span class="compiler-pipeline__stage-index">{stage.index}</span>
					<span class="compiler-pipeline__stage-name">{stage.label}</span>
					<span class="compiler-pipeline__stage-detail">{stage.detail}</span>
				</li>
			{/each}
		</ol>

		<div class="compiler-pipeline__readout" aria-hidden="true">
			<span class="compiler-pipeline__phase">{phaseLabel}</span>
			<span class="compiler-pipeline__track"><i></i></span>
			<span class="compiler-pipeline__count">{percentLabel}<em> / 100</em></span>
		</div>

		<p class="compiler-pipeline__sr" aria-live="polite">{announcement}</p>

		{#if loading}
			<div class="compiler-pipeline__loader" role="status" aria-live="polite">
				<div class="compiler-pipeline__loader-mark" aria-hidden="true">
					<span></span><span></span><span></span><span></span>
				</div>
				<p>Spinning up the toolchain</p>
				<div class="compiler-pipeline__loader-track" aria-hidden="true">
					<i style={`width:${loadPercent}%`}></i>
				</div>
				<span class="compiler-pipeline__loader-value" aria-hidden="true">{loadPercent}%</span>
			</div>
		{/if}

		{#if error}
			<div class="compiler-pipeline__error" role="alert">
				<p class="compiler-pipeline__error-title">3D view unavailable</p>
				<p>{error}</p>
			</div>
		{/if}

		<noscript>
			<p class="compiler-pipeline__no-script">
				JavaScript is needed for the interactive 3D view. The description below covers the compiler
				stages.
			</p>
		</noscript>
	</div>

	<p id={summaryId} class="compiler-pipeline__sr">
		An isometric assembly line for a C toolchain: a feeder loads source, a preprocessor scanner expands
		it, a geared compiler station emits object code, and a linker press produces the final executable.
		</p>

	<div class="compiler-pipeline__description">
		<details>
			<summary>Text description: the compiler pipeline</summary>
			<p>
				The interactive model is a small factory. A glowing block representing a source file travels
				the conveyor from left to right, changing identity at every station.
			</p>
			<ol>
				{#each stages as stage (stage.index)}
					<li>
						<strong>{stage.index} · {stage.label}</strong>
						<span>{stage.description}</span>
					</li>
				{/each}
			</ol>
			<p>
				Between stations the belt keeps running; inside each machine the block is briefly hidden, then
				emerges with a new extension and a new colour. The last stop is the executable, ready to run.
			</p>
		</details>
	</div>
</section>

<style>
	.compiler-pipeline {
		--ink: var(--color-slate);
		--muted: var(--color-dark-gray);
		--faint: var(--text-muted);
		--line: rgba(138, 130, 116, 0.4);
		--line-strong: rgba(150, 63, 35, 0.7);
		--accent: var(--color-clay);
		--accent-ink: var(--color-clay-ink);
		--cool: var(--color-cyan);
		/* Premium Textbook tokens. Hosts may override these; the stacks fall back to local faces. */
		--font-heading: var(--font-display, 'Sorts Mill Goudy'), 'Goudy Old Style', 'Iowan Old Style', Georgia, serif;
		--font-body: var(--font-sans, 'Inter'), -apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'Segoe UI', sans-serif;
		--blueprint: rgba(68, 166, 228, 0.34);
		--blueprint-soft: rgba(138, 130, 116, 0.3);
		position: relative;
		height: 300svh;
		min-height: 1450px;
		max-width: 100%;
		background: transparent;
		color: var(--ink);
		font-family: var(--font-body);
		isolation: isolate;
		font-feature-settings: 'cv11', 'ss03', 'tnum';
		-webkit-font-smoothing: antialiased;
		-moz-osx-font-smoothing: grayscale;
		text-rendering: optimizeLegibility;
	}

	.compiler-pipeline *,
	.compiler-pipeline *::before,
	.compiler-pipeline *::after {
		box-sizing: border-box;
	}

	.compiler-pipeline__stage {
		position: sticky;
		top: 0;
		height: 100svh;
		min-height: 520px;
		overflow: hidden;
		background: transparent;
	}

	.compiler-pipeline__stage::before {
		content: '';
		position: absolute;
		inset: 0;
		z-index: 2;
		pointer-events: none;
		background: transparent;
	}

	.compiler-pipeline__canvas {
		position: absolute;
		inset: 0;
		z-index: 1;
	}

	.compiler-pipeline__canvas :global(canvas) {
		display: block;
		width: 100%;
		height: 100%;
		opacity: 0;
		transition: opacity 1.2s ease;
	}

	.compiler-pipeline.is-ready .compiler-pipeline__canvas :global(canvas) {
		opacity: 1;
	}

	.compiler-pipeline__vignette {
		position: absolute;
		inset: 0;
		z-index: 2;
		pointer-events: none;
		display: none;
	}

	.compiler-pipeline__grain {
		position: absolute;
		inset: 0;
		z-index: 3;
		pointer-events: none;
		display: none;
		opacity: 0.055;
		mix-blend-mode: soft-light;
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.86' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.5'/%3E%3C/svg%3E");
		background-size: 160px 160px;
	}

	.compiler-pipeline__intro {
		position: absolute;
		top: clamp(5.2rem, 9vh, 6.4rem);
		left: clamp(1.25rem, 5vw, 5rem);
		z-index: 4;
		width: min(27rem, 38vw);
		pointer-events: none;
	}

	.compiler-pipeline__eyebrow {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		margin: 0 0 1.6rem;
		color: var(--muted);
		font-family: var(--font-body);
		font-size: 0.625rem;
		font-weight: 500;
		letter-spacing: 0.2em;
		line-height: 1.5;
		text-transform: uppercase;
	}

	.compiler-pipeline__dot {
		width: 5px;
		height: 5px;
		flex: 0 0 auto;
		border-radius: 0;
		background: var(--accent);
	}

	.compiler-pipeline__intro h2 {
		max-width: 12ch;
		margin: 0;
		color: var(--color-slate);
		font-family: var(--font-heading);
		font-size: clamp(2.7rem, 4.5vw, 5rem);
		font-weight: 400;
		font-feature-settings: 'liga', 'dlig', 'onum';
		letter-spacing: -0.018em;
		line-height: 1.02;
		text-wrap: balance;
	}

	.compiler-pipeline__lede {
		max-width: 24rem;
		margin: 1.6rem 0 0;
		color: var(--muted);
		font-size: 0.9rem;
		font-weight: 400;
		letter-spacing: -0.003em;
		line-height: 1.65;
		text-wrap: pretty;
	}

	.compiler-pipeline__scroll-cue {
		display: flex;
		align-items: center;
		gap: 0.8rem;
		margin-top: 2.6rem;
		color: var(--faint);
		font-family: var(--font-body);
		font-size: 0.625rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		opacity: var(--cue-opacity);
	}

	.compiler-pipeline__scroll-rule {
		position: relative;
		display: block;
		width: 1px;
		height: 2.3rem;
		overflow: hidden;
		background: var(--line);
	}

	.compiler-pipeline__scroll-rule::after {
		content: '';
		position: absolute;
		inset: 0;
		background: var(--accent);
		transform-origin: top;
		animation: compiler-cue 2.6s cubic-bezier(0.65, 0, 0.35, 1) infinite;
	}

	@keyframes compiler-cue {
		0% {
			transform: scaleY(0);
			opacity: 0;
		}
		30% {
			opacity: 1;
		}
		70% {
			transform: scaleY(1);
			opacity: 1;
		}
		100% {
			transform: scaleY(1);
			opacity: 0;
		}
	}

	.compiler-pipeline__static-note {
		margin-top: 1.7rem;
		color: var(--accent-ink);
		font-family: var(--font-body);
		font-size: 0.625rem;
		letter-spacing: 0.14em;
		line-height: 1.6;
		text-transform: uppercase;
	}

	.compiler-pipeline__meta {
		position: absolute;
		top: clamp(5.25rem, 9vh, 6.45rem);
		right: clamp(1.25rem, 4vw, 4.5rem);
		z-index: 4;
		display: flex;
		gap: 1.25rem;
		color: var(--faint);
		font-family: var(--font-body);
		font-size: 0.625rem;
		letter-spacing: 0.16em;
		line-height: 1;
	}

	.compiler-pipeline__stages {
		position: absolute;
		top: 50%;
		right: clamp(1.15rem, 4vw, 4.5rem);
		z-index: 4;
		width: min(16rem, 22vw);
		margin: 0;
		padding: 0.35rem 0.9rem;
		border: 1px solid var(--blueprint-soft);
		list-style: none;
		transform: translateY(-50%);
		pointer-events: none;
	}

	/* Blueprint registration ticks on two opposite corners of the rail. */
	.compiler-pipeline__stages::before,
	.compiler-pipeline__stages::after {
		content: '';
		position: absolute;
		width: 9px;
		height: 9px;
		border: 1px solid var(--accent);
		pointer-events: none;
	}

	.compiler-pipeline__stages::before {
		top: -1px;
		left: -1px;
		border-right: 0;
		border-bottom: 0;
	}

	.compiler-pipeline__stages::after {
		right: -1px;
		bottom: -1px;
		border-top: 0;
		border-left: 0;
	}

	.compiler-pipeline__stages li {
		display: grid;
		grid-template-areas:
			'index name'
			'. detail';
		grid-template-columns: 2.1rem 1fr;
		padding: 0.7rem 0 0.64rem;
		border-top: 1px dashed var(--blueprint-soft);
		color: var(--muted);
		opacity: 0.4;
		transition:
			opacity 0.6s cubic-bezier(0.22, 1, 0.36, 1),
			border-color 0.6s cubic-bezier(0.22, 1, 0.36, 1);
	}

	.compiler-pipeline__stages li:first-child {
		border-top-color: transparent;
	}

	.compiler-pipeline__stages li.is-past {
		opacity: 0.66;
	}

	.compiler-pipeline__stages li.is-active {
		border-top-style: solid;
		border-top-color: var(--line-strong);
		opacity: 1;
	}

	.compiler-pipeline__stages li.is-active:first-child {
		border-top-color: transparent;
	}

	.compiler-pipeline__stage-index {
		grid-area: index;
		padding-top: 0.08rem;
		color: var(--faint);
		font-family: var(--font-body);
		font-size: 0.625rem;
		letter-spacing: 0.08em;
		transition: color 0.6s cubic-bezier(0.22, 1, 0.36, 1);
	}

	.compiler-pipeline__stages li.is-active .compiler-pipeline__stage-index {
		color: var(--accent-ink);
	}

	.compiler-pipeline__stage-name {
		grid-area: name;
		color: var(--color-slate);
		font-family: var(--font-heading);
		font-size: 1.0625rem;
		font-weight: 400;
		letter-spacing: 0.002em;
		line-height: 1.25;
	}

	.compiler-pipeline__stage-detail {
		grid-area: detail;
		margin-top: 0.2rem;
		color: var(--faint);
		font-family: var(--font-body);
		font-size: 0.5625rem;
		letter-spacing: 0.1em;
		line-height: 1.45;
		text-transform: uppercase;
	}

	.compiler-pipeline__readout {
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

	.compiler-pipeline__phase {
		color: var(--faint);
		font-family: var(--font-body);
		font-size: 0.625rem;
		letter-spacing: 0.15em;
		text-transform: uppercase;
	}

	.compiler-pipeline__track {
		position: relative;
		display: block;
		height: 1px;
		overflow: hidden;
		background: var(--line);
	}

	.compiler-pipeline__track i {
		position: absolute;
		inset: 0;
		background: linear-gradient(90deg, var(--cool), var(--accent));
		transform: scaleX(var(--p));
		transform-origin: left;
	}

	.compiler-pipeline__count {
		color: var(--color-slate);
		font-family: var(--font-body);
		font-size: 0.625rem;
		letter-spacing: 0.1em;
		font-variant-numeric: tabular-nums;
	}

	.compiler-pipeline__count em {
		color: var(--faint);
		font-style: normal;
	}

	.compiler-pipeline__sr {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		padding: 0;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
		border: 0;
	}

	.compiler-pipeline__loader {
		position: absolute;
		inset: 0;
		z-index: 6;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.85rem;
		background: transparent;
	}

	.compiler-pipeline__loader p {
		margin: 0;
		color: var(--color-slate);
		font-family: var(--font-body);
		font-size: 0.625rem;
		letter-spacing: 0.2em;
		text-transform: uppercase;
	}

	.compiler-pipeline__loader-mark {
		display: flex;
		gap: 0.4rem;
		margin-bottom: 0.4rem;
	}

	.compiler-pipeline__loader-mark span {
		width: 8px;
		height: 8px;
		border: 1px solid var(--color-clay);
		transform: rotate(45deg);
		animation: compiler-loader 1.4s ease-in-out infinite;
	}

	.compiler-pipeline__loader-mark span:nth-child(2) {
		animation-delay: 0.15s;
		border-color: var(--color-cyan);
	}

	.compiler-pipeline__loader-mark span:nth-child(3) {
		animation-delay: 0.3s;
	}

	.compiler-pipeline__loader-mark span:nth-child(4) {
		animation-delay: 0.45s;
		border-color: var(--color-cyan);
	}

	@keyframes compiler-loader {
		0%,
		100% {
			opacity: 0.25;
			transform: rotate(45deg) scale(0.82);
		}
		50% {
			opacity: 1;
			transform: rotate(45deg) scale(1);
		}
	}

	.compiler-pipeline__loader-track {
		width: 168px;
		height: 1px;
		overflow: hidden;
		background: var(--line);
	}

	.compiler-pipeline__loader-track i {
		display: block;
		height: 100%;
		background: linear-gradient(90deg, var(--cool), var(--accent));
		transition: width 0.4s ease;
	}

	.compiler-pipeline__loader-value {
		color: var(--color-slate);
		font-family: var(--font-body);
		font-size: 0.5625rem;
		letter-spacing: 0.12em;
	}

	.compiler-pipeline__error,
	.compiler-pipeline__no-script {
		position: absolute;
		inset: 50% auto auto 50%;
		z-index: 6;
		width: min(24rem, calc(100% - 3rem));
		margin: 0;
		padding: 1.6rem 1.7rem;
		border: 1px solid var(--line);
		background: var(--color-paper);
		color: var(--muted);
		font-size: 0.8125rem;
		line-height: 1.6;
		transform: translate(-50%, -50%);
	}

	.compiler-pipeline__error-title {
		margin: 0 0 0.5rem;
		color: var(--accent-ink);
		font-family: var(--font-body);
		font-size: 0.625rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
	}

	.compiler-pipeline__error p:last-child {
		margin: 0;
	}

	.compiler-pipeline__description {
		position: relative;
		z-index: 1;
		max-width: 46rem;
		margin: 0 auto;
		padding: 4rem clamp(1.25rem, 5vw, 5rem) 5rem;
		border-top: 1px solid rgba(138, 130, 116, 0.3);
		color: var(--muted);
		font-size: 0.875rem;
		line-height: 1.7;
	}

	.compiler-pipeline__description summary {
		cursor: pointer;
		color: var(--color-slate);
		font-family: var(--font-body);
		font-size: 0.625rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
	}

	.compiler-pipeline__description p {
		margin: 1.2rem 0;
	}

	.compiler-pipeline__description ol {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.compiler-pipeline__description li {
		display: grid;
		gap: 0.35rem;
		padding: 0.9rem 0;
		border-top: 1px solid rgba(138, 130, 116, 0.3);
	}

	.compiler-pipeline__description li strong {
		color: var(--accent-ink);
		font-family: var(--font-body);
		font-size: 0.625rem;
		font-weight: 500;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	@media (max-width: 900px) {
		.compiler-pipeline__intro {
			top: clamp(5.2rem, 10vh, 7rem);
			width: min(26rem, calc(100vw - 2.5rem));
		}

		.compiler-pipeline__intro h2 {
			font-size: clamp(2.4rem, 8vw, 3.6rem);
		}

		.compiler-pipeline__lede {
			max-width: 21rem;
			font-size: 0.85rem;
		}

		.compiler-pipeline__meta,
		.compiler-pipeline__stages {
			display: none;
		}
	}

	@media (max-width: 560px) {
		.compiler-pipeline__intro {
			top: 5.4rem;
		}

		.compiler-pipeline__eyebrow {
			margin-bottom: 1.1rem;
			font-size: 0.5625rem;
			letter-spacing: 0.16em;
		}

		.compiler-pipeline__intro h2 {
			font-size: 2.5rem;
			line-height: 1;
		}

		.compiler-pipeline__lede {
			margin-top: 1.1rem;
			line-height: 1.55;
		}

		.compiler-pipeline__readout {
			grid-template-columns: auto minmax(1.5rem, 1fr) auto;
			gap: 0.6rem;
		}

		.compiler-pipeline__phase,
		.compiler-pipeline__count {
			font-size: 0.5625rem;
			letter-spacing: 0.1em;
		}
	}

	.compiler-pipeline.is-embedded {
		height: 100%;
		min-height: 0;
		background: transparent;
	}

	.compiler-pipeline.is-embedded .compiler-pipeline__stage {
		position: relative;
		top: auto;
		height: 100%;
		min-height: 0;
		background: none;
	}

	.compiler-pipeline.is-embedded .compiler-pipeline__vignette,
	.compiler-pipeline.is-embedded .compiler-pipeline__grain,
	.compiler-pipeline.is-embedded .compiler-pipeline__meta,
	.compiler-pipeline.is-embedded .compiler-pipeline__stages,
	.compiler-pipeline.is-embedded .compiler-pipeline__readout,
	.compiler-pipeline.is-embedded .compiler-pipeline__description {
		display: none;
	}

	.compiler-pipeline.is-embedded .compiler-pipeline__intro {
		max-width: 68%;
		padding: 1rem 1.15rem;
	}

	.compiler-pipeline.is-embedded .compiler-pipeline__intro h2 {
		margin: 0;
		font-size: 1.35rem;
		line-height: 1.2;
		letter-spacing: -0.01em;
	}

	.compiler-pipeline.is-embedded .compiler-pipeline__eyebrow,
	.compiler-pipeline.is-embedded .compiler-pipeline__lede,
	.compiler-pipeline.is-embedded .compiler-pipeline__scroll-cue {
		display: none;
	}

	@media (prefers-reduced-motion: reduce) {
		.compiler-pipeline__scroll-rule::after,
		.compiler-pipeline__loader-mark span {
			animation: none;
		}

		.compiler-pipeline__canvas :global(canvas) {
			transition: none;
		}
	}
</style>