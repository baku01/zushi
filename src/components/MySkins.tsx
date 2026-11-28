import {
  memo,
  useState,
  useEffect,
  useMemo,
  useCallback,
  type Dispatch,
  type SetStateAction,
  type MouseEvent,
} from "react";
import {
  Layers,
  Check,
  Info,
  X,
  Search,
  RefreshCw,
  Trash2,
  MoreHorizontal,
} from "lucide-react";
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
import { FormPreview, FormThumb } from "./FormPreview";
import ContextMenu, { type ContextMenuItem } from "./ContextMenu";
import ConfirmDialog from "./ConfirmDialog";
import { formIcon } from "../lib/forms";
import type { DownloadedSkin } from "../types";
import type { SkinRef } from "../hooks/useDownloads";
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

type PendingDelete = {
  champion: string;
  previewSkinName: string;
  skinNames: string[];
  title: string;
  description: string;
};

type OpenMenuState = {
  x: number;
  y: number;
  cardKey: string;
  items: ContextMenuItem[];
};

interface MySkinsProps {
  downloads: DownloadedSkin[];
  patcherActive: boolean;
  selection: Selection;
  onSelectionChange: Dispatch<SetStateAction<Selection>>;
  /** Removes skins from disk; the list updates at once and the selection is pruned by the app. */
  onDelete: (items: SkinRef[]) => Promise<void>;
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
        srcs={[
          id && skinSplashUrlById(id),
          champ && num !== null ? splashUrl(champ.id, num) : null,
        ]}
        alt={skinName}
        className="relative h-full w-full object-cover object-[center_30%] group-hover/card:scale-[1.03]"
      />
    </>
  );
}

