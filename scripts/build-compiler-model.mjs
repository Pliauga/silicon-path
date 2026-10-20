#!/usr/bin/env node
/**
 * Silicon Path — procedural compiler assembly line.
 *
 * Generates an isometric toolchain diorama: an infeed magazine, a conveyor,
 * a preprocessor scanner, a geared compiler station, a linker press, and an
 * output gate. The payload blocks carry baked `.c` → `.i` → `.o` → `.exe`
 * labels so the Svelte component can swap them without runtime textures.
 *
 * The script mirrors the CPU package pipeline: PBR maps are drawn with sharp,
 * the scene is written through the glTF-Transform Document API, then welded,
 * deduplicated, pruned, KTX2/ETC1S compressed, and Draco compressed.
 *
 * Run: npm run build:compiler-model
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
const TEX_DIR = path.join(CACHE, 'textures-compiler');
const MODEL_DIR = path.join(ROOT, 'static', 'models');
const KTX_BIN = path.join(ROOT, '.tools', 'ktx', 'root', 'usr', 'local', 'bin');
const MODEL_NAME = 'compiler-pipeline.glb';

await fs.mkdir(TEX_DIR, { recursive: true });
await fs.mkdir(MODEL_DIR, { recursive: true });

const SANS = 'Helvetica Neue, Helvetica, Arial, sans-serif';
const MONO = 'SFMono-Regular, Menlo, Monaco, Consolas, monospace';

function fmt(bytes) {
	return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

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
/* Textures                                                                   */
/* -------------------------------------------------------------------------- */

// The belt is 10.2 units long and 1.86 wide. UVs repeat eight times along U,
// so one 128 px column of the texture equals one chevron pitch on the belt.
function beltColorSvg() {
	const W = 1024;
	const H = 512;
	const rand = makeRandom(2214);
	const scuffs = [];
	for (let i = 0; i < 240; i += 1) {
		const x = rand() * W;
		const y = rand() * H;
		scuffs.push(
			`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(0.8 + rand() * 9).toFixed(1)}" height="${(0.5 + rand() * 1.8).toFixed(1)}" fill="${rand() > 0.55 ? '#000000' : '#63787a'}" opacity="${(0.02 + rand() * 0.07).toFixed(2)}"/>`
		);
	}
	const chevrons = [];
	for (let i = 0; i < 8; i += 1) {
		const x0 = i * 128;
		chevrons.push(
			`<path d="M${x0 + 7} 54 L${x0 + 64} 252 L${x0 + 121} 54" fill="none" stroke="#102728" stroke-width="17" stroke-linejoin="round" opacity=".6"/>`
		);
		chevrons.push(
			`<path d="M${x0 + 7} 54 L${x0 + 64} 252 L${x0 + 121} 54" fill="none" stroke="#3d7778" stroke-width="1.6" stroke-linejoin="round" opacity=".38"/>`
		);
	}
	const ribs = [];
	for (const y of [36, 126, 216, 306, 396, 486]) {
		ribs.push(`<path d="M0 ${y}H${W}" stroke="#000000" stroke-width="8" opacity=".3"/>`);
		ribs.push(`<path d="M0 ${y + 5}H${W}" stroke="#7e9294" stroke-width="1" opacity=".14"/>`);
	}
	const defs = `
		<linearGradient id="rubber" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0" stop-color="#0a1011"/>
			<stop offset=".24" stop-color="#131d1e"/>
			<stop offset=".5" stop-color="#0c1415"/>
			<stop offset=".76" stop-color="#131d1e"/>
			<stop offset="1" stop-color="#080d0e"/>
		</linearGradient>
		<radialGradient id="sheen" cx=".5" cy=".45" r=".72">
			<stop offset="0" stop-color="#3d6062" stop-opacity=".12"/>
			<stop offset="1" stop-color="#000" stop-opacity="0"/>
		</radialGradient>
		<linearGradient id="brass" x1="0" y1="0" x2="1" y2="0">
			<stop offset="0" stop-color="#d8b36a" stop-opacity="0"/>
			<stop offset=".3" stop-color="#d8b36a" stop-opacity=".5"/>
			<stop offset=".7" stop-color="#d8b36a" stop-opacity=".5"/>
			<stop offset="1" stop-color="#d8b36a" stop-opacity="0"/>
		</linearGradient>
	`;
	const body = `
		<rect width="${W}" height="${H}" fill="url(#rubber)"/>
		<rect width="${W}" height="${H}" fill="url(#sheen)"/>
		${ribs.join('\n')}
		<g>${chevrons.join('\n')}</g>
		<rect x="0" y="249" width="${W}" height="6" fill="url(#brass)" opacity=".34"/>
		<g>${scuffs.join('\n')}</g>
		<g fill="#9fb5b6" font-family="${MONO}" opacity=".22">
			<text x="36" y="480" font-size="13" letter-spacing="7">CONVEYOR // ASM-04</text>
		</g>
	`;
	return { width: W, height: H, defs, body };
}

function beltOrmSvg() {
	const W = 512;
	const H = 256;
	const rand = makeRandom(4411);
	const scuffs = [];
	for (let i = 0; i < 120; i += 1) {
		scuffs.push(
			`<rect x="${(rand() * W).toFixed(1)}" y="${(rand() * H).toFixed(1)}" width="${(1 + rand() * 12).toFixed(1)}" height="${(0.6 + rand() * 2).toFixed(1)}" fill="rgb(255,${(180 + rand() * 60).toFixed(0)},14)" opacity=".5"/>`
		);
	}
	const chevrons = [];
	for (let i = 0; i < 8; i += 1) {
		const x0 = i * 64;
		chevrons.push(
			`<path d="M${x0 + 3} 28 L${x0 + 32} 126 L${x0 + 61} 28" fill="none" stroke="rgb(255,198,12)" stroke-width="9" stroke-linejoin="round"/>`
		);
	}
	const defs = `
		<linearGradient id="orm" x1="0" y1="0" x2="1" y2="0">
			<stop offset="0" stop-color="rgb(255,226,22)"/>
			<stop offset=".5" stop-color="rgb(255,216,18)"/>
			<stop offset="1" stop-color="rgb(255,228,24)"/>
		</linearGradient>
	`;
	const body = `
		<rect width="${W}" height="${H}" fill="url(#orm)"/>
		<g fill="none">${chevrons.join('\n')}</g>
		${scuffs.join('\n')}
	`;
	return { width: W, height: H, defs, body };
}

