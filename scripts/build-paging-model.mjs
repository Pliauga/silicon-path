#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-unused-vars -- vendored model-build script: leftover tuning constants kept for reference */
/**
 * Silicon Path — virtual-memory paging asset pipeline.
 *
 * Builds the physical RAM frame array (4×4), the disk/swap platter, and the
 * twenty page tiles that travel between them. PBR atlases are drawn with
 * `sharp`, the scene is written with the glTF-Transform Document API, then
 * welded, deduplicated, pruned, KTX2 compressed and Draco compressed exactly
 * like the CPU package asset.
 *
 * Node contract consumed by VirtualMemory3D.svelte:
 *   empties  frame-00 … frame-15   insertion anchors (world transform)
 *   meshes   page-00  … page-19    page tiles resting on the disk
 *   statics  ram-board, disk-platter, memory-bus, frame-plates,
 *            frame-trim, frame-labels
 *
 * Run: npm run build:paging-model
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

const FRAME_COUNT = 16;
const PAGE_COUNT = 20;
const PAGE_SIZE = 0.64;
const FRAME_SIZE = 0.9;

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
/* Shared art                                                                 */
/* -------------------------------------------------------------------------- */

const GOLD = '#d8b36a';
const MUTED = '#8b9699';
const FAINT = '#586467';

function cornerBrackets(w, h, inset, arm, stroke, opacity = 0.6) {
	const x = inset;
	const y = inset;
	const x2 = w - inset;
	const y2 = h - inset;
	return `<g fill="none" stroke="${stroke}" stroke-width="1.2" opacity="${opacity}">
		<path d="M${x} ${y + arm}V${y}H${x + arm}"/>
		<path d="M${x2 - arm} ${y}H${x2}V${y + arm}"/>
		<path d="M${x2} ${y2 - arm}V${y2}H${x2 - arm}"/>
		<path d="M${x + arm} ${y2}H${x}V${y2 - arm}"/>
	</g>`;
}

function screw(x, y, r = 7) {
	return `<g transform="translate(${x} ${y})">
		<circle r="${r}" fill="#12181a" stroke="#3a4447" stroke-width="1"/>
		<circle r="${r - 3}" fill="none" stroke="#586467" stroke-width="0.8" opacity="0.7"/>
		<path d="M-${r - 4} 0H${r - 4}" stroke="#586467" stroke-width="1" opacity="0.55"/>
	</g>`;
}

/* -------------------------------------------------------------------------- */
/* Textures                                                                   */
/* -------------------------------------------------------------------------- */

function ramBoardSvg() {
	const W = 1024;
	const rand = makeRandom(2207);
	const specks = [];
	for (let i = 0; i < 140; i += 1) {
		specks.push(
			`<circle cx="${(rand() * W).toFixed(1)}" cy="${(rand() * W).toFixed(1)}" r="${(0.4 + rand() * 1.1).toFixed(2)}" opacity="${(0.03 + rand() * 0.08).toFixed(3)}"/>`
		);
	}
	const defs = `
		<linearGradient id="ramBody" x1="0" y1="0" x2=".9" y2="1">
			<stop offset="0" stop-color="#0c1416"/>
			<stop offset=".5" stop-color="#070b0d"/>
			<stop offset="1" stop-color="#040708"/>
		</linearGradient>
		<radialGradient id="ramGlow" cx=".5" cy=".28" r=".72">
			<stop offset="0" stop-color="#274247" stop-opacity=".45"/>
			<stop offset=".55" stop-color="#0d1a1c" stop-opacity=".16"/>
			<stop offset="1" stop-color="#000" stop-opacity="0"/>
		</radialGradient>
		<linearGradient id="ramGold" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0" stop-color="#efd79d"/>
			<stop offset=".48" stop-color="#b2863c"/>
			<stop offset="1" stop-color="#e3c27c"/>
		</linearGradient>
		<pattern id="ramWeave" width="20" height="20" patternUnits="userSpaceOnUse">
			<path d="M0 0L20 20M20 0L0 20" stroke="#33564f" stroke-width=".5" opacity=".14"/>
		</pattern>
		<pattern id="ramGrid" width="32" height="32" patternUnits="userSpaceOnUse">
			<path d="M32 0H0V32" fill="none" stroke="#2b4544" stroke-width=".45" opacity=".16"/>
		</pattern>
		<pattern id="ramHatch" width="6" height="6" patternUnits="userSpaceOnUse">
			<path d="M0 6L6 0" stroke="#5b7a74" stroke-width=".35" opacity=".09"/>
		</pattern>
		<filter id="ramBlur"><feGaussianBlur stdDeviation="7"/></filter>
	`;
	const body = `
		<rect width="${W}" height="${W}" fill="url(#ramBody)"/>
		<rect width="${W}" height="${W}" fill="url(#ramWeave)"/>
		<rect width="${W}" height="${W}" fill="url(#ramGrid)"/>
		<rect width="${W}" height="${W}" fill="url(#ramHatch)"/>
		<rect width="${W}" height="${W}" fill="url(#ramGlow)"/>
		<g fill="#cfe0d8">${specks.join('\n')}</g>
		<g fill="none" stroke="url(#ramGold)" opacity=".5">
			<path d="M40 40H${W - 40}V${W - 40}H40Z"/>
			<path d="M52 52H${W - 52}V${W - 52}H52Z" opacity=".5"/>
		</g>
		${cornerBrackets(W, W, 28, 44, GOLD, 0.75)}
		<g font-family="${SANS}">
			<text x="72" y="86" fill="${MUTED}" font-size="12" letter-spacing="5">SP—02 / MEMORY CONTROLLER</text>
			<text x="70" y="143" fill="#eef1ec" font-size="46" font-weight="300" letter-spacing="2">PHYSICAL RAM</text>
			<text x="72" y="171" fill="${MUTED}" font-size="11" letter-spacing="3.4">16 FRAMES · 4 × 4 ARRAY · 4 KB PAGES · 64 KB RESIDENT</text>
		</g>
		<path d="M72 191H952" stroke="${GOLD}" stroke-opacity=".45" stroke-width="1"/>
		<g font-family="${MONO}" fill="${FAINT}" font-size="9" letter-spacing="2.6">
			<text x="952" y="166" text-anchor="end">REV 24.4 / LGA</text>
			<text x="72" y="1000">FRAME 00—15 / DIRECT-MAPPED BANKS</text>
			<text x="952" y="1000" text-anchor="end">SILICON PATH / VM-02</text>
		</g>
		<g transform="translate(864 986)" opacity=".55">
			<path d="M0 10 L10 0 L20 10 M0 20 L10 10 L20 20" fill="none" stroke="${GOLD}" stroke-width="1"/>
		</g>
		<g opacity=".5" filter="url(#ramBlur)">
			<rect x="40" y="40" width="${W - 80}" height="${W - 80}" fill="none" stroke="#203437" stroke-width="18"/>
		</g>
		${screw(58, 58)}${screw(966, 58)}${screw(58, 966)}${screw(966, 966)}
		<g font-family="${MONO}" fill="${GOLD}" opacity=".6" font-size="9" letter-spacing="3">
			<text transform="rotate(-90 24 512)" x="24" y="512" text-anchor="middle">FRAME ARRAY / DRAM</text>
		</g>
	`;
	return { width: W, height: W, defs, body };
}

