#!/usr/bin/env node
/**
 * Silicon Path — procedurally generated memory-hierarchy board.
 *
 * Builds a stylised motherboard with a CPU socket, two populated DIMMs, an
 * M.2 SSD, and a 3.5" HDD, plus the glowing data-bus geometry that the Svelte
 * component animates packets along. The exact Catmull-Rom control points are
 * written into the GLB as `extras` on the motherboard node, so the runtime
 * never has to guess where a route lives.
 *
 * Pipeline: SVG → sharp textures → Three.js geometry → glTF-Transform
 * Document → weld / dedup / prune / KTX2 ETC1S / Draco.
 *
 * Run: npm run build:memory-hierarchy
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Document, NodeIO } from '@gltf-transform/core';
import { KHRMaterialsIridescence } from '@gltf-transform/extensions';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const CACHE = path.join(ROOT, '.cache');
const TEX_DIR = path.join(CACHE, 'textures');
const MODEL_DIR = path.join(ROOT, 'static', 'models');
const KTX_BIN = path.join(ROOT, '.tools', 'ktx', 'root', 'usr', 'local', 'bin');

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
/* Layout + flow                                                              */
/* -------------------------------------------------------------------------- */

const BOARD = { w: 7.4, d: 6.2, t: 0.18, top: 0.09 };
const CPU = { x: -1.15, y: 0.09, z: -0.55 };

const RAM_X = [0.55, 1.02];
const RAM_Z = 0.06;
const RAM_LEN = 3.3;
const RAM_BOTTOM = 0.16;
const RAM_TOP = 0.97;

const L3 = { x: CPU.x, y: 0.4, z: CPU.z, radius: 0.48 };

const FLOW = {
	hddToRam: [
		[-2.98, 0.56, 2.42],
		[-3.18, 0.3, 2.68],
		[-3.1, 0.13, 2.92],
		[-1.6, 0.13, 2.96],
		[0.1, 0.13, 2.96],
		[0.54, 0.15, 2.74],
		[0.628, 0.3, 2.2],
		[0.628, 0.6, 1.6],
		[0.628, 0.82, 1.3],
		[0.628, 0.95, 1.14]
	],
	ramToCache: [
		[0.628, 0.96, 1.12],
		[0.74, 1.06, 0.86],
		[0.55, 1.08, 0.4],
		[0.2, 0.95, -0.02],
		[-0.3, 0.72, -0.35],
		[-0.55, 0.5, -0.5],
		[-0.67, 0.4, -0.55]
	],
	cacheLoop: Array.from({ length: 20 }, (_, index) => {
		const angle = (index / 20) * Math.PI * 2;
		return [
			L3.x + Math.cos(angle) * L3.radius,
			L3.y + 0.004,
			L3.z + Math.sin(angle) * L3.radius
		];
	}),
	cacheToRegisters: [
		[-0.67, 0.4, -0.55],
		[-0.91, 0.402, -0.55],
		[-1.15, 0.404, -0.55]
	]
};

const ANCHORS = {
	hdd: [-2.98, 0.56, 2.42],
	ram: [0.628, 0.96, 1.12],
	cache: [-0.67, 0.4, -0.55],
	registers: [-1.15, 0.404, -0.55]
};

/* -------------------------------------------------------------------------- */
/* Board artwork                                                              */
/* -------------------------------------------------------------------------- */

const W = 1024;
const bx = (x) => ((x + BOARD.w / 2) / BOARD.w) * W;
const bz = (z) => ((z + BOARD.d / 2) / BOARD.d) * W;
const pt = ([x, , z]) => `${bx(x).toFixed(1)} ${bz(z).toFixed(1)}`;
const pathOf = (points) => `M${points.map(pt).join(' L')}`;

