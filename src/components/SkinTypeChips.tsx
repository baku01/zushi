import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { Sparkles, Archive, Check, ChevronsUpDown, SlidersHorizontal, X } from "lucide-react";
import { SKIN_TYPES, type SkinType } from "../hooks/useSkinData";
import { useI18n, type Key } from "../lib/i18n";
import { RarityGem, rarityColor } from "./RarityBadge";
import type { Rarity } from "../types";

interface SkinTypeChipsProps {
  value: SkinType | null;
  onChange: (type: SkinType | null) => void;
  allLabel: string;
  /** Counts per skin type; when hideEmpty is true, types with 0 are omitted. */
  counts?: Map<SkinType, number>;
  /** Hide types that have no count in `counts` (used inside ChampionDetail). */
  hideEmpty?: boolean;
  total?: number;
  /** Popover horizontal alignment relative to the button. */
  align?: "left" | "right";
}

const RARITY_TYPES: SkinType[] = [
  "kTranscendent",
  "kExalted",
  "kUltimate",
  "kMythic",
  "kLegendary",
  "kEpic",
];
const SPECIAL_TYPES: SkinType[] = ["forms", "legacy"];
const EDGE_PAD = 8;

function typeAccent(type: SkinType): string {
  if (type === "forms") return "#0ac8b9";
  if (type === "legacy") return "#c8aa6e";
  return rarityColor(type as Rarity);
}

function TypeIcon({ type, size = 13 }: { type: SkinType; size?: number }) {
  if (type === "forms") {
    return <Sparkles size={size} strokeWidth={2} className="text-hextech shrink-0" />;
  }
  if (type === "legacy") {
    return <Archive size={size} strokeWidth={1.75} className="text-gold-400/90 shrink-0" />;
  }
  return <RarityGem rarity={type as Rarity} size={size + 1} />;
}