function diskBoardSvg() {
	const W = 1024;
	const H = 768;
	const cols = 5;
	const rows = 4;
	const rand = makeRandom(4411);

	// World → texture mapping: x ∈ [-2.4, 2.4], z ∈ [0, 3.6].
	const toX = (x) => ((x + 2.4) / 4.8) * W;
	const toY = (z) => (z / 3.6) * H;
	const cellW = (PAGE_SIZE / 4.8) * W;
	const cellH = (PAGE_SIZE / 3.6) * H;

	const slots = [];
	const chips = [];
	for (let i = 0; i < PAGE_COUNT; i += 1) {
		const col = i % cols;
		const row = Math.floor(i / cols);
		const x = -1.56 + col * 0.78;
		const z = 1.8 + (row - 1.5) * 0.72;
		const cx = toX(x);
		const cy = toY(z);
		const label = `P${String(i).padStart(2, '0')}`;
		slots.push(`
			<g transform="translate(${(cx - cellW / 2).toFixed(1)} ${(cy - cellH / 2).toFixed(1)})">
				<rect width="${cellW.toFixed(1)}" height="${cellH.toFixed(1)}" rx="10" fill="#030607" stroke="#2b3a3c" stroke-width="1"/>
				<rect x="5" y="5" width="${(cellW - 10).toFixed(1)}" height="${(cellH - 10).toFixed(1)}" rx="7" fill="none" stroke="#1d2a2c" stroke-width="1"/>
				<g font-family="${MONO}" text-anchor="middle">
					<text x="${(cellW / 2).toFixed(1)}" y="${(cellH / 2 - 2).toFixed(1)}" fill="#4b5b5e" font-size="34" letter-spacing="3">${label}</text>
					<text x="${(cellW / 2).toFixed(1)}" y="${(cellH / 2 + 18).toFixed(1)}" fill="#334244" font-size="8" letter-spacing="2">SLOT ${String(i).padStart(2, '0')} · 4 KB</text>
				</g>
				<path d="M10 ${(cellH - 10).toFixed(1)}H${(cellW - 10).toFixed(1)}" stroke="${GOLD}" stroke-opacity=".18" stroke-width="1"/>
			</g>`);
		chips.push(
			`<rect x="${(cx - 4).toFixed(1)}" y="${(cy + cellH / 2 + 3).toFixed(1)}" width="8" height="2" fill="${GOLD}" opacity=".3"/>`
		);
	}

	const ticks = [];
	for (let i = 0; i < 72; i += 1) {
		const a = (i / 72) * Math.PI * 2;
		const inner = 452;
		const outer = i % 6 === 0 ? 470 : 462;
		ticks.push(
			`<path d="M${(512 + Math.cos(a) * inner).toFixed(1)} ${(384 + Math.sin(a) * inner).toFixed(1)}L${(512 + Math.cos(a) * outer).toFixed(1)} ${(384 + Math.sin(a) * outer).toFixed(1)}" stroke="#415355" stroke-width="${i % 6 === 0 ? 1.4 : 0.7}" opacity=".5"/>`
		);
	}

	const defs = `
		<radialGradient id="diskBody" cx=".5" cy=".45" r=".75">
			<stop offset="0" stop-color="#0d1719"/>
			<stop offset=".58" stop-color="#070c0e"/>
			<stop offset="1" stop-color="#030506"/>
		</radialGradient>
		<linearGradient id="diskGold" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0" stop-color="#eed699"/>
			<stop offset=".5" stop-color="#aa7f37"/>
			<stop offset="1" stop-color="#e7c780"/>
		</linearGradient>
		<pattern id="diskGrid" width="24" height="24" patternUnits="userSpaceOnUse">
			<path d="M24 0H0V24" fill="none" stroke="#264244" stroke-width=".45" opacity=".16"/>
		</pattern>
		<pattern id="diskScan" width="4" height="4" patternUnits="userSpaceOnUse">
			<path d="M0 4L4 0" stroke="#5b7a74" stroke-width=".3" opacity=".055"/>
		</pattern>
		<filter id="diskBlur"><feGaussianBlur stdDeviation="10"/></filter>
	`;
	const body = `
		<rect width="${W}" height="${H}" fill="url(#diskBody)"/>
		<rect width="${W}" height="${H}" fill="url(#diskGrid)"/>
		<rect width="${W}" height="${H}" fill="url(#diskScan)"/>
		<g fill="none" stroke="#2b4042" opacity=".55">
			<circle cx="512" cy="384" r="512"/>
			<circle cx="512" cy="384" r="430"/>
			<circle cx="512" cy="384" r="356"/>
			<circle cx="512" cy="384" r="182"/>
		</g>
		<g>${ticks.join('\n')}</g>
		<g fill="none" stroke="${GOLD}" opacity=".34">
			<path d="M30 30H${W - 30}V${H - 30}H30Z"/>
			<path d="M42 42H${W - 42}V${H - 42}H42Z" opacity=".5"/>
		</g>
		${cornerBrackets(W, H, 20, 38, GOLD, 0.7)}
		<g>${slots.join('\n')}</g>
		<g>${chips.join('\n')}</g>
		<g font-family="${SANS}">
			<text x="512" y="46" fill="#e6ebe6" font-size="26" font-weight="300" text-anchor="middle" letter-spacing="7">VIRTUAL MEMORY</text>
			<text x="512" y="66" fill="${MUTED}" font-size="9" text-anchor="middle" letter-spacing="3.4">DISK / SWAP PLATTER · 20 PAGES · 80 KB</text>
		</g>
		<g font-family="${MONO}" fill="${FAINT}" font-size="8" letter-spacing="2.6">
			<text x="50" y="716">PAGE-IN / PAGE-OUT</text>
			<text x="50" y="732" opacity=".7">4 KB CLUSTERS · WRITE-BACK</text>
			<text x="${W - 50}" y="716" text-anchor="end">DMA CHANNEL 0x02</text>
			<text x="${W - 50}" y="732" text-anchor="end" opacity=".7">6272 RPM · 128 SECTORS</text>
		</g>
		<g fill="${GOLD}" opacity=".7">
			<circle cx="512" cy="716" r="2"/>
			<circle cx="536" cy="716" r="2" opacity=".55"/>
			<circle cx="560" cy="716" r="2" opacity=".35"/>
		</g>
		<g opacity=".4" filter="url(#diskBlur)">
			<ellipse cx="512" cy="384" rx="360" ry="250" fill="#193a3c" opacity=".28"/>
		</g>
		${screw(58, 58)}${screw(966, 58)}${screw(58, 710)}${screw(966, 710)}
	`;
	return { width: W, height: H, defs, body };
}

