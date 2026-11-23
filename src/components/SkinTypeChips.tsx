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
      "flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-2 text-xs whitespace-nowrap transition-colors",
      active
        ? "border-gold-400/60 bg-gold-400/12 text-gold-200"
        : "border-border text-ink-secondary hover:border-charcoal-50 hover:text-ink",
    ].join(" ");

  return (
    <div className="flex min-w-0 items-center gap-1 overflow-x-auto select-none [scrollbar-width:none]">
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
        return (
          <button
            key={type}
            onClick={() => onChange(value === type ? null : type)}
            className={chip(value === type)}
            title={type === "forms" ? t("type.formsHint") : undefined}
            style={
              value === type && type !== "forms" && type !== "legacy"
                ? {
                    borderColor: `${rarityColor(type as Rarity)}99`,
                    color: rarityColor(type as Rarity),
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
