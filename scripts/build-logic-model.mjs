#!/usr/bin/env node
/**
 * Silicon Path — procedural breadboard logic-gate asset pipeline.
 *
 * Generates a 400-point breadboard carrying three DIP-14 gates (7408 AND,
 * 7432 OR, 7486 XOR), an output selector switch, an indicator LED, and a
 * hand-routed network of insulated jumpers.
 *
 * The runtime rebuilds each jumper from the control points stored in the
 * node `extras`, so the glow can travel the exact same curve that was
 * modelled here.
 *
 * Run: npm run build:logic          (full Draco + KTX2)
 *      npm run build:logic -- --fast (source GLB only, for iteration)
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Document, NodeIO } from '@gltf-transform/core';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const CACHE = path.join(ROOT, '.cache');
const TEX_DIR = path.join(CACHE, 'textures');
const MODEL_DIR = path.join(ROOT, 'static', 'models');
const KTX_BIN = path.join(ROOT, '.tools', 'ktx', 'root', 'usr', 'local', 'bin');
const FAST = process.argv.includes('--fast');

await fs.mkdir(TEX_DIR, { recursive: true });
await fs.mkdir(MODEL_DIR, { recursive: true });

const SANS = 'Helvetica Neue, Helvetica, Arial, sans-serif';
const MONO = 'SFMono-Regular, Menlo, Monaco, Consolas, monospace';

const fmt = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;

/* -------------------------------------------------------------------------- */
/* Layout — shared by the texture painter and the geometry                    */
/* -------------------------------------------------------------------------- */

const PITCH = 0.22;
const COLS = 27;
const ROWS = [0.33, 0.55, 0.77, 0.99, 1.21, -0.33, -0.55, -0.77, -0.99, -1.21];
const COL_X = Array.from({ length: COLS }, (_, i) => (i - (COLS - 1) / 2) * PITCH);
const BOARD = { w: 7.4, d: 3.5, h: 0.24 };
const TOP_PLANE = { w: 7.3, d: 3.4 };

const GATES = [
	{ gate: 'AND', x: -2.2, code: 'SN74HC08N', part: '7408', unit: 'U1', desc: 'QUAD 2-INPUT AND' },
	{ gate: 'OR', x: -0.44, code: 'SN74HC32N', part: '7432', unit: 'U2', desc: 'QUAD 2-INPUT OR' },
	{ gate: 'XOR', x: 1.32, code: 'SN74HC86N', part: '7486', unit: 'U3', desc: 'QUAD 2-INPUT XOR' }
];

const PIN = { a: -0.66, b: -0.44, gnd: -0.22, vcc: 0.22, q: 0.66, row: 0.33 };
const SWITCH = { x: 2.58, z: 0, terminalRadius: 0.34, angle: { AND: 208, OR: 180, XOR: 152 } };
const LED = { x: 3.12, z: 0.72 };
const POSTS = {
	a: { x: -3.2, z: 0.86 },
	b: { x: -3.2, z: 0.62 },
	vcc: { x: -3.28, z: 1.34 },
	gnd: { x: -3.28, z: 1.58 }
};
const RAIL = { vcc: 1.36, gnd: 1.58 };

const round = (n, digits = 4) => Number(n.toFixed(digits));

/* -------------------------------------------------------------------------- */
/* Texture helpers                                                            */
/* -------------------------------------------------------------------------- */