function frameAtlasSvg() {
	const W = 1024;
	const cell = W / 4;
	const rand = makeRandom(9917);
	const cells = [];
	for (let i = 0; i < FRAME_COUNT; i += 1) {
		const col = i % 4;
		const row = Math.floor(i / 4);
		const x = col * cell;
		const y = row * cell;
		const label = `F${String(i).padStart(2, '0')}`;
		const scratches = [];
		for (let s = 0; s < 9; s += 1) {
			scratches.push(
				`<path d="M${(x + 20 + rand() * 210).toFixed(1)} ${(y + 20 + rand() * 210).toFixed(1)}h${(4 + rand() * 26).toFixed(1)}" stroke="#9fb0b2" stroke-width=".4" opacity="${(0.04 + rand() * 0.05).toFixed(3)}"/>`
			);
		}
		cells.push(`
			<g>
				<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="#0a1113"/>
				<rect x="${x + 10}" y="${y + 10}" width="${cell - 20}" height="${cell - 20}" rx="14" fill="#070c0e" stroke="#37474a" stroke-width="1.2"/>
				<rect x="${x + 22}" y="${y + 22}" width="${cell - 44}" height="${cell - 44}" rx="10" fill="#030708" stroke="#1c2a2c" stroke-width="1"/>
				<rect x="${x + 30}" y="${y + 30}" width="${cell - 60}" height="${cell - 60}" rx="7" fill="none" stroke="#2b3d40" stroke-width=".8"/>
				<g>${scratches.join('\n')}</g>
				<g font-family="${MONO}" fill="#6c7f81" text-anchor="middle">
					<text x="${x + cell / 2}" y="${y + 66}" font-size="11" letter-spacing="3">PAGE FRAME</text>
					<text x="${x + cell / 2}" y="${y + 148}" fill="#d8b36a" opacity=".58" font-size="40" letter-spacing="3">${label}</text>
					<text x="${x + cell / 2}" y="${y + 174}" font-size="8" letter-spacing="2.4" opacity=".7">EMPTY · READY</text>
				</g>
				<g fill="none" stroke="#d8b36a" stroke-width="1" opacity=".28">
					<path d="M${x + 34} ${y + 60}V${y + 34}H${x + 60}"/>
					<path d="M${x + cell - 60} ${y + 34}H${x + cell - 34}V${y + 60}"/>
					<path d="M${x + cell - 34} ${y + cell - 60}V${y + cell - 34}H${x + cell - 60}"/>
					<path d="M${x + 60} ${y + cell - 34}H${x + 34}V${y + cell - 60}"/>
				</g>
				<g fill="#c9a45e" opacity=".5">
					<rect x="${x + 19}" y="${y + 19}" width="7" height="7"/>
					<rect x="${x + cell - 26}" y="${y + 19}" width="7" height="7"/>
					<rect x="${x + 19}" y="${y + cell - 26}" width="7" height="7"/>
					<rect x="${x + cell - 26}" y="${y + cell - 26}" width="7" height="7"/>
				</g>
			</g>`);
	}
	const defs = `
		<pattern id="frameGrain" width="5" height="5" patternUnits="userSpaceOnUse">
			<path d="M0 1H5M0 4H5" stroke="#8ba3a4" stroke-width=".3" opacity=".05"/>
		</pattern>
	`;
	const body = `<rect width="${W}" height="${W}" fill="url(#frameGrain)"/>${cells.join('\n')}`;
	return { width: W, height: W, defs, body };
}

