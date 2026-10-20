#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-unused-vars -- vendored model-build script: leftover tuning constants kept for reference */
/**
 * Silicon Path — process-scheduler diorama asset pipeline.
 *
 * Builds the conveyor belt (ready queue), dispatch machine (CPU), I/O lounge,
 * retired rack and five component-shaped process blocks — then compresses the
 * result to the same Draco + KTX2 profile as the CPU package.
 *
 * The empty nodes at the bottom of this file are the animation contract. The
 * Svelte component reads them by name; geometry and motion can evolve without
 * hard-coding a single coordinate in the renderer.
 *
 * Run: npm run build:scheduler-model
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Document, NodeIO } from '@gltf-transform/core';
import { KHRMaterialsEmissiveStrength } from '@gltf-transform/extensions';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const CACHE = path.join(ROOT, '.cache');
const TEX_DIR = path.join(CACHE, 'textures');
const MODEL_DIR = path.join(ROOT, 'static', 'models');
const KTX_BIN = path.join(ROOT, '.tools', 'ktx', 'root', 'usr', 'local', 'bin');
const OUT_NAME = 'scheduler.glb';

await fs.mkdir(TEX_DIR, { recursive: true });
await fs.mkdir(MODEL_DIR, { recursive: true });

const SANS = 'Helvetica Neue, Helvetica, Arial, sans-serif';
const MONO = 'SFMono-Regular, Menlo, Monaco, Consolas, monospace';
const GOLD = '#c9a45f';
const TEAL = '#52d6c9';
const AMBER = '#f0a25a';
const INK = '#070b0c';

const fmt = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;

/* -------------------------------------------------------------------------- */
/* Texture sources                                                            */
/* -------------------------------------------------------------------------- */

