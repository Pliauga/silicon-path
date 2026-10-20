#!/usr/bin/env node
/**
 * Silicon Path — procedural stack/heap memory towers.
 *
 * Generates two PBR texture sets (cool silicon stack, warm copper heap),
 * assembles a hanging stack deck and a grounded heap deck with 42 addressable
 * memory blocks each, then runs the same Draco + KTX2 pipeline as the CPU
 * package so the runtime keeps identical streaming and draw-call costs.
 *
 * Block coordinate system (scene units):
 *   - Stack blocks hang from y = 2.5 and grow downward.
 *   - Heap blocks rise from y = -2.5 and grow upward.
 *   - Seven levels × six lanes per tower. At full growth the last pair meets
 *     exactly at y = 0, which the runtime treats as the collision plane.
 *
 * Run: npm run build:memory
 * Fast: node scripts/build-memory-model.mjs --fast (skips KTX2/Draco)
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
const FAST = process.argv.includes('--fast');

await fs.mkdir(TEX_DIR, { recursive: true });
await fs.mkdir(MODEL_DIR, { recursive: true });

const SANS = 'Helvetica Neue, Helvetica, Arial, sans-serif';
const MONO = 'SFMono-Regular, Menlo, Monaco, Consolas, monospace';

/* -------------------------------------------------------------------------- */
/* Layout constants                                                           */
/* -------------------------------------------------------------------------- */

const LEVELS = 7;
const LANES = [
	[-1.24, -0.56],
	[0, -0.56],
	[1.24, -0.56],
	[-1.24, 0.56],
	[0, 0.56],
	[1.24, 0.56]
];
const BLOCK_HEIGHT = 0.34;
const LEVEL_PITCH = 0.36;
const BLOCK_WIDTH = 1.16;
const BLOCK_DEPTH = 1.04;
const DECK_Y = 2.5;
const CONTACT_Y = 0;

const _ADDRESSES = {
	stack: ['0x7FFC 3A10', '0x7FFC 3A48', '0x7FFC 3A80', '0x7FFC 3AB8'],
	heap: ['0x55A0 B200', '0x55A0 B238', '0x55A0 B270', '0x55A0 B2A8']
};

const TEXTURE_DEFS = [];
const textureBuffers = {};

/* -------------------------------------------------------------------------- */
/* Texture helpers                                                            */
/* -------------------------------------------------------------------------- */

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

async function renderTexture(key, name, width, height, defs, body) {
	const svg = svgDoc(width, height, defs, body);
	const buffer = await sharp(Buffer.from(scaleSvg(svg, name)))
		.png({ compressionLevel: 9, adaptiveFiltering: true })
		.toBuffer();
	await fs.writeFile(path.join(TEX_DIR, `${name}.png`), buffer);
	textureBuffers[key] = buffer;
	TEXTURE_DEFS.push({ key, name, width, height, bytes: buffer.byteLength });
}

/* -------------------------------------------------------------------------- */
/* Block artwork                                                              */
/* -------------------------------------------------------------------------- */