function pageAtlasSvg() {
	const cols = 5;
	const rows = 4;
	const cell = 256;
	const W = cols * cell;
	const H = rows * cell;
	const hues = [
		['#123437', '#1c5b58', '#0a1c1f'],
		['#2c2414', '#6b5320', '#181208'],
		['#151c38', '#2c3f74', '#0a0e1c'],
		['#2b1526', '#6a2f52', '#1a0b15'],
		['#142a24', '#2c6a52', '#0a1713']
	];
	const cells = [];
	const rand = makeRandom(7713);
	for (let i = 0; i < PAGE_COUNT; i += 1) {
		const col = i % cols;
		const row = Math.floor(i / cols);
		const x = col * cell;
		const y = row * cell;
		const label = `P${String(i).padStart(2, '0')}`;
		const palette = hues[i % hues.length];
		const bars = [];
		for (let b = 0; b < 21; b += 1) {
			const w = b % 3 === 0 ? 2 : 1;
			const h = 4 + (b % 5) * 3 + (2 === b % 4 ? 3 : 0);
			bars.push(`<rect x="${x + 34 + b * 8}" y="${y + 206 - h}" width="${w}" height="${h}" opacity=".55"/>`);
		}
		const traces = [];
		for (let t = 0; t < 6; t += 1) {
			traces.push(
				`<path d="M${x + 28 + rand() * 40} ${y + 42 + t * 8}H${x + 120 + rand() * 90}" stroke="#9ac7c2" stroke-width=".4" opacity=".12"/>`
			);
		}
		cells.push(`
			<g>
				<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="${palette[2]}"/>
				<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="${palette[0]}" opacity=".72"/>
				<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="url(#pageSheen)" opacity=".55"/>
				<rect x="${x + 6}" y="${y + 6}" width="${cell - 12}" height="${cell - 12}" rx="12" fill="none" stroke="#d8b36a" stroke-opacity=".46" stroke-width="1.2"/>
				<rect x="${x + 13}" y="${y + 13}" width="${cell - 26}" height="${cell - 26}" rx="8" fill="none" stroke="#7e9698" stroke-opacity=".2" stroke-width=".7"/>
				<g>${traces.join('\n')}</g>
				<g font-family="${MONO}" fill="#cfe4de">
					<text x="${x + 28}" y="${y + 40}" font-size="9" letter-spacing="3" opacity=".8">PAGE ${String(i).padStart(2, '0')}</text>
					<text x="${x + cell - 28}" y="${y + 40}" font-size="9" letter-spacing="2" text-anchor="end" fill="#d8b36a" opacity=".82">4 KB</text>
				</g>
				<text x="${x + cell / 2}" y="${y + 138}" font-family="${SANS}" font-size="82" font-weight="300" letter-spacing="2" fill="#eaf2ec" text-anchor="middle" opacity=".94">${label}</text>
				<text x="${x + cell / 2}" y="${y + 166}" font-family="${MONO}" font-size="8" letter-spacing="4" fill="#9fb3b1" text-anchor="middle" opacity=".75">VIRTUAL ADDRESS SPACE</text>
				<g fill="#d8b36a" opacity=".5">${bars.join('')}</g>
				<g font-family="${MONO}" fill="#8fa4a2" font-size="7" letter-spacing="1.6">
					<text x="${x + 28}" y="${y + 236}">0x${(0x2a00 + i * 0x10).toString(16).toUpperCase()}</text>
					<text x="${x + cell - 28}" y="${y + 236}" text-anchor="end" opacity=".75">CRC ${(0x4f + i * 7).toString(16).toUpperCase()}</text>
				</g>
				<g fill="none" stroke="#d8b36a" stroke-width="1" opacity=".4">
					<path d="M${x + 18} ${y + 46}V${y + 18}H${x + 46}"/>
					<path d="M${x + cell - 46} ${y + 18}H${x + cell - 18}V${y + 46}"/>
					<path d="M${x + cell - 18} ${y + cell - 46}V${y + cell - 18}H${x + cell - 46}"/>
					<path d="M${x + 46} ${y + cell - 18}H${x + 18}V${y + cell - 46}"/>
				</g>
				<g fill="#d8b36a" opacity=".35">
					<rect x="${x + 10}" y="${y + cell - 16}" width="${cell - 20}" height="3" rx="1.5"/>
				</g>
			</g>`);
	}
	const defs = `
		<linearGradient id="pageSheen" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0" stop-color="#6ce8d4" stop-opacity=".22"/>
			<stop offset=".34" stop-color="#577dff" stop-opacity=".05"/>
			<stop offset=".62" stop-color="#d85cff" stop-opacity=".15"/>
			<stop offset=".84" stop-color="#ffbd5c" stop-opacity=".08"/>
			<stop offset="1" stop-color="#69f1dc" stop-opacity=".14"/>
		</linearGradient>
		<pattern id="pageGrid" width="16" height="16" patternUnits="userSpaceOnUse">
			<path d="M16 0H0V16" fill="none" stroke="#a7c4c0" stroke-width=".35" opacity=".1"/>
		</pattern>
	`;
	const body = `<rect width="${W}" height="${H}" fill="url(#pageGrid)"/>${cells.join('\n')}`;
	return { width: W, height: H, defs, body };
}

function labelAtlasSvg() {
	const W = 1024;
	const H = 256;
	const cellW = 256;
	const cellH = 64;
	const cells = [];
	for (let i = 0; i < FRAME_COUNT; i += 1) {
		const col = i % 4;
		const row = Math.floor(i / 4);
		const x = col * cellW;
		const y = row * cellH;
		cells.push(`
			<g>
				<rect x="${x}" y="${y}" width="${cellW}" height="${cellH}" fill="#0a1113"/>
				<path d="M${x + 4} ${y + cellH - 4}H${x + cellW - 4}" stroke="#d8b36a" stroke-opacity=".35"/>
				<text x="${x + 18}" y="${y + 42}" font-family="${SANS}" font-size="30" letter-spacing="2" fill="#d8b36a" opacity=".92">F${String(i).padStart(2, '0')}</text>
				<text x="${x + cellW - 16}" y="${y + 38}" font-family="${MONO}" font-size="9" letter-spacing="2" fill="#6f8284" text-anchor="end">FRAME</text>
			</g>`);
	}
	return { width: W, height: H, defs: '', body: cells.join('\n') };
}

function metalOrmSvg() {
	const W = 512;
	const rand = makeRandom(6163);
	const streaks = [];
	for (let i = 0; i < 150; i += 1) {
		const y = rand() * W;
		streaks.push(
			`<path d="M0 ${y.toFixed(1)}H${W}" stroke="rgb(255,${(60 + rand() * 70).toFixed(0)},255)" stroke-width="${(0.4 + rand() * 1.5).toFixed(2)}" opacity="${(0.14 + rand() * 0.2).toFixed(2)}"/>`
		);
	}
	const defs = `
		<linearGradient id="metalRough" x1="0" y1="0" x2=".8" y2="1">
			<stop offset="0" stop-color="rgb(255,78,255)"/>
			<stop offset=".42" stop-color="rgb(255,52,255)"/>
			<stop offset=".72" stop-color="rgb(255,104,255)"/>
			<stop offset="1" stop-color="rgb(255,58,255)"/>
		</linearGradient>
	`;
	const body = `
		<rect width="${W}" height="${W}" fill="url(#metalRough)"/>
		${streaks.join('\n')}
		<rect x="18" y="18" width="${W - 36}" height="${W - 36}" rx="8" fill="none" stroke="rgb(255,190,255)" stroke-width="2" opacity=".8"/>
	`;
	return { width: W, height: W, defs, body };
}

