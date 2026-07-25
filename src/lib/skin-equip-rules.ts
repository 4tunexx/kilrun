/**
 * Skin equip exclusivity + clash rules.
 *
 * - Full-body skins replace the whole character and cannot mix with layers.
 * - Body skins (Body_Brown, etc.) replace Blue 001 but still allow hair/hat/hoodie…
 * - Head pieces can clash (helmet vs glasses/hair); the UI confirms before clearing.
 */
import { isSkinCosmeticSlot } from '@/lib/player-skins';

export type SkinEquipKind =
  | 'fullbody'
  | 'body'
  | 'hat'
  | 'hair'
  | 'glasses'
  | 'eyebrow'
  | 'mustache'
  | 'torso'
  | 'pants'
  | 'boots'
  | 'gloves'
  | 'back'
  | 'weapon'
  | 'tail'
  | 'horn'
  | 'addon'
  | 'other';

export interface SkinEquipItemRef {
  id?: string;
  itemName?: string | null;
  itemSku?: string | null;
  cosmeticSlot?: string | null;
  cosmeticConfig?: unknown;
  isEquipped?: boolean;
}

export interface SkinClashResult {
  /**Slots that must be cleared before the new item can equip. */
  slotsToClear: string[];
  /** Inventory item ids currently equipped in those slots (when known). */
  itemIdsToUnequip: string[];
  /** Human-readable reasons for the confirm dialog. */
  reasons: string[];
  /** True when equipping a full-body skin (clears every other skin_*). */
  fullBodyExclusive: boolean;
  /**
   * Same-kind / remapped-slot replacements cleared automatically
   * (no confirm dialog — e.g. swapping one hat for another).
   */
  silentSlotsToClear: string[];
}

const SLOT_TO_KIND: Record<string, SkinEquipKind> = {
  skin_fullbody: 'fullbody',
  skin_body: 'body',
  skin_hat: 'hat',
  skin_hair: 'hair',
  skin_glasses: 'glasses',
  skin_eyebrow: 'eyebrow',
  skin_mustache: 'mustache',
  skin_face: 'glasses', // legacy face slot treated as glasses-like
  skin_torso: 'torso',
  skin_pants: 'pants',
  skin_boots: 'boots',
  skin_gloves: 'gloves',
  skin_back: 'back',
  skin_weapon: 'weapon',
  skin_tail: 'tail',
  skin_horn: 'horn',
  skin_addon: 'addon',
};

const KIND_LABEL: Record<SkinEquipKind, string> = {
  fullbody: 'Full body skin',
  body: 'Body',
  hat: 'Hat / helmet',
  hair: 'Hair',
  glasses: 'Glasses',
  eyebrow: 'Eyebrows',
  mustache: 'Mustache',
  torso: 'Outerwear',
  pants: 'Pants',
  boots: 'Shoes',
  gloves: 'Gloves',
  back: 'Backpack',
  weapon: 'Weapon',
  tail: 'Tail',
  horn: 'Horn',
  addon: 'Addon',
  other: 'Skin',
};

function configPrimarySlot(cfg: unknown): string | null {
  if (!cfg || typeof cfg !== 'object') return null;
  const o = cfg as Record<string, unknown>;
  if (typeof o.primarySlot === 'string') return o.primarySlot;
  const atts = Array.isArray(o.attachments) ? o.attachments : [];
  const slot = (atts[0] as { slot?: string } | undefined)?.slot;
  return typeof slot === 'string' ? slot : null;
}