function svgDoc(width, height, defs, body) {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<defs>${defs}</defs>
${body}
</svg>`;
}

function makeRandom(seed) {
	let value = seed >>> 0;
	return () => {
		value = (value * 1664525 + 1013904223) >>> 0;
		return value / 4294967296;
	};
}

/**
 * Premium Asset Pass: textures are authored on a fixed SVG grid (the viewBox) and
 * rasterised at TEX_SCALE x that grid, so the vector art stays razor sharp instead of
 * being upsampled. Colour maps render at 2x; the etched silicon die maps at 4x
 * (1024 -> 4096). Override with TEX_SCALE=1 for a quick low-res iteration build.
 */
const TEX_SCALE_OVERRIDE = Number(process.env.TEX_SCALE) || 0;
function texScale(name) {
	if (TEX_SCALE_OVERRIDE) return TEX_SCALE_OVERRIDE;
	return /die/i.test(name) && !/orm/i.test(name) ? 4 : 2;
}
function scaleSvg(svg, name) {
	const scale = texScale(name);
	return svg.replace(/^(<svg[^>]*?)width="(\d+)" height="(\d+)"/, (_m, head, w, h) =>
		`${head}width="${Number(w) * scale}" height="${Number(h) * scale}"`
	);
}

async function renderTexture(name, width, height, defs, body) {
	const svg = svgDoc(width, height, defs, body);
	const buffer = await sharp(Buffer.from(scaleSvg(svg, name)))
		.png({ compressionLevel: 9, adaptiveFiltering: true })
		.toBuffer();
	await fs.writeFile(path.join(TEX_DIR, `${name}.png`), buffer);
	return buffer;
}

/* -------------------------------------------------------------------------- */
/* Breadboard texture                                                         */
/* -------------------------------------------------------------------------- */

function boardSpace() {
	const W = 2048;
	const H = 1024;
	return {
		W,
		H,
		px: (x) => ((x + TOP_PLANE.w / 2) / TOP_PLANE.w) * W,
		py: (z) => ((z + TOP_PLANE.d / 2) / TOP_PLANE.d) * H,
		ux: (u) => (u / TOP_PLANE.w) * W,
		uz: (u) => (u / TOP_PLANE.d) * H
	};
}

function boardColorSvg() {
	const { W, H, px, py, ux, uz } = boardSpace();
	const rx = ux(0.046);
	const ry = uz(0.046);

	const holes = [];
	const railHoles = [];
	const numbers = [];
	const letters = [];

	const hole = (cx, cy) => `
		<ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="url(#holeGrad)"/>
		<ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="${(rx * 0.6).toFixed(1)}" ry="${(ry * 0.6).toFixed(1)}" fill="#0d0d0b"/>
		<ellipse cx="${(cx - rx * 0.24).toFixed(1)}" cy="${(cy - ry * 0.3).toFixed(1)}" rx="${(rx * 0.22).toFixed(1)}" ry="${(ry * 0.17).toFixed(1)}" fill="#ffffff" opacity=".24"/>`;

	for (const x of COL_X) {
		for (const z of ROWS) holes.push(hole(px(x), py(z)));
	}
	for (const x of COL_X) {
		for (const z of [RAIL.vcc, RAIL.gnd, -RAIL.vcc, -RAIL.gnd]) {
			railHoles.push(hole(px(x), py(z)));
		}
	}

	COL_X.forEach((x, index) => {
		if (index % 5 !== 0 && index !== COL_X.length - 1) return;
		const value = String(index + 1).padStart(2, '0');
		numbers.push(
			`<text x="${px(x).toFixed(1)}" y="${(py(-1.7) + 4).toFixed(1)}">${value}</text>`,
			`<text x="${px(x).toFixed(1)}" y="${(py(1.7) + 4).toFixed(1)}">${value}</text>`
		);
	});

	const lettersTop = ['a', 'b', 'c', 'd', 'e'];
	const lettersBottom = ['f', 'g', 'h', 'i', 'j'];
	[0.33, 0.55, 0.77, 0.99, 1.21].forEach((z, index) => {
		letters.push(
			`<text x="${px(-3.03).toFixed(1)}" y="${(py(z) + 4).toFixed(1)}">${lettersBottom[index]}</text>`,
			`<text x="${px(3.03).toFixed(1)}" y="${(py(z) + 4).toFixed(1)}">${lettersBottom[index]}</text>`,
			`<text x="${px(-3.03).toFixed(1)}" y="${(py(-z) + 4).toFixed(1)}">${lettersTop[index]}</text>`,
			`<text x="${px(3.03).toFixed(1)}" y="${(py(-z) + 4).toFixed(1)}">${lettersTop[index]}</text>`
		);
	});

	const railBand = (z, color, _fade) => {
		const y = py(z);
		const h = uz(0.055);
		return `
		<rect x="${(px(-3.42) - 8).toFixed(1)}" y="${(y - h / 2).toFixed(1)}" width="${(ux(6.84) + 16).toFixed(1)}" height="${h.toFixed(1)}" rx="${(h / 2).toFixed(1)}" fill="${color}" opacity=".86"/>
		<rect x="${(px(-3.42)).toFixed(1)}" y="${(y - h * 0.14).toFixed(1)}" width="${ux(6.84).toFixed(1)}" height="${(h * 0.16).toFixed(1)}" fill="#ffffff" opacity=".18"/>`;
	};

	const defs = `
		<linearGradient id="abs" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0" stop-color="#efede4"/>
			<stop offset=".4" stop-color="#e6e3d9"/>
			<stop offset=".72" stop-color="#dedbd0"/>
			<stop offset="1" stop-color="#d2cfc4"/>
		</linearGradient>
		<radialGradient id="light" cx=".34" cy=".24" r=".86">
			<stop offset="0" stop-color="#ffffff" stop-opacity=".5"/>
			<stop offset=".55" stop-color="#ffffff" stop-opacity=".08"/>
			<stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
		</radialGradient>
		<radialGradient id="holeGrad" cx=".5" cy=".5" r=".5">
			<stop offset="0" stop-color="#050505"/>
			<stop offset=".6" stop-color="#141412"/>
			<stop offset=".86" stop-color="#4b4840"/>
			<stop offset="1" stop-color="#8a8578"/>
		</radialGradient>
		<linearGradient id="trough" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0" stop-color="#b9b5a9" stop-opacity=".0"/>
			<stop offset=".18" stop-color="#8d897d" stop-opacity=".62"/>
			<stop offset=".5" stop-color="#3c3a34" stop-opacity=".72"/>
			<stop offset=".82" stop-color="#8d897d" stop-opacity=".5"/>
			<stop offset="1" stop-color="#b9b5a9" stop-opacity="0"/>
		</linearGradient>
		<linearGradient id="redRail" x1="0" y1="0" x2="1" y2="0">
			<stop offset="0" stop-color="#a3372f"/>
			<stop offset=".5" stop-color="#c9503f"/>
			<stop offset="1" stop-color="#9c2f28"/>
		</linearGradient>
		<linearGradient id="blueRail" x1="0" y1="0" x2="1" y2="0">
			<stop offset="0" stop-color="#2f566f"/>
			<stop offset=".5" stop-color="#3f7492"/>
			<stop offset="1" stop-color="#2a4b62"/>
		</linearGradient>
		<filter id="grain">
			<feTurbulence type="fractalNoise" baseFrequency=".82" numOctaves="2" stitchTiles="stitch"/>
			<feColorMatrix type="saturate" values="0"/>
		</filter>
		<filter id="soft"><feGaussianBlur stdDeviation="6"/></filter>
	`;

	const troughTop = py(-0.27);
	const troughBottom = py(0.27);

	const body = `
		<rect width="${W}" height="${H}" fill="url(#abs)"/>
		<rect width="${W}" height="${H}" fill="url(#light)"/>
		<rect width="${W}" height="${H}" filter="url(#grain)" opacity=".05"/>

		<!-- moulded edge -->
		<rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="26" fill="none" stroke="#b7b3a6" stroke-width="3" opacity=".55"/>
		<rect x="30" y="30" width="${W - 60}" height="${H - 60}" rx="20" fill="none" stroke="#ffffff" stroke-width="2" opacity=".34"/>

		<!-- centre trough -->
		<rect x="${px(-3.36).toFixed(1)}" y="${troughTop.toFixed(1)}" width="${ux(6.72).toFixed(1)}" height="${(troughBottom - troughTop).toFixed(1)}" fill="url(#trough)"/>
		<g opacity=".5" filter="url(#soft)">
			<rect x="${px(-3.3).toFixed(1)}" y="${(troughTop + 2).toFixed(1)}" width="${ux(6.6).toFixed(1)}" height="3" fill="#201f1b"/>
		</g>

		<!-- bus rails -->
		${railBand(RAIL.vcc, 'url(#redRail)')}
		${railBand(RAIL.gnd, 'url(#blueRail)')}
		${railBand(-RAIL.vcc, 'url(#redRail)')}
		${railBand(-RAIL.gnd, 'url(#blueRail)')}

		<g>${railHoles.join('')}</g>
		<g>${holes.join('')}</g>

		<g fill="#6f6b60" font-family="${MONO}" font-size="15" text-anchor="middle" opacity=".62">${numbers.join('')}</g>
		<g fill="#7e7a6e" font-family="${MONO}" font-size="14" text-anchor="middle" opacity=".5">${letters.join('')}</g>

		<g fill="#ffffff" font-family="${MONO}" font-size="30" font-weight="700" opacity=".5" text-anchor="middle">
			<text x="${px(-3.55).toFixed(1)}" y="${(py(RAIL.vcc) + 9).toFixed(1)}">+</text>
			<text x="${px(-3.55).toFixed(1)}" y="${(py(RAIL.gnd) + 9).toFixed(1)}">−</text>
			<text x="${px(3.55).toFixed(1)}" y="${(py(RAIL.vcc) + 9).toFixed(1)}">+</text>
			<text x="${px(3.55).toFixed(1)}" y="${(py(RAIL.gnd) + 9).toFixed(1)}">−</text>
		</g>

		<!-- silkscreen -->
		<g font-family="${MONO}" fill="#5c584e">
			<text x="${px(-3.43).toFixed(1)}" y="${(py(-1.52) + 2).toFixed(1)}" font-size="15" letter-spacing="4" opacity=".74">SILICON PATH · MODULE 04</text>
			<text x="${px(2.42).toFixed(1)}" y="${(py(1.29) + 2).toFixed(1)}" font-size="12" letter-spacing="3.4" opacity=".62">LOGIC-01 / LB-100</text>
			<text x="${px(2.42).toFixed(1)}" y="${(py(1.43) + 2).toFixed(1)}" font-size="9" letter-spacing="2.6" opacity=".46">400 TIE-POINTS · ABS</text>
			<text x="${px(2.06).toFixed(1)}" y="${(py(-0.5) + 2).toFixed(1)}" font-size="10" letter-spacing="2.8" opacity=".58">GATE SELECT</text>
			<text x="${px(2.54).toFixed(1)}" y="${(py(1.03) + 2).toFixed(1)}" font-size="10" letter-spacing="2.6" opacity=".58">OUTPUT</text>
			<text x="${px(-3.36).toFixed(1)}" y="${(py(0.98) + 2).toFixed(1)}" font-size="9" letter-spacing="2.4" opacity=".52">IN A · IN B</text>
		</g>

		<!-- registration marks -->
		<g fill="none" stroke="#8d897c" stroke-width="1.6" opacity=".5">
			<circle cx="${px(-3.55).toFixed(1)}" cy="${py(-1.68).toFixed(1)}" r="9"/>
			<circle cx="${px(3.55).toFixed(1)}" cy="${py(-1.68).toFixed(1)}" r="9"/>
			<circle cx="${px(-3.55).toFixed(1)}" cy="${py(1.68).toFixed(1)}" r="9"/>
			<circle cx="${px(3.55).toFixed(1)}" cy="${py(1.68).toFixed(1)}" r="9"/>
		</g>

		<!-- capacitor positions printed by the board? subtle pad marks -->
		<g fill="none" stroke="#a6a197" stroke-width="1.2" opacity=".34">
			${GATES.map((g) => {
				const cx = px(g.x + 0.98);
				const cy = py(-0.55);
				return `<rect x="${(cx - ux(0.075)).toFixed(1)}" y="${(cy - uz(0.05)).toFixed(1)}" width="${ux(0.15).toFixed(1)}" height="${uz(0.1).toFixed(1)}" rx="3"/>`;
			}).join('')}
		</g>

		<g opacity=".1" filter="url(#soft)">
			<ellipse cx="${W * 0.46}" cy="${H * 0.52}" rx="${W * 0.4}" ry="${H * 0.34}" fill="#3a372f"/>
		</g>
	`;

	return { width: W, height: H, defs, body };
}

function boardOrmSvg() {
	const { W, H, px, py, ux, uz } = boardSpace();
	const rand = makeRandom(7731);
	const holes = [];
	const rx = ux(0.052);
	const ry = uz(0.052);

	for (const x of COL_X) {
		for (const z of ROWS) {
			holes.push(
				`<ellipse cx="${px(x).toFixed(1)}" cy="${py(z).toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="rgb(104,236,0)"/>`,
				`<ellipse cx="${px(x).toFixed(1)}" cy="${py(z).toFixed(1)}" rx="${(rx * 0.55).toFixed(1)}" ry="${(ry * 0.55).toFixed(1)}" fill="rgb(28,250,0)"/>`
			);
		}
		for (const z of [RAIL.vcc, RAIL.gnd, -RAIL.vcc, -RAIL.gnd]) {
			holes.push(
				`<ellipse cx="${px(x).toFixed(1)}" cy="${py(z).toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="rgb(104,236,0)"/>`,
				`<ellipse cx="${px(x).toFixed(1)}" cy="${py(z).toFixed(1)}" rx="${(rx * 0.55).toFixed(1)}" ry="${(ry * 0.55).toFixed(1)}" fill="rgb(28,250,0)"/>`
			);
		}
	}

	const speckle = [];
	for (let i = 0; i < 1600; i += 1) {
		const x = rand() * W;
		const y = rand() * H;
		speckle.push(
			`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(1 + rand() * 3).toFixed(1)}" height="${(1 + rand() * 2).toFixed(1)}" opacity="${(0.03 + rand() * 0.05).toFixed(3)}"/>`
		);
	}

	const defs = `
		<linearGradient id="roughness" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0" stop-color="rgb(238,150,0)"/>
			<stop offset=".5" stop-color="rgb(232,146,0)"/>
			<stop offset="1" stop-color="rgb(240,152,0)"/>
		</linearGradient>
	`;

	const body = `
		<rect width="${W}" height="${H}" fill="url(#roughness)"/>
		<g fill="rgb(20,20,20)">${speckle.join('')}</g>
		<g>${holes.join('')}</g>
		<rect x="${px(-3.36).toFixed(1)}" y="${py(-0.27).toFixed(1)}" width="${ux(6.72).toFixed(1)}" height="${(py(0.27) - py(-0.27)).toFixed(1)}" fill="rgb(160,226,0)"/>
		<rect x="16" y="16" width="${W - 32}" height="${H - 32}" rx="24" fill="none" stroke="rgb(150,210,0)" stroke-width="10"/>
	`;

	return { width: W, height: H, defs, body };
}

