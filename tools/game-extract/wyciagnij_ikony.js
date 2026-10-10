// Wyciaga z archiwow .dat gry WARNO ikony jednostek, broni, emblematy dywizji,
// atlasy ikon z ich opisami oraz slowniki z nazwami (.dic).
// Uzycie: node wyciagnij_ikony.js <folder gry> <folder wyjsciowy>
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const root = process.argv[2];
const outDir = process.argv[3];
fs.mkdirSync(outDir, {recursive: true});
const logLines = [];
function log(msg) {
  console.log(msg);
  logLines.push(msg);
}

// Tylko male pliki: wielkie atlasy ikon tnie osobny skrypt u Ciebie.
const MAX_SIZE = 4 * 1024 * 1024;
// Co zapisujemy (sciezki w archiwach uzywaja / albo \)
function wanted(p) {
  const s = p.toLowerCase().replace(/\\/g, '/');
  if (/-us\.dic$/.test(s) || s.includes('/us/localisation/core/')) return true;
  if (s.includes('2d/interface/') && /(unitsicons|division\/emblem|\/flags\/)/.test(s)) return true;
  if (/\/atlas\/(uniticons-|flags)/.test(s) && s.endsWith('.atlas')) return true;
  return false;
}

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

const datFiles = findDatFiles(root, []);
// Latki leza w kolejnych folderach o rosnacych numerach (i w podfolderach),
// wiec sortujemy tak, zeby nowsze byly pozniej i nadpisywaly starsze.
function patchKey(p) {
  return path
    .relative(root, p)
    .split(path.sep)
    .filter((x) => /^\d+$/.test(x))
    .map((x) => x.padStart(10, '0'))
    .join('/');
}
datFiles.sort((a, b) => patchKey(a).localeCompare(patchKey(b)) || a.localeCompare(b));
log(`Folder: ${root}`);
log(`Plikow .dat: ${datFiles.length}`);

const found = new Map();
const index = [];
let skipped = 0;
for (const dat of datFiles) {
  let result;
  try {
    result = readDictionary(dat);
  } catch (e) {
    log(`BLAD ${dat}: ${e.message}`);
    continue;
  }
  if (result.error) {
    skipped++;
    if (/wersja/.test(result.error) || (!/EDAT/.test(result.error) && fs.statSync(dat).size > 8192)) {
      log(`POMIJAM ${dat}: ${result.error}`);
    }
    if (!result.files) continue;
  }
  let hits = 0;
  const rel = path.relative(root, dat);
  for (const f of result.files) {
    const s = f.path.toLowerCase();
    if (/\.(dic|tgv)$/.test(s) || s.includes('atlas') || s.includes('unitsicons')) {
      index.push(`${rel}\t${f.size}\t${f.path}`);
    }
    if (f.size > 0 && f.size <= MAX_SIZE && wanted(f.path)) {
      found.set(s.replace(/\\/g, '/'), {name: f.path, dat, offset: f.offset, size: f.size});
      hits++;
    }
  }
  if (hits) log(`${rel}: ${hits} plikow do zapisu`);
}
log(`Pominietych archiwow (inna wersja / puste): ${skipped}`);

let written = 0;
let bytes = 0;
for (const item of found.values()) {
  const rel = item.name.replace(/\\/g, '/').replace(/^\/+/, '');
  const target = path.join(outDir, ...rel.split('/'));
  fs.mkdirSync(path.dirname(target), {recursive: true});
  const fd = fs.openSync(item.dat, 'r');
  try {
    fs.writeFileSync(target, readAt(fd, item.offset, item.size));
    written++;
    bytes += item.size;
  } finally {
    fs.closeSync(fd);
  }
}
log(`Zapisano plikow: ${written} (${(bytes / 1048576).toFixed(1)} MB)`);
fs.writeFileSync(path.join(outDir, '_log.txt'), logLines.join('\r\n'));
fs.writeFileSync(path.join(outDir, '_spis.txt.gz'), zlib.gzipSync(index.join('\n')));
