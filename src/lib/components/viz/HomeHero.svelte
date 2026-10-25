<script lang="ts">
	import { disposeObject3D } from '$lib/utils/three-dispose';
	import { onMount } from 'svelte';
	import { asset as resolveAsset } from '$app/paths';
	import type * as Three from 'three';
	import { createBloom, type Bloom } from '$lib/utils/bloom';
	import { loadEnvironment, PREMIUM_HDRIS } from '$lib/utils/three-environment';
	import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';

	type Props = {
		id?: string;
		eyebrow?: string;
		title?: string;
		subtitle?: string;
		moduleAnchor?: string;
		class?: string;
	};

	let {
		id = 'home-hero',
		eyebrow = '01 / Silicon Path',
		title = 'From source code to silicon.',
		subtitle = 'One package, four layers: heat spreader, silicon, substrate, carrier. Scroll to open the stack before the module index begins.',
		moduleAnchor = '#module-grid',
		class: className = ''
	}: Props = $props();

	const url = (path: Parameters<typeof resolveAsset>[0]) => resolveAsset(`/${path}`);
	const decoderPath = (file: Parameters<typeof resolveAsset>[0]) =>
		resolveAsset(`/${file}`).replace(/[^/]*$/, '');

	const MODEL_URL = url('models/hero-chip.glb');
	const HDRI_URL = url('hdri/studio_small_08_1k.hdr');

	/** Scroll choreography, in scene units, keyed to the hero nodes. */
	const layerMotion = [
		{ node: 'hero-ihs', lift: 3.9, spin: 0.22, delay: 0, fade: [0.6, 0.86] as const },
		{ node: 'hero-die', lift: 2.65, spin: -0.28, delay: 0.05, fade: [0.65, 0.91] as const },
		{ node: 'hero-substrate', lift: 1.4, spin: 0.12, delay: 0.1, fade: [0.7, 0.95] as const },
		{ node: 'hero-carrier', lift: 0.05, spin: -0.05, delay: 0.15, fade: [0.76, 1] as const }
	];

	/**
	 * Per-material finish, keyed by lower-cased glTF material name. Values are absolute, so applying
	 * them is idempotent. Textured materials (etched IHS, die floorplan, substrate) carry baked ORM
	 * channels, so `roughness` / `metalness` here scale those channels rather than replace them.
	 * `env` is only honoured because every material gets `envMap = scene.environment`: three ignores
	 * `envMapIntensity` (and uses `scene.environmentIntensity` instead) on materials without an envMap.
	 */
	type Finish = { env: number; roughness?: number; metalness?: number; iridescence?: number };
	const finishes: Record<string, Finish> = {
		'hero carrier edge': { env: 0.8 },
		'hero carrier top': { env: 0.85, roughness: 0.92 },
		'hero carrier gold': { env: 1.25 },
		'hero substrate edge': { env: 0.9 },
		'hero substrate top': { env: 0.9, roughness: 0.9 },
		'hero substrate gold': { env: 1.25 },
		'hero ceramic': { env: 0.85 },
		'hero silver': { env: 1.15 },
		'hero lga contacts': { env: 1.15 },
		// Silicon: glassy, with a strong thin-film response so the die throws rainbow on the key light.
		'hero silicon': { env: 1.55, roughness: 0.14, iridescence: 0.82 },
		'hero die floorplan': { env: 1.45, roughness: 0.72, iridescence: 0.9 },
		'hero chiplet': { env: 1.6, roughness: 0.11, iridescence: 0.92 },
		'hero die microbump': { env: 1.2 },
		'hero underfill': { env: 0.8 },
		'hero graphite tim': { env: 0.95 },
		// Nickel IHS: a slightly broader, softer lobe reads as brushed rather than chrome, while the
		// higher env weight gives the flat lid a long, graded reflection instead of a flat grey.
		'hero ihs metal': { env: 1.3, roughness: 0.36 },
		'hero ihs etched top': { env: 1.35, roughness: 1.12 },
		'hero ihs underside': { env: 0.9 },
		'hero ihs bevel': { env: 1.5, roughness: 0.26 },
		'hero ihs seal': { env: 1.3 }
	};

	const headingId = $derived(`${id}-title`);
	const summaryId = $derived(`${id}-summary`);
	const liveId = $derived(`${id}-live`);

	const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
	const smoothstep = (value: number) => {
		const t = clamp01(value);
		return t * t * (3 - 2 * t);
	};
	const smootherstep = (value: number) => {
		const t = clamp01(value);
		return t * t * t * (t * (t * 6 - 15) + 10);
	};

	let sectionEl = $state<HTMLElement>();
	let canvasHost = $state<HTMLDivElement>();

	let ready = $state(false);
	let loading = $state(true);
	let failed = $state(false);
	let loadPercent = $state(0);
	let progress = $state(0);
	let reducedMotion = $state(false);
	let announcement = $state('');

	onMount(() => {
		if (!canvasHost || !sectionEl) return;

		let disposed = false;
		const loadAbort = new AbortController();
		let renderer: Three.WebGLRenderer;
		let bloom: Bloom | null = null;
		let scene: Three.Scene;
		let camera: Three.PerspectiveCamera;
		let modelRoot: Three.Group | undefined;
		let environmentTexture: Three.Texture | undefined;
		let groundMaterial: Three.ShadowMaterial | undefined;
		let groundGeometry: Three.BufferGeometry | undefined;
		let disposeLoaders: (() => void) | undefined;
		let threeModule: typeof import('three');
		const rings: { mesh: Three.Mesh; material: Three.MeshBasicMaterial }[] = [];

		let gsap: typeof import('gsap').gsap;
		let ScrollTrigger: typeof import('gsap/ScrollTrigger').ScrollTrigger;
		let rotationTween: ReturnType<typeof gsap.timeline> | undefined;
		let explosionTimeline: ReturnType<typeof gsap.timeline> | undefined;
		let triggers: ReturnType<typeof ScrollTrigger.create>[] = [];

		const rotationState = { value: 0 };
		const nodes = new Map<string, Three.Object3D>();
		const baseY = new Map<string, number>();
		const layerMeshes = new Map<string, Three.Mesh[]>();
		const layerMaterials = new Map<string, Three.Material[]>();
		const layerStates = new Map<
			string,
			{ lift: number; spin: number; opacity: number; fade: readonly [number, number] }
		>();

		let cameraTarget: Three.Vector3;
		let startPosition: Three.Vector3 | undefined;
		let endPosition: Three.Vector3 | undefined;
		let startTarget: Three.Vector3 | undefined;
		let endTarget: Three.Vector3 | undefined;

		let explosionProgress = 0;
		let needsRender = true;
		let isVisible = true;
		let announced = false;

		// `matchMedia` is absent in jsdom and some embedded webviews, so the hero
		// has to work without it (motion stays on, the query is simply skipped).
		const reduceQuery =
			typeof window.matchMedia === 'function'
				? window.matchMedia('(prefers-reduced-motion: reduce)')
				: null;
		reducedMotion = reduceQuery?.matches ?? false;
		const syncReducedMotion = () => {
			reducedMotion = reduceQuery?.matches ?? false;
		};

		const cleanups: (() => void)[] = [];

		/* ---------------------------------------------------------------- */
		/* Helpers                                                           */
		/* ---------------------------------------------------------------- */

		const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
			Promise.race([
				promise,
				new Promise<never>((_, reject) => {
					window.setTimeout(() => reject(new Error('Loader timed out')), ms);
				})
			]);

		function cameraLayout() {
			if (!camera || !canvasHost) return;
			const width = canvasHost.clientWidth || window.innerWidth;
			const height = canvasHost.clientHeight || window.innerHeight;
			const aspect = width / height;
			const portrait = aspect < 0.85;
			const tablet = aspect >= 0.85 && aspect < 1.45;

			const start = portrait
				? { x: 25.75, y: 21.6, z: 31.4, tx: 0, ty: 4.6 }
				: tablet
					? { x: 14.8, y: 11.2, z: 17.2, tx: -0.35, ty: 2.6 }
					: { x: 10.7, y: 8.5, z: 12.7, tx: -1.7, ty: -0.15 };

			const dolly = portrait ? 1.2 : 1.52;

			startPosition = new threeModule.Vector3(start.x, start.y, start.z);
			endPosition = new threeModule.Vector3(start.x * dolly, start.y * dolly + 0.8, start.z * dolly);
			startTarget = new threeModule.Vector3(start.tx, start.ty, 0);
			endTarget = new threeModule.Vector3(start.tx * 0.4, portrait ? 2.2 : 2.45, 0);

			camera.fov = portrait ? 32 : 30;
			camera.aspect = aspect;
			camera.updateProjectionMatrix();
		}

		function resetExplosion() {
			for (const state of layerStates.values()) {
				state.lift = 0;
				state.spin = 0;
				state.opacity = 1;
			}
			for (const [name, node] of nodes) {
				node.rotation.y = 0;
				node.position.y = baseY.get(name) ?? node.position.y;
			}
			rotationState.value = 0;
			if (modelRoot) modelRoot.rotation.set(0, -0.36, 0);
		}

		function applyModelPose(p: number) {
			if (!modelRoot) return;

			const now = performance.now() / 1000;
			const idle = 1 - smoothstep(clamp01(p / 0.45));
			const rotation = rotationState.value;

			// Rotation settles over the first scroll phase, then keeps a slow drift while the stack opens.
			const drift = smootherstep(clamp01(p / 0.85)) * 0.3;
			modelRoot.rotation.y = -0.36 + rotation * 0.98 + drift + Math.sin(now * 0.19) * 0.028 * idle;
			modelRoot.rotation.x = Math.sin(now * 0.13) * 0.01 * idle;
			modelRoot.position.y = Math.sin(now * 0.34) * 0.03 * idle;

			for (const motion of layerMotion) {
				const node = nodes.get(motion.node);
				const state = layerStates.get(motion.node);
				if (!node || !state) continue;

				node.position.y = (baseY.get(motion.node) ?? 0) + state.lift;
				node.rotation.y = state.spin;

				const visible = state.opacity > 0.015;
				for (const mesh of layerMeshes.get(motion.node) ?? []) {
					mesh.visible = visible;
					mesh.castShadow = visible && state.opacity > 0.45;
				}
				for (const material of layerMaterials.get(motion.node) ?? []) {
					material.opacity = state.opacity;
					material.transparent = true;
					material.depthWrite = true;
				}
			}

			if (groundMaterial) groundMaterial.opacity = 0.4 * (1 - smoothstep(clamp01((p - 0.28) / 0.55)));
			for (const ring of rings) {
				ring.material.opacity = 0.14 * (1 - smoothstep(clamp01((p - 0.2) / 0.5)));
			}

			const sp = startPosition;
			const ep = endPosition;
			const st = startTarget;
			const et = endTarget;
			if (sp && ep && st && et) {
				// The dolly leads the explosion a little, then settles late: a long, heavy ease.
				const eased = smootherstep(p);
				camera.position.lerpVectors(sp, ep, eased);
				// Tiny crane arc: the camera rises and falls back as the stack opens.
				camera.position.y += Math.sin(eased * Math.PI) * 0.55;
				cameraTarget.copy(st).lerp(et, eased);
				camera.lookAt(cameraTarget);
			}
		}

		function updateOverlay(p: number) {
			if (!sectionEl) return;
			const cue = 1 - clamp01(rotationState.value * 3.2);
			const copy = 1 - smoothstep(clamp01((p - 0.16) / 0.38));
			const veil = smoothstep(p) * 0.55;
			const list = 1 - smoothstep(clamp01((p - 0.72) / 0.24));

			sectionEl.style.setProperty('--cue', cue.toFixed(3));
			sectionEl.style.setProperty('--copy', copy.toFixed(3));
			sectionEl.style.setProperty('--veil', veil.toFixed(3));
			sectionEl.style.setProperty('--list', list.toFixed(3));

			if (Math.abs(p - progress) > 0.0015) progress = clamp01(p);

			if (p > 0.04 && !announced) {
				announced = true;
				announcement = 'Package opening. Heat spreader, silicon die, substrate, and carrier are separating.';
			}
		}

		function renderFrame() {
			if (!renderer || !scene || !camera || !modelRoot) return;
			if (document.hidden || !isVisible) return;
			if (reducedMotion && !needsRender) return;
			needsRender = false;

			explosionProgress = explosionTimeline ? explosionTimeline.progress() : 0;
			applyModelPose(explosionProgress);
			updateOverlay(explosionProgress);
			if (bloom) bloom.render();
			else renderer.render(scene, camera);
		}

		/* ---------------------------------------------------------------- */
		/* Scroll choreography                                               */
		/* ---------------------------------------------------------------- */

		function getScrollRange() {
			if (!sectionEl) return { start: 0, end: 1 };
			const vh = window.innerHeight;
			const heroTop = sectionEl.getBoundingClientRect().top + window.scrollY;
			const pinEnd = heroTop + Math.max(0, sectionEl.offsetHeight - vh);
			const anchor = moduleAnchor ? document.querySelector(moduleAnchor) : null;
			const anchorReach =
				anchor instanceof HTMLElement
					? anchor.getBoundingClientRect().top + window.scrollY - vh
					: Number.POSITIVE_INFINITY;

			// The hero is short (180svh), so the whole explosion must finish while the stage is still pinned.
			const end = Math.max(heroTop + vh * 0.6, Math.min(pinEnd, anchorReach));
			const start = Math.max(heroTop + vh * 0.1, end - vh * 0.7);
			return { start, end };
		}

		function teardownMotion() {
			for (const trigger of triggers) trigger.kill();
			triggers = [];
			rotationTween?.kill();
			rotationTween = undefined;
			explosionTimeline?.kill();
			explosionTimeline = undefined;
		}

		function setupMotion() {
			if (reducedMotion || !sectionEl || !modelRoot) return;
			teardownMotion();

			for (const state of layerStates.values()) {
				state.lift = 0;
				state.spin = 0;
				state.opacity = 1;
			}

			rotationState.value = 0;
			rotationTween = gsap.timeline({ paused: true }).to(rotationState, {
				value: 1,
				duration: 1,
				ease: 'power2.inOut'
			});

			const rotationStart = () => sectionEl!.getBoundingClientRect().top + window.scrollY;
			const rotationEnd = () => {
				const range = getScrollRange();
				return Math.max(range.start, rotationStart() + 1);
			};

			triggers.push(
				ScrollTrigger.create({
					trigger: sectionEl,
					start: rotationStart,
					end: rotationEnd,
					scrub: 1.8,
					animation: rotationTween,
					invalidateOnRefresh: true,
					onUpdate: () => {
						needsRender = true;
					}
				})
			);

			explosionTimeline = gsap.timeline({
				paused: true,
				onUpdate: () => {
					needsRender = true;
				}
			});

			layerMotion.forEach((motion) => {
				const state = layerStates.get(motion.node);
				if (!state) return;

				explosionTimeline!.to(
					state,
					{
						lift: motion.lift,
						spin: motion.spin,
						duration: 0.82,
						// In-out reads as mass: layers break away slowly, accelerate, then settle.
						ease: 'power2.inOut'
					},
					motion.delay
				);

				explosionTimeline!.to(
					state,
					{
						opacity: 0,
						duration: motion.fade[1] - motion.fade[0],
						ease: 'power2.in'
					},
					motion.fade[0]
				);
			});

			triggers.push(
				ScrollTrigger.create({
					trigger: sectionEl,
					start: () => getScrollRange().start,
					end: () => getScrollRange().end,
					scrub: 1.8,
					animation: explosionTimeline,
					invalidateOnRefresh: true,
					onUpdate: () => {
						needsRender = true;
					}
				})
			);

			ScrollTrigger.refresh();
			needsRender = true;
		}

		/* ---------------------------------------------------------------- */
		/* Scene construction                                                */
		/* ---------------------------------------------------------------- */

		const load = async () => {
			try {
				const THREE = await import('three');
				threeModule = THREE;
				cameraTarget = new THREE.Vector3();
				const [gsapModule, scrollModule, gltfModule, dracoModule, ktx2Module] =
					await Promise.all([
						import('gsap'),
						import('gsap/ScrollTrigger'),
						import('three/addons/loaders/GLTFLoader.js'),
						import('three/addons/loaders/DRACOLoader.js'),
						import('three/addons/loaders/KTX2Loader.js')
					]);
				if (disposed) return;

				gsap = gsapModule.gsap;
				ScrollTrigger = scrollModule.ScrollTrigger;
				gsap.registerPlugin(ScrollTrigger);

				scene = new THREE.Scene();
				camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);

				renderer = new THREE.WebGLRenderer({
					antialias: window.devicePixelRatio < 2,
					powerPreference: 'high-performance',
					alpha: true
				});
				renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
				renderer.setSize(
					canvasHost!.clientWidth || window.innerWidth,
					canvasHost!.clientHeight || window.innerHeight
				);
				renderer.toneMapping = THREE.ACESFilmicToneMapping;
				renderer.toneMappingExposure = 1.12;
				renderer.outputColorSpace = THREE.SRGBColorSpace;
				renderer.shadowMap.enabled = true;
				renderer.shadowMap.type = THREE.PCFShadowMap;
				renderer.setClearColor(0x000000, 0);
				canvasHost!.appendChild(renderer.domElement);

				/* The same studio rig as the golden template: one warm key,
				   a grazing cool fill, a long rim, and a soft ambient dome. */
				const keyLight = new THREE.DirectionalLight(0xfff2dd, 3.6);
				keyLight.position.set(6.4, 7.8, 4.4);
				keyLight.castShadow = true;
				keyLight.shadow.mapSize.set(1024, 1024);
				keyLight.shadow.bias = -0.00045;
				keyLight.shadow.normalBias = 0.028;
				keyLight.shadow.radius = 4;
				keyLight.shadow.camera.near = 0.5;
				keyLight.shadow.camera.far = 40;
				keyLight.shadow.camera.left = -6;
				keyLight.shadow.camera.right = 6;
				keyLight.shadow.camera.top = 6;
				keyLight.shadow.camera.bottom = -6;
				scene.add(keyLight);

				const fillLight = new THREE.DirectionalLight(0xffb877, 1.1);
				fillLight.position.set(-6.6, 2.8, -5.4);
				scene.add(fillLight);

				const rimLight = new THREE.DirectionalLight(0xffd7a1, 2.6);
				rimLight.position.set(-4.8, 5.2, 5.8);
				scene.add(rimLight);

				scene.add(new THREE.HemisphereLight(0xffd9b3, 0x1a1715, 0.45));
				/* Warm ambient: amber wash so the chip reflects candle light, not blue-white. */
				scene.add(new THREE.AmbientLight(0xffd9b3, 0.28));

				groundGeometry = new THREE.PlaneGeometry(240, 240);
				const ground = new THREE.Mesh(
					groundGeometry,
					(groundMaterial = new THREE.ShadowMaterial({
						color: 0x000000,
						opacity: 0.4,
						transparent: true
					}))
				);
				ground.rotation.x = -Math.PI / 2;
				ground.position.y = -0.42;
				ground.receiveShadow = true;
				scene.add(ground);

				const ringGeometry = new THREE.RingGeometry(3.1, 3.115, 200);
				const outerRingGeometry = new THREE.RingGeometry(4.2, 4.21, 220);
				const outerGlowGeometry = new THREE.RingGeometry(3.36, 3.38, 200);
				for (const [geometry, rotation] of [
					[ringGeometry, 0],
					[outerRingGeometry, 0.45],
					[outerGlowGeometry, 0]
				] as const) {
					const material = new THREE.MeshBasicMaterial({
						color: 0xd8b36a,
						transparent: true,
						opacity: 0.14,
						side: THREE.DoubleSide,
						depthWrite: false
					});
					const mesh = new THREE.Mesh(geometry, material);
					mesh.rotation.x = -Math.PI / 2;
					mesh.rotation.z = rotation;
					mesh.position.y = -0.415;
					scene.add(mesh);
					rings.push({ mesh, material });
				}

				loadPercent = 44;
				// Progressive enhancement: CDN HDRI, then the bundled studio HDRI, then
				// the procedural rig already in the scene. The teardown signal cancels the
				// CDN request if the hero unmounts during the fetch.
				const loadedEnvironment = await loadEnvironment(renderer, scene, loadAbort.signal, () => disposed, {
					premium: PREMIUM_HDRIS.veniceSunset,
					fallbackUrl: HDRI_URL,
					intensity: 1,
					label: 'HomeHero'
				});
				if (disposed) {
					loadedEnvironment?.texture.dispose();
					return;
				}
				environmentTexture = loadedEnvironment?.texture;
				loadPercent = 58;

				const draco = new dracoModule.DRACOLoader().setDecoderPath(decoderPath('draco/draco_decoder.js'));
				const ktx2 = new ktx2Module.KTX2Loader()
					.setTranscoderPath(decoderPath('basis/basis_transcoder.js'))
					.detectSupport(renderer);

				const gltf = await withTimeout(
					new Promise<GLTF>((resolve, reject) => {
						const loader = new gltfModule.GLTFLoader().setDRACOLoader(draco).setKTX2Loader(ktx2);
						loader.load(MODEL_URL, resolve, undefined, reject);
					}),
					30000
				);
				if (disposed) return;
				disposeLoaders = () => {
					draco.dispose();
					ktx2.dispose();
				};
				loadPercent = 76;

				modelRoot = gltf.scene;
				modelRoot.rotation.order = 'YXZ';
				modelRoot.rotation.y = -0.36;

				const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
				const environment = scene.environment;
				const tuned = new Set<Three.Material>();
				modelRoot.traverse((object) => {
					if (!(object instanceof THREE.Mesh)) return;
					object.castShadow = true;
					object.receiveShadow = true;

					const materials = Array.isArray(object.material) ? object.material : [object.material];
					for (const material of materials) {
						if (!(material instanceof THREE.MeshStandardMaterial) || tuned.has(material)) continue;
						tuned.add(material);

						const finish = finishes[material.name.toLowerCase()];
						// Golden Template fix: envMapIntensity is only read when the material owns an envMap.
						if (environment) material.envMap = environment;
						material.envMapIntensity = finish?.env ?? 1.1;
						if (finish?.roughness !== undefined) material.roughness = finish.roughness;
						if (finish?.metalness !== undefined) material.metalness = finish.metalness;
						if (finish?.iridescence !== undefined && material instanceof THREE.MeshPhysicalMaterial) {
							material.iridescence = finish.iridescence;
							material.iridescenceThicknessRange = [110, 520];
						}

						for (const map of [
							material.map,
							material.normalMap,
							material.roughnessMap,
							material.metalnessMap,
							material.aoMap,
							material.emissiveMap
						]) {
							if (map) map.anisotropy = anisotropy;
						}
					}
				});

				for (const definition of layerMotion) {
					const node = modelRoot.getObjectByName(definition.node);
					if (!node) {
						console.warn(`[HomeHero] Missing layer node "${definition.node}"`);
						continue;
					}
					nodes.set(definition.node, node);
					baseY.set(definition.node, node.position.y);

					const meshes: Three.Mesh[] = [];
					const materials = new Set<Three.Material>();
					node.traverse((child) => {
						if (!(child instanceof THREE.Mesh)) return;
						meshes.push(child);
						const list = Array.isArray(child.material) ? child.material : [child.material];
						for (const material of list) materials.add(material);
					});
					layerMeshes.set(definition.node, meshes);
					layerMaterials.set(definition.node, [...materials]);
					layerStates.set(definition.node, {
						lift: 0,
						spin: 0,
						opacity: 1,
						fade: definition.fade
					});
				}

				scene.add(modelRoot);
				cameraLayout();
				applyModelPose(0);
				renderer.compile(scene, camera);
				loadPercent = 90;

				/* ---------------------------------------------------------- */
				/* Observers                                                   */
				/* ---------------------------------------------------------- */

				const resize = () => {
					if (!renderer || !camera || !canvasHost) return;
					const width = canvasHost.clientWidth || window.innerWidth;
					const height = canvasHost.clientHeight || window.innerHeight;
					renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
					renderer.setSize(width, height);
					bloom?.setSize(width, height);
					cameraLayout();
					applyModelPose(explosionTimeline ? explosionTimeline.progress() : 0);
					needsRender = true;
					ScrollTrigger.refresh();
				};
				const resizeObserver = new ResizeObserver(resize);
				resizeObserver.observe(canvasHost!);

				const visibilityObserver = new IntersectionObserver(
					(entries) => {
						const entry = entries[0];
						if (!entry) return;
						isVisible = entry.isIntersecting;
						if (isVisible) needsRender = true;
					},
					{ rootMargin: '320px 0px' }
				);
				visibilityObserver.observe(sectionEl!);

				const onReducedChange = () => {
					syncReducedMotion();
					teardownMotion();
					resetExplosion();
					cameraLayout();
					applyModelPose(0);
					updateOverlay(0);
					needsRender = true;
					if (!reduceQuery?.matches) setupMotion();
				};
				reduceQuery?.addEventListener('change', onReducedChange);

				const onVisibility = () => {
					needsRender = true;
				};
				document.addEventListener('visibilitychange', onVisibility);

				cleanups.push(() => {
					resizeObserver.disconnect();
					visibilityObserver.disconnect();
					reduceQuery?.removeEventListener('change', onReducedChange);
					document.removeEventListener('visibilitychange', onVisibility);
				});

				/* ---------------------------------------------------------- */
				/* Ready                                                       */
				/* ---------------------------------------------------------- */

				renderer.setAnimationLoop(renderFrame);
				needsRender = true;

				if (import.meta.env.DEV) {
					(
						window as Window & {
							__heroDebug?: () => unknown;
						}
					).__heroDebug = () => ({
						explosion: Math.round(explosionProgress * 1000) / 1000,
						rotation: Math.round(rotationState.value * 1000) / 1000,
						rotationTween: rotationTween?.progress() ?? null,
						explosionTween: explosionTimeline?.progress() ?? null,
						triggers: triggers.map((trigger) => ({
							start: Math.round(trigger.start),
							end: Math.round(trigger.end)
						})),
						layers: [...layerStates.entries()].map(([name, layer]) => {
							const node = nodes.get(name);
							let box: { x: number; y: number; w: number; h: number } | null = null;
							if (node) {
								const bounds = new THREE.Box3().setFromObject(node);
								const points = [
									[bounds.min.x, bounds.min.y, bounds.min.z],
									[bounds.min.x, bounds.min.y, bounds.max.z],
									[bounds.min.x, bounds.max.y, bounds.min.z],
									[bounds.min.x, bounds.max.y, bounds.max.z],
									[bounds.max.x, bounds.min.y, bounds.min.z],
									[bounds.max.x, bounds.min.y, bounds.max.z],
									[bounds.max.x, bounds.max.y, bounds.min.z],
									[bounds.max.x, bounds.max.y, bounds.max.z]
								].map(([x, y, z]) => new THREE.Vector3(x, y, z).project(camera));
								const minX = Math.min(...points.map((p) => p.x));
								const maxX = Math.max(...points.map((p) => p.x));
								const minY = Math.min(...points.map((p) => p.y));
								const maxY = Math.max(...points.map((p) => p.y));
								box = {
									x: Math.round(((minX + 1) / 2) * window.innerWidth),
									y: Math.round(((1 - maxY) / 2) * window.innerHeight),
									w: Math.round(((maxX - minX) / 2) * window.innerWidth),
									h: Math.round(((maxY - minY) / 2) * window.innerHeight)
								};
							}
							return {
								name,
								meshes: layerMeshes.get(name)?.length ?? 0,
								y: Math.round((node?.position.y ?? 0) * 100) / 100,
								z: Math.round((node?.position.z ?? 0) * 100) / 100,
								opacity: Math.round(layer.opacity * 100) / 100,
								box
							};
						}),
						camera: {
							x: Math.round(camera.position.x * 100) / 100,
							y: Math.round(camera.position.y * 100) / 100,
							z: Math.round(camera.position.z * 100) / 100
						},
						render: {
							calls: renderer.info.render.calls,
							triangles: renderer.info.render.triangles
						}
					});
				}

				bloom = await createBloom(THREE, renderer, scene, camera);
				if (disposed) {
					bloom?.dispose();
					bloom = null;
				}

				loadPercent = 100;
				ready = true;
				loading = false;

				requestAnimationFrame(() => {
					if (disposed) return;
					setupMotion();
					applyModelPose(0);
					if (bloom) bloom.render();
					else renderer.render(scene, camera);
				});
			} catch (error) {
				if (disposed) return;
				console.error('[HomeHero] Failed to initialise the studio scene', error);
				failed = true;
				loading = false;
			}
		};

		load();

		return () => {
			loadAbort.abort();
			disposed = true;
			for (const cleanup of cleanups) cleanup();
			teardownMotion();
			renderer?.setAnimationLoop(null);
			// The shared environment is disposed once, below.
			if (modelRoot) disposeObject3D(modelRoot, [environmentTexture]);
			environmentTexture?.dispose();
			groundGeometry?.dispose();
			groundMaterial?.dispose();
			for (const ring of rings) {
				ring.mesh.geometry.dispose();
				ring.material.dispose();
			}
			disposeLoaders?.();
			bloom?.dispose();
			bloom = null;
			// Release the GPU context eagerly; dispose() alone leaves it alive until GC.
			renderer?.forceContextLoss();
			renderer?.dispose();
			if (renderer?.domElement?.parentNode) renderer.domElement.remove();
		};
	});