function boardOrmSvg() {
	const W = 512;
	const rand = makeRandom(3121);
	const blocks = [];
	for (let i = 0; i < 60; i += 1) {
		blocks.push(
			`<rect x="${(rand() * W).toFixed(1)}" y="${(rand() * W).toFixed(1)}" width="${(6 + rand() * 54).toFixed(1)}" height="${(4 + rand() * 30).toFixed(1)}" fill="rgb(255,${(150 + rand() * 80).toFixed(0)},${(30 + rand() * 40).toFixed(0)})" opacity=".28"/>`
		);
	}
	const defs = `
		<linearGradient id="boardRough" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0" stop-color="rgb(255,206,48)"/>
			<stop offset=".5" stop-color="rgb(255,180,40)"/>
			<stop offset="1" stop-color="rgb(255,224,70)"/>
		</linearGradient>
		<pattern id="boardFiber" width="9" height="9" patternUnits="userSpaceOnUse">
			<path d="M0 4.5H9" stroke="rgb(255,120,20)" stroke-width="1" opacity=".4"/>
		</pattern>
	`;
	const body = `
		<rect width="${W}" height="${W}" fill="url(#boardRough)"/>
		<rect width="${W}" height="${W}" fill="url(#boardFiber)"/>
		${blocks.join('\n')}
	`;
	return { width: 512, height: 512, defs, body };
}

const textureDefs = [
	{ key: 'ramColor', name: 'ram-color', ...ramBoardSvg() },
	{ key: 'diskColor', name: 'disk-color', ...diskBoardSvg() },
	{ key: 'frameColor', name: 'frame-atlas', ...frameAtlasSvg() },
	{ key: 'pageColor', name: 'page-atlas', ...pageAtlasSvg() },
	{ key: 'labelColor', name: 'frame-label-atlas', ...labelAtlasSvg() },
	{ key: 'metalOrm', name: 'metal-orm', ...metalOrmSvg() },
	{ key: 'boardOrm', name: 'board-orm', ...boardOrmSvg() }
];

console.log('› Generating paging PBR atlases...');
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

function applyTransform(
	geometry,
	{ position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1], matrix = null } = {}
) {
	const clone = geometry.clone();
	if (matrix) {
		clone.applyMatrix4(matrix);
		return clone;
	}
	const transform = new THREE.Matrix4().compose(
		new THREE.Vector3(...position),
		new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
		new THREE.Vector3(...scale)
	);
	clone.applyMatrix4(transform);
	return clone;
}

function mergePieces(pieces) {
	const geometries = pieces.map((piece) =>
		piece.index ? piece.toNonIndexed() : piece
	);
	return mergeGeometries(geometries, false);
}

/**
 * Remap a plane's UVs into an atlas cell using three's bottom-left convention,
 * then flip V once so the artwork survives the glTF top-left UV convention
 * (GLTFLoader sets texture.flipY = false).
 */
