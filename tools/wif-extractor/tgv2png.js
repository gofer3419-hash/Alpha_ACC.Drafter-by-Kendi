// Convert WARNO .tgv textures (version 3, A8B8G8R8, zstd) to raw RGBA files.
// Usage: node tgv2png.js <input dir> <output dir>
// Writes <name>.rgba next to <name>.json ({width, height}) keeping the folder
// layout; tgv_to_webp.py turns them into WebP.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const [src, dst] = process.argv.slice(2);
let count = 0;

function walk(dir) {
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (entry.name.toLowerCase().endsWith('.tgv')) convert(p);
  }
}

function convert(file) {
  const b = fs.readFileSync(file);
  const width = b.readUInt32LE(8);
  const height = b.readUInt32LE(12);
  const fmtLen = b.readUInt16LE(26);
  const format = b.toString('latin1', 28, 28 + fmtLen);
  if (format !== 'A8B8G8R8_LIN' && format !== 'A8B8G8R8_SRGB') {
    console.error(`skip ${file}: format ${format}`);
    return;
  }
  // Mip table at 56: all offsets, then all sizes; smallest mip first, so the
  // full-size image is the last entry.
  const mips = b.readUInt16LE(24);
  const offset = b.readUInt32LE(56 + 4 * (mips - 1));
  const size = b.readUInt32LE(56 + 4 * mips + 4 * (mips - 1));
  let pixels = b.subarray(offset, offset + size);
  if (pixels.toString('latin1', 0, 4) === 'ZSTD') {
    pixels = zlib.zstdDecompressSync(pixels.subarray(8));
  }
  if (pixels.length !== width * height * 4) {
    console.error(`skip ${file}: ${pixels.length} bytes for ${width}x${height}`);
    return;
  }
  const rel = path.relative(src, file).replace(/\.tgv$/i, '');
  const out = path.join(dst, rel);
  fs.mkdirSync(path.dirname(out), {recursive: true});
  fs.writeFileSync(out + '.rgba', pixels);
  fs.writeFileSync(out + '.json', JSON.stringify({width, height}));
  count++;
}

walk(src);
console.log(`converted ${count} textures`);
