import { useState } from "react";
import { skinRarity } from "../hooks/useSkinData";
import { useI18n, type Key } from "../lib/i18n";
import type { Rarity } from "../types";

const GEM_BASE =
  "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/rarity-gem-icons";

// Community Dragon has gem icons for these; the others get a colored dot.
const GEM: Partial<Record<Rarity, string>> = {
  kEpic: "epic",
  kLegendary: "legendary",
  kMythic: "mythic",
  kUltimate: "ultimate",
  kExalted: "exalted",
  kTranscendent: "transcendent",
};

const COLOR: Record<Rarity, string> = {
  kNoRarity: "#8a8a92",
  kRare: "#55c08a",
  kEpic: "#3fb6f2",
  kLegendary: "#ef5a4c",
  kMythic: "#c76ce6",
  kUltimate: "#f2a63c",
  kExalted: "#f0cf68",
  kTranscendent: "#8fe0ff",
};

/** Gem icon of a rarity (a colored dot when there's no icon). */
export function RarityGem({ rarity, size = 14 }: { rarity: Rarity; size?: number }) {
  const [failed, setFailed] = useState(false);
  const gem = GEM[rarity];
  if (!gem || failed) {
    return (
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: COLOR[rarity] }} />
    );
  }
  return (
    <img
      src={`${GEM_BASE}/${gem}.png`}
      alt=""
      style={{ width: size, height: size }}
      className="shrink-0 object-contain"
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}

export const rarityColor = (rarity: Rarity) => COLOR[rarity];

/** The skin's rarity (gem + label), plus "Legacy" when it's out of the store. */
export default function RarityBadge({
  skinId,
  className = "",
}: {
  skinId: string;
  className?: string;
}) {
  const { t } = useI18n();
  const meta = skinRarity(skinId);
  if (!meta) return null;
  const color = COLOR[meta.rarity];

  return (
    <div className={`flex min-w-0 items-center gap-1.5 ${className}`}>
      <RarityGem rarity={meta.rarity} />
      <span className="truncate text-[10.5px] font-medium tracking-wide" style={{ color }}>
        {t(`rarity.${meta.rarity}` as Key)}
      </span>
      {meta.legacy && (
        <span className="border-charcoal-50/40 text-ink-muted shrink-0 rounded-sm border px-1 text-[9px] leading-3.5 tracking-wide uppercase">
          {t("rarity.legacy")}
        </span>
      )}
    </div>
  );
}
