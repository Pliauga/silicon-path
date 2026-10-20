#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-unused-vars -- vendored model-build script: leftover tuning constants kept for reference */
/**
 * Silicon Path — procedural CPU package asset pipeline.
 *
 * Generates the PBR texture set, assembles the package geometry, writes a
 * source GLB, then uses glTF-Transform + KTX-Software to produce the final
 * Draco + KTX2 compressed asset used by the Svelte component.
 *
 * Run: npm run build:model
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
/* Textures                                                                   */
/* -------------------------------------------------------------------------- */

function pcbColorSvg() {
	const W = 1024;
	const rand = makeRandom(1080);
	const traces = [];
	const vias = [];
	const edgePads = [];

	for (let i = 0; i < 22; i += 1) {
		const side = i % 4;
		const t = 0.08 + rand() * 0.84;
		const offset = 42 + rand() * 54;
		if (side === 0) {
			traces.push(
				`<path d="M${offset} ${t * W} H${offset + 40 + rand() * 80} V${t * W + (rand() - 0.5) * 90}" />`
			);
		} else if (side === 1) {
			traces.push(
				`<path d="M${W - offset} ${t * W} H${W - offset - 40 - rand() * 80} V${t * W + (rand() - 0.5) * 90}" />`
			);
		} else if (side === 2) {
			traces.push(
				`<path d="M${t * W} ${offset} V${offset + 40 + rand() * 80} H${t * W + (rand() - 0.5) * 90}" />`
			);
		} else {
			traces.push(
				`<path d="M${t * W} ${W - offset} V${W - offset - 40 - rand() * 80} H${t * W + (rand() - 0.5) * 90}" />`
			);
		}
	}

	for (let i = 0; i < 46; i += 1) {
		const x = 26 + rand() * (W - 52);
		const y = 26 + rand() * (W - 52);
		const edge = Math.min(x, y, W - x, W - y);
		if (edge > 128) continue;
		vias.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(2.3 + rand() * 1.8).toFixed(1)}" />`);
	}

	for (let i = 0; i < 40; i += 1) {
		const pad = 18;
		const x = 26 + i * 24.2;
		if (x > W - 26) break;
		edgePads.push(`<rect x="${x.toFixed(1)}" y="18" width="${pad}" height="7" rx="2" />`);
		edgePads.push(`<rect x="${x.toFixed(1)}" y="${W - 25}" width="${pad}" height="7" rx="2" />`);
		edgePads.push(`<rect x="18" y="${x.toFixed(1)}" width="7" height="${pad}" rx="2" />`);
		edgePads.push(`<rect x="${W - 25}" y="${x.toFixed(1)}" width="7" height="${pad}" rx="2" />`);
	}

	const defs = `
		<linearGradient id="board" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0" stop-color="#0b1915"/>
			<stop offset=".48" stop-color="#07110f"/>
			<stop offset="1" stop-color="#040908"/>
		</linearGradient>
		<radialGradient id="solderGlow" cx=".5" cy=".45" r=".7">
			<stop offset="0" stop-color="#15352b" stop-opacity=".55"/>
			<stop offset=".6" stop-color="#0b1c17" stop-opacity=".18"/>
			<stop offset="1" stop-color="#000" stop-opacity="0"/>
		</radialGradient>
		<pattern id="weave" width="18" height="18" patternUnits="userSpaceOnUse">
			<path d="M0 0L18 18M18 0L0 18" stroke="#2c5b4a" stroke-width=".55" opacity=".22"/>
		</pattern>
		<pattern id="microgrid" width="32" height="32" patternUnits="userSpaceOnUse">
			<path d="M32 0H0V32" fill="none" stroke="#234a3d" stroke-width=".5" opacity=".18"/>
		</pattern>
		<linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0" stop-color="#e8c57a"/>
			<stop offset=".45" stop-color="#a9772f"/>
			<stop offset="1" stop-color="#f0cf8a"/>
		</linearGradient>
		<filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
			<feGaussianBlur stdDeviation="8"/>
		</filter>
	`;
	const body = `
		<rect width="${W}" height="${W}" fill="url(#board)"/>
		<rect width="${W}" height="${W}" fill="url(#weave)"/>
		<rect width="${W}" height="${W}" fill="url(#microgrid)"/>
		<rect x="210" y="190" width="604" height="644" rx="44" fill="#020505" opacity=".78"/>
		<rect x="223" y="203" width="578" height="618" rx="38" fill="url(#solderGlow)"/>
		<g fill="none" stroke="url(#gold)" stroke-width="1.45" opacity=".54" stroke-linecap="round">
			${traces.join('\n')}
		</g>
		<g fill="#c39a4e" opacity=".78">
			${vias.join('\n')}
		</g>
		<g fill="url(#gold)" opacity=".82">
			${edgePads.join('\n')}
		</g>
		<g fill="none" stroke="#a17a37" stroke-width="1.2" opacity=".42">
			<rect x="12" y="12" width="${W - 24}" height="${W - 24}" rx="12"/>
			<rect x="31" y="31" width="${W - 62}" height="${W - 62}" rx="8"/>
		</g>
		<g fill="#d9d2bb" font-family="${SANS}" opacity=".64">
			<text x="54" y="966" font-size="21" letter-spacing="5">SILICON PATH</text>
			<text x="54" y="994" font-size="12" letter-spacing="3.4" opacity=".7">SP-01 / PACKAGE CARRIER</text>
			<text x="784" y="966" font-size="14" letter-spacing="3">REV 2.4</text>
			<text x="784" y="990" font-size="11" letter-spacing="2.2" opacity=".64">LGA / 1700</text>
		</g>
		<g transform="translate(55 55)">
			<path d="M0 24 L24 0 L48 24 L24 48 Z" fill="none" stroke="#d8b66d" stroke-width="1.4" opacity=".82"/>
			<circle cx="24" cy="24" r="7" fill="#d8b66d" opacity=".58"/>
		</g>
		<g fill="#b89553">
			<circle cx="964" cy="58" r="7"/>
			<circle cx="58" cy="964" r="7"/>
			<circle cx="964" cy="964" r="7"/>
		</g>
		<g opacity=".55" filter="url(#soft)">
			<ellipse cx="500" cy="560" rx="250" ry="280" fill="#2c6b58" opacity=".2"/>
		</g>
	`;
	return { width: W, height: W, defs, body };
}

