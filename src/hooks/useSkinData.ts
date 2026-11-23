import { useState, useEffect, useCallback } from "react";
import { getCached, getStale, setCache } from "../lib/cache";
import { buildForms, baseFormLabel, type FormInfo } from "../lib/forms";
import { getLang, bumpDataVersion, useI18n } from "../lib/i18n";
import type { Champion, Skin, Chroma, SkinGroup, FormSkin, Rarity } from "../types";

const SKIN_IDS_URL =
  "https://raw.githubusercontent.com/Alban1911/LeagueSkins/main/resources/en/skin_ids.json";
const SKIN_IDS_PT_URL =
  "https://raw.githubusercontent.com/Alban1911/LeagueSkins/main/resources/pt/skin_ids.json";
const TREE_API_URL =
  "https://api.github.com/repos/Alban1911/LeagueSkins/git/trees/main?recursive=1";
const SKINS_JSON_URL =
  "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/skins.json";

const SKIN_IDS_CACHE_KEY = "zushi:skin_ids";
const SKIN_IDS_PT_CACHE_KEY = "zushi:skin_ids_pt";
// _v2 invalidated the stale name-based cache from older builds; _v3 adds each
// file's git blob sha, used to spot skins republished upstream.
const REPO_ZIPS_CACHE_KEY = "zushi:repo_files_v3";
// Chroma colors/parents, each skin's rarity and art paths, all from Community Dragon's
// skins.json. _v2 adds the art paths.
const META_CACHE_KEY = "zushi:skin_meta_v2";
// Root of the client's game data on Community Dragon. Its centered splashes are sharper
// (1280x720) and half the size of Data Dragon's uncentered ones; tiles are 380x380.
const CDRAGON_GAME_DATA =
  "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/";

export interface SkinMeta {
  rarity: Rarity;
  legacy: boolean;
}

type ChromaInfo = { colors: string[]; parentId: number };

// English names: the canonical ones, used as on-disk folder names.
let skinIdsCache: Record<string, string> | null = null;
// pt_BR names, for display only.
let skinIdsPtCache: Record<string, string> | null = null;
let skinIdsPtInflight: Promise<void> | null = null;
let repoZipsCache: Map<string, string> | null = null;
// skin id -> git blob sha of its package in the repo tree
let repoShaCache: Map<string, string> | null = null;
let repoZipsInflight: Promise<Map<string, string>> | null = null;
let chromaInfoCache: Map<number, ChromaInfo> | null = null;
let skinMetaCache: Map<number, SkinMeta> | null = null;
// skin id -> [splash, tile] paths under CDRAGON_GAME_DATA
let skinArtCache: Map<number, [splash: string, tile: string]> | null = null;
let metaInflight: Promise<Map<number, ChromaInfo>> | null = null;

// Form packages (see lib/forms.ts), derived from the repo tree and skin_ids.json.
let formsCache: Map<string, FormInfo> | null = null;
let formsFromPaths: Map<string, string> | null = null;
let formsFromIds: Record<string, string> | null = null;

export function getForms(): Map<string, FormInfo> | null {
  if (!repoZipsCache || !skinIdsCache) return null;
  if (formsCache && formsFromPaths === repoZipsCache && formsFromIds === skinIdsCache) {
    return formsCache;
  }
  formsCache = buildForms(repoZipsCache, skinIdsCache);
  formsFromPaths = repoZipsCache;
  formsFromIds = skinIdsCache;
  return formsCache;
}

/** On-disk (English) name of a form: "Elementalist Lux (Fire)". */
function formEnglishName(form: FormInfo): string {
  return `${skinIdsCache?.[form.parentId] ?? form.parentId} (${form.en})`;
}

// Reverse indices over skinIdsCache (plus forms) so name-based lookups are O(1)
// instead of scanning all ~9k entries on every call (My Skins does this per skin, per render).
let skinNameToId: Map<string, string> | null = null;
let skinChampNameToId: Map<string, string> | null = null;
// base skin name ("Jax", the local champion folder name) -> champion key
let champNameToKey: Map<string, number> | null = null;
let indexedFrom: Record<string, string> | null = null;
let indexedForms: Map<string, FormInfo> | null = null;