/** Infer cosmetic kind from slot, config, and item naming. */
export function resolveSkinEquipKind(item: SkinEquipItemRef): SkinEquipKind | null {
  const slot = item.cosmeticSlot || '';
  if (!isSkinCosmeticSlot(slot) && !configPrimarySlot(item.cosmeticConfig)) return null;

  const name = `${item.itemName || ''} ${item.itemSku || ''}`.toLowerCase();
  const primary = (configPrimarySlot(item.cosmeticConfig) || '').toLowerCase();

  if (slot === 'skin_fullbody' || primary === 'fullbody' || /fullbody|full_body/.test(name)) {
    return 'fullbody';
  }
  if (slot === 'skin_body' || primary === 'body' || /^body[_\s]/.test(name) || /basic_character/.test(name)) {
    return 'body';
  }
  if (slot === 'skin_hair' || primary === 'hair' || /hair/.test(name)) return 'hair';
  if (slot === 'skin_glasses' || primary === 'glasses' || /glass/.test(name)) return 'glasses';
  if (slot === 'skin_eyebrow' || primary === 'eyebrow' || /eyebrow/.test(name)) return 'eyebrow';
  if (slot === 'skin_mustache' || primary === 'mustache' || /mustache|moustache/.test(name)) {
    return 'mustache';
  }
  if (slot === 'skin_hat' || primary === 'hat' || /hat|helmet|cap|crown|hood/.test(name)) {
    return 'hat';
  }
  if (SLOT_TO_KIND[slot]) return SLOT_TO_KIND[slot];
  if (primary && SLOT_TO_KIND[`skin_${primary}`]) return SLOT_TO_KIND[`skin_${primary}`];
  return 'other';
}

export function skinKindLabel(kind: SkinEquipKind): string {
  return KIND_LABEL[kind] || 'Skin';
}

export function isHelmetItem(item: SkinEquipItemRef): boolean {
  const name = `${item.itemName || ''} ${item.itemSku || ''}`.toLowerCase();
  // Caps / beanies are fine with glasses; closed headgear is not.
  return /helmet|helm|hard[\s_-]?hat|visor|gas[\s_-]?mask|balaclava|tactical[\s_-]?helm|moto[\s_-]?helm|bike[\s_-]?helm/.test(
    name
  );
}

/** Canonical inventory cosmeticSlot for a skin kind. */
export function cosmeticSlotForKind(kind: SkinEquipKind): string {
  switch (kind) {
    case 'fullbody':
      return 'skin_fullbody';
    case 'body':
      return 'skin_body';
    case 'hat':
      return 'skin_hat';
    case 'hair':
      return 'skin_hair';
    case 'glasses':
      return 'skin_glasses';
    case 'eyebrow':
      return 'skin_eyebrow';
    case 'mustache':
      return 'skin_mustache';
    case 'torso':
      return 'skin_torso';
    case 'pants':
      return 'skin_pants';
    case 'boots':
      return 'skin_boots';
    case 'gloves':
      return 'skin_gloves';
    case 'back':
      return 'skin_back';
    case 'weapon':
      return 'skin_weapon';
    case 'tail':
      return 'skin_tail';
    case 'horn':
      return 'skin_horn';
    case 'addon':
      return 'skin_addon';
    default:
      return 'skin_addon';
  }
}

/**
 * Soft clash matrix: equipping `incoming` while `equipped` is worn requires
 * clearing the equipped item (after user confirmation).
 */
function kindsClash(incoming: SkinEquipKind, equipped: SkinEquipKind, incomingIsHelmet: boolean): boolean {
  if (incoming === equipped) return true; // same kind = replace (handled as same-slot too)
  if (incoming === 'fullbody' || equipped === 'fullbody') return true;

  // Helmet covers the whole head — glasses / hair / brows / mustache go away.
  if (incomingIsHelmet && (equipped === 'glasses' || equipped === 'hair' || equipped === 'eyebrow' || equipped === 'mustache')) {
    return true;
  }
  if (equipped === 'hat' && incomingIsHelmet === false) {
    // handled below via helmet check on equipped
  }

  // Hat vs hair always clash (hair pokes through / hat replaces hair).
  if (
    (incoming === 'hat' && equipped === 'hair') ||
    (incoming === 'hair' && equipped === 'hat')
  ) {
    return true;
  }

  // Glasses vs helmet (if an equipped hat is a helmet — caller passes via item check)
  return false;
}