/* -------------------------------------------------------------------------- */
/* DIP-14 lid texture                                                         */
/* -------------------------------------------------------------------------- */

function chipColorSvg({ code, part, unit, desc, gate }) {
	const W = 512;
	const H = 256;
	const rand = makeRandom(900 + part.charCodeAt(0));
	const specks = [];
	for (let i = 0; i < 320; i += 1) {
		const x = rand() * W;
		const y = rand() * H;
		specks.push(
			`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(0.4 + rand() * 1.2).toFixed(2)}" opacity="${(0.02 + rand() * 0.08).toFixed(3)}"/>`
		);
	}

	const defs = `
		<linearGradient id="epoxy" x1="0" y1="0" x2=".8" y2="1">
			<stop offset="0" stop-color="#1a1d22"/>
			<stop offset=".42" stop-color="#101318"/>
			<stop offset="1" stop-color="#0a0c0f"/>
		</linearGradient>
		<linearGradient id="sheen" x1="0" y1="0" x2=".9" y2="1">
			<stop offset="0" stop-color="#ffffff" stop-opacity=".13"/>
			<stop offset=".34" stop-color="#ffffff" stop-opacity=".02"/>
			<stop offset=".7" stop-color="#ffffff" stop-opacity="0"/>
			<stop offset="1" stop-color="#ffffff" stop-opacity=".05"/>
		</linearGradient>
		<linearGradient id="etch" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0" stop-color="#f2f3ee" stop-opacity=".78"/>
			<stop offset="1" stop-color="#9aa096" stop-opacity=".58"/>
		</linearGradient>
	`;

	const body = `
		<rect width="${W}" height="${H}" rx="10" fill="url(#epoxy)"/>
		<g fill="#c8c9c2">${specks.join('')}</g>
		<rect width="${W}" height="${H}" rx="10" fill="url(#sheen)"/>

		<!-- moulded notch at pin 1 end -->
		<path d="M0 86 A42 42 0 0 0 0 170 Z" fill="#050608"/>
		<path d="M2 88 A40 40 0 0 1 2 168" fill="none" stroke="#2a2e34" stroke-width="1.4"/>

		<!-- pin-1 marker -->
		<circle cx="30" cy="226" r="7" fill="#b9beb5" opacity=".78"/>
		<circle cx="30" cy="226" r="11" fill="none" stroke="#b9beb5" stroke-width=".8" opacity=".3"/>

		<g font-family="${SANS}">
			<text x="62" y="58" font-size="25" font-weight="500" letter-spacing="1.4" fill="url(#etch)">${code}</text>
			<text x="62" y="84" font-size="10.5" letter-spacing="2.9" fill="#9aa096" opacity=".82">${desc} GATE</text>
			<text x="62" y="196" font-size="46" font-weight="600" letter-spacing="3" fill="url(#etch)">${part}</text>
			<text x="62" y="220" font-size="9" letter-spacing="2.4" fill="#8b9188" opacity=".66">SILICON PATH · ${gate}</text>

			<text x="${W - 34}" y="58" font-size="11" letter-spacing="2.2" fill="#a5aaa1" opacity=".8" text-anchor="end">${unit}</text>
			<text x="${W - 34}" y="196" font-size="10" letter-spacing="1.8" fill="#8f958c" opacity=".66" text-anchor="end">HL 2418</text>
			<text x="${W - 34}" y="220" font-size="8" letter-spacing="1.6" fill="#7f857c" opacity=".52" text-anchor="end">MADE IN TW</text>
		</g>

		<path d="M62 100 H${W - 34}" stroke="#8f958c" stroke-width=".8" opacity=".34"/>
		<path d="M62 168 H${W - 34}" stroke="#8f958c" stroke-width=".8" opacity=".2"/>
	`;

	return { width: W, height: H, defs, body };
}