function pcbOrmSvg() {
	const W = 512;
	const rand = makeRandom(4104);
	const traces = [];
	const vias = [];
	for (let i = 0; i < 20; i += 1) {
		const t = 0.1 + rand() * 0.8;
		const offset = 20 + rand() * 28;
		traces.push(`<path d="M${offset} ${t * W} H${offset + 40} V${t * W + 30}" />`);
	}
	for (let i = 0; i < 40; i += 1) {
		const x = 13 + rand() * (W - 26);
		const y = 13 + rand() * (W - 26);
		const edge = Math.min(x, y, W - x, W - y);
		if (edge > 66) continue;
		vias.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.2" />`);
	}
	const defs = `
		<pattern id="fiber" width="8" height="8" patternUnits="userSpaceOnUse">
			<path d="M0 4H8" stroke="rgb(255,148,24)" stroke-width="1" opacity=".4"/>
		</pattern>
	`;
	const body = `
		<rect width="${W}" height="${W}" fill="rgb(255,146,24)"/>
		<rect width="${W}" height="${W}" fill="url(#fiber)"/>
		<g fill="none" stroke="rgb(255,64,236)" stroke-width="1.1" opacity=".86">
			${traces.join('\n')}
		</g>
		<g fill="rgb(255,48,240)">
			${vias.join('\n')}
		</g>
		<g fill="rgb(255,214,16)" opacity=".8">
			<rect x="9" y="9" width="${W - 18}" height="${W - 18}" rx="4" fill="none" stroke="rgb(255,200,14)"/>
		</g>
	`;
	return { width: W, height: W, defs, body };
}

function ihsColorSvg() {
	const W = 1024;
	const rand = makeRandom(8001);
	const scratches = [];
	for (let i = 0; i < 90; i += 1) {
		const y = rand() * W;
		const x = rand() * W;
		const len = 20 + rand() * 170;
		scratches.push(
			`<path d="M${x.toFixed(1)} ${y.toFixed(1)}h${len.toFixed(1)}" stroke="#f5f6f7" stroke-width="${(0.3 + rand() * 0.6).toFixed(2)}" opacity="${(0.03 + rand() * 0.06).toFixed(3)}"/>`
		);
	}
	const defs = `
		<linearGradient id="metal" x1="0" y1="0" x2=".9" y2="1">
			<stop offset="0" stop-color="#d5d7d8"/>
			<stop offset=".22" stop-color="#a7a9ab"/>
			<stop offset=".54" stop-color="#8e9092"/>
			<stop offset=".78" stop-color="#babbbc"/>
			<stop offset="1" stop-color="#8f9193"/>
		</linearGradient>
		<linearGradient id="sheen" x1="0" y1=".2" x2="1" y2=".8">
			<stop offset="0" stop-color="#fff" stop-opacity="0"/>
			<stop offset=".45" stop-color="#fff" stop-opacity=".2"/>
			<stop offset=".5" stop-color="#fff" stop-opacity=".3"/>
			<stop offset=".56" stop-color="#fff" stop-opacity=".18"/>
			<stop offset="1" stop-color="#fff" stop-opacity="0"/>
		</linearGradient>
		<linearGradient id="etch" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0" stop-color="#4e5052"/>
			<stop offset=".55" stop-color="#6f7173"/>
			<stop offset="1" stop-color="#9b9c9d"/>
		</linearGradient>
		<pattern id="grain" width="4" height="4" patternUnits="userSpaceOnUse">
			<path d="M0 1H4M0 3H4" stroke="#fff" stroke-width=".45" opacity=".06"/>
		</pattern>
		<pattern id="microLines" width="7" height="7" patternUnits="userSpaceOnUse">
			<path d="M0 3.5H7" stroke="#202224" stroke-width=".35" opacity=".14"/>
		</pattern>
		<filter id="etchBlur"><feGaussianBlur stdDeviation=".45"/></filter>
	`;
	const body = `
		<rect width="${W}" height="${W}" fill="url(#metal)"/>
		<rect width="${W}" height="${W}" fill="url(#grain)"/>
		<rect width="${W}" height="${W}" fill="url(#microLines)"/>
		<rect width="${W}" height="${W}" fill="url(#sheen)" opacity=".7"/>
		<g>${scratches.join('\n')}</g>
		<g fill="none" stroke="#5b5d5f" opacity=".68">
			<rect x="64" y="64" width="896" height="896" rx="42" stroke-width="2"/>
			<rect x="75" y="75" width="874" height="874" rx="34" stroke-width=".7" opacity=".52"/>
		</g>
		<g text-anchor="middle" font-family="${SANS}">
			<text x="512" y="475" font-size="92" font-weight="500" letter-spacing="17" fill="#e1e2e3" opacity=".42">SILICON PATH</text>
			<text x="512" y="475" font-size="92" font-weight="500" letter-spacing="17" fill="url(#etch)" opacity=".86" filter="url(#etchBlur)">SILICON PATH</text>
			<text x="512" y="526" font-size="15" letter-spacing="10" fill="#555759" opacity=".9">MICROARCHITECTURE / SP-01</text>
			<path d="M326 566H698" stroke="#5d5f61" stroke-width="1.1" opacity=".55"/>
			<text x="512" y="610" font-size="13" letter-spacing="6.5" fill="#5d5f61" opacity=".82">ENGINEERED FOR THE CORE</text>
			<text x="512" y="884" font-size="11" letter-spacing="5" fill="#555759" opacity=".58">5 NM · 16 CORE · LGA-1700 · 125 W</text>
		</g>
		<g transform="translate(512 700)" opacity=".5">
			<path d="M-28 0 L0 -22 L28 0 L0 22 Z" fill="none" stroke="#4f5153" stroke-width="1.2"/>
			<path d="M-11 0 L0 -8 L11 0 L0 8 Z" fill="#4f5153" opacity=".6"/>
		</g>
		<g fill="#4b4d4f" font-family="${MONO}" opacity=".48">
			<text x="92" y="112" font-size="9" letter-spacing="2">SP-01 // IHS</text>
			<text x="932" y="112" font-size="9" letter-spacing="2" text-anchor="end">REV 24.4</text>
			<text x="92" y="930" font-size="8" letter-spacing="2">LOT 0x4A7F</text>
			<text x="932" y="930" font-size="8" letter-spacing="2" text-anchor="end">SILICON PATH</text>
		</g>
	`;
	return { width: W, height: W, defs, body };
}

