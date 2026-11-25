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
    return { label: s.Error, dotClass: "bg-error", spinner: false };
  }
  const label = t(`status.${s}` as Key);
  switch (s) {
    case "Importing":
    case "BuildingOverlay":
    case "WaitingForGame":
    case "Scanning":
      return { label, dotClass: "bg-gold-400 animate-pulse", spinner: true };
    case "FoundGame":
    case "InGame":
      return { label, dotClass: "bg-success", spinner: false };
    case "Patching":
      return { label, dotClass: "bg-success animate-pulse", spinner: false };
    case "GameExited":
      return { label, dotClass: "bg-gold-400 animate-pulse", spinner: false };
    default:
      return { label: t("status.Idle"), dotClass: "bg-ink-muted", spinner: false };
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
    <footer className="border-border bg-charcoal-500 flex items-center gap-3 border-t px-4 py-2.5">
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dotClass}`} />
      {spinner && <Loader2 size={14} className="text-gold-400 shrink-0 animate-spin" />}
      <span
        className={[
          "truncate text-sm",
          isActive ? "text-ink font-medium" : "text-ink-secondary",
        ].join(" ")}
      >
        {label}
      </span>

      <div className="ml-auto flex shrink-0 items-center gap-3">
        {!isActive && countLabel && (
          <span className="text-ink-muted text-xs tabular-nums select-none">{countLabel}</span>
        )}

        {isActive ? (
          <button
            onClick={onStop}
            className="bg-error/10 text-error border-error/25 hover:bg-error/20 hover:border-error/40 flex h-9 cursor-pointer items-center gap-2 rounded-lg border px-5 transition-all active:scale-95"
            title={t("status.stopTip")}
          >
            <Square size={13} strokeWidth={2.5} fill="currentColor" />
            <span className="text-sm font-medium">{t("status.stop")}</span>
          </button>
        ) : (
          <button
            onClick={onApply}
            disabled={!canApply}
            className={[
              "flex h-9 items-center gap-2 rounded-lg px-5 transition-all active:scale-95",
              canApply
                ? "btn-gold cursor-pointer"
                : "bg-charcoal-300 text-ink-muted/40 pointer-events-none",
            ].join(" ")}
          >
            <Play size={14} strokeWidth={2.5} fill="currentColor" />
            <span className="text-sm font-semibold">{t("status.apply")}</span>
          </button>
        )}
      </div>
    </footer>
  );
}
