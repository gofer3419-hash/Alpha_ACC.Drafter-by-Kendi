"""Generate WarYes-compatible game data (units + divisions JSON) from WARNO NDF sources.

Usage:
  # A World in Flames (default selection: WiF multiplayer divisions)
  python3 extract.py --gamedata <mod GameData> --strings <HarvestedStrings.csv> \
                     --out data --name wif

  # Base game
  python3 extract.py --gamedata <WARNO/Mods/ModData/base/GameData> \
                     --strings <GameData/Localisation/.../UNITS.csv> \
                     --out data --name vanilla --preset vanilla
"""
import argparse
import csv
import json
import os
import re
import sys

import ndf

GFX_UNIT_PREFIX = "$/GFX/Unit/"

# Which divisions to export: a regex on the division descriptor, and only
# divisions tagged "DEFAULT" (playable in multiplayer; campaign and challenge
# divisions use other tags). Note: not every multiplayer division ends in
# "_multi" (e.g. Descriptor_Deck_Division_RDA_Rugen_Gruppierung).
PRESETS = {
    # A World in Flames multiplayer divisions
    "wif": r"^Descriptor_Deck_Division_WF_",
    # Base game divisions (skip mod divisions if present)
    "vanilla": r"^Descriptor_Deck_Division_(?!WF_|YSM_)",
}
MULTIPLAYER_TAG = "DEFAULT"

# WarYes UnitCategory enum values use "EFactory/..."; WiF uses "Factory/..."
def factory_to_waryes(f):
    if not f:
        return None
    name = str(f).split("/")[-1]
    return f"EFactory/{name}"

FACTORY_TO_CATEGORY = {
    "Logistic": "log", "Infantry": "inf", "Art": "art", "Tanks": "tnk",
    "Recons": "rec", "DCA": "aa", "Helis": "hel", "Planes": "air", "Defense": "def",
}

INFO_PANEL = {
    "Default": "default",
    "Infantry": "infantry",
    "VehiculeTransporter": "transport-vehicle",
    "VehiculeSupplier": "supply-vehicle",
    "avion": "plane",
    "uav": "plane",
    "HelicoDefault": "helicopter",
    "HelicoTransporter": "transport-helicopter",
    "HelicoSupplier": "supply-helicopter",
    "dca": "default",
    "dca_inf": "infantry",
    "FOB": "supply-vehicle",
}

NATO_COUNTRIES = {"US", "UK", "FR", "RFA", "BEL", "NL", "LUX", "CAN", "ESP", "DK", "NATO"}

# WarYes optics thresholds (42.45 Bad ... 84.9 Normal) correspond to NDF
# OpticalStrength 1590 / 3180; derive the factor from that pair.
OPTICS_FACTOR = 3180.0 / 84.9


def short(ref):
    return str(ref).split("/")[-1] if ref is not None else None


def r2(x, nd=2):
    if isinstance(x, (int, float)) and not isinstance(x, bool):
        v = round(float(x), nd)
        return int(v) if v.is_integer() else v
    return x


def humanize_descriptor(desc):
    s = re.sub(r"^Descriptor_Unit_", "", desc)
    s = re.sub(r"^WF_", "", s)
    s = re.sub(r"_(US|UK|FR|RFA|GER|BEL|SOV|RUS|DDR|POL|TCH|NL|CAN|ESP|LUX|DK)$", "", s)
    return s.replace("_", " ").strip()


# Localisation token alphabet used by Eugen .dic files (6 bits per character)
DIC_TOKEN_ALPHABET = " 0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz"


def dic_hash_to_token(h):
    chars = []
    while h:
        chars.append(DIC_TOKEN_ALPHABET[h & 63])
        h >>= 6
    return "".join(reversed(chars)).strip()


def load_dic(path):
    """Read an Eugen localisation dictionary (.dic, magic 'TRAD').

    Layout: 'TRAD', u32 count, then count records of
    (u64 token, u32 byte offset of the text, u32 length in UTF-16 chars),
    followed by the UTF-16LE texts. The token is the localisation key
    (e.g. 'WFM2BCMD') packed 6 bits per character.
    """
    import struct
    with open(path, "rb") as f:
        data = f.read()
    if data[:4] != b"TRAD":
        raise ValueError(f"{path}: not a TRAD dictionary")
    (count,) = struct.unpack_from("<I", data, 4)
    names = {}
    for i in range(count):
        token, offset, length = struct.unpack_from("<QII", data, 8 + i * 16)
        text = data[offset:offset + length * 2].decode("utf-16le", "replace")
        if text:
            names[dic_hash_to_token(token)] = text
    return names