function svgDoc(width, height, defs, body) {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<defs>${defs}</defs>
${body}
</svg>`;
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

async function renderTexture(name, width, height, svg) {
	const buffer = await sharp(Buffer.from(scaleSvg(svg, name)))
		.png({ compressionLevel: 9, adaptiveFiltering: true })
		.toBuffer();
	await fs.writeFile(path.join(TEX_DIR, `${name}.png`), buffer);
	return buffer;
}

function makeRandom(seed) {
	let value = seed >>> 0;
	return () => {
		value = (value * 1664525 + 1013904223) >>> 0;
		return value / 4294967296;
	};
}

/**
 * Stage artwork is authored in world units: x ∈ [-9, 9], z ∈ [-6, 6].
 * The floor plane is 18 × 12, so artwork stays legible at a glance.
 */
function stageSvg() {
	const W = 2048;
	const H = 1360;
	const px = (x) => ((x + 9) / 18) * W;
	const py = (z) => ((z + 6) / 12) * H;
	const sx = (units) => (units / 18) * W;
	const sy = (units) => (units / 12) * H;
	const rand = makeRandom(202602);

	const grid = [];
	for (let x = -9; x <= 9.0001; x += 0.5) {
		const strong = Math.abs(x - Math.round(x)) < 0.001;
		grid.push(
			`<line x1="${px(x)}" y1="0" x2="${px(x)}" y2="${H}" stroke="#d8e6e4" stroke-opacity="${strong ? 0.065 : 0.025}" stroke-width="${strong ? 1.2 : 0.7}" />`
		);
	}
	for (let z = -6; z <= 6.0001; z += 0.5) {
		const strong = Math.abs(z - Math.round(z)) < 0.001;
		grid.push(
			`<line x1="0" y1="${py(z)}" x2="${W}" y2="${py(z)}" stroke="#d8e6e4" stroke-opacity="${strong ? 0.065 : 0.025}" stroke-width="${strong ? 1.2 : 0.7}" />`
		);
	}

	const speckles = [];
	for (let i = 0; i < 320; i += 1) {
		const x = rand() * W;
		const y = rand() * H;
		speckles.push(
			`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(rand() * 1.4 + 0.3).toFixed(2)}" fill="#ffffff" fill-opacity="${(rand() * 0.05).toFixed(3)}" />`
		);
	}

	const dashed = (x, y, w, h, color, opacity, dash = '10 9') =>
		`<rect x="${px(x)}" y="${py(y)}" width="${sx(w)}" height="${sy(h)}" fill="none" stroke="${color}" stroke-opacity="${opacity}" stroke-width="1.4" stroke-dasharray="${dash}" rx="${sx(0.12)}" />`;

	const label = (text, x, z, { color = GOLD, size = 22, align = 'left', opacity = 0.8, weight = 500 } = {}) =>
		`<text x="${px(x)}" y="${py(z)}" font-family="${MONO}" font-size="${size}" font-weight="${weight}" letter-spacing="${size * 0.18}" fill="${color}" fill-opacity="${opacity}" text-anchor="${align}">${text}</text>`;

	const arrow = (x1, z1, x2, z2, color = GOLD) =>
		`<line x1="${px(x1)}" y1="${py(z1)}" x2="${px(x2)}" y2="${py(z2)}" stroke="${color}" stroke-opacity="0.5" stroke-width="1.4" stroke-dasharray="4 7" marker-end="url(#arrow)" />`;

	const defs = `
		<radialGradient id="coreGlow" cx="50%" cy="50%" r="50%">
			<stop offset="0%" stop-color="${TEAL}" stop-opacity="0.13" />
			<stop offset="55%" stop-color="${TEAL}" stop-opacity="0.035" />
			<stop offset="100%" stop-color="${TEAL}" stop-opacity="0" />
		</radialGradient>
		<linearGradient id="vignette" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0%" stop-color="#000000" stop-opacity="0.42" />
			<stop offset="18%" stop-color="#000000" stop-opacity="0" />
			<stop offset="82%" stop-color="#000000" stop-opacity="0" />
			<stop offset="100%" stop-color="#000000" stop-opacity="0.5" />
		</linearGradient>
		<marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
			<path d="M 0 0 L 10 5 L 0 10 z" fill="${GOLD}" fill-opacity="0.7" />
		</marker>
	`;

	return svgDoc(
		W,
		H,
		defs,
		`
		<rect width="${W}" height="${H}" fill="${INK}" />
		<rect width="${W}" height="${H}" fill="url(#vignette)" />
		<ellipse cx="${px(3.4)}" cy="${py(0.4)}" rx="${sx(5.2)}" ry="${sy(4.4)}" fill="url(#coreGlow)" />
		${grid.join('')}
		${speckles.join('')}

		<rect x="${sx(0.28)}" y="${sy(0.28)}" width="${W - sx(0.56)}" height="${H - sy(0.56)}" fill="none" stroke="${GOLD}" stroke-opacity="0.22" stroke-width="1.2" />
		<rect x="${sx(0.42)}" y="${sy(0.42)}" width="${W - sx(0.84)}" height="${H - sy(0.84)}" fill="none" stroke="#ffffff" stroke-opacity="0.05" stroke-width="0.8" />

		${dashed(-7.45, -1.02, 9.8, 2.04, GOLD, 0.3)}
		${dashed(1.9, -1.4, 3.15, 2.8, TEAL, 0.42)}
		${dashed(1.18, 2.08, 3.86, 1.84, AMBER, 0.35)}
		${dashed(1.72, -3.9, 3.6, 1.8, '#9aa4a3', 0.24)}

		${label('01 / READY QUEUE', -7.25, 1.34, { size: 20, opacity: 0.72 })}
		${label('BELT FEEDS LEFT → RIGHT', -7.25, 1.62, { size: 13, opacity: 0.35, weight: 400 })}
		${label('02 / DISPATCH', 2.08, 1.72, { color: TEAL, size: 20, opacity: 0.8 })}
		${label('CORE 0 · QUANTUM BOUND', 2.08, 1.98, { size: 13, opacity: 0.32, weight: 400 })}
		${label('03 / I/O WAIT', 1.42, 4.18, { color: AMBER, size: 20, opacity: 0.78 })}
		${label('BLOCKED PROCESSES RETURN TO INTAKE', 1.42, 4.44, { size: 13, opacity: 0.32, weight: 400 })}
		${label('04 / RETIRED', 1.94, -4.14, { color: '#aab4b3', size: 20, opacity: 0.55 })}
		${label('COMPLETION LOG', 1.94, -3.9, { size: 13, opacity: 0.28, weight: 400 })}

		${arrow(2.2, 0, 2.7, 0, TEAL)}
		${arrow(4.7, 0.55, 3.55, 2.0, AMBER)}
		${arrow(4.55, -0.62, 3.55, -2.12, '#9aa4a3')}
		${arrow(1.18, 3.55, -6.6, 4.5, GOLD)}

		<g opacity="0.9">
			<text x="${px(-8.45)}" y="${py(5.12)}" font-family="${MONO}" font-size="18" letter-spacing="4" fill="${GOLD}" fill-opacity="0.72">SILICON PATH / LAB 02</text>
			<text x="${px(-8.45)}" y="${py(5.5)}" font-family="${SANS}" font-size="52" font-weight="600" letter-spacing="-1" fill="#e7e0d2" fill-opacity="0.92">Process Scheduler</text>
			<text x="${px(-8.45)}" y="${py(5.78)}" font-family="${MONO}" font-size="15" letter-spacing="2.5" fill="#b7c1be" fill-opacity="0.5">FIVE JOBS · ONE CORE · THREE POLICIES</text>
		</g>
		<g opacity="0.55">
			<text x="${px(8.45)}" y="${py(5.3)}" text-anchor="end" font-family="${MONO}" font-size="15" letter-spacing="3" fill="${GOLD}">SP—02</text>
			<text x="${px(8.45)}" y="${py(5.52)}" text-anchor="end" font-family="${MONO}" font-size="13" letter-spacing="2" fill="#c9d2cf">STAGE 18 × 12 UNITS</text>
			<line x1="${px(6.7)}" y1="${py(5.66)}" x2="${px(8.45)}" y2="${py(5.66)}" stroke="${GOLD}" stroke-opacity="0.5" />
		</g>

		<g stroke="${GOLD}" stroke-opacity="0.45" stroke-width="2">
			<path d="M ${sx(0.5)} ${sy(0.9)} V ${sy(0.5)} H ${sx(0.9)}" fill="none" />
			<path d="M ${W - sx(0.5)} ${sy(0.9)} V ${sy(0.5)} H ${W - sx(0.9)}" fill="none" />
			<path d="M ${sx(0.5)} ${H - sy(0.9)} V ${H - sy(0.5)} H ${sx(0.9)}" fill="none" />
			<path d="M ${W - sx(0.5)} ${H - sy(0.9)} V ${H - sy(0.5)} H ${W - sx(0.9)}" fill="none" />
		</g>
		`
	);
}

function beltSvg() {
	const W = 512;
	const H = 512;
	const rand = makeRandom(7331);
	const ribs = [];
	for (let x = 16; x < W; x += 32) {
		ribs.push(`<rect x="${x}" y="0" width="2" height="${H}" fill="#ffffff" fill-opacity="0.055" />`);
		ribs.push(`<rect x="${x + 3}" y="0" width="1" height="${H}" fill="#000000" fill-opacity="0.3" />`);
	}
	const speckles = [];
	for (let i = 0; i < 220; i += 1) {
		speckles.push(
			`<circle cx="${(rand() * W).toFixed(1)}" cy="${(rand() * H).toFixed(1)}" r="${(rand() * 1.5 + 0.4).toFixed(2)}" fill="#000000" fill-opacity="${(rand() * 0.22).toFixed(2)}" />`
		);
	}
	return svgDoc(
		W,
		H,
		`<linearGradient id="edge" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0%" stop-color="#000000" stop-opacity="0.45" />
			<stop offset="12%" stop-color="#000000" stop-opacity="0" />
			<stop offset="88%" stop-color="#000000" stop-opacity="0" />
			<stop offset="100%" stop-color="#000000" stop-opacity="0.5" />
		</linearGradient>`,
		`
		<rect width="${W}" height="${H}" fill="#0a0d0e" />
		${ribs.join('')}
		${speckles.join('')}
		<rect width="${W}" height="${H}" fill="url(#edge)" />
		<g fill="none" stroke="${GOLD}" stroke-opacity="0.11" stroke-width="1">
			<path d="M 0 256 L 512 256" stroke-dasharray="14 22" />
			<path d="M 0 34 L 512 34" />
			<path d="M 0 478 L 512 478" />
		</g>
		<g fill="${TEAL}" fill-opacity="0.1">
			<rect x="0" y="0" width="512" height="2" />
			<rect x="0" y="510" width="512" height="2" />
		</g>
		`
	);
}

