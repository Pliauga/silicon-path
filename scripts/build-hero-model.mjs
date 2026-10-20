#!/usr/bin/env node
/**
 * Silicon Path — home hero package asset pipeline.
 *
 * Generates the PBR texture set, assembles a hero-scale four-layer package,
 * writes a source GLB, then uses glTF-Transform + KTX-Software to produce the
 * final Draco + KTX2 compressed asset used by <HomeHero />.
 *
 * Layer nodes (in assembly order, bottom to top):
 *   hero-carrier   → FR-4 module carrier
 *   hero-substrate → LGA package substrate with decoupling capacitors
 *   hero-die       → iridescent wafer-like silicon die + chiplets
 *   hero-ihs       → etched nickel heat spreader with graphite TIM
 *
 * Run: npm run build:hero
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
const CACHE = path.join(ROOT, '.cache', 'hero');
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

const defsGold = `
	<linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
		<stop offset="0" stop-color="#e9c982"/>
		<stop offset=".42" stop-color="#a9782f"/>
		<stop offset=".72" stop-color="#d9b467"/>
		<stop offset="1" stop-color="#f2d596"/>
	</linearGradient>
`;

/* -------------------------------------------------------------------------- */
/* Textures                                                                   */
/* -------------------------------------------------------------------------- */

function carrierColorSvg() {
	const W = 1024;
	const rand = makeRandom(7301);
	const traces = [];
	const pads = [];

	for (let i = 0; i < 30; i += 1) {
		const side = i % 4;
		const t = 0.06 + rand() * 0.88;
		const inset = 30 + rand() * 16;
		const len = 18 + rand() * 36;
		if (side === 0) {
			traces.push(`<path d="M${inset} ${(t * W).toFixed(1)}H${(inset + len).toFixed(1)}" />`);
		} else if (side === 1) {
			traces.push(`<path d="M${W - inset} ${(t * W).toFixed(1)}H${(W - inset - len).toFixed(1)}" />`);
		} else if (side === 2) {
			traces.push(`<path d="M${(t * W).toFixed(1)} ${inset}V${(inset + len).toFixed(1)}" />`);
		} else {
			traces.push(`<path d="M${(t * W).toFixed(1)} ${W - inset}V${(W - inset - len).toFixed(1)}" />`);
		}
	}

	for (let i = 0; i < 26; i += 1) {
		const x = 24 + i * 39.4;
		pads.push(`<rect x="${x.toFixed(1)}" y="18" width="22" height="7" rx="2.5" />`);
		pads.push(`<rect x="${x.toFixed(1)}" y="${W - 25}" width="22" height="7" rx="2.5" />`);
		pads.push(`<rect x="18" y="${x.toFixed(1)}" width="7" height="22" rx="2.5" />`);
		pads.push(`<rect x="${W - 25}" y="${x.toFixed(1)}" width="7" height="22" rx="2.5" />`);
	}

	const defs = `
		<linearGradient id="board" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0" stop-color="#0d1618"/>
			<stop offset=".46" stop-color="#070d10"/>
			<stop offset="1" stop-color="#04080a"/>
		</linearGradient>
		<radialGradient id="halo" cx=".5" cy=".44" r=".72">
			<stop offset="0" stop-color="#1f3a40" stop-opacity=".45"/>
			<stop offset=".64" stop-color="#0a1417" stop-opacity=".12"/>
			<stop offset="1" stop-color="#000" stop-opacity="0"/>
		</radialGradient>
		${defsGold}
		<pattern id="weave" width="18" height="18" patternUnits="userSpaceOnUse">
			<path d="M0 0L18 18M18 0L0 18" stroke="#3c5b60" stroke-width=".55" opacity=".24"/>
		</pattern>
		<pattern id="microgrid" width="32" height="32" patternUnits="userSpaceOnUse">
			<path d="M32 0H0V32" fill="none" stroke="#2c4a50" stroke-width=".5" opacity=".16"/>
		</pattern>
	`;
	const body = `
		<rect width="${W}" height="${W}" fill="url(#board)"/>
		<rect width="${W}" height="${W}" fill="url(#halo)"/>
		<rect width="${W}" height="${W}" fill="url(#weave)" opacity=".5"/>
		<rect width="${W}" height="${W}" fill="url(#microgrid)"/>
		<rect x="36" y="36" width="${W - 72}" height="${W - 72}" rx="26" fill="none" stroke="#31474b" stroke-width="1.2" opacity=".5"/>
		<rect x="108" y="108" width="${W - 216}" height="${W - 216}" rx="14" fill="#020405" opacity=".72" stroke="#24363a" stroke-width="1"/>
		<rect x="124" y="124" width="${W - 248}" height="${W - 248}" rx="10" fill="none" stroke="url(#gold)" stroke-width=".8" opacity=".22"/>
		<g stroke="url(#gold)" stroke-width="1" opacity=".34" fill="none">
			${traces.join('\n\t\t\t')}
		</g>
		<g fill="url(#gold)" opacity=".82">
			${pads.join('\n\t\t\t')}
		</g>
		<g fill="none" stroke="url(#gold)" stroke-width="2" opacity=".7">
			<path d="M74 152V74H152"/>
			<path d="M${W - 152} 74H${W - 74}V152"/>
			<path d="M74 ${W - 152}V${W - 74}H152"/>
			<path d="M${W - 152} ${W - 74}H${W - 74}V${W - 152}"/>
		</g>
		<g fill="url(#gold)" opacity=".9">
			<circle cx="${W / 2}" cy="62" r="7"/><circle cx="${W / 2}" cy="62" r="2.4" fill="#060b0d"/>
			<circle cx="${W / 2}" cy="${W - 62}" r="7"/><circle cx="${W / 2}" cy="${W - 62}" r="2.4" fill="#060b0d"/>
			<circle cx="62" cy="${W / 2}" r="7"/><circle cx="62" cy="${W / 2}" r="2.4" fill="#060b0d"/>
			<circle cx="${W - 62}" cy="${W / 2}" r="7"/><circle cx="${W - 62}" cy="${W / 2}" r="2.4" fill="#060b0d"/>
		</g>
		<g font-family="${MONO}" fill="#8fa6a8">
			<text x="70" y="948" font-size="13" letter-spacing="4.2" opacity=".92">SILICON PATH</text>
			<text x="70" y="970" font-size="9.5" letter-spacing="2.6" opacity=".6">HERO CARRIER / SP—02</text>
			<text x="${W - 70}" y="948" font-size="9.5" letter-spacing="2.6" text-anchor="end" opacity=".6">REV A</text>
			<text x="${W - 70}" y="970" font-size="9.5" letter-spacing="2.6" text-anchor="end" opacity=".46">FR-4 · 1.6 MM</text>
			<text x="${W / 2}" y="946" font-size="8.5" letter-spacing="3.4" text-anchor="middle" opacity=".4">STUDIO 08 · MICROARCHITECTURE</text>
		</g>
		<g font-family="${SANS}" fill="#dfe8e6" opacity=".035" text-anchor="middle">
			<text x="${W / 2}" y="${W / 2 + 34}" font-size="118" font-weight="500" letter-spacing="16">SP—02</text>
		</g>
	`;
	return { width: W, height: W, defs, body };
}