function plaqueSvg(title, subtitle, accent = '#d8b36a') {
	const W = 768;
	const H = 224;
	const defs = `
		<linearGradient id="plate" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0" stop-color="#121a1b"/>
			<stop offset=".5" stop-color="#080d0e"/>
			<stop offset="1" stop-color="#0e1516"/>
		</linearGradient>
		<linearGradient id="brassEdge" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0" stop-color="#f0d090"/>
			<stop offset=".5" stop-color="#9d732c"/>
			<stop offset="1" stop-color="#e8c57a"/>
		</linearGradient>
		<pattern id="brush" width="5" height="5" patternUnits="userSpaceOnUse">
			<path d="M0 2H5" stroke="#ffffff" stroke-width=".4" opacity=".05"/>
		</pattern>
	`;
	const body = `
		<rect width="${W}" height="${H}" rx="10" fill="url(#plate)"/>
		<rect width="${W}" height="${H}" rx="10" fill="url(#brush)"/>
		<rect x="9" y="9" width="${W - 18}" height="${H - 18}" rx="6" fill="none" stroke="url(#brassEdge)" stroke-width="2" opacity=".62"/>
		<rect x="20" y="20" width="${W - 40}" height="${H - 40}" rx="3" fill="none" stroke="#43575a" stroke-width=".8" opacity=".5"/>
		<g fill="${accent}">
			<rect x="34" y="${H / 2 - 24}" width="3" height="48" opacity=".8"/>
		</g>
		<g font-family="${SANS}">
			<text x="58" y="102" font-size="45" font-weight="500" letter-spacing="6" fill="${accent}">${title}</text>
			<text x="60" y="150" font-size="17" letter-spacing="4.4" fill="#9fb3b4" opacity=".8" font-family="${MONO}">${subtitle}</text>
		</g>
		<g font-family="${MONO}" fill="#7f9496" opacity=".55">
			<text x="${W - 36}" y="48" font-size="12" letter-spacing="2.4" text-anchor="end">SILICON PATH</text>
			<text x="${W - 36}" y="${H - 34}" font-size="10" letter-spacing="2" text-anchor="end">ASM-04 / TOOLCHAIN</text>
		</g>
		<g fill="#d8b36a" opacity=".8">
			<circle cx="28" cy="28" r="3.4"/><circle cx="${W - 28}" cy="28" r="3.4"/>
			<circle cx="28" cy="${H - 28}" r="3.4"/><circle cx="${W - 28}" cy="${H - 28}" r="3.4"/>
		</g>
	`;
	return { width: W, height: H, defs, body };
}

function labelSvg({ extension, title, stage, accent, detail }) {
	const W = 512;
	const H = 512;
	const rand = makeRandom(7300 + extension.length * 37);
	const lines = [];
	for (let i = 0; i < 11; i += 1) {
		const width = 46 + rand() * 132;
		lines.push(
			`<rect x="58" y="${86 + i * 19}" width="${width.toFixed(1)}" height="3.4" rx="1.7" fill="${accent}" opacity="${(0.14 + rand() * 0.14).toFixed(2)}"/>`
		);
	}
	const brackets = `
		<path d="M32 70V32h38" fill="none" stroke="${accent}" stroke-width="2" opacity=".8"/>
		<path d="M${W - 32} 70V32h-38" fill="none" stroke="${accent}" stroke-width="2" opacity=".8"/>
		<path d="M32 ${H - 70}V${H - 32}h38" fill="none" stroke="${accent}" stroke-width="2" opacity=".8"/>
		<path d="M${W - 32} ${H - 70}V${H - 32}h-38" fill="none" stroke="${accent}" stroke-width="2" opacity=".8"/>
	`;
	const defs = `
		<linearGradient id="face" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0" stop-color="#0b1416"/>
			<stop offset=".55" stop-color="#050a0b"/>
			<stop offset="1" stop-color="#0a1214"/>
		</linearGradient>
		<radialGradient id="hot" cx=".62" cy=".6" r=".7">
			<stop offset="0" stop-color="${accent}" stop-opacity=".18"/>
			<stop offset=".7" stop-color="${accent}" stop-opacity=".03"/>
			<stop offset="1" stop-color="#000" stop-opacity="0"/>
		</radialGradient>
		<linearGradient id="rule" x1="0" y1="0" x2="1" y2="0">
			<stop offset="0" stop-color="${accent}" stop-opacity="0"/>
			<stop offset=".3" stop-color="${accent}" stop-opacity=".7"/>
			<stop offset=".7" stop-color="${accent}" stop-opacity=".7"/>
			<stop offset="1" stop-color="${accent}" stop-opacity="0"/>
		</linearGradient>
		<pattern id="micro" width="16" height="16" patternUnits="userSpaceOnUse">
			<path d="M16 0H0V16" fill="none" stroke="${accent}" stroke-width=".4" opacity=".055"/>
		</pattern>
	`;
	const body = `
		<rect width="${W}" height="${H}" fill="url(#face)"/>
		<rect width="${W}" height="${H}" fill="url(#micro)"/>
		<rect width="${W}" height="${H}" fill="url(#hot)"/>
		<rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="10" fill="none" stroke="${accent}" stroke-width="1.1" opacity=".32"/>
		${brackets}
		<g font-family="${MONO}">
			<text x="58" y="66" font-size="12" letter-spacing="4.6" fill="${accent}" opacity=".9">SILICON PATH</text>
			<text x="${W - 58}" y="66" font-size="12" letter-spacing="3" fill="#93a8aa" opacity=".7" text-anchor="end">${stage}</text>
		</g>
		<g>${lines.join('\n')}</g>
		<g text-anchor="middle" font-family="${SANS}">
			<text x="256" y="392" font-size="182" font-weight="300" letter-spacing="-6" fill="${accent}">${extension}</text>
		</g>
		<g text-anchor="middle" font-family="${MONO}">
			<text x="256" y="436" font-size="17" letter-spacing="7" fill="#cfe0df" opacity=".92">${title}</text>
			<text x="256" y="462" font-size="10" letter-spacing="3.4" fill="${accent}" opacity=".62">${detail}</text>
		</g>
		<rect x="132" y="474" width="248" height="1.6" fill="url(#rule)"/>
	`;
	return { width: W, height: H, defs, body };
}