function headerPlateSvg({ kicker, title, meta, accent = GOLD }) {
	const W = 1024;
	const H = 256;
	return svgDoc(
		W,
		H,
		`<linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0%" stop-color="#233033" stop-opacity="0.55" />
			<stop offset="46%" stop-color="#0b1011" stop-opacity="0.9" />
			<stop offset="100%" stop-color="#050809" stop-opacity="0.95" />
		</linearGradient>`,
		`
		<rect width="${W}" height="${H}" fill="url(#sheen)" />
		<rect x="1.5" y="1.5" width="${W - 3}" height="${H - 3}" fill="none" stroke="${accent}" stroke-opacity="0.4" stroke-width="2" />
		<rect x="10" y="10" width="${W - 20}" height="${H - 20}" fill="none" stroke="#ffffff" stroke-opacity="0.06" stroke-width="1" />
		<rect x="0" y="0" width="10" height="${H}" fill="${accent}" fill-opacity="0.75" />
		<text x="48" y="72" font-family="${MONO}" font-size="22" letter-spacing="5" fill="${accent}" fill-opacity="0.85">${kicker}</text>
		<text x="46" y="166" font-family="${SANS}" font-size="64" font-weight="600" letter-spacing="-1" fill="#e9e4d9" fill-opacity="0.94">${title}</text>
		<text x="48" y="214" font-family="${MONO}" font-size="17" letter-spacing="2.4" fill="#aab6b3" fill-opacity="0.5">${meta}</text>
		<g transform="translate(${W - 122} ${H / 2})">
			<circle r="26" fill="none" stroke="${accent}" stroke-opacity="0.45" stroke-width="1.4" />
			<circle r="5" fill="${accent}" fill-opacity="0.9" />
			<path d="M -38 0 H -28 M 28 0 H 38" stroke="${accent}" stroke-opacity="0.6" stroke-width="1.4" />
		</g>
		`
	);
}

const textureDefs = [
	{ key: 'stageColor', name: 'stage-print', width: 2048, height: 1360, svg: stageSvg() },
	{ key: 'beltColor', name: 'belt-rubber', width: 512, height: 512, svg: beltSvg() },
	{
		key: 'cpuPlate',
		name: 'cpu-header',
		width: 1024,
		height: 256,
		svg: headerPlateSvg({
			kicker: 'DISPATCH CORE / 01',
			title: 'CPU',
			meta: 'SINGLE CORE · READY → RUN → BLOCK',
			accent: TEAL,
		}),
	},
	{
		key: 'ioPlate',
		name: 'io-header',
		width: 1024,
		height: 256,
		svg: headerPlateSvg({
			kicker: 'I/O LOUNGE / 03',
			title: 'Blocked',
			meta: 'DEVICE QUEUE · RETURNS TO INTAKE',
			accent: AMBER,
		}),
	},
	{
		key: 'retiredPlate',
		name: 'retired-header',
		width: 1024,
		height: 256,
		svg: headerPlateSvg({
			kicker: 'ARCHIVE / 04',
			title: 'Retired',
			meta: 'TURNAROUND RECORDED · SLOT CLOSED',
			accent: '#9aa4a3',
		}),
	},
];

const intakePlate = {
	key: 'intakePlate',
	name: 'intake-header',
	width: 1024,
	height: 256,
	svg: headerPlateSvg({
		kicker: 'INTAKE / 00',
		title: 'Ready',
		meta: 'FIVE JOBS · ALL ARRIVALS AT T = 0',
		accent: GOLD,
	}),
};
textureDefs.push(intakePlate);

const textureBuffers = {};
for (const definition of textureDefs) {
	textureBuffers[definition.key] = await renderTexture(
		definition.name,
		definition.width,
		definition.height,
		definition.svg
	);
}

/* -------------------------------------------------------------------------- */
/* Geometry helpers                                                           */
/* -------------------------------------------------------------------------- */

const roundBox = (w, h, d, radius = 0.03, segments = 4) =>
	new RoundedBoxGeometry(w, h, d, segments, Math.min(radius, Math.min(w, h, d) * 0.24));

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

function verticalPlane(w, h) {
	const geometry = new THREE.PlaneGeometry(w, h);
	const uv = geometry.getAttribute('uv');
	for (let i = 0; i < uv.count; i += 1) {
		uv.setY(i, 1 - uv.getY(i));
	}
	uv.needsUpdate = true;
	return geometry;
}

function repeatU(geometry, times) {
	const uv = geometry.getAttribute('uv');
	for (let i = 0; i < uv.count; i += 1) uv.setX(i, uv.getX(i) * times);
	uv.needsUpdate = true;
	return geometry;
}

function mergePieces(pieces) {
	const geometries = pieces.map((piece) =>
		piece.geometry.index ? piece.geometry.toNonIndexed() : piece.geometry
	);
	return mergeGeometries(geometries, false);
}

const parts = new Map();

function part(name, position = [0, 0, 0]) {
	const item = { name, position, pieces: [] };
	parts.set(name, item);
	return item;
}

function piece(parent, geometry, material, transform) {
	parent.pieces.push({
		geometry: applyTransform(geometry, transform),
		material,
	});
}

function mergedPiece(parent, pieces, material) {
	const merged = mergePieces(pieces.map((geometry) => ({ geometry })));
	parent.pieces.push({ geometry: merged, material });
}

/** Repeated cylinders (rollers) share one primitive. */
function cylinderAlongZ(radius, length, x, y, z = 0, segments = 24) {
	return applyTransform(new THREE.CylinderGeometry(radius, radius, length, segments), {
		position: [x, y, z],
		rotation: [Math.PI / 2, 0, 0],
	});
}

