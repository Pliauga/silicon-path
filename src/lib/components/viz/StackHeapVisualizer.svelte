<script lang="ts">
	import { getContext, onMount } from 'svelte';
	import { STUDY_FRAME, type StudyFrame } from './frame-mode';
	import { asset as resolveAsset } from '$app/paths';
	import type * as Three from 'three';
	import { createBloom, type Bloom } from '$lib/utils/bloom';
	import { createParallax, type Parallax } from '$lib/utils/parallax';
	import { warmEnvironment, WARM_AMBIENT } from '$lib/utils/warm-environment';

	type Tower = 'stack' | 'heap';
	type Phase = 'boot' | 'loading' | 'ready' | 'error' | 'static';

	type BlockRecord = {
		mesh: Three.Mesh;
		material: Three.MeshStandardMaterial;
		tower: Tower;
		level: number;
		lane: number;
		start: number;
		duration: number;
		height: number;
		top: number;
		bottom: number;
	};

	type Props = {
		id?: string;
		eyebrow?: string;
		title?: string;
		accent?: string;
		subtitle?: string;
		scrollLabel?: string;
		class?: string;
		embedded?: boolean;
	};

	let {
		id = 'stack-heap',
		eyebrow = 'Silicon Path / Memory model',
		title = 'Two towers.',
		accent = 'One address space.',
		subtitle = 'The stack grows down from the ceiling. The heap grows up from the floor. Scroll until they meet — and watch a stack overflow happen in real space.',
		scrollLabel = 'Scroll to allocate',
		class: className = '',
		embedded = false
	}: Props = $props();

	// Compact mode for use inside a lesson's <LazyStudy> frame.
	const frame = getContext<StudyFrame | undefined>(STUDY_FRAME);
	const embeddedMode = $derived(embedded || frame?.embedded === true);

	const BLOCKS_PER_TOWER = 42;
	const TOTAL_FRAMES = BLOCKS_PER_TOWER * 2;
	const FRAME_BYTES = 64;
	const COLLISION_AT = 0.85;

	let sectionEl: HTMLElement;
	let canvasHost: HTMLDivElement;

	let progress = $state(0);
	let overflow = $state(0);
	let stackFrames = $state(0);
	let heapFrames = $state(0);
	let phase = $state<Phase>('boot');
	let loadPercent = $state(6);
	let errorMessage = $state('');
	let reducedMotion = $state(false);

	const loaded = $derived(phase === 'ready' || phase === 'static');
	const overflowActive = $derived(overflow > 0.32);
	const introFade = $derived(Math.max(0, 1 - progress * 6.5));

	const freeBytes = $derived(
		Math.max(0, (TOTAL_FRAMES - stackFrames - heapFrames) * FRAME_BYTES)
	);
	const freeLabel = $derived(formatBytes(freeBytes));
	const phaseLabel = $derived.by(() => {
		if (phase === 'error') return 'OFFLINE';
		if (!loaded) return 'BUFFERING';
		if (overflow > 0.32) return 'OVERFLOW';
		if (progress > 0.7) return 'CONTACT';
		return 'ALLOCATING';
	});
	const announcement = $derived.by(() => {
		if (phase === 'error') return `3D memory model unavailable. ${errorMessage}`;
		if (phase === 'boot' || phase === 'loading') return 'Loading the interactive memory model.';
		if (overflow > 0.32) {
			return 'Stack overflow. The stack has collided with the heap at address zero. No free address space remains.';
		}
		return 'Interactive 3D memory model. Scroll to grow the stack downward and the heap upward. When the towers meet in the middle, the stack overflows.';
	});

	function formatBytes(bytes: number) {
		if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
		if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KB`;
		return `${bytes} B`;
	}

	function clamp01(value: number) {
		return Math.min(1, Math.max(0, value));
	}

	function smoothstep(edge0: number, edge1: number, value: number) {
		const t = clamp01((value - edge0) / (edge1 - edge0));
		return t * t * (3 - 2 * t);
	}

	function easeOutCubic(value: number) {
		return 1 - Math.pow(1 - value, 3);
	}

	function easeInOutCubic(value: number) {
		return value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2;
	}

	// Cheap deterministic step-noise (0..1) for the brown-out flicker; no Math.random per frame.
	function stepNoise(index: number) {
		const x = Math.sin(index * 127.1 + 311.7) * 43758.5453;
		return x - Math.floor(x);
	}

	// Camera rig constants. The layout distance already frames both decks with a small margin,
	// so the dolly starts wide and settles at 1.0 instead of pushing past the safe frame.
	const CAMERA_BASE_Y = 1.18;
	const LOOK_Y = -0.12;

	onMount(() => {
		let disposed = false;
		let renderer: Three.WebGLRenderer | undefined;
		let bloom: Bloom | null = null;
		let scene: Three.Scene | undefined;
		let camera: Three.PerspectiveCamera | undefined;
		let environmentTexture: Three.Texture | undefined;
		let contactLight: Three.PointLight | undefined;
		let ringMaterial: Three.MeshBasicMaterial | undefined;
		let bloomMaterial: Three.MeshBasicMaterial | undefined;
		let bloomNode: Three.Mesh | undefined;
		let ringNode: Three.Mesh | undefined;
		let scrollTrigger: { kill: () => void } | undefined;
		let scrollTween: ReturnType<typeof import('gsap').gsap.to> | undefined;
		let resizeTimer = 0;
		let frameId = 0;
		let clockTime = 0;
		let cameraDistance = 13;
		let needsRender = true;
		let parallax: Parallax | null = null;
		let visible = true;

		const blocks: BlockRecord[] = [];
		const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
		reducedMotion = motionQuery.matches;

		document.documentElement.classList.add('stack-heap');

		// Populated by the dynamic imports so the initial route chunk stays light.
		let THREE!: typeof import('three');
		let gsap!: typeof import('gsap').gsap;
		let ScrollTrigger!: typeof import('gsap/ScrollTrigger').ScrollTrigger;
		let GLTFLoader!: typeof import('three/examples/jsm/loaders/GLTFLoader.js').GLTFLoader;
		let DRACOLoader!: typeof import('three/examples/jsm/loaders/DRACOLoader.js').DRACOLoader;
		let KTX2Loader!: typeof import('three/examples/jsm/loaders/KTX2Loader.js').KTX2Loader;
		let HDRLoader!: typeof import('three/examples/jsm/loaders/HDRLoader.js').HDRLoader;

		const url = (path: Parameters<typeof resolveAsset>[0]) => resolveAsset(`/${path}`);
		const decoderPath = (file: Parameters<typeof resolveAsset>[0]) =>
			resolveAsset(`/${file}`).replace(/[^/]*$/, '');

		function updateCameraLayout(aspect: number) {
			if (!camera) return;
			const fov = THREE.MathUtils.degToRad(camera.fov);
			// Keep both decks and the widest HUD-safe part of the collision rings in view.
			const halfHeight = 3.35;
			const halfWidth = aspect < 0.8 ? 2.22 : 2.82;
			const distanceForHeight = halfHeight / Math.tan(fov / 2);
			const distanceForWidth = halfWidth / (Math.tan(fov / 2) * aspect);
			cameraDistance = Math.max(distanceForHeight, distanceForWidth) * 1.02;
			camera.position.set(0, CAMERA_BASE_Y, cameraDistance);
			camera.lookAt(0, LOOK_Y, 0);
			camera.updateProjectionMatrix();
		}

		function sizeRenderer() {
			if (!renderer || !camera || !canvasHost || !sectionEl) return;
			const width = canvasHost.clientWidth || sectionEl.clientWidth;
			const height = canvasHost.clientHeight || window.innerHeight;
			if (!width || !height) return;
			renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
			renderer.setSize(width, height, false);
			bloom?.setSize(width, height);
			camera.aspect = width / height;
			updateCameraLayout(camera.aspect);
			updateScene(progress, clockTime);
			needsRender = true;
		}

		function updateScene(p: number, time: number) {
			if (!THREE) return;
			const clamped = clamp01(p);
			const contact = smoothstep(COLLISION_AT - 0.004, 0.985, clamped);
			const jam = smoothstep(0.95, 1, clamped);
			// Scroll-linked transient: spikes at first contact, then relaxes to a held glow.
			const impact =
				smoothstep(COLLISION_AT - 0.004, COLLISION_AT + 0.022, clamped) *
				(1 - 0.78 * smoothstep(COLLISION_AT + 0.022, COLLISION_AT + 0.12, clamped));
			// Reduced motion renders one calm, static frame: no time-driven shake, pulse or flicker.
			const live = !motionQuery.matches;
			const t = live ? time : 0;
			overflow = contact;

			// Brown-out: the glow sags in short irregular steps while the towers are jammed.
			const brownout =
				live && jam > 0 ? 1 - 0.22 * jam * stepNoise(Math.floor(t * 14)) * stepNoise(Math.floor(t * 5.3) + 9) : 1;

			let stackCount = 0;
			let heapCount = 0;

			for (const block of blocks) {
				const grown = easeOutCubic(clamp01((clamped - block.start) / block.duration));
				const present = grown > 0.0005;
				block.mesh.visible = present;
				if (!present) continue;

				if (block.tower === 'stack') stackCount += 1;
				else heapCount += 1;

				const grow = 0.015 + 0.985 * grown;
				const squeeze = block.level === 6 ? 1 + 0.06 * jam : 1;
				const scaledHeight = block.height * grow * squeeze;

				block.mesh.scale.set(1, grow * squeeze, 1);
				block.mesh.position.y =
					block.tower === 'stack'
						? block.top - scaledHeight * 0.5
						: block.bottom + scaledHeight * 0.5;

				// The last pair strains against each other instead of passing through.
				if (block.level === 6 && jam > 0 && live) {
					block.mesh.position.y += Math.sin(t * 31 + block.lane * 1.7) * 0.0032 * jam;
				}

				// Heat bleeds outward from the collision plane, level by level (steeper = more local,
				// so it reads as a failing junction rather than a uniformly lit tower).
				const distanceFromContact = 6 - block.level;
				const falloff = Math.exp(-distanceFromContact * 1.7);
				const levelBoost = block.level === 6 ? 1.1 : 1;
				block.material.emissiveIntensity =
					(contact * 0.5 + impact * 0.5) * falloff * levelBoost * 0.62 * brownout;
			}

			stackFrames = stackCount;
			heapFrames = heapCount;

			if (ringMaterial) {
				ringMaterial.opacity =
					(contact * (0.16 + 0.04 * Math.sin(t * 2.4)) + impact * 0.2) * brownout;
				if (ringNode) {
					ringNode.visible = contact > 0.004;
					// A shockwave that expands once on impact, then rests.
					const ringScale = 1 + 0.16 * (1 - Math.pow(1 - smoothstep(COLLISION_AT - 0.004, COLLISION_AT + 0.1, clamped), 3));
					ringNode.scale.set(ringScale, 1, ringScale);
				}
			}
			if (bloomMaterial && bloomNode) {
				bloomMaterial.opacity = (contact * 0.16 + impact * 0.26) * brownout;
				bloomNode.visible = contact > 0.004;
				const pulse = 1 + 0.025 * Math.sin(t * 2.2) * contact + 0.12 * impact;
				bloomNode.scale.set(pulse, pulse, 1);
			}
			if (contactLight) contactLight.intensity = (contact * 1.3 + impact * 1.6) * brownout;

			if (camera) {
				// Slow scroll-linked dolly: wide establishing frame settling into the layout distance.
				const travel = easeInOutCubic(smoothstep(0, 0.86, clamped));
				const dolly = 1.1 - 0.1 * travel;
				// A single heavy recoil on impact, damped by the held jam.
				const recoil = impact * 0.045;
				const dist = cameraDistance * (dolly + recoil);
				// Gentle lateral arc + descent so the rim lights sweep across the towers.
				const arc = (travel - 0.5) * 0.9;
				let x = arc;
				let y = CAMERA_BASE_Y + 0.32 * (1 - travel);
				let z = dist;

				if (live) {
					// Low-frequency, impact-weighted tremor (heavy mass) + faint sustained hum.
					const amp = impact * 0.05 + contact * contact * 0.006;
					if (amp > 0.0001) {
						x += (Math.sin(t * 9.1) * 0.6 + Math.sin(t * 15.7) * 0.4) * amp;
						y += (Math.cos(t * 11.3) * 0.6 + Math.sin(t * 19.1) * 0.4) * amp * 0.8;
						z += Math.sin(t * 7.7) * amp * 0.5;
					}
				}

				camera.position.set(x, y, z);
				camera.lookAt(arc * 0.15, LOOK_Y, 0);
			}

			needsRender = true;
		}

		async function init() {
			const [threeModule, gltfModule, dracoModule, ktx2Module, hdrModule, gsapModule, stModule] =
				await Promise.all([
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
			ScrollTrigger = stModule.ScrollTrigger;
			GLTFLoader = gltfModule.GLTFLoader;
			DRACOLoader = dracoModule.DRACOLoader;
			KTX2Loader = ktx2Module.KTX2Loader;
			HDRLoader = hdrModule.HDRLoader;
			gsap.registerPlugin(ScrollTrigger);

			const width = canvasHost.clientWidth || window.innerWidth;
			const height = canvasHost.clientHeight || window.innerHeight;
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
			renderer.toneMappingExposure = 1.05;
			renderer.shadowMap.enabled = true;
			renderer.shadowMap.type = THREE.PCFShadowMap;
			renderer.domElement.className = 'stack-heap__webgl';
			renderer.domElement.setAttribute('aria-hidden', 'true');
			canvasHost.appendChild(renderer.domElement);

			scene = new THREE.Scene();
			camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 100);
			updateCameraLayout(width / height);

			phase = 'loading';
			loadPercent = 12;

			const pmrem = new THREE.PMREMGenerator(renderer);
			const hdrLoader = new HDRLoader();

			try {
				const hdr = await hdrLoader.loadAsync(url('hdri/studio_small_08_1k.hdr'));
				if (disposed) {
					hdr.dispose();
					pmrem.dispose();
					return;
				}
				hdr.mapping = THREE.EquirectangularReflectionMapping;
				warmEnvironment(hdr); // tint the studio HDRI toward the warm room before PMREM filtering
				environmentTexture = pmrem.fromEquirectangular(hdr).texture;
				scene.environment = environmentTexture;
				hdr.dispose();
			} catch (environmentError) {
				console.warn('[StackHeapVisualizer] HDRI environment failed to load.', environmentError);
			} finally {
				pmrem.dispose();
			}

			if (disposed) return;
			loadPercent = 24;

			// Warm key / cool fill / cold rim studio, biased toward a low raking key so the
			// extruding blocks throw long, deep shadows across the neighbouring lanes and decks.
			const keyLight = new THREE.DirectionalLight(0xffe9d2, 4.4);
			keyLight.position.set(7.6, 6.0, 4.6);
			keyLight.castShadow = true;
			keyLight.shadow.mapSize.set(2048, 2048);
			keyLight.shadow.camera.near = 0.5;
			keyLight.shadow.camera.far = 30;
			keyLight.shadow.camera.left = -6;
			keyLight.shadow.camera.right = 6;
			keyLight.shadow.camera.top = 6.5;
			keyLight.shadow.camera.bottom = -6.5;
			keyLight.shadow.bias = -0.0003;
			keyLight.shadow.normalBias = 0.02;
			keyLight.shadow.radius = 2.5;
			keyLight.shadow.intensity = 0.94;
			scene.add(keyLight);

			// Low, cool fill: just enough to keep the shadow side of the graphite readable.
			const fillLight = new THREE.DirectionalLight(0x7f9cf0, 0.55);
			fillLight.position.set(-7.5, 3.0, 4.2);
			scene.add(fillLight);

			// Cold rim from behind-above traces the top edges of the stack in silicon blue.
			const rimLight = new THREE.DirectionalLight(0xa4e4ee, 3.6);
			rimLight.position.set(-2.4, 4.8, -8.5);
			scene.add(rimLight);

			// Warm kicker from behind-below catches the heap's bronze edges.
			const kickLight = new THREE.DirectionalLight(0xff9a5c, 2.1);
			kickLight.position.set(5.2, -4.2, -6.8);
			scene.add(kickLight);

			const hemiLight = new THREE.HemisphereLight(WARM_AMBIENT, 0x050607, 0.16);
			scene.add(hemiLight);

			// Red light is driven by the collision; invisible until contact.
			contactLight = new THREE.PointLight(0xff3a1c, 0, 6.2, 2);
			contactLight.position.set(0, 0, 1.5);
			scene.add(contactLight);

			// Static floor rings keep the empty stage grounded before growth starts.
			for (const [radius, opacity] of [
				[2.55, 0.2],
				[3.2, 0.09]
			] as const) {
				const floorRing = new THREE.Mesh(
					new THREE.RingGeometry(radius, radius + 0.008, 128),
					new THREE.MeshBasicMaterial({
						color: 0x2f6f70,
						transparent: true,
						opacity,
						side: THREE.DoubleSide,
						depthWrite: false,
						toneMapped: false
					})
				);
				floorRing.rotation.x = -Math.PI / 2;
				floorRing.position.y = -2.995;
				scene.add(floorRing);
			}

			const draco = new DRACOLoader();
			draco.setDecoderPath(decoderPath('draco/draco_decoder.js'));

			const ktx2 = new KTX2Loader();
			ktx2.setTranscoderPath(decoderPath('basis/basis_transcoder.js'));
			ktx2.detectSupport(renderer);

			const loader = new GLTFLoader();
			loader.setDRACOLoader(draco);
			loader.setKTX2Loader(ktx2);

			let gltf;
			try {
				gltf = await loader.loadAsync(url('models/stack-heap.glb'), (event) => {
					if (event.total > 0) {
						const value = 30 + (event.loaded / event.total) * 60;
						loadPercent = Math.max(loadPercent, Math.min(94, Math.round(value)));
					}
				});
			} finally {
				draco.dispose();
				ktx2.dispose();
			}

			if (disposed || !scene || !camera) return;
			loadPercent = 96;

			const maxAnisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

			/**
			 * Per-material finish. `env` is applied through `material.envMap`: three ignores
			 * `material.envMapIntensity` unless the material owns an envMap (scene.environment only
			 * feeds the uniform through scene.environmentIntensity, which would override it).
			 * Block ORM textures bake a low metalness channel (~0.2), so blocks drop the metalness map
			 * and take an explicit value; roughness keeps its baked etching via the roughness map.
			 * `tint` multiplies the (very dark) baked albedo, which sets the metal's reflective colour.
			 */
			type Finish = {
				env: number;
				roughness?: number;
				metalness?: number;
				emissiveIntensity?: number;
				flatMetal?: boolean;
				tint?: [number, number, number];
			};
			const finishes: Record<string, Finish> = {
				// Stack: cool brushed graphite / silicon, a restrained satin sheen.
				'memory block stack a': {
					env: 1.15,
					roughness: 0.72,
					metalness: 0.82,
					flatMetal: true,
					tint: [1.55, 1.7, 1.78]
				},
				'memory block stack b': {
					env: 1.05,
					roughness: 0.8,
					metalness: 0.8,
					flatMetal: true,
					tint: [1.0, 1.18, 1.26]
				},
				// Heap: warm oxidised bronze / copper, a touch rougher with a patina of dark tarnish.
				'memory block heap a': {
					env: 1.3,
					roughness: 0.84,
					metalness: 0.9,
					flatMetal: true,
					tint: [5.4, 2.7, 1.25]
				},
				'memory block heap b': {
					env: 1.2,
					roughness: 0.95,
					metalness: 0.88,
					flatMetal: true,
					tint: [3.6, 1.95, 1.0]
				},
				'deck edge': { env: 1.0, roughness: 0.34, metalness: 0.95 },
				'deck top stack': { env: 0.8, roughness: 1 },
				'deck top heap': { env: 0.8, roughness: 1 },
				'fascia stack': { env: 0.9, roughness: 0.38, metalness: 0.12 },
				'fascia heap': { env: 0.9, roughness: 0.38, metalness: 0.12 },
				'deck gold trim': { env: 1.3, roughness: 0.24 },
				'deck steel': { env: 1.1, roughness: 0.34 },
				'status stack': { env: 0.6, emissiveIntensity: 2.2 },
				'status heap': { env: 0.6, emissiveIntensity: 2.2 }
			};

			const tunedMaterials = new Set<Three.Material>();
			function tuneMaterial(material: Three.Material) {
				if (tunedMaterials.has(material)) return;
				tunedMaterials.add(material);
				const surface = material as Three.MeshStandardMaterial;
				const finish = finishes[material.name.toLowerCase()];
				if (environmentTexture) surface.envMap = environmentTexture;
				surface.envMapIntensity = finish?.env ?? 1;
				if (finish) {
					if (finish.roughness !== undefined) surface.roughness = finish.roughness;
					if (finish.metalness !== undefined) surface.metalness = finish.metalness;
					if (finish.flatMetal) surface.metalnessMap = null;
					if (finish.tint) surface.color.setRGB(...finish.tint, THREE.LinearSRGBColorSpace);
					if (finish.emissiveIntensity !== undefined) {
						surface.emissiveIntensity = finish.emissiveIntensity;
					}
				}
				if (surface.map) {
					surface.map.anisotropy = maxAnisotropy;
					surface.map.needsUpdate = true;
				}
				if (surface.metalnessMap) {
					surface.metalnessMap.anisotropy = maxAnisotropy;
					surface.metalnessMap.needsUpdate = true;
				}
				if (surface.roughnessMap) {
					surface.roughnessMap.anisotropy = maxAnisotropy;
					surface.roughnessMap.needsUpdate = true;
				}
			}

			gltf.scene.traverse((object) => {
				const mesh = object as Three.Mesh;
				if (!mesh.isMesh) return;
				const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
				for (const material of materials) tuneMaterial(material);

				const data = mesh.userData as {
					tower?: Tower;
					level?: number;
					lane?: number;
					height?: number;
				};

				if (data.tower === 'stack' || data.tower === 'heap') {
					const material = (mesh.material as Three.MeshStandardMaterial).clone();
					material.emissive = new THREE.Color(0xe0200c);
					material.emissiveIntensity = 0;
					mesh.material = material;
					mesh.castShadow = true;
					mesh.receiveShadow = true;

					const height = data.height ?? 0.34;
					const baseY = mesh.position.y;
					const level = data.level ?? 0;
					const lane = data.lane ?? 0;
					const start = level === 0 ? 0.02 : 0.02 + level * 0.105;
					const duration = level === 6 ? 0.2 : 0.17;

					blocks.push({
						mesh,
						material,
						tower: data.tower,
						level,
						lane,
						start,
						duration,
						height,
						top: baseY + height / 2,
						bottom: baseY - height / 2
					});
					return;
				}

				if (mesh.name === 'stack-deck' || mesh.name === 'heap-deck') {
					mesh.castShadow = true;
					mesh.receiveShadow = true;
					return;
				}

				if (mesh.name === 'contact-ring') {
					ringNode = mesh;
					ringMaterial = new THREE.MeshBasicMaterial({
						color: 0xff2a18,
						transparent: true,
						opacity: 0,
						blending: THREE.AdditiveBlending,
						depthWrite: false,
						side: THREE.DoubleSide,
						toneMapped: false
					});
					mesh.material = ringMaterial;
					mesh.renderOrder = 6;
					mesh.visible = false;
					return;
				}

				if (mesh.name === 'contact-bloom') {
					bloomNode = mesh;
					const source = mesh.material as Three.MeshStandardMaterial;
					bloomMaterial = new THREE.MeshBasicMaterial({
						map: source.map,
						transparent: true,
						opacity: 0,
						blending: THREE.AdditiveBlending,
						depthWrite: false,
						depthTest: false,
						side: THREE.DoubleSide,
						toneMapped: false
					});
					mesh.material = bloomMaterial;
					mesh.renderOrder = 20;
					mesh.visible = false;
					return;
				}

				mesh.castShadow = true;
				mesh.receiveShadow = true;
			});

			if (blocks.length !== BLOCKS_PER_TOWER * 2) {
				throw new Error(`Expected ${BLOCKS_PER_TOWER * 2} memory blocks, found ${blocks.length}.`);
			}

			scene.add(gltf.scene);
			updateScene(reducedMotion ? 0.95 : 0, 0);

			// Resize + scroll wiring -------------------------------------------------
			const onResize = () => {
				window.clearTimeout(resizeTimer);
				resizeTimer = window.setTimeout(() => {
					sizeRenderer();
					ScrollTrigger.refresh();
				}, 160);
			};

			window.addEventListener('resize', onResize);
			const resizeObserver = new ResizeObserver(() => sizeRenderer());
			resizeObserver.observe(canvasHost);

			const intersectionObserver = new IntersectionObserver(
				([entry]) => {
					visible = entry.isIntersecting;
					if (visible) needsRender = true;
				},
				{ threshold: 0.01 }
			);
			intersectionObserver.observe(sectionEl);

			if (reducedMotion) {
				progress = 0.95;
				overflow = smoothstep(COLLISION_AT - 0.004, 0.985, 0.95);
				updateScene(0.95, 0);
				phase = 'static';
				loadPercent = 100;
				needsRender = true;
			} else {
				const proxy = { p: 0 };
				scrollTween = gsap.to(proxy, {
					p: 1,
					ease: 'none',
					paused: true,
					onUpdate: () => {
						progress = proxy.p;
						updateScene(proxy.p, clockTime);
					}
				});
				scrollTrigger = ScrollTrigger.create({
					trigger: sectionEl,
					start: embeddedMode ? 'top bottom' : 'top top',
					end: embeddedMode ? 'bottom top' : 'bottom bottom',
					scrub: 1.8,
					animation: scrollTween,
					invalidateOnRefresh: true
				});
				ScrollTrigger.refresh();
				bloom = await createBloom(THREE, renderer, scene, camera);
				if (disposed) {
					// cleanup() below still runs; just release the composer targets now.
					bloom?.dispose();
					bloom = null;
				}
				phase = 'ready';
				loadPercent = 100;
				needsRender = true;
			}

			const loop = () => {
				frameId = requestAnimationFrame(loop);
				if (disposed) return;
				clockTime = performance.now() / 1000;
				if (overflow > 0.001 && !motionQuery.matches) {
					updateScene(progress, clockTime);
					needsRender = true;
				}
				if (visible && parallax?.step()) needsRender = true;
				if (!visible || !needsRender || !renderer || !scene || !camera) return;
				needsRender = false;
				parallax?.apply(camera);
				if (bloomNode) bloomNode.quaternion.copy(camera.quaternion);
				if (bloom) bloom.render();
				else renderer.render(scene, camera);
				parallax?.restore(camera);
			};
			parallax = createParallax(sectionEl, { strength: 0.5 });
			frameId = requestAnimationFrame(loop);

			// Cleanup is registered here so the component still disposes if the
			// async load fails after the renderer exists.
			const cleanup = () => {
				disposed = true;
				parallax?.destroy();
				cancelAnimationFrame(frameId);
				window.clearTimeout(resizeTimer);
				window.removeEventListener('resize', onResize);
				resizeObserver.disconnect();
				intersectionObserver.disconnect();
				scrollTrigger?.kill();
				scrollTween?.kill();

				scene?.traverse((object) => {
					const mesh = object as Three.Mesh;
					if (mesh.geometry) mesh.geometry.dispose();
					const materials = Array.isArray(mesh.material)
						? mesh.material
						: mesh.material
							? [mesh.material]
							: [];
					for (const material of materials) {
						const surface = material as Three.MeshStandardMaterial;
						surface.map?.dispose();
						surface.metalnessMap?.dispose();
						surface.roughnessMap?.dispose();
						surface.emissiveMap?.dispose();
						material.dispose();
					}
				});
				environmentTexture?.dispose();
				bloom?.dispose();
				bloom = null;
				renderer?.dispose();
				renderer?.domElement.remove();
				document.documentElement.classList.remove('stack-heap');
			};

			return cleanup;
		}

		let cleanup: (() => void) | undefined;
		init()
			.then((result) => {
				if (disposed) {
					result?.();
					return;
				}
				cleanup = result;
			})
			.catch((error) => {
				console.error('[StackHeapVisualizer] initialization failed.', error);
				errorMessage = error instanceof Error ? error.message : 'Unknown error.';
				phase = 'error';
				loadPercent = 100;
			});

		return () => {
			disposed = true;
			cleanup?.();
			cancelAnimationFrame(frameId);
			document.documentElement.classList.remove('stack-heap');
		};
	});
</script>

<svelte:head>
	<meta
		name="description"
		content="An interactive 3D stack and heap that grow toward each other until the stack overflows."
	/>
</svelte:head>

<section
	bind:this={sectionEl}
	class="stack-heap {className}"
	class:is-overflow={overflowActive}
	class:is-ready={loaded}
	class:is-embedded={embeddedMode}
	style="--p:{progress.toFixed(4)}; --o:{overflow.toFixed(4)}; --fade:{introFade.toFixed(3)}"
	aria-labelledby={embeddedMode ? undefined : `${id}-title`}
	aria-label={embeddedMode ? `${title} ${accent}` : undefined}
>
	<div class="stage">
		<div class="canvas" bind:this={canvasHost}></div>

		<div class="tint" aria-hidden="true"></div>
		<div class="grid" aria-hidden="true"></div>
		<div class="vignette" aria-hidden="true"></div>
		<div class="seam" aria-hidden="true"></div>
		<div class="flash" aria-hidden="true"></div>
		<div class="grain" aria-hidden="true"></div>

		{#if !embeddedMode}
			<div class="intro" style="opacity:{introFade}">
				<p class="eyebrow"><span>{eyebrow}</span><span class="eyebrow__rule"></span><span>Fig. 03</span></p>
				<h1 id="{id}-title">{title}<br /><em>{accent}</em></h1>
				<p class="lede">{subtitle}</p>
			</div>
		{/if}

		<aside class="bounds" aria-hidden="true">
			<p class="bounds__title">Fig. 03 · Address space</p>
			<div class="bound">
				<span class="bound__key">STACK</span>
				<span class="bound__dir">high → low</span>
				<span class="bound__value">{String(stackFrames).padStart(2, '0')}<i>/42</i></span>
			</div>
			<div class="bound__gap">
				<span>FREE</span>
				<strong>{freeLabel}</strong>
			</div>
			<div class="bound">
				<span class="bound__key">HEAP</span>
				<span class="bound__dir">low → high</span>
				<span class="bound__value">{String(heapFrames).padStart(2, '0')}<i>/42</i></span>
			</div>
			<div class="bound__state">
				<span class="dot"></span>
				<span>{phaseLabel}</span>
			</div>
		</aside>

		<div class="overflow" class:is-live={overflowActive} role="status" aria-hidden={!overflowActive}>
			<span class="overflow__mark" aria-hidden="true">!</span>
			<span class="overflow__copy">
				<strong>Stack overflow</strong>
				<i>frame #43 rejected — no free address space</i>
			</span>
		</div>

		<div class="cue" style="opacity:{introFade}">
			<span class="cue__line"></span>
			<span>{scrollLabel}</span>
		</div>

		<div class="readout">
			<div class="readout__item">
				<span class="k">STACK</span>
				<span class="v">{stackFrames}<i> / 42 frames</i></span>
			</div>
			<div class="readout__item">
				<span class="k">HEAP</span>
				<span class="v">{heapFrames}<i> / 42 frames</i></span>
			</div>
			<div class="readout__item readout__item--gap">
				<span class="k">GAP</span>
				<span class="v">{freeLabel}</span>
			</div>
			<div class="readout__item readout__item--addr">
				<span class="k">CONTACT</span>
				<span class="v">0x0000 0000</span>
			</div>
			<div class="readout__item readout__item--state">
				<span class="k">STATE</span>
				<span class="v">{phaseLabel}</span>
			</div>
		</div>

		<div class="loader" class:is-hidden={loaded} aria-hidden={loaded}>
			{#if phase === 'error'}
				<div class="loader__inner loader__inner--error">
					<span class="loader__mark">!</span>
					<strong>Model unavailable</strong>
					<p>{errorMessage}</p>
				</div>
			{:else}
				<div class="loader__inner">
					<span class="loader__spinner" aria-hidden="true"></span>
					<span class="loader__label">COMPILING MEMORY MODEL</span>
					<span class="loader__meter"><i style="width:{loadPercent}%"></i></span>
					<span class="loader__percent">{loadPercent}%</span>
				</div>
			{/if}
		</div>

		<noscript>
			<p class="fallback">
				This 3D explainer needs JavaScript. The stack grows down from high addresses, the heap grows
				up from low addresses, and a stack overflow happens when the two collide.
			</p>
		</noscript>
	</div>

	<p class="sr-only" aria-live="polite">{announcement}</p>
</section>

<style>
	/* "Premium Textbook" tokens: Inter body, Goudy headings, blueprint hairlines, 0px radius. */
	.stack-heap {
		--sh-font-body: var(--font-sans, Inter), 'Inter Variable', -apple-system, BlinkMacSystemFont,
			'Helvetica Neue', 'Segoe UI', sans-serif;
		--sh-font-heading: var(--font-display, 'Goudy Old Style'), 'Goudy Bookletter 1911', 'Sorts Mill Goudy',
			Garamond, 'Iowan Old Style', Georgia, serif;
		--sh-font-mono: 'SFMono-Regular', Menlo, Monaco, Consolas, monospace;
		--sh-radius: 0px;
		--sh-ink: var(--color-slate);
		--sh-soft: var(--color-dark-gray);
		--sh-muted: var(--color-dark-gray);
		--sh-faint: var(--text-muted);
		--sh-accent: var(--color-clay-ink);
		--sh-cool: var(--color-teal-ink);
		--sh-line: rgba(138, 130, 116, 0.4);
		--sh-line-strong: rgba(138, 130, 116, 0.9);
		--sh-panel: rgba(255, 253, 249, 0.88);
		--sh-alert: #a8321f;
		--sh-alert-soft: #a8321f;
		position: relative;
		font-family: var(--sh-font-body);
		-webkit-font-smoothing: antialiased;
		-moz-osx-font-smoothing: grayscale;
		height: 320svh;
		max-width: 100%;
		background: transparent;
		color: var(--color-slate);
		isolation: isolate;
	}

	.stage {
		position: sticky;
		top: 0;
		height: 100svh;
		overflow: hidden;
	}

	.canvas {
		position: absolute;
		inset: 0;
		z-index: 0;
	}

	.canvas :global(.stack-heap__webgl) {
		display: block;
		width: 100%;
		height: 100%;
		opacity: 0;
		transition: opacity 1.1s ease 0.15s;
	}

	.is-ready .canvas :global(.stack-heap__webgl) {
		opacity: 1;
	}

	.tint,
	.grid,
	.vignette,
	.seam,
	.flash,
	.grain {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}

	.tint {
		z-index: 1;
		background: transparent;
	}

	.grid {
		z-index: 1;
		background-image:
			linear-gradient(rgba(68, 166, 228, 0.1) 1px, transparent 1px),
			linear-gradient(90deg, rgba(68, 166, 228, 0.1) 1px, transparent 1px);
		background-size: 88px 88px;
		mask-image: radial-gradient(120% 90% at 50% 50%, transparent 30%, #000 100%);
		opacity: 0.55;
	}

	.vignette {
		z-index: 2;
		display: none;
	}

	.seam {
		z-index: 2;
		top: 51.2%;
		height: 1px;
		background: linear-gradient(
			90deg,
			transparent 4%,
			rgba(168, 50, 31, 0.95) 38%,
			rgba(168, 50, 31, 0.95) 50%,
			rgba(168, 50, 31, 0.95) 62%,
			transparent 96%
		);
		opacity: var(--o);
		transform: scaleX(var(--o));
		transform-origin: 50% 50%;
	}

	.flash {
		z-index: 2;
		background: radial-gradient(52% 26% at 50% 51%, rgba(168, 50, 31, 0.1), transparent 72%);
		opacity: var(--o);
	}

	.grain {
		z-index: 3;
		display: none;
	}

	.intro {
		position: absolute;
		top: clamp(92px, 14vh, 148px);
		left: clamp(20px, 4.4vw, 68px);
		z-index: 5;
		width: min(500px, 44vw);
		will-change: opacity;
	}

	.eyebrow {
		display: flex;
		align-items: center;
		gap: 12px;
		margin: 0 0 22px;
		font-family: var(--sh-font-mono);
		font-size: 10px;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		color: var(--sh-muted);
	}

	.eyebrow__rule {
		display: block;
		width: 34px;
		height: 1px;
		background: var(--sh-accent);
	}

	.intro h1 {
		margin: 0 0 20px;
		font-family: var(--sh-font-heading);
		font-size: clamp(2.5rem, 4.7vw, 4.5rem);
		font-weight: 400;
		line-height: 1;
		letter-spacing: -0.02em;
		text-wrap: balance;
	}

	.intro h1 em {
		font-style: normal;
		color: var(--sh-accent);
	}

	.lede {
		margin: 0;
		max-width: 380px;
		font-family: var(--sh-font-body);
		font-size: 0.92rem;
		line-height: 1.65;
		color: var(--sh-soft);
		text-wrap: pretty;
	}

	/* Blueprint spec rail: ruled frame with corner registration ticks, no radii. */
	.bounds {
		position: absolute;
		top: 50%;
		right: clamp(20px, 4.4vw, 68px);
		z-index: 5;
		width: 204px;
		padding: 14px 16px 16px;
		transform: translateY(-50%);
		border: 1px solid var(--sh-line);
		border-radius: var(--sh-radius);
		background: var(--sh-panel);
	}

	.bounds::before,
	.bounds::after {
		content: '';
		position: absolute;
		width: 9px;
		height: 9px;
		border: 1px solid var(--sh-line-strong);
		pointer-events: none;
	}

	.bounds::before {
		top: -1px;
		left: -1px;
		border-right: 0;
		border-bottom: 0;
	}

	.bounds::after {
		right: -1px;
		bottom: -1px;
		border-top: 0;
		border-left: 0;
	}

	.bounds__title {
		margin: 0 0 4px;
		padding-bottom: 9px;
		border-bottom: 1px dashed var(--sh-line);
		font-family: var(--sh-font-heading);
		font-size: 12px;
		font-style: normal;
		letter-spacing: 0.01em;
		color: var(--sh-muted);
	}

	.bound {
		display: grid;
		grid-template-columns: 1fr auto;
		align-items: end;
		row-gap: 3px;
		padding: 12px 0;
	}

	.bound__key {
		font-family: var(--sh-font-mono);
		font-size: 10px;
		letter-spacing: 0.2em;
		color: var(--sh-accent);
	}

	.bound__dir {
		font-family: var(--sh-font-mono);
		font-size: 9px;
		letter-spacing: 0.12em;
		color: var(--sh-faint);
	}

	.bound__value {
		grid-column: 2;
		grid-row: 1 / span 2;
		font-family: var(--sh-font-body);
		font-feature-settings: 'tnum', 'cv11';
		font-size: 26px;
		font-weight: 300;
		line-height: 1;
		color: var(--sh-ink);
	}

	.bound__value i {
		font-style: normal;
		font-size: 10px;
		font-weight: 400;
		color: var(--sh-faint);
	}

	.bound__gap {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 10px;
		padding: 10px 0;
		border-top: 1px solid var(--sh-line);
		border-bottom: 1px solid var(--sh-line);
		font-family: var(--sh-font-mono);
		font-size: 9px;
		letter-spacing: 0.2em;
		color: var(--sh-faint);
	}

	.bound__gap strong {
		font-family: var(--sh-font-body);
		font-feature-settings: 'tnum';
		font-weight: 500;
		font-size: 12px;
		letter-spacing: 0.02em;
		color: var(--sh-ink);
	}

	.bound__state {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 14px;
		font-family: var(--sh-font-mono);
		font-size: 9px;
		letter-spacing: 0.22em;
		color: var(--sh-muted);
	}

	/* 0px radius: the status indicator is a square registration mark, not a dot. */
	.bound__state .dot {
		width: 6px;
		height: 6px;
		border-radius: var(--sh-radius);
		background: var(--sh-cool);
	}

	.is-overflow .bound__state {
		color: var(--sh-alert-soft);
	}

	.is-overflow .bound__state .dot {
		background: var(--sh-alert);
	}

	.overflow {
		position: absolute;
		top: clamp(96px, 14vh, 148px);
		left: 50%;
		z-index: 6;
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 12px 20px 12px 14px;
		border: 1px solid rgba(168, 50, 31, 0.55);
		border-left-width: 3px;
		border-radius: var(--sh-radius);
		background: var(--color-paper);
		opacity: 0;
		transform: translate(-50%, -10px);
		transition:
			opacity 0.45s ease,
			transform 0.45s ease;
		pointer-events: none;
	}

	.overflow.is-live {
		opacity: 1;
		transform: translate(-50%, 0);
	}

	.overflow__mark {
		display: grid;
		place-items: center;
		width: 24px;
		height: 24px;
		border: 1px solid rgba(168, 50, 31, 0.7);
		border-radius: var(--sh-radius);
		font-family: var(--sh-font-heading);
		font-size: 15px;
		font-weight: 700;
		color: var(--sh-alert-soft);
	}

	.overflow__copy {
		display: flex;
		flex-direction: column;
		gap: 3px;
	}

	.overflow__copy strong {
		font-family: var(--sh-font-heading);
		font-size: 17px;
		font-weight: 400;
		letter-spacing: 0.005em;
		color: var(--sh-alert);
	}

	.overflow__copy i {
		font-style: normal;
		font-family: var(--sh-font-mono);
		font-size: 9px;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--color-dark-gray);
	}

	.cue {
		position: absolute;
		bottom: 96px;
		left: 50%;
		z-index: 5;
		display: flex;
		align-items: center;
		gap: 10px;
		transform: translateX(-50%);
		font-family: var(--sh-font-mono);
		font-size: 9px;
		letter-spacing: 0.24em;
		text-transform: uppercase;
		color: var(--sh-soft);
		will-change: opacity;
	}

	.cue__line {
		width: 1px;
		height: 30px;
		background: linear-gradient(180deg, var(--sh-accent), transparent);
		animation: cue 2.4s ease-in-out infinite;
	}

	@keyframes cue {
		0%,
		100% {
			transform: scaleY(0.55);
			transform-origin: top;
			opacity: 0.5;
		}
		50% {
			transform: scaleY(1);
			transform-origin: top;
			opacity: 1;
		}
	}

	.readout {
		position: absolute;
		bottom: clamp(18px, 3.2vh, 34px);
		left: 50%;
		z-index: 5;
		display: flex;
		align-items: flex-end;
		gap: clamp(20px, 3.6vw, 52px);
		padding: 12px 22px 10px;
		transform: translateX(-50%);
		border: 1px solid var(--sh-line);
		border-radius: var(--sh-radius);
		background: var(--sh-panel);
		white-space: nowrap;
	}

	.readout__item {
		display: flex;
		flex-direction: column;
		gap: 5px;
	}

	.readout__item + .readout__item {
		padding-left: clamp(20px, 3.6vw, 52px);
		border-left: 1px dashed var(--sh-line);
	}

	.readout__item .k {
		font-family: var(--sh-font-mono);
		font-size: 8px;
		letter-spacing: 0.24em;
		color: var(--sh-faint);
	}

	.readout__item .v {
		font-family: var(--sh-font-body);
		font-feature-settings: 'tnum', 'cv11';
		font-size: 13px;
		font-weight: 500;
		letter-spacing: 0.01em;
		color: var(--sh-ink);
	}

	.readout__item .v i {
		font-style: normal;
		font-size: 9px;
		font-weight: 400;
		color: var(--sh-faint);
	}

	.is-overflow .readout__item--gap .v,
	.is-overflow .readout__item--state .v {
		color: var(--sh-alert-soft);
	}

	.loader {
		position: absolute;
		inset: 0;
		z-index: 9;
		display: grid;
		place-items: center;
		background: rgba(249, 248, 246, 0.7);
		opacity: 1;
		transition: opacity 0.8s ease;
	}

	.loader.is-hidden {
		opacity: 0;
		pointer-events: none;
	}

	.loader__inner {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		min-width: 210px;
	}

	.loader__spinner {
		width: 24px;
		height: 24px;
		border: 1px solid var(--sh-line);
		border-top-color: var(--sh-accent);
		border-radius: var(--sh-radius);
		animation: spin 1.1s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.loader__label {
		font-family: var(--sh-font-mono);
		font-size: 9px;
		letter-spacing: 0.26em;
		color: var(--sh-muted);
	}

	.loader__meter {
		display: block;
		width: 190px;
		height: 1px;
		background: var(--sh-line);
		overflow: hidden;
	}

	.loader__meter i {
		display: block;
		height: 100%;
		background: var(--sh-accent);
		transition: width 0.35s ease;
	}

	.loader__percent {
		font-family: var(--sh-font-mono);
		font-size: 9px;
		color: var(--sh-faint);
	}

	.loader__inner--error {
		max-width: 360px;
		text-align: center;
	}

	.loader__inner--error .loader__mark {
		display: grid;
		place-items: center;
		width: 30px;
		height: 30px;
		border: 1px solid rgba(168, 50, 31, 0.6);
		border-radius: var(--sh-radius);
		color: var(--sh-alert-soft);
	}

	.loader__inner--error strong {
		font-family: var(--sh-font-heading);
		font-size: 17px;
		font-weight: 400;
		color: var(--sh-alert);
	}

	.loader__inner--error p {
		margin: 0;
		font-size: 11px;
		line-height: 1.6;
		color: var(--color-dark-gray);
	}

	.fallback {
		position: absolute;
		inset: 0;
		z-index: 8;
		display: grid;
		place-items: center;
		max-width: 460px;
		margin: 0 auto;
		padding: 24px;
		font-size: 13px;
		line-height: 1.6;
		color: var(--sh-soft);
	}

	.sr-only {
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

	@media (max-width: 1080px) {
		.bounds {
			display: none;
		}

		.intro {
			width: min(460px, 58vw);
		}
	}

	@media (max-width: 760px) {
		.stack-heap {
			height: 300svh;
		}

		.intro {
			top: 86px;
			width: calc(100vw - 40px);
		}

		.intro h1 {
			font-size: clamp(2.2rem, 9vw, 3.1rem);
			max-width: 9em;
		}

		.lede {
			max-width: 34ch;
			font-size: 0.85rem;
		}

		.overflow {
			top: auto;
			bottom: 116px;
		}

		.bounds {
			display: none;
		}

		.cue {
			bottom: 82px;
		}

		.readout {
			gap: 16px;
			padding-top: 10px;
		}

		.readout__item--addr,
		.readout__item--state {
			display: none;
		}

		.readout__item .v {
			font-size: 12px;
		}
	}

	.stack-heap.is-embedded {
		height: 100%;
		min-height: 0;
		background: transparent;
	}

	.stack-heap.is-embedded .stage {
		position: relative;
		top: auto;
		height: 100%;
		min-height: 0;
	}

	.stack-heap.is-embedded .tint,
	.stack-heap.is-embedded .vignette,
	.stack-heap.is-embedded .grain,
	.stack-heap.is-embedded .intro,
	.stack-heap.is-embedded .cue,
	.stack-heap.is-embedded .bounds {
		display: none;
	}

	.stack-heap.is-embedded .readout {
		max-width: calc(100% - 24px);
		gap: clamp(10px, 2vw, 22px);
		padding-inline: 1rem;
	}

	.stack-heap.is-embedded .readout__item + .readout__item {
		padding-left: clamp(10px, 2vw, 22px);
	}

	@media (prefers-reduced-motion: reduce) {
		.stack-heap {
			height: auto;
		}

		.stage {
			position: relative;
			height: 100svh;
		}

		.intro,
		.cue {
			opacity: 1 !important;
		}

		.cue {
			display: none;
		}

		.seam,
		.flash {
			transition: none;
		}

		.loader {
			display: none;
		}
	}
</style>