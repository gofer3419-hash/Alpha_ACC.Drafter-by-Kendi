// Wycina ikony jednostek z atlasow gry WARNO i zapisuje je jako PNG.
// Uzycie: node wytnij_ikony.js <folder Data\\PC> <ikony_mapa.json> <folder wyjsciowy>
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const [root, mapFile, outDir] = process.argv.slice(2);
if (typeof zlib.zstdDecompressSync !== 'function') {
  console.log('Ten Node.js jest za stary (brak zstd). Zainstaluj aktualny Node.js LTS z https://nodejs.org/');
  process.exit(1);
}
fs.mkdirSync(outDir, {recursive: true});
// mapa: "Common/UnitsIcons/PACT/2K11_KRUG_DDR" -> [atlas, x, y, w, h]
const map = JSON.parse(fs.readFileSync(mapFile, 'utf8'));

function findDatFiles(dir, list) {
  let entries;
  try {
    entries = fs.readdirSync(dir, {withFileTypes: true});
  } catch (e) {
    return list;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) findDatFiles(p, list);
    else if (e.name.toLowerCase().endsWith('.dat')) list.push(p);
  }
  return list;
}

function readAt(fd, pos, len) {
  const buf = Buffer.alloc(len);
  let done = 0;
  while (done < len) {
    const n = fs.readSync(fd, buf, done, len - done, pos + done);
    if (n === 0) break;
    done += n;
  }
  return buf.subarray(0, done);
}

// Archiwum EDAT v2: naglowek, potem spis tresci jako drzewo prefiksow.
// Wpis katalogu:  [u32 dlugosc wpisu (>0)][u32 odstep do brata][nazwa\0]
// Wpis pliku:     [u32 0][u32 odstep do brata][i64 offset][i64 rozmiar][16 B suma][nazwa\0]
// Odstep do brata 0 = ostatni element w tym katalogu.
function readDictionary(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const h = readAt(fd, 0, 64);
    if (h.length < 41 || h.toString('latin1', 0, 4) !== 'edat') {
      return {error: 'to nie jest archiwum EDAT'};
    }
    const version = h.readUInt32LE(4);
    if (version !== 2) return {error: `nieobslugiwana wersja ${version}`};
    const dictOffset = h.readUInt32LE(25);
    const dictLength = h.readUInt32LE(29);
    const fileOffset = h.readUInt32LE(33);
    const dict = readAt(fd, dictOffset, dictLength);
    const files = [];
    const cstr = (at) => {
      const end = dict.indexOf(0, at);
      return dict.toString('latin1', at, end < 0 ? dict.length : end);
    };
    // stos: [pozycja, prefiks]
    const stack = [[0, '']];
    let guard = 0;
    while (stack.length) {
      let [p, prefix] = stack.pop();
      for (;;) {
        if (p + 8 > dict.length || ++guard > 5e6) return {error: 'uszkodzony spis', files};
        const a = dict.readUInt32LE(p);
        const b = dict.readUInt32LE(p + 4);
        if (a === 0) {
          if (p + 40 > dict.length) return {error: 'uszkodzony spis', files};
          const offset = Number(dict.readBigInt64LE(p + 8));
          const size = Number(dict.readBigInt64LE(p + 16));
          files.push({path: prefix + cstr(p + 40), offset: fileOffset + offset, size});
        } else {
          stack.push([p + a, prefix + cstr(p + 8)]);
        }
        if (b === 0) break;
        p += b;
      }
    }
    return {files};
  } finally {
    fs.closeSync(fd);
  }
}


function patchKey(p) {
  return path.relative(root, p).split(path.sep).filter((x) => /^\d+$/.test(x))
    .map((x) => x.padStart(10, '0')).join('/');
}

// --- PNG ---
const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(rgba, w, h) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, {level: 9})), chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- TGV (A8B8G8R8, zstd) ---
function decodeTgv(buf) {
  const width = buf.readUInt32LE(8);
  const height = buf.readUInt32LE(12);
  const mips = buf.readUInt16LE(24);
  const offset = buf.readUInt32LE(56 + 4 * (mips - 1));
  const size = buf.readUInt32LE(56 + 4 * mips + 4 * (mips - 1));
  let pixels = buf.subarray(offset, offset + size);
  if (pixels.toString('latin1', 0, 4) === 'ZSTD') pixels = zlib.zstdDecompressSync(pixels.subarray(8));
  if (pixels.length !== width * height * 4) throw new Error(`nieoczekiwany rozmiar ${pixels.length}`);
  return {width, height, pixels};
}

// Najnowsze wersje potrzebnych atlasow
const atlases = new Set(Object.values(map).map((v) => v[0].toLowerCase()));
const latest = new Map();
const dats = findDatFiles(root, []).sort((a, b) => patchKey(a).localeCompare(patchKey(b)) || a.localeCompare(b));
console.log(`Przegladam ${dats.length} plikow .dat...`);
for (const dat of dats) {
  let r;
  try { r = readDictionary(dat); } catch (e) { continue; }
  if (!r.files) continue;
  for (const f of r.files) {
    const k = f.path.replace(/\\/g, '/').toLowerCase();
    if (atlases.has(k)) latest.set(k, {dat, offset: f.offset, size: f.size});
  }
}
console.log(`Znalezione atlasy: ${latest.size} z ${atlases.size}`);

const byAtlas = new Map();
for (const [name, [atlas, x, y, w, h]] of Object.entries(map)) {
  const k = atlas.toLowerCase();
  if (!byAtlas.has(k)) byAtlas.set(k, []);
  byAtlas.get(k).push({name, x, y, w, h});
}
let written = 0;
for (const [k, icons] of byAtlas) {
  const src = latest.get(k);
  if (!src) { console.log(`BRAK atlasu ${k}`); continue; }
  const fd = fs.openSync(src.dat, 'r');
  const buf = readAt(fd, src.offset, src.size);
  fs.closeSync(fd);
  const tex = decodeTgv(buf);
  for (const ic of icons) {
    const crop = Buffer.alloc(ic.w * ic.h * 4);
    for (let row = 0; row < ic.h; row++) {
      const s = ((ic.y + row) * tex.width + ic.x) * 4;
      tex.pixels.copy(crop, row * ic.w * 4, s, s + ic.w * 4);
    }
    const target = path.join(outDir, ...ic.name.split('/')) + '.png';
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.writeFileSync(target, png(crop, ic.w, ic.h));
    written++;
  }
  console.log(`${path.basename(k)}: ${icons.length} ikon`);
}
console.log(`Zapisano ikon: ${written}`);
