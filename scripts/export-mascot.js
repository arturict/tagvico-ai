'use strict';

/*
 * Writes the mascot as standalone files into public/mascot/ for the landing page, the docs and the
 * release video. The pixel art lives in src/components/mascot/art.ts and the motion in
 * src/app/styles/mascot.css; run this after changing either (tests/mascot.test.js fails when the
 * committed SVG files are out of date):
 *
 *   node scripts/export-mascot.js
 *
 * Output per pose: <pose>.svg (static), <pose>-animated.svg (CSS motion inlined, honours
 * prefers-reduced-motion), <pose>.png (256 px, transparent). Also idle-512.png and all-poses.png.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');
const sharp = require('sharp');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'public', 'mascot');

function loadArt() {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tagvico-mascot-')), 'art.cjs');
  esbuild.buildSync({
    entryPoints: [path.join(root, 'src', 'components', 'mascot', 'art.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: file,
    logLevel: 'silent'
  });
  return require(file);
}

function inlineCss() {
  return fs.readFileSync(path.join(root, 'src', 'app', 'styles', 'mascot.css'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{}:;,])\s*/g, '$1')
    .trim();
}

async function png(svg, size) {
  return sharp(Buffer.from(svg), { density: 72 }).resize(size, size, { kernel: 'nearest' }).png().toBuffer();
}

async function main() {
  const art = loadArt();
  const css = inlineCss();
  fs.mkdirSync(outDir, { recursive: true });
  const tiles = [];
  for (const pose of art.MASCOT_POSES) {
    fs.writeFileSync(path.join(outDir, `${pose}.svg`), art.poseSvg(pose));
    fs.writeFileSync(path.join(outDir, `${pose}-animated.svg`), art.poseSvg(pose, css));
    const tile = await png(art.poseSvg(pose, '', 256), 256);
    fs.writeFileSync(path.join(outDir, `${pose}.png`), tile);
    tiles.push(tile);
  }
  fs.writeFileSync(path.join(outDir, 'idle-512.png'), await png(art.poseSvg('idle', '', 512), 512));
  await sharp({ create: { width: 256 * tiles.length, height: 256, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(tiles.map((input, index) => ({ input, left: index * 256, top: 0 })))
    .png()
    .toFile(path.join(outDir, 'all-poses.png'));
  console.log(`Wrote ${art.MASCOT_POSES.length} poses to ${path.relative(root, outDir)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