/* -------------------------------------------------------------------------- */
/* Textures                                                                   */
/* -------------------------------------------------------------------------- */

const textureDefs = [
	{ key: 'boardColor', name: 'board-color', ...boardColorSvg() },
	{ key: 'boardOrm', name: 'board-orm', ...boardOrmSvg() },
	...GATES.map((gate) => ({
		key: `chip${gate.gate}`,
		name: `chip-${gate.gate.toLowerCase()}`,
		...chipColorSvg(gate)
	}))
];

console.log('› Painting breadboard and DIP textures...');
const textureBuffers = {};
for (const tex of textureDefs) {
	textureBuffers[tex.key] = await renderTexture(tex.name, tex.width, tex.height, tex.defs, tex.body);
	console.log(`  · ${tex.name}.png (${tex.width}×${tex.height})`);
}

/* -------------------------------------------------------------------------- */
/* Geometry helpers                                                           */
/* -------------------------------------------------------------------------- */

const roundBox = (w, h, d, radius = 0.03, segments = 3) =>
	new RoundedBoxGeometry(w, h, d, segments, Math.min(radius, Math.min(w, h, d) * 0.24));

function horizontalPlane(w, d, faceDown = false) {
	const geometry = new THREE.PlaneGeometry(w, d);
	geometry.rotateX(faceDown ? Math.PI / 2 : -Math.PI / 2);
	// glTF UVs have a top-left origin. Flip V so artwork reads upright when
	// loaded with texture.flipY = false.
	const uv = geometry.getAttribute('uv');
	for (let i = 0; i < uv.count; i += 1) {
		uv.setY(i, 1 - uv.getY(i));
	}
	uv.needsUpdate = true;
	return geometry;
}

function applyTransform(geometry, { position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1] } = {}) {
	const matrix = new THREE.Matrix4().compose(
		new THREE.Vector3(...position),
		new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
		new THREE.Vector3(...scale)
	);
	const clone = geometry.clone();
	clone.applyMatrix4(matrix);
	return clone;
}

function mergePieces(pieces) {
	const geometries = pieces.map((geometry) =>
		geometry.index ? geometry.toNonIndexed() : geometry
	);
	return mergeGeometries(geometries, false);
}

const parts = [];

function partNode(name, position = [0, 0, 0], extras) {
	const item = { name, position, extras, pieces: [] };
	parts.push(item);
	return item;
}

function piece(parent, geometry, material, transform) {
	parent.pieces.push({
		geometry: applyTransform(geometry, transform),
		material
	});
}