function ensureSkinIndexes(): void {
  if (!skinIdsCache) return;
  const forms = getForms();
  if (indexedFrom === skinIdsCache && indexedForms === forms && skinNameToId) return;
  const nameToId = new Map<string, string>();
  const champNameToId = new Map<string, string>();
  const champToKey = new Map<string, number>();
  const add = (id: string, name: string) => {
    if (!nameToId.has(name)) nameToId.set(name, id);
    const key = `${Math.floor(parseInt(id, 10) / 1000)}:${name}`;
    if (!champNameToId.has(key)) champNameToId.set(key, id);
  };
  for (const [id, name] of Object.entries(skinIdsCache)) {
    add(id, name);
    const numericId = parseInt(id, 10);
    if (numericId % 1000 === 0 && !champToKey.has(name)) {
      champToKey.set(name, Math.floor(numericId / 1000));
    }
  }
  if (forms) {
    for (const f of forms.values()) add(f.id, formEnglishName(f));
    // Forms once had numbered names on disk ("Arcane Fractured Jinx (Form 3)"):
    // keep finding those downloads after a form gets a real name.
    for (const f of forms.values())
      add(f.id, `${skinIdsCache[f.parentId] ?? f.parentId} (Form ${f.n})`);
  }
  skinNameToId = nameToId;
  skinChampNameToId = champNameToId;
  champNameToKey = champToKey;
  indexedFrom = skinIdsCache;
  indexedForms = forms;
}

export function ensureSkinIds(): Promise<Record<string, string>> {
  if (skinIdsCache) return Promise.resolve(skinIdsCache);

  const cached = getCached<Record<string, string>>(SKIN_IDS_CACHE_KEY);
  if (cached) {
    skinIdsCache = cached;
    return Promise.resolve(cached);
  }

  return fetch(SKIN_IDS_URL)
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then((data: Record<string, string>) => {
      skinIdsCache = data;
      setCache(SKIN_IDS_CACHE_KEY, data);
      return data;
    })
    .catch((err) => {
      const stale = getStale<Record<string, string>>(SKIN_IDS_CACHE_KEY);
      if (stale) {
        skinIdsCache = stale;
        return stale;
      }
      throw err;
    });
}

/** Loads the pt_BR skin names (display only). Never rejects: English is the fallback. */
export function ensureLocalizedSkinNames(): Promise<void> {
  if (skinIdsPtCache) return Promise.resolve();
  const cached = getCached<Record<string, string>>(SKIN_IDS_PT_CACHE_KEY);
  if (cached) {
    skinIdsPtCache = cached;
    bumpDataVersion();
    return Promise.resolve();
  }
  if (skinIdsPtInflight) return skinIdsPtInflight;
  skinIdsPtInflight = fetch(SKIN_IDS_PT_URL)
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then((data: Record<string, string>) => {
      skinIdsPtCache = data;
      setCache(SKIN_IDS_PT_CACHE_KEY, data);
    })
    .catch(() => {
      const stale = getStale<Record<string, string>>(SKIN_IDS_PT_CACHE_KEY);
      if (stale) skinIdsPtCache = stale;
    })
    .then(() => bumpDataVersion())
    .finally(() => {
      skinIdsPtInflight = null;
    });
  return skinIdsPtInflight;
}

type RepoFileRow = [id: string, path: string, sha: string];

function loadRepoRows(rows: RepoFileRow[]): Map<string, string> {
  const paths = new Map<string, string>();
  const shas = new Map<string, string>();
  for (const [id, path, sha] of rows) {
    paths.set(id, path);
    if (sha) shas.set(id, sha);
  }
  repoZipsCache = paths;
  repoShaCache = shas;
  return paths;
}

/**
 * Loads the repo tree (cached for 24h). `force` skips the cache, e.g. right
 * before updating skins so their new content is compared against fresh shas.
 */
