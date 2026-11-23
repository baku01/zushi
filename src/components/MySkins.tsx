import { useState, useEffect, useMemo } from "react";
import { Layers, Check, Info, X, Search, RefreshCw } from "lucide-react";
import { splashUrl, findChampionByName, championAvatar } from "../hooks/useChampions";
import {
  lookupSplashNum,
  lookupChromaInfo,
  lookupDownloadedForm,
  lookupDownloadedSkinId,
  ensureChromaInfo,
  downloadedDisplayName,
  championFolderDisplayName,
  baseFormLabelOf,
  skinSplashUrlById,
} from "../hooks/useSkinData";
import { skinKey } from "../hooks/useSkinUpdates";
import { useI18n, fold, getLang } from "../lib/i18n";
import RarityBadge from "./RarityBadge";
import ArtImage from "./ArtImage";
import type { DownloadedSkin } from "../types";
import type { FormInfo } from "../lib/forms";

function useChromaReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    ensureChromaInfo()
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return ready;
}

// base is null when the user only owns chromas/forms of this base.
type DownloadGroup = {
  base: DownloadedSkin | null;
  baseSkinName: string;
  baseId: string | null;
  chromas: { dl: DownloadedSkin; colors: string[] }[];
  forms: { dl: DownloadedSkin; form: FormInfo }[];
};

type Selection = Record<string, string>;

interface MySkinsProps {
  downloads: DownloadedSkin[];
  patcherActive: boolean;
  selection: Selection;
  onSelectionChange: (selection: Selection) => void;
  onDelete: (championName: string, skinName: string) => Promise<void>;
  outdatedKeys: Set<string>; // skinKey()s republished upstream since download
  updateCount: number;
  updating: boolean;
  onUpdateAll: () => void;
}

function SkinThumb({ championName, skinName }: { championName: string; skinName: string }) {
  const champ = findChampionByName(championName);
  const num = lookupSplashNum(skinName);
  const id = lookupDownloadedSkinId(championName, skinName);

  return (
    <>
      <div className="bg-charcoal-600 absolute inset-0" />
      <ArtImage
        srcs={[id && skinSplashUrlById(id), champ && num !== null ? splashUrl(champ.id, num) : null]}
        alt={skinName}
        className="relative h-full w-full object-cover object-[center_30%] group-hover/card:scale-[1.04]"
      />
    </>
  );
}