const textureDefs = [
	{ key: 'beltColor', name: 'compiler-belt-color', ...beltColorSvg() },
	{ key: 'beltOrm', name: 'compiler-belt-orm', ...beltOrmSvg() },
	{
		key: 'plaqueInfeed',
		name: 'compiler-plaque-infeed',
		...plaqueSvg('INFEED', 'SOURCE · C', '#8bd4cf')
	},
	{
		key: 'plaquePre',
		name: 'compiler-plaque-preprocess',
		...plaqueSvg('01 / PREPROCESS', 'LEX · MACROS · INCLUDES', '#8bd4cf')
	},
	{
		key: 'plaqueCompile',
		name: 'compiler-plaque-compile',
		...plaqueSvg('02 / COMPILE', 'PARSE · OPTIMISE · CODEGEN', '#d8b36a')
	},
	{
		key: 'plaqueLink',
		name: 'compiler-plaque-link',
		...plaqueSvg('03 / LINK', 'RELOCATE · RESOLVE · EMIT', '#e0a15c')
	},
	{
		key: 'plaqueOutput',
		name: 'compiler-plaque-output',
		...plaqueSvg('OUTPUT', 'EXECUTABLE / READY', '#a7e6b8')
	},
	{
		key: 'labelC',
		name: 'compiler-label-c',
		...labelSvg({
			extension: '.c',
			title: 'C SOURCE',
			stage: 'STAGE 00',
			accent: '#8bd4cf',
			detail: 'PREPROCESS → COMPILE → LINK'
		})
	},
	{
		key: 'labelI',
		name: 'compiler-label-i',
		...labelSvg({
			extension: '.i',
			title: 'PREPROCESSED',
			stage: 'STAGE 01',
			accent: '#62e0c8',
			detail: 'TRANSLATION UNIT'
		})
	},
	{
		key: 'labelO',
		name: 'compiler-label-o',
		...labelSvg({
			extension: '.o',
			title: 'OBJECT CODE',
			stage: 'STAGE 02',
			accent: '#d8b36a',
			detail: 'RELOCATABLE MACHINE CODE'
		})
	},
	{
		key: 'labelExe',
		name: 'compiler-label-exe',
		...labelSvg({
			extension: '.exe',
			title: 'EXECUTABLE',
			stage: 'STAGE 03',
			accent: '#a7e6b8',
			detail: 'LINKED · READY TO RUN'
		})
	}
];

console.log('› Drawing compiler pipeline textures...');
const textureBuffers = {};
for (const tex of textureDefs) {
	textureBuffers[tex.key] = await renderTexture(tex.name, tex.width, tex.height, tex.defs, tex.body);
	console.log(`  · ${tex.name}.png (${tex.width}×${tex.height})`);
}

/* -------------------------------------------------------------------------- */
/* Geometry helpers                                                           */
/* -------------------------------------------------------------------------- */

const roundBox = (w, h, d, radius = 0.02, segments = 3) =>
	new RoundedBoxGeometry(w, h, d, segments, Math.min(radius, Math.min(w, h, d) * 0.24));

function flipV(geometry) {
	const uv = geometry.getAttribute('uv');
	if (!uv) return geometry;
	for (let i = 0; i < uv.count; i += 1) {
		uv.setY(i, 1 - uv.getY(i));
	}
	uv.needsUpdate = true;
	return geometry;
}

function horizontalPlane(w, d) {
	const geometry = new THREE.PlaneGeometry(w, d);
	geometry.rotateX(-Math.PI / 2);
	// glTF textures load with flipY = false, so flip V to keep artwork upright.
	return flipV(geometry);
}