function ihsOrmSvg() {
	const W = 512;
	const rand = makeRandom(9124);
	const streaks = [];
	for (let i = 0; i < 60; i += 1) {
		const y = rand() * W;
		streaks.push(
			`<path d="M0 ${y.toFixed(1)}H${W}" stroke="rgb(255,${(50 + rand() * 55).toFixed(0)},255)" stroke-width="${(0.5 + rand() * 1.5).toFixed(2)}" opacity=".3"/>`
		);
	}
	const defs = `
		<linearGradient id="rough" x1="0" y1="0" x2=".8" y2="1">
			<stop offset="0" stop-color="rgb(255,74,255)"/>
			<stop offset=".45" stop-color="rgb(255,52,255)"/>
			<stop offset="1" stop-color="rgb(255,92,255)"/>
		</linearGradient>
	`;
	const body = `
		<rect width="${W}" height="${W}" fill="url(#rough)"/>
		${streaks.join('\n')}
		<g fill="none" stroke="rgb(255,176,236)" stroke-width="1">
			<rect x="32" y="32" width="${W - 64}" height="${W - 64}" rx="21"/>
		</g>
		<g text-anchor="middle" font-family="${SANS}" fill="rgb(255,168,245)">
			<text x="256" y="244" font-size="44" letter-spacing="8">SILICON PATH</text>
			<text x="256" y="272" font-size="8" letter-spacing="5">MICROARCHITECTURE</text>
		</g>
		<g fill="rgb(255,208,250)" opacity=".5">
			<path d="M-14 0L0 -11L14 0L0 11Z" transform="translate(256 350)"/>
		</g>
	`;
	return { width: W, height: W, defs, body };
}

function dieColorSvg() {
	const W = 1024;
	const rand = makeRandom(3301);
	const traces = [];
	const cells = [];
	for (let i = 0; i < 70; i += 1) {
		const x = 64 + rand() * 896;
		const y = 64 + rand() * 896;
		const w = 18 + rand() * 110;
		const h = 12 + rand() * 80;
		const c = ['#3b7e9a', '#6e4c9c', '#2f6c68', '#9a7b3a'][i % 4];
		cells.push(
			`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${c}" fill-opacity="${(0.045 + rand() * 0.08).toFixed(3)}" stroke="${c}" stroke-width=".5" stroke-opacity=".16"/>`
		);
		traces.push(
			`<path d="M${x.toFixed(1)} ${y.toFixed(1)}h${(w * 0.7).toFixed(1)}v${(h * 0.6).toFixed(1)}" stroke="#d7b36a" stroke-width=".7" opacity=".34"/>`
		);
	}
	const defs = `
		<linearGradient id="silicon" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0" stop-color="#07152c"/>
			<stop offset=".32" stop-color="#142c4b"/>
			<stop offset=".52" stop-color="#342253"/>
			<stop offset=".72" stop-color="#123b48"/>
			<stop offset="1" stop-color="#060d1d"/>
		</linearGradient>
		<linearGradient id="iridescence" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0" stop-color="#6ce8d4" stop-opacity=".22"/>
			<stop offset=".28" stop-color="#577dff" stop-opacity=".06"/>
			<stop offset=".55" stop-color="#d85cff" stop-opacity=".17"/>
			<stop offset=".82" stop-color="#ffbd5c" stop-opacity=".08"/>
			<stop offset="1" stop-color="#69f1dc" stop-opacity=".15"/>
		</linearGradient>
		<pattern id="bumps" width="16" height="16" patternUnits="userSpaceOnUse">
			<circle cx="8" cy="8" r="2.2" fill="#b6934e" opacity=".3"/>
		</pattern>
		<pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
			<path d="M32 0H0V32" fill="none" stroke="#8e7bb4" stroke-width=".5" opacity=".18"/>
		</pattern>
	`;
	const body = `
		<rect width="${W}" height="${W}" fill="url(#silicon)"/>
		<rect width="${W}" height="${W}" fill="url(#iridescence)"/>
		<rect width="${W}" height="${W}" fill="url(#bumps)"/>
		<rect width="${W}" height="${W}" fill="url(#grid)"/>
		<g>${cells.join('\n')}</g>
		<g fill="none">${traces.join('\n')}</g>
		<g fill="none" stroke="#8bc7d8" stroke-width=".8" opacity=".32">
			<rect x="76" y="76" width="872" height="872" rx="26"/>
			<rect x="102" y="102" width="820" height="820" rx="18"/>
		</g>
		<g fill="none" stroke="#d7b36a" stroke-width="1" opacity=".48">
			<path d="M512 40V118M512 906V984M40 512H118M906 512H984"/>
			<rect x="432" y="432" width="160" height="160" rx="10"/>
		</g>
		<g text-anchor="middle" font-family="${MONO}" fill="#b9d9de" opacity=".6">
			<text x="512" y="390" font-size="16" letter-spacing="8">SP-01</text>
			<text x="512" y="656" font-size="9" letter-spacing="4">COMPUTE COMPLEX</text>
		</g>
		<g fill="#f3d18b" opacity=".6">
			<circle cx="124" cy="124" r="5"/><circle cx="900" cy="124" r="5"/>
			<circle cx="124" cy="900" r="5"/><circle cx="900" cy="900" r="5"/>
		</g>
	`;
	return { width: W, height: W, defs, body };
}