function boardColorSvg() {
	const rand = makeRandom(2207);
	const traces = [];
	const vias = [];
	const pads = [];

	// Faint copper bundles shadowing the animated data bus.
	for (let i = 0; i < 3; i += 1) {
		traces.push(
			`<path d="${pathOf(FLOW.hddToRam)}" transform="translate(0 ${(i - 1) * 5})" opacity="${0.16 + i * 0.04}"/>`
		);
		traces.push(
			`<path d="${pathOf(FLOW.ramToCache)}" transform="translate(0 ${(i - 1) * 5})" opacity="${0.15 + i * 0.04}"/>`
		);
	}

	const bundles = [
		[
			[-2.32, -1.6],
			[-2.32, -0.2],
			[-1.4, 0.5],
			[0.3, 0.62],
			[0.5, 0.2],
			[0.55, -1.6]
		],
		[
			[-2.32, -2.0],
			[-1.0, -2.25],
			[0.6, -2.2],
			[1.0, -1.9],
			[1.02, -1.4]
		],
		[
			[-0.2, 0.6],
			[0.9, 1.2],
			[1.9, 1.55],
			[2.45, 1.75]
		],
		[
			[-3.05, 2.62],
			[-1.8, 2.72],
			[0.4, 2.78],
			[2.4, 2.7],
			[2.9, 2.4]
		],
		[
			[3.24, 0.1],
			[3.05, -0.9],
			[2.4, -1.75],
			[1.5, -2.1]
		]
	];

	for (const bundle of bundles) {
		for (let i = 0; i < 6; i += 1) {
			traces.push(
				`<path d="${pathOf(bundle)}" transform="translate(${(i - 2.5) * 4} 0)" opacity="${(0.1 + rand() * 0.14).toFixed(3)}"/>`
			);
		}
	}

	for (let i = 0; i < 120; i += 1) {
		const x = 24 + rand() * (W - 48);
		const y = 24 + rand() * (W - 48);
		const edge = Math.min(x, y, W - x, W - y);
		if (edge > 92) continue;
		vias.push(
			`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(2.2 + rand() * 1.5).toFixed(1)}"/>`
		);
	}

	for (let i = 0; i < 26; i += 1) {
		const x = 30 + i * 24;
		pads.push(`<rect x="${x}" y="18" width="14" height="6" rx="2"/>`);
		pads.push(`<rect x="${x}" y="${W - 24}" width="14" height="6" rx="2"/>`);
		pads.push(`<rect x="18" y="${x}" width="6" height="14" rx="2"/>`);
		pads.push(`<rect x="${W - 24}" y="${x}" width="6" height="14" rx="2"/>`);
	}

	const defs = `
		<linearGradient id="board" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0" stop-color="#07130f"/>
			<stop offset=".42" stop-color="#050d0c"/>
			<stop offset="1" stop-color="#030807"/>
		</linearGradient>
		<radialGradient id="cpuGlow" cx=".5" cy=".5" r=".5">
			<stop offset="0" stop-color="#123a32" stop-opacity=".6"/>
			<stop offset=".6" stop-color="#0a211b" stop-opacity=".2"/>
			<stop offset="1" stop-color="#000" stop-opacity="0"/>
		</radialGradient>
		<radialGradient id="ramGlow" cx=".5" cy=".5" r=".5">
			<stop offset="0" stop-color="#0e2c33" stop-opacity=".48"/>
			<stop offset="1" stop-color="#000" stop-opacity="0"/>
		</radialGradient>
		<pattern id="weave" width="18" height="18" patternUnits="userSpaceOnUse">
			<path d="M0 0L18 18M18 0L0 18" stroke="#2a5c4b" stroke-width=".55" opacity=".16"/>
		</pattern>
		<pattern id="microgrid" width="32" height="32" patternUnits="userSpaceOnUse">
			<path d="M32 0H0V32" fill="none" stroke="#235043" stroke-width=".5" opacity=".14"/>
		</pattern>
		<linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0" stop-color="#e8c57a"/>
			<stop offset=".45" stop-color="#a9772f"/>
			<stop offset="1" stop-color="#f0cf8a"/>
		</linearGradient>
		<linearGradient id="gpuSlot" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0" stop-color="#091211"/>
			<stop offset="1" stop-color="#020505"/>
		</linearGradient>
		<filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
			<feGaussianBlur stdDeviation="10"/>
		</filter>
	`;

	const body = `
		<rect width="${W}" height="${W}" fill="url(#board)"/>
		<rect width="${W}" height="${W}" fill="url(#weave)"/>
		<rect width="${W}" height="${W}" fill="url(#microgrid)"/>

		<ellipse cx="${bx(CPU.x)}" cy="${bz(CPU.z)}" rx="190" ry="176" fill="url(#cpuGlow)"/>
		<ellipse cx="${bx(0.8)}" cy="${bz(0.1)}" rx="150" ry="230" fill="url(#ramGlow)"/>

		<!-- copper pours -->
		<g fill="#0a1a15" opacity=".55">
			<rect x="${bx(-3.18)}" y="${bz(-2.1)}" width="120" height="330" rx="18"/>
			<rect x="${bx(1.5)}" y="${bz(-2.4)}" width="150" height="180" rx="14"/>
			<rect x="${bx(-0.9)}" y="${bz(1.5)}" width="230" height="120" rx="14"/>
		</g>

		<!-- bus shadow traces -->
		<g fill="none" stroke="url(#gold)" stroke-width="1.2" stroke-linecap="round" opacity=".62">
			${traces.join('\n')}
		</g>

		<!-- signal bundles -->
		<g fill="none" stroke="#9a7a3e" stroke-width=".9" stroke-linecap="round" opacity=".42">
			${bundles
				.flatMap((bundle) =>
					Array.from({ length: 4 }, (_, i) => `<path d="${pathOf(bundle)}" transform="translate(0 ${(i - 1.5) * 4})"/>`)
				)
				.join('\n')}
		</g>

		<!-- CPU socket keep-out -->
		<rect x="${bx(CPU.x - 1.08)}" y="${bz(CPU.z - 1.08)}" width="${bx(1.08) - bx(-1.08)}" height="${bz(1.08) - bz(-1.08)}" rx="14" fill="#020505" opacity=".86" stroke="#2f4a3d" stroke-width="1.4"/>
		<g fill="none" stroke="#c8a45e" stroke-width="1.2" opacity=".7">
			<path d="M${bx(CPU.x - 1.02)} ${bz(CPU.z - 0.94)}h-16v16"/>
			<path d="M${bx(CPU.x + 1.02)} ${bz(CPU.z - 0.94)}h16v16"/>
			<path d="M${bx(CPU.x - 1.02)} ${bz(CPU.z + 0.94)}h-16v-16"/>
			<path d="M${bx(CPU.x + 1.02)} ${bz(CPU.z + 0.94)}h16v-16"/>
		</g>

		<!-- DIMM keep-outs -->
		<g fill="#020505" opacity=".8">
			${RAM_X.map(
				(x) =>
					`<rect x="${bx(x - 0.11)}" y="${bz(RAM_Z - RAM_LEN / 2 - 0.08)}" width="${bx(0.22) - bx(0)}" height="${bz(RAM_LEN + 0.16) - bz(0)}" rx="6"/>`
			).join('\n')}
		</g>
		<g fill="none" stroke="#8a6a33" stroke-width=".9" opacity=".55">
			${RAM_X.map(
				(x) =>
					`<path d="M${bx(x - 0.1)} ${bz(RAM_Z - RAM_LEN / 2)}v${bz(RAM_LEN) - bz(0)}M${bx(x + 0.1)} ${bz(RAM_Z - RAM_LEN / 2)}v${bz(RAM_LEN) - bz(0)}"/>`
			).join('\n')}
		</g>

		<!-- M.2 keep-out -->
		<rect x="${bx(-1.0)}" y="${bz(2.02)}" width="${bx(2.75) - bx(-1.0)}" height="${bz(0.56) - bz(0)}" rx="8" fill="#020606" opacity=".7" stroke="#26463b" stroke-width="1"/>
		<text x="${bx(-0.94)}" y="${bz(2.5)}" font-family="${MONO}" font-size="9" fill="#7d8f89" letter-spacing="2">M.2 2280</text>

		<!-- PCIe slot -->
		<rect x="${bx(-3.0)}" y="${bz(0.82)}" width="${bx(2.2) - bx(-3.0)}" height="${bz(0.16) - bz(0)}" rx="4" fill="url(#gpuSlot)" stroke="#2c4038"/>
		<rect x="${bx(-2.94)}" y="${bz(0.87)}" width="${bx(2.04) - bx(-2.94)}" height="3" fill="#b08a48" opacity=".6"/>
		<rect x="${bx(2.14)}" y="${bz(0.74)}" width="${bx(0.18) - bx(0)}" height="${bz(0.32) - bz(0)}" rx="4" fill="#0a1412" stroke="#33483f"/>

		<!-- chipset footprint -->
		<rect x="${bx(2.02)}" y="${bz(1.42)}" width="${bx(1.06) - bx(0)}" height="${bz(0.98) - bz(0)}" rx="12" fill="#020505" opacity=".7" stroke="#2f4a3d"/>

		<!-- surface pads -->
		<g fill="url(#gold)" opacity=".8">
			${pads.join('\n')}
		</g>

		<!-- vias -->
		<g fill="#c39a4e" opacity=".66">${vias.join('\n')}</g>

		<!-- mounting holes -->
		<g fill="none" stroke="#c39a4e" stroke-width="2" opacity=".62">
			<circle cx="${bx(-3.36)}" cy="${bz(-2.78)}" r="9"/>
			<circle cx="${bx(3.36)}" cy="${bz(-2.78)}" r="9"/>
			<circle cx="${bx(-3.36)}" cy="${bz(2.78)}" r="9"/>
			<circle cx="${bx(3.36)}" cy="${bz(2.78)}" r="9"/>
		</g>

		<!-- silkscreen -->
		<g font-family="${SANS}" fill="#cfdcd5">
			<text x="${bx(2.12)}" y="${bz(-2.72)}" font-size="22" letter-spacing="7" opacity=".66">MEMORY HIERARCHY</text>
			<text x="${bx(2.12)}" y="${bz(-2.46)}" font-size="10" letter-spacing="3.4" opacity=".46">MQ-02 / LGA-1700 / DDR5</text>
			<text x="${bx(-3.2)}" y="${bz(-2.86)}" font-size="11" letter-spacing="3" opacity=".5">SILICON PATH · MQ-02</text>
		</g>
		<g font-family="${MONO}" fill="#93a49c" opacity=".62">
			<text x="${bx(0.24)}" y="${bz(-1.92)}" font-size="9" letter-spacing="2.4">DIMM A1</text>
			<text x="${bx(1.18)}" y="${bz(-1.92)}" font-size="9" letter-spacing="2.4">DIMM B1</text>
			<text x="${bx(-2.08)}" y="${bz(-1.5)}" font-size="9" letter-spacing="2.4">CPU0 / LGA</text>
			<text x="${bx(2.02)}" y="${bz(0.62)}" font-size="8" letter-spacing="2">CHIPSET</text>
			<text x="${bx(2.7)}" y="${bz(2.9)}" font-size="8" letter-spacing="2">SATA III</text>
			<text x="${bx(-3.16)}" y="${bz(1.98)}" font-size="8" letter-spacing="2">3.5&quot; HDD</text>
			<text x="${bx(3.02)}" y="${bz(-0.2)}" font-size="8" letter-spacing="2" transform="rotate(-90 ${bx(3.02)} ${bz(-0.2)})">24-PIN ATX</text>
			<text x="${bx(3.3)}" y="${bz(2.7)}" font-size="9" letter-spacing="2.4" text-anchor="end">REV 0.4</text>
		</g>

		<g transform="translate(${bx(-3.1)} ${bz(-2.42)})" opacity=".6">
			<path d="M0 22 L22 0 L44 22 L22 44 Z" fill="none" stroke="#d8b66d" stroke-width="1.4"/>
			<circle cx="22" cy="22" r="6" fill="#d8b66d" opacity=".5"/>
		</g>

		<rect x="14" y="14" width="${W - 28}" height="${W - 28}" rx="14" fill="none" stroke="#a17a37" stroke-width="1.2" opacity=".34"/>
	`;

	return { width: W, height: W, defs, body };
}

function boardOrmSvg() {
	const rand = makeRandom(6161);
	const streaks = [];
	for (let i = 0; i < 60; i += 1) {
		const y = rand() * W;
		streaks.push(
			`<path d="M0 ${y.toFixed(1)}H${W}" stroke="rgb(255,${(100 + rand() * 70).toFixed(0)},24)" stroke-width="${(0.6 + rand() * 1.8).toFixed(2)}" opacity=".22"/>`
		);
	}
	const defs = `
		<linearGradient id="mask" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0" stop-color="rgb(255,132,20)"/>
			<stop offset=".5" stop-color="rgb(255,154,22)"/>
			<stop offset="1" stop-color="rgb(255,126,18)"/>
		</linearGradient>
	`;
	const body = `
		<rect width="${W}" height="${W}" fill="url(#mask)"/>
		${streaks.join('\n')}
		<g fill="none" stroke="rgb(255,92,44)" stroke-width="2" opacity=".5">
			<path d="${pathOf(FLOW.hddToRam)}"/>
			<path d="${pathOf(FLOW.ramToCache)}"/>
		</g>
		<g fill="rgb(255,70,150)" opacity=".4">
			<circle cx="${bx(CPU.x)}" cy="${bz(CPU.z)}" r="120"/>
			<circle cx="${bx(CPU.x) + 30}" cy="${bz(CPU.z) + 20}" r="90"/>
		</g>
		<rect x="14" y="14" width="${W - 28}" height="${W - 28}" rx="14" fill="none" stroke="rgb(255,200,60)" stroke-width="4"/>
	`;
	return { width: W, height: W, defs, body };
}