def load_strings(paths):
    """Read localisation CSV files (';' separated).

    Two layouts are supported:
      HarvestedStrings.csv:  "DICO";"TOKEN";"REFTEXT";...
      UNITS.csv and friends: "TOKEN";"REFTEXT"
    and Eugen binary dictionaries (*.dic, e.g. UNITS-US.dic).
    """
    names = {}
    for path in paths or []:
        if not os.path.exists(path):
            print(f"strings file not found: {path}", file=sys.stderr)
            continue
        if path.lower().endswith(".dic"):
            for token, text in load_dic(path).items():
                names.setdefault(token, text)
            continue
        with open(path, encoding="utf-8-sig", errors="replace") as f:
            rows = list(csv.reader(f, delimiter=";"))
        if not rows:
            continue
        header = [c.strip().upper() for c in rows[0]]
        token_col = header.index("TOKEN") if "TOKEN" in header else 1
        text_col = header.index("REFTEXT") if "REFTEXT" in header else token_col + 1
        for row in rows[1:]:
            if len(row) > max(token_col, text_col) and row[text_col]:
                names.setdefault(row[token_col], row[text_col])
    return names


def modules_by_type(unit):
    out = {}
    refs = []
    for m in unit.get("ModulesDescriptors", []):
        if isinstance(m, ndf.NdfObject):
            out.setdefault(m.type, m)
        else:
            refs.append(str(m))
    return out, refs


def armor_value(res):
    if not isinstance(res, ndf.NdfObject):
        return 0, "unknown"
    fam = short(res.get("Family", "")) or ""
    fam = fam.replace("ResistanceFamily_", "")
    idx = res.get("Index", 0) or 0
    if fam.startswith("blindage"):
        return idx, fam
    # Non-armoured families (infantry, light vehicles, aircraft...) show as <1
    return 0.5 if fam in ("vehicule_leger",) else 0, fam


# --------------------------------------------------------------------------
# Weapons

def effect_tag_name(tag):
    """'FireEffect_AutoCanon_AP_25mm_M242_Bushmaster_Late' -> 'AutoCanon AP 25mm M242 Bushmaster Late'"""
    if not tag:
        return None
    t = re.sub(r"^FireEffect_", "", str(tag))
    return t.replace("_", " ").strip() or None


def hit_modifiers(ammo):
    rule = ammo.get("HitRollRuleDescriptor")
    mods = {}
    if isinstance(rule, ndf.NdfObject):
        for k, v in rule.get("BaseHitValueModifiers") or []:
            mods[short(k)] = v
    return mods


