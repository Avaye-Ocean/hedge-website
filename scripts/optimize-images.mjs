// Shrink raster images in place (JPEG/PNG/WebP): resize to a max edge + re-encode.
// Idempotent, never writes a larger file. Flags: --check (report), --dry-run.

// Run: `node scripts/optimize-images.mjs [roots...]` from the repo root.
// sharp ships with Next.js; for a non-Next repo: `yarn add -D sharp`.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

// Longest edge kept (fit:inside caps both dimensions). 1920 covers a desktop hero.
const MAX_EDGE = 1920;

const JPEG_QUALITY = 80;
const PNG_QUALITY = 80;
const WEBP_QUALITY = 80;

// `--check` flags files heavier than this — a multi-MB-original guard, not a KB rule.
const CHECK_LIMIT_BYTES = 500 * 1024;

// Keep a re-encode only if it resized OR saved at least this fraction. Makes the
// pass idempotent (an already-q80 file re-encodes to ~same size and is skipped).
const MIN_SAVING = 0.1;

// Roots scanned when none are passed; only existing ones are used.
const DEFAULT_ROOTS = ['public', 'assets', 'static', 'src/assets'];

// Never walked: android/ios hold native icons/mipmaps with REQUIRED sizes,
// the rest are deps/build output that must not be rewritten.
const EXCLUDE_DIRS = new Set([
  'node_modules', '.git', '.next', '.expo', 'build', 'dist', 'out',
  'coverage', 'android', 'ios', '.turbo', '.cache',
]);

// Launcher/splash/favicon assets have REQUIRED dimensions + must stay crisp —
// never resize or re-encode these (matched by basename, case-insensitive).
const EXCLUDE_FILES = new Set([
  'icon.png', 'adaptive-icon.png', 'splash.png', 'splashscreen.png',
  'favicon.png', 'favicon.ico', 'apple-touch-icon.png',
  'notification-icon.png', 'notification_icon.png',
]);

const args = process.argv.slice(2);
const CHECK = args.includes('--check');
const DRY_RUN = args.includes('--dry-run');
const rootArgs = args.filter((a) => !a.startsWith('--'));

async function loadSharp() {
  try {
    return (await import('sharp')).default;
  } catch {
    console.error('sharp is not installed. It ships with Next.js; else: yarn add -D sharp');
    process.exit(1);
  }
}

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;

function collect(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry.name)) continue;
      collect(path.join(dir, entry.name), out);
    } else if (
      /\.(jpe?g|png|webp)$/i.test(entry.name) &&
      !EXCLUDE_FILES.has(entry.name.toLowerCase())
    ) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

// Takes bytes not path (keeps no open handle). `.rotate()` bakes EXIF orientation
// so a resize never leaves a phone photo sideways.
async function encode(file, input, sharp) {
  const ext = path.extname(file).toLowerCase();
  const pipeline = sharp(input)
    .rotate()
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true });
  if (ext === '.png') return pipeline.png({ quality: PNG_QUALITY, compressionLevel: 9 }).toBuffer();
  if (ext === '.webp') return pipeline.webp({ quality: WEBP_QUALITY }).toBuffer();
  return pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toBuffer();
}

const roots = rootArgs.length ? rootArgs : DEFAULT_ROOTS.filter((r) => fs.existsSync(r));
const files = roots.flatMap((r) => collect(r));

if (files.length === 0) {
  console.error(`No images found under ${roots.join(', ') || '(none)'} — run from the repo root.`);
  process.exit(1);
}

const sharp = CHECK ? null : await loadSharp();

let before = 0;
let after = 0;
let changed = 0;
const oversized = [];

for (const file of files) {
  const size = fs.statSync(file).size;
  before += size;

  if (CHECK) {
    after += size;
    if (size > CHECK_LIMIT_BYTES) oversized.push([file, size]);
    continue;
  }

  const input = fs.readFileSync(file);
  const current = await sharp(input).metadata();
  const buffer = await encode(file, input, sharp);
  const resized = current.width > MAX_EDGE || current.height > MAX_EDGE;

  // Skip unless it resized or saved ≥ MIN_SAVING — never grows a file, and
  // leaves already-optimized ones untouched so re-runs are lossless.
  if (buffer.length >= size || (!resized && buffer.length > size * (1 - MIN_SAVING))) {
    after += size;
    continue;
  }

  console.log(
    `${kb(size).padStart(8)} -> ${kb(buffer.length).padEnd(8)} ` +
      `${String(current.width)}x${String(current.height)}  ${file}`
  );

  if (!DRY_RUN) fs.writeFileSync(file, buffer);
  after += buffer.length;
  changed += 1;
}

console.log('');

if (CHECK) {
  console.log(`${files.length} files, ${(before / 1048576).toFixed(1)} MB total`);
  if (oversized.length > 0) {
    console.log(`\n${oversized.length} file(s) over ${kb(CHECK_LIMIT_BYTES)}:`);
    for (const [file, size] of oversized) console.log(`  ${kb(size).padStart(8)}  ${file}`);
    console.log('\nRun: node scripts/optimize-images.mjs');
    process.exit(1);
  }
  console.log(`✅ nothing over ${kb(CHECK_LIMIT_BYTES)}`);
  process.exit(0);
}

console.log(
  `${changed}/${files.length} rewritten${DRY_RUN ? ' (dry run — nothing written)' : ''}: ` +
    `${(before / 1048576).toFixed(1)} MB -> ${(after / 1048576).toFixed(1)} MB ` +
    `(${(100 - (100 * after) / before).toFixed(1)}% smaller)`
);
