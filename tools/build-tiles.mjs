/* Cuts every map image listed in data/games.json into 256px WebP tiles
 * plus a preview thumbnail, and records them in data/assets.json. Each
 * tile also holds a few pixels of its neighbours (`overlap`), which the
 * site draws over them so tile edges don't show. Images of any size work:
 * each zoom level is kept on disk while it is cut, not in memory.
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
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { parseArgs } from 'node:util';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT_DIR = path.join(ROOT, 'dist-assets');
const ASSETS_FILE = path.join(ROOT, 'data', 'assets.json');

// changing these rebuilds every map (they are part of the hash)
const SETTINGS = { tileSize: 256, overlap: 2, quality: 80, smartSubsample: true, previewWidth: 512, previewQuality: 80 };
const CONCURRENCY = 8;
// map renders are far beyond libvips' default safety limit
const OPEN = { limitInputPixels: false };

// cached open images would keep the temporary level files locked on Windows
sharp.cache(false);

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

async function hashFile(file) {
  const hash = createHash('sha256').update(JSON.stringify(SETTINGS));
  await pipeline(createReadStream(file), hash);
  return hash.digest('hex').slice(0, 10);
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

/* Cuts one level, stored in levelFile, into <tilesDir>/<z>/{y}/{x}.webp.
 * A tile covers tileSize pixels plus `overlap` more on every side
 * (transparent past the image edge), so its files are tileSize + 2 * overlap
 * pixels square. The level is read one row of tiles at a time. */
async function cutLevel(levelFile, width, height, z, tilesDir) {
  const { tileSize, overlap } = SETTINGS;
  const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
  for (let y = 0; y * tileSize < height; y++) {
    const rowDir = path.join(tilesDir, String(z), String(y));
    await mkdir(rowDir, { recursive: true });
    const top = y * tileSize - overlap;
    const bottom = top + tileSize + 2 * overlap;
    const stripTop = Math.max(0, top);
    const stripHeight = Math.min(height, bottom) - stripTop;
    const strip = await sharp(levelFile, OPEN)
      .extract({ left: 0, top: stripTop, width, height: stripHeight })
      .raw()
      .toBuffer();
    const stripImage = { raw: { width, height: stripHeight, channels: 4 } };

    const writeTile = async (x) => {
      const left = x * tileSize - overlap;
      const right = left + tileSize + 2 * overlap;
      const insideLeft = Math.max(0, left);
      const insideWidth = Math.min(width, right) - insideLeft;
      await sharp(strip, stripImage)
        .extract({ left: insideLeft, top: 0, width: insideWidth, height: stripHeight })
        .extend({
          left: insideLeft - left,
          right: right - (insideLeft + insideWidth),
          top: stripTop - top,
          bottom: bottom - (stripTop + stripHeight),
          background: transparent,
        })
        .webp({ quality: SETTINGS.quality, smartSubsample: SETTINGS.smartSubsample })
        .toFile(path.join(rowDir, `${x}.webp`));
    };
    const columns = Array.from({ length: Math.ceil(width / tileSize) }, (_, x) => x);
    for (let i = 0; i < columns.length; i += CONCURRENCY) {
      await Promise.all(columns.slice(i, i + CONCURRENCY).map(writeTile));
    }
  }
}

/* Writes the tile pyramid and the preview: level `levels` is full size,
 * each level below half the one above, level 0 a single tile. Levels are
 * kept as uncompressed .v files in a temporary folder, which libvips reads
 * without loading them whole. */
async function writeTiles(sourceFile, tilesDir, previewFile) {
  const { width, height } = await sharp(sourceFile, OPEN).metadata();
  const levels = Math.max(0, Math.ceil(Math.log2(Math.max(width, height) / SETTINGS.tileSize)));
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'slymap-tiles-'));
  try {
    let level = { file: path.join(tempDir, `${levels}.v`), width, height };
    await sharp(sourceFile, OPEN).ensureAlpha().toFile(level.file);
    let previewDone = false;
    for (let z = levels; z >= 0; z--) {
      await cutLevel(level.file, level.width, level.height, z, tilesDir);
      const half = { file: path.join(tempDir, `${z - 1}.v`), width: Math.ceil(level.width / 2), height: Math.ceil(level.height / 2) };
      // the preview comes from the smallest level that is still at least its size
      if (!previewDone && (z === 0 || half.width < SETTINGS.previewWidth)) {
        await sharp(level.file, OPEN)
          .resize({ width: SETTINGS.previewWidth })
          .webp({ quality: SETTINGS.previewQuality })
          .toFile(previewFile);
        previewDone = true;
      }
      if (z > 0) {
        await sharp(level.file, OPEN).resize(half.width, half.height, { fit: 'fill' }).toFile(half.file);
      }
      await rm(level.file, { force: true, maxRetries: 5 });
      level = half;
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true, maxRetries: 5 });
  }
  return { width, height, levels };
}

async function buildMap(key, sourceFile, hash) {
  const tilesPrefix = `tiles/${key}/${hash}`;
  const previewPath = `previews/${key}-${hash}.webp`;

  // drop this map's older builds so dist-assets mirrors what is in use
  await rm(path.join(OUT_DIR, 'tiles', key), { recursive: true, force: true });
  await removeOldFiles('previews', key);
  await mkdir(path.dirname(path.join(OUT_DIR, previewPath)), { recursive: true });

  const { width, height, levels } = await writeTiles(sourceFile, path.join(OUT_DIR, tilesPrefix),
    path.join(OUT_DIR, previewPath));
  return {
    hash,
    size: [height, width],
    tiles: `${tilesPrefix}/{z}/{y}/{x}.webp`,
    tileSize: SETTINGS.tileSize,
    overlap: SETTINGS.overlap,
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
  const hash = await hashFile(sourceFile);
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