/* -------------------------------------------------------------------------- */
/* Document + materials                                                       */
/* -------------------------------------------------------------------------- */

const doc = new Document();
doc.createExtension(KHRMaterialsEmissiveStrength).setRequired(true);
const buffer = doc.createBuffer();
const scene = doc.createScene('Process scheduler diorama');

const textures = {
	stage: doc
		.createTexture('Stage print')
		.setImage(textureBuffers.stageColor)
		.setMimeType('image/png')
		.setURI('stage-print.png'),
	belt: doc
		.createTexture('Belt rubber')
		.setImage(textureBuffers.beltColor)
		.setMimeType('image/png')
		.setURI('belt-rubber.png'),
	cpu: doc
		.createTexture('CPU header')
		.setImage(textureBuffers.cpuPlate)
		.setMimeType('image/png')
		.setURI('cpu-header.png'),
	io: doc
		.createTexture('I/O header')
		.setImage(textureBuffers.ioPlate)
		.setMimeType('image/png')
		.setURI('io-header.png'),
	retired: doc
		.createTexture('Retired header')
		.setImage(textureBuffers.retiredPlate)
		.setMimeType('image/png')
		.setURI('retired-header.png'),
	intake: doc
		.createTexture('Intake header')
		.setImage(textureBuffers.intakePlate)
		.setMimeType('image/png')
		.setURI('intake-header.png'),
};

const emissive = doc.createExtension(KHRMaterialsEmissiveStrength);
function withEmissive(material, rgb, strength) {
	material.setEmissiveFactor(rgb);
	material.setExtension(
		'KHR_materials_emissive_strength',
		emissive.createEmissiveStrength().setEmissiveStrength(strength)
	);
	return material;
}

const materials = {};

materials.stage = doc
	.createMaterial('Stage print')
	.setBaseColorTexture(textures.stage)
	.setMetallicFactor(0.04)
	.setRoughnessFactor(0.94);

materials.frame = doc
	.createMaterial('Graphite frame')
	.setBaseColorFactor([0.052, 0.058, 0.06, 1])
	.setMetallicFactor(0.82)
	.setRoughnessFactor(0.32);

materials.frameSoft = doc
	.createMaterial('Soft graphite')
	.setBaseColorFactor([0.091, 0.098, 0.1, 1])
	.setMetallicFactor(0.56)
	.setRoughnessFactor(0.44);

materials.gold = doc
	.createMaterial('Brushed brass')
	.setBaseColorFactor([0.72, 0.5, 0.2, 1])
	.setMetallicFactor(1)
	.setRoughnessFactor(0.27);

materials.goldDim = doc
	.createMaterial('Oxidised brass')
	.setBaseColorFactor([0.29, 0.21, 0.105, 1])
	.setMetallicFactor(0.88)
	.setRoughnessFactor(0.45);

materials.rubber = doc
	.createMaterial('Belt rubber')
	.setBaseColorTexture(textures.belt)
	.setMetallicFactor(0.06)
	.setRoughnessFactor(0.88);

materials.beltBase = doc
	.createMaterial('Belt carcass')
	.setBaseColorFactor([0.018, 0.021, 0.022, 1])
	.setMetallicFactor(0.14)
	.setRoughnessFactor(0.72);

materials.core = withEmissive(
	doc
		.createMaterial('Dispatch core')
		.setBaseColorFactor([0.014, 0.05, 0.052, 1])
		.setMetallicFactor(0.42)
		.setRoughnessFactor(0.28),
	[0.14, 0.92, 0.82],
	2.4
);

materials.tealGlow = withEmissive(
	doc
		.createMaterial('Teal glow')
		.setBaseColorFactor([0.01, 0.03, 0.03, 1])
		.setMetallicFactor(0.1)
		.setRoughnessFactor(0.3),
	[0.18, 0.95, 0.84],
	2.8
);

materials.amberGlow = withEmissive(
	doc
		.createMaterial('Amber glow')
		.setBaseColorFactor([0.04, 0.02, 0.008, 1])
		.setMetallicFactor(0.1)
		.setRoughnessFactor(0.3),
	[1, 0.46, 0.12],
	2.6
);

materials.dimGlow = withEmissive(
	doc
		.createMaterial('Dim archive glow')
		.setBaseColorFactor([0.025, 0.026, 0.026, 1])
		.setMetallicFactor(0.2)
		.setRoughnessFactor(0.4),
	[0.55, 0.6, 0.58],
	1.2
);

const plates = {
	cpu: doc.createMaterial('CPU plate').setBaseColorTexture(textures.cpu).setMetallicFactor(0.14).setRoughnessFactor(0.46),
	intake: doc
		.createMaterial('Intake plate')
		.setBaseColorTexture(textures.intake)
		.setMetallicFactor(0.16)
		.setRoughnessFactor(0.46),
	io: doc.createMaterial('I/O plate').setBaseColorTexture(textures.io).setMetallicFactor(0.14).setRoughnessFactor(0.46),
	retired: doc
		.createMaterial('Retired plate')
		.setBaseColorTexture(textures.retired)
		.setMetallicFactor(0.14)
		.setRoughnessFactor(0.5),
};

const processMaterials = [];
const PROCESS_SPECS = [
	{ id: 'P1', color: '#e0af63' },
	{ id: 'P2', color: '#7fd7d0' },
	{ id: 'P3', color: '#a89bf3' },
	{ id: 'P4', color: '#f2a25f' },
	{ id: 'P5', color: '#ef8187' },
];

for (const spec of PROCESS_SPECS) {
	const color = new THREE.Color(spec.color);
	const body = doc
		.createMaterial(`${spec.id} body`)
		.setBaseColorFactor([color.r * 0.36 + 0.015, color.g * 0.36 + 0.017, color.b * 0.36 + 0.02, 1])
		.setMetallicFactor(0.58)
		.setRoughnessFactor(0.3);
	withEmissive(body, [color.r * 0.08, color.g * 0.08, color.b * 0.08], 0.6);

	const accent = doc
		.createMaterial(`${spec.id} accent`)
		.setBaseColorFactor([color.r, color.g, color.b, 1])
		.setMetallicFactor(0.42)
		.setRoughnessFactor(0.26);
	withEmissive(accent, [color.r, color.g, color.b], 0.85);

	processMaterials.push({ spec, color, body, accent });
}