/**
 * Given the item the user wants to equip and the currently-equipped inventory
 * rows, return which slots/items must be cleared first.
 */
export function previewSkinEquipClash(
  incoming: SkinEquipItemRef,
  equippedItems: SkinEquipItemRef[]
): SkinClashResult {
  const incomingKind = resolveSkinEquipKind(incoming);
  const empty: SkinClashResult = {
    slotsToClear: [],
    itemIdsToUnequip: [],
    reasons: [],
    fullBodyExclusive: false,
    silentSlotsToClear: [],
  };
  if (!incomingKind) return empty;

  const incomingHelmet = incomingKind === 'hat' && isHelmetItem(incoming);
  const slots = new Set<string>();
  const silent = new Set<string>();
  const ids = new Set<string>();
  const reasons: string[] = [];
  let fullBodyExclusive = incomingKind === 'fullbody';

  for (const eq of equippedItems) {
    if (!eq.isEquipped) continue;
    if (eq.id && incoming.id && eq.id === incoming.id) continue;
    const eqKind = resolveSkinEquipKind(eq);
    if (!eqKind) continue;
    const eqSlot = eq.cosmeticSlot || cosmeticSlotForKind(eqKind);
    if (!isSkinCosmeticSlot(eqSlot)) continue;

    const eqHelmet = eqKind === 'hat' && isHelmetItem(eq);

    // Same cosmetic slot / same kind → silent replace.
    if (
      (eq.cosmeticSlot && incoming.cosmeticSlot && eq.cosmeticSlot === incoming.cosmeticSlot) ||
      eqKind === incomingKind
    ) {
      silent.add(eqSlot);
      if (eq.id) ids.add(eq.id);
      continue;
    }

    let clash = kindsClash(incomingKind, eqKind, incomingHelmet);

    // Equipped helmet blocks new glasses / hair / face fluff.
    if (
      eqHelmet &&
      (incomingKind === 'glasses' ||
        incomingKind === 'hair' ||
        incomingKind === 'eyebrow' ||
        incomingKind === 'mustache')
    ) {
      clash = true;
    }

    if (!clash) continue;

    slots.add(eqSlot);
    if (eq.id) ids.add(eq.id);

    if (incomingKind === 'fullbody') {
      reasons.push(`Remove ${eq.itemName || skinKindLabel(eqKind)} (full body skins can't mix with other skins)`);
    } else if (eqKind === 'fullbody') {
      reasons.push(`Unequip full body skin "${eq.itemName || 'Full body'}" to wear layered cosmetics`);
      fullBodyExclusive = false;
    } else if (incomingHelmet || eqHelmet) {
      reasons.push(
        `${incomingHelmet ? 'Helmet' : 'This item'} clashes with ${eq.itemName || skinKindLabel(eqKind)}`
      );
    } else if (
      (incomingKind === 'hat' && eqKind === 'hair') ||
      (incomingKind === 'hair' && eqKind === 'hat')
    ) {
      reasons.push(`Hat and hair can't be worn together — remove ${eq.itemName || skinKindLabel(eqKind)}`);
    } else {
      reasons.push(`Replace ${eq.itemName || skinKindLabel(eqKind)}`);
    }
  }

  if (incomingKind === 'fullbody') {
    fullBodyExclusive = true;
  }

  return {
    slotsToClear: Array.from(slots),
    itemIdsToUnequip: Array.from(ids),
    reasons: Array.from(new Set(reasons)),
    fullBodyExclusive,
    silentSlotsToClear: Array.from(silent),
  };
}

/** All skin_* keys that should be wiped when equipping a full-body skin. */
export function allSkinSlotsExcept(keep?: string | null): string[] {
  return Object.keys(SLOT_TO_KIND).filter((s) => s !== keep);
}
