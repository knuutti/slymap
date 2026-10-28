/* Cuts every map image listed in data/games.json into 256px WebP tiles
 * plus a preview thumbnail, and records them in data/assets.json.
 *
 *   npm run tiles                  build new or changed maps
 *   npm run tiles -- sly2/paris    only these maps
 *   npm run tiles -- --force       rebuild everything
 *   npm run tiles -- --src <dir>   folder holding the images (default: repo root)
 *
 * Output goes to dist-assets/ using the same paths as the R2 bucket;
 * `npm run upload` sends it there. Each build lives in a folder named
 * after a hash of the source image, so a changed image gets new URLs and
 * browsers can cache tiles forever. */

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT_DIR = path.join(ROOT, 'dist-assets');
const ASSETS_FILE = path.join(ROOT, 'data', 'assets.json');

// changing these rebuilds every map (they are part of the hash)
const SETTINGS = { tileSize: 256, quality: 85, smartSubsample: true, previewWidth: 512, previewQuality: 80 };

const { values: options, positionals: onlyKeys } = parseArgs({
  allowPositionals: true,
  options: {
    src: { type: 'string', default: ROOT },
    force: { type: 'boolean', default: false },
  },
});

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    if (fallback !== undefined && error.code === 'ENOENT') {
      return fallback;
    }
    throw error;
  }
}

function listMaps(catalog) {
  return catalog.games.flatMap((game) => game.episodes.flatMap((episode) =>
    episode.maps.map((map) => ({ key: `${game.id}/${map.id}`, image: map.image }))));
}

async function buildMap(key, sourceFile, hash) {
  const tilesPrefix = `tiles/${key}/${hash}`;
  const previewPath = `previews/${key}-${hash}.webp`;

  // drop this map's older builds so dist-assets mirrors what is in use
  await rm(path.join(OUT_DIR, 'tiles', key), { recursive: true, force: true });
  const previewDir = path.join(OUT_DIR, 'previews', path.dirname(key));
  if (existsSync(previewDir)) {
    const ownPreview = new RegExp(`^${path.basename(key)}-[0-9a-f]{10}\\.webp$`);
    for (const file of await readdir(previewDir)) {
      if (ownPreview.test(file)) {
        await rm(path.join(previewDir, file));
      }
    }
  }

  const tilesDir = path.join(OUT_DIR, tilesPrefix);
  await mkdir(path.dirname(tilesDir), { recursive: true });
  const { width, height } = await sharp(sourceFile)
    .webp({ quality: SETTINGS.quality, smartSubsample: SETTINGS.smartSubsample })
    .tile({
      size: SETTINGS.tileSize,
      layout: 'google',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      skipBlanks: -1,
    })
    .toFile(tilesDir);
  // libvips side files, not needed by the site
  await rm(path.join(tilesDir, 'blank.png'), { force: true });
  await rm(path.join(tilesDir, 'vips-properties.xml'), { force: true });
  await rm(path.join(path.dirname(tilesDir), 'vips-properties.xml'), { force: true });

  await mkdir(path.dirname(path.join(OUT_DIR, previewPath)), { recursive: true });
  await sharp(sourceFile)
    .resize({ width: SETTINGS.previewWidth })
    .webp({ quality: SETTINGS.previewQuality })
    .toFile(path.join(OUT_DIR, previewPath));

  const levels = Math.max(0, Math.ceil(Math.log2(Math.max(width, height) / SETTINGS.tileSize)));
  return {
    hash,
    size: [height, width],
    tiles: `${tilesPrefix}/{z}/{y}/{x}.webp`,
    tileSize: SETTINGS.tileSize,
    levels,
    preview: previewPath,
  };
}

const catalog = await readJson(path.join(ROOT, 'data', 'games.json'));
const assets = await readJson(ASSETS_FILE, {});
const maps = listMaps(catalog).filter((map) => !onlyKeys.length || onlyKeys.includes(map.key));
const unknown = onlyKeys.filter((key) => !maps.some((map) => map.key === key));
if (unknown.length) {
  console.error(`Unknown map key(s): ${unknown.join(', ')}`);
  process.exit(1);
}

let built = 0;
let failed = 0;
for (const { key, image } of maps) {
  const sourceFile = path.resolve(options.src, image);
  if (!existsSync(sourceFile)) {
    console.warn(`skip  ${key}: ${sourceFile} not found`);
    continue;
  }
  const hash = createHash('sha256')
    .update(await readFile(sourceFile))
    .update(JSON.stringify(SETTINGS))
    .digest('hex')
    .slice(0, 10);
  const builtBefore = existsSync(path.join(OUT_DIR, 'tiles', key, hash));
  if (!options.force && assets[key]?.hash === hash && builtBefore) {
    console.log(`ok    ${key} (unchanged)`);
    continue;
  }
  try {
    const started = Date.now();
    assets[key] = await buildMap(key, sourceFile, hash);
    built++;
    console.log(`built ${key} -> ${assets[key].tiles} (${((Date.now() - started) / 1000).toFixed(1)}s)`);
  } catch (error) {
    failed++;
    console.error(`fail  ${key}: ${error.message}`);
  }
}

// keep the file stable and free of maps that were removed from games.json
const knownKeys = new Set(listMaps(catalog).map((map) => map.key));
const sorted = Object.fromEntries(Object.keys(assets).filter((key) => knownKeys.has(key)).sort()
  .map((key) => [key, assets[key]]));
await writeFile(ASSETS_FILE, JSON.stringify(sorted, null, 2) + '\n');

console.log(`\n${built} built, ${failed} failed. Next: npm run upload, then commit data/assets.json.`);
process.exit(failed ? 1 : 0);
