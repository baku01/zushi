import { Sparkles, Archive } from "lucide-react";
import { SKIN_TYPES, type SkinType } from "../hooks/useSkinData";
import { useI18n, type Key } from "../lib/i18n";
import { RarityGem, rarityColor } from "./RarityBadge";
import type { Rarity } from "../types";

interface SkinTypeChipsProps {
  value: SkinType | null;
  onChange: (type: SkinType | null) => void;
  allLabel: string;
  /** When given, only types with a count show, each with its count. */
  counts?: Map<SkinType, number>;
  total?: number;
}

/** Filter chips by skin type: with forms, rarity tiers, legacy. */
export default function SkinTypeChips({
  value,
  onChange,
  allLabel,
  counts,
  total,
}: SkinTypeChipsProps) {
  const { t } = useI18n();
  const types = counts ? SKIN_TYPES.filter((type) => (counts.get(type) ?? 0) > 0) : SKIN_TYPES;

  const chip = (active: boolean) =>
    [
      "flex h-7 shrink-0 cursor-default items-center gap-1.5 rounded-full border px-2.5 text-xs whitespace-nowrap transition-all duration-120",
      active
        ? "border-gold-400/55 bg-gold-400/14 text-gold-200 font-medium shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
        : "border-white/[0.08] bg-white/[0.03] text-ink-secondary hover:border-white/[0.15] hover:bg-white/[0.07] hover:text-ink",
    ].join(" ");

  return (
    <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto select-none [scrollbar-width:none]">
      <button onClick={() => onChange(null)} className={chip(value === null)}>
        {allLabel}
        {total !== undefined && <span className="text-ink-muted tabular-nums">{total}</span>}
      </button>
      {types.map((type) => {
        const label =
          type === "forms"
            ? t("type.forms")
            : type === "legacy"
              ? t("rarity.legacy")
              : t(`rarity.${type}` as Key);
        const count = counts?.get(type);
        const isRarity = type !== "forms" && type !== "legacy";
        const color = isRarity ? rarityColor(type as Rarity) : undefined;
        return (
          <button
            key={type}
            onClick={() => onChange(value === type ? null : type)}
            className={chip(value === type)}
            title={type === "forms" ? t("type.formsHint") : undefined}
            style={
              value === type && color
                ? {
                    borderColor: `${color}88`,
                    backgroundColor: `${color}1f`,
                    color,
                  }
                : undefined
            }
          >
            {type === "forms" ? (
              <Sparkles size={12} strokeWidth={2} className="text-hextech" />
            ) : type === "legacy" ? (
              <Archive size={12} strokeWidth={1.75} className="text-ink-muted" />
            ) : (
              <RarityGem rarity={type as Rarity} size={13} />
            )}
            {label}
            {count !== undefined && <span className="text-ink-muted tabular-nums">{count}</span>}
          </button>
        );
      })}
    </div>
  );
}