def build_weapon(ammo_name, ammo, mounted, has_turret, turret_speed, salvo_index, salvos, names):
    arme = ammo.get("Arme") or {}
    fam = short(arme.get("Family")) if isinstance(arme, dict) else None
    fam = (fam or "").replace("DamageFamily_", "")
    idx = arme.get("Index", 0) if isinstance(arme, dict) else 0
    # Arme without a Family is the default kinetic AP family in WARNO
    penetration = idx if fam.startswith("ap") or (not fam and idx) else 0
    mods = hit_modifiers(ammo)
    shots = ammo.get("ShotsCountPerSalvo", 1) or 1
    between_shots = ammo.get("TimeBetweenTwoShots", 0) or 0
    between_salvos = ammo.get("TimeBetweenTwoSalvos", 0) or 0
    salvo_len = shots
    salvo_time = between_shots * max(salvo_len - 1, 0) + between_salvos
    rof = round(60.0 * salvo_len / salvo_time) if salvo_time > 0 else 0
    traits = list(ammo.get("TraitsToken") or [])
    name_token = ammo.get("Name")
    weapon_name = names.get(name_token) or (name_token if name_token and not re.fullmatch(r"[A-Z]{10}", name_token) else None) \
        or effect_tag_name(mounted.get("EffectTag")) or ammo_name.replace("Decooked_AmmunitionDescriptor_", "Weapon ")
    nb_salvos = salvos[salvo_index] if salvo_index is not None and salvo_index < len(salvos) else 1
    he = ammo.get("PhysicalDamages", 0) or 0
    return {
        "showInInterface": True,
        "fireLeftToRight": False,
        "numberOfWeapons": mounted.get("NbWeapons", 1) or 1,
        "hasTurret": has_turret,
        "turretRotationSpeed": r2((turret_speed or 0) * 57.2958, 0),
        "traits": traits,
        "ammoDescriptorName": ammo_name,
        "weaponName": weapon_name,
        "he": r2(he),
        "heDamageRadius": r2(ammo.get("RadiusSplashPhysicalDamagesGRU", 0) or 0),
        "suppress": r2(ammo.get("SuppressDamages", 0) or 0),
        "suppressDamagesRadius": r2(ammo.get("RadiusSplashSuppressDamagesGRU", 0) or 0),
        "suppressDamages": [],
        "groundRange": r2(ammo.get("MaximumRangeGRU", 0) or 0, 0),
        "groundMinRange": r2(ammo.get("MinimumRangeGRU", 0) or 0, 0),
        "helicopterRange": r2(ammo.get("MaximumRangeHelicopterGRU", 0) or 0, 0),
        "helicopterMinRange": r2(ammo.get("MinimumRangeHelicopterGRU", 0) or 0, 0),
        "planeRange": r2(ammo.get("MaximumRangeAirplaneGRU", 0) or 0, 0),
        "planeMinRange": r2(ammo.get("MinimumRangeAirplaneGRU", 0) or 0, 0),
        "aimingTime": r2(ammo.get("AimingTime", 0) or 0),
        "reloadTime": r2(between_salvos),
        "salvoLength": salvo_len,
        "totalHeDamage": r2(he * salvo_len),
        "timeBetweenSalvos": r2(between_shots),
        "ammunitionPerSalvo": ammo.get("AffichageMunitionParSalve", salvo_len) or salvo_len,
        "rateOfFire": rof,
        "salvoIndex": salvo_index if salvo_index is not None else 0,
        "supplyCost": r2((ammo.get("SupplyCost", 0) or 0) * salvo_len),
        "staticAccuracy": r2(mods.get("Idling", 0)),
        "movingAccuracy": r2(mods.get("Moving", 0)),
        "penetration": penetration,
        "instaKillAtMaxRangeArmour": 0,
        "trueRateOfFire": rof,
        "numberOfSalvos": nb_salvos,
        "imageTexture": (short(ammo.get("InterfaceWeaponTexture")) or "").replace("Texture_Interface_Weapon_", ""),
        "mod": "warno",
        "dispersionAtMaxRange": r2(ammo.get("DispersionAtMaxRangeGRU", 0) or 0),
        "dispersionAtMinRange": r2(ammo.get("DispersionAtMinRangeGRU", 0) or 0),
        "noiseMalus": r2(ammo.get("NoiseDissimulationMalus", 0) or 0),
        "shotsBeforeMaxNoise": ammo.get("ShotsBeforeMaxNoise", 0) or 0,
        "maxSuccessiveHitCount": ammo.get("MaxSuccessiveHitCount", 0) or 0,
        "damageFamilies": [fam] if fam else [],
        "piercingWeapon": bool(ammo.get("PiercingWeapon", False)),
        "damageDropOffTokens": [short(ammo["DamageTypeEvolutionOverRangeDescriptor"])] if ammo.get("DamageTypeEvolutionOverRangeDescriptor") else [],
        "tandemCharges": [fam.endswith("tandem")],
        "numberOfSimultaneousProjectiles": [ammo.get("SimultaneousShotsCount", 1) or 1],
    }