function carrierOrmSvg() {
	const W = 512;
	const rand = makeRandom(7302);
	const streaks = [];
	for (let i = 0; i < 90; i += 1) {
		const y = rand() * W;
		streaks.push(`<path d="M0 ${y.toFixed(1)}H${W}" stroke-width="${(0.6 + rand() * 1.4).toFixed(1)}" opacity="${(0.05 + rand() * 0.09).toFixed(2)}"/>`);
	}
	const defs = `
		<pattern id="weave" width="12" height="12" patternUnits="userSpaceOnUse">
			<path d="M0 0L12 12M12 0L0 12" stroke="#ffe0a8" stroke-width=".7" opacity=".3"/>
		</pattern>
	`;
	const body = `
		<rect width="${W}" height="${W}" fill="rgb(255,198,20)"/>
		<rect width="${W}" height="${W}" fill="url(#weave)"/>
		<rect x="54" y="54" width="${W - 108}" height="${W - 108}" rx="7" fill="rgb(255,224,34)"/>
		<rect x="62" y="62" width="${W - 124}" height="${W - 124}" rx="5" fill="rgb(255,206,22)"/>
		<rect x="15" y="15" width="${W - 30}" height="${W - 30}" rx="13" fill="none" stroke="rgb(255,72,240)" stroke-width="7"/>
		<g stroke="rgb(255,72,240)" stroke-width="4" fill="none" opacity=".9">
			<path d="M37 76V37H76"/>
			<path d="M${W - 76} 37H${W - 37}V76"/>
			<path d="M37 ${W - 76}V${W - 37}H76"/>
			<path d="M${W - 76} ${W - 37}H${W - 37}V${W - 76}"/>
		</g>
		<g stroke="#ffe7ae" stroke-width="1" opacity=".16">
			${streaks.join('\n\t\t\t')}
		</g>
	`;
	return { width: W, height: W, defs, body };
}

function substrateColorSvg() {
	const W = 1024;
	const rand = makeRandom(7311);
	const traces = [];
	const ringPads = [];

	for (let i = 0; i < 44; i += 1) {
		const side = i % 4;
		const t = 0.12 + rand() * 0.76;
		const inner = 250 + rand() * 18;
		const outer = 420 + rand() * 48;
		if (side === 0) {
			traces.push(`<path d="M${inner} ${(t * W).toFixed(1)}H${outer}l26 ${(rand() * 24 - 12).toFixed(1)}"/>`);
		} else if (side === 1) {
			traces.push(`<path d="M${W - inner} ${(t * W).toFixed(1)}H${W - outer}l-26 ${(rand() * 24 - 12).toFixed(1)}"/>`);
		} else if (side === 2) {
			traces.push(`<path d="M${(t * W).toFixed(1)} ${inner}V${outer}l${(rand() * 24 - 12).toFixed(1)} 26"/>`);
		} else {
			traces.push(`<path d="M${(t * W).toFixed(1)} ${W - inner}V${W - outer}l${(rand() * 24 - 12).toFixed(1)} -26"/>`);
		}
	}

	for (let i = 0; i < 30; i += 1) {
		const side = i % 4;
		const t = 0.1 + (i / 30) * 0.8;
		if (side === 0) ringPads.push(`<circle cx="212" cy="${(t * W).toFixed(1)}" r="5"/>`);
		else if (side === 1) ringPads.push(`<circle cx="${W - 212}" cy="${(t * W).toFixed(1)}" r="5"/>`);
		else if (side === 2) ringPads.push(`<circle cx="${(t * W).toFixed(1)}" cy="212" r="5"/>`);
		else ringPads.push(`<circle cx="${(t * W).toFixed(1)}" cy="${W - 212}" r="5"/>`);
	}

	const defs = `
		<linearGradient id="sub" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0" stop-color="#101c16"/>
			<stop offset=".5" stop-color="#08110d"/>
			<stop offset="1" stop-color="#040907"/>
		</linearGradient>
		<radialGradient id="dieGlow" cx=".5" cy=".5" r=".5">
			<stop offset="0" stop-color="#2d5a45" stop-opacity=".5"/>
			<stop offset=".72" stop-color="#0c2016" stop-opacity=".2"/>
			<stop offset="1" stop-color="#000" stop-opacity="0"/>
		</radialGradient>
		${defsGold}
		<pattern id="fiber" width="10" height="10" patternUnits="userSpaceOnUse">
			<path d="M0 0L10 10M10 0L0 10" stroke="#3f5a44" stroke-width=".5" opacity=".2"/>
		</pattern>
		<pattern id="grid" width="26" height="26" patternUnits="userSpaceOnUse">
			<path d="M26 0H0V26" fill="none" stroke="#2a4435" stroke-width=".45" opacity=".22"/>
		</pattern>
	`;
	const body = `
		<rect width="${W}" height="${W}" fill="url(#sub)"/>
		<rect width="${W}" height="${W}" fill="url(#fiber)"/>
		<rect width="${W}" height="${W}" fill="url(#grid)"/>
		<rect x="232" y="232" width="560" height="560" rx="16" fill="#040806" opacity=".9"/>
		<rect x="232" y="232" width="560" height="560" rx="16" fill="url(#dieGlow)"/>
		<rect x="222" y="222" width="580" height="580" rx="18" fill="none" stroke="url(#gold)" stroke-width="2" opacity=".45"/>
		<rect x="236" y="236" width="552" height="552" rx="13" fill="none" stroke="url(#gold)" stroke-width=".8" opacity=".24"/>
		<g stroke="url(#gold)" stroke-width="1.15" fill="none" opacity=".5">
			${traces.join('\n\t\t\t')}
		</g>
		<g fill="url(#gold)" opacity=".72">
			${ringPads.join('\n\t\t\t')}
		</g>
		<g fill="url(#gold)" opacity=".5">
			<rect x="88" y="88" width="42" height="12" rx="2"/>
			<rect x="${W - 130}" y="88" width="42" height="12" rx="2"/>
			<rect x="88" y="${W - 100}" width="42" height="12" rx="2"/>
			<rect x="${W - 130}" y="${W - 100}" width="42" height="12" rx="2"/>
		</g>
		<g font-family="${MONO}" fill="#93ab9a">
			<text x="72" y="140" font-size="11" letter-spacing="2.8" opacity=".78">SP—02 / PACKAGE SUBSTRATE</text>
			<text x="${W - 72}" y="140" font-size="9.5" letter-spacing="2.4" text-anchor="end" opacity=".52">10 LAYER · ENIG</text>
			<text x="72" y="908" font-size="9.5" letter-spacing="2.4" opacity=".56">SILICON PATH</text>
			<text x="${W - 72}" y="908" font-size="9.5" letter-spacing="2.4" text-anchor="end" opacity=".44">REV C</text>
		</g>
		<g font-family="${MONO}" fill="#b9c9b9" opacity=".3">
			<text x="500" y="500" font-size="8" letter-spacing="2.2">LGA-1700</text>
			<text x="500" y="514" font-size="8" letter-spacing="2.2">0.55 MM PITCH</text>
		</g>
	`;
	return { width: W, height: W, defs, body };
}

