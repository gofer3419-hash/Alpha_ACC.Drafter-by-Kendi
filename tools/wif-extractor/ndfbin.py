"""Reader for compiled WARNO NDF files (.ndfbin, magic EUG0/CNDF).

Produces the same structures as ndf.py (NdfObject, NdfMap, lists, strings),
so extract.py can work on a mod's compiled Gen/NDF/GFX/*.ndfbin output.

Layout: 40-byte header (EUG0, CNDF, sizes), zstd-compressed body, then a
table of contents "TOC0" listing sections OBJE, TOPO, CHNK, CLAS, PROP,
STRG, TRAN, IMPR, EXPR (offset/size relative to the header end - 4).
"""
import struct
import zlib  # noqa: F401  (zstd is done by the caller if needed)

import ndf

END_OF_OBJECT = 0xABABABAB
# 0xAAAAAAAA: reference to an object of another file (index into IMPR)
# 0xBBBBBBBB: reference to an object of this file (instance, class)
REF_IMPORT_KIND = 0xAAAAAAAA
REF_OBJECT_KIND = 0xBBBBBBBB

DIC_ALPHABET = " 0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz"


def decode_token(h):
    chars = []
    while h:
        chars.append(DIC_ALPHABET[h & 63])
        h >>= 6
    return "".join(reversed(chars)).strip()


class NdfBinError(Exception):
    pass


def decompress(data):
    """Return the raw (header + uncompressed body) bytes of an .ndfbin file."""
    if data[:4] != b"EUG0" or data[8:12] != b"CNDF":
        raise NdfBinError("not an ndfbin file")
    zpos = data.find(b"\x28\xb5\x2f\xfd")
    if zpos < 0:
        return data
    try:
        import zstandard  # type: ignore
        body = zstandard.ZstdDecompressor().decompress(data[zpos:], max_output_size=1 << 31)
    except ImportError:
        import subprocess
        body = subprocess.run(
            ["node", "-e", "const z=require('zlib');const c=[];process.stdin.on('data',d=>c.push(d));"
             "process.stdin.on('end',()=>process.stdout.write(z.zstdDecompressSync(Buffer.concat(c))))"],
            input=data[zpos:], capture_output=True, check=True).stdout
    return data[:zpos] + body


class NdfBin:
    def __init__(self, raw):
        self.raw = raw
        toc = raw.rfind(b"TOC0")
        if toc < 0:
            raise NdfBinError("no TOC0")
        (count,) = struct.unpack_from("<I", raw, toc + 4)
        self.sections = {}
        for i in range(count):
            name, _, off, size = struct.unpack_from("<4sIQQ", raw, toc + 8 + i * 24)
            self.sections[name.decode()] = (off + 4, size)
        self.classes = self._strings("CLAS")
        self.strings = self._strings("STRG")
        self.tran = self._strings("TRAN")
        self.props = self._props()
        self.imports = self._tree("IMPR")
        self.exports = self._tree("EXPR")

    def _tree(self, name):
        """IMPR/EXPR: pre-order tree of path parts; leaves carry an index.

        Node: u32 TRAN index, u32 leaf index (0xFFFFFFFF for inner nodes),
        u32 child count, child offsets (unused here); children follow.
        Returns {leaf index: '$/GFX/Unit/Descriptor_...'}.
        """
        off, end = self._section(name)
        out = {}

        def node(pos, path):
            tran, idx, count = struct.unpack_from("<III", self.raw, pos)
            pos += 12 + 4 * count
            full = path + [self.tran[tran]]
            for _ in range(count):
                pos = node(pos, full)
            if idx != 0xFFFFFFFF:
                out[idx] = "/".join(full)
            return pos

        pos = off
        while pos < end:
            pos = node(pos, [])
        return out

    # -- tables ---------------------------------------------------------------
    def _section(self, name):
        off, size = self.sections[name]
        return off, off + size

    def _strings(self, name):
        pos, end = self._section(name)
        out = []
        while pos < end:
            (n,) = struct.unpack_from("<I", self.raw, pos)
            out.append(self.raw[pos + 4:pos + 4 + n].decode("utf-8", "replace"))
            pos += 4 + n
        return out

    def _props(self):
        pos, end = self._section("PROP")
        out = []
        while pos < end:
            (n,) = struct.unpack_from("<I", self.raw, pos)
            name = self.raw[pos + 4:pos + 4 + n].decode("utf-8", "replace")
            (cls,) = struct.unpack_from("<I", self.raw, pos + 4 + n)
            out.append((name, cls))
            pos += 8 + n
        return out


