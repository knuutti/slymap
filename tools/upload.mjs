/* Syncs dist-assets/ (tiles and previews from `npm run tiles`) to the R2
 * bucket. Files already in the bucket with the same content are skipped.
 *
 *   npm run upload                 upload new and changed files
 *   npm run upload -- --dry-run    only show what would be uploaded
 *   npm run upload -- --prune      also delete old builds from the bucket
 *
 * Credentials come from .env in the repo root (see .env.example). */

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

const ROOT = path.resolve(import.meta.dirname, '..');
const SOURCE_DIR = path.join(ROOT, 'dist-assets');
// only these bucket folders are managed (and pruned) by this script;
// downloads/ is no longer built and stays listed so --prune deletes old copies
const PREFIXES = ['tiles/', 'previews/', 'downloads/'];
const CONCURRENCY = 16;
const CONTENT_TYPES = {
  '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.json': 'application/json',
};
// file names contain a content hash, so a URL never changes meaning
const CACHE_CONTROL = 'public, max-age=31536000, immutable';

const { values: options } = parseArgs({
  options: {
    'dry-run': { type: 'boolean', default: false },
    prune: { type: 'boolean', default: false },
  },
});

if (existsSync(path.join(ROOT, '.env'))) {
  process.loadEnvFile(path.join(ROOT, '.env'));
}
const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
const missing = Object.entries({ R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET })
  .filter(([, value]) => !value).map(([name]) => name);
if (missing.length) {
  console.error(`Missing ${missing.join(', ')}. Copy .env.example to .env and fill it in.`);
  process.exit(1);
}

/* The account's S3 endpoint. Takes the 32-character account ID, or the
 * bucket's "S3 API" URL from the dashboard (https://<account>.r2.cloudflarestorage.com/<bucket>,
 * with .eu. for EU buckets) in R2_ENDPOINT or R2_ACCOUNT_ID. */
function resolveEndpoint() {
  const value = (process.env.R2_ENDPOINT || R2_ACCOUNT_ID).trim();
  if (/^[0-9a-f]{32}$/i.test(value)) {
    return `https://${value}.r2.cloudflarestorage.com`;
  }
  try {
    const url = new URL(/^[a-z]+:\/\//i.test(value) ? value : `https://${value}`);
    if (url.hostname.includes('.') || url.hostname == 'localhost') {
      return `${url.protocol}//${url.host}`;
    }
  } catch {
    // reported below
  }
  console.error(`R2_ACCOUNT_ID "${value}" doesn't look right. Use the 32-character Account ID from ` +
    'the R2 overview page, or the bucket\'s S3 API URL from its Settings tab.');
  process.exit(1);
}

/* Plain-language hint for the first request failing. */
function explainError(error, endpoint) {
  const code = error.code ?? error.name ?? '';
  if (['EPROTO', 'ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN'].includes(code) ||
      /certificate|handshake|SSL|XML parse/i.test(error.message)) {
    return `Could not connect to ${endpoint}. Check R2_ACCOUNT_ID in .env (the Account ID, ` +
      'or paste the bucket\'s S3 API URL from its Settings tab, which is also right for EU buckets). ' +
      'A VPN, proxy or antivirus that inspects HTTPS can cause this too.';
  }
  if (['InvalidAccessKeyId', 'SignatureDoesNotMatch', 'AccessDenied', 'Unauthorized'].includes(code) ||
      [401, 403].includes(error.$metadata?.httpStatusCode)) {
    return 'R2 refused the key. Check R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY in .env, and that the ' +
      `token has Object Read & Write access to the bucket "${R2_BUCKET}".`;
  }
  if (code === 'NoSuchBucket') {
    return `There is no bucket "${R2_BUCKET}" in this account. Check R2_BUCKET in .env; for an EU bucket, ` +
      'use its S3 API URL from the Settings tab as R2_ACCOUNT_ID.';
  }
  return null;
}

const endpoint = resolveEndpoint();
const client = new S3Client({
  region: 'auto',
  endpoint,
  // the bucket goes in the path, not in front of the host name
  forcePathStyle: true,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
});

async function listLocalFiles(dir) {
  if (!existsSync(dir)) {
    return [];
  }
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries.filter((entry) => entry.isFile())
    .map((entry) => path.relative(SOURCE_DIR, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'));
}

/* key -> ETag (the MD5 of the content for files uploaded in one part) */
async function listRemoteFiles(prefix) {
  const remote = new Map();
  let ContinuationToken;
  do {
    const page = await client.send(new ListObjectsV2Command({ Bucket: R2_BUCKET, Prefix: prefix, ContinuationToken }));
    (page.Contents ?? []).forEach((object) => remote.set(object.Key, object.ETag?.replaceAll('"', '')));
    ContinuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (ContinuationToken);
  return remote;
}

async function runPool(items, worker) {
  let next = 0;
  let done = 0;
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      await worker(item);
      done++;
      if (done % 200 === 0 || done === items.length) {
        console.log(`  ${done}/${items.length}`);
      }
    }
  }));
}