export function ensureRepoZips(force = false): Promise<Map<string, string>> {
  if (!force && repoZipsCache) return Promise.resolve(repoZipsCache);

  if (!force) {
    const cached = getCached<RepoFileRow[]>(REPO_ZIPS_CACHE_KEY);
    if (cached) return Promise.resolve(loadRepoRows(cached));
  }

  if (repoZipsInflight) return repoZipsInflight;

  repoZipsInflight = fetch(TREE_API_URL)
    .then((res) => {
      if (!res.ok) throw new Error(`GitHub API ${res.status}`);
      return res.json();
    })
    .then((data: { tree: { path: string; type: string; sha: string }[] }) => {
      const rows: RepoFileRow[] = [];
      for (const entry of data.tree) {
        if (entry.type !== "blob" || !entry.path.startsWith("skins/")) continue;
        // Paths are id-based, e.g. "skins/222/222020/222025/222025.fantome".
        // The filename stem is the skin id, matching skin_ids.json keys.
        const filename = entry.path.split("/").pop() ?? "";
        const ext = filename.endsWith(".fantome")
          ? ".fantome"
          : filename.endsWith(".zip")
            ? ".zip"
            : null;
        if (!ext) continue;
        const skinId = filename.slice(0, -ext.length);
        if (!/^\d+$/.test(skinId)) continue;
        rows.push([skinId, entry.path, entry.sha ?? ""]);
      }
      setCache(REPO_ZIPS_CACHE_KEY, rows);
      return loadRepoRows(rows);
    })
    .catch((err) => {
      if (repoZipsCache) return repoZipsCache; // forced refresh failed: keep what we have
      const stale = getStale<RepoFileRow[]>(REPO_ZIPS_CACHE_KEY);
      if (stale) return loadRepoRows(stale);
      throw err;
    })
    .finally(() => {
      repoZipsInflight = null;
    });
  return repoZipsInflight;
}

/** Git blob sha of the skin's package in the repo, or null if unknown. */
export function repoSkinSha(skinId: string): string | null {
  return repoShaCache?.get(skinId) ?? null;
}

/**
 * The skin id of a downloaded skin, from its on-disk champion folder name (the
 * base skin's name in skin_ids.json, e.g. "Jax") and skin name.
 */
export function lookupDownloadedSkinId(championName: string, skinName: string): string | null {
  if (!skinIdsCache) return null;
  ensureSkinIndexes();
  const champKey = champNameToKey!.get(championName);
  if (champKey !== undefined) {
    const id = skinChampNameToId!.get(`${champKey}:${skinName}`);
    if (id !== undefined) return id;
  }
  return skinNameToId!.get(skinName) ?? null;
}

/** Download URL of a skin by id (see skinDownloadUrl). */
export function skinDownloadUrlById(skinId: string): string | null {
  if (!repoZipsCache) return null;
  const repoPath = repoZipsCache.get(skinId);
  if (!repoPath) return null;
  const encoded = repoPath
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return `https://raw.githubusercontent.com/Alban1911/LeagueSkins/main/${encoded}`;
}

type MetaCacheEntry = {
  chromas: [number, ChromaInfo][];
  meta: [id: number, rarity: Rarity, legacy: 0 | 1][];
  art: [id: number, splash: string, tile: string][];
};