class Reader:
    """Sequential reader over the OBJE section."""

    def __init__(self, nb):
        self.nb = nb
        self.raw = nb.raw
        self.pos, self.end = nb._section("OBJE")

    def u32(self):
        (v,) = struct.unpack_from("<I", self.raw, self.pos)
        self.pos += 4
        return v

    def take(self, fmt):
        v = struct.unpack_from(fmt, self.raw, self.pos)
        self.pos += struct.calcsize(fmt)
        return v

    def value(self):
        t = self.u32()
        return self.typed(t)

    def typed(self, t):
        nb = self.nb
        if t == 0x00:
            (v,) = self.take("<B"); return bool(v)
        if t == 0x01:
            (v,) = self.take("<b"); return v
        if t == 0x02:
            (v,) = self.take("<i"); return v
        if t == 0x03:
            (v,) = self.take("<I"); return v
        if t == 0x05:
            (v,) = self.take("<f"); return v
        if t == 0x06:
            (v,) = self.take("<d"); return v
        if t in (0x07, 0x1C):  # table string
            (i,) = self.take("<I"); return nb.strings[i]
        if t == 0x08:  # wide string
            (n,) = self.take("<I")
            s = self.raw[self.pos:self.pos + n].decode("utf-16le", "replace"); self.pos += n
            return s
        if t == 0x09:  # reference
            kind = self.u32()
            if kind == REF_IMPORT_KIND:
                (i,) = self.take("<I")
                return ("imp", i)
            if kind == REF_OBJECT_KIND:
                inst, _cls = self.take("<II")
                return ("obj", inst)
            raise NdfBinError(f"bad reference kind {kind:#x} at {self.pos}")
        if t == 0x0B:
            return self.take("<fff")
        if t == 0x0C:
            return self.take("<BBBB")
        if t == 0x0D:  # float RGBA colour
            return self.take("<ffff")
        if t == 0x11:  # list
            (n,) = self.take("<I")
            return [self.value() for _ in range(n)]
        if t == 0x12:  # map list
            (n,) = self.take("<I")
            m = ndf.NdfMap()
            for _ in range(n):
                k = self.value(); v = self.value(); m.append((k, v))
            return m
        if t == 0x13:
            (v,) = self.take("<q"); return v
        if t == 0x14:  # blob
            (n,) = self.take("<I"); b = self.raw[self.pos:self.pos + n]; self.pos += n; return b
        if t == 0x18:
            (v,) = self.take("<h"); return v
        if t == 0x19:
            (v,) = self.take("<H"); return v
        if t == 0x1A:  # GUID
            b = self.raw[self.pos:self.pos + 16]; self.pos += 16
            return "GUID:{" + b.hex() + "}"
        if t == 0x1D:  # localisation token
            (v,) = self.take("<Q"); return decode_token(v)
        if t == 0x1F:
            b = self.raw[self.pos:self.pos + 16]; self.pos += 16; return b.hex()
        if t == 0x21:  # 2D float vector
            return self.take("<ff")
        if t == 0x22:  # pair
            a = self.value(); b = self.value(); return (a, b)
        if t == 0x25:  # hash
            b = self.raw[self.pos:self.pos + 16]; self.pos += 16; return b.hex()
        raise NdfBinError(f"unknown type {t:#x} at {self.pos - 4}")


def read_objects(nb):
    """Parse every object of the file: list of (class name, {prop: value})."""
    r = Reader(nb)
    objects = []
    while r.pos < r.end:
        cls = r.u32()
        props = {}
        while True:
            p = r.u32()
            if p == END_OF_OBJECT:
                break
            props[nb.props[p][0]] = r.value()
        objects.append((nb.classes[cls], props))
    return objects


# Enum values stored as integers in .ndfbin (learned by aligning the same
# objects in text and compiled form; game-wide numbering).
FACTORY = {2: "Factory/Logistic", 3: "Factory/Infantry", 4: "Factory/Planes",
           6: "Factory/Tanks", 7: "Factory/Recons", 8: "Factory/Helis",
           12: "Factory/DCA", 13: "Factory/Art", 15: "Factory/Defense"}
OPTICAL_STRENGTH = {0: "EOpticalStrength/Standard", 1: "EOpticalStrength/LowAltitude",
                    2: "EOpticalStrength/AntiRadar", 3: "EOpticalStrength/HighAltitude"}