function substrateOrmSvg() {
	const W = 512;
	const defs = `
		<pattern id="fiber" width="8" height="8" patternUnits="userSpaceOnUse">
			<path d="M0 0L8 8M8 0L0 8" stroke="#ffdca0" stroke-width=".6" opacity=".35"/>
		</pattern>
	`;
	const body = `
		<rect width="${W}" height="${W}" fill="rgb(255,184,22)"/>
		<rect width="${W}" height="${W}" fill="url(#fiber)"/>
		<rect x="116" y="116" width="280" height="280" rx="8" fill="rgb(255,120,20)"/>
		<rect x="111" y="111" width="290" height="290" rx="9" fill="none" stroke="rgb(255,64,236)" stroke-width="2"/>
		<g stroke="rgb(255,64,236)" stroke-width="1.4" fill="none" opacity=".8">
			<path d="M125 210H210l20 20"/>
			<path d="M387 210H302l-20 20"/>
			<path d="M125 302H210l20 -20"/>
			<path d="M387 302H302l-20 -20"/>
		</g>
	`;
	return { width: W, height: W, defs, body };
}

function dieColorSvg() {
	const W = 1024;
	const rand = makeRandom(7321);
	const fields = [];
	const cells = [];

	for (let fy = 0; fy < 4; fy += 1) {
		for (let fx = 0; fx < 4; fx += 1) {
			const x = fx * 256;
			const y = fy * 256;
			fields.push(`<rect x="${x + 10}" y="${y + 10}" width="236" height="236" rx="4" fill="none" stroke="#d9c48c" stroke-width=".7" opacity=".2"/>`);
			for (let cy = 0; cy < 2; cy += 1) {
				for (let cx = 0; cx < 2; cx += 1) {
					const dx = x + 34 + cx * 108;
					const dy = y + 34 + cy * 108;
					cells.push(`<rect x="${dx}" y="${dy}" width="94" height="94" rx="2" fill="rgba(150,180,230,.05)" stroke="#a6bce0" stroke-width=".7" opacity=".34"/>`);
					cells.push(`<rect x="${dx + 12}" y="${dy + 12}" width="70" height="70" rx="1.5" fill="none" stroke="#8fa6cc" stroke-width=".45" opacity=".24"/>`);
				}
			}
		}
	}

	const dots = [];
	for (let i = 0; i < 220; i += 1) {
		const x = 40 + rand() * (W - 80);
		const y = 40 + rand() * (W - 80);
		const edge = Math.min(x, y, W - x, W - y);
		if (edge < 60) continue;
		dots.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(0.8 + rand() * 1.1).toFixed(1)}" opacity="${(0.1 + rand() * 0.28).toFixed(2)}"/>`);
	}

	const defs = `
		<linearGradient id="wafer" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0" stop-color="#0b1326"/>
			<stop offset=".28" stop-color="#172a5b"/>
			<stop offset=".5" stop-color="#2c2a6d"/>
			<stop offset=".7" stop-color="#154952"/>
			<stop offset="1" stop-color="#070e1b"/>
		</linearGradient>
		<linearGradient id="irid" x1="0" y1="0" x2=".92" y2="1">
			<stop offset="0" stop-color="#67e8d9" stop-opacity=".3"/>
			<stop offset=".22" stop-color="#6d8cff" stop-opacity=".22"/>
			<stop offset=".46" stop-color="#c084fc" stop-opacity=".2"/>
			<stop offset=".66" stop-color="#f0c674" stop-opacity=".17"/>
			<stop offset=".84" stop-color="#56e0c6" stop-opacity=".2"/>
			<stop offset="1" stop-color="#5d7bff" stop-opacity=".24"/>
		</linearGradient>
		<linearGradient id="edgeIrid" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0" stop-color="#7ef0e0" stop-opacity=".9"/>
			<stop offset=".3" stop-color="#7d9bff" stop-opacity=".5"/>
			<stop offset=".6" stop-color="#d39bff" stop-opacity=".55"/>
			<stop offset="1" stop-color="#f2cd86" stop-opacity=".7"/>
		</linearGradient>
		<radialGradient id="sheen" cx=".38" cy=".3" r=".72">
			<stop offset="0" stop-color="#ffffff" stop-opacity=".16"/>
			<stop offset=".55" stop-color="#cfe0ff" stop-opacity=".04"/>
			<stop offset="1" stop-color="#000" stop-opacity="0"/>
		</radialGradient>
		<pattern id="scribe" width="256" height="256" patternUnits="userSpaceOnUse">
			<path d="M256 0H0V256" fill="none" stroke="#d9c48c" stroke-width=".6" opacity=".16"/>
		</pattern>
	`;
	const body = `
		<rect width="${W}" height="${W}" fill="url(#wafer)"/>
		<rect width="${W}" height="${W}" fill="url(#irid)"/>
		<rect width="${W}" height="${W}" fill="url(#scribe)"/>
		${fields.join('\n\t\t')}
		${cells.join('\n\t\t')}
		<g fill="#cfe2ff">
			${dots.join('\n\t\t\t')}
		</g>
		<g fill="none" stroke="url(#edgeIrid)" stroke-width="1.6" opacity=".8">
			<rect x="30" y="30" width="${W - 60}" height="${W - 60}" rx="6"/>
		</g>
		<g fill="none" stroke="#cfd9ea" stroke-width="1" opacity=".45">
			<rect x="52" y="52" width="${W - 104}" height="${W - 104}" rx="4"/>
			<path d="M512 30v34M512 960v34M30 512h34M960 512h34"/>
		</g>
		<g fill="#dbe6f5" opacity=".5" font-family="${MONO}">
			<circle cx="512" cy="66" r="3.2"/>
			<circle cx="512" cy="${W - 66}" r="3.2"/>
			<circle cx="66" cy="512" r="3.2"/>
			<circle cx="${W - 66}" cy="512" r="3.2"/>
		</g>
		<g fill="#dfe8ff" font-family="${MONO}" opacity=".56">
			<text x="512" y="48" font-size="11.5" letter-spacing="5" text-anchor="middle">SILICON PATH · SP—02</text>
			<text x="512" y="${W - 34}" font-size="10" letter-spacing="3.4" text-anchor="middle">5 NM · MICROARCHITECTURE · 16 CORE</text>
			<text x="72" y="96" font-size="8.5" letter-spacing="2.2" opacity=".66">RTL → GDSII</text>
			<text x="${W - 72}" y="96" font-size="8.5" letter-spacing="2.2" text-anchor="end" opacity=".66">LOT 08 / WAFER 12</text>
		</g>
		<g fill="none" stroke="#e6efd8" stroke-width=".8" opacity=".32">
			<rect x="352" y="352" width="320" height="320" rx="6"/>
			<rect x="392" y="392" width="240" height="240" rx="4" stroke="#f0d49a"/>
			<path d="M352 512h-52M724 512h52M512 352v-52M512 724v52"/>
		</g>
		<g fill="#e8f2ff" font-family="${MONO}" opacity=".2" text-anchor="middle">
			<text x="512" y="528" font-size="64" font-weight="500" letter-spacing="18">SP—02</text>
		</g>
		<rect width="${W}" height="${W}" fill="url(#sheen)"/>
		<rect width="${W}" height="${W}" fill="none" stroke="url(#edgeIrid)" stroke-width="3" opacity=".55"/>
	`;
	return { width: W, height: W, defs, body };
}