function mergedPiece(parent, pieces, material) {
	const merged = mergePieces(pieces);
	parent.pieces.push({ geometry: merged, material });
}

/* -------------------------------------------------------------------------- */
/* Document + materials                                                       */
/* -------------------------------------------------------------------------- */

const doc = new Document();
const buffer = doc.createBuffer();
const scene = doc.createScene('Logic gate breadboard');

const linear = (hex) => {
	const color = new THREE.Color(hex);
	return [round(color.r, 5), round(color.g, 5), round(color.b, 5), 1];
};

function texture(key, name) {
	return doc
		.createTexture(name)
		.setImage(textureBuffers[key])
		.setMimeType('image/png')
		.setURI(`${name}.png`);
}

const textures = {
	boardColor: texture('boardColor', 'board-color'),
	boardOrm: texture('boardOrm', 'board-orm'),
	chipAND: texture('chipAND', 'chip-and'),
	chipOR: texture('chipOR', 'chip-or'),
	chipXOR: texture('chipXOR', 'chip-xor')
};

const materials = {};

materials.boardEdge = doc
	.createMaterial('Board ABS')
	.setBaseColorFactor(linear('#cfccc1'))
	.setMetallicFactor(0.02)
	.setRoughnessFactor(0.74);

materials.boardTop = doc
	.createMaterial('Board top')
	.setBaseColorTexture(textures.boardColor)
	.setMetallicRoughnessTexture(textures.boardOrm)
	.setMetallicFactor(1)
	.setRoughnessFactor(1);

materials.epoxy = doc
	.createMaterial('Chip epoxy')
	.setBaseColorFactor(linear('#101318'))
	.setMetallicFactor(0.04)
	.setRoughnessFactor(0.52);

const chipTops = {};
for (const gate of GATES) {
	chipTops[gate.gate] = doc
		.createMaterial(`Chip lid ${gate.part}`)
		.setBaseColorTexture(textures[`chip${gate.gate}`])
		.setMetallicFactor(0.02)
		.setRoughnessFactor(0.58);
}

materials.gold = doc
	.createMaterial('ENIG gold')
	.setBaseColorFactor(linear('#c79a4b'))
	.setMetallicFactor(1)
	.setRoughnessFactor(0.27);

materials.silver = doc
	.createMaterial('Pin silver')
	.setBaseColorFactor(linear('#c2c6c9'))
	.setMetallicFactor(1)
	.setRoughnessFactor(0.3);

materials.silkGlass = doc
	.createMaterial('LED lens')
	.setBaseColorFactor(linear('#7a1d0c'))
	.setEmissiveFactor(linear('#ff9a3c').slice(0, 3))
	.setMetallicFactor(0.1)
	.setRoughnessFactor(0.16);

materials.switchBody = doc
	.createMaterial('Switch body')
	.setBaseColorFactor(linear('#17191d'))
	.setMetallicFactor(0.18)
	.setRoughnessFactor(0.46);

materials.switchCap = doc
	.createMaterial('Switch cap')
	.setBaseColorFactor(linear('#7a2420'))
	.setMetallicFactor(0.05)
	.setRoughnessFactor(0.38);

materials.ceramic = doc
	.createMaterial('Capacitor ceramic')
	.setBaseColorFactor(linear('#a98a5d'))
	.setMetallicFactor(0.05)
	.setRoughnessFactor(0.62);

const WIRE_COLORS = {
	A: '#f0c04a',
	B: '#69c9c4',
	AND: '#e08a45',
	OR: '#9d8fe6',
	XOR: '#e06a88',
	VCC: '#c4493f',
	GND: '#39434c',
	LED: '#6fbf73'
};

materials.wires = {};
for (const [net, color] of Object.entries(WIRE_COLORS)) {
	materials.wires[net] = doc
		.createMaterial(`Wire ${net}`)
		.setBaseColorFactor(linear(color))
		.setMetallicFactor(0.03)
		.setRoughnessFactor(0.38);
}

// Activities: one small SMD status LED per gate so a pulse reads at the gate.
const STATUS_COLORS = { AND: '#ffb347', OR: '#b39dff', XOR: '#ff7d9c' };
const statusMaterials = {};
for (const gate of GATES) {
	statusMaterials[gate.gate] = doc
		.createMaterial(`Status LED ${gate.gate}`)
		.setBaseColorFactor(linear('#3d120c'))
		.setEmissiveFactor(linear(STATUS_COLORS[gate.gate]).slice(0, 3))
		.setRoughnessFactor(0.24)
		.setMetallicFactor(0.05);
}

/* -------------------------------------------------------------------------- */
/* Breadboard, chips, output hardware                                         */
/* -------------------------------------------------------------------------- */

// Board ---------------------------------------------------------------------
const board = partNode('board', [0, 0, 0], { kind: 'board' });
piece(board, roundBox(BOARD.w, BOARD.h, BOARD.d, 0.09, 3), materials.boardEdge, {
	position: [0, -BOARD.h / 2, 0]
});
piece(board, horizontalPlane(TOP_PLANE.w, TOP_PLANE.d), materials.boardTop, {
	position: [0, 0.002, 0]
});

// Input header shell
piece(
	board,
	roundBox(0.34, 0.035, 0.42, 0.012, 2),
	materials.switchBody,
	{ position: [POSTS.a.x, 0.0175, (POSTS.a.z + POSTS.b.z) / 2] }
);

// Decoupling capacitors on the back rows
const capBodies = [];
const capEnds = [];
for (const gate of GATES) {
	capBodies.push(
		applyTransform(new THREE.BoxGeometry(0.13, 0.05, 0.065), {
			position: [gate.x + 0.98, 0.025, -0.55]
		})
	);
	for (const offset of [-0.048, 0.048]) {
		capEnds.push(
			applyTransform(new THREE.BoxGeometry(0.026, 0.052, 0.067), {
				position: [gate.x + 0.98 + offset, 0.026, -0.55]
			})
		);
	}
}
mergedPiece(board, capBodies, materials.ceramic);
mergedPiece(board, capEnds, materials.silver);

// Gates ---------------------------------------------------------------------
const gateNodes = new Map();