/** "/lol-game-data/assets/ASSETS/Characters/Lux/..." -> "assets/characters/lux/..." */
function artPath(p: string | undefined): string {
  return p ? p.replace(/^\/lol-game-data\/assets\//, "").toLowerCase() : "";
}

function loadMeta(entry: MetaCacheEntry): Map<number, ChromaInfo> {
  chromaInfoCache = new Map(entry.chromas);
  skinArtCache = new Map(entry.art.map(([id, splash, tile]) => [id, [splash, tile]]));
  skinMetaCache = new Map(
    entry.meta.map(([id, rarity, legacy]) => [id, { rarity, legacy: !!legacy }])
  );
  return chromaInfoCache;
}

/** Chroma colors/parents and skin rarities from Community Dragon (cached 24h). */
export function ensureChromaInfo(): Promise<Map<number, ChromaInfo>> {
  if (chromaInfoCache) return Promise.resolve(chromaInfoCache);

  const cached = getCached<MetaCacheEntry>(META_CACHE_KEY);
  if (cached?.chromas && cached.meta && cached.art) return Promise.resolve(loadMeta(cached));
  if (metaInflight) return metaInflight;

  metaInflight = fetch(SKINS_JSON_URL)
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then(
      (
        data: Record<
          string,
          {
            id: number;
            rarity?: Rarity;
            isLegacy?: boolean;
            splashPath?: string;
            tilePath?: string;
            chromas?: { id: number; colors?: string[] }[];
          }
        >
      ) => {
        const entry: MetaCacheEntry = { chromas: [], meta: [], art: [] };
        for (const skin of Object.values(data)) {
          entry.meta.push([skin.id, skin.rarity ?? "kNoRarity", skin.isLegacy ? 1 : 0]);
          entry.art.push([skin.id, artPath(skin.splashPath), artPath(skin.tilePath)]);
          for (const c of skin.chromas ?? []) {
            entry.chromas.push([c.id, { colors: c.colors ?? [], parentId: skin.id }]);
          }
        }
        setCache(META_CACHE_KEY, entry);
        return loadMeta(entry);
      }
    )
    .catch(() => {
      const stale = getStale<MetaCacheEntry>(META_CACHE_KEY);
      if (stale?.chromas && stale.meta && stale.art) return loadMeta(stale);
      chromaInfoCache = new Map();
      skinMetaCache = new Map();
      skinArtCache = new Map();
      return chromaInfoCache;
    })
    .then((map) => {
      bumpDataVersion();
      return map;
    })
    .finally(() => {
      metaInflight = null;
    });
  return metaInflight;
}

// ---------------------------------------------------------------------------
// Display helpers. They read the current language; components re-render on
// language/data changes through useI18n().

/** Display name of a skin id in the current language, `fallback` (English) if unknown. */
export function skinNameById(id: string, fallback: string): string {
  const form = getForms()?.get(id);
  if (form) {
    const parentEn = skinIdsCache?.[form.parentId] ?? fallback;
    const parent = skinNameById(form.parentId, parentEn);
    return `${parent} (${getLang() === "pt" ? form.pt : form.en})`;
  }
  if (getLang() === "pt") return skinIdsPtCache?.[id] ?? fallback;
  return fallback;
}

export function skinDisplayName(skin: Skin): string {
  return skinNameById(skin.id, skin.name);
}

/** Display name of a downloaded skin (stored under its English name). */
export function downloadedDisplayName(championName: string, skinName: string): string {
  const id = lookupDownloadedSkinId(championName, skinName);
  return id ? skinNameById(id, skinName) : skinName;
}

/** Display name of a champion from its local folder name (base skin name). */
export function championFolderDisplayName(championName: string): string {
  if (getLang() !== "pt" || !skinIdsPtCache) return championName;
  ensureSkinIndexes();
  const key = champNameToKey?.get(championName);
  return key !== undefined ? (skinIdsPtCache[String(key * 1000)] ?? championName) : championName;
}

/** Label of a form alone ("Fire"/"Fogo"). */
export function formLabel(form: { formEn: string; formPt: string }): string {
  return getLang() === "pt" ? form.formPt : form.formEn;
}

/** What the base skin is called among its forms ("Light", "Form 1"). */
export function baseFormLabelOf(parentId: string): string {
  return baseFormLabel(parentId, getLang());
}

/** If a downloaded skin is a form package, its form info and the base skin's English name. */
export function lookupDownloadedForm(
  championName: string,
  skinName: string
): { form: FormInfo; parentName: string } | null {
  const id = lookupDownloadedSkinId(championName, skinName);
  const form = id ? getForms()?.get(id) : undefined;
  if (!form) return null;
  return { form, parentName: skinIdsCache?.[form.parentId] ?? skinName };
}

/** Rarity of a skin; chromas and forms take their base skin's. */
export function skinRarity(id: string): SkinMeta | null {
  if (!skinMetaCache) return null;
  const form = getForms()?.get(id);
  if (form) return skinRarity(form.parentId);
  const n = parseInt(id, 10);
  const own = skinMetaCache.get(n);
  if (own) return own;
  const chroma = chromaInfoCache?.get(n);
  return chroma ? (skinMetaCache.get(chroma.parentId) ?? null) : null;
}

/** Skin "types" to filter by: skins with forms, a rarity tier, or out-of-store (legacy). */
export const SKIN_TYPES = [
  "forms",
  "kTranscendent",
  "kExalted",
  "kUltimate",
  "kMythic",
  "kLegendary",
  "kEpic",
  "legacy",
] as const;
export type SkinType = (typeof SKIN_TYPES)[number];

/** Whether a base skin (by id) is of `type`. */
export function skinIsType(id: string, type: SkinType, hasForms: boolean): boolean {
  if (type === "forms") return hasForms;
  const meta = skinRarity(id);
  if (!meta) return false;
  return type === "legacy" ? meta.legacy : meta.rarity === type;
}

let champTypesCache: Map<number, Map<SkinType, number>> | null = null;
let champTypesFrom: unknown[] = [];

/** For each champion key: how many of its skins (in the repo) are of each type. */
export function championSkinTypes(): Map<number, Map<SkinType, number>> {
  const forms = getForms();
  const deps = [skinMetaCache, forms, repoZipsCache];
  if (champTypesCache && deps.every((d, i) => d === champTypesFrom[i])) return champTypesCache;
  const out = new Map<number, Map<SkinType, number>>();
  const bump = (champKey: number, type: SkinType) => {
    const m = out.get(champKey) ?? new Map<SkinType, number>();
    m.set(type, (m.get(type) ?? 0) + 1);
    out.set(champKey, m);
  };
  for (const [id, meta] of skinMetaCache ?? []) {
    if (id % 1000 === 0 || (repoZipsCache && !repoZipsCache.has(String(id)))) continue;
    const champKey = Math.floor(id / 1000);
    if ((SKIN_TYPES as readonly string[]).includes(meta.rarity))
      bump(champKey, meta.rarity as SkinType);
    if (meta.legacy) bump(champKey, "legacy");
  }
  const parents = new Set<string>();
  for (const f of forms?.values() ?? []) parents.add(f.parentId);
  for (const p of parents) bump(Math.floor(parseInt(p, 10) / 1000), "forms");
  champTypesCache = out;
  champTypesFrom = deps;
  return out;
}

/** The id whose art a skin uses: chromas and forms have none of their own. */
function artOwnerId(id: string): number {
  const form = getForms()?.get(id);
  if (form) return parseInt(form.parentId, 10);
  const n = parseInt(id, 10);
  return chromaInfoCache?.get(n)?.parentId ?? n;
}

function artUrl(id: string, which: 0 | 1): string | null {
  const path = skinArtCache?.get(artOwnerId(id))?.[which];
  return path ? CDRAGON_GAME_DATA + path : null;
}

/** Centered splash of a skin by id (Community Dragon), or null before skins.json loads. */
export function skinSplashUrlById(id: string): string | null {
  return artUrl(id, 0);
}

/** 380x380 tile art of a skin by id; the champion's default skin is `key * 1000`. */
export function skinTileUrlById(id: string): string | null {
  return artUrl(id, 1);
}

/** Warms the image cache with a champion's first splashes (e.g. on hover in the grid). */
export function prefetchChampionSplashes(champion: Champion, limit = 12): void {
  if (!skinIdsCache || !skinArtCache) return;
  const champKey = parseInt(champion.key, 10);
  let n = 0;
  for (const id of Object.keys(skinIdsCache)) {
    const numericId = parseInt(id, 10);
    if (Math.floor(numericId / 1000) !== champKey || numericId % 1000 === 0) continue;
    if (chromaInfoCache?.has(numericId)) continue;
    const url = skinSplashUrlById(id);
    if (!url) continue;
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    if (++n >= limit) break;
  }
}

// ---------------------------------------------------------------------------

export function getSkinsForChampion(champion: Champion, skinIds: Record<string, string>): Skin[] {
  const champKey = parseInt(champion.key, 10);
  const baseId = String(champKey * 1000);
  const championRepoName = skinIds[baseId] ?? champion.name;

  const skins: Skin[] = [];
  for (const [id, name] of Object.entries(skinIds)) {
    const numericId = parseInt(id, 10);
    const ownerKey = Math.floor(numericId / 1000);
    if (ownerKey !== champKey) continue;

    const num = numericId % 1000;
    if (num === 0) continue;

    // Skip chromas of the default skin (e.g. "Steel Blitzcrank") — not real,
    // applicable skins and they have no card to group under. See grouping below.
    const chromaInfo = chromaInfoCache?.get(numericId);
    if (chromaInfo && chromaInfo.parentId % 1000 === 0) continue;

    skins.push({
      id,
      num,
      name,
      championId: champion.id,
      championName: championRepoName,
    });
  }

  skins.sort((a, b) => a.num - b.num);
  return skins;
}

/** Form packages of a champion's skins, as downloadable skins. */
export function getFormsForChampion(
  champion: Champion,
  skinIds: Record<string, string>
): FormSkin[] {
  const forms = getForms();
  if (!forms) return [];
  const champKey = parseInt(champion.key, 10);
  const championRepoName = skinIds[String(champKey * 1000)] ?? champion.name;
  const out: FormSkin[] = [];
  for (const f of forms.values()) {
    if (Math.floor(parseInt(f.parentId, 10) / 1000) !== champKey) continue;
    out.push({
      id: f.id,
      num: parseInt(f.parentId, 10) % 1000, // forms have no splash of their own
      name: formEnglishName(f),
      championId: champion.id,
      championName: championRepoName,
      parentId: f.parentId,
      formEn: f.en,
      formPt: f.pt,
    });
  }
  out.sort((a, b) => parseInt(a.id, 10) - parseInt(b.id, 10));
  return out;
}

export function getSkinsGroupedForChampion(
  champion: Champion,
  skinIds: Record<string, string>
): SkinGroup[] {
  const flat = getSkinsForChampion(champion, skinIds);
  const groups = new Map<number, SkinGroup>();

  if (!chromaInfoCache || chromaInfoCache.size === 0) {
    for (const s of flat) groups.set(parseInt(s.id, 10), { base: s, chromas: [], forms: [] });
  } else {
    const byId = new Map<number, Skin>();
    for (const s of flat) byId.set(parseInt(s.id, 10), s);
    const orphans: Chroma[] = [];

    for (const s of flat) {
      const numericId = parseInt(s.id, 10);
      const chromaInfo = chromaInfoCache.get(numericId);

      if (!chromaInfo) {
        groups.set(numericId, { base: s, chromas: [], forms: [] });
        continue;
      }

      const parentSkin = byId.get(chromaInfo.parentId);
      const parentName = parentSkin?.name ?? s.name.replace(/\s+\([^)]+\)$/, "");
      const chroma: Chroma = { ...s, parentName, colors: chromaInfo.colors };

      const parentGroup = groups.get(chromaInfo.parentId);
      if (parentGroup) {
        parentGroup.chromas.push(chroma);
      } else {
        orphans.push(chroma);
      }
    }

    for (const c of orphans) {
      const info = chromaInfoCache.get(parseInt(c.id, 10));
      const g = info ? groups.get(info.parentId) : undefined;
      if (g) {
        g.chromas.push(c);
      } else {
        groups.set(parseInt(c.id, 10), { base: c, chromas: [], forms: [] });
      }
    }
  }

  for (const f of getFormsForChampion(champion, skinIds)) {
    groups.get(parseInt(f.parentId, 10))?.forms.push(f);
  }

  const result = [...groups.values()];
  result.sort((a, b) => a.base.num - b.base.num);
  for (const g of result) g.chromas.sort((a, b) => a.num - b.num);
  return result;
}