function atlasUV(geometry, { cols, rows, index, flip = true }) {
	const col = index % cols;
	const row = Math.floor(index / cols);
	const u0 = col / cols;
	const u1 = (col + 1) / cols;
	const v0 = 1 - (row + 1) / rows;
	const v1 = 1 - row / rows;
	const uv = geometry.getAttribute('uv');
	for (let i = 0; i < uv.count; i += 1) {
		const u = u0 + uv.getX(i) * (u1 - u0);
		const v = v0 + uv.getY(i) * (v1 - v0);
		uv.setXY(i, u, flip ? 1 - v : v);
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

function frontPlane(w, h) {
	return new THREE.PlaneGeometry(w, h);
}

function flatPlane(w, d) {
	const geometry = new THREE.PlaneGeometry(w, d);
	geometry.rotateX(-Math.PI / 2);
	return geometry;
}

/* -------------------------------------------------------------------------- */
/* Layout                                                                     */
/* -------------------------------------------------------------------------- */

const TILT = -0.16;
const BOARD_POSITION = new THREE.Vector3(0, 2.58, -1.9);
const BOARD_QUAT = new THREE.Quaternion().setFromEuler(new THREE.Euler(TILT, 0, 0));
const BOARD_MATRIX = new THREE.Matrix4().compose(
	BOARD_POSITION,
	BOARD_QUAT,
	new THREE.Vector3(1, 1, 1)
);
const BOARD_W = 4.66;
const BOARD_H = 5.1;
const FRAME_Z = 0.17;
const FRAME_COLS = 4;
const FRAME_ROWS = 4;
const FRAME_PITCH_X = 1.02;
const FRAME_PITCH_Y = 1.02;
const FRAME_ROW_Y = [1.28, 0.26, -0.76, -1.78];
const FRAME_COL_X = [-1.53, -0.51, 0.51, 1.53];

const DISK_CENTER_Z = 1.8;
const DISK_W = 4.8;
const DISK_D = 3.6;
const PAGE_COLS = 5;
const PAGE_ROWS = 4;
const PAGE_Y = 0.1215 + 0.03 + 0.0015;

const frameTransform = (index) => {
	const col = index % FRAME_COLS;
	const row = Math.floor(index / FRAME_COLS);
	const matrix = BOARD_MATRIX.clone().multiply(
		new THREE.Matrix4().makeTranslation(FRAME_COL_X[col], FRAME_ROW_Y[row], FRAME_Z)
	);
	return matrix;
};

const pagePosition = (index) => {
	const col = index % PAGE_COLS;
	const row = Math.floor(index / PAGE_COLS);
	return new THREE.Vector3(
		-1.56 + col * 0.78,
		PAGE_Y,
		DISK_CENTER_Z + (row - 1.5) * 0.72
	);
};

/* -------------------------------------------------------------------------- */
/* Document + materials                                                       */
/* -------------------------------------------------------------------------- */

const doc = new Document();
doc.createExtension(KHRMaterialsIridescence).setRequired(true);
const buffer = doc.createBuffer();
const scene = doc.createScene('Virtual memory');

function texture(key, name) {
	return doc
		.createTexture(name)
		.setImage(textureBuffers[key])
		.setMimeType('image/png')
		.setURI(`${name}.png`);
}

const textures = {
	ram: texture('ramColor', 'ram-color'),
	disk: texture('diskColor', 'disk-color'),
	frame: texture('frameColor', 'frame-atlas'),
	page: texture('pageColor', 'page-atlas'),
	label: texture('labelColor', 'frame-label-atlas'),
	metalOrm: texture('metalOrm', 'metal-orm'),
	boardOrm: texture('boardOrm', 'board-orm')
};

const materials = {};

materials.boardBody = doc
	.createMaterial('Board chassis')
	.setBaseColorFactor([0.012, 0.016, 0.018, 1])
	.setMetallicFactor(0.55)
	.setRoughnessFactor(0.46);

materials.boardTop = doc
	.createMaterial('RAM backplane')
	.setBaseColorTexture(textures.ram)
	.setMetallicRoughnessTexture(textures.boardOrm)
	.setMetallicFactor(0.55)
	.setRoughnessFactor(1);

materials.diskBody = doc
	.createMaterial('Disk chassis')
	.setBaseColorFactor([0.014, 0.018, 0.021, 1])
	.setMetallicFactor(0.5)
	.setRoughnessFactor(0.42);

materials.diskTop = doc
	.createMaterial('Disk platter')
	.setBaseColorTexture(textures.disk)
	.setMetallicRoughnessTexture(textures.boardOrm)
	.setMetallicFactor(0.42)
	.setRoughnessFactor(1);

materials.frameBody = doc
	.createMaterial('Frame body')
	.setBaseColorFactor([0.024, 0.028, 0.03, 1])
	.setMetallicFactor(0.66)
	.setRoughnessFactor(0.36);

materials.frameTop = doc
	.createMaterial('Frame recess')
	.setBaseColorTexture(textures.frame)
	.setMetallicRoughnessTexture(textures.metalOrm)
	.setMetallicFactor(0.78)
	.setRoughnessFactor(1);

materials.frameRail = doc
	.createMaterial('Frame rail')
	.setBaseColorFactor([0.3, 0.32, 0.34, 1])
	.setMetallicFactor(1)
	.setRoughnessFactor(0.28);

materials.gold = doc
	.createMaterial('ENIG gold')
	.setBaseColorFactor([0.72, 0.52, 0.24, 1])
	.setMetallicFactor(1)
	.setRoughnessFactor(0.26);

materials.label = doc
	.createMaterial('Frame label')
	.setBaseColorTexture(textures.label)
	.setMetallicFactor(0.35)
	.setRoughnessFactor(0.4);

materials.pageBody = doc
	.createMaterial('Page substrate')
	.setBaseColorFactor([0.02, 0.028, 0.034, 1])
	.setMetallicFactor(0.7)
	.setRoughnessFactor(0.24);

materials.pageTop = doc
	.createMaterial('Page face')
	.setBaseColorTexture(textures.page)
	.setMetallicRoughnessTexture(textures.metalOrm)
	.setMetallicFactor(0.62)
	.setRoughnessFactor(1);

materials.copper = doc
	.createMaterial('Bus copper')
	.setBaseColorFactor([0.5, 0.27, 0.15, 1])
	.setMetallicFactor(1)
	.setRoughnessFactor(0.34);

materials.led = doc
	.createMaterial('Status LED')
	.setBaseColorFactor([0.9, 0.45, 0.12, 1])
	.setEmissiveFactor([1, 0.46, 0.12])
	.setMetallicFactor(0.1)
	.setRoughnessFactor(0.4);

const iridescence = doc.createExtension(KHRMaterialsIridescence);
const pageIridescence = iridescence
	.createIridescence()
	.setIridescenceFactor(0.34)
	.setIridescenceIOR(1.38)
	.setIridescenceThicknessMinimum(120)
	.setIridescenceThicknessMaximum(380);
materials.pageTop.setExtension('KHR_materials_iridescence', pageIridescence);

/* -------------------------------------------------------------------------- */
/* geometry collections                                                       */
/* -------------------------------------------------------------------------- */

const boardBodies = [];
const boardArts = [];
const boardTrim = [];
const boardLeds = [];

const diskBodies = [];
const diskArts = [];
const diskTrim = [];
const diskLeds = [];

const frameBodies = [];
const frameArts = [];
const frameRails = [];
const frameStuds = [];
const frameLabelPlanes = [];

const busPieces = [];

const pageBodies = [];
const pageArts = [];

/* ------------------------------- board ------------------------------------ */

boardBodies.push(
	applyTransform(roundBox(BOARD_W, BOARD_H, 0.16, 0.03, 4), { position: [0, 0, 0] })
);
boardArts.push(
	flipV(frontPlane(BOARD_W - 0.02, BOARD_H - 0.02)).translate(0, 0, 0.081)
);
for (const x of [-BOARD_W / 2 + 0.02, BOARD_W / 2 - 0.02]) {
	boardTrim.push(
		applyTransform(new THREE.BoxGeometry(0.024, BOARD_H - 0.14, 0.02), {
			position: [x, 0, 0.083]
		})
	);
}
for (const y of [-BOARD_H / 2 + 0.03, BOARD_H / 2 - 0.03]) {
	boardTrim.push(
		applyTransform(new THREE.BoxGeometry(BOARD_W - 0.14, 0.024, 0.02), {
			position: [0, y, 0.083]
		})
	);
}
boardLeds.push(
	applyTransform(new THREE.BoxGeometry(1.7, 0.012, 0.014), { position: [0, 2.47, 0.086] })
);
for (const x of [-1.66, 1.66]) {
	boardTrim.push(
		applyTransform(new THREE.BoxGeometry(0.09, 0.09, 0.02), {
			position: [x, 2.47, 0.085]
		})
	);
}

/* ------------------------------- frames ----------------------------------- */

for (let i = 0; i < FRAME_COUNT; i += 1) {
	const matrix = frameTransform(i);

	frameBodies.push(
		applyTransform(roundBox(FRAME_SIZE, FRAME_SIZE, 0.07, 0.014, 3), {
			matrix: matrix.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, -0.055))
		})
	);

	const art = atlasUV(frontPlane(FRAME_SIZE, FRAME_SIZE), {
		cols: 4,
		rows: 4,
		index: i
	});
	art.applyMatrix4(matrix.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, -0.0195)));
	frameArts.push(art);

	for (const y of [-0.425, 0.425]) {
		frameRails.push(
			applyTransform(new THREE.BoxGeometry(0.9, 0.05, 0.06), {
				matrix: matrix.clone().multiply(new THREE.Matrix4().makeTranslation(0, y, 0.01))
			})
		);
	}
	for (const x of [-0.425, 0.425]) {
		frameRails.push(
			applyTransform(new THREE.BoxGeometry(0.05, 0.8, 0.06), {
				matrix: matrix.clone().multiply(new THREE.Matrix4().makeTranslation(x, 0, 0.01))
			})
		);
	}
	for (const [x, y] of [
		[-0.425, -0.425],
		[0.425, -0.425],
		[-0.425, 0.425],
		[0.425, 0.425]
	]) {
		frameStuds.push(
			applyTransform(new THREE.BoxGeometry(0.032, 0.032, 0.012), {
				matrix: matrix.clone().multiply(new THREE.Matrix4().makeTranslation(x, y, 0.044))
			})
		);
	}

	const label = atlasUV(frontPlane(0.26, 0.065), {
		cols: 4,
		rows: 4,
		index: i
	});
	label.applyMatrix4(
		matrix.clone().multiply(new THREE.Matrix4().makeTranslation(0, -0.425, 0.0415))
	);
	frameLabelPlanes.push(label);
}