function dieOrmSvg() {
	const W = 512;
	const rand = makeRandom(7117);
	const blocks = [];
	for (let i = 0; i < 35; i += 1) {
		blocks.push(
			`<rect x="${(rand() * W).toFixed(1)}" y="${(rand() * W).toFixed(1)}" width="${(10 + rand() * 60).toFixed(1)}" height="${(8 + rand() * 40).toFixed(1)}" fill="rgb(255,${(50 + rand() * 80).toFixed(0)},238)" opacity=".3"/>`
		);
	}
	const defs = `
		<linearGradient id="dieRough" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0" stop-color="rgb(255,58,236)"/>
			<stop offset=".5" stop-color="rgb(255,96,238)"/>
			<stop offset="1" stop-color="rgb(255,42,224)"/>
		</linearGradient>
	`;
	const body = `
		<rect width="${W}" height="${W}" fill="url(#dieRough)"/>
		${blocks.join('\n')}
		<g fill="none" stroke="rgb(255,150,255)" stroke-width="1.2" opacity=".8">
			<rect x="38" y="38" width="${W - 76}" height="${W - 76}" rx="12"/>
			<rect x="51" y="51" width="${W - 102}" height="${W - 102}" rx="8"/>
		</g>
	`;
	return { width: W, height: W, defs, body };
}

function interposerColorSvg() {
	const W = 1024;
	const rand = makeRandom(5510);
	const traces = [];
	const pads = [];
	for (let i = 0; i < 48; i += 1) {
		const a = (i / 48) * Math.PI * 2;
		const r1 = 300;
		const r2 = 458;
		const x1 = 512 + Math.cos(a) * r1;
		const y1 = 512 + Math.sin(a) * r1;
		const x2 = 512 + Math.cos(a + 0.16) * r2;
		const y2 = 512 + Math.sin(a + 0.16) * r2;
		traces.push(
			`<path d="M${x1.toFixed(1)} ${y1.toFixed(1)}L${(x1 + Math.cos(a) * 78).toFixed(1)} ${(y1 + Math.sin(a) * 78).toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}" />`
		);
	}
	for (let ring = 0; ring < 2; ring += 1) {
		for (let i = 0; i < 40; i += 1) {
			const a = (i / 40) * Math.PI * 2;
			const r = 454 + ring * 13;
			pads.push(
				`<circle cx="${(512 + Math.cos(a) * r).toFixed(1)}" cy="${(512 + Math.sin(a) * r).toFixed(1)}" r="${ring === 0 ? 4.4 : 2.4}" />`
			);
		}
	}
	const defs = `
		<linearGradient id="substrate" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0" stop-color="#18261f"/>
			<stop offset=".45" stop-color="#0b1612"/>
			<stop offset="1" stop-color="#18251d"/>
		</linearGradient>
		<radialGradient id="dieAttach" cx=".5" cy=".45" r=".5">
			<stop offset="0" stop-color="#273430"/>
			<stop offset=".72" stop-color="#151f1a"/>
			<stop offset="1" stop-color="#0d1612"/>
		</radialGradient>
		<linearGradient id="gold2" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0" stop-color="#e4c27a"/>
			<stop offset=".5" stop-color="#9d722e"/>
			<stop offset="1" stop-color="#edd08e"/>
		</linearGradient>
		<pattern id="subgrid" width="24" height="24" patternUnits="userSpaceOnUse">
			<path d="M24 0H0V24" fill="none" stroke="#3c5a4b" stroke-width=".45" opacity=".16"/>
		</pattern>
	`;
	const body = `
		<rect width="${W}" height="${W}" fill="url(#substrate)"/>
		<rect width="${W}" height="${W}" fill="url(#subgrid)"/>
		<rect x="182" y="182" width="660" height="660" rx="32" fill="url(#dieAttach)" stroke="#3c4f45" stroke-width="2"/>
		<rect x="216" y="216" width="592" height="592" rx="22" fill="none" stroke="#5d6048" stroke-width="1" opacity=".7"/>
		<g fill="none" stroke="url(#gold2)" stroke-width="1.35" opacity=".52" stroke-linecap="round">
			${traces.join('\n')}
		</g>
		<g fill="#c6a15c" opacity=".76">${pads.join('\n')}</g>
		<g fill="none" stroke="#987632" stroke-width="1" opacity=".6">
			<rect x="31" y="31" width="${W - 62}" height="${W - 62}" rx="16"/>
		</g>
		<g fill="#c7b992" font-family="${SANS}" opacity=".62">
			<text x="512" y="940" font-size="17" text-anchor="middle" letter-spacing="8">SP-01 / PACKAGE SUBSTRATE</text>
			<text x="512" y="969" font-size="10" text-anchor="middle" letter-spacing="5">10 LAYER · ENIG FINISH</text>
		</g>
		<g fill="#c8a45e" opacity=".8">
			<circle cx="72" cy="72" r="5"/><circle cx="952" cy="72" r="5"/>
			<circle cx="72" cy="952" r="5"/><circle cx="952" cy="952" r="5"/>
		</g>
	`;
	return { width: W, height: W, defs, body };
}