function ramLabelSvg() {
	const w = 1024;
	const h = 192;
	const defs = `
		<linearGradient id="ramPlate" x1="0" y1="0" x2="1" y2="0">
			<stop offset="0" stop-color="#0a0f11"/>
			<stop offset=".48" stop-color="#101a1d"/>
			<stop offset="1" stop-color="#080d0f"/>
		</linearGradient>
		<linearGradient id="ramRule" x1="0" y1="0" x2="1" y2="0">
			<stop offset="0" stop-color="#7fd8d0" stop-opacity="0"/>
			<stop offset=".5" stop-color="#7fd8d0" stop-opacity=".85"/>
			<stop offset="1" stop-color="#7fd8d0" stop-opacity="0"/>
		</linearGradient>
	`;
	const body = `
		<rect width="${w}" height="${h}" fill="url(#ramPlate)"/>
		<rect x="0" y="0" width="${w}" height="3" fill="url(#ramRule)" opacity=".5"/>
		<rect x="0" y="${h - 3}" width="${w}" height="3" fill="url(#ramRule)" opacity=".5"/>
		<g font-family="${MONO}" fill="#8b9c99" opacity=".72">
			<text x="34" y="42" font-size="11" letter-spacing="4">SILICON PATH</text>
			<text x="${w - 34}" y="42" font-size="10" letter-spacing="3" text-anchor="end">DDR5 / UDIMM</text>
		</g>
		<text x="34" y="126" font-family="${SANS}" font-size="62" font-weight="300" letter-spacing="9" fill="#e7efeb">DDR5-6400</text>
		<g font-family="${MONO}" fill="#b7c5c0" opacity=".8">
			<text x="34" y="164" font-size="15" letter-spacing="3.4">32 GB · CL32 · 1.35 V</text>
			<text x="${w - 34}" y="164" font-size="11" letter-spacing="3" text-anchor="end">XMP 3.0</text>
		</g>
		<g fill="#7fd8d0" opacity=".7">
			<rect x="${w - 150}" y="84" width="116" height="2"/>
			<rect x="${w - 150}" y="96" width="76" height="2"/>
			<rect x="${w - 150}" y="108" width="96" height="2"/>
		</g>
		<g fill="none" stroke="#c6a15c" stroke-width="1" opacity=".55">
			<path d="M${w - 300} 70h-40v60h40"/>
		</g>
	`;
	return { width: w, height: h, defs, body };
}

function ssdLabelSvg() {
	const w = 1024;
	const h = 256;
	const defs = `
		<linearGradient id="ssdPlate" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0" stop-color="#0c1216"/>
			<stop offset=".55" stop-color="#0a1518"/>
			<stop offset="1" stop-color="#070d10"/>
		</linearGradient>
		<pattern id="ssdGrid" width="22" height="11" patternUnits="userSpaceOnUse">
			<path d="M0 5.5H22" stroke="#2c5c58" stroke-width=".6" opacity=".24"/>
		</pattern>
		<linearGradient id="ssdRule" x1="0" y1="0" x2="1" y2="0">
			<stop offset="0" stop-color="#7fd8d0" stop-opacity=".9"/>
			<stop offset=".7" stop-color="#7fd8d0" stop-opacity=".1"/>
			<stop offset="1" stop-color="#7fd8d0" stop-opacity="0"/>
		</linearGradient>
	`;
	const body = `
		<rect width="${w}" height="${h}" fill="url(#ssdPlate)"/>
		<rect width="${w}" height="${h}" fill="url(#ssdGrid)"/>
		<path d="M0 196H${w}V${h}H0Z" fill="#081012"/>
		<rect x="0" y="193" width="${w}" height="2" fill="url(#ssdRule)"/>
		<g font-family="${MONO}" fill="#8b9c99" opacity=".7">
			<text x="40" y="52" font-size="12" letter-spacing="4.6">SILICON PATH / STORAGE</text>
			<text x="${w - 40}" y="52" font-size="11" letter-spacing="3" text-anchor="end">M.2 2280</text>
		</g>
		<text x="40" y="140" font-family="${SANS}" font-size="66" font-weight="300" letter-spacing="4" fill="#eef4f1">NVMe 2 TB</text>
		<g font-family="${MONO}" fill="#b7c5c0" opacity=".82">
			<text x="42" y="182" font-size="16" letter-spacing="3.2">PCIe 4.0 ×4 · 7 400 MB/s</text>
			<text x="${w - 40}" y="182" font-size="11" letter-spacing="3" text-anchor="end">QLC · AES-256</text>
		</g>
		<g opacity=".62">
			<path d="M${w - 280} 92h90l26 26h54" fill="none" stroke="#7fd8d0" stroke-width="1.4"/>
			<circle cx="${w - 280}" cy="92" r="5" fill="#7fd8d0"/>
			<circle cx="${w - 110}" cy="118" r="5" fill="#d8b36a"/>
		</g>
		<g fill="#d8b36a" opacity=".5" font-family="${MONO}" font-size="9" letter-spacing="2">
			<text x="${w - 40}" y="232" text-anchor="end">SN 02-7A4F-1C</text>
		</g>
	`;
	return { width: w, height: h, defs, body };
}

function hddLabelSvg() {
	const w = 512;
	const defs = `
		<radialGradient id="platter" cx=".5" cy=".45" r=".55">
			<stop offset="0" stop-color="#202427"/>
			<stop offset=".55" stop-color="#14181a"/>
			<stop offset=".86" stop-color="#0d1112"/>
			<stop offset="1" stop-color="#050708"/>
		</radialGradient>
		<linearGradient id="hddPlate" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0" stop-color="#24282a"/>
			<stop offset=".5" stop-color="#171b1d"/>
			<stop offset="1" stop-color="#222628"/>
		</linearGradient>
		<linearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0" stop-color="#c8a45e"/>
			<stop offset=".5" stop-color="#6f5324"/>
			<stop offset="1" stop-color="#d8b66d"/>
		</linearGradient>
	`;
	const body = `
		<rect width="${w}" height="${w}" fill="url(#hddPlate)"/>
		<circle cx="256" cy="240" r="186" fill="url(#platter)"/>
		<circle cx="256" cy="240" r="186" fill="none" stroke="url(#ring)" stroke-width="2" opacity=".6"/>
		<circle cx="256" cy="240" r="150" fill="none" stroke="#3b4245" stroke-width="1" opacity=".7"/>
		<circle cx="256" cy="240" r="112" fill="none" stroke="#333a3c" stroke-width="1" opacity=".55"/>
		<circle cx="256" cy="240" r="26" fill="#0a0e10" stroke="#6a5a35" stroke-width="2"/>
		<circle cx="256" cy="240" r="7" fill="#c8a45e" opacity=".7"/>
		<g fill="none" stroke="#d7b36a" stroke-width="1" opacity=".4">
			<path d="M256 62v36M256 382v36M78 240h36M398 240h36"/>
		</g>
		<g text-anchor="middle" font-family="${SANS}" fill="#dbe3df">
			<text x="256" y="132" font-size="19" letter-spacing="5" opacity=".82">SILICON PATH</text>
			<text x="256" y="154" font-size="8.5" letter-spacing="3.4" fill="#8fa09b">MASS STORAGE</text>
			<text x="256" y="336" font-size="25" letter-spacing="2" opacity=".9">3.5&quot; HDD</text>
			<text x="256" y="360" font-size="9.5" letter-spacing="3" fill="#9aaba6">7 200 RPM · 256 MB · SATA III</text>
		</g>
		<g font-family="${MONO}" fill="#94a49f" opacity=".6" font-size="8" letter-spacing="2">
			<text x="28" y="480">MQ-02 / HDD-0</text>
			<text x="${w - 28}" y="480" text-anchor="end">MODEL SP-35</text>
		</g>
	`;
	return { width: w, height: w, defs, body };
}