// The texture is mapped once per face, so the composition is deliberately
// border-led: a machined frame, twin gold contact rows and a central bus with
// register pads. It reads as memory hardware from every face, with no baked
// text that could stretch on the narrow sides.
function blockColorSvg(tower) {
	const W = 1024;
	const stack = tower === 'stack';
	const rand = makeRandom(stack ? 42 : 77);
	const p = stack
		? {
				bg0: '#0a1215',
				bg1: '#101d21',
				bg2: '#060b0d',
				grid: '#2f5054',
				ink: '#a9e4dd',
				gold: '#cfae72',
				cell: '#10262a',
				cellEdge: '#2a4d51'
			}
		: {
				bg0: '#150f0b',
				bg1: '#201710',
				bg2: '#0b0806',
				grid: '#4c3424',
				ink: '#ffc58c',
				gold: '#d7a463',
				cell: '#2a1e15',
				cellEdge: '#4d3726'
			};

	const pins = [];
	for (let x = 44; x <= 970; x += 21) {
		pins.push(
			`<rect x="${x}" y="24" width="9" height="7" rx="2" fill="${p.gold}" opacity="0.55" />`
		);
		pins.push(
			`<rect x="${x}" y="993" width="9" height="7" rx="2" fill="${p.gold}" opacity="0.55" />`
		);
	}

	const busPads = [];
	for (let i = 0; i < 6; i += 1) {
		const x = 154 + i * 124;
		busPads.push(
			`<rect x="${x}" y="486" width="92" height="52" rx="7" fill="${p.bg2}" stroke="${p.cellEdge}" stroke-width="1.2" />`,
			`<rect x="${x + 14}" y="504" width="64" height="5" rx="2.5" fill="${p.gold}" opacity="0.5" />`,
			`<circle cx="${x + 20}" cy="524" r="4" fill="${p.ink}" opacity="0.55" />`,
			`<rect x="${x + 34}" y="520" width="${16 + (i % 3) * 12}" height="4" rx="2" fill="${p.ink}" opacity="0.3" />`
		);
	}

	const brushed = [];
	for (let i = 0; i < 90; i += 1) {
		const y = rand() * W;
		brushed.push(
			`<path d="M0 ${y.toFixed(1)} H1024" stroke="#ffffff" stroke-opacity="${(0.012 + rand() * 0.016).toFixed(3)}" stroke-width="${(0.6 + rand() * 1.4).toFixed(2)}" />`
		);
	}

	const defs = `
		<linearGradient id="block-bg" x1="0" y1="0" x2="1" y2="0.9">
			<stop offset="0" stop-color="${p.bg2}" />
			<stop offset="0.42" stop-color="${p.bg1}" />
			<stop offset="0.72" stop-color="${p.bg0}" />
			<stop offset="1" stop-color="${p.bg2}" />
		</linearGradient>
		<linearGradient id="block-sheen" x1="0" y1="0" x2="0.4" y2="1">
			<stop offset="0" stop-color="#ffffff" stop-opacity="0.09" />
			<stop offset="0.35" stop-color="#ffffff" stop-opacity="0" />
			<stop offset="1" stop-color="#000000" stop-opacity="0.22" />
		</linearGradient>
		<radialGradient id="block-glow" cx="0.5" cy="0.42" r="0.65">
			<stop offset="0" stop-color="${p.ink}" stop-opacity="0.10" />
			<stop offset="1" stop-color="${p.ink}" stop-opacity="0" />
		</radialGradient>
		<pattern id="block-grid" width="26" height="26" patternUnits="userSpaceOnUse">
			<path d="M26 0H0V26" fill="none" stroke="${p.grid}" stroke-opacity="0.4" stroke-width="1" />
		</pattern>
		<pattern id="block-scan" width="6" height="6" patternUnits="userSpaceOnUse">
			<path d="M0 1H6" stroke="#ffffff" stroke-opacity="0.035" stroke-width="1" />
		</pattern>`;

	const body = `
		<rect width="${W}" height="${W}" fill="url(#block-bg)" />
		<rect width="${W}" height="${W}" fill="url(#block-grid)" opacity="0.52" />
		${brushed.join('')}
		<rect width="${W}" height="${W}" fill="url(#block-glow)" />
		<rect width="${W}" height="${W}" fill="url(#block-scan)" />
		<rect width="${W}" height="${W}" fill="url(#block-sheen)" />

		<rect x="18" y="18" width="988" height="988" rx="16" fill="none" stroke="${p.gold}" stroke-opacity="0.34" stroke-width="1.4" />
		<rect x="30" y="30" width="964" height="964" rx="11" fill="none" stroke="${p.ink}" stroke-opacity="0.14" stroke-width="1" />
		<path d="M18 84V52a34 34 0 0 1 34-34h32" fill="none" stroke="${p.gold}" stroke-opacity="0.75" stroke-width="3" />
		<path d="M1006 84V52a34 34 0 0 0-34-34h-32" fill="none" stroke="${p.gold}" stroke-opacity="0.75" stroke-width="3" />
		<path d="M18 940v32a34 34 0 0 0 34 34h32" fill="none" stroke="${p.gold}" stroke-opacity="0.75" stroke-width="3" />
		<path d="M1006 940v32a34 34 0 0 1-34 34h-32" fill="none" stroke="${p.gold}" stroke-opacity="0.75" stroke-width="3" />

		${pins.join('')}

		<rect x="112" y="444" width="800" height="136" rx="12" fill="${p.cell}" fill-opacity="0.72" stroke="${p.cellEdge}" stroke-width="1.4" />
		<rect x="126" y="458" width="772" height="108" rx="8" fill="none" stroke="${p.ink}" stroke-opacity="0.12" stroke-width="1" />
		${busPads.join('')}

		<path d="M112 406H912" stroke="${p.gold}" stroke-opacity="0.22" stroke-width="1" />
		<path d="M112 618H912" stroke="${p.gold}" stroke-opacity="0.22" stroke-width="1" />
		<path d="M512 406v-34M490 420l22-22 22 22" fill="none" stroke="${p.ink}" stroke-opacity="0.3" stroke-width="1.4" />
		<circle cx="512" cy="360" r="4" fill="${p.gold}" opacity="0.6" />
		<rect x="432" y="644" width="160" height="8" rx="4" fill="${p.gold}" opacity="0.24" />
		<rect x="472" y="664" width="80" height="4" rx="2" fill="${p.ink}" opacity="0.22" />

		<g opacity="0.6">
			<path d="M64 256h28M64 256v28M960 256h-28M960 256v28" fill="none" stroke="${p.ink}" stroke-width="2" />
			<path d="M64 760h28M64 760v-28M960 760h-28M960 760v-28" fill="none" stroke="${p.ink}" stroke-width="2" />
		</g>`;

	return { defs, body };
}

/* -------------------------------------------------------------------------- */
/* Deck artwork                                                               */
/* -------------------------------------------------------------------------- */

