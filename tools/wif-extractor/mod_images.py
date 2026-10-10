"""Card images for a compiled mod (WiF) from its Interface textures.

Inputs:
  --rgba       output of tgv2png.js run on the mod's PC/Texture/Assets/2D/Interface
  --ndfbin     compiled mod GFX folder (Unit.ndfbin gives each unit's ButtonTexture)
  --mod-ndf    text GameData of the mod (texture key -> file tables)
  --base-ndf   text GameData of the base game (vanilla key -> descriptor)
  --data       data/<name>.json produced by extract.py
  --site       repository root (images/units, images/weapons, site-meta/divisions)

Unit images whose texture lives in the mod are converted from the mod;
units that reuse a base-game texture get a copy of the existing vanilla image.
"""
import argparse
import json
import os
import re
import shutil
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ndfbin  # noqa: E402

ENTRY = re.compile(
    r"""\(\s*['"](Texture_[A-Za-z0-9_]+)['"]\s*,\s*MAP.*?FileName\s*=\s*"GameData:/Assets/2D/Interface/([^"]+)\.png\"""",
    re.S,
)


def texture_files(path):
    """{texture key: 'Common/UnitsIcons/PACT/2S35'} from a texture bank .ndf."""
    with open(path, encoding="utf-8", errors="replace") as f:
        text = f.read()
    # Split per entry so the non-greedy match cannot run into the next key.
    result = {}
    for chunk in re.split(r"\n\s*(?=\(\s*['\"]Texture_)", text):
        m = ENTRY.search(chunk)
        if m:
            result[m.group(1)] = m.group(2)
    return result


def button_textures_text(path):
    """{descriptor: ButtonTexture} from a text UniteDescriptor.ndf."""
    result = {}
    current = None
    with open(path, encoding="utf-8", errors="replace") as f:
        for line in f:
            m = re.match(r"\s*export\s+(Descriptor_Unit_\w+)\s+is", line) or re.match(
                r"\s*(Descriptor_Unit_\w+)\s+is\s+TEntityDescriptor", line
            )
            if m:
                current = m.group(1)
                continue
            m = re.search(r"ButtonTexture\s*=\s*['\"](\w+)['\"]", line)
            if m and current and current not in result:
                result[current] = m.group(1)
    return result


def button_textures_bin(path):
    units = ndfbin.load(path)
    result = {}
    for name, obj in units.items():
        if not name.startswith("Descriptor_Unit_"):
            continue
        for module in obj.get("ModulesDescriptors", []):
            if hasattr(module, "get") and module.get("ButtonTexture"):
                result[name] = module["ButtonTexture"]
    return result


def load_rgba(base):
    with open(base + ".json") as f:
        meta = json.load(f)
    with open(base + ".rgba", "rb") as f:
        return Image.frombytes("RGBA", (meta["width"], meta["height"]), f.read())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rgba", required=True)
    ap.add_argument("--ndfbin", required=True)
    ap.add_argument("--mod-ndf", required=True)
    ap.add_argument("--base-ndf", required=True)
    ap.add_argument("--data", required=True)
    ap.add_argument("--site", required=True)
    args = ap.parse_args()

    gen = os.path.join(args.mod_ndf, "Generated")
    mod_files = texture_files(os.path.join(gen, "UserInterface/Textures/ButtonTexturesUnites.ndf"))
    emblem_files = texture_files(os.path.join(gen, "UserInterface/Textures/DivisionTextures.ndf"))

    base_gen = os.path.join(args.base_ndf, "Generated")
    vanilla_files = texture_files(os.path.join(base_gen, "UserInterface/Textures/ButtonTexturesUnites.ndf"))
    vanilla_bt = button_textures_text(os.path.join(base_gen, "Gameplay/Gfx/UniteDescriptor.ndf"))
    # base-game texture file -> descriptors that use it
    by_file = {}
    for desc, key in vanilla_bt.items():
        if key in vanilla_files:
            by_file.setdefault(vanilla_files[key], []).append(desc)

    bt = button_textures_bin(os.path.join(args.ndfbin, "Unit.ndfbin"))
    with open(args.data, encoding="utf-8") as f:
        data = json.load(f)

    units_dir = os.path.join(args.site, "images/units")
    stats = {"mod": 0, "vanilla": 0, "kept": 0, "missing": []}
    for unit in data["units"]:
        desc = unit["descriptorName"]
        target = os.path.join(units_dir, desc + ".webp")
        key = bt.get(desc)
        file = mod_files.get(key) or vanilla_files.get(key)
        source = os.path.join(args.rgba, file) if file else None
        if source and os.path.exists(source + ".rgba"):
            load_rgba(source).save(target, "WEBP", quality=70, method=6)
            stats["mod"] += 1
            continue
        donor = next(
            (
                os.path.join(units_dir, d + ".webp")
                for d in by_file.get(file, [])
                if os.path.exists(os.path.join(units_dir, d + ".webp"))
            ),
            None,
        )
        if donor and os.path.abspath(donor) != os.path.abspath(target):
            shutil.copyfile(donor, target)
            stats["vanilla"] += 1
        elif os.path.exists(target):
            stats["kept"] += 1
        else:
            stats["missing"].append(f"{desc} ({key} -> {file})")

    weapons_dir = os.path.join(args.site, "images/weapons")
    panel = os.path.join(args.rgba, "Common/UnitsIcons/Armes/Panel_Info")
    textures = {w.get("imageTexture") for u in data["units"] for w in u.get("weapons", [])}
    weapons = 0
    weapons_missing = []
    for tex in sorted(t for t in textures if t):
        target = os.path.join(weapons_dir, tex + ".png")
        if os.path.exists(os.path.join(panel, tex + ".rgba")):
            load_rgba(os.path.join(panel, tex)).save(target, optimize=True)
            weapons += 1
        elif not os.path.exists(target):
            weapons_missing.append(tex)

    emblems_dir = os.path.join(args.site, "site-meta/divisions")
    # Emblems the mod borrows from the base game: copy the vanilla division's image.
    vanilla_emblems = {}
    vanilla_data = os.path.join(os.path.dirname(args.data), "vanilla.json")
    if os.path.exists(vanilla_data):
        with open(vanilla_data, encoding="utf-8") as f:
            for div in json.load(f)["divisions"]:
                png = os.path.join(emblems_dir, div["descriptor"] + ".png")
                if div.get("emblemTexture") and os.path.exists(png):
                    vanilla_emblems.setdefault(div["emblemTexture"], png)
    emblems = 0
    emblems_missing = []
    for div in data["divisions"]:
        key = div.get("emblemTexture")
        file = emblem_files.get(key)
        target = os.path.join(emblems_dir, div["descriptor"] + ".png")
        if file and os.path.exists(os.path.join(args.rgba, file + ".rgba")):
            load_rgba(os.path.join(args.rgba, file)).save(target, optimize=True)
            emblems += 1
        elif key in vanilla_emblems:
            shutil.copyfile(vanilla_emblems[key], target)
            emblems += 1
        elif not os.path.exists(target):
            emblems_missing.append(f"{div['descriptor']} ({div.get('emblemTexture')} -> {file})")

    print(f"units: {stats['mod']} from the mod, {stats['vanilla']} from vanilla images, "
          f"{stats['kept']} already present, {len(stats['missing'])} missing")
    print(f"weapons: {weapons} from the mod, {len(weapons_missing)} missing")
    print(f"emblems: {emblems} from the mod, {len(emblems_missing)} missing")
    for line in stats["missing"] + weapons_missing + emblems_missing:
        print("  missing:", line)


if __name__ == "__main__":
    main()
