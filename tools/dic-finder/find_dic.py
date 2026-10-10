"""Find Eugen localisation dictionaries (TRAD) inside WARNO .dat archives.

Scans the given .dat files (or every .dat in the given folders) for embedded
.dic dictionaries and saves each one as a CSV file "TOKEN;REFTEXT" that
tools/wif-extractor can read with --strings.

Usage (Windows, from the folder with this script):
    python find_dic.py "C:\\...\\steamapps\\common\\WARNO\\Data\\PC" --out dic_out

Only reads the game files; nothing in the game folder is changed.
"""
import argparse
import csv
import os
import struct
import sys

MAGIC = b"TRAD"
CHUNK = 64 * 1024 * 1024
ALPHABET = " 0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz"
MAX_ENTRIES = 500_000


def token_from_hash(h):
    chars = []
    while h:
        chars.append(ALPHABET[h & 63])
        h >>= 6
    return "".join(reversed(chars)).strip()


def try_read_dic(f, start, file_size):
    """Return (entries, byte size) of a dictionary at `start`, or None."""
    f.seek(start)
    head = f.read(8)
    if len(head) < 8 or head[:4] != MAGIC:
        return None
    (count,) = struct.unpack_from("<I", head, 4)
    if count == 0 or count > MAX_ENTRIES:
        return None
    table_size = count * 16
    if start + 8 + table_size > file_size:
        return None
    table = f.read(table_size)
    records = [struct.unpack_from("<QII", table, i * 16) for i in range(count)]
    pool_start = 8 + table_size
    end = pool_start
    for _, offset, length in records:
        # offsets are relative to the start of the dictionary
        if offset < pool_start or length > 100_000:
            return None
        end = max(end, offset + length * 2)
    if start + end > file_size or end > 200 * 1024 * 1024:
        return None
    f.seek(start)
    data = f.read(end)
    entries = []
    for h, offset, length in records:
        text = data[offset:offset + length * 2].decode("utf-16le", "replace")
        entries.append((token_from_hash(h), text))
    return entries, end


def scan_file(path, out_dir, found):
    size = os.path.getsize(path)
    print(f"scanning {path} ({size // (1024 * 1024)} MB)")
    with open(path, "rb") as f:
        pos = 0
        tail = b""
        while pos < size:
            f.seek(pos)
            block = f.read(CHUNK)
            if not block:
                break
            data = tail + block
            base = pos - len(tail)
            i = data.find(MAGIC)
            while i != -1:
                start = base + i
                here = f.tell()
                result = try_read_dic(f, start, size)
                f.seek(here)
                if result:
                    entries, length = result
                    save(entries, path, start, out_dir, found)
                i = data.find(MAGIC, i + 1)
            tail = data[-3:]
            pos += len(block)


def save(entries, path, start, out_dir, found):
    texts = [t for _, t in entries if t]
    sample = " | ".join(texts[:3])[:120]
    rel = os.path.basename(os.path.dirname(path)) + "_" + os.path.splitext(os.path.basename(path))[0]
    name = f"{rel}_{start:012x}.csv"
    with open(os.path.join(out_dir, name), "w", encoding="utf-8", newline="") as out:
        w = csv.writer(out, delimiter=";")
        w.writerow(["TOKEN", "REFTEXT"])
        w.writerows(entries)
    found.append((name, len(entries), sample))
    print(f"  found dictionary: {len(entries)} entries -> {name}  [{sample}]")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("paths", nargs="+", help=".dat files or folders to scan")
    ap.add_argument("--out", default="dic_out")
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)

    files = []
    for p in args.paths:
        if os.path.isdir(p):
            for root, _, names in os.walk(p):
                files += [os.path.join(root, n) for n in names if n.lower().startswith("zz_") and n.lower().endswith(".dat")]
        else:
            files.append(p)

    found = []
    for path in sorted(files):
        try:
            scan_file(path, args.out, found)
        except OSError as e:
            print(f"  error: {e}", file=sys.stderr)

    with open(os.path.join(args.out, "summary.txt"), "w", encoding="utf-8") as s:
        for name, n, sample in found:
            s.write(f"{name}\t{n}\t{sample}\n")
    print(f"\n{len(found)} dictionaries found, saved in {args.out}")


if __name__ == "__main__":
    main()