function deckColorSvg(tower) {
	const W = 1024;
	const H = 640;
	const stack = tower === 'stack';
	const rand = makeRandom(stack ? 128 : 256);
	const p = stack
		? {
				bg0: '#04080a',
				bg1: '#0a1214',
				bg2: '#020405',
				ink: '#9fe0d8',
				gold: '#cfae72',
				line: '#24464a',
				warn: '#e0523f'
			}
		: {
				bg0: '#0d0906',
				bg1: '#171009',
				bg2: '#050302',
				ink: '#ffc58c',
				gold: '#d7a463',
				line: '#4a3324',
				warn: '#e0523f'
			};

	const screws = [
		[66, 66],
		[958, 66],
		[66, 574],
		[958, 574]
	]
		.map(
			([x, y]) => `
			<circle cx="${x}" cy="${y}" r="15" fill="${p.bg2}" stroke="${p.gold}" stroke-opacity="0.55" stroke-width="1.4" />
			<circle cx="${x}" cy="${y}" r="6" fill="${p.bg1}" stroke="${p.line}" stroke-width="1.2" />
			<path d="M${x - 15} ${y}h-10M${x + 15} ${y}h10M${x} ${y - 15}v-10M${x} ${y + 15}v10" stroke="${p.gold}" stroke-opacity="0.4" stroke-width="1" />`
		)
		.join('');

	const ticks = [];
	for (let x = 120; x <= 904; x += 32) {
		const tall = (x / 32) % 4 === 0;
		ticks.push(
			`<rect x="${x}" y="${tall ? 590 : 594}" width="1.5" height="${tall ? 22 : 14}" fill="${p.ink}" opacity="${tall ? 0.45 : 0.22}" />`
		);
	}

	const chevrons = [];
	for (let i = 0; i < 7; i += 1) {
		const x = 352 + i * 48;
		chevrons.push(
			`<path d="M${x} 512l18 16-18 16" fill="none" stroke="${p.warn}" stroke-opacity="${0.5 + i * 0.06}" stroke-width="2.4" />`
		);
	}

	const brushed = [];
	for (let i = 0; i < 60; i += 1) {
		const y = rand() * H;
		brushed.push(
			`<path d="M0 ${y.toFixed(1)}H1024" stroke="#ffffff" stroke-opacity="${(0.01 + rand() * 0.018).toFixed(3)}" stroke-width="${(0.6 + rand() * 1.2).toFixed(2)}" />`
		);
	}

	const defs = `
		<linearGradient id="deck-bg" x1="0" y1="0" x2="0.8" y2="1">
			<stop offset="0" stop-color="${p.bg1}" />
			<stop offset="0.5" stop-color="${p.bg0}" />
			<stop offset="1" stop-color="${p.bg2}" />
		</linearGradient>
		<linearGradient id="deck-title" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0" stop-color="#ffffff" stop-opacity="0.92" />
			<stop offset="1" stop-color="${p.ink}" stop-opacity="0.55" />
		</linearGradient>
		<radialGradient id="deck-glow" cx="0.5" cy="0.45" r="0.62">
			<stop offset="0" stop-color="${p.ink}" stop-opacity="0.09" />
			<stop offset="1" stop-color="${p.ink}" stop-opacity="0" />
		</radialGradient>
		<pattern id="deck-grid" width="32" height="32" patternUnits="userSpaceOnUse">
			<path d="M32 0H0V32" fill="none" stroke="${p.line}" stroke-opacity="0.5" stroke-width="1" />
		</pattern>`;

	const body = `
		<rect width="${W}" height="${H}" fill="url(#deck-bg)" />
		<rect width="${W}" height="${H}" fill="url(#deck-grid)" opacity="0.55" />
		${brushed.join('')}
		<rect width="${W}" height="${H}" fill="url(#deck-glow)" />

		<rect x="18" y="18" width="988" height="604" rx="22" fill="none" stroke="${p.gold}" stroke-opacity="0.32" stroke-width="1.6" />
		<rect x="34" y="34" width="956" height="572" rx="14" fill="none" stroke="${p.ink}" stroke-opacity="0.1" stroke-width="1" />

		${screws}

		<text x="512" y="286" text-anchor="middle" font-family="${SANS}" font-size="94" font-weight="600" letter-spacing="26" fill="url(#deck-title)">${stack ? 'STACK' : 'HEAP'}</text>
		<text x="512" y="336" text-anchor="middle" font-family="${MONO}" font-size="17" letter-spacing="7" fill="${p.ink}" fill-opacity="0.5">${stack ? 'HIGH ADDRESS SPACE' : 'LOW ADDRESS SPACE'}</text>

		<path d="M300 372H724" stroke="${p.gold}" stroke-opacity="0.45" stroke-width="1.2" />
		<path d="M480 372l16 12 16-12 16 12 16-12" fill="none" stroke="${p.gold}" stroke-opacity="0.6" stroke-width="1.6" />

		<text x="512" y="436" text-anchor="middle" font-family="${MONO}" font-size="19" letter-spacing="5" fill="${p.gold}" fill-opacity="0.85">${stack ? 'GROWS DOWN · LIFO' : 'GROWS UP · FIFO'}</text>
		<text x="512" y="474" text-anchor="middle" font-family="${MONO}" font-size="13" letter-spacing="4" fill="${p.ink}" fill-opacity="0.38">${stack ? 'PUSH ALLOCATES · POP RELEASES' : 'ALLOCATION ORDER IS ADDRESS ORDER'}</text>

		${chevrons.join('')}
		${ticks.join('')}

		<text x="72" y="616" font-family="${MONO}" font-size="12" letter-spacing="3" fill="${p.ink}" fill-opacity="0.32">${stack ? '0x7FFF FFFF' : '0x55A0 0000'}</text>
		<text x="952" y="616" text-anchor="end" font-family="${MONO}" font-size="12" letter-spacing="3" fill="${p.ink}" fill-opacity="0.32">FRAME 42 / 42</text>

		<rect x="34" y="560" width="956" height="2" fill="${p.ink}" opacity="0.1" />
		<rect x="34" y="34" width="26" height="26" fill="none" stroke="${p.gold}" stroke-opacity="0.5" />
		<rect x="964" y="34" width="26" height="26" fill="none" stroke="${p.gold}" stroke-opacity="0.5" />`;

	return { defs, body };
}