VISION_RANGE = {0: "EVisionRange/Standard", 1: "EVisionRange/LowAltitude",
                2: "EVisionRange/HighAltitude"}
COALITION = {0: "TWargameCoalition/NATO", 1: "TWargameCoalition/PACT"}
UNIT_MOVING_TYPE = {1: "EUnitMovingType/Infantry", 2: "EUnitMovingType/Wheel",
                    3: "EUnitMovingType/Track", 5: "EUnitMovingType/WheelAmphibious",
                    6: "EUnitMovingType/TrackAmphibious"}


def load_family_lists(base_weapon_path):
    """Resistance and damage family names from BaseWeapon.ndfbin (mod specific)."""
    nb = NdfBin(decompress(open(base_weapon_path, "rb").read()))
    lists = {cls: props.get("Values", []) for cls, props in read_objects(nb)}
    return lists.get("TResistanceFamilyList", []), lists.get("TDamageFamilyList", [])


def _name_enums(objects, families):
    resist, damage = families

    def remap_keys(m, table):
        return ndf.NdfMap((table.get(k, k) if isinstance(k, int) else k, v) for k, v in m)

    for obj in objects:
        t = obj.type
        fam = obj.get("Family")
        if isinstance(fam, int):
            if t == "TResistanceTypeRTTI" and fam < len(resist):
                obj["Family"] = resist[fam]
            elif t == "TDamageTypeRTTI" and fam < len(damage):
                obj["Family"] = damage[fam]
        if isinstance(obj.get("FactoryType"), int):
            obj["FactoryType"] = FACTORY.get(obj["FactoryType"], obj["FactoryType"])
        if isinstance(obj.get("CostMatrix"), ndf.NdfMap):
            obj["CostMatrix"] = remap_keys(obj["CostMatrix"], FACTORY)
        if isinstance(obj.get("OpticalStrengths"), ndf.NdfMap):
            obj["OpticalStrengths"] = remap_keys(obj["OpticalStrengths"], OPTICAL_STRENGTH)
        if isinstance(obj.get("VisionRangesGRU"), ndf.NdfMap):
            obj["VisionRangesGRU"] = remap_keys(obj["VisionRangesGRU"], VISION_RANGE)
        if isinstance(obj.get("DivisionCoalition"), int):
            obj["DivisionCoalition"] = COALITION.get(obj["DivisionCoalition"])
        if isinstance(obj.get("UnitMovingType"), int):
            obj["UnitMovingType"] = UNIT_MOVING_TYPE.get(obj["UnitMovingType"])


def load(path, families=None):
    """Load an .ndfbin file as {export name: NdfObject} like ndf.parse_file().

    Object references are resolved to the referenced NdfObject (inline
    modules, rules), references to other files become '$/GFX/...' strings.
    """
    with open(path, "rb") as f:
        nb = NdfBin(decompress(f.read()))
    raw_objects = read_objects(nb)
    built = [ndf.NdfObject(cls) for cls, _ in raw_objects]
    names = {idx: p for idx, p in nb.exports.items()}

    def convert(v):
        if isinstance(v, tuple) and len(v) == 2 and v[0] in ("obj", "imp"):
            if v[0] == "obj":
                return built[v[1]]
            return nb.imports.get(v[1], f"<import {v[1]}>")
        if isinstance(v, ndf.NdfMap):
            return ndf.NdfMap((convert(k), convert(x)) for k, x in v)
        if isinstance(v, list):
            return [convert(x) for x in v]
        if isinstance(v, tuple):
            return tuple(convert(x) for x in v)
        return v

    for obj, (_, props) in zip(built, raw_objects):
        for k, v in props.items():
            obj[k] = convert(v)
    if families:
        _name_enums(built, families)

    out = {}
    for idx, path in names.items():
        name = path.split("/")[-1]
        obj = built[idx]
        obj.name = name
        out[name] = obj
    # unnamed top level objects (e.g. the deck serializer)
    for i, obj in enumerate(built):
        if obj.name is None and obj.type == "TDeckSerializerEntries":
            out[f"__unnamed__{i}"] = obj
    # unnamed ammunition objects get a stable name for weapon ids
    for obj in built:
        if obj.name is None and obj.type == "TAmmunitionDescriptor":
            guid = str(obj.get("DescriptorId", ""))
            obj.name = "Ammo_" + guid.replace("GUID:{", "").replace("}", "")[:12]
    return out