/** Native macOS PopUp filter button (NSPopUpButton + NSMenu) for skin rarity & type. */
export default function SkinTypeChips({
  value,
  onChange,
  allLabel,
  counts,
  hideEmpty = false,
  total,
  align = "left",
}: SkinTypeChipsProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });

  const labelOf = (type: SkinType) =>
    type === "forms"
      ? t("type.forms")
      : type === "legacy"
        ? t("rarity.legacy")
        : t(`rarity.${type}` as Key);

  const visibleTypes =
    hideEmpty && counts ? SKIN_TYPES.filter((type) => (counts.get(type) ?? 0) > 0) : [...SKIN_TYPES];
  const rarities = RARITY_TYPES.filter((type) => visibleTypes.includes(type));
  const specials = SPECIAL_TYPES.filter((type) => visibleTypes.includes(type));

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const tr = triggerRef.current.getBoundingClientRect();
    const menuRect = menuRef.current?.getBoundingClientRect();
    const menuW = menuRect?.width ?? 224;
    const menuH = menuRect?.height ?? 280;

    const rawLeft = align === "right" ? tr.right - menuW : tr.left;
    const left = Math.max(EDGE_PAD, Math.min(rawLeft, window.innerWidth - menuW - EDGE_PAD));
    const below = tr.bottom + 6;
    const top =
      below + menuH <= window.innerHeight - EDGE_PAD
        ? below
        : Math.max(EDGE_PAD, tr.top - menuH - 6);

    setPos({ left, top });
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    };
    const onDismiss = () => setOpen(false);

    window.addEventListener("mousedown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("blur", onDismiss);
    window.addEventListener("scroll", onDismiss, true);
    return () => {
      window.removeEventListener("mousedown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("blur", onDismiss);
      window.removeEventListener("scroll", onDismiss, true);
    };
  }, [open]);

  const activeAccent = value ? typeAccent(value) : undefined;
  const activeCount = value ? counts?.get(value) : undefined;

  const pick = (next: SkinType | null) => {
    onChange(next);
    setOpen(false);
  };

  const renderItem = (type: SkinType) => {
    const active = value === type;
    const count = counts?.get(type);
    const color = typeAccent(type);
    return (
      <button
        key={type}
        type="button"
        role="menuitemradio"
        aria-checked={active}
        title={type === "forms" ? t("type.formsHint") : undefined}
        onClick={() => pick(active ? null : type)}
        className={[
          "flex w-full cursor-default items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-[12.5px] leading-tight transition-colors duration-75",
          active ? "bg-white/[0.11] text-ink font-medium" : "text-ink/90 hover:bg-white/[0.08]",
        ].join(" ")}
      >
        <span className="flex w-3.5 shrink-0 items-center justify-center">
          {active && <Check size={12.5} strokeWidth={2.5} style={{ color }} />}
        </span>
        <TypeIcon type={type} size={13} />
        <span className="truncate">{labelOf(type)}</span>
        {count !== undefined && (
          <span className="text-ink-muted ml-auto pl-3 text-[11px] tabular-nums">{count}</span>
        )}
      </button>
    );
  };

  return (
    <div className="flex shrink-0 items-center gap-1 select-none">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={[
          "flex h-8 cursor-default items-center gap-1.5 rounded-lg border px-2.5 text-[12.5px] whitespace-nowrap transition-all duration-120",
          value
            ? "font-medium shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]"
            : open
              ? "border-white/[0.18] bg-white/[0.11] text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
              : "mac-btn",
        ].join(" ")}
        style={
          value && activeAccent
            ? {
                borderColor: `${activeAccent}66`,
                backgroundColor: `${activeAccent}1a`,
                color: activeAccent,
              }
            : undefined
        }
      >
        {value ? (
          <>
            <TypeIcon type={value} size={13} />
            <span>{labelOf(value)}</span>
            {activeCount !== undefined && (
              <span className="text-[11px] tabular-nums opacity-75">{activeCount}</span>
            )}
          </>
        ) : (
          <>
            <SlidersHorizontal size={12.5} strokeWidth={1.85} className="text-ink-muted shrink-0" />
            <span className="text-ink-secondary">{t("filter.label")}:</span>
            <span className="text-ink font-medium">{allLabel}</span>
          </>
        )}
        <ChevronsUpDown
          size={12.5}
          strokeWidth={1.85}
          className={value ? "ml-0.5 shrink-0 opacity-75" : "text-ink-muted ml-0.5 shrink-0"}
        />
      </button>

      {value && (
        <button
          type="button"
          onClick={() => onChange(null)}
          title={t("filter.clear")}
          aria-label={t("filter.clear")}
          className="text-ink-muted hover:text-ink flex h-7 w-7 cursor-default items-center justify-center rounded-lg transition-colors hover:bg-white/[0.08]"
        >
          <X size={13} strokeWidth={2.2} />
        </button>
      )}

      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ left: pos.left, top: pos.top }}
            className="animate-menu-in fixed z-50 min-w-[220px] rounded-[10px] border border-white/[0.14] bg-[#242429]/96 p-1 shadow-[0_16px_42px_rgba(0,0,0,0.62),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-2xl select-none"
          >
            <button
              type="button"
              role="menuitemradio"
              aria-checked={value === null}
              onClick={() => pick(null)}
              className={[
                "flex w-full cursor-default items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-[12.5px] leading-tight transition-colors duration-75",
                value === null
                  ? "bg-white/[0.11] text-ink font-medium"
                  : "text-ink/90 hover:bg-white/[0.08]",
              ].join(" ")}
            >
              <span className="flex w-3.5 shrink-0 items-center justify-center">
                {value === null && <Check size={12.5} strokeWidth={2.5} className="text-gold-400" />}
              </span>
              <span className="truncate">{allLabel}</span>
              {total !== undefined && (
                <span className="text-ink-muted ml-auto pl-3 text-[11px] tabular-nums">{total}</span>
              )}
            </button>

            {rarities.length > 0 && (
              <>
                <div className="mx-2 my-1 h-px bg-white/[0.08]" />
                <div className="text-ink-muted px-2.5 pt-0.5 pb-1 text-[10px] font-semibold tracking-wider uppercase">
                  {t("filter.rarity")}
                </div>
                {rarities.map(renderItem)}
              </>
            )}

            {specials.length > 0 && (
              <>
                <div className="mx-2 my-1 h-px bg-white/[0.08]" />
                <div className="text-ink-muted px-2.5 pt-0.5 pb-1 text-[10px] font-semibold tracking-wider uppercase">
                  {t("filter.special")}
                </div>
                {specials.map(renderItem)}
              </>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}
