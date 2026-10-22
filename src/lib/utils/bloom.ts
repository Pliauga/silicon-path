import type * as Three from 'three';

/**
 * Selective bloom for the 3D studies (AGENTS.md §5.1, Premium Asset Pass).
 *
 * A luminance threshold alone cannot tell a lit ivory surface from a glowing packet:
 * under the key lights (intensity ~4) every diffuse face exceeds 1.0 in linear light, so
 * the first version washed whole models out. This version blooms by *material*, not by
 * brightness:
 *
 *   1. Bloom pass: every visible object is swapped for black, except genuinely emissive
 *      things (`emissive` x `emissiveIntensity`, or unlit `toneMapped: false` halos and
 *      sprites). That buffer is blurred by `UnrealBloomPass`.
 *   2. Final pass: the normal, untouched render + the blurred glow, then `OutputPass`
 *      applies the renderer's tone mapping and sRGB encoding.
 *
 * Base materials therefore cannot bloom at any threshold, and the lit render is
 * pixel-identical to the non-bloom path apart from the glow itself. Alpha comes from the
 * base render (plus the glow's own luminance), so the transparent canvas stays
 * transparent: the black stand-ins never write alpha into the result.
 *
 * The post-processing modules are imported on demand. If anything fails (no float render
 * targets, import error) `createBloom` resolves `null` and callers render straight
 * through the renderer.
 */
export const BLOOM = { threshold: 1.2, strength: 0.1, radius: 0.1 } as const;

export interface Bloom {
	/** Draw one frame: scene (+ glow of emissive parts only) → tone-mapped output. */
	render(): void;
	/** Resize to CSS pixels; picks up the renderer's current pixel ratio. */
	setSize(width: number, height: number): void;
	dispose(): void;
}

interface Saved {
	object: Three.Object3D;
	material: Three.Material | Three.Material[];
	visible: boolean;
}

const MIX_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
	vUv = uv;
	gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// Alpha = base alpha, or the glow's own brightness where it spills past the model.
const MIX_FRAGMENT = /* glsl */ `
uniform sampler2D baseTexture;
uniform sampler2D bloomTexture;
varying vec2 vUv;
void main() {
	vec4 base = texture2D(baseTexture, vUv);
	vec3 glow = texture2D(bloomTexture, vUv).rgb;
	float glowAlpha = max(glow.r, max(glow.g, glow.b));
	gl_FragColor = vec4(base.rgb + glow, clamp(max(base.a, glowAlpha), 0.0, 1.0));
}`;

