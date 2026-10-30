/* Cuts every map image listed in data/games.json into 256px WebP tiles
 * plus a preview thumbnail and a full-size download copy, and records
 * them in data/assets.json. Each tile also holds a few pixels of its
 * neighbours (`overlap`), which the site draws over them so tile edges
 * don't show.
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
import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT_DIR = path.join(ROOT, 'dist-assets');
const ASSETS_FILE = path.join(ROOT, 'data', 'assets.json');

// changing these rebuilds every map (they are part of the hash)
const SETTINGS = { tileSize: 256, overlap: 2, quality: 85, smartSubsample: true, previewWidth: 512, previewQuality: 80 };
const CONCURRENCY = 8;

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

/* Removes this map's older <folder>/<game>/<map>-<hash>.* files. */
async function removeOldFiles(folder, key) {
  const dir = path.join(OUT_DIR, folder, path.dirname(key));
  if (!existsSync(dir)) {
    return;
  }
  const own = new RegExp(`^${path.basename(key)}-[0-9a-f]{10}\\.[a-z]+$`, 'i');
  for (const file of await readdir(dir)) {
    if (own.test(file)) {
      await rm(path.join(dir, file));
    }
  }
}

/* The full-size image offered on the site's "Download map image" button:
 * the source file itself, under downloads/. */
async function addDownload(key, sourceFile, hash) {
  const downloadPath = `downloads/${key}-${hash}${path.extname(sourceFile).toLowerCase()}`;
  const target = path.join(OUT_DIR, downloadPath);
  if (!existsSync(target)) {
    await removeOldFiles('downloads', key);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(sourceFile, target);
  }
  return { path: downloadPath, bytes: (await stat(target)).size };
}

/* Writes <tilesDir>/{z}/{y}/{x}.webp: level `levels` is full size, each
 * level below half the one above, level 0 a single tile. A tile covers
 * tileSize pixels plus `overlap` more on every side (transparent past the
 * image edge), so its files are tileSize + 2 * overlap pixels square. */
async function writeTiles(sourceFile, tilesDir) {
  const { tileSize, overlap } = SETTINGS;
  const full = await sharp(sourceFile).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = full.info;
  const levels = Math.max(0, Math.ceil(Math.log2(Math.max(width, height) / tileSize)));
  const transparent = { r: 0, g: 0, b: 0, alpha: 0 };

  let level = { data: full.data, width, height };
  for (let z = levels; z >= 0; z--) {
    if (z < levels) {
      const halfWidth = Math.ceil(level.width / 2);
      const halfHeight = Math.ceil(level.height / 2);
      const data = await sharp(level.data, { raw: { width: level.width, height: level.height, channels: 4 } })
        .resize(halfWidth, halfHeight, { fit: 'fill' })
        .raw()
        .toBuffer();
      level = { data, width: halfWidth, height: halfHeight };
    }
    const { data, width: levelWidth, height: levelHeight } = level;
    const jobs = [];
    for (let y = 0; y * tileSize < levelHeight; y++) {
      await mkdir(path.join(tilesDir, String(z), String(y)), { recursive: true });
      for (let x = 0; x * tileSize < levelWidth; x++) {
        jobs.push({ x, y });
      }
    }
    const writeTile = async ({ x, y }) => {
      const left = x * tileSize - overlap;
      const top = y * tileSize - overlap;
      const right = left + tileSize + 2 * overlap;
      const bottom = top + tileSize + 2 * overlap;
      const inside = {
        left: Math.max(0, left),
        top: Math.max(0, top),
        width: Math.min(levelWidth, right) - Math.max(0, left),
        height: Math.min(levelHeight, bottom) - Math.max(0, top),
      };
      await sharp(data, { raw: { width: levelWidth, height: levelHeight, channels: 4 } })
        .extract(inside)
        .extend({
          left: inside.left - left,
          top: inside.top - top,
          right: right - (inside.left + inside.width),
          bottom: bottom - (inside.top + inside.height),
          background: transparent,
        })
        .webp({ quality: SETTINGS.quality, smartSubsample: SETTINGS.smartSubsample })
        .toFile(path.join(tilesDir, String(z), String(y), `${x}.webp`));
    };
    for (let i = 0; i < jobs.length; i += CONCURRENCY) {
      await Promise.all(jobs.slice(i, i + CONCURRENCY).map(writeTile));
    }
  }
  return { width, height, levels };
}

async function buildMap(key, sourceFile, hash) {
  const tilesPrefix = `tiles/${key}/${hash}`;
  const previewPath = `previews/${key}-${hash}.webp`;

  // drop this map's older builds so dist-assets mirrors what is in use
  await rm(path.join(OUT_DIR, 'tiles', key), { recursive: true, force: true });
  await removeOldFiles('previews', key);

  const { width, height, levels } = await writeTiles(sourceFile, path.join(OUT_DIR, tilesPrefix));

  await mkdir(path.dirname(path.join(OUT_DIR, previewPath)), { recursive: true });
  await sharp(sourceFile)
    .resize({ width: SETTINGS.previewWidth })
    .webp({ quality: SETTINGS.previewQuality })
    .toFile(path.join(OUT_DIR, previewPath));

  return {
    hash,
    size: [height, width],
    tiles: `${tilesPrefix}/{z}/{y}/{x}.webp`,
    tileSize: SETTINGS.tileSize,
    overlap: SETTINGS.overlap,
    levels,
    preview: previewPath,
    download: await addDownload(key, sourceFile, hash),
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
    // builds from before downloads existed only need the download added
    const hadDownload = assets[key].download && existsSync(path.join(OUT_DIR, assets[key].download.path));
    assets[key].download = await addDownload(key, sourceFile, hash);
    console.log(`ok    ${key} (unchanged${hadDownload ? '' : ', download added'})`);
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
