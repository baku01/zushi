import { invoke } from "@tauri-apps/api/core";
import { Loader2 } from "lucide-react";
import { useI18n } from "../lib/i18n";

interface UpdateBannerProps {
  version: string;
  releasesUrl: string;
  canInstall: boolean;
  installing: boolean;
  error: string | null;
  onInstall: () => void;
}

export default function UpdateBanner({
  version,
  releasesUrl,
  canInstall,
  installing,
  error,
  onInstall,
}: UpdateBannerProps) {
  const { t } = useI18n();
  return (
    <div className="border-gold-400/20 bg-gold-400/8 mt-auto mx-3 mb-3 flex flex-col gap-2 rounded-lg border p-3">
      <span className="text-ink text-xs font-medium">{t("update.available", { v: version })}</span>
      {error && <span className="text-ink-muted text-xs">{t("update.failed", { e: error })}</span>}
      {canInstall ? (
        <button
          onClick={onInstall}
          disabled={installing}
          className="btn-gold flex w-full cursor-pointer items-center justify-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-default disabled:opacity-70"
        >
          {installing && <Loader2 size={13} strokeWidth={2} className="animate-spin" />}
          {installing ? t("update.installing") : t("update.install")}
        </button>
      ) : (
        <button
          onClick={() => invoke("open_url", { url: releasesUrl }).catch(() => {})}
          className="btn-gold w-full cursor-pointer rounded px-3 py-1.5 text-xs font-medium transition-colors"
        >
          {t("update.download")}
        </button>
      )}
    </div>
  );
}
