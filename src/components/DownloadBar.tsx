import { Loader2 } from "lucide-react";
import { useI18n } from "../lib/i18n";

interface DownloadBarProps {
  downloading: string | null;
}

export default function DownloadBar({ downloading }: DownloadBarProps) {
  const { t } = useI18n();
  if (!downloading) return null;

  let label: string;
  let progress: { current: number; total: number } | null = null;

  if (downloading === "batch") {
    label = t("download.preparing");
  } else {
    // Batch progress arrives as "Skin Name (3/10)".
    const match = downloading.match(/^(.*) \((\d+)\/(\d+)\)$/);
    if (match) {
      label = t("download.item", { name: match[1] });
      progress = { current: Number(match[2]), total: Number(match[3]) };
    } else {
      label = `${t("download.item", { name: downloading.split("/").pop() ?? "" })}...`;
    }
  }

  const pct = progress ? Math.round((progress.current / progress.total) * 100) : null;

  return (
    <div className="bg-charcoal-500/85 relative flex items-center gap-2.5 border-t border-white/[0.07] px-4 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      <Loader2 size={13.5} className="text-gold-400 shrink-0 animate-spin" />
      <span className="text-ink truncate text-[12.5px] font-medium">{label}</span>
      {progress && (
        <span className="text-ink-muted ml-auto shrink-0 text-xs tabular-nums select-none">
          {progress.current}/{progress.total}
        </span>
      )}
      {pct !== null && (
        <div className="absolute inset-x-0 bottom-0 h-[2px] bg-white/[0.06]">
          <div
            className="bg-gold-400 h-full transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}