/* -------------------------------------------------------------------------- */
/* Belt                                                                       */
/* -------------------------------------------------------------------------- */

const BELT_CENTER = -2.68;
const belt = part('belt-deck', [0, 0, 0]);
piece(belt, roundBox(9.12, 0.18, 1.5, 0.05), materials.frameSoft, { position: [BELT_CENTER, 0.4, 0] });
piece(belt, roundBox(9.0, 0.07, 1.34, 0.02), materials.beltBase, { position: [BELT_CENTER, 0.49, 0] });

const tread = part('belt-surface', [0, 0, 0]);
piece(tread, repeatU(horizontalPlane(8.9, 1.32), 10), materials.rubber, { position: [BELT_CENTER, 0.522, 0] });

const beltFrame = part('belt-frame');
for (const side of [-1, 1]) {
	piece(beltFrame, roundBox(9.02, 0.16, 0.09, 0.02), materials.frame, { position: [BELT_CENTER, 0.49, side * 0.69] });
	piece(beltFrame, roundBox(8.92, 0.05, 0.06, 0.015), materials.gold, {
		position: [BELT_CENTER, 0.572, side * 0.705],
	});
}
for (let x = -6.9; x <= 1.66; x += 1.08) {
	piece(beltFrame, new THREE.BoxGeometry(0.06, 0.06, 1.42), materials.frame, {
		position: [x, 0.318, 0],
	});
}
for (const x of [-6.5, -3.9, -1.3, 1.2]) {
	for (const side of [-1, 1]) {
		piece(beltFrame, new THREE.BoxGeometry(0.1, 0.52, 0.1), materials.frame, {
			position: [x, 0.04, side * 0.52],
		});
		piece(beltFrame, new THREE.BoxGeometry(0.16, 0.025, 0.16), materials.goldDim, {
			position: [x, -0.24, side * 0.52],
		});
	}
}

const rollers = part('belt-rollers');
piece(rollers, cylinderAlongZ(0.255, 1.42, -7.1, 0.4), materials.frameSoft);
piece(rollers, cylinderAlongZ(0.255, 1.42, 1.76, 0.4), materials.frameSoft);
for (const x of [-5.4, -2.9, -0.4]) {
	piece(rollers, cylinderAlongZ(0.14, 1.34, x, 0.33), materials.frame);
}

const rollerCaps = part('belt-roller-caps');
for (const x of [-7.1, 1.76]) {
	for (const side of [-1, 1]) {
		piece(rollerCaps, cylinderAlongZ(0.28, 0.028, x, 0.4, side * 0.72, 28), materials.gold);
	}
}

const beltGlow = part('belt-glow');
for (const side of [-1, 1]) {
	piece(beltGlow, new THREE.BoxGeometry(8.8, 0.012, 0.02), materials.tealGlow, {
		position: [BELT_CENTER, 0.39, side * 0.762],
	});
}

/* Spawn gate ---------------------------------------------------------------- */

const gate = part('spawn-gate');
for (const side of [-1, 1]) {
	piece(gate, roundBox(0.12, 1.42, 0.12, 0.02), materials.frame, {
		position: [-7.15, 0.41, side * 0.9],
	});
	piece(gate, roundBox(0.24, 0.04, 0.24, 0.01), materials.goldDim, {
		position: [-7.15, -0.26, side * 0.9],
	});
}
piece(gate, roundBox(0.32, 0.34, 2.02, 0.04), materials.frame, { position: [-7.15, 1.24, 0] });
piece(gate, new THREE.BoxGeometry(0.1, 0.025, 1.82), materials.tealGlow, { position: [-7.15, 1.06, 0] });
piece(gate, new THREE.BoxGeometry(0.34, 0.018, 2.06), materials.gold, { position: [-7.15, 1.415, 0] });

const spawnSign = part('spawn-sign');
piece(spawnSign, new THREE.CylinderGeometry(0.032, 0.045, 1.86, 10), materials.frame, {
	position: [-7.15, 0.62, 1.18],
});
piece(spawnSign, new THREE.CylinderGeometry(0.11, 0.14, 0.025, 14), materials.goldDim, {
	position: [-7.15, -0.285, 1.18],
});
piece(spawnSign, roundBox(1.3, 0.34, 0.055, 0.02), materials.frame, {
	position: [-7.15, 1.53, 1.18],
});

const spawnPlate = part('spawn-plate');
piece(spawnPlate, verticalPlane(1.26, 0.28), plates.intake, { position: [-7.15, 1.53, 1.211] });

/* -------------------------------------------------------------------------- */
/* CPU                                                                        */
/* -------------------------------------------------------------------------- */

const cpuBase = part('cpu-base');
piece(cpuBase, roundBox(3.02, 0.28, 2.62, 0.08), materials.frame, { position: [3.4, 0.14, 0] });
piece(cpuBase, new THREE.BoxGeometry(2.86, 0.03, 0.026), materials.gold, { position: [3.4, 0.2, 1.318] });
piece(cpuBase, new THREE.BoxGeometry(0.026, 0.03, 2.46), materials.gold, { position: [1.9, 0.2, 0] });
piece(cpuBase, new THREE.BoxGeometry(0.026, 0.03, 2.46), materials.gold, { position: [4.9, 0.2, 0] });

const cpuDeck = part('cpu-deck');
piece(cpuDeck, roundBox(2.36, 0.06, 1.86, 0.02), materials.frameSoft, { position: [3.4, 0.32, 0] });
piece(cpuDeck, new THREE.BoxGeometry(1.18, 0.02, 1.18), materials.frame, { position: [3.4, 0.36, 0] });