function dieColorSvg() {
	const w = 512;
	const rand = makeRandom(9042);
	const cells = [];
	const traces = [];
	for (let i = 0; i < 46; i += 1) {
		const x = 46 + rand() * 420;
		const y = 46 + rand() * 420;
		const width = 12 + rand() * 54;
		const height = 8 + rand() * 38;
		const color = ['#3b7e9a', '#6e4c9c', '#2f6c68', '#9a7b3a'][i % 4];
		cells.push(
			`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${width.toFixed(1)}" height="${height.toFixed(1)}" rx="2" fill="${color}" fill-opacity="${(0.05 + rand() * 0.08).toFixed(3)}" stroke="${color}" stroke-width=".5" stroke-opacity=".16"/>`
		);
		traces.push(
			`<path d="M${x.toFixed(1)} ${y.toFixed(1)}h${(width * 0.65).toFixed(1)}v${(height * 0.55).toFixed(1)}" stroke="#d7b36a" stroke-width=".55" opacity=".3"/>`
		);
	}
	const defs = `
		<linearGradient id="silicon" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0" stop-color="#061226"/>
			<stop offset=".3" stop-color="#122844"/>
			<stop offset=".52" stop-color="#2f2050"/>
			<stop offset=".74" stop-color="#103441"/>
			<stop offset="1" stop-color="#050b19"/>
		</linearGradient>
		<linearGradient id="irid" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0" stop-color="#6ce8d4" stop-opacity=".2"/>
			<stop offset=".35" stop-color="#577dff" stop-opacity=".05"/>
			<stop offset=".6" stop-color="#d85cff" stop-opacity=".14"/>
			<stop offset="1" stop-color="#69f1dc" stop-opacity=".12"/>
		</linearGradient>
		<pattern id="bumps" width="14" height="14" patternUnits="userSpaceOnUse">
			<circle cx="7" cy="7" r="1.7" fill="#b6934e" opacity=".26"/>
		</pattern>
		<pattern id="dieGrid" width="26" height="26" patternUnits="userSpaceOnUse">
			<path d="M26 0H0V26" fill="none" stroke="#8e7bb4" stroke-width=".45" opacity=".16"/>
		</pattern>
		<filter id="cacheGlow">
			<feGaussianBlur stdDeviation="3.2" result="blur"/>
			<feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
		</filter>
	`;
	const cx = 256;
	const cy = 256;
	const body = `
		<rect width="${w}" height="${w}" fill="url(#silicon)"/>
		<rect width="${w}" height="${w}" fill="url(#irid)"/>
		<rect width="${w}" height="${w}" fill="url(#bumps)"/>
		<rect width="${w}" height="${w}" fill="url(#dieGrid)"/>
		<g>${cells.join('\n')}</g>
		<g fill="none">${traces.join('\n')}</g>
		<circle cx="${cx}" cy="${cy}" r="371" fill="none" stroke="#7fd8d0" stroke-width="10" opacity=".26" filter="url(#cacheGlow)"/>
		<circle cx="${cx}" cy="${cy}" r="368" fill="none" stroke="#c6a15c" stroke-width="2.4" opacity=".5"/>
		<g fill="none" stroke="#8bd4cf" stroke-width="1" opacity=".55">
			<path d="M${cx - 368} ${cy - 30}h34M${cx + 368} ${cy - 30}h-34M${cx - 368} ${cy + 30}h34M${cx + 368} ${cy + 30}h-34"/>
		</g>
		<g transform="translate(${cx} ${cy})">
			<rect x="-66" y="-66" width="132" height="132" rx="12" fill="#0a1720" stroke="#7fd8d0" stroke-width="2" opacity=".95"/>
			<rect x="-48" y="-48" width="96" height="96" rx="8" fill="none" stroke="#d8b66d" stroke-width="1.2" opacity=".7"/>
			<g fill="#9fe8e1" opacity=".8">
				<rect x="-26" y="-26" width="52" height="8" rx="2"/>
				<rect x="-26" y="-6" width="52" height="8" rx="2"/>
				<rect x="-26" y="14" width="52" height="8" rx="2"/>
			</g>
		</g>
		<!-- four cores -->
		<g fill="none" stroke="#9a7fd0" stroke-width="1.4" opacity=".5">
			<rect x="76" y="76" width="150" height="150" rx="8"/>
			<rect x="286" y="76" width="150" height="150" rx="8"/>
			<rect x="76" y="286" width="150" height="150" rx="8"/>
			<rect x="286" y="286" width="150" height="150" rx="8"/>
		</g>
		<g font-family="${MONO}" fill="#cfe6e1" opacity=".62">
			<text x="256" y="46" font-size="10" letter-spacing="6" text-anchor="middle">MQ-02 · COMPUTE</text>
			<text x="256" y="478" font-size="9" letter-spacing="4" text-anchor="middle">CACHE / REGISTER COMPLEX</text>
		</g>
		<g fill="#f3d18b" opacity=".6">
			<circle cx="60" cy="60" r="4"/><circle cx="452" cy="60" r="4"/>
			<circle cx="60" cy="452" r="4"/><circle cx="452" cy="452" r="4"/>
		</g>
	`;
	return { width: w, height: w, defs, body };
}

function lgaColorSvg() {
	const w = 512;
	const pads = [];
	const grid = 27;
	for (let y = grid / 2; y < w; y += grid) {
		for (let x = grid / 2; x < w; x += grid) {
			pads.push(`<circle cx="${x}" cy="${y}" r="7.4"/>`);
			pads.push(`<circle cx="${x}" cy="${y}" r="4.4" fill="#f5dc9e" opacity=".8"/>`);
		}
	}
	const defs = `
		<radialGradient id="pad" cx=".38" cy=".32" r=".72">
			<stop offset="0" stop-color="#ffe5a4"/>
			<stop offset=".36" stop-color="#d6a64c"/>
			<stop offset=".8" stop-color="#8c5f21"/>
			<stop offset="1" stop-color="#4d3210"/>
		</radialGradient>
		<pattern id="grid" width="27" height="27" patternUnits="userSpaceOnUse">
			<path d="M27 0H0V27" fill="none" stroke="#3d3529" stroke-width=".6" opacity=".35"/>
		</pattern>
	`;
	const body = `
		<rect width="${w}" height="${w}" fill="#070a09"/>
		<rect width="${w}" height="${w}" fill="url(#grid)"/>
		<g fill="url(#pad)" opacity=".9">${pads.join('\n')}</g>
		<g fill="none" stroke="#7b642e" stroke-width="1.2" opacity=".4">
			<rect x="12" y="12" width="${w - 24}" height="${w - 24}" rx="8"/>
		</g>
		<g fill="#bda15e" opacity=".55">
			<path d="M34 34l26 0l-26 26z"/>
		</g>
		<text x="256" y="272" font-family="${MONO}" font-size="8" text-anchor="middle" letter-spacing="5" fill="#bda15e" opacity=".6">LGA-1700</text>
	`;
	return { width: w, height: w, defs, body };
}

const textureDefs = [
	{ key: 'boardColor', name: 'memory-board-color', ...boardColorSvg() },
	{ key: 'boardOrm', name: 'memory-board-orm', ...boardOrmSvg() },
	{ key: 'ramLabel', name: 'memory-ram-label', ...ramLabelSvg() },
	{ key: 'ssdLabel', name: 'memory-ssd-label', ...ssdLabelSvg() },
	{ key: 'hddLabel', name: 'memory-hdd-label', ...hddLabelSvg() },
	{ key: 'dieColor', name: 'memory-die-color', ...dieColorSvg() },
	{ key: 'lgaColor', name: 'memory-lga-color', ...lgaColorSvg() }
];

console.log('› Generating memory-board textures...');
const textureBuffers = {};
for (const tex of textureDefs) {
	textureBuffers[tex.key] = await renderTexture(tex.name, tex.width, tex.height, tex.defs, tex.body);
	console.log(`  · ${tex.name}.png (${tex.width}×${tex.height})`);
}

/* -------------------------------------------------------------------------- */
/* Geometry helpers                                                           */
/* -------------------------------------------------------------------------- */

const roundBox = (w, h, d, radius = 0.03, segments = 4) =>
	new RoundedBoxGeometry(w, h, d, segments, Math.min(radius, Math.min(w, h, d) * 0.24));

function flipV(geometry) {
	const uv = geometry.getAttribute('uv');
	for (let i = 0; i < uv.count; i += 1) uv.setY(i, 1 - uv.getY(i));
	uv.needsUpdate = true;
	return geometry;
}