/* ------------------------------- bus -------------------------------------- */

const busDeck = roundBox(2.5, 0.03, 1.72, 0.014, 3);
busPieces.push({
	geometry: applyTransform(busDeck, { position: [0, 0.016, -0.86] }),
	material: materials.frameBody
});
for (let i = 0; i < 7; i += 1) {
	const x = -0.9 + i * 0.3;
	const curve = new THREE.CatmullRomCurve3([
		new THREE.Vector3(x * 0.85, 0.034, 0.14),
		new THREE.Vector3(x * 1.15, 0.046, -0.55),
		new THREE.Vector3(x, 0.036, -1.28),
		new THREE.Vector3(x * 0.62, 0.03, -1.76)
	]);
	busPieces.push({
		geometry: new THREE.TubeGeometry(curve, 24, 0.009, 5, false),
		material: materials.copper
	});
}
for (const x of [-1.18, 1.18]) {
	busPieces.push({
		geometry: applyTransform(new THREE.BoxGeometry(0.06, 0.024, 1.62), {
			position: [x, 0.03, -0.78]
		}),
		material: materials.gold
	});
}

/* ------------------------------- disk ------------------------------------- */

diskBodies.push(
	applyTransform(roundBox(DISK_W, 0.12, DISK_D, 0.05, 3), {
		position: [0, 0.06, DISK_CENTER_Z]
	})
);
{
	const art = flipV(frontPlane(DISK_W - 0.06, DISK_D - 0.06));
	art.rotateX(-Math.PI / 2);
	art.applyMatrix4(new THREE.Matrix4().makeTranslation(0, 0.1212, DISK_CENTER_Z));
	diskArts.push(art);
}
for (const z of [0.03, DISK_D - 0.03]) {
	diskTrim.push(
		applyTransform(new THREE.BoxGeometry(DISK_W - 0.1, 0.016, 0.024), {
			position: [0, 0.13, z]
		})
	);
}
for (const x of [-DISK_W / 2 + 0.04, DISK_W / 2 - 0.04]) {
	diskTrim.push(
		applyTransform(new THREE.BoxGeometry(0.024, 0.016, DISK_D - 0.1), {
			position: [x, 0.13, DISK_CENTER_Z]
		})
	);
}
diskLeds.push(
	applyTransform(new THREE.BoxGeometry(1.3, 0.012, 0.014), {
		position: [0, 0.132, DISK_D - 0.09]
	})
);

/* ------------------------------- pages ------------------------------------ */

for (let i = 0; i < PAGE_COUNT; i += 1) {
	// Geometry stays local; the page node carries the disk position so it can be
	// flown between disk and frame at runtime without rebaking transforms.
	pageBodies.push(roundBox(PAGE_SIZE, 0.06, PAGE_SIZE, 0.012, 3));

	const art = atlasUV(flatPlane(PAGE_SIZE - 0.02, PAGE_SIZE - 0.02), {
		cols: 5,
		rows: 4,
		index: i
	});
	art.translate(0, 0.0315, 0);
	pageArts.push({ geometry: art, page: i });
}

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

function addStaticNode(name, meshName, primitiveList) {
	const node = doc.createNode(name);
	const mesh = doc.createMesh(meshName);
	node.setMesh(mesh);
	scene.addChild(node);
	for (const item of primitiveList) {
		addPrimitive(mesh, mergePieces(item.geometries), item.material);
	}
	return node;
}

// Board ---------------------------------------------------------------------
{
	const node = doc.createNode('ram-board');
	node.setTranslation(BOARD_POSITION.toArray());
	node.setRotation(BOARD_QUAT.toArray());
	const mesh = doc.createMesh('ram-board');
	node.setMesh(mesh);
	scene.addChild(node);
	addPrimitive(mesh, mergePieces(boardBodies), materials.boardBody);
	addPrimitive(mesh, mergePieces(boardArts), materials.boardTop);
	addPrimitive(mesh, mergePieces(boardTrim), materials.gold);
	addPrimitive(mesh, mergePieces(boardLeds), materials.led);
}

// Disk ----------------------------------------------------------------------
{
	const node = doc.createNode('disk-platter');
	const mesh = doc.createMesh('disk-platter');
	node.setMesh(mesh);
	scene.addChild(node);
	addPrimitive(mesh, mergePieces(diskBodies), materials.diskBody);
	addPrimitive(mesh, mergePieces(diskArts), materials.diskTop);
	addPrimitive(mesh, mergePieces(diskTrim), materials.gold);
	addPrimitive(mesh, mergePieces(diskLeds), materials.led);
}