export function lookupChromaInfo(
  skinName: string
): { colors: string[]; parentName: string } | null {
  if (!skinIdsCache || !chromaInfoCache) return null;
  ensureSkinIndexes();

  const foundIdStr = skinNameToId!.get(skinName);
  if (foundIdStr === undefined) return null;

  const info = chromaInfoCache.get(parseInt(foundIdStr, 10));
  if (!info) return null;

  // skinIdsCache is already id→name, so the parent name is a direct lookup.
  const parentName = skinIdsCache[String(info.parentId)] ?? skinName.replace(/\s+\([^)]+\)$/, "");

  return { colors: info.colors, parentName };
}

/**
 * For a Skin object, return the splash num to use for DDragon images.
 * Chromas and forms don't have their own splash on DDragon - we resolve to the base skin's num.
 */
export function getSplashNum(skin: Skin): number {
  if (!skinIdsCache) return skin.num;

  const match = skin.name.match(/^(.+?)\s+\([^)]+\)$/);
  if (!match) return skin.num;

  ensureSkinIndexes();
  const champKey = Math.floor(parseInt(skin.id, 10) / 1000);
  const baseId = skinChampNameToId!.get(`${champKey}:${match[1]}`);
  return baseId !== undefined ? parseInt(baseId, 10) % 1000 : skin.num;
}

