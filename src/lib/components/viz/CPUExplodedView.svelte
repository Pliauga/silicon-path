<script lang="ts">
	import { disposeObject3D } from '$lib/utils/three-dispose';
	import { getContext, onMount } from 'svelte';
	import { asset as resolveAsset } from '$app/paths';
	import { STUDY_FRAME, type StudyFrame } from './frame-mode';
	import type * as Three from 'three';
	import { createBloom, type Bloom } from '$lib/utils/bloom';
	import { createParallax, type Parallax } from '$lib/utils/parallax';

	type Layer = {
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
		/** Set by the Gallery route explicitly; lessons set it through LazyStudy's context. */
		embedded?: boolean;
	};

	let {
		id = 'cpu-exploded',
		eyebrow = 'Silicon Path / Package anatomy',
		title = 'Anatomy of a processor.',
		subtitle = 'Five layers, one machine. Scroll to separate the heat spreader, the silicon, and the substrate — and see how the core reaches the board.',
		scrollLabel = 'Scroll to disassemble',
		class: className = '',
		embedded = false
	}: Props = $props();

	const frame = getContext<StudyFrame | undefined>(STUDY_FRAME);
	const embeddedMode = $derived(embedded || frame?.embedded === true);


	const layers: Layer[] = [
		{
			index: '01',
			label: 'Heat spreader',
			detail: 'Nickel-plated IHS',
			description:
				'The integrated heat spreader is a nickel-plated copper lid. It protects the silicon and spreads heat from the small die across a larger surface for the cooler.'
		},
		{
			index: '02',
			label: 'Thermal interface',
			detail: 'Graphite TIM',
			description:
				'The thermal interface material fills the microscopic gap between the die and the heat spreader. It is the thermal bridge between silicon and metal.'
		},
		{
			index: '03',
			label: 'Silicon die',
			detail: '5 nm compute chiplets',
			description:
				'The die is the processor itself: billions of transistors arranged into cores, cache, memory controllers, and I/O. Here the compute complex is split into four chiplets around a central controller.'
		},
		{
			index: '04',
			label: 'Package substrate',
			detail: 'LGA interposer',
			description:
				'The package substrate is a dense, multi-layer circuit board. It routes thousands of microscopic die connections out to the land grid array on its underside.'
		},
		{
			index: '05',
			label: 'PCB',
			detail: 'FR-4 carrier',
			description:
				'The printed circuit board is the carrier. Copper traces, vias, and decoupling capacitors deliver power and carry signals between the processor package and the rest of the system.'
		}
	];

	/**
	 * Per-material finish. Values are absolute (not multipliers), so applying them is idempotent.
	 * Textured materials (solder mask, etched IHS, die floorplan) are authored with factors of 1,
	 * so `roughness` / `metalness` here scale the baked ORM texture channels.
	 * `env` is applied through `material.envMap` — three ignores `material.envMapIntensity`
	 * when the environment only comes from `scene.environment`.
	 */
	type Finish = { env: number; roughness?: number; metalness?: number; iridescence?: number };
	const finishes: Record<string, Finish> = {
		// PCB: deeper, glossier solder mask with less grey veiling from the environment.
		'pcb edge': { env: 0.8 },
		'pcb solder mask': { env: 0.82, roughness: 0.82 },
		'package substrate edge': { env: 0.9 },
		'package substrate top': { env: 0.88, roughness: 0.86 },
		'lga contacts': { env: 1.15 },
		'enig gold': { env: 1.22, roughness: 0.22 },
		'solder silver': { env: 1.1 },
		'capacitor ceramic': { env: 0.85 },
		// Silicon: glassier, brighter reflections so the die and chiplets catch the key light.
		silicon: { env: 1.5, roughness: 0.17, iridescence: 0.62 },
		'silicon floorplan': { env: 1.42, roughness: 0.78 },
		chiplet: { env: 1.55, roughness: 0.14, iridescence: 0.74 },
		'graphite tim': { env: 0.95, roughness: 0.4 },
		// Nickel IHS: slightly broader, softer highlights read as brushed rather than chrome.
		'nickel heat spreader': { env: 1.18, roughness: 0.3 },
		'ihs etched top': { env: 1.22, roughness: 1.22 },
		'ihs underside': { env: 0.9 },
		'underfill epoxy': { env: 0.8 }
	};

	const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);
	const easeInOutSine = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * x);
	const smoothstep = (x: number) => x * x * (3 - 2 * x);
	const smootherstep = (x: number) => x * x * x * (x * (x * 6 - 15) + 10);

	const explosion: Record<
		string,
		{ offset: [number, number, number]; rotation: [number, number, number] }
	> = {
		pcb: { offset: [0, -0.22, 0], rotation: [0, 0.1, 0] },
		interposer: { offset: [-0.18, 0.62, 0.18], rotation: [0.02, -0.08, 0] },
		die: { offset: [0.2, 1.38, 0.28], rotation: [-0.05, 0.16, 0.035] },
		tim: { offset: [-0.1, 2.04, 0.42], rotation: [0.07, -0.2, -0.035] },
		ihs: { offset: [0.06, 2.9, 0.12], rotation: [-0.12, 0.3, 0.045] }
	};

	type PartSpec = {
		name: string;
		object: Three.Object3D;
		basePosition: Three.Vector3;
		baseRotation: Three.Euler;
		offset: Three.Vector3;
		rotation: Three.Euler;
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
	let activeLayer = $state(0);
	let progress = $state(0);
	let announcement = $state('Loading the processor model.');

	const headingId = $derived(`${id}-title`);
	const summaryId = $derived(`${id}-summary`);
	const percentLabel = $derived(String(Math.round(progress * 100)).padStart(3, '0'));
	const phaseLabel = $derived(
		progress < 0.035 ? 'Assembled' : progress > 0.965 ? 'Separated' : 'Exploded view'
	);

	$effect(() => {
		if (loading) {
			announcement = 'Loading the processor model.';
			return;
		}
		if (error) {
			announcement =
				'The 3D processor model is unavailable. A written description of every package layer follows.';
			return;
		}
		const timer = window.setTimeout(() => {
			announcement =
				'Processor model ready. Scroll to separate the heat spreader, silicon die, substrate, and board.';
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
		let parts: PartSpec[] = [];
		let environmentTexture: Three.Texture | null = null;
		let keyLight: Three.DirectionalLight | null = null;

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

		const setAssembledPose = () => {
			for (const part of parts) {
				part.object.position.copy(part.basePosition);
				part.object.rotation.copy(part.baseRotation);
			}
		};

		const setExplodedPose = () => {
			for (const part of parts) {
				part.object.position.copy(part.basePosition).add(part.offset);
				part.object.rotation.set(
					part.baseRotation.x + part.rotation.x,
					part.baseRotation.y + part.rotation.y,
					part.baseRotation.z + part.rotation.z
				);
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
			const clamped = Math.max(0, Math.min(1, value));
			if (Math.abs(clamped - progress) > 0.002) {
				progress = clamped;
			}
			const step =
				clamped > 0.78 ? 4 : clamped > 0.58 ? 3 : clamped > 0.38 ? 2 : clamped > 0.16 ? 1 : 0;
			if (step !== activeLayer) {
				activeLayer = step;
			}
		};

		const updateCameraLayout = (aspect: number) => {
			if (!THREE) return;
			const frame = Math.max(1.05, 0.99 / Math.min(aspect, 1));
			const xOffset = aspect < 1 || embeddedMode ? 0 : -1.05;
			vStart = new THREE.Vector3(9.8, 7.1, 10.8).multiplyScalar(frame);
			vEnd = new THREE.Vector3(12, 8.4, 13.6).multiplyScalar(frame);
			tStart = new THREE.Vector3(xOffset, 0.42, 0);
			tEnd = new THREE.Vector3(xOffset, 1.52, 0);
		};

		const updateCamera = (value: number) => {
			if (!camera) return;
			const p = clamp01(value);
			// Three channels on three different curves: the dolly is the gentlest (sine), the lateral
			// arc follows a smoothstep, and the look-at target rises late (quintic, lagging) so the
			// camera trails the parts instead of moving in lockstep with them.
			const dolly = easeInOutSine(p);
			const arc = Math.sin(smoothstep(p) * Math.PI);
			const rise = smootherstep(clamp01((p - 0.06) / 0.94));
			camera.position.lerpVectors(vStart, vEnd, dolly);
			camera.position.x += arc * 0.42;
			camera.position.y += arc * 0.12;
			cameraTarget.lerpVectors(tStart, tEnd, rise);
			camera.lookAt(cameraTarget);
		};

		const updateScene = (value: number) => {
			const p = clamp01(value);
			updateCamera(p);
			if (modelRoot) {
				modelRoot.rotation.y = -0.3 + easeInOutSine(p) * 0.52;
			}
		};

		const configureMotion = () => {
			if (!parts.length) return;
			destroyTimeline();
			if (reducedMotion) {
				setExplodedPose();
				progress = 1;
				activeLayer = layers.length - 1;
				updateScene(1);
				needsRender = true;
				requestAnimationFrame(() => {
					if (!disposed) refreshScroll?.();
				});
				return;
			}

			setAssembledPose();
			progress = 0;
			activeLayer = 0;

			const starts: Record<string, number> = {
				ihs: 0,
				tim: 0.06,
				die: 0.14,
				interposer: 0.24,
				pcb: 0.34
			};
			const order = ['ihs', 'tim', 'die', 'interposer', 'pcb'];
			const tl = gsap.timeline({ paused: true, defaults: { ease: 'power3.inOut' } });

			for (const name of order) {
				const part = parts.find((candidate) => candidate.name === name);
				if (!part) continue;
				const target = part.basePosition.clone().add(part.offset);
				const rotation = part.baseRotation.clone();
				rotation.x += part.rotation.x;
				rotation.y += part.rotation.y;
				rotation.z += part.rotation.z;
				const start = starts[name] ?? 0;
				const duration = name === 'pcb' ? 0.7 : 0.66;
				// Position settles on a long deliberate curve; the tilt eases on a softer sine so the
				// parts finish translating just before they finish rotating.
				tl.to(
					part.object.position,
					{ x: target.x, y: target.y, z: target.z, duration, ease: 'power3.inOut' },
					start
				);
				tl.to(
					part.object.rotation,
					{ x: rotation.x, y: rotation.y, z: rotation.z, duration, ease: 'sine.inOut' },
					start
				);
			}

			// Trailing hold: parts rest in their final layout for the last ~10% of the scroll while
			// the camera finishes its dolly, so the end frame is composed rather than abrupt.
			tl.to({}, { duration: 0.12 }, '>');

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
				scrub: embeddedMode ? 1.5 : 1.8,
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
				renderer.toneMappingExposure = 1.1;
				renderer.shadowMap.enabled = true;
				renderer.shadowMap.type = THREE.PCFShadowMap;
				renderer.domElement.className = 'cpu-exploded__webgl';
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
					console.warn('[CPUExplodedView] HDRI environment failed to load.', environmentError);
				} finally {
					pmrem.dispose();
				}

				if (disposed) return;
				loadPercent = 24;

				// Key: warm, slightly lower and wider so it rakes across the heat spreader and die.
				keyLight = new THREE.DirectionalLight(0xfff0dc, 3.5);
				keyLight.position.set(6.4, 7.8, 4.4);
				keyLight.castShadow = true;
				keyLight.shadow.mapSize.set(1024, 1024);
				keyLight.shadow.camera.near = 0.5;
				keyLight.shadow.camera.far = 30;
				keyLight.shadow.camera.left = -5.5;
				keyLight.shadow.camera.right = 5.5;
				keyLight.shadow.camera.top = 6;
				keyLight.shadow.camera.bottom = -5.5;
				keyLight.shadow.bias = -0.0004;
				keyLight.shadow.normalBias = 0.025;
				keyLight.shadow.radius = 3;
				scene.add(keyLight);

				// Fill: cool and low, just enough to keep the shadow side from going muddy.
				const fill = new THREE.DirectionalLight(0x86a4ff, 1.2);
				fill.position.set(-6, 3, 4.5);
				scene.add(fill);

				// Rim: behind and left, stronger for crisp edge glints on the plates. Tint pulled toward
				// white so the nickel stays neutral instead of going teal.
				const rim = new THREE.DirectionalLight(0xa8e8e2, 2.9);
				rim.position.set(-4.4, 4.6, -7);
				scene.add(rim);

				const hemi = new THREE.HemisphereLight(0xf0eee6, 0x87867f, 0.5);
				scene.add(hemi);

				const ground = new THREE.Mesh(
					new THREE.PlaneGeometry(40, 40),
					new THREE.ShadowMaterial({ color: 0x1f1e1d, opacity: 0.22 })
				);
				ground.rotation.x = -Math.PI / 2;
				ground.position.y = -0.28;
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
					[3.9, 3.906],
					[4.55, 4.556]
				]) {
					const ring = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 128), ringMaterial);
					ring.rotation.x = -Math.PI / 2;
					ring.position.y = -0.278;
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

				const gltf = await loader.loadAsync(url('models/cpu-exploded.glb'), (event) => {
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

				const required = ['pcb', 'interposer', 'die', 'tim', 'ihs'];
				for (const name of required) {
					if (!gltf.scene.getObjectByName(name)) {
						throw new Error(`Model is missing the "${name}" package layer.`);
					}
				}

				const maxAnisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
// eslint-disable-next-line svelte/prefer-svelte-reactivity -- plain bookkeeping of three.js objects, never rendered
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
							const finish = finishes[pbr.name.toLowerCase()];
							if (environmentTexture) pbr.envMap = environmentTexture;
							pbr.envMapIntensity = finish?.env ?? 1;
							if (finish?.roughness !== undefined) pbr.roughness = finish.roughness;
							if (finish?.metalness !== undefined) pbr.metalness = finish.metalness;
							const physical = pbr as Three.MeshPhysicalMaterial;
							if (finish?.iridescence !== undefined && physical.isMeshPhysicalMaterial) {
								physical.iridescence = finish.iridescence;
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

				modelRoot = new THREE.Group();
				modelRoot.name = 'cpu-exploded-model';
				modelRoot.rotation.y = -0.3;
				modelRoot.add(gltf.scene);
				scene.add(modelRoot);

				parts = required.map((name) => {
					const object = gltf.scene.getObjectByName(name) as Three.Object3D;
					const config = explosion[name];
					return {
						name,
						object,
						basePosition: object.position.clone(),
						baseRotation: object.rotation.clone(),
						offset: new THREE.Vector3(...config.offset),
						rotation: new THREE.Euler(...config.rotation)
					};
				});

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

				parallax = createParallax(sectionEl, { strength: 0.4 });
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
				console.error('[CPUExplodedView]', cause);
				if (!disposed) {
					loading = false;
					ready = false;
					error =
						'This browser could not load the interactive 3D model. The written description below covers the same package anatomy.';
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
	class="cpu-exploded {className}"
	class:is-embedded={embeddedMode}
	class:is-ready={ready}
	style={`--p:${progress.toFixed(4)};--cue-opacity:${Math.max(0, 1 - progress * 2.4).toFixed(3)}`}
	data-reduced-motion={reducedMotion}
	aria-labelledby={embeddedMode ? undefined : headingId}
	aria-label={embeddedMode ? title : undefined}
	aria-describedby={summaryId}
>
	<div class="cpu-exploded__stage" aria-busy={loading}>
		<div class="cpu-exploded__canvas" bind:this={canvasHost}></div>
		<div class="cpu-exploded__vignette" aria-hidden="true"></div>
		<div class="cpu-exploded__grain" aria-hidden="true"></div>

		{#if !embeddedMode}
			<div class="cpu-exploded__intro">
				<p class="cpu-exploded__eyebrow">
					<span class="cpu-exploded__dot" aria-hidden="true"></span>
					{eyebrow}
				</p>
				<h2 id={headingId}>{title}</h2>
				<p class="cpu-exploded__lede">{subtitle}</p>
				{#if reducedMotion}
					<p class="cpu-exploded__static-note">Reduced motion · static exploded view</p>
				{:else}
					<div class="cpu-exploded__scroll-cue">
						<span class="cpu-exploded__scroll-rule" aria-hidden="true"></span>
						<span>{scrollLabel}</span>
					</div>
				{/if}
			</div>
		{/if}

		<div class="cpu-exploded__meta" aria-hidden="true">
			<span>SP—01</span>
			<span>5 NM</span>
			<span>16 CORE</span>
		</div>

		<ol class="cpu-exploded__layers" aria-label="Processor layers, top to bottom">
			{#each layers as layer, index (layer.index)}
				<li
					class:is-active={index === activeLayer}
					class:is-past={index < activeLayer}
					aria-current={index === activeLayer ? 'step' : undefined}
				>
					<span class="cpu-exploded__layer-index">{layer.index}</span>
					<span class="cpu-exploded__layer-name">{layer.label}</span>
					<span class="cpu-exploded__layer-detail">{layer.detail}</span>
				</li>
			{/each}
		</ol>

		<div class="cpu-exploded__readout" aria-hidden="true">
			<span class="cpu-exploded__phase">{phaseLabel}</span>
			<span class="cpu-exploded__track"><i></i></span>
			<span class="cpu-exploded__count">{percentLabel}<em> / 100</em></span>
		</div>


		<p class="cpu-exploded__sr" aria-live="polite">{announcement}</p>

		{#if loading}
			<div class="cpu-exploded__loader" role="status" aria-live="polite">
				<div class="cpu-exploded__loader-mark" aria-hidden="true">
					<span></span><span></span><span></span><span></span>
				</div>
				<p>Assembling the package</p>
				<div class="cpu-exploded__loader-track" aria-hidden="true">
					<i style={`width:${loadPercent}%`}></i>
				</div>
				<span class="cpu-exploded__loader-value" aria-hidden="true">{loadPercent}%</span>
			</div>
		{/if}

		{#if error}
			<div class="cpu-exploded__error" role="alert">
				<p class="cpu-exploded__error-title">3D view unavailable</p>
				<p>{error}</p>
			</div>
		{/if}

		<noscript>
			<p class="cpu-exploded__no-script">
				JavaScript is needed for the interactive 3D view. The description below covers the package
				anatomy.
			</p>
		</noscript>
	</div>

	<p id={summaryId} class="cpu-exploded__sr">
		A five-layer processor package: a nickel-plated heat spreader, graphite thermal interface, a
		silicon die with four compute chiplets, a multi-layer package substrate with a land grid array,
		and an FR-4 printed circuit board with copper traces and decoupling capacitors.
	</p>

	<div class="cpu-exploded__description">
		<details>
			<summary>Text description: processor package anatomy</summary>
			<p>
				The interactive model is a cutaway of a modern processor package. It separates from the top
				down into five functional layers.
			</p>
			<ol>
				{#each layers as layer (layer.index)}
					<li>
						<strong>{layer.index} · {layer.label}</strong>
						<span>{layer.description}</span>
					</li>
				{/each}
			</ol>
			<p>
				When assembled, the die sits at the centre of the package substrate. The thermal interface
				material couples the die to the heat spreader, and the substrate carries power and signals
				down to the circuit board.
			</p>
		</details>
	</div>
</section>

<style>
	.cpu-exploded {
		--ink: var(--rubin-slate);
		--muted: var(--rubin-muted);
		--faint: var(--rubin-muted);
		--line: rgba(138, 130, 116, 0.42);
		--line-strong: rgba(217, 119, 87, 0.7);
		--accent: var(--rubin-clay-ink);
		--cool: var(--rubin-teal-ink);
		position: relative;
		height: 290svh;
		min-height: 1400px;
		background: var(--rubin-ivory);
		color: var(--ink);
		font-family: var(--font-sans);
		isolation: isolate;
		font-feature-settings: 'cv11', 'ss03', 'tnum';
		-webkit-font-smoothing: antialiased;
		-moz-osx-font-smoothing: grayscale;
		text-rendering: optimizeLegibility;
	}

	.cpu-exploded *,
	.cpu-exploded *::before,
	.cpu-exploded *::after {
		box-sizing: border-box;
	}

	.cpu-exploded__stage {
		position: sticky;
		top: 0;
		height: 100svh;
		min-height: 520px;
		overflow: hidden;
		background:
			radial-gradient(90% 72% at 54% 43%, color-mix(in srgb, var(--rubin-ivory) 20%, transparent), transparent 66%),
			radial-gradient(46% 46% at 50% 50%, var(--rubin-ivory) 0%, var(--rubin-ivory) 76%);
	}

	.cpu-exploded__stage::before {
		content: '';
		position: absolute;
		inset: 0;
		z-index: 2;
		pointer-events: none;
		background:
			linear-gradient(180deg, color-mix(in srgb, var(--rubin-ivory) 80%, transparent) 0%, transparent 29%, transparent 74%, color-mix(in srgb, var(--rubin-ivory) 70%, transparent) 100%),
			linear-gradient(90deg, color-mix(in srgb, var(--rubin-ivory) 55%, transparent) 0%, transparent 36%);
	}

	.cpu-exploded__canvas {
		position: absolute;
		inset: 0;
		z-index: 1;
	}

	.cpu-exploded__canvas :global(canvas) {
		display: block;
		width: 100%;
		height: 100%;
		opacity: 0;
		transition: opacity 1.2s ease;
	}

	.cpu-exploded.is-ready .cpu-exploded__canvas :global(canvas) {
		opacity: 1;
	}

	.cpu-exploded__vignette {
		position: absolute;
		inset: 0;
		z-index: 2;
		pointer-events: none;
		box-shadow: inset 0 0 150px 30px color-mix(in srgb, var(--rubin-ivory) 82%, transparent);
	}

	.cpu-exploded__grain {
		position: absolute;
		inset: 0;
		z-index: 3;
		pointer-events: none;
		opacity: 0.055;
		mix-blend-mode: soft-light;
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.86' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.5'/%3E%3C/svg%3E");
		background-size: 160px 160px;
	}

	.cpu-exploded__intro {
		position: absolute;
		top: clamp(1.6rem, 7vh, 5.6rem);
		left: clamp(1.25rem, 5vw, 5rem);
		z-index: 4;
		width: min(27rem, 38vw);
		pointer-events: none;
	}

	.cpu-exploded__eyebrow {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		margin: 0 0 1.6rem;
		color: var(--muted);
		font-family: var(--font-mono);
		font-size: 0.625rem;
		font-weight: 500;
		letter-spacing: 0.2em;
		line-height: 1.5;
		text-transform: uppercase;
	}

	.cpu-exploded__dot {
		width: 5px;
		height: 5px;
		flex: 0 0 auto;
		border-radius: 0;
		background: var(--accent);
	}

	.cpu-exploded__intro h2 {
		max-width: 11ch;
		margin: 0;
		color: var(--rubin-slate);
		font-size: clamp(2.6rem, 4.4vw, 4.9rem);
		font-weight: 400;
		letter-spacing: -0.045em;
		line-height: 0.96;
		text-wrap: balance;
	}

	.cpu-exploded__lede {
		max-width: 24rem;
		margin: 1.6rem 0 0;
		color: var(--muted);
		font-size: 0.9rem;
		font-weight: 400;
		letter-spacing: -0.003em;
		line-height: 1.65;
		text-wrap: pretty;
	}

	.cpu-exploded__scroll-cue {
		display: flex;
		align-items: center;
		gap: 0.8rem;
		margin-top: 2.6rem;
		color: var(--faint);
		font-family: var(--font-mono);
		font-size: 0.625rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		opacity: var(--cue-opacity);
	}

	.cpu-exploded__scroll-rule {
		position: relative;
		display: block;
		width: 1px;
		height: 2.3rem;
		overflow: hidden;
		background: var(--line);
	}

	.cpu-exploded__scroll-rule::after {
		content: '';
		position: absolute;
		inset: 0;
		background: var(--accent);
		transform-origin: top;
		animation: cpu-cue 2.6s cubic-bezier(0.65, 0, 0.35, 1) infinite;
	}

	.cpu-exploded__static-note {
		margin-top: 1.7rem;
		color: var(--accent);
		font-family: var(--font-mono);
		font-size: 0.625rem;
		letter-spacing: 0.14em;
		line-height: 1.6;
		text-transform: uppercase;
	}

	.cpu-exploded__meta {
		position: absolute;
		top: clamp(1.7rem, 7vh, 5.7rem);
		right: clamp(1.25rem, 4vw, 4.5rem);
		z-index: 4;
		display: flex;
		gap: 1.25rem;
		color: var(--faint);
		font-family: var(--font-mono);
		font-size: 0.625rem;
		letter-spacing: 0.16em;
		line-height: 1;
	}

	.cpu-exploded__layers {
		position: absolute;
		top: 50%;
		right: clamp(1.15rem, 4vw, 4.5rem);
		z-index: 4;
		width: min(14.5rem, 21vw);
		margin: 0;
		padding: 0;
		list-style: none;
		transform: translateY(-50%);
		pointer-events: none;
	}

	.cpu-exploded__layers li {
		display: grid;
		grid-template-areas:
			'index name'
			'. detail';
		grid-template-columns: 2.1rem 1fr;
		padding: 0.7rem 0 0.64rem;
		border-top: 1px solid var(--line);
		color: var(--muted);
		opacity: 0.4;
		transition:
			opacity 0.6s cubic-bezier(0.22, 1, 0.36, 1),
			border-color 0.6s cubic-bezier(0.22, 1, 0.36, 1);
	}

	.cpu-exploded__layers li:last-child {
		border-bottom: 1px solid var(--line);
	}

	.cpu-exploded__layers li.is-past {
		opacity: 0.66;
	}

	.cpu-exploded__layers li.is-active {
		border-top-color: var(--line-strong);
		opacity: 1;
	}

	.cpu-exploded__layer-index {
		grid-area: index;
		padding-top: 0.08rem;
		color: var(--faint);
		font-family: var(--font-mono);
		font-size: 0.625rem;
		letter-spacing: 0.08em;
		transition: color 0.6s cubic-bezier(0.22, 1, 0.36, 1);
	}

	.cpu-exploded__layers li.is-active .cpu-exploded__layer-index {
		color: var(--accent);
	}

	.cpu-exploded__layer-name {
		grid-area: name;
		color: var(--rubin-slate);
		font-size: 0.8125rem;
		font-weight: 450;
		letter-spacing: -0.005em;
		line-height: 1.35;
	}

	.cpu-exploded__layer-detail {
		grid-area: detail;
		margin-top: 0.2rem;
		color: var(--faint);
		font-family: var(--font-mono);
		font-size: 0.5625rem;
		letter-spacing: 0.1em;
		line-height: 1.45;
		text-transform: uppercase;
	}

	.cpu-exploded__readout {
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

	.cpu-exploded__phase {
		color: var(--faint);
		font-family: var(--font-mono);
		font-size: 0.625rem;
		letter-spacing: 0.15em;
		text-transform: uppercase;
	}

	.cpu-exploded__track {
		position: relative;
		display: block;
		height: 1px;
		overflow: hidden;
		background: var(--line);
	}

	.cpu-exploded__track i {
		position: absolute;
		inset: 0;
		display: block;
		background: linear-gradient(90deg, rgba(217, 119, 87, 0.5), var(--accent));
		transform: scaleX(var(--p));
		transform-origin: left center;
	}

	.cpu-exploded__count {
		color: var(--muted);
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		letter-spacing: 0.08em;
		font-variant-numeric: tabular-nums;
	}

	.cpu-exploded__count em {
		color: var(--faint);
		font-style: normal;
	}

	.cpu-exploded__sr {
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

	.cpu-exploded__description {
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

	.cpu-exploded__description:focus-within {
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

	.cpu-exploded__description summary {
		cursor: pointer;
		color: var(--ink);
		font-family: var(--font-mono);
		font-size: 0.62rem;
		letter-spacing: 0.14em;
		line-height: 1.5;
		text-transform: uppercase;
	}

	.cpu-exploded__description p,
	.cpu-exploded__description li {
		color: var(--muted);
		font-size: 0.78rem;
		line-height: 1.65;
	}

	.cpu-exploded__description ol {
		padding-left: 1.1rem;
	}

	.cpu-exploded__description li {
		margin: 0.55rem 0;
	}

	.cpu-exploded__description strong {
		color: var(--ink);
		font-weight: 500;
	}

	.cpu-exploded__description li span {
		display: block;
		margin-top: 0.1rem;
	}

	.cpu-exploded__loader {
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
		font-family: var(--font-mono);
		font-size: 0.6rem;
		letter-spacing: 0.2em;
		text-transform: uppercase;
	}

	.cpu-exploded__loader p {
		margin: 0;
	}

	.cpu-exploded__loader-mark {
		position: relative;
		display: grid;
		grid-template-columns: repeat(2, 10px);
		grid-template-rows: repeat(2, 10px);
		gap: 5px;
		transform: rotate(45deg);
	}

	.cpu-exploded__loader-mark span {
		display: block;
		border: 1px solid rgba(217, 119, 87, 0.7);
		background: rgba(217, 119, 87, 0.08);
	}

	.cpu-exploded__loader-mark span:nth-child(2),
	.cpu-exploded__loader-mark span:nth-child(3) {
		background: rgba(43, 130, 114, 0.15);
	}

	.cpu-exploded__loader-track {
		position: relative;
		width: 10rem;
		height: 1px;
		overflow: hidden;
		background: var(--line);
	}

	.cpu-exploded__loader-track i {
		display: block;
		height: 100%;
		background: var(--accent);
		transition: width 0.4s ease;
	}

	.cpu-exploded__loader-value {
		color: var(--faint);
		font-size: 0.52rem;
		letter-spacing: 0.12em;
	}

	.cpu-exploded__error {
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

	.cpu-exploded__error p {
		margin: 0;
		color: var(--muted);
		font-size: 0.76rem;
		line-height: 1.65;
	}

	.cpu-exploded__error .cpu-exploded__error-title {
		margin-bottom: 0.45rem;
		color: var(--ink);
		font-family: var(--font-mono);
		font-size: 0.6rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
	}

	.cpu-exploded__no-script {
		position: absolute;
		right: 1.25rem;
		bottom: 4.4rem;
		left: 1.25rem;
		z-index: 8;
		margin: 0;
		color: var(--muted);
		font-size: 0.75rem;
	}

	@keyframes cpu-cue {
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
		.cpu-exploded__intro {
			width: min(24rem, 46vw);
		}

		.cpu-exploded__intro h2 {
			font-size: clamp(2.2rem, 5.3vw, 3.4rem);
		}

		.cpu-exploded__layers {
			width: 11.5rem;
		}

		.cpu-exploded__layer-detail {
			display: none;
		}
	}

	@media (max-width: 740px) {
		.cpu-exploded {
			height: 255svh;
			min-height: 1200px;
		}

		.cpu-exploded__stage {
			min-height: 540px;
		}

		.cpu-exploded__intro {
			top: 4.6rem;
			right: 1.25rem;
			left: 1.25rem;
			width: auto;
		}

		.cpu-exploded__eyebrow {
			margin-bottom: 0.9rem;
			font-size: 0.5625rem;
			letter-spacing: 0.16em;
		}

		.cpu-exploded__intro h2 {
			max-width: 11ch;
			font-size: clamp(2.2rem, 9.6vw, 3.2rem);
		}

		.cpu-exploded__lede {
			max-width: 19rem;
			margin-top: 0.9rem;
			font-size: 0.8125rem;
			line-height: 1.55;
		}

		.cpu-exploded__scroll-cue {
			margin-top: 1.25rem;
		}

		.cpu-exploded__meta {
			display: none;
		}

		.cpu-exploded__layers {
			top: auto;
			right: 1.25rem;
			bottom: 4.1rem;
			left: 1.25rem;
			display: flex;
			gap: 0.3rem;
			width: auto;
			transform: none;
		}

		.cpu-exploded__layers li {
			display: block;
			flex: 1;
			min-width: 0;
			padding: 0.48rem 0 0;
			border-top: 1px solid var(--line);
			border-bottom: 0;
		}

		.cpu-exploded__layers li:last-child {
			border-bottom: 0;
		}

		.cpu-exploded__layer-index {
			display: none;
		}

		.cpu-exploded__layer-name {
			display: block;
			overflow: hidden;
			font-size: 0.5625rem;
			letter-spacing: 0;
			line-height: 1.25;
			text-overflow: ellipsis;
		}

		.cpu-exploded__layer-detail {
			display: none;
		}

		.cpu-exploded__readout {
			bottom: 1rem;
			grid-template-columns: auto minmax(1rem, 1fr) auto;
			gap: 0.65rem;
		}

		.cpu-exploded__phase {
			font-size: 0.5625rem;
		}

		.cpu-exploded__count {
			font-size: 0.5625rem;
		}

		.cpu-exploded__count em {
			display: none;
		}

		.cpu-exploded__error {
			bottom: 6.4rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.cpu-exploded {
			height: auto;
			min-height: 0;
		}

		.cpu-exploded__stage {
			position: relative;
			height: min(88svh, 840px);
		}

		.cpu-exploded__scroll-cue {
			display: none;
		}

		.cpu-exploded__layers li,
		.cpu-exploded__layer-index {
			transition: none;
		}

		.cpu-exploded__canvas :global(canvas) {
			transition: none;
		}

		.cpu-exploded__scroll-rule::after {
			animation: none;
		}
	}

	/* Embedded (lesson) mode: the study fills a bounded frame instead of the
	   viewport, so the article column keeps its own scrollbar and typography. */
	.cpu-exploded.is-embedded {
		height: 100%;
		min-height: 0;
		background: transparent;
	}

	.cpu-exploded.is-embedded .cpu-exploded__stage {
		position: relative;
		top: auto;
		height: 100%;
		min-height: 0;
		background: none;
	}

	/* Transparent frame: the model floats on the page, its shadow grounds it. */
	.cpu-exploded.is-embedded .cpu-exploded__stage::before,
	.cpu-exploded.is-embedded .cpu-exploded__vignette,
	.cpu-exploded.is-embedded .cpu-exploded__grain {
		display: none;
	}

	.cpu-exploded.is-embedded .cpu-exploded__intro {
		max-width: 68%;
		padding: 1rem 1.15rem;
	}

	.cpu-exploded.is-embedded .cpu-exploded__intro h2 {
		margin: 0;
		font-size: 1.35rem;
		line-height: 1.2;
		letter-spacing: -0.01em;
	}

	.cpu-exploded.is-embedded .cpu-exploded__eyebrow,
	.cpu-exploded.is-embedded .cpu-exploded__lede,
	.cpu-exploded.is-embedded .cpu-exploded__scroll-cue,
	.cpu-exploded.is-embedded .cpu-exploded__meta,
	.cpu-exploded.is-embedded .cpu-exploded__layers,
	.cpu-exploded.is-embedded .cpu-exploded__readout,
	.cpu-exploded.is-embedded .cpu-exploded__description {
		display: none;
	}



</style>
