import type { Object3D } from 'three';

/**
 * Shared teardown for three.js scene graphs.
 *
 * Walks `root` and disposes every geometry, material and texture exactly once.
 * Resources are deduplicated through `Set`s because glTF scenes routinely share
 * one geometry/material/texture between many meshes. Every material property
 * that holds a texture is disposed, found by a `isTexture` predicate instead of
 * a hand-written list of slots (map, normalMap, aoMap, ...), so new slots and
 * custom ShaderMaterial uniforms cannot be forgotten.
 *
 * The duck typing keeps this module free of a runtime `three` import (type
 * import only), so it never pulls three.js into a chunk by itself.
 *
 * @param root  Object whose subtree is disposed (the root itself included).
 * @param keep  Resources owned elsewhere, e.g. the PMREM environment map that
 *              is shared by every material and disposed once by its owner.
 */
export function disposeObject3D(root: Object3D, keep: Iterable<unknown> = []): void {
	// Plain bookkeeping of three.js objects, never rendered.
	const skipped = new Set<unknown>(keep);
	const geometries = new Set<Disposable>();
	const materials = new Set<Disposable>();
	const textures = new Set<Disposable>();

	root.traverse((object) => {
		const node = object as unknown as {
			geometry?: Disposable;
			material?: Disposable | Disposable[] | null;
		};
		if (node.geometry) geometries.add(node.geometry);
		const list = Array.isArray(node.material) ? node.material : node.material ? [node.material] : [];
		for (const material of list) {
			materials.add(material);
			collectTextures(material, textures);
		}
	});

	for (const texture of textures) if (!skipped.has(texture)) texture.dispose();
	for (const material of materials) if (!skipped.has(material)) material.dispose();
	for (const geometry of geometries) if (!skipped.has(geometry)) geometry.dispose();
}

interface Disposable {
	dispose(): void;
}

function isTexture(value: unknown): value is Disposable {
	return (
		typeof value === 'object' &&
		value !== null &&
		(value as { isTexture?: unknown }).isTexture === true
	);
}

function collectTextures(material: Disposable, out: Set<Disposable>): void {
	for (const value of Object.values(material)) {
		if (isTexture(value)) {
			out.add(value);
		} else if (value && typeof value === 'object') {
			// ShaderMaterial uniforms: { uMap: { value: Texture } }.
			const uniform = (value as { value?: unknown }).value;
			if (isTexture(uniform)) out.add(uniform);
		}
	}
}