// Frames --------------------------------------------------------------------
{
	const node = doc.createNode('frame-plates');
	const mesh = doc.createMesh('frame-plates');
	node.setMesh(mesh);
	scene.addChild(node);
	addPrimitive(mesh, mergePieces(frameBodies), materials.frameBody);
	addPrimitive(mesh, mergePieces(frameArts), materials.frameTop);
}
{
	const node = doc.createNode('frame-trim');
	const mesh = doc.createMesh('frame-trim');
	node.setMesh(mesh);
	scene.addChild(node);
	addPrimitive(mesh, mergePieces(frameRails), materials.frameRail);
	addPrimitive(mesh, mergePieces(frameStuds), materials.gold);
}
{
	const node = doc.createNode('frame-labels');
	const mesh = doc.createMesh('frame-labels');
	node.setMesh(mesh);
	scene.addChild(node);
	addPrimitive(mesh, mergePieces(frameLabelPlanes), materials.label);
}

// Bus -----------------------------------------------------------------------
{
	const node = doc.createNode('memory-bus');
	const mesh = doc.createMesh('memory-bus');
	node.setMesh(mesh);
	scene.addChild(node);
	addPrimitive(
		mesh,
		mergePieces(busPieces.filter((piece) => piece.material === materials.frameBody).map((piece) => piece.geometry)),
		materials.frameBody
	);
	addPrimitive(
		mesh,
		mergePieces(busPieces.filter((piece) => piece.material === materials.copper).map((piece) => piece.geometry)),
		materials.copper
	);
	addPrimitive(
		mesh,
		mergePieces(busPieces.filter((piece) => piece.material === materials.gold).map((piece) => piece.geometry)),
		materials.gold
	);
}

// Frame anchors (empty nodes) ----------------------------------------------
for (let i = 0; i < FRAME_COUNT; i += 1) {
	const matrix = frameTransform(i);
	const position = new THREE.Vector3();
	const quaternion = new THREE.Quaternion();
	const scale = new THREE.Vector3();
	matrix.decompose(position, quaternion, scale);
	const node = doc.createNode(`frame-${String(i).padStart(2, '0')}`);
	node.setTranslation(position.toArray());
	node.setRotation(quaternion.toArray());
	scene.addChild(node);
}

// Pages ---------------------------------------------------------------------
for (let i = 0; i < PAGE_COUNT; i += 1) {
	const position = pagePosition(i);
	const node = doc.createNode(`page-${String(i).padStart(2, '0')}`);
	node.setTranslation(position.toArray());
	const mesh = doc.createMesh(`page-${String(i).padStart(2, '0')}`);
	node.setMesh(mesh);
	scene.addChild(node);

	addPrimitive(
		mesh,
		mergePieces(pageBodies.filter((_, index) => index === i)),
		materials.pageBody
	);
	addPrimitive(mesh, pageArts.find((piece) => piece.page === i).geometry, materials.pageTop);
}

/* -------------------------------------------------------------------------- */
/* Write + compress                                                           */
/* -------------------------------------------------------------------------- */

const io = new NodeIO().registerExtensions([KHRMaterialsIridescence]);
const sourceBytes = await io.writeBinary(doc);
const sourcePath = path.join(CACHE, 'paging-model.source.glb');
await fs.writeFile(sourcePath, sourceBytes);
console.log(`› Source GLB written (${fmt(sourceBytes.byteLength)})`);

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
run(cli, ['weld', sourcePath, temp('paging.weld.glb')]);
run(cli, ['dedup', temp('paging.weld.glb'), temp('paging.dedup.glb')]);
run(cli, ['prune', temp('paging.dedup.glb'), temp('paging.pruned.glb'), '--keep-leaves', 'true']);

console.log('› Compressing textures with KTX2 / ETC1S...');
run(cli, [
	'etc1s',
	temp('paging.pruned.glb'),
	temp('paging.ktx2.glb'),
	'--quality',
	'192',
	'--compression',
	'2'
]);

console.log('› Compressing geometry with Draco...');
run(cli, [
	'draco',
	temp('paging.ktx2.glb'),
	path.join(MODEL_DIR, 'paging-model.glb'),
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

const finalPath = path.join(MODEL_DIR, 'paging-model.glb');
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
const nodeNames = (finalJson.nodes ?? []).map((node) => node.name);
const expectedFrames = Array.from({ length: FRAME_COUNT }, (_, i) => `frame-${String(i).padStart(2, '0')}`);
const expectedPages = Array.from({ length: PAGE_COUNT }, (_, i) => `page-${String(i).padStart(2, '0')}`);
const missing = [...expectedFrames, ...expectedPages].filter((name) => !nodeNames.includes(name));
if (missing.length) {
	throw new Error(`Final GLB is missing nodes: ${missing.join(', ')}`);
}
if (!(finalJson.extensionsUsed ?? []).includes('KHR_draco_mesh_compression')) {
	throw new Error('Final GLB is not Draco compressed.');
}
if (!(finalJson.extensionsUsed ?? []).includes('KHR_texture_basisu')) {
	throw new Error('Final GLB is not KTX2 compressed.');
}

let triangles = 0;
for (const mesh of doc.getRoot().listMeshes()) {
	for (const primitive of mesh.listPrimitives()) {
		const count = primitive.getIndices()?.getCount() ?? primitive.getAttribute('POSITION').getCount();
		triangles += Math.floor(count / 3);
	}
}

console.log(`✓ Final model written (${fmt(finalBytes.size)})`);
console.log(`  extensions: ${(finalJson.extensionsUsed ?? []).join(', ')}`);
console.log(`  nodes: ${nodeNames.filter((name) => /^frame-\d\d$/.test(name)).length} frame anchors, ${nodeNames.filter((name) => name.startsWith('page-')).length} pages`);
console.log(`  statics: ${nodeNames.filter((name) => !/^(frame|page)-/.test(name)).join(', ')}`);
console.log(`  triangles (pre-compression): ${triangles.toLocaleString()}`);
console.log(`  textures: ${textureDefs.length} maps (${textureDefs.map((t) => t.key).join(', ')})`);