function verticalPlane(w, h, facing = '+z') {
	const geometry = new THREE.PlaneGeometry(w, h);
	if (facing === '+x') geometry.rotateY(Math.PI / 2);
	else if (facing === '-x') geometry.rotateY(-Math.PI / 2);
	else if (facing === '+z') {
		// already facing +Z
	} else if (facing === '-z') geometry.rotateY(Math.PI);
	return flipV(geometry);
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

/* -------------------------------------------------------------------------- */
/* Nodes                                                                      */
/* -------------------------------------------------------------------------- */

const nodeDefs = new Map();
const nodeOrder = [];

function defineNode(name, position = [0, 0, 0], parent = null) {
	if (nodeDefs.has(name)) throw new Error(`Duplicate node "${name}"`);
	const def = { name, position, parent, pieces: [] };
	nodeDefs.set(name, def);
	nodeOrder.push(name);
	return def;
}

function addPiece(name, geometry, material, transform) {
	const def = nodeDefs.get(name);
	if (!def) throw new Error(`Unknown node "${name}"`);
	def.pieces.push({ geometry: applyTransform(geometry, transform), material });
}

function box(name, material, w, h, d, position, rotation = [0, 0, 0]) {
	addPiece(name, new THREE.BoxGeometry(w, h, d), material, { position, rotation });
}

function rounded(name, material, w, h, d, position, { radius = 0.02, segments = 3, rotation = [0, 0, 0] } = {}) {
	addPiece(name, roundBox(w, h, d, radius, segments), material, { position, rotation });
}

function cyl(name, material, radius, height, position, rotation = [0, 0, 0], segments = 18) {
	addPiece(name, new THREE.CylinderGeometry(radius, radius, height, segments), material, {
		position,
		rotation
	});
}

function plane(name, material, w, h, position, facing = '+z') {
	addPiece(name, verticalPlane(w, h, facing), material, { position });
}

/* -------------------------------------------------------------------------- */
/* Document, textures and materials                                           */
/* -------------------------------------------------------------------------- */

const doc = new Document();
const emissiveExt = doc.createExtension(KHRMaterialsEmissiveStrength);
const buffer = doc.createBuffer();
const scene = doc.createScene('Compiler toolchain');

function texture(key, name) {
	return doc
		.createTexture(name)
		.setImage(textureBuffers[key])
		.setMimeType('image/png')
		.setURI(`${name}.png`);
}

const textures = {
	beltColor: texture('beltColor', 'compiler-belt-color'),
	beltOrm: texture('beltOrm', 'compiler-belt-orm'),
	plaqueInfeed: texture('plaqueInfeed', 'compiler-plaque-infeed'),
	plaquePre: texture('plaquePre', 'compiler-plaque-preprocess'),
	plaqueCompile: texture('plaqueCompile', 'compiler-plaque-compile'),
	plaqueLink: texture('plaqueLink', 'compiler-plaque-link'),
	plaqueOutput: texture('plaqueOutput', 'compiler-plaque-output'),
	labelC: texture('labelC', 'compiler-label-c'),
	labelI: texture('labelI', 'compiler-label-i'),
	labelO: texture('labelO', 'compiler-label-o'),
	labelExe: texture('labelExe', 'compiler-label-exe')
};

function emissiveStrength(material, value) {
	const property = emissiveExt.createEmissiveStrength().setEmissiveStrength(value);
	material.setExtension('KHR_materials_emissive_strength', property);
	return material;
}

const mats = {
	belt: doc
		.createMaterial('Conveyor belt')
		.setBaseColorTexture(textures.beltColor)
		.setMetallicRoughnessTexture(textures.beltOrm)
		.setMetallicFactor(1)
		.setRoughnessFactor(1),

	steel: doc
		.createMaterial('Conveyor steel')
		.setBaseColorFactor([0.24, 0.255, 0.26, 1])
		.setMetallicFactor(0.94)
		.setRoughnessFactor(0.32),

	dark: doc
		.createMaterial('Machine dark')
		.setBaseColorFactor([0.026, 0.03, 0.032, 1])
		.setMetallicFactor(0.42)
		.setRoughnessFactor(0.52),

	housing: doc
		.createMaterial('Machine housing')
		.setBaseColorFactor([0.075, 0.084, 0.088, 1])
		.setMetallicFactor(0.62)
		.setRoughnessFactor(0.4),

	brass: doc
		.createMaterial('Machine accent')
		.setBaseColorFactor([0.74, 0.55, 0.27, 1])
		.setMetallicFactor(1)
		.setRoughnessFactor(0.23),

	bronze: doc
		.createMaterial('Gear bronze')
		.setBaseColorFactor([0.56, 0.41, 0.22, 1])
		.setMetallicFactor(1)
		.setRoughnessFactor(0.27),

	chrome: doc
		.createMaterial('Piston chrome')
		.setBaseColorFactor([0.6, 0.63, 0.65, 1])
		.setMetallicFactor(1)
		.setRoughnessFactor(0.16),

	stock: doc
		.createMaterial('Blank stock')
		.setBaseColorFactor([0.035, 0.039, 0.042, 1])
		.setMetallicFactor(0.24)
		.setRoughnessFactor(0.58),

	payload: doc
		.createMaterial('Payload body')
		.setBaseColorFactor([0.045, 0.058, 0.062, 1])
		.setMetallicFactor(0.8)
		.setRoughnessFactor(0.2)
};

function labelMaterial(name, key, baseStrength) {
	const material = doc
		.createMaterial(name)
		.setBaseColorTexture(textures[key])
		.setEmissiveTexture(textures[key])
		.setEmissiveFactor([1, 1, 1])
		.setMetallicFactor(0.35)
		.setRoughnessFactor(0.34);
	emissiveStrength(material, baseStrength);
	return material;
}

function plaqueMaterial(name, key) {
	const material = doc
		.createMaterial(name)
		.setBaseColorTexture(textures[key])
		.setEmissiveTexture(textures[key])
		.setEmissiveFactor([0.85, 0.85, 0.85])
		.setMetallicFactor(0.22)
		.setRoughnessFactor(0.46);
	emissiveStrength(material, 0.55);
	return material;
}

mats.plaqueInfeed = plaqueMaterial('Plaque infeed', 'plaqueInfeed');
mats.plaquePre = plaqueMaterial('Plaque preprocess', 'plaquePre');
mats.plaqueCompile = plaqueMaterial('Plaque compile', 'plaqueCompile');
mats.plaqueLink = plaqueMaterial('Plaque link', 'plaqueLink');
mats.plaqueOutput = plaqueMaterial('Plaque output', 'plaqueOutput');

mats.labelC = labelMaterial('Label c', 'labelC', 1.1);
mats.labelI = labelMaterial('Label i', 'labelI', 1.15);
mats.labelO = labelMaterial('Label o', 'labelO', 1.15);
mats.labelExe = labelMaterial('Label exe', 'labelExe', 1.45);

function glowMaterial(name, color, strength) {
	const material = doc
		.createMaterial(name)
		.setBaseColorFactor([color[0] * 0.4, color[1] * 0.4, color[2] * 0.4, 1])
		.setMetallicFactor(0.2)
		.setRoughnessFactor(0.3)
		.setEmissiveFactor(color);
	emissiveStrength(material, strength);
	return material;
}

mats.glowC = glowMaterial('Payload glow c', [0.42, 0.95, 0.87], 2.2);
mats.glowI = glowMaterial('Payload glow i', [0.28, 0.95, 0.78], 2.2);
mats.glowO = glowMaterial('Payload glow o', [0.95, 0.72, 0.28], 2.1);
mats.glowExe = glowMaterial('Payload glow exe', [0.5, 1, 0.62], 2.6);

function lightMaterial(name, color, strength) {
	const material = doc
		.createMaterial(name)
		.setBaseColorFactor([0.02, 0.025, 0.026, 1])
		.setMetallicFactor(0.3)
		.setRoughnessFactor(0.35)
		.setEmissiveFactor(color);
	emissiveStrength(material, strength);
	return material;
}

mats.aperturePre = lightMaterial('Aperture pre', [0.35, 0.95, 0.86], 1.6);
mats.apertureCompile = lightMaterial('Aperture compile', [0.45, 0.9, 0.8], 1.55);
mats.apertureLink = lightMaterial('Aperture link', [1, 0.62, 0.22], 1.55);
mats.apertureOutput = lightMaterial('Aperture output', [0.55, 0.98, 0.7], 1.7);
mats.beaconAmber = lightMaterial('Beacon amber', [1, 0.55, 0.14], 1.4);
mats.screen = lightMaterial('Terminal screen', [0.3, 0.9, 0.8], 1.25);

/* -------------------------------------------------------------------------- */
/* Layout constants                                                           */
/* -------------------------------------------------------------------------- */

const BELT_TOP = 0.95;
const BELT_START = -5.3;
const BELT_END = 5.3;
const STATION_PRE = -3.2;
const STATION_COMPILE = 0;
const STATION_LINK = 3.2;
const PAYLOAD_START = -4.78;
const _PAYLOAD_END = 4.78;
const PAYLOAD_Y = BELT_TOP + 0.16;
const _STATIONS = [STATION_PRE, STATION_COMPILE, STATION_LINK];

/* -------------------------------------------------------------------------- */
/* Conveyor                                                                   */
/* -------------------------------------------------------------------------- */

defineNode('conveyor');

// Belt surface: UVs repeat eight times along the length so the chevrons read at
// the right pitch, and the component can scroll texture.offset.x for motion.
{
	const geometry = horizontalPlane(10.18, 1.86);
	const uv = geometry.getAttribute('uv');
	for (let i = 0; i < uv.count; i += 1) uv.setX(i, uv.getX(i) * 8);
	uv.needsUpdate = true;
	addPiece('conveyor', geometry, mats.belt, { position: [0, BELT_TOP + 0.002, 0] });
}

// Belt carcass and guards.
rounded('conveyor', mats.dark, 10.2, 0.11, 1.88, [0, 0.895, 0], { radius: 0.02, segments: 2 });
rounded('conveyor', mats.steel, 10.44, 0.1, 0.11, [0, 1.005, 0.985], { radius: 0.02, segments: 2 });
rounded('conveyor', mats.steel, 10.44, 0.1, 0.11, [0, 1.005, -0.985], { radius: 0.02, segments: 2 });
box('conveyor', mats.brass, 10.44, 0.014, 0.028, [0, 1.063, 0.985]);
box('conveyor', mats.brass, 10.44, 0.014, 0.028, [0, 1.063, -0.985]);

rounded('conveyor', mats.dark, 10.12, 0.16, 1.62, [0, 0.79, 0], { radius: 0.02, segments: 2 });

// Underframe cross members.
for (let i = 0; i < 7; i += 1) {
	const x = -4.5 + i * 1.5;
	box('conveyor', mats.steel, 0.1, 0.1, 1.72, [x, 0.7, 0]);
	box('conveyor', mats.brass, 0.02, 0.02, 1.6, [x + 0.055, 0.735, 0]);
}

// Rollers, visible beneath the deck.
for (let i = 0; i < 16; i += 1) {
	const x = -4.9 + i * 0.653;
	cyl('conveyor', mats.chrome, 0.072, 1.7, [x, 0.845, 0], [Math.PI / 2, 0, 0], 12);
}

// Legs and feet.
for (const x of [-4.6, -1.5, 1.5, 4.6]) {
	for (const z of [-0.78, 0.78]) {
		box('conveyor', mats.steel, 0.1, 0.68, 0.1, [x, 0.36, z]);
		rounded('conveyor', mats.dark, 0.26, 0.035, 0.26, [x, 0.0175, z], {
			radius: 0.01,
			segments: 2
		});
		box('conveyor', mats.brass, 0.12, 0.012, 0.12, [x, 0.7, z]);
	}
	box('conveyor', mats.steel, 0.08, 0.07, 1.56, [x, 0.34, 0]);
}

// Drive drums at both ends.
for (const x of [BELT_START, BELT_END]) {
	cyl('conveyor', mats.dark, 0.155, 1.94, [x, 0.86, 0], [Math.PI / 2, 0, 0], 20);
	cyl('conveyor', mats.brass, 0.075, 0.05, [x, 0.86, 0.99], [Math.PI / 2, 0, 0], 16);
	cyl('conveyor', mats.brass, 0.075, 0.05, [x, 0.86, -0.99], [Math.PI / 2, 0, 0], 16);
}

// Floor conduits run the length of the line.
for (const z of [-1.62, 1.62]) {
	cyl('conveyor', mats.dark, 0.036, 11.0, [0, 0.062, z], [0, 0, Math.PI / 2], 12);
	for (let i = 0; i < 6; i += 1) {
		const x = -4.9 + i * 1.96;
		box('conveyor', mats.brass, 0.05, 0.06, 0.12, [x, 0.062, z]);
	}
}

/* -------------------------------------------------------------------------- */
/* Stations                                                                   */
/* -------------------------------------------------------------------------- */

function buildPortal(name, x, lightMaterial, plaqueMaterial) {
	for (const z of [-1.14, 1.14]) {
		rounded(name, mats.housing, 0.3, 2.45, 0.44, [x, 1.44, z], {
			radius: 0.035,
			segments: 3
		});
		rounded(name, mats.dark, 0.5, 0.18, 0.66, [x, 0.09, z], { radius: 0.02, segments: 2 });
		box(name, mats.brass, 0.515, 0.015, 0.675, [x, 0.185, z]);
		box(name, mats.brass, 0.02, 1.7, 0.02, [x + 0.16, 1.45, z + 0.21]);
		box(name, mats.brass, 0.02, 1.7, 0.02, [x + 0.16, 1.45, z - 0.21]);
	}

	// Canopy and its brass crown.
	rounded(name, mats.housing, 0.66, 0.62, 2.72, [x, 2.98, 0], { radius: 0.055, segments: 4 });
	box(name, mats.brass, 0.06, 0.02, 2.5, [x + 0.305, 3.292, 0]);
	box(name, mats.dark, 0.72, 0.055, 2.78, [x, 2.665, 0]);

	// Task light beneath the canopy.
	box(name, lightMaterial, 0.46, 0.022, 1.62, [x, 2.64, 0]);

	// Plaque on the canopy face that looks toward the camera.
	plane(name, plaqueMaterial, 0.56, 0.163, [x, 2.95, 1.361], '+z');

	// Cooling fins on the canopy's side faces.
	for (let i = 0; i < 7; i += 1) {
		const pz = -0.27 + i * 0.09;
		box(name, mats.steel, 0.035, 0.38, 0.05, [x + 0.34, 2.95, pz]);
		box(name, mats.steel, 0.035, 0.38, 0.05, [x - 0.34, 2.95, pz]);
	}

	// Fasteners around the plaque.
	for (const dx of [-0.235, 0.235]) {
		for (const dy of [-0.2, 0.2]) {
			cyl(name, mats.brass, 0.016, 0.012, [x + dx, 2.95 + dy, 1.368], [Math.PI / 2, 0, 0], 10);
		}
	}

	// Status beacon on the canopy roof.
	cyl(name, mats.brass, 0.055, 0.03, [x, 3.315, 1.0], [0, 0, 0], 14);
	cyl(name, lightMaterial, 0.032, 0.1, [x, 3.375, 1.0], [0, 0, 0], 12);
}

// Preprocessor portal -------------------------------------------------------
defineNode('station-preprocessor');
buildPortal('station-preprocessor', STATION_PRE, mats.aperturePre, mats.plaquePre);

// Scanner head above the belt.
rounded('station-preprocessor', mats.chrome, 0.22, 0.13, 1.72, [STATION_PRE, 1.78, 0], {
	radius: 0.02,
	segments: 2
});
box('station-preprocessor', mats.aperturePre, 0.235, 0.018, 1.58, [STATION_PRE, 1.706, 0]);
box('station-preprocessor', mats.dark, 0.26, 0.05, 1.78, [STATION_PRE, 1.855, 0]);
for (const x of [-0.46, 0.46]) {
	box('station-preprocessor', mats.steel, 0.05, 0.6, 0.05, [STATION_PRE + x, 2.2, 0.86]);
	box('station-preprocessor', mats.steel, 0.05, 0.6, 0.05, [STATION_PRE + x, 2.2, -0.86]);
}

// Entry guide rollers.
for (const dx of [-0.52, 0.52]) {
	for (const z of [-0.86, 0.86]) {
		cyl(
			'station-preprocessor',
			mats.dark,
			0.06,
			0.62,
			[STATION_PRE + dx, 1.31, z],
			[0, 0, 0],
			12
		);
		cyl(
			'station-preprocessor',
			mats.brass,
			0.064,
			0.035,
			[STATION_PRE + dx, 1.62, z],
			[0, 0, 0],
			12
		);
	}
}

// Diagnostic bars on the right post face.
for (let i = 0; i < 3; i += 1) {
	box('station-preprocessor', mats.aperturePre, 0.012, 0.035, 0.19, [STATION_PRE + 0.155, 1.42 + i * 0.09, 1.0]);
}

// Compiler portal -----------------------------------------------------------
defineNode('station-compiler');
buildPortal('station-compiler', STATION_COMPILE, mats.apertureCompile, mats.plaqueCompile);

// Gear transmission bracket on the near post. The two gears themselves are
// separate nodes so the component can spin them independently.
rounded('station-compiler', mats.dark, 0.16, 1.2, 0.44, [STATION_COMPILE + 0.23, 1.78, 1.14], {
	radius: 0.03,
	segments: 3
});
box('station-compiler', mats.brass, 0.018, 1.3, 0.5, [STATION_COMPILE + 0.318, 1.78, 1.14]);
for (const dy of [-0.5, 0, 0.5]) {
	for (const dz of [-0.19, 0.19]) {
		cyl(
			'station-compiler',
			mats.brass,
			0.013,
			0.012,
			[STATION_COMPILE + 0.33, 1.78 + dy, 1.14 + dz],
			[0, 0, Math.PI / 2],
			8
		);
	}
}

// Linker portal -------------------------------------------------------------
defineNode('station-linker');
buildPortal('station-linker', STATION_LINK, mats.apertureLink, mats.plaqueLink);

// Crosshead and hydraulic cylinder above the ram.
rounded('station-linker', mats.housing, 0.5, 0.2, 1.52, [STATION_LINK, 2.55, 0], {
	radius: 0.025,
	segments: 3
});
box('station-linker', mats.brass, 0.54, 0.02, 1.56, [STATION_LINK, 2.66, 0]);
cyl('station-linker', mats.chrome, 0.13, 0.38, [STATION_LINK, 2.31, 0], [0, 0, 0], 24);
cyl('station-linker', mats.brass, 0.155, 0.05, [STATION_LINK, 2.15, 0], [0, 0, 0], 24);

// Guide rods.
for (const z of [-0.64, 0.64]) {
	cyl('station-linker', mats.chrome, 0.04, 1.3, [STATION_LINK, 1.96, z], [0, 0, 0], 14);
	cyl('station-linker', mats.brass, 0.055, 0.04, [STATION_LINK, 2.6, z], [0, 0, 0], 14);
	cyl('station-linker', mats.brass, 0.05, 0.035, [STATION_LINK, 1.32, z], [0, 0, 0], 14);
}

// Clamp jaws flanking the belt.
for (const z of [-0.76, 0.76]) {
	rounded('station-linker', mats.dark, 0.46, 0.12, 0.16, [STATION_LINK, 1.02, z], {
		radius: 0.02,
		segments: 2
	});
	box('station-linker', mats.brass, 0.42, 0.014, 0.02, [STATION_LINK, 1.06, z - Math.sign(z) * 0.085]);
}

/* -------------------------------------------------------------------------- */
/* Feeder                                                                     */
/* -------------------------------------------------------------------------- */

defineNode('feeder');

// Magazine tower holding blank stock.
for (const dx of [-0.29, 0.29]) {
	for (const dz of [-0.29, 0.29]) {
		box('feeder', mats.steel, 0.03, 1.46, 0.03, [PAYLOAD_START - 0.64 + dx, 1.71, dz]);
	}
}
rounded('feeder', mats.dark, 0.7, 0.05, 0.7, [PAYLOAD_START - 0.64, 2.46, 0], {
	radius: 0.012,
	segments: 2
});
rounded('feeder', mats.dark, 0.72, 0.05, 0.72, [PAYLOAD_START - 0.64, 0.98, 0], {
	radius: 0.012,
	segments: 2
});
for (let i = 0; i < 3; i += 1) {
	rounded('feeder', mats.stock, 0.44, 0.3, 0.44, [PAYLOAD_START - 0.64, 1.17 + i * 0.33, 0], {
		radius: 0.03,
		segments: 2
	});
	box('feeder', mats.brass, 0.4, 0.006, 0.012, [PAYLOAD_START - 0.64, 1.32 + i * 0.33, 0.223]);
}

// Chute into the belt.
rounded('feeder', mats.steel, 0.64, 0.035, 0.6, [PAYLOAD_START - 0.16, 1.48, 0], {
	radius: 0.012,
	segments: 2,
	rotation: [0, 0, -0.55]
});
for (const z of [-0.31, 0.31]) {
	box('feeder', mats.brass, 0.66, 0.05, 0.018, [PAYLOAD_START - 0.16, 1.52, z], [0, 0, -0.55]);
}

// Infeed nameplate band on the tower's front face.
box('feeder', mats.dark, 0.72, 0.22, 0.05, [PAYLOAD_START - 0.64, 2.36, 0.35]);
plane('feeder', mats.plaqueInfeed, 0.54, 0.157, [PAYLOAD_START - 0.64, 2.36, 0.378], '+z');

// Amber beacon on the magazine roof.
cyl('feeder', mats.brass, 0.045, 0.025, [PAYLOAD_START - 0.64, 2.51, 0.2], [0, 0, 0], 12);
cyl('feeder', mats.beaconAmber, 0.026, 0.085, [PAYLOAD_START - 0.64, 2.56, 0.2], [0, 0, 0], 12);

/* -------------------------------------------------------------------------- */
/* Outfeed gate                                                               */
/* -------------------------------------------------------------------------- */

defineNode('outfeed');

// Scanner arch at the end of the line.
for (const z of [-1.0, 1.0]) {
	rounded('outfeed', mats.housing, 0.14, 1.04, 0.14, [5.06, 1.47, z], {
		radius: 0.02,
		segments: 2
	});
	rounded('outfeed', mats.dark, 0.24, 0.06, 0.24, [5.06, 1.0, z], { radius: 0.01, segments: 2 });
}
rounded('outfeed', mats.housing, 0.16, 0.12, 2.2, [5.06, 2.0, 0], { radius: 0.02, segments: 2 });
box('outfeed', mats.apertureOutput, 0.17, 0.02, 1.86, [5.06, 1.93, 0]);
box('outfeed', mats.brass, 0.02, 0.1, 2.14, [5.145, 2.06, 0]);

// Stop gate.
rounded('outfeed', mats.dark, 0.11, 0.6, 2.12, [5.34, 1.25, 0], { radius: 0.02, segments: 2 });
box('outfeed', mats.brass, 0.02, 0.52, 2.06, [5.4, 1.25, 0]);
plane('outfeed', mats.plaqueOutput, 0.46, 0.135, [5.403, 1.37, 0.55], '+x');

// Terminal console beside the belt.
rounded('outfeed', mats.dark, 0.18, 1.16, 0.12, [5.48, 0.58, 1.12], {
	radius: 0.02,
	segments: 2
});
rounded('outfeed', mats.housing, 0.17, 0.46, 0.56, [5.5, 1.24, 1.12], {
	radius: 0.025,
	segments: 2
});
box('outfeed', mats.brass, 0.2, 0.02, 0.58, [5.5, 1.47, 1.12]);
plane('outfeed', mats.labelExe, 0.32, 0.32, [5.59, 1.24, 1.12], '+x');
for (let i = 0; i < 3; i += 1) {
	box('outfeed', mats.screen, 0.012, 0.018, 0.36 - i * 0.06, [5.585, 1.04 - i * 0.03, 1.12]);
}

/* -------------------------------------------------------------------------- */
/* Gear assembly                                                              */
/* -------------------------------------------------------------------------- */

function gearGeometry(teeth, outerRadius, rootRadius, holeRadius, depth, lighteningHoles = 0) {
	const shape = new THREE.Shape();
	const step = (Math.PI * 2) / teeth;
	const points = [];
	for (let i = 0; i < teeth; i += 1) {
		const a = i * step;
		points.push([a + step * 0.0, rootRadius]);
		points.push([a + step * 0.16, outerRadius * 0.985]);
		points.push([a + step * 0.34, outerRadius]);
		points.push([a + step * 0.5, outerRadius]);
		points.push([a + step * 0.66, outerRadius * 0.985]);
		points.push([a + step * 0.84, rootRadius]);
		points.push([a + step * 0.96, rootRadius]);
	}
	points.forEach(([angle, radius], index) => {
		const x = Math.cos(angle) * radius;
		const y = Math.sin(angle) * radius;
		if (index === 0) shape.moveTo(x, y);
		else shape.lineTo(x, y);
	});
	shape.closePath();

	const hole = new THREE.Path();
	hole.absarc(0, 0, holeRadius, 0, Math.PI * 2, true);
	shape.holes.push(hole);

	if (lighteningHoles > 0) {
		for (let i = 0; i < lighteningHoles; i += 1) {
			const angle = (i / lighteningHoles) * Math.PI * 2 + 0.25;
			const path = new THREE.Path();
			path.absarc(
				Math.cos(angle) * rootRadius * 0.58,
				Math.sin(angle) * rootRadius * 0.58,
				rootRadius * 0.17,
				0,
				Math.PI * 2,
				true
			);
			shape.holes.push(path);
		}
	}

	const geometry = new THREE.ExtrudeGeometry(shape, {
		depth,
		bevelEnabled: true,
		bevelThickness: 0.008,
		bevelSize: 0.006,
		bevelSegments: 2,
		curveSegments: 18
	});
	geometry.translate(0, 0, -depth / 2);
	geometry.rotateY(Math.PI / 2);
	return geometry;
}

function buildGear(name, { teeth, outer, root, hole, depth, holes, hubRadius, x, y, z }) {
	defineNode(name, [x, y, z]);
	addPiece(name, gearGeometry(teeth, outer, root, hole, depth, holes), mats.bronze, {});
	cyl(name, mats.chrome, hubRadius, depth + 0.05, [0, 0, 0], [0, 0, Math.PI / 2], 24);
	cyl(name, mats.brass, hubRadius * 0.55, depth + 0.075, [0, 0, 0], [0, 0, Math.PI / 2], 20);
	for (let i = 0; i < 5; i += 1) {
		const angle = (i / 5) * Math.PI * 2;
		cyl(
			name,
			mats.brass,
			0.012,
			depth + 0.09,
			[0, Math.cos(angle) * hubRadius * 0.8, Math.sin(angle) * hubRadius * 0.8],
			[0, 0, Math.PI / 2],
			8
		);
	}
}

buildGear('gear-main', {
	teeth: 18,
	outer: 0.4,
	root: 0.325,
	hole: 0.075,
	depth: 0.1,
	holes: 4,
	hubRadius: 0.105,
	x: STATION_COMPILE + 0.375,
	y: 2.02,
	z: 1.14
});

buildGear('gear-idler', {
	teeth: 12,
	outer: 0.225,
	root: 0.18,
	hole: 0.045,
	depth: 0.085,
	holes: 0,
	hubRadius: 0.062,
	x: STATION_COMPILE + 0.375,
	y: 1.46,
	z: 1.14
});

/* -------------------------------------------------------------------------- */
/* Linker ram                                                                 */
/* -------------------------------------------------------------------------- */

defineNode('press-ram', [STATION_LINK, 2.02, 0]);

rounded('press-ram', mats.dark, 0.52, 0.42, 1.02, [0, 0, 0], { radius: 0.025, segments: 3 });
box('press-ram', mats.brass, 0.53, 0.02, 1.03, [0, 0.215, 0]);
rounded('press-ram', mats.brass, 0.44, 0.075, 0.84, [0, -0.245, 0], { radius: 0.02, segments: 2 });
box('press-ram', mats.chrome, 0.46, 0.012, 0.86, [0, -0.285, 0]);
for (const z of [-0.64, 0.64]) {
	cyl('press-ram', mats.chrome, 0.048, 0.2, [0, 0.12, z], [0, 0, 0], 14);
	cyl('press-ram', mats.brass, 0.06, 0.035, [0, 0.025, z], [0, 0, 0], 14);
}
for (let i = 0; i < 4; i += 1) {
	cyl(
		'press-ram',
		mats.brass,
		0.014,
		0.012,
		[0.27, 0.13 - (i % 2) * 0.26, 0.3 - Math.floor(i / 2) * 0.6],
		[0, 0, Math.PI / 2],
		8
	);
}

/* -------------------------------------------------------------------------- */
/* Payload blocks                                                             */
/* -------------------------------------------------------------------------- */

defineNode('payload', [PAYLOAD_START, PAYLOAD_Y, 0]);

const payloadVariants = [
	{ name: 'payload-c', material: mats.labelC, glow: mats.glowC },
	{ name: 'payload-i', material: mats.labelI, glow: mats.glowI },
	{ name: 'payload-o', material: mats.labelO, glow: mats.glowO },
	{ name: 'payload-exe', material: mats.labelExe, glow: mats.glowExe }
];

for (const variant of payloadVariants) {
	defineNode(variant.name, [0, 0, 0], 'payload');
	rounded(variant.name, mats.payload, 0.46, 0.32, 0.46, [0, 0, 0], {
		radius: 0.035,
		segments: 3
	});
	rounded(variant.name, mats.brass, 0.5, 0.03, 0.5, [0, -0.145, 0], {
		radius: 0.012,
		segments: 2
	});
	// Label planes sit just proud of the body faces and look toward the camera.
	plane(variant.name, variant.material, 0.355, 0.245, [0.2315, 0, 0], '+x');
	plane(variant.name, variant.material, 0.355, 0.245, [0, 0, 0.2315], '+z');
	// Glowing trim: a status strip on the lid and a hairline frame around it.
	box(variant.name, variant.glow, 0.2, 0.008, 0.02, [0, 0.163, 0.16]);
	box(variant.name, variant.glow, 0.47, 0.007, 0.012, [0, 0.158, 0.229]);
	box(variant.name, variant.glow, 0.47, 0.007, 0.012, [0, 0.158, -0.229]);
	box(variant.name, variant.glow, 0.012, 0.007, 0.47, [0.229, 0.158, 0]);
	box(variant.name, variant.glow, 0.012, 0.007, 0.47, [-0.229, 0.158, 0]);
	box(variant.name, mats.brass, 0.02, 0.012, 0.02, [-0.19, 0.163, -0.19]);
	box(variant.name, mats.brass, 0.02, 0.012, 0.02, [0.19, 0.163, -0.19]);
}

/* -------------------------------------------------------------------------- */
/* Serialize                                                                  */
/* -------------------------------------------------------------------------- */

function createAccessor(array, type) {
	return doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
}

function addPrimitive(mesh, geometry, material) {
	const geometryData = geometry.index ? geometry.toNonIndexed() : geometry;
	const position = geometryData.getAttribute('position');
	const normal = geometryData.getAttribute('normal');
	const uv = geometryData.getAttribute('uv');

	const primitive = doc.createPrimitive().setMaterial(material);
	primitive.setAttribute('POSITION', createAccessor(new Float32Array(position.array), 'VEC3'));
	if (normal) {
		primitive.setAttribute('NORMAL', createAccessor(new Float32Array(normal.array), 'VEC3'));
	}
	if (uv) {
		primitive.setAttribute('TEXCOORD_0', createAccessor(new Float32Array(uv.array), 'VEC2'));
	}
	mesh.addPrimitive(primitive);
}

const nodes = new Map();

for (const name of nodeOrder) {
	const def = nodeDefs.get(name);
	const node = doc.createNode(name);
	if (def.position.some((value) => value !== 0)) node.setTranslation(def.position);
	nodes.set(name, node);

	if (def.parent) {
		const parentNode = nodes.get(def.parent);
		if (!parentNode) throw new Error(`Parent "${def.parent}" must be declared before "${name}"`);
		parentNode.addChild(node);
	} else {
		scene.addChild(node);
	}

	if (!def.pieces.length) continue;
	const mesh = doc.createMesh(name);
	node.setMesh(mesh);

	// Merge pieces that share a material so each station is a handful of
	// primitives rather than dozens of draw calls.
	const groups = new Map();
	for (const item of def.pieces) {
		if (!groups.has(item.material)) groups.set(item.material, []);
		const geometryData = item.geometry.index ? item.geometry.toNonIndexed() : item.geometry;
		groups.get(item.material).push(geometryData);
	}
	for (const [material, geometries] of groups) {
		const merged =
			geometries.length === 1 ? geometries[0] : mergeGeometries(geometries, false);
		if (!merged) throw new Error(`Could not merge geometry for "${name}"`);
		addPrimitive(mesh, merged, material);
	}
}

const io = new NodeIO().registerExtensions([KHRMaterialsEmissiveStrength]);
const sourceBytes = await io.writeBinary(doc);
const sourcePath = path.join(CACHE, 'compiler-pipeline.source.glb');
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

console.log('› Welding, deduplicating and pruning...');
run(cli, ['weld', sourcePath, temp('compiler.weld.glb')]);
run(cli, ['dedup', temp('compiler.weld.glb'), temp('compiler.dedup.glb')]);
run(cli, ['prune', temp('compiler.dedup.glb'), temp('compiler.pruned.glb')]);

console.log('› Compressing textures with KTX2 / ETC1S...');
run(cli, [
	'etc1s',
	temp('compiler.pruned.glb'),
	temp('compiler.ktx2.glb'),
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
	temp('compiler.ktx2.glb'),
	path.join(MODEL_DIR, MODEL_NAME),
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

const finalPath = path.join(MODEL_DIR, MODEL_NAME);
const finalBytes = await fs.stat(finalPath);

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

const finalJson = await readGlbJson(finalPath);
const usedExtensions = finalJson.extensionsUsed ?? [];
const nodeNames = (finalJson.nodes ?? []).map((node) => node.name).filter(Boolean);
const materialNames = (finalJson.materials ?? []).map((material) => material.name);

console.log(`✓ Compiler pipeline written (${fmt(finalBytes.size)})`);
console.log(`  extensions: ${usedExtensions.join(', ') || 'none'}`);
console.log(`  nodes: ${nodeNames.join(', ')}`);
console.log(`  materials: ${materialNames.length} (${materialNames.join(', ')})`);
console.log(`  textures: ${(finalJson.textures ?? []).length}`);
console.log(`  samplers: ${(finalJson.samplers ?? []).length}`);

let triangles = 0;
for (const name of nodeOrder) {
	const def = nodeDefs.get(name);
	for (const item of def.pieces) {
		const count = item.geometry.index
			? item.geometry.index.count
			: item.geometry.attributes.position.count;
		triangles += Math.floor(count / 3);
	}
}
console.log(`  triangles (pre-compression): ${triangles.toLocaleString()}`);

const requiredNodes = [
	'conveyor',
	'feeder',
	'outfeed',
	'station-preprocessor',
	'station-compiler',
	'station-linker',
	'gear-main',
	'gear-idler',
	'press-ram',
	'payload',
	'payload-c',
	'payload-i',
	'payload-o',
	'payload-exe'
];
for (const name of requiredNodes) {
	if (!nodeNames.includes(name)) throw new Error(`Final GLB is missing node "${name}"`);
}
if (!usedExtensions.includes('KHR_draco_mesh_compression')) {
	throw new Error('Final GLB is missing KHR_draco_mesh_compression');
}
if (!usedExtensions.includes('KHR_texture_basisu')) {
	throw new Error('Final GLB is missing KHR_texture_basisu');
}
console.log('✓ Node and extension checks passed');