for (const gate of GATES) {
	const node = partNode(`gate-${gate.gate.toLowerCase()}`, [gate.x, 0, 0], {
		kind: 'gate',
		gate: gate.gate
	});
	gateNodes.set(gate.gate, node);

	piece(node, roundBox(1.42, 0.26, 0.52, 0.035, 3), materials.epoxy, {
		position: [0, 0.2, 0]
	});
	piece(node, horizontalPlane(1.36, 0.46), chipTops[gate.gate], {
		position: [0, 0.3315, 0]
	});

	const pins = [];
	const feet = [];
	for (const x of [-0.66, -0.44, -0.22, 0, 0.22, 0.44, 0.66]) {
		for (const z of [-PIN.row, PIN.row]) {
			pins.push(
				applyTransform(new THREE.BoxGeometry(0.055, 0.13, 0.028), {
					position: [x, 0.045, z]
				})
			);
			feet.push(
				applyTransform(new THREE.BoxGeometry(0.055, 0.012, 0.06), {
					position: [x, -0.002, z + Math.sign(z) * 0.02]
				})
			);
		}
	}
	mergedPiece(node, pins, materials.silver);
	mergedPiece(node, feet, materials.silver);

	piece(
		node,
		new THREE.CylinderGeometry(0.028, 0.028, 0.006, 14),
		materials.switchBody,
		{ position: [-0.58, 0.335, 0.14] }
	);
}

// SMD status LEDs, one per gate, on the quiet back bank.
for (const gate of GATES) {
	const status = partNode(`gate-led-${gate.gate.toLowerCase()}`, [gate.x + 0.95, 0, -0.92], {
		kind: 'gate-led',
		gate: gate.gate
	});
	piece(status, new THREE.BoxGeometry(0.14, 0.05, 0.085), materials.switchBody, {
		position: [0, 0.025, 0]
	});
	piece(status, new THREE.BoxGeometry(0.03, 0.054, 0.087), materials.silver, {
		position: [-0.062, 0.026, 0]
	});
	piece(status, new THREE.BoxGeometry(0.03, 0.054, 0.087), materials.silver, {
		position: [0.062, 0.026, 0]
	});
	piece(status, horizontalPlane(0.085, 0.052), statusMaterials[gate.gate], {
		position: [0, 0.0515, 0]
	});
}

// Output selector -----------------------------------------------------------
const switchNode = partNode('switch', [SWITCH.x, 0, SWITCH.z], { kind: 'switch' });
piece(switchNode, new THREE.CylinderGeometry(0.27, 0.29, 0.045, 32), materials.switchBody, {
	position: [0, 0.0225, 0]
});
piece(switchNode, new THREE.CylinderGeometry(0.2, 0.2, 0.008, 32), materials.gold, {
	position: [0, 0.049, 0]
});

const terminals = [];
for (const gate of GATES) {
	const angle = THREE.MathUtils.degToRad(SWITCH.angle[gate.gate]);
	terminals.push(
		applyTransform(new THREE.CylinderGeometry(0.03, 0.03, 0.07, 12), {
			position: [
				Math.cos(angle) * SWITCH.terminalRadius,
				0.07,
				Math.sin(angle) * SWITCH.terminalRadius
			]
		})
	);
}
mergedPiece(switchNode, terminals, materials.gold);

// Common pin toward the LED
piece(switchNode, new THREE.CylinderGeometry(0.03, 0.03, 0.07, 12), materials.gold, {
	position: [0.34, 0.07, 0]
});

const knob = partNode('switch-knob', [SWITCH.x, 0, SWITCH.z], { kind: 'switch-knob' });
piece(knob, new THREE.CylinderGeometry(0.105, 0.115, 0.1, 24), materials.silver, {
	position: [0, 0.1, 0]
});
piece(knob, new THREE.CylinderGeometry(0.135, 0.135, 0.045, 24), materials.switchCap, {
	position: [0, 0.172, 0]
});
piece(knob, new THREE.BoxGeometry(0.15, 0.007, 0.022), materials.gold, {
	position: [0.055, 0.196, 0]
});

// LED -----------------------------------------------------------------------
const ledNode = partNode('led', [LED.x, 0, LED.z], { kind: 'led' });
piece(ledNode, new THREE.TorusGeometry(0.125, 0.018, 8, 26), materials.gold, {
	position: [0, 0.018, 0],
	rotation: [Math.PI / 2, 0, 0]
});
piece(ledNode, new THREE.CylinderGeometry(0.108, 0.108, 0.05, 24), materials.silkGlass, {
	position: [0, 0.048, 0]
});
piece(
	ledNode,
	new THREE.SphereGeometry(0.108, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2),
	materials.silkGlass,
	{ position: [0, 0.073, 0], scale: [1, 1.15, 1] }
);

const ledLegs = [];
for (const x of [-0.055, 0.055]) {
	ledLegs.push(
		applyTransform(new THREE.BoxGeometry(0.018, 0.06, 0.018), {
			position: [x, 0.0, 0.0]
		})
	);
}
mergedPiece(ledNode, ledLegs, materials.silver);

// Posts ---------------------------------------------------------------------
const POST_SPECS = [
	{ id: 'post-a', x: POSTS.a.x, z: POSTS.a.z, color: WIRE_COLORS.A, net: 'A' },
	{ id: 'post-b', x: POSTS.b.x, z: POSTS.b.z, color: WIRE_COLORS.B, net: 'B' },
	{ id: 'post-vcc', x: POSTS.vcc.x, z: POSTS.vcc.z, color: WIRE_COLORS.VCC, net: 'VCC' },
	{ id: 'post-gnd', x: POSTS.gnd.x, z: POSTS.gnd.z, color: WIRE_COLORS.GND, net: 'GND' }
];

const collarMaterials = {};
for (const post of POST_SPECS) {
	if (!collarMaterials[post.net]) {
		collarMaterials[post.net] = doc
			.createMaterial(`Post collar ${post.net}`)
			.setBaseColorFactor(linear(post.color))
			.setMetallicFactor(0.08)
			.setRoughnessFactor(0.36);
	}
}