const cpuShell = part('cpu-shell');
for (const x of [2.34, 4.46]) {
	for (const z of [-1.08, 1.08]) {
		piece(cpuShell, roundBox(0.17, 1.46, 0.17, 0.025), materials.frame, {
			position: [x, 1.05, z],
		});
	}
}
piece(cpuShell, roundBox(2.62, 0.18, 2.3, 0.06), materials.frame, { position: [3.4, 1.87, 0] });
piece(cpuShell, roundBox(2.2, 0.5, 0.08, 0.02), materials.frame, { position: [3.4, 1.58, 1.13] });
piece(cpuShell, roundBox(2.2, 0.06, 0.08, 0.015), materials.frameSoft, { position: [3.4, 1.345, 1.13] });

const cpuTrim = part('cpu-trim');
for (const z of [-1.16, 1.16]) {
	piece(cpuTrim, new THREE.BoxGeometry(2.64, 0.022, 0.032), materials.gold, { position: [3.4, 1.965, z] });
}
for (const x of [2.08, 4.72]) {
	piece(cpuTrim, new THREE.BoxGeometry(0.032, 0.022, 2.32), materials.gold, { position: [x, 1.965, 0] });
}
for (const x of [2.34, 4.46]) {
	piece(cpuTrim, new THREE.BoxGeometry(0.035, 1.06, 0.018), materials.tealGlow, {
		position: [x, 1.0, 1.181],
	});
}

const cpuCore = part('cpu-core');
piece(cpuCore, roundBox(0.98, 0.025, 0.98, 0.02), materials.core, { position: [3.4, 0.375, 0] });
piece(
	cpuCore,
	applyTransform(new THREE.TorusGeometry(0.62, 0.011, 8, 64), {
		rotation: [Math.PI / 2, 0, 0],
		position: [3.4, 0.392, 0],
	}),
	materials.tealGlow
);

const cpuBeacon = part('cpu-beacon');
piece(
	cpuBeacon,
	applyTransform(new THREE.TorusGeometry(0.3, 0.016, 8, 48), {
		rotation: [Math.PI / 2, 0, 0],
		position: [3.4, 1.968, 0],
	}),
	materials.tealGlow
);

const cpuPlate = part('cpu-plate');
piece(cpuPlate, verticalPlane(1.7, 0.36), plates.cpu, { position: [3.4, 1.66, 1.181] });

const cpuProgressRail = part('cpu-progress-rail');
piece(cpuProgressRail, roundBox(1.62, 0.055, 0.05, 0.012), materials.frame, { position: [3.4, 1.45, 1.16] });

const cpuProgressBar = part('cpu-progress-bar', [2.6, 1.45, 1.162]);
piece(
	cpuProgressBar,
	applyTransform(new THREE.BoxGeometry(1.5, 0.032, 0.036), { position: [0.75, 0, 0] }),
	materials.tealGlow
);

const cpuCable = part('cpu-cable');
piece(
	cpuCable,
	new THREE.TubeGeometry(
		new THREE.CatmullRomCurve3([
			new THREE.Vector3(2.42, 1.7, -1.05),
			new THREE.Vector3(2.05, 1.15, -1.45),
			new THREE.Vector3(1.72, 0.25, -1.55),
			new THREE.Vector3(1.5, -0.27, -1.85),
		]),
		40,
		0.026,
		6
	),
	materials.frameSoft
);

/* -------------------------------------------------------------------------- */
/* I/O lounge                                                                 */
/* -------------------------------------------------------------------------- */

const ioPad = part('io-pad');
piece(ioPad, roundBox(3.52, 0.18, 1.82, 0.05), materials.frameSoft, { position: [3.1, 0.08, 3.0] });
piece(ioPad, new THREE.BoxGeometry(3.4, 0.026, 0.032), materials.goldDim, { position: [3.1, 0.164, 3.885] });
piece(ioPad, new THREE.BoxGeometry(0.032, 0.026, 1.7), materials.goldDim, { position: [1.35, 0.164, 3.0] });
piece(ioPad, new THREE.BoxGeometry(0.032, 0.026, 1.7), materials.goldDim, { position: [4.85, 0.164, 3.0] });

const ioGrid = part('io-grid');
for (let i = 0; i < 5; i += 1) {
	piece(
		ioGrid,
		applyTransform(new THREE.RingGeometry(0.17, 0.205, 32), {
			rotation: [-Math.PI / 2, 0, 0],
			position: [1.9 + i * 0.6, 0.176, 3.0],
		}),
		materials.amberGlow
	);
}

const ioHeader = part('io-header');
for (const x of [1.36, 4.84]) {
	piece(ioHeader, roundBox(0.08, 1.28, 0.08, 0.015), materials.frame, { position: [x, 0.56, 3.92] });
	piece(ioHeader, new THREE.BoxGeometry(0.18, 0.02, 0.18), materials.goldDim, {
		position: [x, -0.08, 3.92],
	});
}
piece(ioHeader, roundBox(3.62, 0.32, 0.12, 0.025), materials.frame, { position: [3.1, 1.14, 3.92] });
piece(ioHeader, new THREE.BoxGeometry(3.3, 0.018, 0.02), materials.gold, { position: [3.1, 1.29, 3.97] });

const ioPlate = part('io-plate');
piece(ioPlate, verticalPlane(3.1, 0.26), plates.io, { position: [3.1, 1.14, 3.984] });

const ioRack = part('io-rack');
piece(ioRack, roundBox(0.76, 1.74, 2.06, 0.06), materials.frame, { position: [5.35, 0.86, 3.0] });
piece(ioRack, roundBox(0.6, 0.02, 1.86, 0.01), materials.frameSoft, { position: [5.35, 1.74, 3.0] });
piece(ioRack, new THREE.BoxGeometry(0.02, 1.5, 0.03), materials.amberGlow, { position: [4.961, 0.86, 2.06] });
piece(ioRack, new THREE.BoxGeometry(0.02, 1.5, 0.03), materials.amberGlow, { position: [4.961, 0.86, 3.94] });

const ioRackLights = part('io-rack-lights');
for (let i = 0; i < 7; i += 1) {
	piece(ioRackLights, new THREE.BoxGeometry(0.025, 0.028, 1.55), materials.amberGlow, {
		position: [5.734, 0.32 + i * 0.19, 3.0],
	});
}
piece(
	ioRackLights,
	applyTransform(new THREE.TorusGeometry(0.2, 0.012, 8, 40), {
		rotation: [Math.PI / 2, 0, 0],
		position: [5.35, 1.755, 3.0],
	}),
	materials.amberGlow
);