const local = (await Promise.all(PREFIXES.map((prefix) => listLocalFiles(path.join(SOURCE_DIR, prefix))))).flat();
if (!local.length) {
  console.error('dist-assets/ is empty. Run `npm run tiles` first.');
  process.exit(1);
}

console.log(`Comparing ${local.length} local files with bucket "${R2_BUCKET}" at ${endpoint}...`);
const remote = new Map();
try {
  for (const prefix of PREFIXES) {
    (await listRemoteFiles(prefix)).forEach((etag, key) => remote.set(key, etag));
  }
} catch (error) {
  const hint = explainError(error, endpoint);
  if (!hint) {
    throw error;
  }
  console.error(`\n${hint}\n\n(${error.code ?? error.name}: ${error.message})`);
  process.exit(1);
}

const uploads = [];
for (const key of local) {
  const body = await readFile(path.join(SOURCE_DIR, key));
  if (remote.get(key) !== createHash('md5').update(body).digest('hex')) {
    uploads.push(key);
  }
}
const localKeys = new Set(local);
const stale = [...remote.keys()].filter((key) => !localKeys.has(key));

console.log(`${uploads.length} to upload, ${local.length - uploads.length} already up to date, ` +
  `${stale.length} in the bucket but not local${options.prune ? ' (will delete)' : ''}.`);

if (options['dry-run']) {
  uploads.slice(0, 20).forEach((key) => console.log(`  upload ${key}`));
  if (uploads.length > 20) {
    console.log(`  ... and ${uploads.length - 20} more`);
  }
  if (options.prune) {
    stale.slice(0, 20).forEach((key) => console.log(`  delete ${key}`));
  }
  process.exit(0);
}

const failed = [];
await runPool(uploads, async (key) => {
  for (let attempt = 1; ; attempt++) {
    try {
      await client.send(new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: await readFile(path.join(SOURCE_DIR, key)),
        ContentType: CONTENT_TYPES[path.extname(key)] ?? 'application/octet-stream',
        CacheControl: CACHE_CONTROL,
      }));
      return;
    } catch (error) {
      if (attempt === 3) {
        failed.push(key);
        console.error(`  failed ${key}: ${error.message}`);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
});

if (options.prune && stale.length) {
  for (let i = 0; i < stale.length; i += 1000) {
    await client.send(new DeleteObjectsCommand({
      Bucket: R2_BUCKET,
      Delete: { Objects: stale.slice(i, i + 1000).map((Key) => ({ Key })) },
    }));
  }
  console.log(`Deleted ${stale.length} old files.`);
}

if (failed.length) {
  console.error(`${failed.length} uploads failed; run the command again to retry them.`);
  process.exit(1);
}
console.log('Upload complete. Commit data/assets.json so the site uses the new tiles.');