for (const post of POST_SPECS) {
	const node = partNode(post.id, [post.x, 0, post.z], { kind: 'post', net: post.net });
	piece(node, new THREE.CylinderGeometry(0.085, 0.09, 0.014, 20), materials.gold, {
		position: [0, 0.007, 0]
	});
	piece(node, new THREE.CylinderGeometry(0.034, 0.036, 0.44, 14), materials.gold, {
		position: [0, 0.22, 0]
	});
	piece(node, new THREE.CylinderGeometry(0.052, 0.052, 0.06, 18), collarMaterials[post.net], {
		position: [0, 0.31, 0]
	});
	piece(node, new THREE.SphereGeometry(0.036, 12, 8), materials.gold, {
		position: [0, 0.445, 0]
	});
}

/* -------------------------------------------------------------------------- */
/* Jumper network                                                             */
/* -------------------------------------------------------------------------- */

const wireNodes = [];

function wirePoints(a, b, { lift = 0.34, liftA = 0.1, liftB = 0.08, laneZ, laneX } = {}) {
	const A = new THREE.Vector3(...a);
	const B = new THREE.Vector3(...b);
	const mid = A.clone().lerp(B, 0.5);
	if (laneZ !== undefined) mid.z = laneZ;
	if (laneX !== undefined) mid.x = laneX;
	mid.y = Math.max(A.y, B.y) + lift;

	const p1 = A.clone().lerp(B, 0.24);
	p1.y = A.y + liftA;
	if (laneZ !== undefined) p1.z = THREE.MathUtils.lerp(A.z, laneZ, 0.5);
	if (laneX !== undefined) p1.x = THREE.MathUtils.lerp(A.x, laneX, 0.5);

	const p3 = B.clone().lerp(A, 0.24);
	p3.y = B.y + liftB;
	if (laneZ !== undefined) p3.z = THREE.MathUtils.lerp(B.z, laneZ, 0.5);
	if (laneX !== undefined) p3.x = THREE.MathUtils.lerp(B.x, laneX, 0.5);

	return [A, p1, mid, p3, B];
}

function addWire(id, net, gate, a, b, options) {
	const points = wirePoints(a, b, options);
	const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.5);
	const geometry = new THREE.TubeGeometry(curve, 56, 0.021, 7, false);
	const node = partNode(id, [0, 0, 0], {
		kind: 'wire',
		net,
		gate: gate ?? null,
		points: points.map((point) => [round(point.x), round(point.y), round(point.z)])
	});
	node.pieces.push({ geometry, material: materials.wires[net] });
	wireNodes.push(node);
}

const pinWorld = (gate, localX) => [gate.x + localX, 0.1, PIN.row];
const postTop = (post, y = 0.42) => [post.x, y, post.z];
const switchTerminal = (gate) => {
	const angle = THREE.MathUtils.degToRad(SWITCH.angle[gate.gate]);
	return [
		SWITCH.x + Math.cos(angle) * SWITCH.terminalRadius,
		0.095,
		SWITCH.z + Math.sin(angle) * SWITCH.terminalRadius
	];
};

// A and B fan out to all three gate inputs.
for (const gate of GATES) {
	addWire(`wire-a-${gate.gate.toLowerCase()}`, 'A', gate.gate, postTop(POSTS.a), pinWorld(gate, PIN.a), {
		lift: 0.3 + GATES.indexOf(gate) * 0.05,
		laneZ: 0.62 + GATES.indexOf(gate) * 0.06,
		liftA: 0.12,
		liftB: 0.1
	});
	addWire(`wire-b-${gate.gate.toLowerCase()}`, 'B', gate.gate, postTop(POSTS.b), pinWorld(gate, PIN.b), {
		lift: 0.24 + GATES.indexOf(gate) * 0.045,
		laneZ: 0.47 + GATES.indexOf(gate) * 0.05,
		liftA: 0.11,
		liftB: 0.09
	});
}

// Gate outputs converge on the selector terminals.
for (const gate of GATES) {
	addWire(`wire-out-${gate.gate.toLowerCase()}`, gate.gate, gate.gate, pinWorld(gate, PIN.q), switchTerminal(gate), {
		lift: 0.5,
		laneZ: 0.46,
		liftA: 0.16,
		liftB: 0.14
	});
}

// Switch common to the indicator LED.
addWire('wire-led', 'LED', null, [SWITCH.x + 0.34, 0.095, SWITCH.z], [LED.x, 0.06, LED.z - 0.02], {
	lift: 0.26,
	laneZ: 0.28,
	liftA: 0.1,
	liftB: 0.12
});

// LED cathode to the front ground bus.
addWire('wire-led-gnd', 'GND', null, [LED.x, 0.035, LED.z + 0.1], [LED.x, 0.025, RAIL.gnd - 0.02], {
	lift: 0.2,
	laneZ: 1.16,
	liftA: 0.08,
	liftB: 0.03
});

// Power.
for (const gate of GATES) {
	addWire(`wire-vcc-${gate.gate.toLowerCase()}`, 'VCC', gate.gate, pinWorld(gate, PIN.vcc), [
		gate.x + PIN.vcc,
		0.03,
		RAIL.vcc
	], {
		lift: 0.17,
		laneZ: 0.9,
		liftA: 0.08,
		liftB: 0.04
	});
	addWire(`wire-gnd-${gate.gate.toLowerCase()}`, 'GND', gate.gate, pinWorld(gate, PIN.gnd), [
		gate.x + PIN.gnd,
		0.03,
		RAIL.gnd - 0.01
	], {
		lift: 0.13,
		laneZ: 1.12,
		liftA: 0.06,
		liftB: 0.03
	});
}

// Post feeds onto the power buses.
addWire(
	'wire-rail-vcc',
	'VCC',
	null,
	[POSTS.vcc.x, 0.42, POSTS.vcc.z],
	[POSTS.vcc.x + 0.2, 0.025, RAIL.vcc],
	{ lift: 0.16, laneZ: 1.44, liftA: 0.1, liftB: 0.03 }
);
addWire(
	'wire-rail-gnd',
	'GND',
	null,
	[POSTS.gnd.x, 0.42, POSTS.gnd.z],
	[POSTS.gnd.x + 0.2, 0.025, RAIL.gnd],
	{ lift: 0.14, laneZ: 1.46, liftA: 0.1, liftB: 0.03 }
);

/* -------------------------------------------------------------------------- */
/* Serialize                                                                  */
/* -------------------------------------------------------------------------- */

function createAccessor(array, type) {
	return doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
}