function interposerOrmSvg() {
	const W = 512;
	const traces = [];
	for (let i = 0; i < 36; i += 1) {
		const a = (i / 36) * Math.PI * 2;
		const x1 = 256 + Math.cos(a) * 120;
		const y1 = 256 + Math.sin(a) * 120;
		const x2 = 256 + Math.cos(a) * 220;
		const y2 = 256 + Math.sin(a) * 220;
		traces.push(
			`<path d="M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}" stroke="rgb(255,54,242)" stroke-width="1"/>`
		);
	}
	const defs = `
		<pattern id="fiber2" width="6" height="6" patternUnits="userSpaceOnUse">
			<path d="M0 3H6" stroke="rgb(255,162,20)" stroke-width=".8" opacity=".45"/>
		</pattern>
	`;
	const body = `
		<rect width="${W}" height="${W}" fill="rgb(255,138,22)"/>
		<rect width="${W}" height="${W}" fill="url(#fiber2)"/>
		<g fill="none">${traces.join('\n')}</g>
		<rect x="83" y="83" width="346" height="346" rx="18" fill="rgb(255,108,18)" stroke="rgb(255,196,20)" stroke-width="2"/>
		<rect x="14" y="14" width="${W - 28}" height="${W - 28}" rx="8" fill="none" stroke="rgb(255,202,16)" stroke-width="1.4"/>
	`;
	return { width: W, height: W, defs, body };
}

function lgaColorSvg() {
	const W = 512;
	const pads = [];
	const grid = 32;
	for (let y = grid / 2; y < W; y += grid) {
		for (let x = grid / 2; x < W; x += grid) {
			pads.push(`<circle cx="${x}" cy="${y}" r="8.4" />`);
			pads.push(`<circle cx="${x}" cy="${y}" r="5.2" fill="#f5dc9e" opacity=".82"/>`);
		}
	}
	const defs = `
		<radialGradient id="lgapad" cx=".38" cy=".32" r=".72">
			<stop offset="0" stop-color="#ffe5a4"/>
			<stop offset=".36" stop-color="#d6a64c"/>
			<stop offset=".8" stop-color="#8c5f21"/>
			<stop offset="1" stop-color="#4d3210"/>
		</radialGradient>
		<pattern id="lgagrid" width="32" height="32" patternUnits="userSpaceOnUse">
			<path d="M32 0H0V32" fill="none" stroke="#3d3529" stroke-width=".6" opacity=".4"/>
		</pattern>
	`;
	const body = `
		<rect width="${W}" height="${W}" fill="#080a09"/>
		<rect width="${W}" height="${W}" fill="url(#lgagrid)"/>
		<g fill="url(#lgapad)" opacity=".9">${pads.join('\n')}</g>
		<g fill="none" stroke="#7b642e" stroke-width="1" opacity=".36">
			<rect x="14" y="14" width="${W - 28}" height="${W - 28}" rx="9"/>
		</g>
		<g fill="#bda15e" font-family="${MONO}" opacity=".55">
			<text x="256" y="276" font-size="8" text-anchor="middle" letter-spacing="4">LGA-1700</text>
		</g>
	`;
	return { width: W, height: W, defs, body };
}

const textureDefs = [
	{ key: 'pcbColor', name: 'pcb-color', ...pcbColorSvg() },
	{ key: 'pcbOrm', name: 'pcb-orm', ...pcbOrmSvg() },
	{ key: 'ihsColor', name: 'ihs-color', ...ihsColorSvg() },
	{ key: 'ihsOrm', name: 'ihs-orm', ...ihsOrmSvg() },
	{ key: 'dieColor', name: 'die-color', ...dieColorSvg() },
	{ key: 'dieOrm', name: 'die-orm', ...dieOrmSvg() },
	{ key: 'interposerColor', name: 'interposer-color', ...interposerColorSvg() },
	{ key: 'interposerOrm', name: 'interposer-orm', ...interposerOrmSvg() },
	{ key: 'lgaColor', name: 'lga-color', ...lgaColorSvg() }
];