function fasciaColorSvg(tower) {
	const W = 2048;
	const H = 112;
	const stack = tower === 'stack';
	const p = stack
		? { ink: '#a9e4dd', gold: '#cfae72', dim: '#6d8f91', dot: '#7ff3e5' }
		: { ink: '#ffc58c', gold: '#d7a463', dim: '#a4836a', dot: '#ffb066' };

	const ticks = [];
	for (let x = 620; x <= 1700; x += 24) {
		const tall = (x / 24) % 5 === 0;
		ticks.push(
			`<rect x="${x}" y="${tall ? 84 : 88}" width="1.4" height="${tall ? 14 : 8}" fill="${p.ink}" opacity="${tall ? 0.4 : 0.18}" />`
		);
	}

	const defs = `
		<linearGradient id="fascia-bg" x1="0" y1="0" x2="1" y2="0">
			<stop offset="0" stop-color="#020506" />
			<stop offset="0.28" stop-color="${stack ? '#0b1417' : '#171009'}" />
			<stop offset="0.72" stop-color="${stack ? '#0b1417' : '#171009'}" />
			<stop offset="1" stop-color="#020506" />
		</linearGradient>`;

	const body = `
		<rect width="${W}" height="${H}" fill="url(#fascia-bg)" />
		<rect x="0" y="4" width="${W}" height="1.2" fill="${p.gold}" opacity="0.35" />
		<rect x="0" y="${H - 5.2}" width="${W}" height="1.2" fill="${p.gold}" opacity="0.35" />

		<text x="64" y="58" font-family="${SANS}" font-size="40" font-weight="600" letter-spacing="12" fill="${p.ink}">${stack ? 'STACK' : 'HEAP'}</text>
		<text x="66" y="86" font-family="${MONO}" font-size="11" letter-spacing="4.2" fill="${p.ink}" fill-opacity="0.42">${stack ? 'HIGH ADDRESS SPACE · GROWS DOWN' : 'LOW ADDRESS SPACE · GROWS UP'}</text>

		${ticks.join('')}

		<circle cx="1744" cy="52" r="4.5" fill="${p.dot}" opacity="0.95" />
		<circle cx="1744" cy="52" r="10" fill="none" stroke="${p.dot}" stroke-opacity="0.25" />
		<text x="1772" y="57" font-family="${MONO}" font-size="12" letter-spacing="3" fill="${p.ink}" fill-opacity="0.6">${stack ? 'LIFO' : 'FIFO'}</text>
		<text x="1984" y="57" text-anchor="end" font-family="${MONO}" font-size="12" letter-spacing="3" fill="${p.gold}" fill-opacity="0.85">${stack ? '0x7FFF FFFF' : '0x55A0 0000'}</text>
		<text x="1984" y="86" text-anchor="end" font-family="${MONO}" font-size="10" letter-spacing="2.4" fill="${p.ink}" fill-opacity="0.32">42 FRAMES · 64 B · ${stack ? 'DOWN' : 'UP'}</text>`;

	return { defs, body };
}

/* -------------------------------------------------------------------------- */
/* ORM + glow maps                                                            */
/* -------------------------------------------------------------------------- */