function addPrimitive(mesh, geometry, material) {
	const position = geometry.getAttribute('position');
	if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
	const normal = geometry.getAttribute('normal');
	const uv = geometry.getAttribute('uv');

	const primitive = doc.createPrimitive().setMaterial(material);
	if (geometry.index) {
		primitive.setIndices(createAccessor(new Uint32Array(geometry.index.array), 'SCALAR'));
	}
	primitive.setAttribute('POSITION', createAccessor(new Float32Array(position.array), 'VEC3'));
	primitive.setAttribute('NORMAL', createAccessor(new Float32Array(normal.array), 'VEC3'));
	if (uv) {
		primitive.setAttribute('TEXCOORD_0', createAccessor(new Float32Array(uv.array), 'VEC2'));
	}
	mesh.addPrimitive(primitive);
}

scene.setExtras({
	generator: 'silicon-path/logic-breadboard',
	pitch: PITCH,
	inputs: ['A', 'B'],
	gates: GATES.map((gate) => gate.gate)
});

for (const definition of parts) {
	const node = doc.createNode(definition.name);
	node.setTranslation(definition.position);
	if (definition.extras) node.setExtras(definition.extras);
	scene.addChild(node);

	const mesh = doc.createMesh(definition.name);
	node.setMesh(mesh);
	for (const item of definition.pieces) {
		addPrimitive(mesh, item.geometry, item.material);
	}
}

const io = new NodeIO();
const sourceBytes = await io.writeBinary(doc);
const sourcePath = path.join(CACHE, 'logic-gates.source.glb');
await fs.writeFile(sourcePath, sourceBytes);
console.log(`› Source GLB written (${fmt(sourceBytes.byteLength)})`);

const finalPath = path.join(MODEL_DIR, 'logic-gates.glb');

let triangles = 0;
for (const definition of parts) {
	for (const item of definition.pieces) {
		const count = item.geometry.index ? item.geometry.index.count : item.geometry.attributes.position.count;
		triangles += Math.floor(count / 3);
	}
}

if (FAST) {
	await fs.copyFile(sourcePath, finalPath);
	console.log(`✓ Fast build written to static/models/logic-gates.glb (${fmt(sourceBytes.byteLength)})`);
	console.log(`  parts: ${parts.length} · triangles: ${triangles.toLocaleString()}`);
	process.exit(0);
}

/* -------------------------------------------------------------------------- */
/* Compression                                                                */
/* -------------------------------------------------------------------------- */

const ktxPath = path.join(KTX_BIN, 'ktx');
try {
	await fs.access(ktxPath);
} catch {
	console.error(
		`\nKTX-Software is required for KTX2 compression.\nExpected: ${ktxPath}\nSee README.md for setup instructions.`
	);
	process.exit(1);
}

const env = { ...process.env, PATH: `${KTX_BIN}:${process.env.PATH ?? ''}` };
const cli = path.join(ROOT, 'node_modules', '.bin', 'gltf-transform');
const temp = (name) => path.join(CACHE, name);

function run(command, args) {
	execFileSync(command, args, { cwd: ROOT, env, stdio: 'inherit' });
}

console.log('› Welding, deduplicating and pruning...');
run(cli, ['weld', sourcePath, temp('logic.weld.glb')]);
run(cli, ['dedup', temp('logic.weld.glb'), temp('logic.dedup.glb')]);
run(cli, ['prune', temp('logic.dedup.glb'), temp('logic.pruned.glb')]);

console.log('› Compressing textures with KTX2 / ETC1S...');
run(cli, [
	'etc1s',
	temp('logic.pruned.glb'),
	temp('logic.ktx2.glb'),
	'--quality',
	'192',
	'--compression',
	'2',
	'--jobs',
	'2'
]);

console.log('› Compressing geometry with Draco...');
run(cli, [
	'draco',
	temp('logic.ktx2.glb'),
	finalPath,
	'--method',
	'edgebreaker',
	'--quantize-position',
	'14',
	'--quantize-normal',
	'10',
	'--quantize-texcoord',
	'12',
	'--encode-speed',
	'6',
	'--decode-speed',
	'6'
]);

/* -------------------------------------------------------------------------- */
/* Verify                                                                     */
/* -------------------------------------------------------------------------- */

async function readGlbJson(file) {
	const bytes = await fs.readFile(file);
	let offset = 12;
	while (offset < bytes.byteLength) {
		const chunkLength = bytes.readUInt32LE(offset);
		const chunkType = bytes.readUInt32LE(offset + 4);
		if (chunkType === 0x4e4f534a) {
			const jsonText = bytes.subarray(offset + 8, offset + 8 + chunkLength).toString('utf8');
			return JSON.parse(jsonText.replace(/\0+$/, ''));
		}
		offset += 8 + chunkLength;
	}
	throw new Error('No JSON chunk found in GLB');
}

const finalBytes = await fs.stat(finalPath);
const finalJson = await readGlbJson(finalPath);
const usedExtensions = finalJson.extensionsUsed ?? [];
const nodeNames = (finalJson.nodes ?? []).map((node) => node.name);
const wireJson = (finalJson.nodes ?? []).filter((node) =>
	String(node.name).startsWith('wire-')
);
const extrasMissing = wireJson.filter((node) => !node.extras?.points || node.extras.points.length < 3);

console.log(`✓ Final model written (${fmt(finalBytes.size)})`);
console.log(`  extensions: ${usedExtensions.join(', ') || 'none'}`);
console.log(`  nodes: ${nodeNames.length} · wires: ${wireJson.length}`);
console.log(`  gates: ${GATES.map((gate) => gate.gate).join(', ')}`);
console.log(`  parts: ${parts.length} · triangles (pre-compression): ${triangles.toLocaleString()}`);

if (extrasMissing.length) {
	console.error(`  ✗ missing curve extras: ${extrasMissing.map((node) => node.name).join(', ')}`);
	process.exit(1);
}
if (!usedExtensions.includes('KHR_draco_mesh_compression')) {
	console.error('  ✗ Draco extension missing from final GLB');
	process.exit(1);
}
if (!usedExtensions.includes('KHR_texture_basisu')) {
	console.error('  ✗ KTX2 extension missing from final GLB');
	process.exit(1);
}
console.log('  ✓ Draco + KTX2 + wire curve metadata verified');