function ChampAvatar({ championName }: { championName: string }) {
  const [failed, setFailed] = useState(false);
  const champ = findChampionByName(championName);

  if (!champ || failed) {
    return (
      <div className="bg-charcoal-500 text-ink-muted flex h-9 w-9 items-center justify-center rounded text-[10px]">
        {championName.charAt(0)}
      </div>
    );
  }

  return (
    <img
      src={championAvatar(champ.id)}
      alt={championName}
      className="border-charcoal-50/30 h-9 w-9 rounded border object-cover"
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}

function swatchBackground(colors: string[]): string | undefined {
  return colors[1]
    ? `linear-gradient(135deg, ${colors[0]} 0% 50%, ${colors[1]} 50% 100%)`
    : colors[0];
}

export default function MySkins({
  downloads,
  patcherActive,
  selection,
  onSelectionChange,
  onDelete,
  outdatedKeys,
  updateCount,
  updating,
  onUpdateAll,
}: MySkinsProps) {
  const { t, lang, version } = useI18n();
  const chromaReady = useChromaReady(); // re-render once Community Dragon chroma data lands

  const toggleSkin = (championName: string, skinName: string) => {
    if (patcherActive) return;
    if (selection[championName] === skinName) {
      const next = { ...selection };
      delete next[championName];
      onSelectionChange(next);
    } else {
      onSelectionChange({ ...selection, [championName]: skinName });
    }
  };

  const handleDelete = async (championName: string, skinName: string) => {
    if (patcherActive) return;
    if (selection[championName] === skinName) {
      const next = { ...selection };
      delete next[championName];
      onSelectionChange(next);
    }
    await onDelete(championName, skinName);
  };

  const handleDeleteGroup = async (championName: string, skinNames: string[]) => {
    if (patcherActive || skinNames.length === 0) return;
    if (skinNames.includes(selection[championName])) {
      const next = { ...selection };
      delete next[championName];
      onSelectionChange(next);
    }
    await Promise.all(skinNames.map((n) => onDelete(championName, n)));
  };

  const selectedCount = Object.keys(selection).length;
  const [search, setSearch] = useState("");

  // Grouping scans the skin database per skin, so memoize it on downloads
  // (and data readiness) instead of rebuilding on every search/selection render.
  const grouped = useMemo(() => {
    void chromaReady;
    void version; // forms/names may land after the first render
    const map = new Map<string, DownloadGroup[]>();
    const groupFor = (champGroups: DownloadGroup[], baseSkinName: string) => {
      let g = champGroups.find((g) => g.baseSkinName === baseSkinName);
      if (!g) {
        g = { base: null, baseSkinName, baseId: null, chromas: [], forms: [] };
        champGroups.push(g);
      }
      return g;
    };
    for (const skin of downloads) {
      const champGroups = map.get(skin.champion_name) ?? [];
      const form = lookupDownloadedForm(skin.champion_name, skin.skin_name);
      const chromaInfo = form ? null : lookupChromaInfo(skin.skin_name);
      if (form) {
        const g = groupFor(champGroups, form.parentName);
        g.baseId = form.form.parentId;
        g.forms.push({ dl: skin, form: form.form });
      } else if (chromaInfo) {
        groupFor(champGroups, chromaInfo.parentName).chromas.push({
          dl: skin,
          colors: chromaInfo.colors,
        });
      } else {
        const g = groupFor(champGroups, skin.skin_name);
        g.base = skin;
        g.baseId = lookupDownloadedSkinId(skin.champion_name, skin.skin_name);
      }
      map.set(skin.champion_name, champGroups);
    }
    for (const [champion, groups] of map) {
      for (const g of groups) {
        g.forms.sort((a, b) => Number(a.form.id) - Number(b.form.id));
        // Groups holding only chromas still need the base id, for its rarity.
        g.baseId ??= lookupDownloadedSkinId(champion, g.baseSkinName);
      }
    }
    return map;
  }, [downloads, chromaReady, version]);

  const filteredEntries = useMemo(() => {
    void version;
    const locale = lang === "pt" ? "pt-BR" : "en";
    const entries = [...grouped.entries()].map(
      ([champion, groups]) => [champion, groups, championFolderDisplayName(champion)] as const
    );
    entries.sort((a, b) => a[2].localeCompare(b[2], locale));
    const query = fold(search.trim());
    return query
      ? entries.filter(([champion, , display]) => fold(champion).includes(query) || fold(display).includes(query))
      : entries;
  }, [grouped, search, lang, version]);

  if (downloads.length === 0) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-border flex shrink-0 items-center border-b px-4 py-3">
          <span className="text-ink-muted text-sm select-none">{t("my.skins", { n: 0 })}</span>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <div className="bg-charcoal-300 flex h-12 w-12 items-center justify-center rounded-full">
            <Layers size={20} strokeWidth={1.5} className="text-ink-muted" />
          </div>
          <div>
            <p className="text-ink-secondary text-sm">{t("my.empty")}</p>
            <p className="text-ink-muted mt-1 text-xs">{t("my.emptyHint")}</p>
          </div>
        </div>
      </div>
    );
  }

  let baseSkinCount = 0;
  for (const groups of grouped.values()) baseSkinCount += groups.length;

  return (
    <div className="flex h-full flex-col">
      <div data-tauri-drag-region className="border-border flex shrink-0 items-center gap-3 border-b px-4 py-2.5">
        <span className="text-ink-muted text-sm tabular-nums select-none">
          {t("my.skins", { n: baseSkinCount })}
        </span>

        <div className="relative w-60">
          <Search
            size={14}
            strokeWidth={1.5}
            className="text-ink-muted pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("my.filter")}
            spellCheck={false}
            className="bg-charcoal-500 border-border text-ink placeholder:text-ink-muted focus:border-gold-500/60 w-full rounded-sm border py-1.5 pr-3 pl-8 text-sm transition-colors focus:outline-none"
          />
        </div>

        <div className="ml-auto flex items-center gap-3">
          {updateCount > 0 && (
            <button
              onClick={onUpdateAll}
              disabled={updating}
              title={t("my.updateTip")}
              className={[
                "border-gold-400/40 text-gold-400 flex items-center gap-1.5 rounded-sm border px-2.5 py-1 text-xs font-medium tabular-nums transition-colors select-none",
                updating ? "cursor-default opacity-60" : "hover:bg-gold-400/10 cursor-pointer",
              ].join(" ")}
            >
              <RefreshCw size={12} strokeWidth={2} className={updating ? "animate-spin" : ""} />
              {updating ? t("my.updating") : t("my.update", { n: updateCount })}
            </button>
          )}
          {selectedCount > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-gold-400 text-sm font-medium tabular-nums select-none">
                {t("my.selected", { n: selectedCount })}
              </span>
              {!patcherActive && (
                <button
                  onClick={() => onSelectionChange({})}
                  title={t("my.clearSelection")}
                  className="text-ink-muted hover:text-ink hover:bg-charcoal-300 flex h-6 w-6 cursor-pointer items-center justify-center rounded-sm transition-colors"
                >
                  <X size={13} strokeWidth={2} />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="bg-gold-400/8 border-gold-400/15 mx-4 mt-3 mb-1 flex items-start gap-2.5 rounded-lg border px-3 py-2">
        <Info size={14} strokeWidth={1.5} className="text-gold-400 mt-0.5 shrink-0" />
        <p className="text-ink-secondary text-xs leading-relaxed">
          <span className="text-gold-400 font-medium">{t("my.tipTitle")}</span> {t("my.tipBody")}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col">
          {filteredEntries.length === 0 && (
            <div className="text-ink-muted flex h-32 items-center justify-center text-sm">
              {t("my.noMatch", { q: search })}
            </div>
          )}
          {filteredEntries.map(([champion, groups, displayChampion]) => {
            const selectedSkin = selection[champion];
            return (
              <div key={champion} className="border-border flex items-start gap-4 border-b px-4 py-3">
                <div className="flex w-36 shrink-0 items-center gap-2.5 pt-0.5">
                  <ChampAvatar championName={champion} />
                  <div className="min-w-0">
                    <p className="text-ink truncate text-sm font-medium">{displayChampion}</p>
                    <p className="text-ink-muted truncate text-[11px]">
                      {t("my.skins", { n: groups.length })}
                    </p>
                  </div>
                </div>

                <div className="flex min-w-0 flex-1 flex-wrap gap-3">
                  {groups.map((group) => (
                    <SkinTile
                      key={group.baseSkinName}
                      champion={champion}
                      group={group}
                      selectedSkin={selectedSkin}
                      patcherActive={patcherActive}
                      outdatedKeys={outdatedKeys}
                      onToggle={toggleSkin}
                      onDelete={handleDelete}
                      onDeleteGroup={handleDeleteGroup}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SkinTile({
  champion,
  group,
  selectedSkin,
  patcherActive,
  outdatedKeys,
  onToggle,
  onDelete,
  onDeleteGroup,
}: {
  champion: string;
  group: DownloadGroup;
  selectedSkin: string | undefined;
  patcherActive: boolean;
  outdatedKeys: Set<string>;
  onToggle: (championName: string, skinName: string) => void;
  onDelete: (championName: string, skinName: string) => void;
  onDeleteGroup: (championName: string, skinNames: string[]) => void;
}) {
  const { t } = useI18n();
  const baseSelected = selectedSkin === group.baseSkinName;
  const selectedChroma = group.chromas.find((c) => c.dl.skin_name === selectedSkin);
  const selectedForm = group.forms.find((f) => f.dl.skin_name === selectedSkin);
  const anySelected = baseSelected || !!selectedChroma || !!selectedForm;
  const baseClickable = !patcherActive && group.base !== null;
  const hasVariants = group.chromas.length > 0 || group.forms.length > 0;

  const isOutdated = (dl: DownloadedSkin) => outdatedKeys.has(skinKey(dl.champion_name, dl.skin_name));
  const baseOutdated = !!group.base && isOutdated(group.base);
  const outdatedVariants =
    group.chromas.filter((c) => isOutdated(c.dl)).length +
    group.forms.filter((f) => isOutdated(f.dl)).length;

  const displayName = downloadedDisplayName(champion, group.baseSkinName);
  const formLabelOf = (f: FormInfo) => (getLang() === "pt" ? f.pt : f.en);
  const baseLabel = group.baseId ? baseFormLabelOf(group.baseId) : displayName;

  const allNames = [
    ...(group.base ? [group.base.skin_name] : []),
    ...group.chromas.map((c) => c.dl.skin_name),
    ...group.forms.map((f) => f.dl.skin_name),
  ];

  const pillClass = (selected: boolean) =>
    [
      "flex h-5 items-center gap-1 rounded-sm border px-1.5 text-[10px] leading-none transition-colors",
      patcherActive ? "cursor-default opacity-50" : "cursor-pointer",
      selected
        ? "border-gold-400 bg-gold-400/15 text-gold-300"
        : "border-charcoal-50/30 text-ink-secondary hover:border-charcoal-50/60 hover:text-ink",
    ].join(" ");

  return (
    <div
      className={[
        "group/card flex w-44 flex-col gap-1.5",
        hasVariants ? "bg-charcoal-500/70 border-charcoal-300/25 rounded-md border p-1.5" : "",
      ].join(" ")}
    >
      <div className="relative">
        <button
          onClick={() => baseClickable && group.base && onToggle(group.base.champion_name, group.base.skin_name)}
          disabled={!baseClickable}
          className={[
            "relative block aspect-video w-full overflow-hidden rounded transition-all",
            patcherActive ? "cursor-default opacity-50" : group.base ? "cursor-pointer" : "cursor-default",
            anySelected
              ? "ring-gold-400 ring-offset-charcoal-400 ring-2 ring-offset-1"
              : "ring-charcoal-50/20 hover:ring-charcoal-50/40 ring-1",
            !group.base && "opacity-70",
          ]
            .filter(Boolean)
            .join(" ")}
          title={group.base ? displayName : t("my.baseMissing", { name: displayName })}
        >
          <SkinThumb championName={champion} skinName={group.baseSkinName} />

          {baseSelected && (
            <div className="bg-gold-400 absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full border border-white/30 shadow-sm">
              <Check size={11} strokeWidth={3} className="text-charcoal-600" />
            </div>
          )}
          {selectedChroma && (
            <div
              className="absolute top-1 right-1 h-5 w-5 rounded-full border-2 border-white shadow-sm"
              style={{ background: swatchBackground(selectedChroma.colors) ?? "var(--color-gold-400)" }}
            />
          )}
          {selectedForm && (
            <div className="bg-gold-400 text-charcoal-600 absolute top-1 right-1 flex h-5 items-center gap-1 rounded-full border border-white/30 px-1.5 text-[10px] font-semibold shadow-sm">
              <Check size={10} strokeWidth={3} />
              {formLabelOf(selectedForm.form)}
            </div>
          )}

          {(baseOutdated || outdatedVariants > 0) && (
            <div
              className="bg-charcoal-600/90 text-gold-400 absolute right-1 bottom-1 z-10 flex h-4 w-4 items-center justify-center rounded-full shadow-sm"
              title={baseOutdated ? t("my.updateAvailable") : t("my.variantUpdates", { n: outdatedVariants })}
            >
              <RefreshCw size={9} strokeWidth={2.5} />
            </div>
          )}

          <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/85 via-black/45 to-transparent px-1.5 pt-5 pb-1 text-left">
            <p className="line-clamp-2 pr-4 text-[10.5px] leading-tight font-medium text-white/95">
              {displayName}
            </p>
          </div>
        </button>

        {!patcherActive && allNames.length > 0 && (
          <button
            onClick={() => onDeleteGroup(champion, allNames)}
            className="bg-charcoal-500/90 hover:bg-error text-ink-muted absolute top-1 left-1 flex h-5 w-5 cursor-pointer items-center justify-center rounded-full opacity-0 shadow transition-all group-hover/card:opacity-100 hover:text-white"
            title={hasVariants ? t("my.deleteGroup") : t("my.delete")}
          >
            <X size={10} strokeWidth={2.5} />
          </button>
        )}
      </div>

      {group.baseId && <RarityBadge skinId={group.baseId} className="px-0.5" />}

      {group.forms.length > 0 && (
        <div className="flex flex-wrap gap-1" title={t("my.formTip")}>
          {group.base && (
            <button
              onClick={() => onToggle(group.base!.champion_name, group.base!.skin_name)}
              disabled={patcherActive}
              className={pillClass(baseSelected)}
            >
              {baseSelected && <Check size={9} strokeWidth={3} />}
              {baseLabel}
            </button>
          )}
          {group.forms.map((f) => {
            const isSel = selectedSkin === f.dl.skin_name;
            return (
              <button
                key={f.dl.skin_name}
                onClick={() => onToggle(f.dl.champion_name, f.dl.skin_name)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  onDelete(f.dl.champion_name, f.dl.skin_name);
                }}
                disabled={patcherActive}
                title={`${downloadedDisplayName(f.dl.champion_name, f.dl.skin_name)}\n(${t("my.rightClickDelete")})`}
                className={pillClass(isSel)}
              >
                {isSel && <Check size={9} strokeWidth={3} />}
                {formLabelOf(f.form)}
              </button>
            );
          })}
        </div>
      )}

      {group.chromas.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          {group.chromas.map((c) => {
            const isSel = selectedSkin === c.dl.skin_name;
            return (
              <button
                key={c.dl.skin_name}
                onClick={() => onToggle(c.dl.champion_name, c.dl.skin_name)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  onDelete(c.dl.champion_name, c.dl.skin_name);
                }}
                disabled={patcherActive}
                title={`${downloadedDisplayName(c.dl.champion_name, c.dl.skin_name)}\n(${t("my.rightClickDelete")})`}
                className={[
                  "ring-offset-charcoal-400 relative h-4 w-4 shrink-0 rounded-sm transition-all",
                  patcherActive ? "cursor-default opacity-50" : "cursor-pointer",
                  isSel
                    ? "ring-gold-400 ring-2 ring-offset-1"
                    : "ring-charcoal-50/30 hover:ring-charcoal-50/60 ring-1",
                ].join(" ")}
                style={{ background: swatchBackground(c.colors) ?? "var(--color-charcoal-300)" }}
              >
                {isSel && (
                  <Check size={9} strokeWidth={3} className="absolute inset-0 m-auto text-white drop-shadow" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
