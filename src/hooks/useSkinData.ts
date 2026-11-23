import { useState, useEffect, useCallback } from "react";
import { getCached, getStale, setCache } from "../lib/cache";
import type { Champion, Skin, Chroma, SkinGroup } from "../types";

const SKIN_IDS_URL =
  "https://raw.githubusercontent.com/Alban1911/LeagueSkins/main/resources/en/skin_ids.json";
const TREE_API_URL =
  "https://api.github.com/repos/Alban1911/LeagueSkins/git/trees/main?recursive=1";
const SKINS_JSON_URL =
  "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/skins.json";

const SKIN_IDS_CACHE_KEY = "zushi:skin_ids";
// _v2 invalidated the stale name-based cache from older builds; _v3 adds each
// file's git blob sha, used to spot skins republished upstream.
const REPO_ZIPS_CACHE_KEY = "zushi:repo_files_v3";
const CHROMAS_CACHE_KEY = "zushi:chromas";

let skinIdsCache: Record<string, string> | null = null;
let repoZipsCache: Map<string, string> | null = null;
// skin id -> git blob sha of its package in the repo tree
let repoShaCache: Map<string, string> | null = null;
let repoZipsInflight: Promise<Map<string, string>> | null = null;
let chromaInfoCache: Map<number, { colors: string[]; parentId: number }> | null = null;

// Reverse indices over skinIdsCache so name-based lookups are O(1) instead of
// scanning all ~9k entries on every call (My Skins does this per skin, per render).
let skinNameToId: Map<string, string> | null = null;
let skinChampNameToId: Map<string, string> | null = null;
// base skin name ("Jax", the local champion folder name) -> champion key
let champNameToKey: Map<string, number> | null = null;
let indexedFrom: Record<string, string> | null = null;

function ensureSkinIndexes(): void {
  if (!skinIdsCache) return;
  if (indexedFrom === skinIdsCache && skinNameToId) return;
  const nameToId = new Map<string, string>();
  const champNameToId = new Map<string, string>();
  const champToKey = new Map<string, number>();
  for (const [id, name] of Object.entries(skinIdsCache)) {
    if (!nameToId.has(name)) nameToId.set(name, id);
    const numericId = parseInt(id, 10);
    const champKey = Math.floor(numericId / 1000);
    const key = `${champKey}:${name}`;
    if (!champNameToId.has(key)) champNameToId.set(key, id);
    if (numericId % 1000 === 0 && !champToKey.has(name)) champToKey.set(name, champKey);
  }
  skinNameToId = nameToId;
  skinChampNameToId = champNameToId;
  champNameToKey = champToKey;
  indexedFrom = skinIdsCache;
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

export function ensureChromaInfo(): Promise<Map<number, { colors: string[]; parentId: number }>> {
  if (chromaInfoCache) return Promise.resolve(chromaInfoCache);

  const cached = getCached<[number, { colors: string[]; parentId: number }][]>(CHROMAS_CACHE_KEY);
  if (cached) {
    chromaInfoCache = new Map(cached);
    return Promise.resolve(chromaInfoCache);
  }

  return fetch(SKINS_JSON_URL)
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then((data: Record<string, { id: number; chromas?: { id: number; colors?: string[] }[] }>) => {
      const map = new Map<number, { colors: string[]; parentId: number }>();
      for (const [, skin] of Object.entries(data)) {
        if (!skin.chromas) continue;
        for (const c of skin.chromas) {
          map.set(c.id, { colors: c.colors ?? [], parentId: skin.id });
        }
      }
      chromaInfoCache = map;
      setCache(CHROMAS_CACHE_KEY, [...map.entries()]);
      return map;
    })
    .catch(() => {
      chromaInfoCache = new Map();
      return chromaInfoCache;
    });
}

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

export function getSkinsGroupedForChampion(
  champion: Champion,
  skinIds: Record<string, string>
): SkinGroup[] {
  const flat = getSkinsForChampion(champion, skinIds);
  if (!chromaInfoCache || chromaInfoCache.size === 0) {
    return flat.map((s) => ({ base: s, chromas: [] }));
  }

  const byId = new Map<number, Skin>();
  for (const s of flat) byId.set(parseInt(s.id, 10), s);

  const groups = new Map<number, SkinGroup>();
  const orphans: Chroma[] = [];

  for (const s of flat) {
    const numericId = parseInt(s.id, 10);
    const chromaInfo = chromaInfoCache.get(numericId);

    if (!chromaInfo) {
      groups.set(numericId, { base: s, chromas: [] });
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
      groups.set(parseInt(c.id, 10), { base: c, chromas: [] });
    }
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
 * Chromas don't have their own splash on DDragon - we resolve to the base skin's num.
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
 * Resolves chromas to their base skin's splash num.
 */
export function lookupSplashNum(skinName: string): number | null {
  if (!skinIdsCache) return null;
  ensureSkinIndexes();

  const foundId = skinNameToId!.get(skinName);
  if (foundId === undefined) return null;

  const champKey = Math.floor(parseInt(foundId, 10) / 1000);

  // Chroma ("BaseName (Variant)") resolves to its base skin's num.
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
  const [skinIds, setSkinIds] = useState<Record<string, string> | null>(skinIdsCache);
  const [skins, setSkins] = useState<Skin[]>([]);
  const [groups, setGroups] = useState<SkinGroup[]>([]);
  const [loading, setLoading] = useState(!skinIdsCache || !repoZipsCache);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (skinIdsCache && repoZipsCache) {
      setSkinIds(skinIdsCache);
      setLoading(false);
      void ensureChromaInfo();
      return;
    }

    void ensureChromaInfo();
    Promise.all([ensureSkinIds(), ensureRepoZips()])
      .then(([ids]) => {
        setSkinIds(ids);
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
    setSkins(getSkinsForChampion(champion, skinIds));
    setGroups(getSkinsGroupedForChampion(champion, skinIds));
  }, [champion, skinIds]);

  const getSkins = useCallback(
    (champ: Champion): Skin[] => {
      if (!skinIds) return [];
      return getSkinsForChampion(champ, skinIds);
    },
    [skinIds]
  );

  return { skins, groups, loading, error, getSkins };
}
