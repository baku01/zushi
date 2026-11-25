import { useState, useEffect, useCallback, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  listDownloadedSkins,
  downloadSkin as downloadSkinCmd,
  downloadMultipleSkins,
  deleteDownloadedSkins as deleteCmd,
  clearAllSkins as clearAllCmd,
} from "../lib/commands";
import type { DownloadedSkin } from "../types";

interface QueueItem {
  url: string;
  championName: string;
  skinName: string;
}

interface DownloadProgress {
  current: number;
  total: number;
  skinName: string;
}

export interface SkinRef {
  championName: string;
  skinName: string;
}

export function useDownloads() {
  const [downloads, setDownloads] = useState<DownloadedSkin[]>([]);
  // False until the first listing lands, so nothing treats "not loaded yet" as "empty".
  const [ready, setReady] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  // Listings run concurrently on the backend and can finish out of order: only the
  // latest request may write state, or a stale list brings deleted skins back.
  const listSeq = useRef(0);

  const refresh = useCallback(async () => {
    const seq = ++listSeq.current;
    try {
      const list = await listDownloadedSkins();
      if (seq === listSeq.current) {
        setDownloads(list);
        setReady(true);
      }
    } catch {
      // Keep the last known list; `ready` stays false until a listing really succeeds.
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const isDownloaded = useCallback(
    (championName: string, skinName: string): boolean => {
      return downloads.some((d) => d.champion_name === championName && d.skin_name === skinName);
    },
    [downloads]
  );

  const download = useCallback(
    async (url: string, championName: string, skinName: string) => {
      if (busy.current) return;
      busy.current = true;
      const key = `${championName}/${skinName}`;
      setDownloading(key);
      setError(null);
      try {
        await downloadSkinCmd(url, championName, skinName);
      } catch (err) {
        setError(String(err));
      }
      setDownloading(null);
      busy.current = false;
      await refresh();
    },
    [refresh]
  );

  const downloadMultiple = useCallback(
    async (items: QueueItem[]) => {
      if (busy.current || items.length === 0) return;
      busy.current = true;
      setDownloading("batch");
      setError(null);

      const unlisten = await listen<DownloadProgress>("download-progress", (event) => {
        setDownloading(
          `${event.payload.skinName} (${event.payload.current}/${event.payload.total})`
        );
      });

      try {
        await downloadMultipleSkins(items);
      } catch (err) {
        setError(String(err));
      }

      unlisten();
      setDownloading(null);
      busy.current = false;
      await refresh();
    },
    [refresh]
  );

  /**
   * Deletes skins: they leave the list at once and the disk catches up behind it.
   * One backend call and one listing, however many skins; on failure the listing
   * restores whatever is really still there.
   */
  const deleteSkins = useCallback(
    async (items: SkinRef[]): Promise<boolean> => {
      if (items.length === 0) return false;
      setError(null);
      const gone = new Set(items.map((i) => `${i.championName}\u0000${i.skinName}`));
      setDownloads((prev) => prev.filter((d) => !gone.has(`${d.champion_name}\u0000${d.skin_name}`)));
      let ok = true;
      try {
        await deleteCmd(items);
      } catch (err) {
        ok = false;
        setError(String(err));
      }
      await refresh();
      return ok;
    },
    [refresh]
  );

  const clearAll = useCallback(async () => {
    setError(null);
    try {
      await clearAllCmd();
    } catch (err) {
      setError(String(err));
    }
    await refresh();
  }, [refresh]);

  const clearError = useCallback(() => setError(null), []);

  return {
    downloads,
    ready,
    downloading,
    error,
    isDownloaded,
    download,
    downloadMultiple,
    deleteSkins,
    clearAll,
    clearError,
    refresh,
  };
}