console.log('› Generating PBR texture maps…');
const textureBuffers = {};
for (const tex of textureDefs) {
	textureBuffers[tex.key] = await renderTexture(tex.name, tex.width, tex.height, tex.defs, tex.body);
	console.log(`  · ${tex.name}.png (${tex.width}×${tex.height})`);
}

/* -------------------------------------------------------------------------- */
/* Geometry                                                                   */
/* -------------------------------------------------------------------------- */

const roundBox = (w, h, d, radius = 0.03, segments = 4) =>
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
	const geometries = pieces.map((piece) =>
		piece.geometry.index ? piece.geometry.toNonIndexed() : piece.geometry
	);
	return mergeGeometries(geometries, false);
}

const parts = new Map();

function part(name, position) {
	const item = { name, position, pieces: [] };
	parts.set(name, item);
	return item;
}

function piece(parent, geometry, material, transform) {
	parent.pieces.push({
		geometry: applyTransform(geometry, transform),
		material
	});
}

function mergedPiece(parent, pieces, material) {
	const merged = mergePieces(pieces.map((geometry) => ({ geometry })));
	parent.pieces.push({ geometry: merged, material });
}

/* -------------------------------------------------------------------------- */
/* Document + materials                                                       */
/* -------------------------------------------------------------------------- */

const doc = new Document();
doc.createExtension(KHRMaterialsIridescence).setRequired(true);
const buffer = doc.createBuffer();
const scene = doc.createScene('CPU package');

function texture(key, name, color = false) {
	return doc
		.createTexture(name)
		.setImage(textureBuffers[key])
		.setMimeType('image/png')
		.setURI(`${name}.png`);
}

const textures = {
	pcbColor: texture('pcbColor', 'pcb-color'),
	pcbOrm: texture('pcbOrm', 'pcb-orm'),
	ihsColor: texture('ihsColor', 'ihs-color'),
	ihsOrm: texture('ihsOrm', 'ihs-orm'),
	dieColor: texture('dieColor', 'die-color'),
	dieOrm: texture('dieOrm', 'die-orm'),
	interposerColor: texture('interposerColor', 'interposer-color'),
	interposerOrm: texture('interposerOrm', 'interposer-orm'),
	lgaColor: texture('lgaColor', 'lga-color')
};

const materials = {};

materials.pcbEdge = doc
	.createMaterial('PCB edge')
	.setBaseColorFactor([0.025, 0.05, 0.04, 1])
	.setMetallicFactor(0.08)
	.setRoughnessFactor(0.62);

materials.pcbTop = doc
	.createMaterial('PCB solder mask')
	.setBaseColorTexture(textures.pcbColor)
	.setMetallicRoughnessTexture(textures.pcbOrm)
	.setMetallicFactor(1)
	.setRoughnessFactor(1);

materials.substrateEdge = doc
	.createMaterial('Package substrate edge')
	.setBaseColorFactor([0.045, 0.035, 0.025, 1])
	.setMetallicFactor(0.16)
	.setRoughnessFactor(0.44);

materials.substrateTop = doc
	.createMaterial('Package substrate top')
	.setBaseColorTexture(textures.interposerColor)
	.setMetallicRoughnessTexture(textures.interposerOrm)
	.setMetallicFactor(1)
	.setRoughnessFactor(1);

materials.lga = doc
	.createMaterial('LGA contacts')
	.setBaseColorTexture(textures.lgaColor)
	.setMetallicFactor(0.82)
	.setRoughnessFactor(0.32);

materials.gold = doc
	.createMaterial('ENIG gold')
	.setBaseColorFactor([0.77, 0.56, 0.24, 1])
	.setMetallicFactor(1)
	.setRoughnessFactor(0.24);

materials.silver = doc
	.createMaterial('Solder silver')
	.setBaseColorFactor([0.62, 0.64, 0.66, 1])
	.setMetallicFactor(1)
	.setRoughnessFactor(0.38);

materials.ceramic = doc
	.createMaterial('Capacitor ceramic')
	.setBaseColorFactor([0.045, 0.04, 0.034, 1])
	.setMetallicFactor(0.08)
	.setRoughnessFactor(0.5);

materials.dieSilicon = doc
	.createMaterial('Silicon')
	.setBaseColorFactor([0.11, 0.14, 0.22, 1])
	.setMetallicFactor(0.72)
	.setRoughnessFactor(0.23);

materials.dieTop = doc
	.createMaterial('Silicon floorplan')
	.setBaseColorTexture(textures.dieColor)
	.setMetallicRoughnessTexture(textures.dieOrm)
	.setMetallicFactor(1)
	.setRoughnessFactor(1);

materials.dieTile = doc
	.createMaterial('Chiplet')
	.setBaseColorFactor([0.12, 0.15, 0.23, 1])
	.setMetallicFactor(0.88)
	.setRoughnessFactor(0.18);

materials.tim = doc
	.createMaterial('Graphite TIM')
	.setBaseColorFactor([0.055, 0.057, 0.06, 1])
	.setMetallicFactor(0.6)
	.setRoughnessFactor(0.34);

materials.ihsMetal = doc
	.createMaterial('Nickel heat spreader')
	.setBaseColorFactor([0.55, 0.56, 0.57, 1])
	.setMetallicFactor(1)
	.setRoughnessFactor(0.24);

materials.ihsTop = doc
	.createMaterial('IHS etched top')
	.setBaseColorTexture(textures.ihsColor)
	.setMetallicRoughnessTexture(textures.ihsOrm)
	.setMetallicFactor(1)
	.setRoughnessFactor(1);