/* -------------------------------------------------------------------------- */
/* Retired rack                                                               */
/* -------------------------------------------------------------------------- */

const retiredPad = part('retired-pad');
piece(retiredPad, roundBox(3.52, 0.16, 1.72, 0.045), materials.frameSoft, {
	position: [5.6, 0.07, -3.0],
});
piece(retiredPad, new THREE.BoxGeometry(3.4, 0.022, 0.03), materials.goldDim, {
	position: [5.6, 0.152, -3.84],
});

const retiredGrid = part('retired-grid');
for (let i = 0; i < 5; i += 1) {
	piece(
		retiredGrid,
		applyTransform(new THREE.RingGeometry(0.16, 0.19, 32), {
			rotation: [-Math.PI / 2, 0, 0],
			position: [4.2 + i * 0.7, 0.16, -3.0],
		}),
		materials.dimGlow
	);
}

const retiredHeader = part('retired-header');
for (const x of [3.88, 7.32]) {
	piece(retiredHeader, roundBox(0.075, 1.12, 0.075, 0.015), materials.frame, {
		position: [x, 0.45, -3.78],
	});
}
piece(retiredHeader, roundBox(3.52, 0.3, 0.11, 0.02), materials.frame, { position: [5.6, 1.0, -3.78] });
piece(retiredHeader, new THREE.BoxGeometry(3.2, 0.015, 0.02), materials.goldDim, {
	position: [5.6, 1.14, -3.83],
});

const retiredPlate = part('retired-plate');
piece(retiredPlate, verticalPlane(3.0, 0.25), plates.retired, { position: [5.6, 1.0, -3.719] });

/* -------------------------------------------------------------------------- */
/* Return rail                                                                */
/* -------------------------------------------------------------------------- */

const RETURN_POINTS = [
	[4.95, 3.5],
	[5.96, 3.84],
	[6.02, 4.5],
	[3.5, 4.8],
	[-1.0, 4.85],
	[-5.8, 4.7],
	[-8.0, 3.5],
	[-8.2, 1.3],
	[-7.15, 0.18],
];
const returnCurve = new THREE.CatmullRomCurve3(
	RETURN_POINTS.map(([x, z]) => new THREE.Vector3(x, 0.3, z)),
	false,
	'catmullrom',
	0.5
);

const returnRail = part('return-rail');
piece(returnRail, new THREE.TubeGeometry(returnCurve, 180, 0.034, 6), materials.frameSoft);
piece(returnRail, new THREE.TubeGeometry(returnCurve, 180, 0.008, 4), materials.goldDim);

const returnPips = part('return-pips');
for (let i = 1; i < 15; i += 1) {
	const point = returnCurve.getPointAt(i / 15);
	piece(returnPips, new THREE.SphereGeometry(0.038, 10, 8), materials.tealGlow, {
		position: [point.x, 0.347, point.z],
	});
}

const returnPosts = part('return-posts');
for (let i = 1; i <= 6; i += 1) {
	const point = returnCurve.getPointAt(i / 7);
	piece(returnPosts, new THREE.CylinderGeometry(0.032, 0.038, 0.56, 8), materials.frame, {
		position: [point.x, 0.02, point.z],
	});
	piece(returnPosts, new THREE.CylinderGeometry(0.09, 0.11, 0.018, 12), materials.goldDim, {
		position: [point.x, -0.27, point.z],
	});
}

/* -------------------------------------------------------------------------- */
/* Process blocks                                                             */
/* -------------------------------------------------------------------------- */

const PROCESS_START_X = [-1.25, -2.5, -3.75, -5.0, -6.25];
const BLOCK_Y = 0.675;

for (let index = 0; index < PROCESS_SPECS.length; index += 1) {
	const { spec, body: bodyMaterial, accent: accentMaterial } = processMaterials[index];
	const block = part(`proc-${index}`, [PROCESS_START_X[index], BLOCK_Y, 0]);

	piece(block, roundBox(0.52, 0.3, 0.52, 0.055, 4), bodyMaterial);
	piece(block, roundBox(0.42, 0.035, 0.42, 0.012, 3), accentMaterial, { position: [0, 0.156, 0] });
	piece(block, new THREE.BoxGeometry(0.26, 0.038, 0.012), accentMaterial, { position: [0, 0.02, 0.265] });
	piece(block, new THREE.BoxGeometry(0.26, 0.038, 0.012), accentMaterial, { position: [0, 0.02, -0.265] });
	piece(block, new THREE.BoxGeometry(0.18, 0.01, 0.18), materials.core, { position: [0, 0.178, 0] });

	for (const x of [-0.205, 0.205]) {
		for (const z of [-0.205, 0.205]) {
			piece(block, new THREE.CylinderGeometry(0.024, 0.024, 0.028, 10), materials.gold, {
				position: [x, 0.178, z],
			});
		}
	}

	void spec;
}

/* -------------------------------------------------------------------------- */
/* Floor                                                                      */
/* -------------------------------------------------------------------------- */

const floor = part('stage-floor');
piece(floor, horizontalPlane(18, 12), materials.stage, { position: [0, -0.3, 0] });

/* -------------------------------------------------------------------------- */
/* Anchor contract                                                            */
/* -------------------------------------------------------------------------- */

