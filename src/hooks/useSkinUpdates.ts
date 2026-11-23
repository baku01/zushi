import { useState, useEffect, useMemo, useCallback } from "react";
import {
  ensureSkinIds,
  ensureRepoZips,
  lookupDownloadedSkinId,
  repoSkinSha,
  skinDownloadUrlById,
} from "./useSkinData";
import type { DownloadedSkin } from "../types";

export interface SkinUpdateItem {
  url: string;
  championName: string;
  skinName: string;
}

export const skinKey = (championName: string, skinName: string) => `${championName}/${skinName}`;

/**
 * Downloaded skins whose package was republished in the LeagueSkins repo since
 * they were downloaded (e.g. "Fix skin sounds for Patch 16.23"), found by
 * comparing each zip's git blob sha with the sha the repo tree lists for it.
 */
export function findOutdated(downloads: DownloadedSkin[]): SkinUpdateItem[] {
  const items: SkinUpdateItem[] = [];
  for (const d of downloads) {
    if (!d.blob_sha) continue;
    const id = lookupDownloadedSkinId(d.champion_name, d.skin_name);
    if (!id) continue;
    const sha = repoSkinSha(id);
    const url = skinDownloadUrlById(id);
    if (!sha || !url || sha === d.blob_sha) continue;
    items.push({ url, championName: d.champion_name, skinName: d.skin_name });
  }
  return items;
}

export function useSkinUpdates(
  downloads: DownloadedSkin[],
  downloadMultiple: (items: SkinUpdateItem[]) => Promise<void>
) {
  // Bumped whenever the repo tree (re)loads, so the comparison reruns.
  const [treeVersion, setTreeVersion] = useState(0);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([ensureSkinIds(), ensureRepoZips()])
      .then(() => {
        if (!cancelled) setTreeVersion((v) => v + 1);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const outdated = useMemo(() => {
    void treeVersion;
    return findOutdated(downloads);
  }, [downloads, treeVersion]);

  const outdatedKeys = useMemo(
    () => new Set(outdated.map((i) => skinKey(i.championName, i.skinName))),
    [outdated]
  );

  const updateAll = useCallback(async () => {
    if (updating || outdated.length === 0) return;
    setUpdating(true);
    try {
      // The tree is cached for 24h: refresh it first so a skin republished
      // again since then is fetched at its newest version and not re-flagged.
      await ensureRepoZips(true).catch(() => {});
      setTreeVersion((v) => v + 1);
      const items = findOutdated(downloads);
      if (items.length > 0) await downloadMultiple(items);
    } finally {
      setUpdating(false);
    }
  }, [updating, outdated.length, downloads, downloadMultiple]);

  return { outdated, outdatedKeys, updating, updateAll };
}