/**
 * For a skin name string, look up the splash num to use for DDragon images.
 * Resolves chromas and forms to their base skin's splash num.
 */
export function lookupSplashNum(skinName: string): number | null {
  if (!skinIdsCache) return null;
  ensureSkinIndexes();

  const foundId = skinNameToId!.get(skinName);
  if (foundId === undefined) return null;

  const champKey = Math.floor(parseInt(foundId, 10) / 1000);

  // Chroma or form ("BaseName (Variant)") resolves to its base skin's num.
  const match = skinName.match(/^(.+?)\s+\([^)]+\)$/);
  if (match) {
    const baseId = skinChampNameToId!.get(`${champKey}:${match[1]}`);
    if (baseId !== undefined) return parseInt(baseId, 10) % 1000;
  }

  return parseInt(foundId, 10) % 1000;
}

/**
 * Returns the exact download URL for a skin by looking up the repo tree.
 * Returns null if the skin doesn't exist in the repo.
 */
export function skinDownloadUrl(skin: Skin): string | null {
  return skinDownloadUrlById(skin.id);
}

export function isSkinAvailable(skin: Skin): boolean {
  if (!repoZipsCache) return true; // optimistic before tree loads
  return repoZipsCache.has(skin.id);
}

export function useSkinData(champion: Champion | null) {
  const { version } = useI18n(); // regroup once chroma/form data lands
  const [skinIds, setSkinIds] = useState<Record<string, string> | null>(skinIdsCache);
  const [treeReady, setTreeReady] = useState(!!repoZipsCache);
  const [skins, setSkins] = useState<Skin[]>([]);
  const [groups, setGroups] = useState<SkinGroup[]>([]);
  const [loading, setLoading] = useState(!skinIdsCache || !repoZipsCache);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void ensureChromaInfo();
    if (skinIdsCache && repoZipsCache) {
      setSkinIds(skinIdsCache);
      setTreeReady(true);
      setLoading(false);
      return;
    }

    Promise.all([ensureSkinIds(), ensureRepoZips()])
      .then(([ids]) => {
        setSkinIds(ids);
        setTreeReady(true);
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!champion || !skinIds) {
      setSkins([]);
      setGroups([]);
      return;
    }
    const grouped = getSkinsGroupedForChampion(champion, skinIds);
    setSkins([...getSkinsForChampion(champion, skinIds), ...grouped.flatMap((g) => g.forms)]);
    setGroups(grouped);
  }, [champion, skinIds, treeReady, version]);

  const getSkins = useCallback(
    (champ: Champion): Skin[] => {
      if (!skinIds) return [];
      return getSkinsForChampion(champ, skinIds);
    },
    [skinIds]
  );

  return { skins, groups, loading, error, getSkins };
}