const anchors = [
	['spawn', [-7.15, 0.675, 0]],
	['queue-slot-0', [-1.25, 0.675, 0]],
	['queue-slot-1', [-2.5, 0.675, 0]],
	['queue-slot-2', [-3.75, 0.675, 0]],
	['queue-slot-3', [-5.0, 0.675, 0]],
	['queue-slot-4', [-6.25, 0.675, 0]],
	['cpu-entry', [2.12, 0.68, 0]],
	['cpu-slot', [3.4, 0.72, 0]],
	['cpu-exit-io', [4.12, 0.72, 1.28]],
	['cpu-exit-done', [4.12, 0.72, -1.28]],
	['io-slot-0', [1.9, 0.34, 3.0]],
	['io-slot-1', [2.5, 0.34, 3.0]],
	['io-slot-2', [3.1, 0.34, 3.0]],
	['io-slot-3', [3.7, 0.34, 3.0]],
	['io-slot-4', [4.3, 0.34, 3.0]],
	['retired-slot-0', [4.2, 0.29, -3.0]],
	['retired-slot-1', [4.9, 0.29, -3.0]],
	['retired-slot-2', [5.6, 0.29, -3.0]],
	['retired-slot-3', [6.3, 0.29, -3.0]],
	['retired-slot-4', [7.0, 0.29, -3.0]],
	['io-exit', [4.95, 0.5, 3.5]],
	['return-0', [4.95, 0.8, 3.5]],
	['return-1', [5.96, 0.8, 3.84]],
	['return-2', [6.02, 0.8, 4.5]],
	['return-3', [3.5, 0.8, 4.8]],
	['return-4', [-1.0, 0.8, 4.85]],
	['return-5', [-5.8, 0.8, 4.7]],
	['return-6', [-8.0, 0.8, 3.5]],
	['return-7', [-8.2, 0.8, 1.3]],
];

/* -------------------------------------------------------------------------- */
/* Serialize                                                                  */
/* -------------------------------------------------------------------------- */

function createAccessor(array, type) {
	return doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
}

function addPrimitive(mesh, geometry, material) {
	const nonIndexed = geometry.index ? geometry.toNonIndexed() : geometry;
	nonIndexed.computeVertexNormals();
	const position = nonIndexed.getAttribute('position');
	const normal = nonIndexed.getAttribute('normal');
	const uv = nonIndexed.getAttribute('uv');

	const primitive = doc.createPrimitive().setMaterial(material);
	primitive.setAttribute('POSITION', createAccessor(new Float32Array(position.array), 'VEC3'));
	primitive.setAttribute('NORMAL', createAccessor(new Float32Array(normal.array), 'VEC3'));
	if (uv) {
		primitive.setAttribute('TEXCOORD_0', createAccessor(new Float32Array(uv.array), 'VEC2'));
	}
	mesh.addPrimitive(primitive);
}

for (const [name, definition] of parts) {
	const node = doc.createNode(name);
	node.setTranslation(definition.position);
	scene.addChild(node);

	if (name === 'cpu-progress-bar') {
		node.setScale([0.001, 1, 1]);
	}

	const mesh = doc.createMesh(name);
	node.setMesh(mesh);
	for (const item of definition.pieces) {
		addPrimitive(mesh, item.geometry, item.material);
	}
}

for (const [name, translation] of anchors) {
	const node = doc.createNode(name);
	node.setTranslation(translation);
	scene.addChild(node);
}

const io = new NodeIO().registerExtensions([KHRMaterialsEmissiveStrength]);
const sourceBytes = await io.writeBinary(doc);
const sourcePath = path.join(CACHE, 'scheduler.source.glb');
await fs.writeFile(sourcePath, sourceBytes);
console.log(`› Source GLB written (${fmt(sourceBytes.byteLength)})`);

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

console.log('› Welding, deduplicating and pruning (anchors preserved)...');
run(cli, ['weld', sourcePath, temp('scheduler.weld.glb')]);
run(cli, ['dedup', temp('scheduler.weld.glb'), temp('scheduler.dedup.glb')]);
run(cli, ['prune', temp('scheduler.dedup.glb'), temp('scheduler.pruned.glb'), '--keep-leaves']);

console.log('› Compressing textures with KTX2 / ETC1S...');
run(cli, [
	'etc1s',
	temp('scheduler.pruned.glb'),
	temp('scheduler.ktx2.glb'),
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
	temp('scheduler.ktx2.glb'),
	path.join(MODEL_DIR, OUT_NAME),
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
/* Verification                                                               */
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

const finalPath = path.join(MODEL_DIR, OUT_NAME);
const finalBytes = await fs.stat(finalPath);
const finalJson = await readGlbJson(finalPath);
const names = new Set((finalJson.nodes ?? []).map((node) => node.name).filter(Boolean));

const REQUIRED_NODES = [
	'belt-surface',
	'cpu-base',
	'cpu-shell',
	'cpu-core',
	'cpu-progress-bar',
	'io-pad',
	'io-header',
	'retired-pad',
	'return-rail',
	'stage-floor',
	'spawn',
	'queue-slot-0',
	'queue-slot-4',
	'cpu-entry',
	'cpu-slot',
	'cpu-exit-io',
	'cpu-exit-done',
	'io-slot-0',
	'io-slot-4',
	'io-exit',
	'retired-slot-0',
	'retired-slot-4',
	'return-0',
	'return-7',
];
for (let index = 0; index < 5; index += 1) REQUIRED_NODES.push(`proc-${index}`);

const missing = REQUIRED_NODES.filter((name) => !names.has(name));
if (missing.length > 0) {
	throw new Error(`Final GLB is missing contract nodes: ${missing.join(', ')}`);
}

const usedExtensions = finalJson.extensionsUsed ?? [];
for (const extension of ['KHR_draco_mesh_compression', 'KHR_texture_basisu']) {
	if (!usedExtensions.includes(extension)) {
		throw new Error(`Expected ${extension} in final GLB extensions`);
	}
}
if (!usedExtensions.includes('KHR_materials_emissive_strength')) {
	console.warn('! KHR_materials_emissive_strength is missing');
}

let triangles = 0;
for (const definition of parts.values()) {
	for (const item of definition.pieces) {
		const count = item.geometry.index
			? item.geometry.index.count
			: item.geometry.attributes.position.count;
		triangles += Math.floor(count / 3);
	}
}

console.log(`✓ Final model written (${fmt(finalBytes.size)})`);
console.log(`  extensions: ${usedExtensions.join(', ') || 'none'}`);
console.log(`  nodes: ${names.size}`);
console.log(`  parts: ${parts.size}`);
console.log(`  triangles (pre-compression): ${triangles.toLocaleString()}`);
console.log(`  textures: ${textureDefs.length} maps`);
console.log(`  anchors: ${anchors.length}`);