function dieOrmSvg() {
	const W = 512;
	const rand = makeRandom(7322);
	const blocks = [];
	for (let i = 0; i < 36; i += 1) {
		const x = 30 + rand() * (W - 90);
		const y = 30 + rand() * (W - 90);
		const w = 12 + rand() * 44;
		const h = 12 + rand() * 44;
		blocks.push(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="rgb(255,${(70 + rand() * 70).toFixed(0)},30)"/>`);
	}
	const defs = `
		<pattern id="scribe" width="128" height="128" patternUnits="userSpaceOnUse">
			<path d="M128 0H0V128" fill="none" stroke="#ffb060" stroke-width="1.2" opacity=".3"/>
		</pattern>
	`;
	const body = `
		<rect width="${W}" height="${W}" fill="rgb(255,96,24)"/>
		<rect width="${W}" height="${W}" fill="url(#scribe)"/>
		${blocks.join('\n\t\t')}
		<rect x="176" y="176" width="160" height="160" rx="4" fill="rgb(255,64,30)"/>
		<rect x="16" y="16" width="${W - 32}" height="${W - 32}" rx="3" fill="none" stroke="rgb(255,64,236)" stroke-width="3"/>
	`;
	return { width: W, height: W, defs, body };
}

function ihsColorSvg() {
	const W = 1024;
	const rand = makeRandom(7331);
	const brush = [];
	for (let i = 0; i < 260; i += 1) {
		const y = rand() * W;
		brush.push(`<path d="M0 ${y.toFixed(1)}H${W}" stroke-width="${(0.5 + rand() * 1.3).toFixed(1)}" opacity="${(0.03 + rand() * 0.07).toFixed(2)}"/>`);
	}
	const defs = `
		<linearGradient id="nickel" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0" stop-color="#c3c6c3"/>
			<stop offset=".28" stop-color="#9b9f9d"/>
			<stop offset=".52" stop-color="#b9bcb9"/>
			<stop offset=".74" stop-color="#8f9391"/>
			<stop offset="1" stop-color="#b0b4b1"/>
		</linearGradient>
		<radialGradient id="sheen" cx=".32" cy=".18" r=".72">
			<stop offset="0" stop-color="#ffffff" stop-opacity=".34"/>
			<stop offset=".5" stop-color="#ffffff" stop-opacity=".06"/>
			<stop offset="1" stop-color="#000" stop-opacity="0"/>
		</radialGradient>
		<linearGradient id="etch" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0" stop-color="#6f7472"/>
			<stop offset=".5" stop-color="#5c615f"/>
			<stop offset="1" stop-color="#757a78"/>
		</linearGradient>
	`;
	const body = `
		<rect width="${W}" height="${W}" fill="url(#nickel)"/>
		<g stroke="#ffffff">
			${brush.join('\n\t\t\t')}
		</g>
		<rect width="${W}" height="${W}" fill="url(#sheen)"/>
		<rect x="42" y="42" width="${W - 84}" height="${W - 84}" rx="48" fill="none" stroke="#6b706e" stroke-width="1.4" opacity=".42"/>
		<rect x="52" y="52" width="${W - 104}" height="${W - 104}" rx="42" fill="none" stroke="#e2e4e0" stroke-width=".8" opacity=".35"/>
		<g fill="none" stroke="#666b69" stroke-width="1" opacity=".55">
			<path d="M454 330l58-58 58 58-58 58z"/>
			<path d="M480 330l32-32 32 32-32 32z" stroke="#8a8f8c" stroke-width=".8"/>
			<circle cx="512" cy="330" r="4" fill="#7d8280" stroke="none"/>
		</g>
		<g font-family="${SANS}" text-anchor="middle">
			<text x="${W / 2}" y="478" font-size="82" font-weight="500" letter-spacing="14" fill="#c9ccc8" opacity=".42">SILICON PATH</text>
			<text x="${W / 2}" y="480" font-size="82" font-weight="500" letter-spacing="14" fill="url(#etch)" opacity=".94">SILICON PATH</text>
			<text x="${W / 2}" y="528" font-size="16" letter-spacing="8.5" fill="#666b69" opacity=".88">MICROARCHITECTURE / SP—02</text>
		</g>
		<line x1="212" y1="562" x2="${W - 212}" y2="562" stroke="#707573" stroke-width="1" opacity=".6"/>
		<g font-family="${MONO}" text-anchor="middle" fill="#696e6c">
			<text x="${W / 2}" y="604" font-size="13" letter-spacing="6.5" opacity=".86">FROM SOURCE TO SILICON</text>
			<text x="${W / 2}" y="884" font-size="12.5" letter-spacing="4.2" opacity=".7">5 NM · 16 CORE · LGA-1700 · 125 W</text>
		</g>
		<g font-family="${MONO}" fill="#6d7270">
			<text x="78" y="106" font-size="10" letter-spacing="2.8" opacity=".7">SP—02</text>
			<text x="${W - 78}" y="106" font-size="10" letter-spacing="2.8" text-anchor="end" opacity=".58">REV A</text>
			<text x="78" y="${W - 78}" font-size="9.5" letter-spacing="2.6" opacity=".52">NICKEL / 1.0 MM</text>
			<text x="${W - 78}" y="${W - 78}" font-size="9.5" letter-spacing="2.6" text-anchor="end" opacity=".52">STUDIO 08</text>
		</g>
		<g font-family="${MONO}" fill="#5f6462" opacity=".46" font-size="8">
			<text x="96" y="580">THERMAL DESIGN POWER 125 W</text>
			<text x="${W - 96}" y="580" text-anchor="end">SEALED · DO NOT OPEN</text>
		</g>
	`;
	return { width: W, height: W, defs, body };
}

function ihsOrmSvg() {
	const W = 512;
	const rand = makeRandom(7332);
	const brush = [];
	for (let i = 0; i < 180; i += 1) {
		const y = rand() * W;
		brush.push(`<path d="M0 ${y.toFixed(1)}H${W}" stroke-width="${(0.6 + rand() * 1.6).toFixed(1)}" opacity="${(0.05 + rand() * 0.12).toFixed(2)}"/>`);
	}
	const defs = '';
	const body = `
		<rect width="${W}" height="${W}" fill="rgb(255,78,255)"/>
		<g stroke="#ffd0ff">
			${brush.join('\n\t\t\t')}
		</g>
		<rect x="21" y="21" width="${W - 42}" height="${W - 42}" rx="24" fill="none" stroke="rgb(255,132,240)" stroke-width="5"/>
		<g font-family="${SANS}" text-anchor="middle" fill="rgb(255,150,255)">
			<text x="${W / 2}" y="248" font-size="42" font-weight="500" letter-spacing="7">SILICON PATH</text>
			<text x="${W / 2}" y="274" font-size="9" letter-spacing="4">MICROARCHITECTURE / SP—02</text>
			<text x="${W / 2}" y="452" font-size="7" letter-spacing="2">5 NM · 16 CORE · LGA-1700 · 125 W</text>
		</g>
	`;
	return { width: W, height: W, defs, body };
}

function lgaColorSvg() {
	const W = 512;
	const pads = [];
	for (let y = 22; y <= W - 22; y += 21) {
		for (let x = 22; x <= W - 22; x += 21) {
			pads.push(`<circle cx="${x}" cy="${y}" r="6.4"/>`);
		}
	}
	const defs = `
		<radialGradient id="pad" cx=".38" cy=".32" r=".8">
			<stop offset="0" stop-color="#ffe2a0"/>
			<stop offset=".48" stop-color="#d3a852"/>
			<stop offset="1" stop-color="#8a6425"/>
		</radialGradient>
		<linearGradient id="board" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0" stop-color="#111611"/>
			<stop offset="1" stop-color="#070a07"/>
		</linearGradient>
	`;
	const body = `
		<rect width="${W}" height="${W}" fill="url(#board)"/>
		<g fill="url(#pad)" opacity=".9">
			${pads.join('\n\t\t')}
		</g>
		<rect x="8" y="8" width="${W - 16}" height="${W - 16}" rx="6" fill="none" stroke="#c49a4b" stroke-width="1.4" opacity=".55"/>
		<g font-family="${MONO}" fill="#b6a372" opacity=".6">
			<text x="${W - 18}" y="${W - 14}" font-size="8.5" letter-spacing="2" text-anchor="end">LGA-1700 · 0.55 MM</text>
		</g>
	`;
	return { width: W, height: W, defs, body };
}

const textureDefs = [
	{ key: 'carrierColor', name: 'hero-carrier-color', ...carrierColorSvg() },
	{ key: 'carrierOrm', name: 'hero-carrier-orm', ...carrierOrmSvg() },
	{ key: 'substrateColor', name: 'hero-substrate-color', ...substrateColorSvg() },
	{ key: 'substrateOrm', name: 'hero-substrate-orm', ...substrateOrmSvg() },
	{ key: 'dieColor', name: 'hero-die-color', ...dieColorSvg() },
	{ key: 'dieOrm', name: 'hero-die-orm', ...dieOrmSvg() },
	{ key: 'ihsColor', name: 'hero-ihs-color', ...ihsColorSvg() },
	{ key: 'ihsOrm', name: 'hero-ihs-orm', ...ihsOrmSvg() },
	{ key: 'lgaColor', name: 'hero-lga-color', ...lgaColorSvg() }
];

console.log('› Generating hero PBR texture maps...');
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
	const geometries = pieces.map((geometry) =>
		geometry.index ? geometry.toNonIndexed() : geometry
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

function mergedPiece(parent, geometries, material, transform) {
	const merged = mergePieces(geometries);
	parent.pieces.push({
		geometry: transform ? applyTransform(merged, transform) : merged,
		material
	});
}

/* -------------------------------------------------------------------------- */
/* Document + materials                                                       */
/* -------------------------------------------------------------------------- */

const doc = new Document();
doc.createExtension(KHRMaterialsIridescence).setRequired(true);
const buffer = doc.createBuffer();
const scene = doc.createScene('Silicon Path hero package');

function texture(key, name) {
	return doc
		.createTexture(name)
		.setImage(textureBuffers[key])
		.setMimeType('image/png')
		.setURI(`${name}.png`);
}

const textures = {
	carrierColor: texture('carrierColor', 'hero-carrier-color'),
	carrierOrm: texture('carrierOrm', 'hero-carrier-orm'),
	substrateColor: texture('substrateColor', 'hero-substrate-color'),
	substrateOrm: texture('substrateOrm', 'hero-substrate-orm'),
	dieColor: texture('dieColor', 'hero-die-color'),
	dieOrm: texture('dieOrm', 'hero-die-orm'),
	ihsColor: texture('ihsColor', 'hero-ihs-color'),
	ihsOrm: texture('ihsOrm', 'hero-ihs-orm'),
	lgaColor: texture('lgaColor', 'hero-lga-color')
};

const materials = {};

/* Carrier ---------------------------------------------------------------- */
materials.carrierEdge = doc
	.createMaterial('Hero carrier edge')
	.setBaseColorFactor([0.022, 0.038, 0.044, 1])
	.setMetallicFactor(0.22)
	.setRoughnessFactor(0.58);

materials.carrierTop = doc
	.createMaterial('Hero carrier top')
	.setBaseColorTexture(textures.carrierColor)
	.setMetallicRoughnessTexture(textures.carrierOrm)
	.setMetallicFactor(1)
	.setRoughnessFactor(1);

materials.carrierGold = doc
	.createMaterial('Hero carrier gold')
	.setBaseColorFactor([0.74, 0.55, 0.25, 1])
	.setMetallicFactor(1)
	.setRoughnessFactor(0.25);

/* Substrate -------------------------------------------------------------- */
materials.substrateEdge = doc
	.createMaterial('Hero substrate edge')
	.setBaseColorFactor([0.028, 0.042, 0.034, 1])
	.setMetallicFactor(0.2)
	.setRoughnessFactor(0.48);

materials.substrateTop = doc
	.createMaterial('Hero substrate top')
	.setBaseColorTexture(textures.substrateColor)
	.setMetallicRoughnessTexture(textures.substrateOrm)
	.setMetallicFactor(1)
	.setRoughnessFactor(1);

materials.substrateGold = doc
	.createMaterial('Hero substrate gold')
	.setBaseColorFactor([0.78, 0.58, 0.26, 1])
	.setMetallicFactor(1)
	.setRoughnessFactor(0.22);

materials.ceramic = doc
	.createMaterial('Hero ceramic')
	.setBaseColorFactor([0.1, 0.095, 0.085, 1])
	.setMetallicFactor(0.12)
	.setRoughnessFactor(0.5);

materials.silver = doc
	.createMaterial('Hero silver')
	.setBaseColorFactor([0.66, 0.68, 0.69, 1])
	.setMetallicFactor(1)
	.setRoughnessFactor(0.28);

materials.lga = doc
	.createMaterial('Hero LGA contacts')
	.setBaseColorTexture(textures.lgaColor)
	.setMetallicFactor(0.86)
	.setRoughnessFactor(0.3);

/* Die -------------------------------------------------------------------- */
materials.silicon = doc
	.createMaterial('Hero silicon')
	.setBaseColorFactor([0.075, 0.12, 0.22, 1])
	.setMetallicFactor(0.55)
	.setRoughnessFactor(0.18);

materials.dieTop = doc
	.createMaterial('Hero die floorplan')
	.setBaseColorTexture(textures.dieColor)
	.setMetallicRoughnessTexture(textures.dieOrm)
	.setMetallicFactor(1)
	.setRoughnessFactor(1);

materials.chiplet = doc
	.createMaterial('Hero chiplet')
	.setBaseColorFactor([0.13, 0.2, 0.38, 1])
	.setMetallicFactor(0.62)
	.setRoughnessFactor(0.13);

materials.microbump = doc
	.createMaterial('Hero die microbump')
	.setBaseColorFactor([0.8, 0.6, 0.28, 1])
	.setMetallicFactor(1)
	.setRoughnessFactor(0.2);

materials.underfill = doc
	.createMaterial('Hero underfill')
	.setBaseColorFactor([0.045, 0.04, 0.036, 1])
	.setMetallicFactor(0.1)
	.setRoughnessFactor(0.6);

/* Heat spreader ---------------------------------------------------------- */
materials.ihsMetal = doc
	.createMaterial('Hero ihs metal')
	.setBaseColorFactor([0.58, 0.59, 0.58, 1])
	.setMetallicFactor(0.96)
	.setRoughnessFactor(0.3);

materials.ihsTop = doc
	.createMaterial('Hero ihs etched top')
	.setBaseColorTexture(textures.ihsColor)
	.setMetallicRoughnessTexture(textures.ihsOrm)
	.setMetallicFactor(1)
	.setRoughnessFactor(1);

materials.ihsUnderside = doc
	.createMaterial('Hero ihs underside')
	.setBaseColorFactor([0.12, 0.12, 0.115, 1])
	.setMetallicFactor(0.9)
	.setRoughnessFactor(0.4);

materials.tim = doc
	.createMaterial('Hero graphite tim')
	.setBaseColorFactor([0.05, 0.055, 0.06, 1])
	.setMetallicFactor(0.3)
	.setRoughnessFactor(0.52);

materials.ihsBevel = doc
	.createMaterial('Hero ihs bevel')
	.setBaseColorFactor([0.72, 0.73, 0.72, 1])
	.setMetallicFactor(1)
	.setRoughnessFactor(0.22);

materials.ihsGold = doc
	.createMaterial('Hero ihs seal')
	.setBaseColorFactor([0.76, 0.58, 0.27, 1])
	.setMetallicFactor(1)
	.setRoughnessFactor(0.24);

/* Iridescence: the die catches a thin-film rainbow like a wafer under a
 * studio softbox, while the lid stays neutral nickel. */
const iridescence = doc.createExtension(KHRMaterialsIridescence);
const dieIridescence = iridescence
	.createIridescence()
	.setIridescenceFactor(0.72)
	.setIridescenceIOR(1.46)
	.setIridescenceThicknessMinimum(120)
	.setIridescenceThicknessMaximum(420);
materials.dieTop.setExtension('KHR_materials_iridescence', dieIridescence);

const chipletIridescence = iridescence
	.createIridescence()
	.setIridescenceFactor(0.82)
	.setIridescenceIOR(1.5)
	.setIridescenceThicknessMinimum(100)
	.setIridescenceThicknessMaximum(500);
materials.chiplet.setExtension('KHR_materials_iridescence', chipletIridescence);

/* -------------------------------------------------------------------------- */
/* Geometry assembly                                                          */
/* -------------------------------------------------------------------------- */

const carrier = part('hero-carrier', [0, 0.1, 0]);
piece(carrier, roundBox(6.4, 0.2, 6.4, 0.055, 5), materials.carrierEdge);
piece(carrier, horizontalPlane(6.28, 6.28), materials.carrierTop, { position: [0, 0.1008, 0] });

const carrierBrackets = [];
for (const [sx, sz] of [
	[-1, -1],
	[1, -1],
	[-1, 1],
	[1, 1]
]) {
	carrierBrackets.push(
		applyTransform(new THREE.BoxGeometry(0.55, 0.012, 0.045), {
			position: [sx * 2.9, 0.108, sz * 3.02]
		})
	);
	carrierBrackets.push(
		applyTransform(new THREE.BoxGeometry(0.045, 0.012, 0.55), {
			position: [sx * 3.02, 0.108, sz * 2.9]
		})
	);
}
mergedPiece(carrier, carrierBrackets, materials.carrierGold);

const substrate = part('hero-substrate', [0, 0.29, 0]);
piece(substrate, roundBox(5.0, 0.18, 5.0, 0.045, 5), materials.substrateEdge);
piece(substrate, horizontalPlane(4.92, 4.92), materials.substrateTop, { position: [0, 0.0908, 0] });
piece(substrate, horizontalPlane(4.92, 4.92, true), materials.lga, { position: [0, -0.0908, 0] });

const substrateRails = [];
for (const axis of [0, 1]) {
	for (const side of [-1, 1]) {
		substrateRails.push(
			applyTransform(
				axis === 0
					? new THREE.BoxGeometry(0.035, 0.02, 4.42)
					: new THREE.BoxGeometry(4.42, 0.02, 0.035),
				{
					position: axis === 0 ? [side * 2.43, 0.094, 0] : [0, 0.094, side * 2.43]
				}
			)
		);
	}
}
mergedPiece(substrate, substrateRails, materials.substrateGold);

const capBodies = [];
const capEnds = [];
for (let side = 0; side < 4; side += 1) {
	for (let i = 0; i < 5; i += 1) {
		const t = -2 + i;
		let x = 0;
		let z = 0;
		let rotY = 0;
		if (side === 0) {
			x = 2.36;
			z = t;
			rotY = Math.PI / 2;
		} else if (side === 1) {
			x = -2.36;
			z = t;
			rotY = Math.PI / 2;
		} else if (side === 2) {
			x = t;
			z = 2.36;
		} else {
			x = t;
			z = -2.36;
		}
		capBodies.push(
			applyTransform(new THREE.BoxGeometry(0.24, 0.075, 0.12), {
				position: [x, 0.126, z],
				rotation: [0, rotY, 0]
			})
		);
		for (const end of [-1, 1]) {
			capEnds.push(
				applyTransform(new THREE.BoxGeometry(0.05, 0.079, 0.124), {
					position: [x + Math.cos(rotY) * end * 0.097, 0.126, z - Math.sin(rotY) * end * 0.097],
					rotation: [0, rotY, 0]
				})
			);
		}
	}
}
mergedPiece(substrate, capBodies, materials.ceramic);
mergedPiece(substrate, capEnds, materials.silver);

const substratePads = [];
for (const [sx, sz] of [
	[-1, -1],
	[1, -1],
	[-1, 1],
	[1, 1]
]) {
	substratePads.push(
		applyTransform(new THREE.BoxGeometry(0.24, 0.014, 0.24), {
			position: [sx * 2.12, 0.095, sz * 2.12]
		})
	);
}
mergedPiece(substrate, substratePads, materials.substrateGold);

const die = part('hero-die', [0, 0.44, 0]);
piece(die, roundBox(2.7, 0.11, 2.7, 0.018, 4), materials.silicon);
piece(die, horizontalPlane(2.66, 2.66), materials.dieTop, { position: [0, 0.0558, 0] });
piece(die, roundBox(2.92, 0.028, 2.92, 0.02, 3), materials.underfill, {
	position: [0, -0.062, 0]
});

const chiplets = [];
for (const [sx, sz] of [
	[-1, -1],
	[1, -1],
	[-1, 1],
	[1, 1]
]) {
	chiplets.push(
		applyTransform(roundBox(0.98, 0.032, 0.98, 0.014, 3), {
			position: [sx * 0.63, 0.072, sz * 0.63]
		})
	);
}
chiplets.push(applyTransform(roundBox(0.62, 0.042, 0.62, 0.012, 3), { position: [0, 0.077, 0] }));
mergedPiece(die, chiplets, materials.chiplet);

const bumps = [];
for (let i = 0; i < 12; i += 1) {
	const t = -1.18 + i * 0.2145;
	bumps.push(
		applyTransform(new THREE.BoxGeometry(0.05, 0.008, 0.1), {
			position: [t, 0.058, 1.285]
		})
	);
	bumps.push(
		applyTransform(new THREE.BoxGeometry(0.05, 0.008, 0.1), {
			position: [t, 0.058, -1.285]
		})
	);
	bumps.push(
		applyTransform(new THREE.BoxGeometry(0.1, 0.008, 0.05), {
			position: [1.285, 0.058, t]
		})
	);
	bumps.push(
		applyTransform(new THREE.BoxGeometry(0.1, 0.008, 0.05), {
			position: [-1.285, 0.058, t]
		})
	);
}
mergedPiece(die, bumps, materials.microbump);

const ihs = part('hero-ihs', [0, 0.76, 0]);
piece(ihs, roundBox(5.25, 0.36, 5.25, 0.08, 6), materials.ihsMetal);
piece(ihs, roundBox(5.0, 0.07, 5.0, 0.045, 4), materials.ihsMetal, { position: [0, -0.205, 0] });
piece(ihs, horizontalPlane(5.06, 5.06), materials.ihsTop, { position: [0, 0.1808, 0] });
piece(ihs, horizontalPlane(4.82, 4.82, true), materials.ihsUnderside, {
	position: [0, -0.2415, 0]
});
piece(ihs, roundBox(3.0, 0.05, 3.0, 0.02, 3), materials.tim, { position: [0, -0.278, 0] });

const bevel = [];
for (const [axis, side] of [
	[0, -1],
	[0, 1],
	[1, -1],
	[1, 1]
]) {
	bevel.push(
		applyTransform(
			axis === 0
				? new THREE.BoxGeometry(0.035, 0.014, 5.02)
				: new THREE.BoxGeometry(5.02, 0.014, 0.035),
			{ position: axis === 0 ? [side * 2.53, 0.184, 0] : [0, 0.184, side * 2.53] }
		)
	);
}
mergedPiece(ihs, bevel, materials.ihsBevel);

const ihsSeals = [];
for (const [sx, sz] of [
	[-1, -1],
	[1, -1],
	[-1, 1],
	[1, 1]
]) {
	ihsSeals.push(
		applyTransform(new THREE.BoxGeometry(0.22, 0.03, 0.22), {
			position: [sx * 2.3, -0.185, sz * 2.3]
		})
	);
}
mergedPiece(ihs, ihsSeals, materials.ihsGold);

/* -------------------------------------------------------------------------- */
/* glTF document                                                              */
/* -------------------------------------------------------------------------- */

const partOrder = ['hero-carrier', 'hero-substrate', 'hero-die', 'hero-ihs'];
const layerLabels = {
	'hero-carrier': 'carrier',
	'hero-substrate': 'substrate',
	'hero-die': 'die',
	'hero-ihs': 'heat spreader'
};

function createAccessor(array, type) {
	return doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
}

function addPrimitive(mesh, geometry, material) {
	const nonIndexed = geometry.index ? geometry.toNonIndexed() : geometry.clone();
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
const sourcePath = path.join(CACHE, 'hero-chip.source.glb');
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
run(cli, ['weld', sourcePath, temp('hero.weld.glb')]);
run(cli, ['dedup', temp('hero.weld.glb'), temp('hero.dedup.glb')]);
run(cli, ['prune', temp('hero.dedup.glb'), temp('hero.pruned.glb')]);

console.log('› Compressing textures with KTX2 / ETC1S...');
run(cli, [
	'etc1s',
	temp('hero.pruned.glb'),
	temp('hero.ktx2.glb'),
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
	temp('hero.ktx2.glb'),
	path.join(MODEL_DIR, 'hero-chip.glb'),
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
const finalBytes = await fs.stat(path.join(MODEL_DIR, 'hero-chip.glb'));
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
const finalJson = await readGlbJson(path.join(MODEL_DIR, 'hero-chip.glb'));
const usedExtensions = finalJson.extensionsUsed ?? [];
const nodeNames = finalJson.nodes.map((node) => node.name);
console.log(`✓ Final model written (${fmt(finalBytes.size)})`);
console.log(`  extensions: ${usedExtensions.join(', ') || 'none'}`);
console.log(`  nodes: ${nodeNames.join(', ')}`);

for (const name of partOrder) {
	if (!nodeNames.includes(name)) throw new Error(`Missing hero package layer: ${name}`);
}
if (!usedExtensions.includes('EXT_texture_webp') && !usedExtensions.includes('KHR_texture_basisu')) {
	throw new Error('Textures were not converted to KTX2.');
}
if (!usedExtensions.includes('KHR_draco_mesh_compression')) {
	throw new Error('Geometry was not Draco compressed.');
}

// Report triangle and part information for the handoff.
let triangles = 0;
for (const name of partOrder) {
	for (const item of parts.get(name).pieces) {
		const count = item.geometry.index ? item.geometry.index.count : item.geometry.attributes.position.count;
		triangles += Math.floor(count / 3);
	}
}
// Texel density check: each layer's top plane is authored in world units, so
// log the mapped size to keep future edits honest about resolution.
console.log(`  parts: ${partOrder.map((name) => `${name} (${layerLabels[name]})`).join(', ')}`);
console.log(`  triangles (pre-compression): ${triangles.toLocaleString()}`);
console.log(`  textures: ${textureDefs.length} maps (${textureDefs.map((t) => t.key).join(', ')})`);
console.log(`  layers: ${partOrder.length}`);