export async function createBloom(
	THREE: typeof Three,
	renderer: Three.WebGLRenderer,
	scene: Three.Scene,
	camera: Three.Camera
): Promise<Bloom | null> {
	try {
		const [
			{ EffectComposer },
			{ RenderPass },
			{ UnrealBloomPass },
			{ OutputPass },
			{ ShaderPass }
		] = await Promise.all([
			import('three/examples/jsm/postprocessing/EffectComposer.js'),
			import('three/examples/jsm/postprocessing/RenderPass.js'),
			import('three/examples/jsm/postprocessing/UnrealBloomPass.js'),
			import('three/examples/jsm/postprocessing/OutputPass.js'),
			import('three/examples/jsm/postprocessing/ShaderPass.js')
		]);

		const size = renderer.getSize(new THREE.Vector2());
		const pixelRatio = renderer.getPixelRatio();

		// Glow-only buffer. No multisampling needed: it is blurred anyway.
		const glowComposer = new EffectComposer(renderer);
		glowComposer.renderToScreen = false;
		glowComposer.setPixelRatio(pixelRatio);
		glowComposer.setSize(size.x, size.y);
		const bloomPass = new UnrealBloomPass(
			new THREE.Vector2(size.x * pixelRatio, size.y * pixelRatio),
			BLOOM.strength,
			BLOOM.radius,
			BLOOM.threshold
		);
		glowComposer.addPass(new RenderPass(scene, camera));
		glowComposer.addPass(bloomPass);

		const mixPass = new ShaderPass(
			new THREE.ShaderMaterial({
				uniforms: {
					baseTexture: { value: null },
					// Pure blurred halo (mips already combined and scaled by strength), without the
					// raw glow render, so emissive cores are not added twice.
					bloomTexture: { value: bloomPass.renderTargetsHorizontal[0].texture }
				},
				vertexShader: MIX_VERTEX,
				fragmentShader: MIX_FRAGMENT
			}),
			'baseTexture'
		);
		const outputPass = new OutputPass();

		// Visible frame: the untouched render (MSAA restores the `antialias` edge quality).
		const finalComposer = new EffectComposer(renderer);
		finalComposer.renderTarget1.samples = 4;
		finalComposer.renderTarget2.samples = 4;
		finalComposer.setPixelRatio(pixelRatio);
		finalComposer.setSize(size.x, size.y);
		finalComposer.addPass(new RenderPass(scene, camera));
		finalComposer.addPass(mixPass);
		finalComposer.addPass(outputPass);

		/* ------------------------------------------------------------------ */
		/* Per-frame material swap                                             */
		/* ------------------------------------------------------------------ */

		const black = new THREE.MeshBasicMaterial({ color: 0x000000, fog: false });
		const blackDouble = new THREE.MeshBasicMaterial({
			color: 0x000000,
			fog: false,
			side: THREE.DoubleSide
		});
		const glowMaterials = new WeakMap<Three.Material, Three.MeshBasicMaterial>();
		const created: Three.MeshBasicMaterial[] = [];
		const saved: Saved[] = [];

		/** Unlit stand-in whose colour is the source material's emission. */
		const emissionOf = (material: Three.Material): Three.MeshBasicMaterial | null => {
			const source = material as Three.MeshStandardMaterial;
			if (!source.emissive) return null;
			const strength = source.emissiveIntensity ?? 1;
			if (Math.max(source.emissive.r, source.emissive.g, source.emissive.b) * strength <= 0.001) {
				return null;
			}
			let glow = glowMaterials.get(material);
			if (!glow) {
				glow = new THREE.MeshBasicMaterial({
					map: source.emissiveMap ?? null,
					side: source.side,
					fog: false,
					toneMapped: false
				});
				glowMaterials.set(material, glow);
				created.push(glow);
			}
			glow.color.copy(source.emissive).multiplyScalar(strength);
			return glow;
		};

		/** What to draw for `material` in the glow pass: a material, or null to hide. */
		const glowPassMaterial = (
			object: Three.Object3D,
			material: Three.Material
		): Three.Material | null => {
			const unlit =
				object instanceof THREE.Sprite ||
				object instanceof THREE.Line ||
				object instanceof THREE.Points ||
				material instanceof THREE.MeshBasicMaterial;
			// Unlit halos, rings and sprites authored with `toneMapped: false` are the glow.
			if (unlit && material.toneMapped === false) return material;
			if (!(object instanceof THREE.Mesh)) return null;
			const emission = emissionOf(material);
			if (emission) return emission;
			// Translucent stand-ins (shadow catchers, decals) would write alpha as black.
			if (material.transparent) return null;
			return material.side === THREE.DoubleSide ? blackDouble : black;
		};

		const darken = () => {
			saved.length = 0;
			scene.traverse((object) => {
				if (!object.visible) return;
				const holder = object as Three.Mesh;
				const current = holder.material;
				if (!current) return;
				saved.push({ object, material: current, visible: object.visible });
				if (Array.isArray(current)) {
					holder.material = current.map((slot) => glowPassMaterial(object, slot) ?? blackDouble);
				} else {
					const swap = glowPassMaterial(object, current);
					if (swap) holder.material = swap;
					else object.visible = false;
				}
			});
		};

		const restore = () => {
			for (const entry of saved) {
				(entry.object as Three.Mesh).material = entry.material;
				entry.object.visible = entry.visible;
			}
			saved.length = 0;
		};

		return {
			render: () => {
				// The glow pass has no use for shadows; skip re-rendering the shadow maps.
				const shadows = renderer.shadowMap.autoUpdate;
				renderer.shadowMap.autoUpdate = false;
				darken();
				try {
					glowComposer.render();
				} finally {
					restore();
					renderer.shadowMap.autoUpdate = shadows;
				}
				finalComposer.render();
			},
			setSize: (width, height) => {
				const ratio = renderer.getPixelRatio();
				glowComposer.setPixelRatio(ratio);
				glowComposer.setSize(width, height);
				finalComposer.setPixelRatio(ratio);
				finalComposer.setSize(width, height);
			},
			dispose: () => {
				restore();
				for (const glow of created) glow.dispose();
				black.dispose();
				blackDouble.dispose();
				bloomPass.dispose();
				mixPass.dispose();
				outputPass.dispose();
				glowComposer.dispose();
				finalComposer.dispose();
			}
		};
	} catch {
		return null;
	}
}