</script>

<svelte:head>
	<meta
		name="description"
		content="A floating silicon package that opens as you scroll, built with Three.js, a studio HDRI and GSAP ScrollTrigger."
	/>
</svelte:head>

<section
	bind:this={sectionEl}
	id={id}
	class="hero {className}"
	class:is-ready={ready}
	class:is-loading={loading}
	class:is-failed={failed}
	data-reduced-motion={reducedMotion}
	aria-labelledby={headingId}
	aria-describedby={summaryId}
	style="--cue: 1; --copy: 1; --list: 1; --veil: 0"
>
	<div class="hero__stage">
		<div class="hero__atmosphere" aria-hidden="true"></div>
		<div class="hero__canvas" bind:this={canvasHost}></div>
		<div class="hero__vignette" aria-hidden="true"></div>
		<div class="hero__veil" aria-hidden="true"></div>
		<div class="hero__grain" aria-hidden="true"></div>

		<div class="hero__intro">
			<p class="hero__eyebrow">
				<span class="hero__dot" aria-hidden="true"></span>
				{eyebrow}
			</p>
			<h1 id={headingId}>{title}</h1>
			<p class="hero__lede">{subtitle}</p>

			{#if !reducedMotion}
				<div class="hero__cue" aria-hidden="true">
					<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="square">
						<path d="M5 9l7 7 7-7" />
					</svg>
				</div>
			{:else}
				<p class="hero__static">Static view — reduced motion is enabled.</p>
			{/if}
		</div>

		{#if loading}
			<div class="hero__loader" role="status" aria-live="polite">
				<span class="hero__loader-kicker">Preparing the studio</span>
				<span class="hero__loader-title">Silicon package</span>
				<span class="hero__loader-track" aria-hidden="true">
					<span
						class="hero__loader-fill"
						style={`transform: scaleX(${Math.max(0.04, loadPercent / 100)})`}
					></span>
				</span>
				<span class="hero__loader-meta">
					<span>Draco · KTX2 · HDRI</span>
					<span>{String(loadPercent).padStart(3, '0')}%</span>
				</span>
			</div>
		{/if}

		{#if failed}
			<div class="hero__error" role="alert">
				<span class="hero__error-title">The studio did not open.</span>
				<p>
					The WebGL scene could not initialise. The model may have failed to decode, or this browser may
					not support hardware acceleration.
				</p>
				<button type="button" onclick={() => window.location.reload()}>Reload</button>
			</div>
		{/if}

		<p id={liveId} class="sr-only" aria-live="polite">{announcement}</p>
	</div>

	<p id={summaryId} class="sr-only">
		An exploded view of a silicon processor package. Four layers—heat spreader, silicon die, package
		substrate and carrier—separate as the page scrolls toward the module index.
	</p>

	<div class="hero__description">
		<details>
			<summary>Text description: silicon package hero</summary>
			<p>
				A square processor package floats above a dark studio floor. The nickel heat spreader covers a
				small iridescent silicon die at the centre of a green substrate; beneath it, the carrier shows
				gold land-grid pads. As you scroll, the package rotates slowly, then the four layers lift apart,
				turn slightly, and dissolve before the module index.
			</p>
		</details>
	</div>
</section>

<style>
	.hero {
		/* Premium Textbook tokens: Sorts Mill Goudy for headings, Inter for everything else.
		   A page-level --font-heading / --font-body takes precedence when defined. */
		--hero-font-heading: var(--font-display, 'Sorts Mill Goudy'), 'Iowan Old Style', Georgia, serif;
		--hero-font-body:
			var(--font-sans, 'Inter'), -apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'Segoe UI',
			sans-serif;
		--hero-bg: #1a1715; /* espresso leather */
		/* Height of the dissolve into the ivory module list. Bottom overlays sit above it. */
		--hero-fade: clamp(8rem, 20svh, 13rem);
		position: relative;
		height: 180svh;
		min-height: 1000px;
		background: var(--hero-bg);
		/* Functional mask: the dark stage dissolves into the page canvas instead of ending on a hard line. */
		-webkit-mask-image: linear-gradient(
			to bottom,
			#000 calc(100% - var(--hero-fade)),
			transparent 100%
		);
		mask-image: linear-gradient(to bottom, #000 calc(100% - var(--hero-fade)), transparent 100%);
		color: #f3ebdc;
		font-family: var(--hero-font-body);
		font-feature-settings: 'cv11', 'ss03';
		-webkit-font-smoothing: antialiased;
		-moz-osx-font-smoothing: grayscale;
		text-rendering: optimizeLegibility;
		isolation: isolate;
	}

	.hero__stage {
		position: sticky;
		top: 0;
		height: 100svh;
		min-height: 620px;
		overflow: clip;
		background: var(--hero-bg);
	}

	.hero[data-reduced-motion='true'] {
		height: 100svh;
		min-height: 660px;
	}

	.hero__atmosphere {
		position: absolute;
		inset: 0;
		z-index: 0;
		background:
			radial-gradient(ellipse 52% 42% at 64% 48%, rgba(150, 108, 74, 0.18), transparent 66%),
			radial-gradient(ellipse 34% 30% at 77% 38%, rgba(214, 171, 108, 0.08), transparent 70%),
			linear-gradient(180deg, rgba(26, 23, 21, 0) 55%, rgba(26, 23, 21, 0.75) 100%);
		pointer-events: none;
	}

	.hero__canvas {
		position: absolute;
		inset: 0;
		z-index: 1;
		opacity: 0;
		transition: opacity 900ms ease;
	}

	.hero.is-ready .hero__canvas {
		opacity: 1;
	}

	.hero__canvas :global(canvas) {
		display: block;
		width: 100% !important;
		height: 100% !important;
	}

	.hero__vignette {
		position: absolute;
		inset: 0;
		z-index: 2;
		background:
			linear-gradient(90deg, rgba(26, 23, 21, 0.82) 0%, rgba(26, 23, 21, 0.42) 28%, transparent 52%),
			radial-gradient(ellipse 92% 86% at 52% 46%, transparent 46%, rgba(18, 15, 13, 0.72) 100%);
		pointer-events: none;
	}

	.hero__veil {
		position: absolute;
		inset: 0;
		z-index: 3;
		background: radial-gradient(ellipse 76% 70% at 58% 46%, rgba(24, 20, 18, 0.2), rgba(26, 23, 21, 0.94) 92%);
		opacity: var(--veil);
		pointer-events: none;
	}

	.hero__grain {
		position: absolute;
		inset: 0;
		z-index: 4;
		opacity: 0.05;
		mix-blend-mode: overlay;
		pointer-events: none;
		background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 240 240' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.83' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='240' height='240' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E");
		background-size: 240px 240px;
	}

	.hero__intro {
		position: absolute;
		top: clamp(5.6rem, 10.5vh, 8.5rem);
		left: clamp(1.25rem, 4.6vw, 5rem);
		z-index: 5;
		width: min(36rem, 43vw);
		opacity: var(--copy);
		pointer-events: none;
	}

	.hero__eyebrow {
		display: inline-flex;
		align-items: center;
		gap: 0.65rem;
		margin: 0 0 1.6rem;
		color: #d9cdb9;
		font-family: var(--hero-font-body);
		font-weight: 500;
		font-size: 0.64rem;
		letter-spacing: 0.17em;
		line-height: 1;
		text-transform: uppercase;
	}

	.hero__dot {
		width: 0.375rem;
		height: 0.375rem;
		border-radius: 0;
		background: #d8b36a;
		box-shadow: 0 0 0 0.24rem rgba(216, 179, 106, 0.12);
	}

	.hero__intro h1 {
		max-width: 12ch;
		margin: 0;
		color: #f3ebdc;
		font-family: var(--hero-font-heading);
		font-size: clamp(2.8rem, 5.5vw, 5.6rem);
		font-weight: 400;
		font-feature-settings: 'liga', 'dlig', 'onum';
		letter-spacing: -0.022em;
		line-height: 1;
		text-wrap: balance;
	}

	.hero__lede {
		max-width: 30rem;
		margin: clamp(1.4rem, 2.4vh, 2.1rem) 0 0;
		color: rgba(240, 230, 214, 0.62);
		font-size: clamp(0.92rem, 1.02vw, 1.05rem);
		letter-spacing: -0.011em;
		line-height: 1.68;
	}

	.hero__cue {
		display: block;
		margin-top: clamp(2.2rem, 5vh, 3.6rem);
		color: rgba(240, 230, 214, 0.5);
		line-height: 0;
		opacity: var(--cue);
	}

	.hero__cue svg {
		display: block;
		animation: cue-bob 2.8s cubic-bezier(0.4, 0, 0.2, 1) infinite;
	}



	.hero__static {
		margin-top: 2.6rem;
		color: rgba(240, 230, 214, 0.4);
		font-family: var(--hero-font-body);
		font-weight: 500;
		font-size: 0.64rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
	}

	.hero__loader {
		position: absolute;
		inset: 0;
		z-index: 20;
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		gap: 0.7rem;
		padding: clamp(1.25rem, 4.6vw, 5rem);
		padding-bottom: clamp(2.5rem, 6vh, 4.5rem);
		background: var(--hero-bg);
	}

	.hero__loader-kicker {
		color: rgba(240, 230, 214, 0.4);
		font-family: var(--hero-font-body);
		font-weight: 500;
		font-size: 0.64rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
	}

	.hero__loader-title {
		color: rgba(241, 237, 226, 0.9);
		font-family: var(--hero-font-heading);
		font-size: clamp(1.5rem, 3vw, 2.4rem);
		font-weight: 400;
		letter-spacing: -0.01em;
		line-height: 1;
	}

	.hero__loader-track {
		position: relative;
		width: 100%;
		height: 1px;
		background: rgba(240, 230, 214, 0.1);
		overflow: hidden;
	}

	.hero__loader-fill {
		position: absolute;
		inset: 0;
		background: #d8b36a;
		transform-origin: left center;
		transform: scaleX(0.04);
		transition: transform 500ms ease;
	}

	.hero__loader-meta {
		display: flex;
		justify-content: space-between;
		color: rgba(240, 230, 214, 0.3);
		font-family: var(--hero-font-body);
		font-weight: 500;
		font-size: 0.64rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	.hero__error {
		position: absolute;
		right: clamp(1.25rem, 4.6vw, 5rem);
		bottom: clamp(3rem, 8vh, 5rem);
		z-index: 21;
		width: min(21rem, 80vw);
		padding: 1.1rem 1.2rem;
		border: 1px solid rgba(216, 179, 106, 0.3);
		border-radius: 0.5rem;
		background: rgba(30, 26, 23, 0.94);
	}

	.hero__error-title {
		display: block;
		margin-bottom: 0.45rem;
		color: #f3ebdc;
		font-family: var(--hero-font-heading);
		font-size: 1.05rem;
	}

	.hero__error p {
		margin: 0 0 0.9rem;
		color: rgba(240, 230, 214, 0.55);
		font-size: 0.75rem;
		line-height: 1.55;
	}

	.hero__error button {
		border: 0;
		padding: 0;
		background: transparent;
		color: #d8b36a;
		font-family: var(--hero-font-body);
		font-weight: 500;
		font-size: 0.64rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		cursor: pointer;
	}

	.hero__description {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		padding: 0;
		overflow: hidden;
		clip: rect(0 0 0 0);
		clip-path: inset(50%);
		white-space: nowrap;
		border: 0;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		padding: 0;
		overflow: hidden;
		clip: rect(0 0 0 0);
		clip-path: inset(50%);
		white-space: nowrap;
		border: 0;
	}

	@keyframes cue-bob {
		0%,
		100% {
			opacity: 0.35;
			transform: translateY(0);
		}
		50% {
			opacity: 1;
			transform: translateY(5px);
		}
	}

	@keyframes rise {
		from {
			transform: translateY(1.1rem);
		}
		to {
			transform: translateY(0);
		}
	}

	.hero.is-ready .hero__intro {
		animation: rise 1100ms cubic-bezier(0.2, 0.7, 0.2, 1) both;
	}

	@media (max-width: 900px) {
		.hero {
			height: 180svh;
			min-height: 900px;
		}

		.hero__intro {
			top: 5.4rem;
			width: calc(100% - 2.5rem);
		}

		.hero__intro h1 {
			max-width: 9ch;
			font-size: clamp(2.6rem, 10.4vw, 4.4rem);
		}

		.hero__lede {
			max-width: 26rem;
			font-size: 0.88rem;
		}






		.hero__vignette {
			background:
				linear-gradient(180deg, rgba(26, 23, 21, 0.78) 0%, rgba(26, 23, 21, 0.18) 38%, transparent 58%),
				radial-gradient(ellipse 110% 90% at 50% 46%, transparent 40%, rgba(18, 15, 13, 0.8) 100%);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.hero.is-ready .hero__intro {
			animation: none;
		}

		.hero__cue svg {
			animation: none;
		}

		.hero__canvas {
			transition: none;
		}
	}
</style>