function blockOrmSvg() {
	const W = 1024;
	const stack = true;
	const bg = stack ? [255, 138, 52] : [255, 172, 30];
	return {
		defs: `<pattern id="orm-grid" width="26" height="26" patternUnits="userSpaceOnUse"><path d="M26 0H0V26" fill="none" stroke="rgb(255,196,70)" stroke-opacity="0.35" stroke-width="1" /></pattern>`,
		body: `
			<rect width="${W}" height="${W}" fill="rgb(${bg[0]},${bg[1]},${bg[2]})" />
			<rect width="${W}" height="${W}" fill="url(#orm-grid)" />
			<rect x="112" y="444" width="800" height="136" rx="12" fill="rgb(255,110,96)" />
			<rect x="18" y="18" width="988" height="988" rx="16" fill="none" stroke="rgb(255,92,24)" stroke-width="4" />
			<rect x="24" y="24" width="976" height="14" fill="rgb(255,210,76)" />
			<rect x="24" y="986" width="976" height="14" fill="rgb(255,210,76)" />`
	};
}

function deckOrmSvg() {
	return {
		defs: `<pattern id="orm-lines" width="8" height="3" patternUnits="userSpaceOnUse"><path d="M0 1H8" stroke="#ffffff" stroke-opacity="0.12" /></pattern>`,
		body: `
			<rect width="512" height="320" fill="rgb(255,126,26)" />
			<rect width="512" height="320" fill="url(#orm-lines)" />
			<rect x="10" y="10" width="492" height="300" rx="10" fill="none" stroke="rgb(255,196,90)" stroke-width="3" />`
	};
}

function bloomSvg() {
	return {
		defs: `
			<radialGradient id="bloom" cx="0.5" cy="0.5" r="0.5">
				<stop offset="0" stop-color="#ffffff" stop-opacity="1" />
				<stop offset="0.12" stop-color="#ffd9cf" stop-opacity="0.95" />
				<stop offset="0.32" stop-color="#ff4a37" stop-opacity="0.62" />
				<stop offset="0.62" stop-color="#d40f0f" stop-opacity="0.2" />
				<stop offset="1" stop-color="#640000" stop-opacity="0" />
			</radialGradient>`,
		body: `<rect width="256" height="256" fill="url(#bloom)" />`
	};
}

/* -------------------------------------------------------------------------- */
/* Build textures                                                             */
/* -------------------------------------------------------------------------- */

console.log('› Rendering PBR texture set...');
const stackBlock = blockColorSvg('stack');
await renderTexture('stackBlockColor', 'memory-stack-color', 1024, 1024, stackBlock.defs, stackBlock.body);
const heapBlock = blockColorSvg('heap');
await renderTexture('heapBlockColor', 'memory-heap-color', 1024, 1024, heapBlock.defs, heapBlock.body);
const orm = blockOrmSvg();
await renderTexture('blockOrm', 'memory-block-orm', 1024, 1024, orm.defs, orm.body);

const stackDeck = deckColorSvg('stack');
await renderTexture('stackDeckColor', 'memory-stack-deck', 1024, 640, stackDeck.defs, stackDeck.body);
const heapDeck = deckColorSvg('heap');
await renderTexture('heapDeckColor', 'memory-heap-deck', 1024, 640, heapDeck.defs, heapDeck.body);
const deckOrm = deckOrmSvg();
await renderTexture('deckOrm', 'memory-deck-orm', 512, 320, deckOrm.defs, deckOrm.body);
const stackFascia = fasciaColorSvg('stack');
await renderTexture('stackFasciaColor', 'memory-stack-fascia', 2048, 112, stackFascia.defs, stackFascia.body);
const heapFascia = fasciaColorSvg('heap');
await renderTexture('heapFasciaColor', 'memory-heap-fascia', 2048, 112, heapFascia.defs, heapFascia.body);
const bloom = bloomSvg();
await renderTexture('contactBloom', 'memory-contact-bloom', 256, 256, bloom.defs, bloom.body);

/* -------------------------------------------------------------------------- */
/* Geometry helpers                                                           */
/* -------------------------------------------------------------------------- */

