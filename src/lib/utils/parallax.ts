import type { Camera } from 'three';

/**
 * Pointer parallax for the 3D studies.
 *
 * Tracks the pointer over a host element, eases toward it, and nudges the
 * camera sideways/up in its own view space just for the frame being drawn
 * (`apply` before `renderer.render`, `restore` after). Because the offset
 * never touches the scroll-driven camera path it can't accumulate or fight
 * the GSAP timelines. Disabled under `prefers-reduced-motion: reduce`.
 */
export interface Parallax {
	/** Ease toward the pointer. Returns true while the view is still moving. */
	step(): boolean;
	/** Offset the camera for this frame. */
	apply(camera: Camera): void;
	/** Undo `apply` so the next scroll update starts from the true pose. */
	restore(camera: Camera): void;
	destroy(): void;
}

export interface ParallaxOptions {
	/** Max shift in scene units at the edge of the host. */
	strength?: number;
	/** Fraction of the remaining distance covered per 60fps frame. */
	ease?: number;
}

const EPS = 0.00005;

export function createParallax(host: HTMLElement, options: ParallaxOptions = {}): Parallax {
	const strength = options.strength ?? 0.5;
	const ease = options.ease ?? 0.06;
	const query = window.matchMedia('(prefers-reduced-motion: reduce)');

	let targetX = 0;
	let targetY = 0;
	let x = 0;
	let y = 0;
	let last = 0;
	let appliedX = 0;
	let appliedY = 0;
	let right = [0, 0, 0];
	let up = [0, 0, 0];

	const onMove = (event: PointerEvent) => {
		if (query.matches || event.pointerType === 'touch') return;
		const rect = host.getBoundingClientRect();
		if (rect.width === 0 || rect.height === 0) return;
		targetX = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
		targetY = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
	};
	const onLeave = () => {
		targetX = 0;
		targetY = 0;
	};

	host.addEventListener('pointermove', onMove, { passive: true });
	host.addEventListener('pointerleave', onLeave, { passive: true });

	return {
		step() {
			const now = performance.now();
			const dt = last ? Math.min(3, (now - last) / 16.667) : 1;
			last = now;
			if (query.matches) {
				targetX = 0;
				targetY = 0;
			}
			const dx = targetX - x;
			const dy = targetY - y;
			if (Math.abs(dx) < EPS && Math.abs(dy) < EPS) {
				x = targetX;
				y = targetY;
				return x !== 0 || y !== 0;
			}
			const k = 1 - Math.pow(1 - ease, dt);
			x += dx * k;
			y += dy * k;
			return true;
		},
		apply(camera) {
			if (x === 0 && y === 0) return;
			camera.updateMatrixWorld();
			const e = camera.matrixWorld.elements;
			right = [e[0], e[1], e[2]];
			up = [e[4], e[5], e[6]];
			appliedX = x * strength;
			appliedY = -y * strength * 0.5;
			camera.position.x += right[0] * appliedX + up[0] * appliedY;
			camera.position.y += right[1] * appliedX + up[1] * appliedY;
			camera.position.z += right[2] * appliedX + up[2] * appliedY;
		},
		restore(camera) {
			if (appliedX === 0 && appliedY === 0) return;
			camera.position.x -= right[0] * appliedX + up[0] * appliedY;
			camera.position.y -= right[1] * appliedX + up[1] * appliedY;
			camera.position.z -= right[2] * appliedX + up[2] * appliedY;
			appliedX = 0;
			appliedY = 0;
		},
		destroy() {
			host.removeEventListener('pointermove', onMove);
			host.removeEventListener('pointerleave', onLeave);
		}
	};
}
