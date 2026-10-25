import { describe, expect, it, vi } from 'vitest';
import type { Object3D } from 'three';
import { disposeObject3D } from './three-dispose';

const texture = () => ({ isTexture: true, dispose: vi.fn() });
const disposable = () => ({ dispose: vi.fn() });

/** A minimal Object3D: `traverse` visits the root and then its children. */
function node(props: Record<string, unknown>, children: Object3D[] = []): Object3D {
	const self = {
		...props,
		traverse(visit: (object: Object3D) => void) {
			visit(self as unknown as Object3D);
			for (const child of children) child.traverse(visit);
		}
	};
	return self as unknown as Object3D;
}

describe('disposeObject3D', () => {
	it('disposes a resource shared by several meshes exactly once', () => {
		const geometry = disposable();
		const map = texture();
		const material = { ...disposable(), map };
		const root = node({}, [node({ geometry, material }), node({ geometry, material })]);

		disposeObject3D(root);

		expect(geometry.dispose).toHaveBeenCalledTimes(1);
		expect(material.dispose).toHaveBeenCalledTimes(1);
		expect(map.dispose).toHaveBeenCalledTimes(1);
	});

	it('disposes every texture slot, not a fixed list', () => {
		const slots = { map: texture(), normalMap: texture(), aoMap: texture(), sheenColorMap: texture() };
		const material = { ...disposable(), ...slots, roughness: 0.4, name: 'ivory' };

		disposeObject3D(node({ material }));

		for (const slot of Object.values(slots)) expect(slot.dispose).toHaveBeenCalledTimes(1);
	});

	it('finds textures held in ShaderMaterial uniforms', () => {
		const uMap = texture();
		const material = { ...disposable(), uMap: { value: uMap }, uTime: { value: 3 } };

		disposeObject3D(node({ material }));

		expect(uMap.dispose).toHaveBeenCalledTimes(1);
		expect(material.dispose).toHaveBeenCalledTimes(1);
	});

	it('handles material arrays, and meshes with no geometry or material', () => {
		const a = disposable();
		const b = disposable();
		const geometry = disposable();

		disposeObject3D(node({}, [node({ geometry, material: [a, b] }), node({ material: null })]));

		expect(a.dispose).toHaveBeenCalledTimes(1);
		expect(b.dispose).toHaveBeenCalledTimes(1);
		expect(geometry.dispose).toHaveBeenCalledTimes(1);
	});

	it('leaves kept resources (the shared environment map) to their owner', () => {
		const environment = texture();
		const own = texture();
		const material = { ...disposable(), envMap: environment, map: own };

		disposeObject3D(node({ material }), [environment]);

		expect(environment.dispose).not.toHaveBeenCalled();
		expect(own.dispose).toHaveBeenCalledTimes(1);
		expect(material.dispose).toHaveBeenCalledTimes(1);
	});

	it('tolerates undefined entries in the keep list', () => {
		const map = texture();
		expect(() =>
			disposeObject3D(node({ material: { ...disposable(), map } }), [undefined, null])
		).not.toThrow();
		expect(map.dispose).toHaveBeenCalledTimes(1);
	});
});
