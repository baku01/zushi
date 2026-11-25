import { memo, useMemo } from "react";
import { Search, X } from "lucide-react";
import {
  useChampions,
  championAvatar,
  championDisplayName,
  championTitle,
} from "../hooks/useChampions";
import {
  championSkinTypes,
  skinTileUrlById,
  prefetchChampionSplashes,
  type SkinType,
} from "../hooks/useSkinData";
import ArtImage from "./ArtImage";
import { useI18n } from "../lib/i18n";
import SkinTypeChips from "./SkinTypeChips";
import type { Champion } from "../types";

interface ChampionGridProps {
  onSelect: (champion: Champion) => void;
  /** Downloaded skins per champion folder name (the English champion name). */
  ownedCounts: Map<string, number>;
  /** Champion folder names with a skin selected for the next game. */
  selectedChampions: Set<string>;
  skinType: SkinType | null;
  onSkinTypeChange: (type: SkinType | null) => void;
}

interface ChampionTileProps {
  champ: Champion;
  name: string;
  owned: number;
  selected: boolean;
  tooltip: string;
  /** Data version: art URLs resolve once metadata loads, so a bump must re-render the tile. */
  version: number;
  onSelect: (champion: Champion) => void;
}

// Memoized: the grid has ~170 tiles and App re-renders on every download event or
// patcher status change, which would otherwise rebuild all of them each time.
const ChampionTile = memo(function ChampionTile({
  champ,
  name,
  owned,
  selected,
  tooltip,
  onSelect,
}: ChampionTileProps) {
  return (
    <button
      onClick={() => onSelect(champ)}
      onMouseEnter={() => prefetchChampionSplashes(champ)}
      className="group flex cursor-pointer flex-col items-center gap-1 rounded-md p-1.5 transition-transform duration-100 hover:bg-white/4 active:scale-[0.96]"
      title={tooltip}
    >
      <div className="relative">
        <div
          className={[
            "bg-charcoal-500 relative h-15 w-15 overflow-hidden rounded-sm border transition-colors duration-150",
            selected ? "border-gold-400" : "border-charcoal-50/30 group-hover:border-gold-400/70",
          ].join(" ")}
        >
          {/* The default skin's 380px tile: sharper than the 128px champion icon. */}
          <ArtImage
            srcs={[
              skinTileUrlById(String(parseInt(champ.key, 10) * 1000)),
              championAvatar(champ.id),
            ]}
            alt={name}
            lazy
            className="h-full w-full object-cover group-hover:scale-105"
          />
        </div>
        {owned > 0 && (
          <span
            className={[
              "absolute -right-1.5 -bottom-1.5 min-w-4.5 rounded-full border px-1 text-center text-[9.5px] leading-4 font-semibold tabular-nums",
              selected
                ? "bg-gold-400 text-charcoal-600 border-charcoal-400"
                : "bg-charcoal-200 text-ink-secondary border-charcoal-400",
            ].join(" ")}
          >
            {owned}
          </span>
        )}
      </div>
      <span
        className={[
          "w-full truncate text-center text-[10.5px] leading-tight transition-colors select-none",
          selected ? "text-gold-300" : "text-ink-muted group-hover:text-gold-300",
        ].join(" ")}
      >
        {name}
      </span>
    </button>
  );
});

export default function ChampionGrid({
  onSelect,
  ownedCounts,
  selectedChampions,
  skinType,
  onSkinTypeChange,
}: ChampionGridProps) {
  const { t, version } = useI18n();
  const { champions: searched, total, loading, error, search, setSearch } = useChampions();
  const champions = useMemo(() => {
    if (!skinType) return searched;
    const types = championSkinTypes();
    return searched.filter((c) => (types.get(parseInt(c.key, 10))?.get(skinType) ?? 0) > 0);
    // `version` bumps when skin metadata lands, which the type counts are built from.
  }, [searched, skinType, version]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <span className="text-ink-muted text-sm">{t("grid.loading")}</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2">
        <span className="text-error text-sm">{t("grid.failed")}</span>
        <span className="text-ink-muted text-xs">{error}</span>
      </div>
    );
  }

  const filtering = search.trim() !== "" || skinType !== null;

  return (
    <div className="flex h-full flex-col">
      <div
        data-tauri-drag-region
        className="border-border flex shrink-0 items-center gap-3 border-b px-4 py-2.5"
      >
        <div className="relative w-48 shrink-0">
          <Search
            size={14}
            strokeWidth={1.5}
            className="text-ink-muted pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("grid.search")}
            className="bg-charcoal-500 border-border text-ink placeholder:text-ink-muted focus:border-gold-500/60 w-full rounded-sm border py-1.5 pr-7 pl-8 text-sm transition-colors focus:outline-none"
            spellCheck={false}
            autoComplete="off"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="text-ink-muted hover:text-ink absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer"
            >
              <X size={13} strokeWidth={2} />
            </button>
          )}
        </div>

        <SkinTypeChips value={skinType} onChange={onSkinTypeChange} allLabel={t("grid.all")} />

        {filtering && (
          <span className="text-ink-muted ml-auto shrink-0 text-[11px] tabular-nums select-none">
            {champions.length} / {total}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        {champions.length > 0 ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(78px,1fr))] gap-1">
            {champions.map((champ) => {
              const name = championDisplayName(champ);
              const owned = ownedCounts.get(champ.name) ?? 0;
              const selected = selectedChampions.has(champ.name);
              const tooltip = `${name}, ${championTitle(champ)}${owned ? `\n${t("grid.owned", { n: owned })}` : ""}${selected ? `\n${t("grid.selected")}` : ""}`;
              return (
                <ChampionTile
                  key={champ.key}
                  champ={champ}
                  name={name}
                  owned={owned}
                  selected={selected}
                  tooltip={tooltip}
                  version={version}
                  onSelect={onSelect}
                />
              );
            })}
          </div>
        ) : (
          <div className="flex h-32 items-center justify-center">
            <span className="text-ink-muted text-sm">{t("grid.none")}</span>
          </div>
        )}
      </div>
    </div>
  );
}