def build_weapons(weapon_desc, ammo_db, names):
    if not isinstance(weapon_desc, ndf.NdfObject):
        return []
    salvos = list(weapon_desc.get("Salves") or [])
    weapons = []
    seen = set()
    for turret in weapon_desc.get("TurretDescriptorList") or []:
        if not isinstance(turret, ndf.NdfObject):
            continue
        has_turret = turret.type != "TTurretUnitDescriptor"
        speed = turret.get("VitesseRotation", 0)
        for mounted in turret.get("MountedWeaponDescriptorList") or []:
            if not isinstance(mounted, ndf.NdfObject):
                continue
            ammo_value = mounted.get("Ammunition")
            if isinstance(ammo_value, ndf.NdfObject):
                ammo = ammo_value
                ammo_ref = ammo_value.name or "Ammo"
            else:
                ammo_ref = short(ammo_value)
                ammo = ammo_db.get(ammo_ref)
            if not isinstance(ammo, ndf.NdfObject):
                continue
            prop = mounted.get("WeaponShootDataPropertyName") or []
            salvo_index = None
            if prop:
                m = re.match(r"WeaponShootData_(\d+)_", str(prop[0]))
                if m:
                    salvo_index = int(m.group(1))
            key = (ammo_ref, salvo_index)
            if key in seen:
                continue
            seen.add(key)
            weapons.append(build_weapon(ammo_ref, ammo, mounted, has_turret, speed, salvo_index, salvos, names))
    return weapons


# --------------------------------------------------------------------------
# Units

def build_unit(desc, unit, uid, ctx):
    mods, refs = modules_by_type(unit)
    ui = mods.get("TUnitUIModuleDescriptor", {})
    typ = mods.get("TTypeUnitModuleDescriptor", {})
    prod = mods.get("TProductionModuleDescriptor", {})
    dmg = mods.get("TDamageModuleDescriptor", {})
    base = mods.get("TBaseDamageModuleDescriptor", {})
    gen = mods.get("TGenericMovementModuleDescriptor", {})
    land = mods.get("TLandMovementModuleDescriptor", {})
    heli = mods.get("THelicopterMovementModuleDescriptor")
    air = mods.get("TAirplaneModuleDescriptor") or mods.get("TAirplaneMovementModuleDescriptor") \
        or mods.get("AirplaneMovementDescriptor")
    scan = mods.get("TScannerConfigurationDescriptor", {})
    vis = mods.get("TVisibilityModuleDescriptor", {})
    fuel = mods.get("TFuelModuleDescriptor")
    supply = mods.get("TSupplyModuleDescriptor")
    deploy = mods.get("TDeploymentShiftModuleDescriptor")
    exp = mods.get("TExperienceModuleDescriptor", {})
    danger = mods.get("TDangerousnessModuleDescriptor", {})
    tags = mods.get("TTagsModuleDescriptor", {}).get("TagSet") or []
    autocover = mods.get("TAutoCoverModuleDescriptor", {})

    cost = 0
    for k, v in prod.get("ProductionRessourcesNeeded") or []:
        if short(k) == "Resource_CommandPoints":
            cost = v
    factory = short(prod.get("FactoryType"))

    name_token = ui.get("NameToken")
    name = ctx["names"].get(name_token)
    if not name:
        name = humanize_descriptor(desc)
        ctx["unnamed"].append(desc)
    else:
        name = name.strip()

    specialities = list(ui.get("SpecialtiesList") or [])
    is_command = "_leader" in specialities or "Commandant" in tags

    blind = dmg.get("BlindageProperties") or {}
    fa, fat = armor_value(blind.get("ResistanceFront"))
    sa, sat = armor_value(blind.get("ResistanceSides"))
    ra, rat = armor_value(blind.get("ResistanceRear"))
    ta, tat = armor_value(blind.get("ResistanceTop"))

    optical = scan.get("OpticalStrengths") or ndf.NdfMap()
    opt_std = 0
    opt_high = 0
    for k, v in optical:
        if short(k) == "Standard":
            opt_std = v
        elif short(k) == "HighAltitude":
            opt_high = v

    speed = gen.get("MaxSpeedInKmph", 0) or 0
    road = ui.get("DisplayRoadSpeedInKmph")
    if road is None and land:
        road = speed * (land.get("SpeedBonusFactorOnRoad", 1) or 1)

    if air is not None:
        movement = "plane"
    elif heli is not None:
        movement = "helicopter"
    else:
        movement = "land"

    weapon_ref = next((short(r) for r in refs if "/GFX/Weapon/WeaponDescriptor" in r), None)
    weapons = build_weapons(ctx["weapons"].get(weapon_ref), ctx["weapons"], ctx["names"])

    country = typ.get("MotherCountry") or ""
    coalition = "ECoalition/Allied" if country in NATO_COUNTRIES else "ECoalition/Axis"

    panel = INFO_PANEL.get(ui.get("InfoPanelConfigurationToken"), "default")

    era = any(t.startswith("blindage_era") for t in (fat, sat, rat, tat))

    return {
        "descriptorName": desc,
        "name": name,
        "category": FACTORY_TO_CATEGORY.get(factory, "log"),
        "id": uid,
        "unitType": {
            "nationality": coalition,
            "motherCountry": country,
            "formation": short(mods.get("TFormationModuleDescriptor", {}).get("TypeUnitFormation")) or "",
        },
        "commandPoints": cost,
        "factoryDescriptor": factory_to_waryes(factory),
        "frontArmor": fa, "sideArmor": sa, "rearArmor": ra, "topArmor": ta,
        "frontArmorType": fat, "sideArmorType": sat, "rearArmorType": rat, "topArmorType": tat,
        "maxDamage": r2(base.get("MaxPhysicalDamages", 0) or 0),
        "speed": r2(speed, 0),
        "speedsForTerrains": [],
        "roadSpeed": r2(road, 0) if road is not None else None,
        "rotationTime": r2(land.get("TempsDemiTour", 0) or 0) if land else 0,
        "optics": r2(opt_std / OPTICS_FACTOR, 3),
        "airOptics": r2(opt_high / OPTICS_FACTOR, 3),
        "stealth": r2(vis.get("UnitConcealmentBonus", 1) or 1),
        "infoPanelType": panel,
        "advancedDeployment": r2(deploy.get("DeploymentShiftGRU", 0) or 0, 0) if deploy else 0,
        "fuel": r2(fuel.get("FuelCapacity")) if fuel else None,
        "fuelMove": r2(fuel.get("FuelMoveDuration")) if fuel else None,
        "supply": r2(supply.get("SupplyCapacity")) if supply else None,
        "ecm": 0,
        "agility": None,
        "travelTime": None,
        "hasDefensiveSmoke": "_smoke_launcher" in specialities,
        "specialities": specialities,
        "bombStrategy": "",
        "weapons": weapons,
        "isSellable": True,
        "divisions": sorted(ctx["unit_divisions"].get(desc, [])),
        "isCommand": is_command,
        "dangerousness": r2(danger.get("Dangerousness", 0) or 0),
        "movementType": movement,
        "occupiableTerrains": [],
        "era": era,
        "isSpecialForces": "_sf" in specialities,
        "xpBonuses": short(exp.get("ExperienceLevelsPackDescriptor")) or "",
    }


