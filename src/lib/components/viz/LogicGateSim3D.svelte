<script lang="ts">
	import { getContext, onMount } from 'svelte';
	import { STUDY_FRAME, type StudyFrame } from './frame-mode';
	import { asset as resolveAsset } from '$app/paths';
	import type * as Three from 'three';
	import { createBloom, type Bloom } from '$lib/utils/bloom';
	import { createParallax, type Parallax } from '$lib/utils/parallax';
	import { warmEnvironment, WARM_AMBIENT } from '$lib/utils/warm-environment';

	type Gate = 'AND' | 'OR' | 'XOR';
	type GsapTimeline = ReturnType<typeof import('gsap').gsap.timeline>;
	type Props = {
		id?: string;
		class?: string;
		eyebrow?: string;
		title?: string;
		subtitle?: string;
		embedded?: boolean;
	};

	let {
		id = 'logic-gate-sim',
		class: className = '',
		eyebrow = 'Silicon Path / Module 04 · Logic',
		title = 'Logic, made physical.',
		subtitle = 'Two inputs, three gates, one board. Toggle A and B and watch the signal run through real wire — from the posts, through the gate, out to the lamp.',
		embedded = false
	}: Props = $props();

	// Inside a lesson's <LazyStudy> frame: drop the editorial header and let the
	// board, controls and truth table share the frame's fixed height.
	const studyFrame = getContext<StudyFrame | undefined>(STUDY_FRAME);
	const embeddedMode = $derived(embedded || studyFrame?.embedded === true);

	const GATES: Gate[] = ['AND', 'OR', 'XOR'];

	const META: Record<Gate, { part: string; symbol: string; word: string }> = {
		AND: { part: '7408', symbol: '·', word: 'both inputs' },
		OR: { part: '7432', symbol: '+', word: 'either input' },
		XOR: { part: '7486', symbol: '⊕', word: 'inputs differ' }
	};

	const COMBOS: Array<[number, number]> = [
		[0, 0],
		[0, 1],
		[1, 0],
		[1, 1]
	];

	const evaluate = (gate: Gate, av: number, bv: number) =>
		gate === 'AND' ? av & bv : gate === 'OR' ? av | bv : av ^ bv;

	let a = $state(1);
	let b = $state(1);
	let mode = $state<Gate>('AND');
	let loading = $state(true);
	let ready = $state(false);
	let error = $state<string | null>(null);
	let loadPercent = $state(0);
	let routing = $state(false);
	let reducedMotion = $state(false);

	const output = $derived(evaluate(mode, a, b));
	const equation = $derived(`${a} ${META[mode].symbol} ${b}`);
	const announcement = $derived(
		`${mode} gate. A is ${a}. B is ${b}. Output Q is ${output}.`
	);

	let sectionEl: HTMLElement;
	let canvasHost: HTMLDivElement;

	let routePulse: ((gate: Gate, av: number, bv: number, done: () => void) => void) | null = null;
	let rotateSwitch: ((gate: Gate) => void) | null = null;
	let pulseToken = 0;

	function fire() {
		if (!routePulse || !ready) return;
		const token = ++pulseToken;
		routing = true;
		routePulse(mode, a, b, () => {
			if (token === pulseToken) routing = false;
		});
	}

	function toggleInput(which: 'a' | 'b') {
		if (!ready) return;
		if (which === 'a') a = a === 1 ? 0 : 1;
		else b = b === 1 ? 0 : 1;
		fire();
	}

	function setInputs(nextA: number, nextB: number) {
		if (!ready) return;
		a = nextA;
		b = nextB;
		fire();
	}

	function selectGate(next: Gate) {
		if (!ready || next === mode) return;
		mode = next;
		rotateSwitch?.(next);
		fire();
	}

	/* ---------------------------------------------------------------------- */
	/* Shaders                                                                */
	/* ---------------------------------------------------------------------- */

	const GLOW_VERTEX = /* glsl */ `
		varying vec2 vUv;
		varying vec3 vNormal;
		varying vec3 vView;

		void main() {
			vUv = uv;
			vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
			vNormal = normalize(normalMatrix * normal);
			vView = normalize(-mvPosition.xyz);
			gl_Position = projectionMatrix * mvPosition;
		}
	`;

	const GLOW_FRAGMENT = /* glsl */ `
		uniform float uPulse;
		uniform float uOpacity;
		uniform vec3 uColor;
		uniform float uTrail;

		varying vec2 vUv;
		varying vec3 vNormal;
		varying vec3 vView;

		vec3 linearToSRGB(vec3 c) {
			c = max(c, vec3(0.0));
			return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
		}

		void main() {
			// Signed distance along the wire from the pulse head (uv.x runs along the tube).
			float d = vUv.x - uPulse;
			// Long exponential tail behind the head, short gaussian ramp ahead of it,
			// so neither end of the beam is a hard cut.
			float tail = d <= 0.0 ? exp(d / uTrail) : exp(-d * d / 0.0011);
			float head = exp(-d * d / 0.00022);
			float energy = tail * 0.95 + head * 1.9;
			if (energy < 0.003) discard;

			// Across the tube: brightest on the axis, melting to nothing at the silhouette.
			float facing = clamp(abs(dot(normalize(vNormal), normalize(vView))), 0.0, 1.0);
			float core = pow(facing, 2.4);
			float halo = pow(facing, 0.9) * 0.22;
			float profile = core + halo;

			vec3 hot = mix(uColor, vec3(1.0, 0.97, 0.92), 0.72);
			vec3 color = uColor * energy * profile + hot * head * core * 0.85;
			gl_FragColor = vec4(linearToSRGB(color), uOpacity);
		}
	`;

	/* ---------------------------------------------------------------------- */
	/* Scene                                                                  */
	/* ---------------------------------------------------------------------- */

	const SWITCH_ANGLES: Record<Gate, number> = { AND: 208, OR: 180, XOR: 152 };
	// Signal inks come from the DESIGN.md tokens: input A is clay, input B is cyan,
	// and each gate's output wire carries clay / cyan / riso respectively.
	const TOKEN = { clay: '#d97757', cyan: '#44a6e4', riso: '#5e7edf' } as const;
	const WIRE_TINTS: Record<string, string> = {
		A: TOKEN.clay,
		B: TOKEN.cyan,
		AND: TOKEN.clay,
		OR: TOKEN.cyan,
		XOR: TOKEN.riso
	};
	const PULSE_LIGHT_INTENSITY = 1.7;
	const PULSE_LIGHT_DISTANCE = 1.7;

	let renderer: Three.WebGLRenderer | null = null;

	let bloom: Bloom | null = null;
	let scene: Three.Scene | null = null;
	let camera: Three.PerspectiveCamera | null = null;
	let modelRoot: Three.Group | null = null;
	let environmentTexture: Three.Texture | null = null;
	let environmentTarget: Three.WebGLRenderTarget | null = null;
	let keyLight: Three.DirectionalLight | null = null;
	let ledLight: Three.PointLight | null = null;
	let pulseLightA: Three.PointLight | null = null;
	let pulseLightB: Three.PointLight | null = null;
	let pulseLightOut: Three.PointLight | null = null;
	let ledMaterial: Three.MeshStandardMaterial | null = null;
	let knob: Three.Object3D | null = null;
	let gsapRef: typeof import('gsap').gsap | null = null;

	type WireRuntime = {
		name: string;
		net: string;
		length: number;
		curve: Three.CatmullRomCurve3;
		glow: Three.Mesh;
		material: Three.ShaderMaterial;
	};

	const wires = new Map<string, WireRuntime>();
	const gateLeds = new Map<Gate, Three.MeshStandardMaterial>();

	let needsRender = true;
	let parallax: Parallax | null = null;
	let isVisible = true;
	let disposed = false;
	let readyOnce = false;
	let bootTimer = 0;
	let resizeObserver: ResizeObserver | null = null;
	let intersectionObserver: IntersectionObserver | null = null;
	let motionQuery: MediaQueryList | null = null;
	let onMotionChange: ((event: MediaQueryListEvent) => void) | null = null;
	let dracoLoader: import('three/examples/jsm/loaders/DRACOLoader.js').DRACOLoader | null = null;
	let ktx2Loader: import('three/examples/jsm/loaders/KTX2Loader.js').KTX2Loader | null = null;
	let activeTimeline: GsapTimeline | null = null;

	const requestRender = () => {
		needsRender = true;
	};

	const clamp = (value: number, min: number, max: number) =>
		value < min ? min : value > max ? max : value;

	const url = (path: Parameters<typeof resolveAsset>[0]) => resolveAsset(`/${path}`);
	const decoderPath = (file: Parameters<typeof resolveAsset>[0]) =>
		resolveAsset(`/${file}`).replace(/[^/]*$/, '');

	onMount(() => {
		if (!canvasHost || !sectionEl) return;
		let detachCanvas: (() => void) | undefined;

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

				if (disposed) return;

				const T = threeModule;
				const gsap = gsapModule.gsap;
				gsapRef = gsap;

				motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
				reducedMotion = motionQuery.matches;

				const width = canvasHost.clientWidth || 640;
				const height = canvasHost.clientHeight || 420;

				const devicePixelRatio = window.devicePixelRatio || 1;

				renderer = new T.WebGLRenderer({
					antialias: devicePixelRatio < 2,
					alpha: true,
					stencil: false,
					powerPreference: 'high-performance'
				});
				renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
				renderer.setSize(width, height, false);
				renderer.setClearColor(0x000000, 0);
				renderer.outputColorSpace = T.SRGBColorSpace;
				renderer.toneMapping = T.ACESFilmicToneMapping;
				renderer.toneMappingExposure = 1.08;
				renderer.shadowMap.enabled = true;
				renderer.shadowMap.type = T.PCFShadowMap;
				renderer.domElement.setAttribute('aria-hidden', 'true');
				canvasHost.appendChild(renderer.domElement);

				scene = new T.Scene();
				camera = new T.PerspectiveCamera(28, width / height, 0.1, 100);

				const frameCamera = (aspect: number) => {
					if (!camera) return;
					const pull = Math.max(1, 1.62 / aspect);
					const distance = 13.2 * pull;
					const direction = new T.Vector3(0.46, 0.6, 0.66).normalize();
					camera.position.copy(direction.multiplyScalar(distance));
					camera.position.y += 0.25;
					camera.lookAt(0, -0.12, 0.08);
					camera.aspect = aspect;
					camera.updateProjectionMatrix();
				};
				frameCamera(width / height);

				loadPercent = 10;

				const pmrem = new T.PMREMGenerator(renderer);
				const hdrLoader = new hdrModule.HDRLoader();
				try {
					const hdr = await hdrLoader.loadAsync(url('hdri/studio_small_08_1k.hdr'));
					if (disposed) {
						hdr.dispose();
						pmrem.dispose();
						return;
					}
					hdr.mapping = T.EquirectangularReflectionMapping;
					warmEnvironment(hdr); // tint the studio HDRI toward the warm room before PMREM filtering
					environmentTarget = pmrem.fromEquirectangular(hdr);
					environmentTexture = environmentTarget.texture;
					scene.environment = environmentTexture;
					scene.environmentIntensity = 0.82;
					hdr.dispose();
				} catch (environmentError) {
					console.warn('[LogicGateSim] HDRI environment failed to load.', environmentError);
				} finally {
					pmrem.dispose();
				}

				if (disposed) return;
				loadPercent = 22;

				// Same studio rig as the CPU template, widened for a 7.4-unit board.
				keyLight = new T.DirectionalLight(0xfff0dc, 3.4);
				keyLight.position.set(6.8, 8.6, 5.6);
				keyLight.castShadow = true;
				keyLight.shadow.mapSize.set(1024, 1024);
				keyLight.shadow.camera.near = 0.5;
				keyLight.shadow.camera.far = 32;
				keyLight.shadow.camera.left = -6;
				keyLight.shadow.camera.right = 6;
				keyLight.shadow.camera.top = 6.4;
				keyLight.shadow.camera.bottom = -6;
				keyLight.shadow.bias = -0.0005;
				keyLight.shadow.normalBias = 0.02;
				keyLight.shadow.radius = 3;
				scene.add(keyLight);
				scene.add(keyLight.target);

				const fill = new T.DirectionalLight(0x86a4ff, 1.15);
				fill.position.set(-7, 3.6, 4.2);
				scene.add(fill);

				const rim = new T.DirectionalLight(0xa8e8e2, 2.7);
				rim.position.set(-5, 5.2, -7.5);
				scene.add(rim);

				scene.add(new T.HemisphereLight(WARM_AMBIENT, 0x050607, 0.36));

				const ground = new T.Mesh(
					new T.PlaneGeometry(24, 24),
					new T.ShadowMaterial({ color: 0x000000, opacity: 0.34 })
				);
				ground.rotation.x = -Math.PI / 2;
				ground.position.y = -0.246;
				ground.receiveShadow = true;
				scene.add(ground);

				dracoLoader = new dracoModule.DRACOLoader();
				dracoLoader.setDecoderPath(decoderPath('draco/draco_decoder.js'));

				ktx2Loader = new ktx2Module.KTX2Loader();
				ktx2Loader.setTranscoderPath(decoderPath('basis/basis_transcoder.js'));
				ktx2Loader.detectSupport(renderer);

				const loader = new gltfModule.GLTFLoader();
				loader.setDRACOLoader(dracoLoader);
				loader.setKTX2Loader(ktx2Loader);

				const gltf = await loader.loadAsync(url('models/logic-gates.glb'), (event) => {
					if (event.total > 0) {
						loadPercent = Math.max(loadPercent, Math.min(88, 24 + (event.loaded / event.total) * 64));
					}
				});

				if (disposed) return;
				dracoLoader.dispose();
				ktx2Loader.dispose();
				dracoLoader = null;
				ktx2Loader = null;

				const required = [
					'board',
					'gate-and',
					'gate-or',
					'gate-xor',
					'switch',
					'switch-knob',
					'led',
					'post-a',
					'post-b'
				];
				for (const name of required) {
					if (!gltf.scene.getObjectByName(name)) {
						throw new Error(`Model is missing the "${name}" part.`);
					}
				}

				modelRoot = new T.Group();
				modelRoot.name = 'logic-breadboard';
				modelRoot.add(gltf.scene);
				scene.add(modelRoot);

				knob = gltf.scene.getObjectByName('switch-knob') ?? null;
				if (knob) knob.rotation.y = -T.MathUtils.degToRad(SWITCH_ANGLES.AND);

				const pulseLightFor = (hex: string) => {
					const light = new T.PointLight(new T.Color(hex), 0, PULSE_LIGHT_DISTANCE, 2);
					modelRoot?.add(light);
					return light;
				};
				ledLight = new T.PointLight(0xd97757, 0, 2.4, 2);
				ledLight.position.set(3.12, 0.32, 0.72);
				modelRoot.add(ledLight);

				pulseLightA = pulseLightFor(WIRE_TINTS.A);
				pulseLightB = pulseLightFor(WIRE_TINTS.B);
				pulseLightOut = pulseLightFor(WIRE_TINTS.AND);

				// Finish table. `env` is the per-material envMapIntensity (only honoured because
				// every material below gets its own envMap), `tint` multiplies the base colour.
				type Finish = {
					env: number;
					roughness?: number;
					metalness?: number;
					tint?: number | string;
				};
				const finishes: Record<string, Finish> = {
					// Dark matte PCB: absorb the beige ABS albedo, kill specular, no env sheen.
					'board abs': { env: 0.42, roughness: 0.88, tint: 0.2 },
					'board top': { env: 0.4, roughness: 1, tint: 0.26 },
					// DIP epoxy: low, broad sheen (roughness ~0.42) with a healthy env reflection.
					'chip epoxy': { env: 1.0, roughness: 0.42 },
					// ENIG pads/posts nudged toward copper so they catch the key light cleanly.
					'enig gold': { env: 1.45, roughness: 0.22, metalness: 1, tint: '#e9b79a' },
					'pin silver': { env: 1.25, roughness: 0.28, metalness: 1 },
					'led lens': { env: 1.3, roughness: 0.14 },
					'switch body': { env: 0.85, roughness: 0.44 },
					'switch cap': { env: 0.9, roughness: 0.36 },
					'capacitor ceramic': { env: 0.85, roughness: 0.6 }
				};
				const finishFor = (name: string): Finish => {
					const key = name.toLowerCase();
					if (finishes[key]) return finishes[key];
					if (key.startsWith('chip lid')) return { env: 1.0, roughness: 0.44 };
					if (key.startsWith('status led')) return { env: 0.7, roughness: 0.3 };
					if (key.startsWith('wire ')) return { env: 0.58, roughness: 0.4 };
					return { env: 0.92 };
				};

				const maxAnisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
				const tuned = new Set<Three.Material>();

				gltf.scene.traverse((object) => {
					const mesh = object as Three.Mesh;
					if (!mesh.isMesh) return;
					mesh.castShadow = true;
					mesh.receiveShadow = true;

					const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
					for (const material of materials) {
						if (!material || tuned.has(material)) continue;
						tuned.add(material);
						const pbr = material as Three.MeshStandardMaterial;
						if (!pbr.isMeshStandardMaterial) continue;

						const finish = finishFor(pbr.name);
						// Golden Template fix: three.js only reads material.envMapIntensity when the
						// material owns an envMap, so hand it the PMREM texture from scene.environment.
						const pmremTexture = (scene?.environment as Three.Texture | null | undefined) ?? environmentTexture;
						if (pmremTexture) pbr.envMap = pmremTexture;
						pbr.envMapIntensity = finish.env;
						if (typeof finish.tint === 'number') pbr.color.multiplyScalar(finish.tint);
						else if (finish.tint) pbr.color.multiply(new T.Color(finish.tint));
						if (finish.roughness !== undefined) pbr.roughness = finish.roughness;
						if (finish.metalness !== undefined) pbr.metalness = finish.metalness;

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

				// Collect wires and build one additive glow tube per jumper.
				const wireMeshes: Three.Mesh[] = [];
				gltf.scene.traverse((object) => {
					const mesh = object as Three.Mesh;
					if (!mesh.isMesh) return;
					if (mesh.userData?.kind === 'wire') {
						wireMeshes.push(mesh);
					} else if (mesh.userData?.kind === 'gate-led') {
						const material = mesh.material as Three.MeshStandardMaterial;
						const gate = mesh.userData.gate as Gate;
						if (material?.name?.toLowerCase().startsWith('status led') && gate) {
							material.emissiveIntensity = 0.07;
							gateLeds.set(gate, material);
						}
					}

					const material = mesh.material as Three.MeshStandardMaterial;
					if (material?.name?.toLowerCase() === 'led lens') {
						ledMaterial = material;
						material.emissiveIntensity = 0.05;
					}
				});

				for (const mesh of wireMeshes) {
					const points = (mesh.userData.points as number[][] | undefined) ?? [];
					if (points.length < 3) continue;
					const curve = new T.CatmullRomCurve3(
						points.map(([x, y, z]) => new T.Vector3(x, y, z)),
						false,
						'centripetal',
						0.5
					);
					const material = new T.ShaderMaterial({
						uniforms: {
							uPulse: { value: 0 },
							uOpacity: { value: 0 },
							uColor: { value: new T.Color(WIRE_TINTS[mesh.userData.net as string] ?? '#ffe1a8') },
							uTrail: { value: 0.16 }
						},
						vertexShader: GLOW_VERTEX,
						fragmentShader: GLOW_FRAGMENT,
						transparent: true,
						blending: T.AdditiveBlending,
						depthWrite: false,
						depthTest: true,
						side: T.DoubleSide,
						toneMapped: false
					});
					const glow = new T.Mesh(new T.TubeGeometry(curve, 72, 0.036, 12, false), material);
					glow.name = `${mesh.name}-glow`;
					glow.visible = false;
					glow.renderOrder = 4;
					glow.frustumCulled = false;
					mesh.parent?.add(glow);

					wires.set(mesh.name, {
						name: mesh.name,
						net: (mesh.userData.net as string) ?? 'A',
						length: curve.getLength(),
						curve,
						glow,
						material
					});
				}

				loadPercent = 94;

				/* ---------------------------------------------------------------- */
				/* Pulse                                                             */
				/* ---------------------------------------------------------------- */

				const resetGlow = () => {
					for (const wire of wires.values()) {
						wire.glow.visible = false;
						wire.material.uniforms.uPulse.value = 0;
						wire.material.uniforms.uOpacity.value = 0;
					}
					if (pulseLightA) pulseLightA.intensity = 0;
					if (pulseLightB) pulseLightB.intensity = 0;
					if (pulseLightOut) pulseLightOut.intensity = 0;
					for (const material of gateLeds.values()) material.emissiveIntensity = 0.07;
				};

				const settleLed = (value: number) => {
					if (!ledMaterial || !ledLight) return;
					gsap.to(ledMaterial, {
						emissiveIntensity: value ? 0.62 : 0.035,
						duration: 0.5,
						ease: 'power2.out',
						onUpdate: requestRender
					});
					gsap.to(ledLight, {
						intensity: value ? 0.5 : 0.02,
						duration: 0.5,
						ease: 'power2.out',
						onUpdate: requestRender
					});
				};

				const animateWire = (
					timeline: GsapTimeline,
					wire: WireRuntime,
					start: number,
					duration: number,
					light: Three.PointLight | null,
					delayFade = 0.05
				) => {
					const uniforms = wire.material.uniforms;
					const proxy = { p: 0 };
					const point = new T.Vector3();

					timeline.set(wire.glow, { visible: true }, start);
					timeline.to(uniforms.uOpacity, { value: 1, duration: 0.08 }, start);
					timeline.to(
						proxy,
						{
							p: 1,
							duration,
							ease: 'none',
							onUpdate: () => {
								uniforms.uPulse.value = proxy.p;
								if (light) {
									wire.curve.getPointAt(Math.min(0.999, proxy.p), point);
									light.position.copy(point);
									light.intensity = PULSE_LIGHT_INTENSITY;
								}
								requestRender();
							}
						},
						start
					);
					timeline.to(
						uniforms.uOpacity,
						{ value: 0, duration: 0.36, ease: 'power2.in' },
						start + duration + delayFade
					);
					if (light) {
						timeline.to(light, { intensity: 0, duration: 0.24 }, start + duration);
					}
				};

				const runPulse = (gate: Gate, av: number, bv: number, done: () => void) => {
					if (disposed) {
						done();
						return;
					}

					activeTimeline?.kill();
					activeTimeline = null;
					resetGlow();

					if (reducedMotion) {
						// No travel: show the routed path as a steady, quiet glow.
						const keys = [
							`wire-a-${gate.toLowerCase()}`,
							`wire-b-${gate.toLowerCase()}`,
							`wire-out-${gate.toLowerCase()}`
						];
						for (const key of keys) {
							const wire = wires.get(key);
							if (!wire) continue;
							wire.glow.visible = true;
							wire.material.uniforms.uPulse.value = 1;
							wire.material.uniforms.uOpacity.value = 0.55;
						}
						const material = gateLeds.get(gate);
						if (material) material.emissiveIntensity = 1.2;
						settleLed(evaluate(gate, av, bv));
						requestRender();
						done();
						return;
					}

					const result = evaluate(gate, av, bv);
					const inputs = [
						{ wire: wires.get(`wire-a-${gate.toLowerCase()}`), light: pulseLightA },
						{ wire: wires.get(`wire-b-${gate.toLowerCase()}`), light: pulseLightB }
					].filter((entry): entry is { wire: WireRuntime; light: Three.PointLight | null } =>
						Boolean(entry.wire)
					);
					const outWire = wires.get(`wire-out-${gate.toLowerCase()}`) ?? null;
					pulseLightOut?.color.set(WIRE_TINTS[gate] ?? TOKEN.clay);

					const timeline = gsap.timeline({
						defaults: { ease: 'none' },
						onUpdate: requestRender,
						onComplete: () => {
							activeTimeline = null;
							settleLed(result);
							done();
						}
					});
					activeTimeline = timeline;

					let arrival = 0;
					inputs.forEach((entry, index) => {
						const start = index * 0.07;
						const duration = clamp(0.34 + entry.wire.length * 0.03, 0.4, 0.74);
						animateWire(timeline, entry.wire, start, duration, entry.light, 0.03);
						arrival = Math.max(arrival, start + duration);
					});

					const status = gateLeds.get(gate);
					if (status) {
						timeline.to(
							status,
							{ emissiveIntensity: 2.8, duration: 0.1, ease: 'power2.out' },
							Math.max(0, arrival - 0.03)
						);
						timeline.to(
							status,
							{ emissiveIntensity: 0.07, duration: 0.45, ease: 'power2.out' },
							arrival + 0.16
						);
					}

					if (!outWire) {
						settleLed(result);
						return;
					}

					const outStart = arrival + 0.1;
					const outDuration = clamp(0.38 + outWire.length * 0.035, 0.46, 0.84);
					animateWire(timeline, outWire, outStart, outDuration, pulseLightOut, 0.06);

					const flashAt = outStart + outDuration;
					if (ledMaterial && ledLight) {
						timeline.fromTo(
							ledMaterial,
							{ emissiveIntensity: 0.12 },
							{ emissiveIntensity: 4.2, duration: 0.09, ease: 'power2.out' },
							flashAt
						);
						timeline.to(
							ledMaterial,
							{ emissiveIntensity: result ? 0.62 : 0.035, duration: 0.5, ease: 'power2.out' },
							flashAt + 0.12
						);
						timeline.fromTo(
							ledLight,
							{ intensity: 0.05 },
							{ intensity: 2.2, duration: 0.09, ease: 'power2.out' },
							flashAt
						);
						timeline.to(
							ledLight,
							{ intensity: result ? 0.5 : 0.02, duration: 0.55, ease: 'power2.out' },
							flashAt + 0.12
						);
					}

					requestRender();
				};

				routePulse = runPulse;
				rotateSwitch = (gate) => {
					if (!knob || !gsapRef) return;
					gsapRef.to(knob.rotation, {
						y: -T.MathUtils.degToRad(SWITCH_ANGLES[gate]),
						duration: 0.55,
						ease: 'power3.inOut',
						onUpdate: requestRender
					});
				};

				/* ---------------------------------------------------------------- */
				/* Orbit + resize                                                    */
				/* ---------------------------------------------------------------- */

				const orbit = { yaw: 0, pitch: 0 };
				const applyOrbit = () => {
					if (!modelRoot) return;
					modelRoot.rotation.y = orbit.yaw;
					modelRoot.rotation.x = orbit.pitch;
					requestRender();
				};

				let dragging = false;
				let lastX = 0;
				let lastY = 0;

				const onPointerDown = (event: PointerEvent) => {
					if (event.button !== 0) return;
					dragging = true;
					lastX = event.clientX;
					lastY = event.clientY;
					if (event.pointerType === 'mouse') {
						(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
					}
					canvasHost.classList.add('is-dragging');
				};
				const onPointerMove = (event: PointerEvent) => {
					if (!dragging) return;
					const dx = event.clientX - lastX;
					const dy = event.clientY - lastY;
					lastX = event.clientX;
					lastY = event.clientY;
					orbit.yaw = clamp(orbit.yaw - dx * 0.0042, -0.6, 0.6);
					orbit.pitch = clamp(orbit.pitch - dy * 0.0018, -0.07, 0.1);
					applyOrbit();
				};
				const onPointerUp = () => {
					dragging = false;
					canvasHost.classList.remove('is-dragging');
				};
				const onDoubleClick = () => {
					if (!gsapRef) return;
					gsapRef.to(orbit, {
						yaw: 0,
						pitch: 0,
						duration: 0.7,
						ease: 'power3.out',
						onUpdate: applyOrbit
					});
				};

				const canvas = renderer.domElement;
				canvas.addEventListener('pointerdown', onPointerDown);
				canvas.addEventListener('pointermove', onPointerMove);
				canvas.addEventListener('pointerup', onPointerUp);
				canvas.addEventListener('pointercancel', onPointerUp);
				canvas.addEventListener('pointerleave', onPointerUp);
				canvas.addEventListener('dblclick', onDoubleClick);

				onMotionChange = (event) => {
					if (disposed) return;
					reducedMotion = event.matches;
				};
				motionQuery.addEventListener('change', onMotionChange);

				resizeObserver = new ResizeObserver(() => {
					if (!renderer || !camera || !canvasHost) return;
					const nextWidth = canvasHost.clientWidth;
					const nextHeight = canvasHost.clientHeight;
					if (!nextWidth || !nextHeight) return;
					renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
					renderer.setSize(nextWidth, nextHeight, false);
					bloom?.setSize(nextWidth, nextHeight);
					frameCamera(nextWidth / nextHeight);
					requestRender();
				});
				resizeObserver.observe(canvasHost);

				intersectionObserver = new IntersectionObserver(
					(entries) => {
						isVisible = entries[0]?.isIntersecting ?? false;
						if (isVisible) requestRender();
					},
					{ rootMargin: '180px 0px', threshold: 0.01 }
				);
				intersectionObserver.observe(sectionEl);

				settleLed(evaluate(mode, a, b));
				bloom = await createBloom(T, renderer, scene, camera);
				if (disposed) {
					bloom?.dispose();
					bloom = null;
					return;
				}
				if (bloom) bloom.render();
				else renderer.render(scene, camera);
				needsRender = false;
				loadPercent = 100;
				loading = false;
				ready = true;
				readyOnce = true;
				canvasHost.dataset.wires = String(wires.size);

				parallax = createParallax(sectionEl, { strength: 0.35 });
				renderer.setAnimationLoop(() => {
					if (disposed || !renderer || !scene || !camera) return;
					if (!isVisible) return;
					if (parallax?.step()) needsRender = true;
					if (!needsRender) return;
					needsRender = false;
					parallax?.apply(camera);
					if (bloom) bloom.render();
					else renderer.render(scene, camera);
					parallax?.restore(camera);
				});

				// One opening pulse, so the interaction is self-explanatory.
				bootTimer = window.setTimeout(() => {
					bootTimer = 0;
					if (disposed || !readyOnce || reducedMotion || pulseToken > 0) return;
					fire();
				}, 850);

				detachCanvas = () => {
					canvas.removeEventListener('pointerdown', onPointerDown);
					canvas.removeEventListener('pointermove', onPointerMove);
					canvas.removeEventListener('pointerup', onPointerUp);
					canvas.removeEventListener('pointercancel', onPointerUp);
					canvas.removeEventListener('pointerleave', onPointerUp);
					canvas.removeEventListener('dblclick', onDoubleClick);
				};
			} catch (cause) {
				console.error('[LogicGateSim]', cause);
				if (!disposed) {
					loading = false;
					ready = false;
					error = 'The interactive board could not be loaded in this browser. The logic still works — toggle the inputs below to read the output.';
				}
			}
		};

		void initialise();

		return () => {
			disposed = true;
			parallax?.destroy();
			window.clearTimeout(bootTimer);
			activeTimeline?.kill();
			activeTimeline = null;
			routePulse = null;
			rotateSwitch = null;
			detachCanvas?.();
			if (motionQuery && onMotionChange) motionQuery.removeEventListener('change', onMotionChange);
			resizeObserver?.disconnect();
			intersectionObserver?.disconnect();
			dracoLoader?.dispose();
			ktx2Loader?.dispose();
			if (renderer) {
				renderer.setAnimationLoop(null);
				bloom?.dispose();
				bloom = null;
				renderer.dispose();
				renderer.forceContextLoss();
				renderer.domElement.remove();
			}
			if (scene) {
				const textures = new Set<Three.Texture>();
				scene.traverse((object) => {
					const mesh = object as Three.Mesh;
					if (!mesh.isMesh) return;
					mesh.geometry?.dispose();
					const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
					for (const material of materials) {
						if (!material) continue;
						for (const value of Object.values(material)) {
							if (value && typeof value === 'object' && 'isTexture' in value) {
								const texture = value as Three.Texture;
								if (!textures.has(texture)) {
									textures.add(texture);
									texture.dispose();
								}
							}
						}
						material.dispose();
					}
				});
			}
			environmentTexture?.dispose();
			environmentTarget?.dispose();
			keyLight?.shadow.map?.dispose();
			scene = null;
			camera = null;
			renderer = null;
			modelRoot = null;
		};
	});
</script>

<section
	bind:this={sectionEl}
	class="lgs {className}"
	class:is-ready={ready}
	class:is-embedded={embeddedMode}
	data-reduced-motion={reducedMotion}
	aria-labelledby={embeddedMode ? undefined : `${id}-title`}
	aria-label={embeddedMode ? title : undefined}
>
	{#if !embeddedMode}
	<header class="lgs__head">
		<div class="lgs__intro">
			<p class="lgs__eyebrow">
				<span class="lgs__dot" aria-hidden="true"></span>
				{eyebrow}
			</p>
			<h2 id={`${id}-title`}>{title}</h2>
			<p class="lgs__lede">{subtitle}</p>
		</div>

		<dl class="lgs__spec" aria-hidden="true">
			<div><dt>Gates</dt><dd>7408 · 7432 · 7486</dd></div>
			<div><dt>Logic</dt><dd>TTL · 5.0 V</dd></div>
			<div><dt>Build</dt><dd>400 tie-point</dd></div>
		</dl>
	</header>
	{/if}

	<div class="lgs__stage" aria-busy={loading}>
		<div class="lgs__canvas" bind:this={canvasHost}></div>
		<div class="lgs__vignette" aria-hidden="true"></div>
		<div class="lgs__grain" aria-hidden="true"></div>

		{#if !embeddedMode}
			<span class="lgs__live" aria-hidden="true">
				<i></i>
				{ready ? 'Live breadboard' : 'Booting board'}
			</span>

			<span class="lgs__hint" aria-hidden="true">Drag to orbit · double-click to reset</span>
		{/if}

		{#if loading}
			<div class="lgs__loader" role="status">
				<span class="lgs__loader-label">Routing board</span>
				<span class="lgs__loader-track"><i style={`width:${Math.round(loadPercent)}%`}></i></span>
				<span class="lgs__loader-value">{Math.round(loadPercent)}%</span>
			</div>
		{/if}

		{#if error}
			<div class="lgs__error" role="alert">
				<p>{error}</p>
			</div>
		{/if}
	</div>

	<div class="lgs__deck">
		<div class="lgs__controls">
			<div class="lgs__field">
				<span class="lgs__label" id={`${id}-inputs`}>Inputs</span>
				<div class="lgs__toggles" role="group" aria-labelledby={`${id}-inputs`}>
					<button
						type="button"
						class="lgs__toggle"
						style="--net:#d97757"
						data-input="a"
						aria-pressed={a === 1}
						disabled={!ready}
						onclick={() => toggleInput('a')}
					>
						<span class="lgs__toggle-key">A</span>
						<span class="lgs__toggle-value">{a}</span>
						<span class="lgs__toggle-bar" aria-hidden="true"></span>
					</button>
					<button
						type="button"
						class="lgs__toggle"
						style="--net:#44a6e4"
						data-input="b"
						aria-pressed={b === 1}
						disabled={!ready}
						onclick={() => toggleInput('b')}
					>
						<span class="lgs__toggle-key">B</span>
						<span class="lgs__toggle-value">{b}</span>
						<span class="lgs__toggle-bar" aria-hidden="true"></span>
					</button>
				</div>
			</div>

			<div class="lgs__field">
				<span class="lgs__label" id={`${id}-gates`}>Gate</span>
				<div class="lgs__seg" role="group" aria-labelledby={`${id}-gates`}>
					{#each GATES as gate (gate)}
						<button
							type="button"
							data-gate={gate}
							aria-pressed={mode === gate}
							disabled={!ready}
							onclick={() => selectGate(gate)}
							title={`${gate} · ${META[gate].part}`}
						>
							{gate}
						</button>
					{/each}
				</div>
			</div>
		</div>

		<div class="lgs__readout">
			<span class="lgs__label">Output Q</span>
			<div class="lgs__value">
				<span>Q</span>
				<b class:is-high={output === 1}>{output}</b>
			</div>
			<span class="lgs__equation">{equation} <i>{META[mode].part}</i></span>
			<div class="lgs__status" class:is-routing={routing}>
				<span class="lgs__status-dot" aria-hidden="true"></span>
				{routing ? 'Signal in flight' : 'Settled'}
				<button type="button" class="lgs__replay" disabled={!ready} onclick={fire}>
					Replay
				</button>
			</div>
		</div>
	</div>

	<div class="lgs__truth">
		<span class="lgs__label">Truth table</span>
		<div class="lgs__truth-rail">
			{#each COMBOS as [x, y] (x * 2 + y)}
				<button
					type="button"
					class="lgs__truth-cell"
					class:is-active={a === x && b === y}
					data-truth={`${x}${y}`}
					aria-pressed={a === x && b === y}
					aria-label={`Set A to ${x} and B to ${y}`}
					disabled={!ready}
					onclick={() => setInputs(x, y)}
				>
					<span>{x}</span>
					<span>{y}</span>
					<em aria-hidden="true">→</em>
					<strong>{evaluate(mode, x, y)}</strong>
				</button>
			{/each}
		</div>
		<span class="lgs__note">{META[mode].word} · Q {output ? 'high' : 'low'}</span>
	</div>

	<p class="lgs__sr" aria-live="polite">{announcement}</p>
	<p class="lgs__sr">
		Interactive 3D breadboard. A and B are input posts at the left; their signals run through three
		DIP logic gates to a selector switch and an indicator LED.
	</p>
</section>

<style>
	.lgs {
		/* Premium Textbook tokens (DESIGN.md), carried on the Editorial Void stage. */
		--ink: var(--color-slate);
		--muted: var(--color-dark-gray);
		--faint: var(--text-muted);
		--line: rgba(138, 130, 116, 0.35);
		--hairline: 1px solid rgba(138, 130, 116, 0.28);
		--accent: var(--color-clay);
		--accent-ink: var(--color-clay-ink);
		--cool: var(--color-cyan);
		position: relative;
		width: 100%;
		overflow: hidden;
		border: var(--hairline);
		border-radius: 0;
		max-width: 100%;
		background: transparent;
		color: var(--ink);
		font-family: var(--font-sans);
		font-feature-settings: 'cv11', 'ss03', 'tnum';
		-webkit-font-smoothing: antialiased;
		-moz-osx-font-smoothing: grayscale;
		text-rendering: optimizeLegibility;
	}

	.lgs *,
	.lgs *::before,
	.lgs *::after {
		box-sizing: border-box;
	}

	.lgs__head {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: clamp(1.5rem, 4vw, 4rem);
		padding: clamp(1.3rem, 3vw, 2.4rem) clamp(1.2rem, 3vw, 2.4rem) 0;
	}

	.lgs__intro {
		max-width: 46rem;
	}

	.lgs__eyebrow {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		margin: 0 0 1rem;
		color: var(--muted);
		font-family: var(--font-mono);
		font-size: 0.6rem;
		font-weight: 500;
		letter-spacing: 0.2em;
		line-height: 1.5;
		text-transform: uppercase;
	}

	.lgs__dot {
		width: 5px;
		height: 5px;
		flex: 0 0 auto;
		border-radius: 0;
		background: var(--accent);
	}

	.lgs__intro h2 {
		margin: 0;
		color: var(--color-slate);
		font-family: var(--font-display);
		font-size: clamp(2rem, 3.4vw, 3.2rem);
		font-weight: 400;
		letter-spacing: 0.005em;
		line-height: 1.08;
		text-wrap: balance;
	}

	.lgs__lede {
		max-width: 38rem;
		margin: 1rem 0 0;
		color: var(--muted);
		font-size: 0.88rem;
		line-height: 1.65;
		text-wrap: pretty;
	}

	.lgs__spec {
		display: grid;
		gap: 0.55rem;
		min-width: 13rem;
		margin: 0 0 0.35rem;
		padding-left: 1.2rem;
		border-left: 1px solid var(--line);
	}

	.lgs__spec div {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
	}

	.lgs__spec dt,
	.lgs__spec dd {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.58rem;
		letter-spacing: 0.12em;
		line-height: 1.6;
		text-transform: uppercase;
	}

	.lgs__spec dt {
		color: var(--faint);
	}

	.lgs__spec dd {
		color: var(--muted);
	}

	.lgs__stage {
		position: relative;
		margin: clamp(1rem, 2.2vw, 1.7rem) clamp(0.8rem, 1.8vw, 1.35rem) 0;
		overflow: hidden;
		border: 1px solid rgba(138, 130, 116, 0.22);
		border-radius: 0;
		background: transparent;
		aspect-ratio: 1.72;
		min-height: 340px;
		isolation: isolate;
	}

	.lgs__canvas {
		position: absolute;
		inset: 0;
		z-index: 1;
	}

	.lgs__canvas :global(canvas) {
		display: block;
		width: 100%;
		height: 100%;
		opacity: 0;
		cursor: grab;
		touch-action: pan-y;
		transition: opacity 1s ease;
	}

	.lgs.is-ready .lgs__canvas :global(canvas) {
		opacity: 1;
	}

	.lgs__stage.is-dragging .lgs__canvas :global(canvas),
	.lgs__canvas.is-dragging :global(canvas) {
		cursor: grabbing;
	}

	.lgs__vignette {
		position: absolute;
		inset: 0;
		z-index: 2;
		pointer-events: none;
		display: none;
	}

	.lgs__grain {
		position: absolute;
		inset: 0;
		z-index: 2;
		pointer-events: none;
		display: none;
		opacity: 0.05;
		mix-blend-mode: soft-light;
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.86' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.5'/%3E%3C/svg%3E");
		background-size: 160px 160px;
	}

	.lgs__live,
	.lgs__hint {
		position: absolute;
		z-index: 3;
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		color: var(--color-slate);
		font-family: var(--font-mono);
		font-size: 0.56rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		pointer-events: none;
	}

	.lgs__live {
		top: 1rem;
		left: 1.1rem;
		padding: 0.4rem 0.6rem;
		border: 1px solid rgba(138, 130, 116, 0.3);
		border-radius: 0;
		background: rgba(249, 248, 246, 0.82);
		color: var(--color-slate);
	}

	.lgs__live i {
		width: 5px;
		height: 5px;
		border-radius: 0;
		background: var(--accent);
		animation: lgs-beacon 2.4s ease-in-out infinite;
	}

	.lgs__hint {
		right: 1.1rem;
		bottom: 0.9rem;
		color: var(--color-slate);
	}

	@keyframes lgs-beacon {
		0%,
		100% {
			opacity: 0.4;
		}
		50% {
			opacity: 1;
		}
	}

	.lgs__loader {
		position: absolute;
		inset: 0;
		z-index: 4;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.8rem;
		background: transparent;
	}

	.lgs__loader-label,
	.lgs__loader-value {
		font-family: var(--font-mono);
		font-size: 0.58rem;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--color-slate);
	}

	.lgs__loader-track {
		display: block;
		width: 9rem;
		height: 1px;
		overflow: hidden;
		background: rgba(138, 130, 116, 0.3);
	}

	.lgs__loader-track i {
		display: block;
		height: 100%;
		background: var(--accent);
		transition: width 0.4s ease;
	}

	.lgs__error {
		position: absolute;
		inset: 0;
		z-index: 4;
		display: grid;
		place-items: center;
		padding: 2rem;
		text-align: center;
	}

	.lgs__error p {
		max-width: 30rem;
		margin: 0;
		color: var(--muted);
		font-size: 0.85rem;
		line-height: 1.7;
	}

	.lgs__deck {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: end;
		gap: clamp(1.2rem, 3vw, 3rem);
		padding: 1.2rem clamp(1.2rem, 2.4vw, 2rem) 1.1rem;
	}

	.lgs__controls {
		display: flex;
		flex-wrap: wrap;
		gap: 1.4rem 2.2rem;
	}

	.lgs__field {
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
	}

	.lgs__label {
		color: var(--faint);
		font-family: var(--font-mono);
		font-size: 0.55rem;
		font-weight: 500;
		letter-spacing: 0.2em;
		text-transform: uppercase;
	}

	.lgs__toggles {
		display: flex;
		gap: 0.55rem;
	}

	.lgs__toggle {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: 0.9rem;
		min-width: 6.4rem;
		padding: 0.55rem 0.7rem 0.55rem 0.75rem;
		overflow: hidden;
		border: 1px solid rgba(138, 130, 116, 0.4);
		border-radius: 0;
		background: var(--color-paper);
		color: var(--ink);
		cursor: pointer;
		transition:
			border-color 0.25s ease,
			background 0.25s ease,
			transform 0.25s ease;
	}

	.lgs__toggle:hover:not(:disabled) {
		border-color: var(--color-gray);
		background: var(--color-ivory-med);
	}

	.lgs__toggle:active:not(:disabled) {
		transform: translateY(1px);
	}

	.lgs__toggle:focus-visible,
	.lgs__seg button:focus-visible,
	.lgs__truth-cell:focus-visible,
	.lgs__replay:focus-visible {
		outline: 1px solid var(--accent);
		outline-offset: 2px;
	}

	.lgs__toggle:disabled,
	.lgs__seg button:disabled,
	.lgs__truth-cell:disabled,
	.lgs__replay:disabled {
		cursor: not-allowed;
		opacity: 0.45;
	}

	.lgs__toggle-key {
		color: var(--muted);
		font-family: var(--font-mono);
		font-size: 0.62rem;
		letter-spacing: 0.14em;
	}

	.lgs__toggle-value {
		margin-left: auto;
		color: var(--faint);
		font-family: var(--font-mono);
		font-size: 1.05rem;
		font-weight: 500;
		line-height: 1;
		transition:
			color 0.25s ease;
	}

	.lgs__toggle[aria-pressed='true'] .lgs__toggle-value {
		color: var(--color-slate);
	}

	.lgs__toggle-bar {
		position: absolute;
		left: 0;
		bottom: 0;
		width: 100%;
		height: 1px;
		background: var(--net);
		opacity: 0;
		transform: scaleX(0.2);
		transform-origin: left;
		transition:
			opacity 0.3s ease,
			transform 0.3s ease;
	}

	.lgs__toggle[aria-pressed='true'] .lgs__toggle-bar {
		opacity: 0.85;
		transform: scaleX(1);
	}

	.lgs__seg {
		display: inline-flex;
		padding: 3px;
		border: 1px solid rgba(138, 130, 116, 0.4);
		border-radius: 0;
		background: var(--color-ivory-med);
	}

	.lgs__seg button {
		padding: 0.48rem 0.85rem;
		border: 0;
		border-radius: 0;
		background: transparent;
		color: var(--muted);
		font-family: var(--font-mono);
		font-size: 0.64rem;
		letter-spacing: 0.14em;
		cursor: pointer;
		transition:
			color 0.2s ease,
			background 0.2s ease;
	}

	.lgs__seg button:hover:not(:disabled):not([aria-pressed='true']) {
		color: var(--ink);
		background: var(--color-ivory-dark);
	}

	.lgs__seg button[aria-pressed='true'] {
		background: var(--accent);
		color: var(--color-slate);
	}

	.lgs__readout {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.15rem;
		min-width: 9rem;
	}

	.lgs__value {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		margin-top: 0.1rem;
	}

	.lgs__value span {
		color: var(--faint);
		font-family: var(--font-mono);
		font-size: 0.72rem;
		letter-spacing: 0.12em;
	}

	.lgs__value b {
		color: var(--faint);
		font-family: var(--font-display);
		font-size: clamp(2.1rem, 3.2vw, 2.9rem);
		font-weight: 400;
		line-height: 0.9;
		transition:
			color 0.3s ease;
	}

	.lgs__value b.is-high {
		color: var(--accent-ink);
	}

	.lgs__equation {
		color: var(--muted);
		font-family: var(--font-mono);
		font-size: 0.68rem;
		letter-spacing: 0.1em;
	}

	.lgs__equation i {
		margin-left: 0.4rem;
		color: var(--faint);
		font-style: normal;
		opacity: 0.8;
	}

	.lgs__status {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin-top: 0.3rem;
		color: var(--faint);
		font-family: var(--font-mono);
		font-size: 0.55rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
	}

	.lgs__status-dot {
		width: 4px;
		height: 4px;
		border-radius: 0;
		background: var(--faint);
		transition: background 0.25s ease;
	}

	.lgs__status.is-routing {
		color: var(--accent-ink);
	}

	.lgs__status.is-routing .lgs__status-dot {
		background: var(--accent);
	}

	.lgs__replay {
		margin-left: 0.5rem;
		padding: 0;
		border: 0;
		border-bottom: 1px solid rgba(138, 130, 116, 0.6);
		background: transparent;
		color: var(--muted);
		font-family: inherit;
		font-size: inherit;
		letter-spacing: inherit;
		text-transform: inherit;
		cursor: pointer;
		transition:
			color 0.2s ease,
			border-color 0.2s ease;
	}

	.lgs__replay:hover:not(:disabled) {
		color: var(--ink);
		border-color: var(--accent);
	}

	.lgs__truth {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.8rem clamp(1.2rem, 2.4vw, 2rem) 1.1rem;
		border-top: 1px solid var(--line);
	}

	.lgs__truth-rail {
		display: flex;
		gap: 0.35rem;
		overflow-x: auto;
		scrollbar-width: none;
	}

	.lgs__truth-rail::-webkit-scrollbar {
		display: none;
	}

	.lgs__truth-cell {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.32rem 0.5rem;
		border: 1px solid transparent;
		border-radius: 0;
		background: transparent;
		color: var(--muted);
		font-family: var(--font-mono);
		font-size: 0.64rem;
		line-height: 1;
		cursor: pointer;
		white-space: nowrap;
		transition:
			border-color 0.2s ease,
			background 0.2s ease,
			color 0.2s ease;
	}

	.lgs__truth-cell:hover:not(:disabled) {
		background: var(--color-ivory-med);
		color: var(--ink);
	}

	.lgs__truth-cell em {
		color: var(--faint);
		font-style: normal;
	}

	.lgs__truth-cell strong {
		color: var(--muted);
		font-weight: 500;
	}

	.lgs__truth-cell.is-active {
		border-color: rgba(217, 119, 87, 0.7);
		background: var(--color-warm-tint);
		color: var(--ink);
	}

	.lgs__truth-cell.is-active strong {
		color: var(--accent-ink);
	}

	.lgs__note {
		margin-left: auto;
		color: var(--faint);
		font-family: var(--font-mono);
		font-size: 0.54rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		white-space: nowrap;
	}

	.lgs__sr {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		padding: 0;
		overflow: hidden;
		clip: rect(0 0 0 0);
		clip-path: inset(50%);
		border: 0;
		white-space: nowrap;
	}

	@media (max-width: 960px) {
		.lgs__spec {
			display: none;
		}

		.lgs__stage {
			aspect-ratio: 1.5;
		}
	}

	@media (max-width: 780px) {
		.lgs__head {
			padding-bottom: 0;
		}

		.lgs__stage {
			aspect-ratio: 1.12;
			min-height: 300px;
		}

		.lgs__live {
			top: 0.75rem;
			left: 0.8rem;
		}

		.lgs__hint {
			display: none;
		}

		.lgs__deck {
			grid-template-columns: 1fr;
			align-items: start;
			gap: 1.1rem;
		}

		.lgs__readout {
			align-items: flex-start;
			padding-top: 0.9rem;
			border-top: 1px solid var(--line);
		}

		.lgs__truth {
			flex-wrap: wrap;
			gap: 0.5rem;
		}

		.lgs__note {
			display: none;
		}
	}

	.lgs.is-embedded {
		display: flex;
		flex-direction: column;
		height: 100%;
		border: 0;
		background: transparent;
	}

	.lgs.is-embedded .lgs__head {
		display: none;
	}

	.lgs.is-embedded .lgs__stage {
		flex: 1 1 auto;
		min-height: 240px;
		margin: 0;
		border: 0;
	}

	.lgs.is-embedded .lgs__deck {
		flex: 0 0 auto;
	}

	@media (max-width: 780px) {
		.lgs.is-embedded .lgs__stage {
			min-height: 200px;
		}

		.lgs.is-embedded .lgs__deck {
			gap: 0.6rem;
			padding-block: 0.8rem 0.7rem;
		}

		.lgs.is-embedded .lgs__readout {
			padding-top: 0.5rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.lgs__live i {
			animation: none;
			opacity: 0.9;
		}

		.lgs__canvas :global(canvas),
		.lgs__toggle,
		.lgs__toggle-value,
		.lgs__toggle-bar,
		.lgs__value b,
		.lgs__loader-track i {
			transition: none;
		}
	}
</style>