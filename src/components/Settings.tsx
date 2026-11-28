import { useState, useEffect, useCallback } from "react";
import { enable, disable, isEnabled } from "@tauri-apps/plugin-autostart";
import { open } from "@tauri-apps/plugin-dialog";
import { Power, FolderOpen, Trash2, Loader2, HardDrive, Languages } from "lucide-react";
import { useI18n, type Lang } from "../lib/i18n";
import {
  getSkinsDirSize,
  getWorkDirSize,
  getCustomsDirSize,
  clearAllSkins,
  clearWorkDir,
  clearAllCustoms,
} from "../lib/commands";
import Toast from "./Toast";
import ConfirmDialog from "./ConfirmDialog";

interface SettingsProps {
  gamePath: string | null;
  onPathChange: (path: string) => Promise<boolean>;
  patcherActive: boolean;
  onSkinsCleared: () => Promise<void>;
  onCustomsCleared: () => Promise<void>;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function Settings({
  gamePath,
  onPathChange,
  patcherActive,
  onSkinsCleared,
  onCustomsCleared,
}: SettingsProps) {
  const { t, lang, setLang } = useI18n();
  const [autoStart, setAutoStart] = useState(false);
  const [autoStartLoading, setAutoStartLoading] = useState(true);
  const [pathLoading, setPathLoading] = useState(false);
  const [pathError, setPathError] = useState<string | null>(null);

  // Cache state
  const [skinsSize, setSkinsSize] = useState(0);
  const [workSize, setWorkSize] = useState(0);
  const [cacheLoading, setCacheLoading] = useState(true);
  const [customsSize, setCustomsSize] = useState(0);
  const [clearingContent, setClearingContent] = useState(false);
  const [clearingWork, setClearingWork] = useState(false);
  const [confirmClear, setConfirmClear] = useState<"content" | "work" | null>(null);

  useEffect(() => {
    isEnabled()
      .then(setAutoStart)
      .catch(() => {})
      .finally(() => setAutoStartLoading(false));
  }, []);

  const refreshCache = useCallback(async () => {
    setCacheLoading(true);
    try {
      const [s, w, c] = await Promise.all([
        getSkinsDirSize(),
        getWorkDirSize(),
        getCustomsDirSize(),
      ]);
      setSkinsSize(s);
      setWorkSize(w);
      setCustomsSize(c);
    } catch {
      // ignore
    }
    setCacheLoading(false);
  }, []);

  useEffect(() => {
    refreshCache();
  }, [refreshCache]);

  const handleAutoStartToggle = async () => {
    setAutoStartLoading(true);
    try {
      if (autoStart) {
        await disable();
        setAutoStart(false);
      } else {
        await enable();
        setAutoStart(true);
      }
    } catch {
      // state stays unchanged
    } finally {
      setAutoStartLoading(false);
    }
  };

  const handleChangePath = async () => {
    setPathError(null);
    setPathLoading(true);
    try {
      const selected = await open({
        multiple: false,
        title: t("settings.pickGame"),
      });
      if (selected) {
        const valid = await onPathChange(selected as string);
        if (!valid) {
          setPathError(t("settings.invalidPath"));
        }
      }
    } catch {
      setPathError(t("settings.dialogFailed"));
    } finally {
      setPathLoading(false);
    }
  };

  const handleClearContent = async () => {
    setConfirmClear(null);
    setClearingContent(true);
    try {
      await Promise.all([clearAllSkins(), clearAllCustoms()]);
      localStorage.removeItem("zushi_skin_selection");
      localStorage.removeItem("zushi_customs_enabled");
      await Promise.all([onSkinsCleared(), onCustomsCleared()]);
    } catch {
      // ignore
    }
    setClearingContent(false);
    await refreshCache();
  };

  const handleClearWork = async () => {
    setConfirmClear(null);
    setClearingWork(true);
    try {
      await clearWorkDir();
    } catch {
      // ignore
    }
    setClearingWork(false);
    await refreshCache();
  };

  const contentSize = skinsSize + customsSize;
  const totalSize = skinsSize + workSize + customsSize;
  const contentPct = totalSize > 0 ? (contentSize / totalSize) * 100 : 0;
  const workPct = totalSize > 0 ? (workSize / totalSize) * 100 : 0;

  return (
    <div className="flex h-full flex-col">
      <div
        data-tauri-drag-region
        className="border-border flex h-[52px] shrink-0 items-center border-b px-4"
      >
        <span className="text-ink text-[13px] font-medium select-none">
          {t("nav.settings")}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl px-6 py-5">
          {/* General */}
          <div className="px-1 pb-2">
            <span className="text-ink-muted text-[11px] font-semibold tracking-wider uppercase select-none">
              {t("settings.general")}
            </span>
          </div>

          <div className="mac-surface divide-y divide-white/[0.06] rounded-[10px]">
            {/* Auto-start */}
            <div className="flex items-center justify-between gap-4 px-4 py-3.5">
              <div className="flex items-center gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] border border-white/[0.07] bg-white/[0.04]">
                  <Power size={14} strokeWidth={1.75} className="text-ink-secondary" />
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-ink text-[13px] font-medium">{t("settings.autostart")}</span>
                  <span className="text-ink-muted text-xs">{t("settings.autostartHint")}</span>
                </div>
              </div>
              <button
                onClick={handleAutoStartToggle}
                disabled={autoStartLoading}
                aria-pressed={autoStart}
                className={[
                  "relative h-[22px] w-[38px] shrink-0 cursor-default rounded-full shadow-[inset_0_1px_2px_rgba(0,0,0,0.35)] transition-colors duration-200",
                  "focus:outline-none disabled:cursor-not-allowed disabled:opacity-40",
                  autoStart ? "bg-success" : "bg-white/[0.16]",
                ].join(" ")}
              >
                <span
                  className={[
                    "absolute top-[2px] left-[2px] h-[18px] w-[18px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.45)] transition-transform duration-200",
                    autoStart ? "translate-x-[16px]" : "translate-x-0",
                  ].join(" ")}
                />
              </button>
            </div>

            {/* Language */}
            <div className="flex items-center justify-between gap-4 px-4 py-3.5">
              <div className="flex items-center gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] border border-white/[0.07] bg-white/[0.04]">
                  <Languages size={14} strokeWidth={1.75} className="text-ink-secondary" />
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-ink text-[13px] font-medium">{t("settings.language")}</span>
                  <span className="text-ink-muted text-xs">{t("settings.languageHint")}</span>
                </div>
              </div>
              <div className="flex shrink-0 rounded-[8px] border border-white/[0.08] bg-black/30 p-0.5 shadow-[inset_0_1px_2px_rgba(0,0,0,0.35)]">
                {(
                  [
                    ["pt", "Português (BR)"],
                    ["en", "English"],
                  ] as [Lang, string][]
                ).map(([code, label]) => (
                  <button
                    key={code}
                    onClick={() => setLang(code)}
                    aria-pressed={lang === code}
                    className={[
                      "cursor-default rounded-[6px] px-3 py-1 text-xs transition-all",
                      lang === code
                        ? "bg-gold-400 text-charcoal-600 font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_1px_2px_rgba(0,0,0,0.3)]"
                        : "text-ink-secondary hover:text-ink",
                    ].join(" ")}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Game path */}
            <div className="flex items-center justify-between gap-4 px-4 py-3.5">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] border border-white/[0.07] bg-white/[0.04]">
                  <FolderOpen size={14} strokeWidth={1.75} className="text-ink-secondary" />
                </div>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-ink text-[13px] font-medium">{t("settings.gamePath")}</span>
                  <span className="text-ink-muted truncate font-mono text-[11.5px]">
                    {gamePath ?? t("settings.notSet")}
                  </span>
                </div>
              </div>
              <button
                onClick={handleChangePath}
                disabled={pathLoading}
                className="mac-btn h-7 shrink-0 cursor-default rounded-[7px] px-3 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pathLoading ? t("settings.validating") : t("settings.change")}
              </button>
            </div>
          </div>

          {/* Storage */}
          <div className="mt-6 px-1 pb-2">
            <span className="text-ink-muted text-[11px] font-semibold tracking-wider uppercase select-none">
              {t("settings.storage")}
            </span>
          </div>

          {/* Total usage + macOS-style segmented bar */}
          <div className="mac-surface mb-3 flex flex-col gap-2.5 rounded-[10px] px-4 py-3.5">
            <div className="flex items-center gap-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] border border-white/[0.07] bg-white/[0.04]">
                <HardDrive size={14} strokeWidth={1.75} className="text-ink-secondary" />
              </div>
              <span className="text-ink flex-1 text-[13px] font-medium">{t("settings.total")}</span>
              <span className="text-ink text-[13px] font-semibold tabular-nums">
                {cacheLoading ? "…" : formatSize(totalSize)}
              </span>
            </div>

            {!cacheLoading && totalSize > 0 && (
              <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-black/35">
                {contentSize > 0 && (
                  <div
                    className="bg-gold-400 h-full min-w-[4px] transition-all duration-300"
                    style={{ width: `${contentPct}%` }}
                  />
                )}
                {workSize > 0 && (
                  <div
                    className="bg-hextech/85 h-full min-w-[4px] transition-all duration-300"
                    style={{ width: `${workPct}%` }}
                  />
                )}
              </div>
            )}
          </div>

          <div className="mac-surface divide-y divide-white/[0.06] rounded-[10px]">
            {/* Skins & custom mods */}
            <div className="flex items-center justify-between gap-4 px-4 py-3.5">
              <div className="flex min-w-0 flex-1 items-start gap-2.5">
                <span className="bg-gold-400 mt-1.5 h-2 w-2 shrink-0 rounded-full" />
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-ink text-[13px] font-medium">{t("settings.content")}</span>
                  <span className="text-ink-muted text-xs">{t("settings.contentHint")}</span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3.5">
                <span className="text-ink-secondary min-w-16 text-right text-[13px] tabular-nums">
                  {cacheLoading ? "…" : formatSize(contentSize)}
                </span>
                <button
                  onClick={() => setConfirmClear("content")}
                  disabled={clearingContent || contentSize === 0 || patcherActive}
                  className="mac-btn hover:text-error hover:border-error/35 hover:bg-error/10 flex h-7 cursor-default items-center gap-1.5 rounded-[7px] px-2.5 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-35"
                >
                  {clearingContent ? (
                    <Loader2 size={12.5} strokeWidth={2} className="animate-spin" />
                  ) : (
                    <Trash2 size={12.5} strokeWidth={1.75} />
                  )}
                  {t("settings.clear")}
                </button>
              </div>
            </div>

            {/* Patcher data */}
            <div className="flex items-center justify-between gap-4 px-4 py-3.5">
              <div className="flex min-w-0 flex-1 items-start gap-2.5">
                <span className="bg-hextech/85 mt-1.5 h-2 w-2 shrink-0 rounded-full" />
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-ink text-[13px] font-medium">{t("settings.work")}</span>
                  <span className="text-ink-muted text-xs leading-relaxed">
                    {t("settings.workHint")}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3.5">
                <span className="text-ink-secondary min-w-16 text-right text-[13px] tabular-nums">
                  {cacheLoading ? "…" : formatSize(workSize)}
                </span>
                <button
                  onClick={() => setConfirmClear("work")}
                  disabled={clearingWork || workSize === 0 || patcherActive}
                  className="mac-btn hover:text-error hover:border-error/35 hover:bg-error/10 flex h-7 cursor-default items-center gap-1.5 rounded-[7px] px-2.5 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-35"
                >
                  {clearingWork ? (
                    <Loader2 size={12.5} strokeWidth={2} className="animate-spin" />
                  ) : (
                    <Trash2 size={12.5} strokeWidth={1.75} />
                  )}
                  {t("settings.clear")}
                </button>
              </div>
            </div>
          </div>

          {patcherActive && (
            <p className="text-ink-muted mt-2.5 px-1 text-xs">{t("settings.stopFirst")}</p>
          )}
        </div>
      </div>

      {confirmClear === "content" && (
        <ConfirmDialog
          title={t("settings.clearContentTitle")}
          description={t("settings.clearContentBody", { size: formatSize(contentSize) })}
          confirmLabel={t("settings.clear")}
          cancelLabel={t("common.cancel")}
          onConfirm={handleClearContent}
          onCancel={() => setConfirmClear(null)}
        />
      )}

      {confirmClear === "work" && (
        <ConfirmDialog
          title={t("settings.clearWorkTitle")}
          description={t("settings.clearWorkBody", { size: formatSize(workSize) })}
          confirmLabel={t("settings.clear")}
          cancelLabel={t("common.cancel")}
          onConfirm={handleClearWork}
          onCancel={() => setConfirmClear(null)}
        />
      )}

      {pathError && <Toast message={pathError} onClose={() => setPathError(null)} />}
    </div>
  );
}