# --------------------------------------------------------------------------
# Divisions

def resolve_rule(div, ctx):
    """DivisionRule is either inline (WiF) or a reference to DivisionRules.ndf (base game)."""
    rule = div.get("DivisionRule")
    if isinstance(rule, ndf.NdfObject):
        return rule
    if isinstance(rule, str):
        return ctx["rules"]().get(short(rule))
    return None


def build_division(desc, div, did, ctx):
    tags = list(div.get("DivisionTags") or [])
    coalition = short(div.get("DivisionCoalition"))
    if coalition in ("NATO", "Allied") or "Allied" in tags or "NATO" in tags:
        alliance = "ECoalition/Allied"
    else:
        alliance = "ECoalition/Axis"

    matrix = []
    cm = div.get("CostMatrix")
    if isinstance(cm, ndf.NdfMap):
        for k, v in cm:
            costs = list(v or [])
            matrix.append({"name": factory_to_waryes(k), "activationCosts": costs if costs else [0]})
        matrix_name = desc.replace("Descriptor_Deck_Division_", "MatrixCost_")
    else:
        matrix_name = short(cm) or ""
        for k, v in ctx["cost_matrices"].get(matrix_name, ndf.NdfMap()):
            costs = list(v or [])
            matrix.append({"name": factory_to_waryes(k), "activationCosts": costs if costs else [0]})

    packs = []
    rule = resolve_rule(div, ctx)
    if isinstance(rule, ndf.NdfObject):
        for r in rule.get("UnitRuleList") or []:
            unit_desc = short(r["UnitDescriptor"])
            transports = [short(t) for t in (r.get("AvailableTransportList") or [])]
            without = r.get("AvailableWithoutTransport")
            if without is None:
                without = not transports
            pack = {
                "packDescriptor": unit_desc,
                "unitDescriptor": unit_desc,
                "availableWithoutTransport": bool(without),
                "numberOfUnitsInPack": r.get("NumberOfUnitInPack", 1),
                "numberOfUnitInPackXPMultiplier": [float(x) for x in (r.get("NumberOfUnitInPackXPMultiplier") or [1, 0, 0, 0])],
                "numberOfCards": r.get("MaxPackNumber", 1),
            }
            if transports:
                pack["availableTransportList"] = transports
            packs.append(pack)

    name = ctx["names"].get(div.get("DivisionName")) or desc.replace("Descriptor_Deck_Division_", "")
    return {
        "id": did,
        "name": name.strip(),
        "descriptor": desc,
        "alliance": alliance,
        "availableForPlay": True,
        "country": div.get("CountryId") or "",
        "tags": tags,
        "maxActivationPoints": div.get("MaxActivationPoints", 0),
        "costMatrix": {"name": matrix_name, "matrix": matrix},
        "packs": packs,
        "emblemTexture": div.get("EmblemTexture"),
        "typeToken": div.get("TypeToken"),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--gamedata", help="GameData folder with text .ndf files")
    ap.add_argument("--ndfbin", help="compiled mod folder Gen/NDF/GFX with .ndfbin files")
    ap.add_argument("--strings", nargs="*", default=[],
                    help="localisation files: HarvestedStrings.csv, UNITS.csv-style CSV or .dic dictionaries")
    ap.add_argument("--out", required=True)
    ap.add_argument("--name", default="wif", help="output file name: <name>.json and <name>-report.json")
    ap.add_argument("--preset", choices=sorted(PRESETS), default="wif",
                    help="which divisions to export (see PRESETS)")
    ap.add_argument("--division-names", default=None,
                    help="JSON {division descriptor: name}; overrides localised names")
    ap.add_argument("--division-regex", default=None,
                    help="override the preset: regex on division descriptors")
    args = ap.parse_args()
    division_re = re.compile(args.division_regex or PRESETS[args.preset])
    if not args.gamedata and not args.ndfbin:
        ap.error("give --gamedata or --ndfbin")

    log = lambda *a: print(*a, file=sys.stderr)

    if args.ndfbin:
        # Compiled mod output: Gen/NDF/GFX/*.ndfbin
        import ndfbin
        B = args.ndfbin
        log("reading compiled ndfbin files...")
        families = ndfbin.load_family_lists(os.path.join(B, "BaseWeapon.ndfbin"))
        divisions = ndfbin.load(os.path.join(B, "Division.ndfbin"), families)
        serializer = next(v for k, v in divisions.items() if k.startswith("__unnamed__"))
        cost_matrices = {}
        compiled = {
            "units": ndfbin.load(os.path.join(B, "Unit.ndfbin"), families),
            "weapons": ndfbin.load(os.path.join(B, "Weapon.ndfbin"), families),
        }
        G = None
    else:
        G = os.path.join(args.gamedata, "Generated", "Gameplay")
        compiled = None
        log("parsing decks...")
        divisions = ndf.parse_file(os.path.join(G, "Decks", "Divisions.ndf"))
        serializer = list(ndf.parse_file(os.path.join(G, "Decks", "DeckSerializer.ndf")).values())[0]
        cost_matrices = {}
        cm_path = os.path.join(G, "Decks", "DivisionCostMatrix.ndf")
        if os.path.exists(cm_path):
            for k, v in ndf.parse_file(cm_path).items():
                if isinstance(v, ndf.NdfMap):
                    cost_matrices[k] = v

    def key_name(k):
        return k.name if isinstance(k, ndf.NdfObject) else short(k)

    div_ids = {key_name(k): v for k, v in serializer["DivisionIds"]}
    unit_ids = {key_name(k): v for k, v in serializer["UnitIds"]}

    rules_cache = {}

    def rules():
        """DivisionRules.ndf can be large; parse it only when a division needs it."""
        if "db" not in rules_cache and G is None:
            rules_cache["db"] = {}
        if "db" not in rules_cache:
            path = os.path.join(G, "Decks", "DivisionRules.ndf")
            log("parsing division rules...")
            db = {}
            if os.path.exists(path):
                for k, v in ndf.parse_file(path).items():
                    if isinstance(v, ndf.NdfObject):
                        db[k] = v
                    # rules may also be stored as a MAP keyed by division
                    elif isinstance(v, ndf.NdfMap):
                        for dk, dv in v:
                            if isinstance(dv, ndf.NdfObject):
                                db[short(dk)] = dv
            rules_cache["db"] = db
        return rules_cache["db"]

    rule_ctx = {"rules": rules}
    selected = {}
    for k, v in divisions.items():
        if not (division_re.search(k) and isinstance(v, ndf.NdfObject)):
            continue
        if MULTIPLAYER_TAG not in (v.get("DivisionTags") or []):
            continue
        if not isinstance(resolve_rule(v, rule_ctx), ndf.NdfObject):
            continue
        selected[k] = v
    log(f"divisions selected: {len(selected)}")

    unit_divisions = {}
    for k, v in selected.items():
        for r in resolve_rule(v, rule_ctx)["UnitRuleList"]:
            for u in [r["UnitDescriptor"]] + list(r.get("AvailableTransportList") or []):
                unit_divisions.setdefault(short(u), set()).add(k)

    if compiled:
        units_db = compiled["units"]
        weapons_db = compiled["weapons"]
    else:
        log("parsing units and weapons...")
        units_db = ndf.parse_file(os.path.join(G, "Gfx", "UniteDescriptor.ndf"))
        bpath = os.path.join(G, "Gfx", "BuildingDescriptors.ndf")
        if os.path.exists(bpath):
            units_db.update(ndf.parse_file(bpath))
        weapons_db = ndf.parse_file(os.path.join(G, "Gfx", "WeaponDescriptor.ndf"))
        for extra in ("Ammunition.ndf", "AmmunitionMissiles.ndf"):
            p = os.path.join(G, "Gfx", extra)
            if os.path.exists(p):
                weapons_db.update(ndf.parse_file(p))

    ctx = {
        "names": load_strings(args.strings),
        "weapons": weapons_db,
        "unit_divisions": unit_divisions,
        "cost_matrices": cost_matrices,
        "rules": rules,
        "unnamed": [],
    }

    problems = []
    units = []
    for desc in sorted(unit_divisions):
        u = units_db.get(desc)
        if u is None:
            problems.append(f"unit descriptor not found: {desc}")
            continue
        uid = unit_ids.get(desc)
        if uid is None:
            problems.append(f"unit has no DeckSerializer id: {desc}")
            uid = 0
        units.append(build_unit(desc, u, uid, ctx))

    division_names = {}
    if args.division_names:
        with open(args.division_names, encoding="utf-8") as f:
            division_names = json.load(f)

    divs = []
    for desc, d in selected.items():
        did = div_ids.get(desc)
        if did is None:
            problems.append(f"division has no DeckSerializer id: {desc}")
            continue
        division = build_division(desc, d, did, ctx)
        if desc in division_names:
            division["name"] = division_names[desc]
        divs.append(division)
    divs.sort(key=lambda d: (d["alliance"], d["country"], d["name"]))

    os.makedirs(args.out, exist_ok=True)
    with open(os.path.join(args.out, f"{args.name}.json"), "w", encoding="utf-8") as f:
        json.dump({"units": units, "divisions": divs}, f, ensure_ascii=False, separators=(",", ":"))

    report = {
        "divisions": len(divs),
        "units": len(units),
        "weapons": sum(len(u["weapons"]) for u in units),
        "unitsWithoutLocalisedName": len(ctx["unnamed"]),
        "unnamedUnits": ctx["unnamed"],
        "problems": problems,
    }
    with open(os.path.join(args.out, f"{args.name}-report.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    log(json.dumps({k: v for k, v in report.items() if k != "unnamedUnits"}, indent=2))


if __name__ == "__main__":
    main()
