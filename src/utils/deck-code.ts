import {LookupService, SimpleDeck, SimpleUnitCard} from '@izohek/warno-deck-utils';

/**
 * WARNO deck codes.
 *
 * Bit layout (base64 of a big-endian bit string; "lv" = 5-bit length + value):
 *   lv(version = 3)
 *   lv(modded flag: 0 or 1)
 *   if modded: u64 Steam Workshop id of the mod, u32 (1 in decks made in game)
 *   lv(division id)
 *   lv(number of cards)
 *   5 bits: veterancy field width
 *   5 bits: unit id field width
 *   per card: veterancy, unit id + 1, transport id + 1 (0 = no transport)
 *   lv(0) as terminator, zero padding to a full byte
 *
 * Unit ids in deck codes are the DeckSerializer ids plus one (checked on
 * a 35 card deck made in game: every card is "code id - 1"); division ids
 * are written as they are. Codes are encoded and decoded here; the
 * @izohek/warno-deck-utils library knows neither the modded block nor
 * the offset.
 */

export interface DeckCodeMod {
  /** Steam Workshop id of the mod */
  workshopId: string;
  /** 32-bit value written after the workshop id (1 in game-made decks) */
  value: number;
}

export interface DeckCodeOptions {
  mod?: DeckCodeMod;
  /** Unit id field width; the game uses the width of the largest unit id */
  idBits?: number;
}

const VERSION = 3;
/** Deck codes store DeckSerializer unit ids + 1, so 0 means "no transport" */
const UNIT_ID_OFFSET = 1;
const MIN_ID_BITS = 12;
const XP_BITS = 2;

function lengthValue(value: number): string {
  const bits = value.toString(2);
  return bits.length.toString(2).padStart(5, '0') + bits;
}

function fixed(value: number, width: number): string {
  return value.toString(2).padStart(width, '0');
}

/** 64-bit field from a decimal string (Workshop ids fit in 2^53) */
function fixed64(decimal: string): string {
  const value = Number(decimal);
  const high = Math.floor(value / 2 ** 32);
  const low = value - high * 2 ** 32;
  return fixed(high, 32) + fixed(low, 32);
}

function bitsToBase64(bits: string): string {
  let text = '';
  for (let i = 0; i < bits.length; i += 8) {
    text += String.fromCharCode(parseInt(bits.slice(i, i + 8).padEnd(8, '0'), 2));
  }
  return btoa(text);
}

function base64ToBits(code: string): string {
  const text = atob(code);
  let bits = '';
  for (let i = 0; i < text.length; i++) {
    bits += text.charCodeAt(i).toString(2).padStart(8, '0');
  }
  return bits;
}

export function encodeDeckCode(
  deck: SimpleDeck,
  options: DeckCodeOptions = {}
): string {
  let idBits = Math.max(MIN_ID_BITS, options.idBits ?? 0);
  for (const card of deck.cards) {
    for (const id of [card.unit.id, card.transport?.id ?? 0]) {
      idBits = Math.max(idBits, (id + UNIT_ID_OFFSET).toString(2).length);
    }
  }

  let bits = lengthValue(VERSION);
  if (options.mod) {
    bits += lengthValue(1);
    bits += fixed64(options.mod.workshopId);
    bits += fixed(options.mod.value, 32);
  } else {
    bits += lengthValue(0);
  }
  bits += lengthValue(deck.division.id);
  bits += lengthValue(deck.cards.length);
  bits += fixed(XP_BITS, 5);
  bits += fixed(idBits, 5);
  for (const card of deck.cards) {
    bits += fixed(card.veterancy, XP_BITS);
    bits += fixed(card.unit.id + UNIT_ID_OFFSET, idBits);
    bits += fixed(card.transport ? card.transport.id + UNIT_ID_OFFSET : 0, idBits);
  }
  bits += lengthValue(0);
  return bitsToBase64(bits);
}

export function decodeDeckCode(code: string, lookup: LookupService): SimpleDeck {
  const bits = base64ToBits(code);
  let pos = 0;
  const readLv = () => {
    const length = parseInt(bits.slice(pos, pos + 5), 2);
    const value = length ? parseInt(bits.slice(pos + 5, pos + 5 + length), 2) : 0;
    pos += 5 + length;
    return value;
  };
  const readFixed = (width: number) => {
    const value = width ? parseInt(bits.slice(pos, pos + width), 2) : 0;
    pos += width;
    return value;
  };

  readLv(); // version
  const modded = readLv() === 1;
  if (modded) {
    pos += 64 + 32; // Workshop id, value
  }
  const divisionId = readLv();
  const numberCards = readLv();
  const xpBits = readFixed(5);
  const idBits = readFixed(5);

  const cards: SimpleUnitCard[] = [];
  for (let i = 0; i < numberCards && pos + xpBits + 2 * idBits <= bits.length; i++) {
    const veterancy = readFixed(xpBits);
    const unitId = readFixed(idBits) - UNIT_ID_OFFSET;
    const transportCode = readFixed(idBits);
    const card: SimpleUnitCard = {
      veterancy,
      unit: {id: unitId, descriptor: lookup.unitForId(unitId)},
    };
    if (transportCode) {
      const transportId = transportCode - UNIT_ID_OFFSET;
      card.transport = {id: transportId, descriptor: lookup.unitForId(transportId)};
    }
    cards.push(card);
  }

  return {
    modded,
    division: {id: divisionId, descriptor: lookup.divisionForId(divisionId)},
    numberCards: cards.length,
    cards,
  };
}