materials.ihsUnderside = doc
	.createMaterial('IHS underside')
	.setBaseColorFactor([0.14, 0.145, 0.15, 1])
	.setMetallicFactor(0.92)
	.setRoughnessFactor(0.38);

materials.underfill = doc
	.createMaterial('Underfill epoxy')
	.setBaseColorFactor([0.025, 0.022, 0.018, 1])
	.setMetallicFactor(0.02)
	.setRoughnessFactor(0.48);

const iridescence = doc.createExtension(KHRMaterialsIridescence);
const dieIridescence = iridescence
	.createIridescence()
	.setIridescenceFactor(0.58)
	.setIridescenceIOR(1.42)
	.setIridescenceThicknessMinimum(90)
	.setIridescenceThicknessMaximum(380);
materials.dieSilicon.setExtension('KHR_materials_iridescence', dieIridescence);

const tileIridescence = iridescence
	.createIridescence()
	.setIridescenceFactor(0.7)
	.setIridescenceIOR(1.48)
	.setIridescenceThicknessMinimum(120)
	.setIridescenceThicknessMaximum(460);
materials.dieTile.setExtension('KHR_materials_iridescence', tileIridescence);

/* -------------------------------------------------------------------------- */
/* Parts                                                                      */
/* -------------------------------------------------------------------------- */

// PCB -----------------------------------------------------------------------
const pcb = part('pcb', [0, 0.08, 0]);
piece(pcb, roundBox(4.7, 0.14, 4.7, 0.035, 4), materials.pcbEdge);
piece(pcb, horizontalPlane(4.58, 4.58), materials.pcbTop, { position: [0, 0.071, 0] });

// four gold registration strips on the carrier edge
const pcbStrips = [];
for (const x of [-2.27, 2.27]) {
	pcbStrips.push(applyTransform(new THREE.BoxGeometry(0.035, 0.008, 4.1), { position: [x, 0.076, 0] }));
}
for (const z of [-2.27, 2.27]) {
	pcbStrips.push(applyTransform(new THREE.BoxGeometry(4.1, 0.008, 0.035), { position: [0, 0.076, z] }));
}
mergedPiece(pcb, pcbStrips, materials.gold);

// Package substrate ---------------------------------------------------------
const interposer = part('interposer', [0, 0.225, 0]);
piece(interposer, roundBox(4.0, 0.13, 4.0, 0.03, 4), materials.substrateEdge);
piece(interposer, horizontalPlane(3.92, 3.92), materials.substrateTop, { position: [0, 0.066, 0] });
piece(interposer, horizontalPlane(3.92, 3.92, true), materials.lga, {
	position: [0, -0.066, 0]
});

// fine gold side rails
const rails = [];
for (const x of [-2.008, 2.008]) {
	rails.push(applyTransform(new THREE.BoxGeometry(0.018, 0.036, 3.82), { position: [x, 0.012, 0] }));
}
for (const z of [-2.008, 2.008]) {
	rails.push(applyTransform(new THREE.BoxGeometry(3.82, 0.036, 0.018), { position: [0, 0.012, z] }));
}
mergedPiece(interposer, rails, materials.gold);

// Surface-mount capacitors and die-side microbumps
const capBodies = [];
const capEnds = [];
const capPositions = [];
for (let i = 0; i < 6; i += 1) {
	const t = -1.52 + i * 0.61;
	capPositions.push([t, 1.66, 0], [t, -1.66, 0], [1.66, t, Math.PI / 2], [-1.66, t, Math.PI / 2]);
}
for (const [x, z, rotation] of capPositions) {
	const body = applyTransform(new THREE.BoxGeometry(0.13, 0.045, 0.065), {
		position: [x, 0.089, z],
		rotation: [0, rotation, 0]
	});
	capBodies.push(body);
	for (const offset of [-0.052, 0.052]) {
		const local = new THREE.Vector3(offset, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotation);
		capEnds.push(
			applyTransform(new THREE.BoxGeometry(0.027, 0.047, 0.067), {
				position: [x + local.x, 0.09, z + local.z],
				rotation: [0, rotation, 0]
			})
		);
	}
}
mergedPiece(interposer, capBodies, materials.ceramic);
mergedPiece(interposer, capEnds, materials.silver);

const bumps = [];
for (let i = 0; i < 8; i += 1) {
	const t = -0.78 + i * 0.222;
	for (const [x, z] of [
		[t, 1.03],
		[t, -1.03],
		[1.03, t],
		[-1.03, t]
	]) {
		bumps.push(applyTransform(new THREE.BoxGeometry(0.038, 0.012, 0.038), { position: [x, 0.072, z] }));
	}
}
mergedPiece(interposer, bumps, materials.gold);

// Silicon die ---------------------------------------------------------------
const die = part('die', [0, 0.3375, 0]);
piece(die, roundBox(1.86, 0.075, 1.86, 0.015, 4), materials.dieSilicon);
piece(die, horizontalPlane(1.82, 1.82), materials.dieTop, { position: [0, 0.0382, 0] });
piece(die, roundBox(1.98, 0.022, 1.98, 0.018, 3), materials.underfill, { position: [0, -0.048, 0] });