function ChampAvatar({ championName }: { championName: string }) {
  const [failed, setFailed] = useState(false);
  const champ = findChampionByName(championName);

  if (!champ || failed) {
    return (
      <div className="bg-charcoal-500 text-ink-muted flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.08] text-[11px] font-medium">
        {championName.charAt(0)}
      </div>
    );
  }

  return (
    <img
      src={championAvatar(champ.id)}
      alt={championName}
      className="h-9 w-9 rounded-lg border border-white/[0.1] object-cover shadow-sm"
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

  const [menu, setMenu] = useState<OpenMenuState | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);

  // Stable identities (functional updates, no captured `selection`) so the memoized
  // rows and tiles below don't re-render every time the selection or search changes.
  const toggleSkin = useCallback(
    (championName: string, skinName: string) => {
      if (patcherActive) return;
      onSelectionChange((prev) => {
        if (prev[championName] === skinName) {
          const next = { ...prev };
          delete next[championName];
          return next;
        }
        return { ...prev, [championName]: skinName };
      });
    },
    [patcherActive, onSelectionChange]
  );

  const requestDelete = useCallback(
    (req: PendingDelete) => {
      if (patcherActive || req.skinNames.length === 0) return;
      setPendingDelete(req);
    },
    [patcherActive]
  );

  const confirmDelete = useCallback(() => {
    if (!pendingDelete) return;
    const { champion, skinNames } = pendingDelete;
    setPendingDelete(null);
    void onDelete(skinNames.map((skinName) => ({ championName: champion, skinName })));
  }, [pendingDelete, onDelete]);

  const openMenu = useCallback((next: OpenMenuState) => {
    setMenu(next);
  }, []);

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
      ? entries.filter(
          ([champion, , display]) => fold(champion).includes(query) || fold(display).includes(query)
        )
      : entries;
  }, [grouped, search, lang, version]);

  if (downloads.length === 0) {
    return (
      <div className="flex h-full flex-col">
        <div
          data-tauri-drag-region
          className="border-border flex h-[52px] shrink-0 items-center border-b px-4"
        >
          <span className="text-ink-muted text-[13px] select-none">{t("my.skins", { n: 0 })}</span>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <div className="mac-surface flex h-12 w-12 items-center justify-center rounded-2xl">
            <Layers size={20} strokeWidth={1.5} className="text-ink-muted" />
          </div>
          <div>
            <p className="text-ink text-sm font-medium">{t("my.empty")}</p>
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
      <div
        data-tauri-drag-region
        className="border-border flex h-[52px] shrink-0 items-center gap-3 border-b px-4"
      >
        <div className="relative w-60">
          <Search
            size={13.5}
            strokeWidth={1.75}
            className="text-ink-muted pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("my.filter")}
            spellCheck={false}
            className="mac-input text-ink placeholder:text-ink-muted h-8 w-full rounded-lg pr-7 pl-8 text-[13px] transition-all focus:outline-none"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="text-ink-muted hover:text-ink absolute top-1/2 right-2 -translate-y-1/2 cursor-default rounded-full p-0.5 hover:bg-white/10"
              aria-label="Clear search"
            >
              <X size={12} strokeWidth={2.2} />
            </button>
          )}
        </div>

        <span className="text-ink-muted text-xs tabular-nums select-none">
          {t("my.skins", { n: baseSkinCount })}
        </span>

        <div className="ml-auto flex items-center gap-2.5">
          {updateCount > 0 && (
            <button
              onClick={onUpdateAll}
              disabled={updating}
              title={t("my.updateTip")}
              className={[
                "border-gold-400/35 bg-gold-400/10 text-gold-300 flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium tabular-nums transition-colors select-none",
                updating ? "cursor-default opacity-60" : "hover:bg-gold-400/18 cursor-default",
              ].join(" ")}
            >
              <RefreshCw size={12} strokeWidth={2} className={updating ? "animate-spin" : ""} />
              {updating ? t("my.updating") : t("my.update", { n: updateCount })}
            </button>
          )}
          {selectedCount > 0 && (
            <div className="border-gold-400/25 bg-gold-400/10 flex h-7 items-center gap-1.5 rounded-lg border pr-1 pl-2.5">
              <span className="text-gold-300 text-xs font-medium tabular-nums select-none">
                {t("my.selected", { n: selectedCount })}
              </span>
              {!patcherActive && (
                <button
                  onClick={() => onSelectionChange({})}
                  title={t("my.clearSelection")}
                  className="text-gold-300/75 hover:text-gold-100 hover:bg-gold-400/20 flex h-5 w-5 cursor-default items-center justify-center rounded-md transition-colors"
                >
                  <X size={12} strokeWidth={2.2} />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="border-gold-400/15 bg-gold-400/[0.06] mx-4 mt-3 mb-1 flex items-center gap-2.5 rounded-[10px] border px-3 py-2">
        <Info size={14} strokeWidth={1.75} className="text-gold-400 shrink-0" />
        <p className="text-ink-secondary text-xs leading-relaxed">
          <span className="text-gold-300 font-medium">{t("my.tipTitle")}</span> {t("my.tipBody")}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col">
          {filteredEntries.length === 0 && (
            <div className="text-ink-muted flex h-32 items-center justify-center text-sm">
              {t("my.noMatch", { q: search })}
            </div>
          )}
          {filteredEntries.map(([champion, groups, displayChampion]) => (
            <ChampionRow
              key={champion}
              champion={champion}
              groups={groups}
              displayName={displayChampion}
              selectedSkin={selection[champion]}
              patcherActive={patcherActive}
              outdatedKeys={outdatedKeys}
              activeMenuCardKey={
                menu?.cardKey.startsWith(`${champion}\u0000`) ? menu.cardKey : null
              }
              version={version}
              onToggle={toggleSkin}
              onRequestDelete={requestDelete}
              onOpenMenu={openMenu}
            />
          ))}
        </div>
      </div>

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}

      {pendingDelete && (
        <ConfirmDialog
          title={pendingDelete.title}
          description={pendingDelete.description}
          confirmLabel={t("common.delete")}
          cancelLabel={t("common.cancel")}
          preview={
            <div className="bg-charcoal-600 relative aspect-video w-36 overflow-hidden rounded-lg border border-white/15 shadow-lg">
              <SkinThumb
                championName={pendingDelete.champion}
                skinName={pendingDelete.previewSkinName}
              />
            </div>
          }
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}

const ChampionRow = memo(function ChampionRow({
  champion,
  groups,
  displayName,
  selectedSkin,
  patcherActive,
  outdatedKeys,
  activeMenuCardKey,
  onToggle,
  onRequestDelete,
  onOpenMenu,
}: {
  champion: string;
  groups: DownloadGroup[];
  displayName: string;
  selectedSkin: string | undefined;
  patcherActive: boolean;
  outdatedKeys: Set<string>;
  activeMenuCardKey: string | null;
  /** Data version: names and art resolve as metadata loads, so a bump must re-render. */
  version: number;
  onToggle: (championName: string, skinName: string) => void;
  onRequestDelete: (req: PendingDelete) => void;
  onOpenMenu: (menu: OpenMenuState) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="border-border cv-auto flex items-start gap-4 border-b px-4 py-3.5">
      <div className="flex w-40 shrink-0 items-center gap-2.5 pt-1">
        <ChampAvatar championName={champion} />
        <div className="min-w-0">
          <p className="text-ink truncate text-[13px] font-medium">{displayName}</p>
          <div className="mt-0.5 flex items-center gap-1.5">
            {selectedSkin && <span className="bg-gold-400 h-1.5 w-1.5 shrink-0 rounded-full" />}
            <p className="text-ink-muted truncate text-[11px] tabular-nums">
              {t("my.skins", { n: groups.length })}
            </p>
          </div>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-wrap gap-2.5">
        {groups.map((group) => {
          const cardKey = `${champion}\u0000${group.baseSkinName}`;
          return (
            <SkinTile
              key={group.baseSkinName}
              cardKey={cardKey}
              champion={champion}
              group={group}
              selectedSkin={selectedSkin}
              patcherActive={patcherActive}
              outdatedKeys={outdatedKeys}
              menuOpen={activeMenuCardKey === cardKey}
              onToggle={onToggle}
              onRequestDelete={onRequestDelete}
              onOpenMenu={onOpenMenu}
            />
          );
        })}
      </div>
    </div>
  );
});

const SkinTile = memo(function SkinTile({
  cardKey,
  champion,
  group,
  selectedSkin,
  patcherActive,
  outdatedKeys,
  menuOpen,
  onToggle,
  onRequestDelete,
  onOpenMenu,
}: {
  cardKey: string;
  champion: string;
  group: DownloadGroup;
  selectedSkin: string | undefined;
  patcherActive: boolean;
  outdatedKeys: Set<string>;
  menuOpen: boolean;
  onToggle: (championName: string, skinName: string) => void;
  onRequestDelete: (req: PendingDelete) => void;
  onOpenMenu: (menu: OpenMenuState) => void;
}) {
  const { t } = useI18n();
  // Form whose picture shows over the thumbnail while its button is hovered.
  const [preview, setPreview] = useState<{ icon: string | null; label: string } | null>(null);
  const hover = (icon: string | null, label: string) => ({
    onMouseEnter: () => setPreview({ icon, label }),
    onMouseLeave: () => setPreview(null),
  });
  const baseSelected = selectedSkin === group.baseSkinName;
  const selectedChroma = group.chromas.find((c) => c.dl.skin_name === selectedSkin);
  const selectedForm = group.forms.find((f) => f.dl.skin_name === selectedSkin);
  const anySelected = baseSelected || !!selectedChroma || !!selectedForm;
  const baseClickable = !patcherActive && group.base !== null;
  const hasVariants = group.chromas.length > 0 || group.forms.length > 0;

  const isOutdated = (dl: DownloadedSkin) =>
    outdatedKeys.has(skinKey(dl.champion_name, dl.skin_name));
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
  const variantCount = group.chromas.length + group.forms.length;

  const buildCardMenuItems = (): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [];
    if (group.base && !patcherActive) {
      items.push({
        label: baseSelected ? t("my.deselect") : t("my.select"),
        icon: baseSelected ? <X size={13} strokeWidth={2} /> : <Check size={13} strokeWidth={2.2} />,
        onSelect: () => onToggle(group.base!.champion_name, group.base!.skin_name),
      });
      items.push({ type: "separator" });
    }

    if (group.base && hasVariants) {
      items.push({
        label: t("my.deleteBaseMenu"),
        icon: <Trash2 size={13} strokeWidth={1.75} />,
        destructive: true,
        onSelect: () =>
          onRequestDelete({
            champion,
            previewSkinName: group.baseSkinName,
            skinNames: [group.base!.skin_name],
            title: t("my.deleteDialogTitle", { name: displayName }),
            description: t("my.deleteDialogBody"),
          }),
      });
    }

    if (allNames.length > 0) {
      items.push({
        label: hasVariants
          ? t("my.deleteGroupMenu", { n: allNames.length })
          : t("my.deleteMenu"),
        icon: <Trash2 size={13} strokeWidth={1.75} />,
        destructive: true,
        onSelect: () =>
          onRequestDelete({
            champion,
            previewSkinName: group.baseSkinName,
            skinNames: allNames,
            title: hasVariants
              ? t("my.deleteGroupDialogTitle", { name: displayName, n: variantCount })
              : t("my.deleteDialogTitle", { name: displayName }),
            description: hasVariants ? t("my.deleteGroupDialogBody") : t("my.deleteDialogBody"),
          }),
      });
    }

    return items;
  };

  const openCardMenuAt = (x: number, y: number) => {
    if (patcherActive || allNames.length === 0) return;
    onOpenMenu({ x, y, cardKey, items: buildCardMenuItems() });
  };

  const handleCardContextMenu = (e: MouseEvent) => {
    if (patcherActive || allNames.length === 0) return;
    e.preventDefault();
    openCardMenuAt(e.clientX, e.clientY);
  };

  const handleVariantContextMenu = (
    e: MouseEvent,
    dl: DownloadedSkin,
    variantName: string,
    kind: "chroma" | "form"
  ) => {
    if (patcherActive) return;
    e.preventDefault();
    e.stopPropagation();
    const isSel = selectedSkin === dl.skin_name;
    onOpenMenu({
      x: e.clientX,
      y: e.clientY,
      cardKey,
      items: [
        { type: "header", label: variantName },
        {
          label: isSel ? t("my.deselect") : t("my.select"),
          icon: isSel ? <X size={13} strokeWidth={2} /> : <Check size={13} strokeWidth={2.2} />,
          onSelect: () => onToggle(dl.champion_name, dl.skin_name),
        },
        { type: "separator" },
        {
          label: kind === "chroma" ? t("my.deleteChromaMenu") : t("my.deleteFormMenu"),
          icon: <Trash2 size={13} strokeWidth={1.75} />,
          destructive: true,
          onSelect: () =>
            onRequestDelete({
              champion,
              previewSkinName: group.baseSkinName,
              skinNames: [dl.skin_name],
              title: t("my.deleteDialogTitle", { name: variantName }),
              description: t("my.deleteDialogBody"),
            }),
        },
      ],
    });
  };

  const pillClass = (selected: boolean) =>
    [
      "flex h-6 items-center gap-1 rounded-[6px] border px-1.5 text-[10px] leading-none transition-colors",
      patcherActive ? "cursor-default opacity-50" : "cursor-default",
      selected
        ? "border-gold-400/70 bg-gold-400/15 text-gold-200 font-medium"
        : "border-white/[0.09] bg-white/[0.03] text-ink-secondary hover:border-white/[0.18] hover:text-ink",
    ].join(" ");

  return (
    <div
      onContextMenu={handleCardContextMenu}
      className={[
        "group/card flex w-[184px] flex-col gap-1.5 rounded-[10px] border p-1.5 transition-all duration-150",
        anySelected
          ? "border-gold-400/70 bg-gold-400/[0.07] shadow-[inset_0_1px_0_rgba(234,214,166,0.14),0_0_0_1px_rgba(200,170,110,0.18)]"
          : menuOpen
            ? "border-white/[0.18] bg-charcoal-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
            : "border-white/[0.07] bg-charcoal-500/75 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] hover:border-white/[0.14] hover:bg-charcoal-500",
      ].join(" ")}
    >
      <div className="relative">
        <button
          onClick={() =>
            baseClickable && group.base && onToggle(group.base.champion_name, group.base.skin_name)
          }
          disabled={!baseClickable}
          className={[
            "relative block aspect-video w-full overflow-hidden rounded-[7px] ring-1 ring-white/[0.08] ring-inset transition-all duration-150",
            patcherActive
              ? "cursor-default opacity-50"
              : group.base
                ? "cursor-pointer"
                : "cursor-default",
            !group.base && "opacity-70",
          ]
            .filter(Boolean)
            .join(" ")}
          title={group.base ? displayName : t("my.baseMissing", { name: displayName })}
        >
          <SkinThumb championName={champion} skinName={group.baseSkinName} />
          {preview && <FormPreview icon={preview.icon} label={preview.label} />}

          {baseSelected && (
            <div className="bg-gold-400 absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-white/35 shadow-md">
              <Check size={11} strokeWidth={3} className="text-charcoal-600" />
            </div>
          )}
          {selectedChroma && (
            <div
              className="absolute top-1.5 right-1.5 h-5 w-5 rounded-full border-2 border-white shadow-md"
              style={{
                background: swatchBackground(selectedChroma.colors) ?? "var(--color-gold-400)",
              }}
            />
          )}
          {selectedForm && (
            <div className="bg-gold-400 text-charcoal-600 absolute top-1.5 right-1.5 z-10 flex h-6 items-center gap-1 rounded-full border border-white/35 pr-1.5 pl-1 text-[10px] font-semibold shadow-md">
              {formIcon(selectedForm.form.id) ? (
                <img
                  src={formIcon(selectedForm.form.id)!}
                  alt=""
                  className="h-4.5 w-4.5 rounded-full object-contain"
                  draggable={false}
                />
              ) : (
                <Check size={10} strokeWidth={3} />
              )}
              {formLabelOf(selectedForm.form)}
            </div>
          )}

          {(baseOutdated || outdatedVariants > 0) && (
            <div
              className="bg-charcoal-600/85 text-gold-400 absolute right-1.5 bottom-1.5 z-10 flex h-4.5 w-4.5 items-center justify-center rounded-full border border-gold-400/25 shadow-sm backdrop-blur-sm"
              title={
                baseOutdated
                  ? t("my.updateAvailable")
                  : t("my.variantUpdates", { n: outdatedVariants })
              }
            >
              <RefreshCw size={9.5} strokeWidth={2.5} />
            </div>
          )}

          <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/85 via-black/45 to-transparent px-2 pt-5 pb-1.5 text-left">
            <p className="line-clamp-2 pr-4 text-[11px] leading-tight font-medium text-white/95 drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]">
              {displayName}
            </p>
          </div>
        </button>
      </div>

      {/* Metadata footer: rarity on the left, subtle native overflow menu button on the right */}
      <div className="flex min-h-[20px] items-center justify-between gap-1 px-0.5">
        <div className="min-w-0 flex-1">
          {group.baseId && <RarityBadge skinId={group.baseId} />}
        </div>
        {!patcherActive && allNames.length > 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              const rect = e.currentTarget.getBoundingClientRect();
              openCardMenuAt(rect.right - 190, rect.bottom + 4);
            }}
            className={[
              "flex h-5 w-5 shrink-0 cursor-default items-center justify-center rounded-[5px] transition-all duration-150",
              menuOpen
                ? "bg-white/[0.12] text-ink opacity-100"
                : "text-ink-muted/70 hover:bg-white/[0.09] hover:text-ink opacity-45 group-focus-within/card:opacity-100 group-hover/card:opacity-100",
            ].join(" ")}
            title={t("my.actions")}
            aria-label={t("my.actions")}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <MoreHorizontal size={13.5} strokeWidth={2} />
          </button>
        )}
      </div>

      {group.forms.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-0.5" title={t("my.formTip")}>
          {group.base && (
            <span {...hover(group.baseId ? formIcon(group.baseId) : null, baseLabel)}>
              <button
                onClick={() => onToggle(group.base!.champion_name, group.base!.skin_name)}
                disabled={patcherActive}
                className={pillClass(baseSelected)}
              >
                {baseSelected ? (
                  <Check size={9} strokeWidth={3} />
                ) : (
                  <FormThumb icon={group.baseId ? formIcon(group.baseId) : null} />
                )}
                {baseLabel}
              </button>
            </span>
          )}
          {group.forms.map((f) => {
            const isSel = selectedSkin === f.dl.skin_name;
            const icon = formIcon(f.form.id);
            const label = formLabelOf(f.form);
            const fullVariantName = downloadedDisplayName(f.dl.champion_name, f.dl.skin_name);
            return (
              <span key={f.dl.skin_name} {...hover(icon, label)}>
                <button
                  onClick={() => onToggle(f.dl.champion_name, f.dl.skin_name)}
                  onContextMenu={(e) => handleVariantContextMenu(e, f.dl, fullVariantName, "form")}
                  disabled={patcherActive}
                  title={`${fullVariantName}\n(${t("my.rightClickDelete")})`}
                  className={pillClass(isSel)}
                >
                  {isSel ? <Check size={9} strokeWidth={3} /> : <FormThumb icon={icon} />}
                  {label}
                </button>
              </span>
            );
          })}
        </div>
      )}

      {group.chromas.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          {group.chromas.map((c) => {
            const isSel = selectedSkin === c.dl.skin_name;
            const chromaName = downloadedDisplayName(c.dl.champion_name, c.dl.skin_name);
            return (
              <button
                key={c.dl.skin_name}
                onClick={() => onToggle(c.dl.champion_name, c.dl.skin_name)}
                onContextMenu={(e) => handleVariantContextMenu(e, c.dl, chromaName, "chroma")}
                disabled={patcherActive}
                title={`${chromaName}\n(${t("my.rightClickDelete")})`}
                className={[
                  "ring-offset-charcoal-500 relative h-4.5 w-4.5 shrink-0 rounded-[5px] transition-all",
                  patcherActive ? "cursor-default opacity-50" : "cursor-pointer",
                  isSel
                    ? "ring-gold-400 scale-105 ring-2 ring-offset-1"
                    : "ring-1 ring-white/20 ring-inset hover:scale-110 hover:ring-white/45",
                ].join(" ")}
                style={{ background: swatchBackground(c.colors) ?? "var(--color-charcoal-300)" }}
              >
                {isSel && (
                  <Check
                    size={10}
                    strokeWidth={3}
                    className="absolute inset-0 m-auto text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]"
                  />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
});
