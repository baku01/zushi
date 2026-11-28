import { Play, Square, Loader2 } from "lucide-react";
import { useI18n, t, type Key } from "../lib/i18n";
import type { PatcherStatus } from "../types";

interface StatusBarProps {
  patcherStatus: PatcherStatus;
  skinCount: number;
  customCount: number;
  onApply: () => void;
  onStop: () => void;
}

function getStatusInfo(s: PatcherStatus): { label: string; dotClass: string; spinner: boolean } {
  if (typeof s === "object" && "Error" in s) {
    return {
      label: s.Error,
      dotClass: "bg-error shadow-[0_0_8px_rgba(255,69,58,0.55)]",
      spinner: false,
    };
  }
  const label = t(`status.${s}` as Key);
  switch (s) {
    case "Importing":
    case "BuildingOverlay":
    case "WaitingForGame":
    case "Scanning":
      return {
        label,
        dotClass: "bg-gold-400 animate-pulse shadow-[0_0_8px_rgba(200,170,110,0.55)]",
        spinner: true,
      };
    case "FoundGame":
    case "InGame":
      return {
        label,
        dotClass: "bg-success shadow-[0_0_8px_rgba(50,215,75,0.55)]",
        spinner: false,
      };
    case "Patching":
      return {
        label,
        dotClass: "bg-success animate-pulse shadow-[0_0_8px_rgba(50,215,75,0.55)]",
        spinner: false,
      };
    case "GameExited":
      return {
        label,
        dotClass: "bg-gold-400 animate-pulse shadow-[0_0_8px_rgba(200,170,110,0.45)]",
        spinner: false,
      };
    default:
      return { label: t("status.Idle"), dotClass: "bg-ink-muted/70", spinner: false };
  }
}

export default function StatusBar({
  patcherStatus,
  skinCount,
  customCount,
  onApply,
  onStop,
}: StatusBarProps) {
  useI18n(); // re-render on language change
  const { label, dotClass, spinner } = getStatusInfo(patcherStatus);
  const isActive =
    patcherStatus !== "Idle" && !(typeof patcherStatus === "object" && "Error" in patcherStatus);

  const totalSelected = skinCount + customCount;
  const canApply = totalSelected > 0 && !isActive;

  const countLabel = [
    skinCount > 0 ? t("status.skins", { n: skinCount }) : null,
    customCount > 0 ? t("status.customs", { n: customCount }) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <footer className="bg-charcoal-500/95 flex h-[52px] shrink-0 items-center gap-2.5 border-t border-white/[0.08] px-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      <span className={`h-2 w-2 shrink-0 rounded-full ${dotClass}`} />
      {spinner && <Loader2 size={13.5} className="text-gold-400 shrink-0 animate-spin" />}
      <span
        className={[
          "truncate text-[13px]",
          isActive ? "text-ink font-medium" : "text-ink-secondary",
        ].join(" ")}
      >
        {label}
      </span>

      <div className="ml-auto flex shrink-0 items-center gap-3">
        {!isActive && countLabel && (
          <span className="text-ink-secondary/80 text-xs tabular-nums select-none">
            {countLabel}
          </span>
        )}

        {isActive ? (
          <button
            onClick={onStop}
            className="bg-error/12 text-error border-error/30 hover:bg-error/20 hover:border-error/45 flex h-8 cursor-default items-center gap-2 rounded-[8px] border px-4 transition-all active:scale-[0.98]"
            title={t("status.stopTip")}
          >
            <Square size={12} strokeWidth={2.5} fill="currentColor" />
            <span className="text-[13px] font-medium">{t("status.stop")}</span>
          </button>
        ) : (
          <button
            onClick={onApply}
            disabled={!canApply}
            className={[
              "flex h-8 items-center gap-2 rounded-[8px] px-4 transition-all active:scale-[0.98]",
              canApply
                ? "btn-gold cursor-default"
                : "border border-white/[0.06] bg-white/[0.04] text-ink-muted/45 pointer-events-none",
            ].join(" ")}
          >
            <Play size={13} strokeWidth={2.5} fill="currentColor" />
            <span className="text-[13px] font-semibold">{t("status.apply")}</span>
          </button>
        )}
      </div>
    </footer>
  );
}