function roundBox(w, h, d, radius, segments = 2) {
	return new RoundedBoxGeometry(w, h, d, segments, radius);
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

function flipV(geometry) {
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
	return geometry.applyMatrix4(matrix);
}

function mergePieces(pieces) {
	const geometries = pieces.map((piece) => (piece.index ? piece.toNonIndexed() : piece));
	return mergeGeometries(geometries, false);
}

/* -------------------------------------------------------------------------- */
/* Document + materials                                                       */
/* -------------------------------------------------------------------------- */

const doc = new Document();
const iridescenceExtension = doc.createExtension(KHRMaterialsIridescence).setRequired(true);
const buffer = doc.createBuffer();
const scene = doc.createScene('Stack heap memory');

function texture(key, name) {
	return doc
		.createTexture(name)
		.setImage(textureBuffers[key])
		.setMimeType('image/png')
		.setURI(`${name}.png`);
}

const textures = {
	stackBlockColor: texture('stackBlockColor', 'memory-stack-color'),
	heapBlockColor: texture('heapBlockColor', 'memory-heap-color'),
	blockOrm: texture('blockOrm', 'memory-block-orm'),
	stackDeckColor: texture('stackDeckColor', 'memory-stack-deck'),
	heapDeckColor: texture('heapDeckColor', 'memory-heap-deck'),
	deckOrm: texture('deckOrm', 'memory-deck-orm'),
	stackFasciaColor: texture('stackFasciaColor', 'memory-stack-fascia'),
	heapFasciaColor: texture('heapFasciaColor', 'memory-heap-fascia'),
	contactBloom: texture('contactBloom', 'memory-contact-bloom')
};

const materials = {};

function blockMaterial(name, colorTexture, baseFactor) {
	const material = doc
		.createMaterial(name)
		.setBaseColorTexture(colorTexture)
		.setMetallicRoughnessTexture(textures.blockOrm)
		.setMetallicFactor(1)
		.setRoughnessFactor(1)
		.setBaseColorFactor(baseFactor);
	return material;
}

materials.stackA = blockMaterial('Memory block stack A', textures.stackBlockColor, [1, 1, 1, 1]);
materials.stackB = blockMaterial('Memory block stack B', textures.stackBlockColor, [0.66, 0.78, 0.8, 1]);
materials.heapA = blockMaterial('Memory block heap A', textures.heapBlockColor, [1, 1, 1, 1]);
materials.heapB = blockMaterial('Memory block heap B', textures.heapBlockColor, [0.78, 0.7, 0.64, 1]);

const stackIridescence = iridescenceExtension
	.createIridescence()
	.setIridescenceFactor(0.34)
	.setIridescenceIOR(1.31)
	.setIridescenceThicknessMinimum(120)
	.setIridescenceThicknessMaximum(320);
materials.stackA.setExtension('KHR_materials_iridescence', stackIridescence);
materials.stackB.setExtension('KHR_materials_iridescence', stackIridescence);

materials.deckEdge = doc
	.createMaterial('Deck edge')
	.setBaseColorFactor([0.028, 0.03, 0.033, 1])
	.setMetallicFactor(0.92)
	.setRoughnessFactor(0.36);

materials.deckTopStack = doc
	.createMaterial('Deck top stack')
	.setBaseColorTexture(textures.stackDeckColor)
	.setMetallicRoughnessTexture(textures.deckOrm)
	.setMetallicFactor(1)
	.setRoughnessFactor(1);

materials.deckTopHeap = doc
	.createMaterial('Deck top heap')
	.setBaseColorTexture(textures.heapDeckColor)
	.setMetallicRoughnessTexture(textures.deckOrm)
	.setMetallicFactor(1)
	.setRoughnessFactor(1);

materials.fasciaStack = doc
	.createMaterial('Fascia stack')
	.setBaseColorTexture(textures.stackFasciaColor)
	.setMetallicFactor(0.1)
	.setRoughnessFactor(0.38);

materials.fasciaHeap = doc
	.createMaterial('Fascia heap')
	.setBaseColorTexture(textures.heapFasciaColor)
	.setMetallicFactor(0.1)
	.setRoughnessFactor(0.38);

materials.gold = doc
	.createMaterial('Deck gold trim')
	.setBaseColorFactor([0.79, 0.63, 0.35, 1])
	.setMetallicFactor(1)
	.setRoughnessFactor(0.26);

materials.steel = doc
	.createMaterial('Deck steel')
	.setBaseColorFactor([0.38, 0.41, 0.42, 1])
	.setMetallicFactor(1)
	.setRoughnessFactor(0.36);

materials.statusStack = doc
	.createMaterial('Status stack')
	.setBaseColorFactor([0.02, 0.12, 0.12, 1])
	.setEmissiveFactor([0.42, 0.92, 0.86])
	.setMetallicFactor(0.2)
	.setRoughnessFactor(0.3);

materials.statusHeap = doc
	.createMaterial('Status heap')
	.setBaseColorFactor([0.14, 0.08, 0.02, 1])
	.setEmissiveFactor([1, 0.55, 0.25])
	.setMetallicFactor(0.2)
	.setRoughnessFactor(0.3);

materials.contactGlow = doc
	.createMaterial('Contact glow')
	.setBaseColorFactor([0.06, 0.004, 0.004, 1])
	.setEmissiveFactor([1, 0.06, 0.035])
	.setMetallicFactor(0)
	.setRoughnessFactor(1);

materials.contactBloom = doc
	.createMaterial('Contact bloom')
	.setBaseColorTexture(textures.contactBloom)
	.setBaseColorFactor([1, 1, 1, 1])
	.setMetallicFactor(0)
	.setRoughnessFactor(1)
	.setDoubleSided(true);

/* -------------------------------------------------------------------------- */
/* Geometry assembly                                                          */
/* -------------------------------------------------------------------------- */

function addPrimitive(mesh, geometry, material) {
	const nonIndexed = geometry.index ? geometry.toNonIndexed() : geometry;
	const position = nonIndexed.getAttribute('position');
	const normal = nonIndexed.getAttribute('normal');
	const uv = nonIndexed.getAttribute('uv');

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

function createAccessor(array, type) {
	return doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
}

function meshNode(name, pieces, position = [0, 0, 0]) {
	const node = doc.createNode(name);
	node.setTranslation(position);
	scene.addChild(node);
	const mesh = doc.createMesh(name);
	node.setMesh(mesh);
	for (const piece of pieces) {
		const geometry =
			piece.position || piece.rotation
				? applyTransform(piece.geometry, {
						position: piece.position ?? [0, 0, 0],
						rotation: piece.rotation ?? [0, 0, 0]
					})
				: piece.geometry;
		addPrimitive(mesh, geometry, piece.material);
	}
	return node;
}

// Memory blocks -------------------------------------------------------------
const rand = makeRandom(90210);
let blockTriangles = 0;
let blockCount = 0;

for (const tower of ['stack', 'heap']) {
	const stack = tower === 'stack';
	for (let level = 0; level < LEVELS; level += 1) {
		for (let lane = 0; lane < LANES.length; lane += 1) {
			const [x, z] = LANES[lane];
			const width = BLOCK_WIDTH + (rand() - 0.5) * 0.012;
			const depth = BLOCK_DEPTH + (rand() - 0.5) * 0.012;
			const geometry = roundBox(width, BLOCK_HEIGHT, depth, 0.036 + rand() * 0.004, 2);
			blockTriangles += (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3;

			const variant = (level + lane * 3 + (stack ? 0 : 1)) % 2 === 0 ? 'a' : 'b';
			const material = stack
				? variant === 'a'
					? materials.stackA
					: materials.stackB
				: variant === 'a'
					? materials.heapA
					: materials.heapB;

			const y = stack
				? DECK_Y - level * LEVEL_PITCH - BLOCK_HEIGHT / 2
				: -DECK_Y + level * LEVEL_PITCH + BLOCK_HEIGHT / 2;

			const node = meshNode(`${tower}-${level}-${lane}`, [{ geometry, material }], [x, y, z]);
			node.setExtras({ tower, level, lane, variant, height: BLOCK_HEIGHT });
			blockCount += 1;
		}
	}
}

// Stack deck (hangs from above) --------------------------------------------
{
	const pieces = [];
	const plateY = DECK_Y + 0.14;
	pieces.push({
		geometry: roundBox(4.4, 0.28, 2.8, 0.05, 4),
		material: materials.deckEdge,
		position: [0, plateY, 0]
	});
	// Underside artwork faces the camera.
	pieces.push({
		geometry: horizontalPlane(4.24, 2.64, true),
		material: materials.deckTopStack,
		position: [0, DECK_Y - 0.0006, 0]
	});

	const trim = [];
	for (const x of [-2.1, 2.1]) {
		trim.push(applyTransform(new THREE.BoxGeometry(0.028, 0.012, 2.58), { position: [x, DECK_Y - 0.006, 0] }));
	}
	for (const z of [-1.3, 1.3]) {
		trim.push(applyTransform(new THREE.BoxGeometry(4.16, 0.012, 0.028), { position: [0, DECK_Y - 0.006, z] }));
	}
	pieces.push({ geometry: mergePieces(trim), material: materials.gold });

	const screws = [];
	for (const x of [-1.94, 1.94]) {
		for (const z of [-1.16, 1.16]) {
			screws.push(
				applyTransform(new THREE.CylinderGeometry(0.055, 0.055, 0.014, 24), {
					position: [x, DECK_Y - 0.007, z]
				})
			);
		}
	}
	pieces.push({ geometry: mergePieces(screws), material: materials.steel });

	const hangers = [];
	for (const x of [-1.55, 1.55]) {
		hangers.push(
			applyTransform(new THREE.CylinderGeometry(0.045, 0.045, 1.9, 18), {
				position: [x, DECK_Y + 1.24, 0]
			})
		);
		hangers.push(
			applyTransform(new THREE.CylinderGeometry(0.082, 0.082, 0.14, 20), {
				position: [x, DECK_Y + 0.36, 0]
			})
		);
	}
	pieces.push({ geometry: mergePieces(hangers), material: materials.steel });

	pieces.push({
		geometry: flipV(new THREE.PlaneGeometry(4.24, 0.24)),
		material: materials.fasciaStack,
		position: [0, DECK_Y + 0.14, 1.4015]
	});
	pieces.push({
		geometry: new THREE.BoxGeometry(3.4, 0.01, 0.012),
		material: materials.statusStack,
		position: [0, DECK_Y + 0.012, 1.402]
	});

	meshNode('stack-deck', pieces);
}

// Heap deck (grounded) ------------------------------------------------------
{
	const pieces = [];
	pieces.push({
		geometry: roundBox(4.4, 0.28, 2.8, 0.05, 4),
		material: materials.deckEdge,
		position: [0, -DECK_Y - 0.14, 0]
	});
	pieces.push({
		geometry: horizontalPlane(4.24, 2.64),
		material: materials.deckTopHeap,
		position: [0, -DECK_Y + 0.0006, 0]
	});

	const trim = [];
	for (const x of [-2.1, 2.1]) {
		trim.push(applyTransform(new THREE.BoxGeometry(0.028, 0.012, 2.58), { position: [x, -DECK_Y + 0.006, 0] }));
	}
	for (const z of [-1.3, 1.3]) {
		trim.push(applyTransform(new THREE.BoxGeometry(4.16, 0.012, 0.028), { position: [0, -DECK_Y + 0.006, z] }));
	}
	pieces.push({ geometry: mergePieces(trim), material: materials.gold });

	const screws = [];
	for (const x of [-1.94, 1.94]) {
		for (const z of [-1.16, 1.16]) {
			screws.push(
				applyTransform(new THREE.CylinderGeometry(0.055, 0.055, 0.014, 24), {
					position: [x, -DECK_Y + 0.007, z]
				})
			);
		}
	}
	pieces.push({ geometry: mergePieces(screws), material: materials.steel });

	const skirt = roundBox(4.8, 0.1, 3.2, 0.02, 2);
	pieces.push({ geometry: skirt, material: materials.deckEdge, position: [0, -DECK_Y - 0.33, 0] });

	const feet = [];
	for (const x of [-1.96, 1.96]) {
		for (const z of [-1.26, 1.26]) {
			feet.push(
				applyTransform(new THREE.CylinderGeometry(0.09, 0.09, 0.12, 20), {
					position: [x, -DECK_Y - 0.43, z]
				})
			);
		}
	}
	pieces.push({ geometry: mergePieces(feet), material: materials.steel });

	pieces.push({
		geometry: flipV(new THREE.PlaneGeometry(4.24, 0.24)),
		material: materials.fasciaHeap,
		position: [0, -DECK_Y - 0.14, 1.4015]
	});
	pieces.push({
		geometry: new THREE.BoxGeometry(3.4, 0.01, 0.012),
		material: materials.statusHeap,
		position: [0, -DECK_Y - 0.012, 1.402]
	});

	meshNode('heap-deck', pieces);
}

// Contact hardware ----------------------------------------------------------
{
	const rings = [];
	for (const [inner, outer] of [
		[2.02, 2.3],
		[2.4, 2.55]
	]) {
		rings.push(
			applyTransform(new THREE.RingGeometry(inner, outer, 128), {
				position: [0, CONTACT_Y, 0],
				rotation: [-Math.PI / 2, 0, 0]
			})
		);
	}
	meshNode('contact-ring', [{ geometry: mergePieces(rings), material: materials.contactGlow }], [0, 0, 0]);
	meshNode(
		'contact-bloom',
		[{ geometry: new THREE.PlaneGeometry(4.8, 2.0), material: materials.contactBloom }],
		[0, CONTACT_Y, 0.12]
	);
}

/* -------------------------------------------------------------------------- */
/* Serialize                                                                  */
/* -------------------------------------------------------------------------- */

const io = new NodeIO().registerExtensions([KHRMaterialsIridescence]);
const sourceBytes = await io.writeBinary(doc);
const sourcePath = path.join(CACHE, 'memory.source.glb');
await fs.writeFile(sourcePath, sourceBytes);
console.log(`› Source GLB written (${fmt(sourceBytes.byteLength)})`);

/* -------------------------------------------------------------------------- */
/* Compression                                                                */
/* -------------------------------------------------------------------------- */

const targetPath = path.join(MODEL_DIR, 'stack-heap.glb');

if (FAST) {
	await fs.writeFile(targetPath, sourceBytes);
	console.log(`⚠ Fast mode: uncompressed asset written to ${path.relative(ROOT, targetPath)}`);
} else {
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
		targetPath,
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
}

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

const finalJson = await readGlbJson(targetPath);
const finalBytes = await fs.stat(targetPath);
const nodeNames = finalJson.nodes.map((node) => node.name);
const blockNodes = nodeNames.filter((name) => /^(stack|heap)-\d-\d$/.test(name));
const extras = finalJson.nodes.filter((node) => node.extras?.tower);
if (blockNodes.length !== blockCount) {
	throw new Error(`Expected ${blockCount} block nodes, found ${blockNodes.length}`);
}
if (extras.length !== blockCount) {
	throw new Error(`Expected ${blockCount} nodes with tower extras, found ${extras.length}`);
}
for (const required of ['stack-deck', 'heap-deck', 'contact-ring', 'contact-bloom']) {
	if (!nodeNames.includes(required)) throw new Error(`Missing required node: ${required}`);
}

console.log(`✓ Final model written (${fmt(finalBytes.size)})`);
console.log(`  extensions: ${(finalJson.extensionsUsed ?? []).join(', ') || 'none'}`);
console.log(`  nodes: ${nodeNames.length} (${blockCount} blocks + 4 rig nodes)`);
console.log(`  blocks: ${blockCount} (${LEVELS} levels × ${LANES.length} lanes × 2 towers)`);
console.log(`  triangles (pre-compression): ${Math.round(blockTriangles).toLocaleString()} blocks only`);
console.log(`  textures: ${TEXTURE_DEFS.length} maps (${TEXTURE_DEFS.map((t) => t.name).join(', ')})`);
console.log(`  path: ${path.relative(ROOT, targetPath)}`);