function horizontalPlane(w, d, faceDown = false) {
	const geometry = new THREE.PlaneGeometry(w, d);
	geometry.rotateX(faceDown ? Math.PI / 2 : -Math.PI / 2);
	return flipV(geometry);
}

function verticalPlane(w, h, faceX = 1) {
	const geometry = new THREE.PlaneGeometry(w, h);
	if (faceX < 0) geometry.rotateY(-Math.PI / 2);
	else geometry.rotateY(Math.PI / 2);
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

function mergePieces(pieces) {
	const geometries = pieces.map((piece) =>
		piece.geometry.index ? piece.geometry.toNonIndexed() : piece.geometry
	);
	return mergeGeometries(geometries, false);
}

const parts = new Map();

function part(name) {
	const item = { name, pieces: [] };
	parts.set(name, item);
	return item;
}

function piece(parent, geometry, material, transform) {
	parent.pieces.push({ geometry: applyTransform(geometry, transform), material });
}

function mergedPiece(parent, pieces, material) {
	const merged = mergePieces(pieces.map((geometry) => ({ geometry })));
	parent.pieces.push({ geometry: merged, material });
}

function curveFrom(points, closed = false) {
	return new THREE.CatmullRomCurve3(
		points.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
		closed,
		'centripetal',
		0.5
	);
}

/* -------------------------------------------------------------------------- */
/* Document + materials                                                       */
/* -------------------------------------------------------------------------- */

const doc = new Document();
doc.createExtension(KHRMaterialsIridescence).setRequired(true);
const buffer = doc.createBuffer();
const scene = doc.createScene('Memory hierarchy');

function texture(key, name) {
	return doc
		.createTexture(name)
		.setImage(textureBuffers[key])
		.setMimeType('image/png')
		.setURI(`${name}.png`);
}

const textures = {
	boardColor: texture('boardColor', 'memory-board-color'),
	boardOrm: texture('boardOrm', 'memory-board-orm'),
	ramLabel: texture('ramLabel', 'memory-ram-label'),
	ssdLabel: texture('ssdLabel', 'memory-ssd-label'),
	hddLabel: texture('hddLabel', 'memory-hdd-label'),
	dieColor: texture('dieColor', 'memory-die-color'),
	lgaColor: texture('lgaColor', 'memory-lga-color')
};

const materials = {};

materials.boardEdge = doc
	.createMaterial('Board edge')
	.setBaseColorFactor([0.022, 0.045, 0.038, 1])
	.setMetallicFactor(0.12)
	.setRoughnessFactor(0.58);

materials.boardTop = doc
	.createMaterial('Solder mask')
	.setBaseColorTexture(textures.boardColor)
	.setMetallicRoughnessTexture(textures.boardOrm)
	.setMetallicFactor(1)
	.setRoughnessFactor(1);

materials.boardBottom = doc
	.createMaterial('Board underside')
	.setBaseColorFactor([0.016, 0.026, 0.022, 1])
	.setMetallicFactor(0.1)
	.setRoughnessFactor(0.7);

materials.socketPlastic = doc
	.createMaterial('Socket plastic')
	.setBaseColorFactor([0.028, 0.03, 0.032, 1])
	.setMetallicFactor(0.16)
	.setRoughnessFactor(0.46);

materials.socketMetal = doc
	.createMaterial('Socket steel')
	.setBaseColorFactor([0.44, 0.46, 0.48, 1])
	.setMetallicFactor(1)
	.setRoughnessFactor(0.3);

materials.gold = doc
	.createMaterial('ENIG gold')
	.setBaseColorFactor([0.77, 0.56, 0.24, 1])
	.setMetallicFactor(1)
	.setRoughnessFactor(0.24);

materials.lga = doc
	.createMaterial('LGA contacts')
	.setBaseColorTexture(textures.lgaColor)
	.setMetallicFactor(1)
	.setRoughnessFactor(0.3);

materials.dieSilicon = doc
	.createMaterial('Silicon')
	.setBaseColorFactor([0.1, 0.13, 0.2, 1])
	.setMetallicFactor(0.7)
	.setRoughnessFactor(0.22);

materials.dieTop = doc
	.createMaterial('Silicon floorplan')
	.setBaseColorTexture(textures.dieColor)
	.setMetallicFactor(0.85)
	.setRoughnessFactor(0.28);

materials.underfill = doc
	.createMaterial('Underfill epoxy')
	.setBaseColorFactor([0.02, 0.019, 0.017, 1])
	.setMetallicFactor(0.04)
	.setRoughnessFactor(0.5);

materials.cacheGlow = doc
	.createMaterial('L3 cache')
	.setBaseColorFactor([0.03, 0.1, 0.1, 1])
	.setMetallicFactor(0.55)
	.setRoughnessFactor(0.24)
	.setEmissiveFactor([0.14, 0.52, 0.49]);

materials.registerGlow = doc
	.createMaterial('Register file')
	.setBaseColorFactor([0.1, 0.08, 0.03, 1])
	.setMetallicFactor(0.85)
	.setRoughnessFactor(0.2)
	.setEmissiveFactor([0.62, 0.46, 0.18]);

materials.bus = doc
	.createMaterial('Data bus')
	.setBaseColorFactor([0.02, 0.07, 0.068, 1])
	.setMetallicFactor(0.25)
	.setRoughnessFactor(0.38)
	.setEmissiveFactor([0.05, 0.2, 0.19]);

materials.ramPcb = doc
	.createMaterial('DIMM PCB')
	.setBaseColorFactor([0.015, 0.035, 0.03, 1])
	.setMetallicFactor(0.12)
	.setRoughnessFactor(0.55);

materials.ramMetal = doc
	.createMaterial('DIMM heatspreader')
	.setBaseColorFactor([0.16, 0.175, 0.18, 1])
	.setMetallicFactor(0.95)
	.setRoughnessFactor(0.3);

materials.ramDark = doc
	.createMaterial('DIMM inset')
	.setBaseColorFactor([0.04, 0.05, 0.052, 1])
	.setMetallicFactor(0.7)
	.setRoughnessFactor(0.42);

materials.ramLabel = doc
	.createMaterial('DIMM label')
	.setBaseColorTexture(textures.ramLabel)
	.setMetallicFactor(0.35)
	.setRoughnessFactor(0.42);

materials.slotPlastic = doc
	.createMaterial('DIMM slot')
	.setBaseColorFactor([0.03, 0.034, 0.036, 1])
	.setMetallicFactor(0.14)
	.setRoughnessFactor(0.5);

materials.latch = doc
	.createMaterial('DIMM latch')
	.setBaseColorFactor([0.55, 0.57, 0.56, 1])
	.setMetallicFactor(0.1)
	.setRoughnessFactor(0.5);

materials.ssdPcb = doc
	.createMaterial('M.2 PCB')
	.setBaseColorFactor([0.012, 0.03, 0.034, 1])
	.setMetallicFactor(0.18)
	.setRoughnessFactor(0.48);

materials.ssdLabel = doc
	.createMaterial('M.2 label')
	.setBaseColorTexture(textures.ssdLabel)
	.setMetallicFactor(0.3)
	.setRoughnessFactor(0.4);

materials.chip = doc
	.createMaterial('NAND package')
	.setBaseColorFactor([0.035, 0.038, 0.04, 1])
	.setMetallicFactor(0.2)
	.setRoughnessFactor(0.36);

materials.hddMetal = doc
	.createMaterial('HDD aluminium')
	.setBaseColorFactor([0.24, 0.255, 0.265, 1])
	.setMetallicFactor(0.92)
	.setRoughnessFactor(0.36);

materials.hddDark = doc
	.createMaterial('HDD chassis')
	.setBaseColorFactor([0.05, 0.055, 0.058, 1])
	.setMetallicFactor(0.6)
	.setRoughnessFactor(0.44);

materials.hddLabel = doc
	.createMaterial('HDD label')
	.setBaseColorTexture(textures.hddLabel)
	.setMetallicFactor(0.35)
	.setRoughnessFactor(0.44);

materials.hddLed = doc
	.createMaterial('HDD activity LED')
	.setBaseColorFactor([0.1, 0.03, 0.02, 1])
	.setMetallicFactor(0.2)
	.setRoughnessFactor(0.3)
	.setEmissiveFactor([0.86, 0.3, 0.12]);

materials.heatsink = doc
	.createMaterial('Chipset heatsink')
	.setBaseColorFactor([0.42, 0.44, 0.46, 1])
	.setMetallicFactor(0.95)
	.setRoughnessFactor(0.3);

materials.ceramic = doc
	.createMaterial('Capacitor ceramic')
	.setBaseColorFactor([0.045, 0.042, 0.036, 1])
	.setMetallicFactor(0.08)
	.setRoughnessFactor(0.5);

materials.silver = doc
	.createMaterial('Solder silver')
	.setBaseColorFactor([0.62, 0.64, 0.66, 1])
	.setMetallicFactor(1)
	.setRoughnessFactor(0.38);

materials.ioShield = doc
	.createMaterial('I/O shield')
	.setBaseColorFactor([0.34, 0.36, 0.38, 1])
	.setMetallicFactor(0.9)
	.setRoughnessFactor(0.34);

materials.portDark = doc
	.createMaterial('Port aperture')
	.setBaseColorFactor([0.008, 0.009, 0.01, 1])
	.setMetallicFactor(0.2)
	.setRoughnessFactor(0.62);

const iridescence = doc.createExtension(KHRMaterialsIridescence);
const dieIridescence = iridescence
	.createIridescence()
	.setIridescenceFactor(0.5)
	.setIridescenceIOR(1.4)
	.setIridescenceThicknessMinimum(100)
	.setIridescenceThicknessMaximum(400);
materials.dieSilicon.setExtension('KHR_materials_iridescence', dieIridescence);

/* -------------------------------------------------------------------------- */
/* Motherboard                                                                */
/* -------------------------------------------------------------------------- */

const motherboard = part('motherboard');
piece(motherboard, roundBox(BOARD.w, BOARD.t, BOARD.d, 0.05, 5), materials.boardEdge);
piece(motherboard, horizontalPlane(BOARD.w - 0.08, BOARD.d - 0.08), materials.boardTop, {
	position: [0, 0.0905, 0]
});
piece(motherboard, horizontalPlane(BOARD.w - 0.08, BOARD.d - 0.08, true), materials.boardBottom, {
	position: [0, -0.0905, 0]
});

// Mounting holes: gold ring over a dark drilled pad.
const mountRings = [];
const mountHoles = [];
for (const x of [-3.36, 3.36]) {
	for (const z of [-2.78, 2.78]) {
		mountRings.push(
			applyTransform(new THREE.TorusGeometry(0.09, 0.012, 6, 28), {
				position: [x, 0.094, z],
				rotation: [-Math.PI / 2, 0, 0]
			})
		);
		mountHoles.push(
			applyTransform(new THREE.CylinderGeometry(0.075, 0.075, 0.012, 20), {
				position: [x, 0.092, z]
			})
		);
	}
}
mergedPiece(motherboard, mountRings, materials.gold);
mergedPiece(motherboard, mountHoles, materials.portDark);

// Rear I/O shield with port apertures.
piece(motherboard, roundBox(0.14, 0.52, 1.9, 0.03, 3), materials.ioShield, {
	position: [-3.52, 0.34, -1.9]
});
const ports = [];
const usbA = [];
for (let i = 0; i < 6; i += 1) {
	ports.push(
		applyTransform(new THREE.BoxGeometry(0.02, 0.13, 0.24), {
			position: [-3.44, 0.4, -2.62 + i * 0.27]
		})
	);
}
ports.push(
	applyTransform(new THREE.BoxGeometry(0.02, 0.16, 0.3), {
		position: [-3.44, 0.42, -0.88]
	})
);
mergedPiece(motherboard, ports, materials.portDark);
for (let i = 0; i < 3; i += 1) {
	usbA.push(
		applyTransform(new THREE.BoxGeometry(0.01, 0.09, 0.16), {
			position: [-3.429, 0.4, -2.6 + i * 0.27]
		})
	);
}
mergedPiece(motherboard, usbA, materials.silver);

// 24-pin ATX block with gold pins.
piece(motherboard, roundBox(0.34, 0.36, 1.18, 0.02, 3), materials.socketPlastic, {
	position: [3.3, 0.27, 0.72]
});
const pins = [];
for (let row = 0; row < 2; row += 1) {
	for (let i = 0; i < 12; i += 1) {
		pins.push(
			applyTransform(new THREE.BoxGeometry(0.11, 0.01, 0.055), {
				position: [3.16 + row * 0.28, 0.452, 0.22 + i * 0.09]
			})
		);
	}
}
mergedPiece(motherboard, pins, materials.gold);

// SATA ports.
for (let i = 0; i < 2; i += 1) {
	piece(motherboard, roundBox(0.52, 0.24, 0.24, 0.02, 3), materials.socketPlastic, {
		position: [2.86, 0.2, 2.38 + i * 0.34]
	});
}
const sataPins = [];
for (let i = 0; i < 2; i += 1) {
	for (let j = 0; j < 4; j += 1) {
		sataPins.push(
			applyTransform(new THREE.BoxGeometry(0.004, 0.02, 0.03), {
				position: [2.6, 0.24, 2.3 + i * 0.34 + j * 0.04]
			})
		);
	}
}
mergedPiece(motherboard, sataPins, materials.gold);

// PCIe x16 slot with contacts and retention clip.
piece(motherboard, new THREE.BoxGeometry(2.5, 0.13, 0.17), materials.slotPlastic, {
	position: [-0.42, 0.145, 0.9]
});
piece(motherboard, new THREE.BoxGeometry(2.3, 0.012, 0.1), materials.gold, {
	position: [-0.52, 0.212, 0.9]
});
piece(motherboard, roundBox(0.18, 0.3, 0.26, 0.02, 3), materials.socketPlastic, {
	position: [0.92, 0.2, 0.9]
});

// VRM chokes and capacitors around the socket.
const chokes = [];
const chokeTops = [];
for (let i = 0; i < 5; i += 1) {
	const x = -2.62;
	const z = -1.62 + i * 0.46;
	chokes.push(
		applyTransform(roundBox(0.34, 0.22, 0.34, 0.03, 3), { position: [x, 0.2, z] })
	);
	chokeTops.push(
		applyTransform(new THREE.BoxGeometry(0.26, 0.01, 0.26), { position: [x, 0.312, z] })
	);
}
mergedPiece(motherboard, chokes, materials.hddDark);
mergedPiece(motherboard, chokeTops, materials.silver);

const caps = [];
const capTops = [];
const capSpots = [
	[-2.15, 1.62],
	[-1.75, 1.62],
	[-1.35, 1.62],
	[-0.5, -2.3],
	[-0.1, -2.3],
	[0.3, -2.3],
	[2.15, -2.3],
	[2.55, -2.3]
];
for (const [x, z] of capSpots) {
	caps.push(
		applyTransform(new THREE.CylinderGeometry(0.075, 0.075, 0.13, 20), {
			position: [x, 0.16, z]
		})
	);
	capTops.push(
		applyTransform(new THREE.CylinderGeometry(0.068, 0.068, 0.012, 20), {
			position: [x, 0.229, z]
		})
	);
}
mergedPiece(motherboard, caps, materials.ceramic);
mergedPiece(motherboard, capTops, materials.silver);

// Fan header.
piece(motherboard, roundBox(0.22, 0.12, 0.12, 0.015, 3), materials.latch, {
	position: [2.5, 0.16, -2.52]
});
const fanPins = [];
for (let i = 0; i < 4; i += 1) {
	fanPins.push(
		applyTransform(new THREE.BoxGeometry(0.02, 0.02, 0.02), {
			position: [2.44 + i * 0.04, 0.228, -2.52]
		})
	);
}
mergedPiece(motherboard, fanPins, materials.gold);

/* -------------------------------------------------------------------------- */
/* Socket + CPU                                                               */
/* -------------------------------------------------------------------------- */

const socket = part('socket');
piece(socket, roundBox(2.14, 0.1, 2.14, 0.02, 4), materials.socketPlastic, {
	position: [CPU.x, 0.14, CPU.z]
});
piece(socket, new THREE.PlaneGeometry(1.9, 1.9), materials.lga, {
	position: [CPU.x, 0.192, CPU.z],
	rotation: [-Math.PI / 2, 0, 0]
});
const lgaFlip = socket.pieces[socket.pieces.length - 1];
lgaFlip.geometry = flipV(applyTransform(new THREE.PlaneGeometry(1.9, 1.9), { rotation: [-Math.PI / 2, 0, 0] }));

const frame = [];
for (const offset of [-0.99, 0.99]) {
	frame.push(
		applyTransform(new THREE.BoxGeometry(0.07, 0.075, 2.2), {
			position: [CPU.x + offset, 0.225, CPU.z]
		})
	);
	frame.push(
		applyTransform(new THREE.BoxGeometry(2.2, 0.075, 0.07), {
			position: [CPU.x, 0.225, CPU.z + offset]
		})
	);
}
mergedPiece(socket, frame, materials.socketMetal);

piece(socket, new THREE.CylinderGeometry(0.022, 0.022, 1.5, 12), materials.socketMetal, {
	position: [CPU.x + 1.06, 0.26, CPU.z],
	rotation: [Math.PI / 2, 0, 0]
});
piece(socket, new THREE.CylinderGeometry(0.018, 0.018, 0.34, 10), materials.socketMetal, {
	position: [CPU.x + 1.06, 0.32, CPU.z + 0.86],
	rotation: [0, 0, Math.PI / 2.4]
});

const cpu = part('cpu');
piece(cpu, roundBox(1.62, 0.08, 1.62, 0.02, 3), materials.underfill, {
	position: [CPU.x, 0.232, CPU.z]
});
piece(cpu, roundBox(1.42, 0.07, 1.42, 0.018, 3), materials.dieSilicon, {
	position: [CPU.x, 0.296, CPU.z]
});
piece(cpu, horizontalPlane(1.36, 1.36), materials.dieTop, {
	position: [CPU.x, 0.3335, CPU.z]
});

// Four core tiles + gold edge contacts.
const coreTiles = [];
for (const x of [-0.24, 0.24]) {
	for (const z of [-0.24, 0.24]) {
		coreTiles.push(
			applyTransform(roundBox(0.22, 0.018, 0.22, 0.006, 2), {
				position: [CPU.x + x, 0.345, CPU.z + z]
			})
		);
	}
}
mergedPiece(cpu, coreTiles, materials.dieSilicon);
const dieGold = [];
for (let i = 0; i < 12; i += 1) {
	const t = -0.62 + i * 0.113;
	dieGold.push(
		applyTransform(new THREE.BoxGeometry(0.022, 0.005, 0.055), {
			position: [CPU.x + t, 0.337, CPU.z + 0.69]
		})
	);
	dieGold.push(
		applyTransform(new THREE.BoxGeometry(0.022, 0.005, 0.055), {
			position: [CPU.x + t, 0.337, CPU.z - 0.69]
		})
	);
}
mergedPiece(cpu, dieGold, materials.gold);

const cachePart = part('cpu-cache');
piece(cachePart, new THREE.TorusGeometry(L3.radius, 0.016, 8, 128), materials.cacheGlow, {
	position: [L3.x, 0.351, L3.z],
	rotation: [-Math.PI / 2, 0, 0]
});
const cacheTiles = [];
for (let i = 0; i < 4; i += 1) {
	const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
	cacheTiles.push(
		applyTransform(new THREE.BoxGeometry(0.11, 0.014, 0.11), {
			position: [
				L3.x + Math.cos(angle) * L3.radius,
				0.35,
				L3.z + Math.sin(angle) * L3.radius
			]
		})
	);
}
mergedPiece(cachePart, cacheTiles, materials.gold);

const registerPart = part('cpu-registers');
piece(registerPart, new THREE.CylinderGeometry(0.11, 0.11, 0.014, 36), materials.registerGlow, {
	position: [CPU.x, 0.348, CPU.z]
});
piece(registerPart, new THREE.TorusGeometry(0.142, 0.007, 6, 44), materials.gold, {
	position: [CPU.x, 0.354, CPU.z],
	rotation: [-Math.PI / 2, 0, 0]
});

/* -------------------------------------------------------------------------- */
/* DIMMs                                                                      */
/* -------------------------------------------------------------------------- */

function buildDimm(name, x) {
	const dimm = part(name);
	const z = RAM_Z;
	const top = RAM_TOP;

	// Slot with latches.
	piece(dimm, roundBox(0.16, 0.14, RAM_LEN + 0.18, 0.02, 3), materials.slotPlastic, {
		position: [x, 0.16, z]
	});
	for (const end of [-1, 1]) {
		piece(
			dimm,
			roundBox(0.19, 0.2, 0.12, 0.02, 3),
			materials.latch,
			{
				position: [x, 0.18, z + end * (RAM_LEN / 2 + 0.12)]
			}
		);
	}

	// PCB and gold fingers.
	piece(dimm, new THREE.BoxGeometry(0.055, 0.72, RAM_LEN), materials.ramPcb, {
		position: [x, RAM_BOTTOM + 0.36, z]
	});
	piece(dimm, new THREE.BoxGeometry(0.062, 0.035, RAM_LEN - 0.12), materials.gold, {
		position: [x, RAM_BOTTOM + 0.02, z]
	});

	// Heatspreader shell.
	piece(dimm, roundBox(0.155, 0.6, RAM_LEN - 0.06, 0.03, 4), materials.ramMetal, {
		position: [x, 0.585, z]
	});
	piece(dimm, new THREE.BoxGeometry(0.17, 0.028, RAM_LEN - 0.02), materials.silver, {
		position: [x, top - 0.055, z]
	});
	piece(dimm, new THREE.BoxGeometry(0.17, 0.022, RAM_LEN - 0.02), materials.ramDark, {
		position: [x, 0.935, z]
	});

	// Label plate on the outward face.
	piece(dimm, verticalPlane(2.6, 0.44), materials.ramLabel, {
		position: [x + 0.079, 0.6, z]
	});
	piece(dimm, verticalPlane(2.6, 0.44), materials.ramLabel, {
		position: [x - 0.079, 0.6, z]
	});

	// Three machined grooves on each face.
	const grooves = [];
	for (const side of [-1, 1]) {
		for (let i = 0; i < 2; i += 1) {
			grooves.push(
				applyTransform(new THREE.BoxGeometry(0.004, 0.012, RAM_LEN - 0.28), {
					position: [x + side * 0.079, 0.36 + i * 0.09, z]
				})
			);
		}
	}
	mergedPiece(dimm, grooves, materials.ramDark);

	return dimm;
}

buildDimm('ram-0', RAM_X[0]);
buildDimm('ram-1', RAM_X[1]);

/* -------------------------------------------------------------------------- */
/* M.2 SSD                                                                    */
/* -------------------------------------------------------------------------- */

const ssd = part('ssd');
const SSD_Z = 2.3;
piece(ssd, roundBox(0.17, 0.09, 0.2, 0.015, 3), materials.socketPlastic, {
	position: [-0.96, 0.135, SSD_Z]
});
piece(ssd, new THREE.BoxGeometry(2.42, 0.045, 0.62), materials.ssdPcb, {
	position: [0.3, 0.132, SSD_Z]
});
piece(ssd, new THREE.BoxGeometry(0.24, 0.012, 0.4), materials.gold, {
	position: [-0.86, 0.16, SSD_Z]
});
piece(ssd, horizontalPlane(1.52, 0.5), materials.ssdLabel, {
	position: [-0.06, 0.158, SSD_Z]
});
const chips = [];
const chipTops = [];
for (let i = 0; i < 2; i += 1) {
	chips.push(
		applyTransform(roundBox(0.4, 0.055, 0.42, 0.01, 2), {
			position: [0.86 + i * 0.0, 0.185, SSD_Z]
		})
	);
	chipTops.push(
		applyTransform(new THREE.BoxGeometry(0.3, 0.004, 0.32), {
			position: [0.86, 0.214, SSD_Z]
		})
	);
}
mergedPiece(ssd, chips, materials.chip);
mergedPiece(ssd, chipTops, materials.silver);
piece(ssd, roundBox(0.28, 0.05, 0.34, 0.01, 2), materials.chip, {
	position: [1.42, 0.18, SSD_Z]
});
piece(ssd, new THREE.CylinderGeometry(0.09, 0.09, 0.08, 20), materials.silver, {
	position: [1.72, 0.16, SSD_Z]
});
piece(ssd, new THREE.CylinderGeometry(0.055, 0.055, 0.012, 20), materials.portDark, {
	position: [1.72, 0.204, SSD_Z]
});

/* -------------------------------------------------------------------------- */
/* HDD                                                                        */
/* -------------------------------------------------------------------------- */

const hdd = part('hdd');
const HDD = { x: -2.55, z: 2.18, w: 1.86, h: 0.46, d: 1.24 };
piece(hdd, roundBox(HDD.w, HDD.h, HDD.d, 0.035, 4), materials.hddMetal, {
	position: [HDD.x, 0.09 + HDD.h / 2, HDD.z]
});
piece(hdd, roundBox(HDD.w - 0.08, 0.05, HDD.d - 0.08, 0.02, 3), materials.hddDark, {
	position: [HDD.x, 0.09 + HDD.h + 0.012, HDD.z]
});
piece(hdd, horizontalPlane(1.4, 0.94), materials.hddLabel, {
	position: [HDD.x, 0.09 + HDD.h + 0.039, HDD.z]
});
// Platter ring + spindle.
piece(hdd, new THREE.TorusGeometry(0.36, 0.012, 6, 64), materials.silver, {
	position: [HDD.x, 0.09 + HDD.h + 0.043, HDD.z],
	rotation: [-Math.PI / 2, 0, 0]
});
piece(hdd, new THREE.CylinderGeometry(0.05, 0.05, 0.014, 24), materials.gold, {
	position: [HDD.x, 0.09 + HDD.h + 0.045, HDD.z]
});
// Screws.
const screws = [];
for (const x of [-0.78, 0.78]) {
	for (const z of [-0.5, 0.5]) {
		screws.push(
			applyTransform(new THREE.CylinderGeometry(0.045, 0.045, 0.012, 16), {
				position: [HDD.x + x, 0.09 + HDD.h + 0.046, HDD.z + z]
			})
		);
	}
}
mergedPiece(hdd, screws, materials.silver);
// Activity LED.
piece(hdd, new THREE.BoxGeometry(0.11, 0.008, 0.024), materials.hddLed, {
	position: [HDD.x + 0.66, 0.09 + HDD.h + 0.048, HDD.z + 0.36]
});
// SATA connector at the back.
piece(hdd, new THREE.BoxGeometry(0.34, 0.16, 0.1), materials.portDark, {
	position: [HDD.x - 0.42, 0.2, HDD.z - HDD.d / 2 - 0.04]
});
piece(hdd, new THREE.BoxGeometry(0.3, 0.02, 0.07), materials.gold, {
	position: [HDD.x - 0.42, 0.26, HDD.z - HDD.d / 2 - 0.07]
});

/* -------------------------------------------------------------------------- */
/* Chipset                                                                    */
/* -------------------------------------------------------------------------- */

const chipset = part('chipset');
piece(chipset, roundBox(0.98, 0.12, 0.92, 0.02, 3), materials.socketPlastic, {
	position: [2.55, 0.15, 1.92]
});
const fins = [];
for (let i = 0; i < 11; i += 1) {
	fins.push(
		applyTransform(new THREE.BoxGeometry(0.028, 0.2, 0.82), {
			position: [2.14 + i * 0.078, 0.3, 1.92]
		})
	);
}
mergedPiece(chipset, fins, materials.heatsink);
piece(chipset, new THREE.BoxGeometry(0.86, 0.02, 0.1), materials.gold, {
	position: [2.55, 0.41, 1.92]
});
piece(chipset, new THREE.CylinderGeometry(0.05, 0.05, 0.01, 20), materials.hddLed, {
	position: [2.95, 0.405, 1.92]
});

/* -------------------------------------------------------------------------- */
/* Data bus geometry                                                          */
/* -------------------------------------------------------------------------- */

const bus = part('bus');
const busSegments = [
	{ points: FLOW.hddToRam, segments: 190, closed: false, radius: 0.013 },
	{ points: FLOW.ramToCache, segments: 150, closed: false, radius: 0.013 },
	{ points: FLOW.cacheToRegisters, segments: 18, closed: false, radius: 0.013 }
];
for (const segment of busSegments) {
	piece(
		bus,
		new THREE.TubeGeometry(
			curveFrom(segment.points, segment.closed),
			segment.segments,
			segment.radius,
			5,
			segment.closed
		),
		materials.bus
	);
}
const anchorRings = [];
for (const key of Object.keys(ANCHORS)) {
	const [x, y, z] = ANCHORS[key];
	anchorRings.push(
		applyTransform(new THREE.TorusGeometry(0.055, 0.009, 6, 30), {
			position: [x, y + 0.002, z],
			rotation: [-Math.PI / 2, 0, 0]
		})
	);
}
mergedPiece(bus, anchorRings, materials.gold);

/* -------------------------------------------------------------------------- */
/* Serialize                                                                  */
/* -------------------------------------------------------------------------- */

const partOrder = [
	'motherboard',
	'socket',
	'cpu',
	'cpu-cache',
	'cpu-registers',
	'ram-0',
	'ram-1',
	'ssd',
	'hdd',
	'chipset',
	'bus'
];

function createAccessor(array, type) {
	return doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
}

function addPrimitive(mesh, geometry, material) {
	const nonIndexed = geometry.index ? geometry.toNonIndexed() : geometry;
	if (!nonIndexed.getAttribute('normal')) nonIndexed.computeVertexNormals();
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

for (const name of partOrder) {
	const definition = parts.get(name);
	const node = doc.createNode(name);
	node.setTranslation([0, 0, 0]);
	scene.addChild(node);

	if (name === 'motherboard') {
		// Single source of truth for the runtime packet routes. Attached to a
		// mesh node so `gltf-transform prune` keeps it.
		node.setExtras({
			flow: {
				version: 1,
				curve: { type: 'centripetal', tension: 0.5 },
				paths: {
					hddToRam: { points: FLOW.hddToRam, closed: false },
					ramToCache: { points: FLOW.ramToCache, closed: false },
					cacheLoop: { points: FLOW.cacheLoop, closed: true },
					cacheToRegisters: { points: FLOW.cacheToRegisters, closed: false }
				},
				anchors: ANCHORS,
				cache: { x: L3.x, y: L3.y, z: L3.z, radius: L3.radius },
				stages: [
					{ id: 'hdd', label: 'HDD', latency: '~5.2 ms' },
					{ id: 'ram', label: 'RAM', latency: '~80 ns' },
					{ id: 'cache', label: 'L3 Cache', latency: '~12 ns' },
					{ id: 'registers', label: 'Registers', latency: '0.3 ns' }
				]
			}
		});
	}

	const mesh = doc.createMesh(name);
	node.setMesh(mesh);
	for (const item of definition.pieces) {
		addPrimitive(mesh, item.geometry, item.material);
	}
}

const io = new NodeIO().registerExtensions([KHRMaterialsIridescence]);
const sourceBytes = await io.writeBinary(doc);
const sourcePath = path.join(CACHE, 'memory-hierarchy.source.glb');
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
run(cli, ['weld', sourcePath, temp('memory.weld.glb')]);
run(cli, ['dedup', temp('memory.weld.glb'), temp('memory.dedup.glb')]);
run(cli, ['prune', temp('memory.dedup.glb'), temp('memory.pruned.glb')]);

console.log('› Compressing textures with KTX2 / ETC1S...');
run(cli, [
	'etc1s',
	temp('memory.pruned.glb'),
	temp('memory.ktx2.glb'),
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
	temp('memory.ktx2.glb'),
	path.join(MODEL_DIR, 'memory-hierarchy.glb'),
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

const finalPath = path.join(MODEL_DIR, 'memory-hierarchy.glb');
const finalBytes = await fs.stat(finalPath);
const finalJson = await readGlbJson(finalPath);
const usedExtensions = finalJson.extensionsUsed ?? [];
const boardNode = finalJson.nodes.find((node) => node.name === 'motherboard');
const flow = boardNode?.extras?.flow;

if (!flow) throw new Error('Flow extras were dropped from the motherboard node.');
for (const key of ['hddToRam', 'ramToCache', 'cacheLoop', 'cacheToRegisters']) {
	if (!flow.paths?.[key]?.points?.length) throw new Error(`Flow path "${key}" is missing.`);
}

console.log(`✓ Final model written (${fmt(finalBytes.size)})`);
console.log(`  extensions: ${usedExtensions.join(', ') || 'none'}`);
console.log(`  nodes: ${finalJson.nodes.map((node) => node.name).join(', ')}`);
console.log(
	`  flow: ${Object.keys(flow.paths).join(', ')} · ${Object.values(flow.paths).reduce((sum, p) => sum + p.points.length, 0)} control points`
);

let triangles = 0;
for (const name of partOrder) {
	for (const item of parts.get(name).pieces) {
		const count = item.geometry.index ? item.geometry.index.count : item.geometry.attributes.position.count;
		triangles += Math.floor(count / 3);
	}
}
console.log(`  parts: ${partOrder.join(', ')}`);
console.log(`  triangles (pre-compression): ${triangles.toLocaleString()}`);
console.log(`  textures: ${textureDefs.length} maps (${textureDefs.map((t) => t.key).join(', ')})`);