const chipletPieces = [];
const chipletOffsets = [
	[-0.44, -0.44],
	[0.44, -0.44],
	[-0.44, 0.44],
	[0.44, 0.44]
];
for (const [x, z] of chipletOffsets) {
	chipletPieces.push(
		applyTransform(roundBox(0.72, 0.028, 0.72, 0.018, 3), { position: [x, 0.0515, z] })
	);
}
chipletPieces.push(applyTransform(roundBox(0.52, 0.036, 0.52, 0.018, 3), { position: [0, 0.0555, 0] }));
mergedPiece(die, chipletPieces, materials.dieTile);

const dieGold = [];
for (let i = 0; i < 12; i += 1) {
	const t = -0.93 + i * 0.169;
	dieGold.push(applyTransform(new THREE.BoxGeometry(0.026, 0.006, 0.08), { position: [t, 0.043, 0.93] }));
	dieGold.push(applyTransform(new THREE.BoxGeometry(0.026, 0.006, 0.08), { position: [t, 0.043, -0.93] }));
	dieGold.push(applyTransform(new THREE.BoxGeometry(0.08, 0.006, 0.026), { position: [0.93, 0.043, t] }));
	dieGold.push(applyTransform(new THREE.BoxGeometry(0.08, 0.006, 0.026), { position: [-0.93, 0.043, t] }));
}
mergedPiece(die, dieGold, materials.gold);

// Thermal interface material ------------------------------------------------
const tim = part('tim', [0, 0.425, 0]);
piece(tim, roundBox(2.3, 0.04, 2.3, 0.02, 3), materials.tim);
const timRim = [];
for (const x of [-1.19, 1.19]) {
	timRim.push(applyTransform(new THREE.BoxGeometry(0.028, 0.014, 2.36), { position: [x, 0.004, 0] }));
}
for (const z of [-1.19, 1.19]) {
	timRim.push(applyTransform(new THREE.BoxGeometry(2.36, 0.014, 0.028), { position: [0, 0.004, z] }));
}
mergedPiece(tim, timRim, materials.gold);

// Integrated heat spreader --------------------------------------------------
const ihs = part('ihs', [0, 0.60, 0]);
piece(ihs, roundBox(4.15, 0.3, 4.15, 0.075, 5), materials.ihsMetal);
piece(ihs, roundBox(3.93, 0.055, 3.93, 0.045, 3), materials.ihsMetal, { position: [0, -0.173, 0] });
piece(ihs, horizontalPlane(3.86, 3.86), materials.ihsTop, { position: [0, 0.1507, 0] });
piece(ihs, horizontalPlane(3.86, 3.86, true), materials.ihsUnderside, {
	position: [0, -0.2015, 0]
});

// A subtle machined bevel ring around the etched plate.
const ihsBevel = [];
for (const x of [-1.985, 1.985]) {
	ihsBevel.push(applyTransform(new THREE.BoxGeometry(0.018, 0.012, 3.9), { position: [x, 0.153, 0] }));
}
for (const z of [-1.985, 1.985]) {
	ihsBevel.push(applyTransform(new THREE.BoxGeometry(3.9, 0.012, 0.018), { position: [0, 0.153, z] }));
}
mergedPiece(ihs, ihsBevel, materials.silver);

/* -------------------------------------------------------------------------- */
/* Serialize                                                                  */
/* -------------------------------------------------------------------------- */

const partOrder = ['pcb', 'interposer', 'die', 'tim', 'ihs'];

function createAccessor(array, type) {
	const accessor = doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
	return accessor;
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

for (const name of partOrder) {
	const definition = parts.get(name);
	const node = doc.createNode(name);
	node.setTranslation(definition.position);
	scene.addChild(node);

	const mesh = doc.createMesh(name);
	node.setMesh(mesh);

	for (const item of definition.pieces) {
		addPrimitive(mesh, item.geometry, item.material);
	}
}

const io = new NodeIO().registerExtensions([KHRMaterialsIridescence]);
const sourceBytes = await io.writeBinary(doc);
const sourcePath = path.join(CACHE, 'cpu-exploded.source.glb');
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

console.log('› Welding, deduplicating and pruning…');
run(cli, ['weld', sourcePath, temp('cpu.weld.glb')]);
run(cli, ['dedup', temp('cpu.weld.glb'), temp('cpu.dedup.glb')]);
run(cli, ['prune', temp('cpu.dedup.glb'), temp('cpu.pruned.glb')]);

console.log('› Compressing textures with KTX2 / ETC1S…');
run(cli, [
	'etc1s',
	temp('cpu.pruned.glb'),
	temp('cpu.ktx2.glb'),
	'--quality',
	'192',
	'--compression',
	'2',
	'--jobs',
	'2'
]);

console.log('› Compressing geometry with Draco…');
run(cli, [
	'draco',
	temp('cpu.ktx2.glb'),
	path.join(MODEL_DIR, 'cpu-exploded.glb'),
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

// Verify the final asset really contains the compression and material extensions.
// Parse the GLB JSON chunk directly so this check does not need a Draco decoder.
const finalBytes = await fs.stat(path.join(MODEL_DIR, 'cpu-exploded.glb'));
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
const finalJson = await readGlbJson(path.join(MODEL_DIR, 'cpu-exploded.glb'));
const usedExtensions = finalJson.extensionsUsed ?? [];
console.log(`✓ Final model written (${fmt(finalBytes.size)})`);
console.log(`  extensions: ${usedExtensions.join(', ') || 'none'}`);
console.log(`  nodes: ${finalJson.nodes.map((node) => node.name).join(', ')}`);

// Report triangle and part information for the handoff.
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
