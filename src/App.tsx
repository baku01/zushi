import { useState, useEffect, useCallback, useMemo } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { Swords, Layers, Package, Settings as SettingsIcon, Star } from "lucide-react";
import { useGamePath } from "./hooks/useGamePath";
import { usePatcher } from "./hooks/usePatcher";
import { useDownloads } from "./hooks/useDownloads";
import { useSkinUpdates } from "./hooks/useSkinUpdates";
import { useCustoms } from "./hooks/useCustoms";
import { ensureChampions } from "./hooks/useChampions";
import {
  ensureSkinIds,
  ensureRepoZips,
  ensureChromaInfo,
  ensureLocalizedSkinNames,
} from "./hooks/useSkinData";
import { useI18n, onLangChange, type Key } from "./lib/i18n";
import type { SkinType } from "./hooks/useSkinData";
import { useVersionCheck } from "./hooks/useVersionCheck";
import StatusBar from "./components/StatusBar";
import DownloadBar from "./components/DownloadBar";
import GamePathSelector from "./components/GamePathSelector";
import ChampionGrid from "./components/ChampionGrid";
import ChampionDetail from "./components/ChampionDetail";
import MySkins from "./components/MySkins";
import Customs from "./components/Customs";
import Settings from "./components/Settings";
import Toast from "./components/Toast";
import UpdateBanner from "./components/UpdateBanner";
import type { Champion } from "./types";
import logo from "./assets/icon.png";

type View = "champions" | "my-skins" | "customs" | "settings";

const NAV_ITEMS: { id: View; label: Key; icon: typeof Swords }[] = [
  { id: "champions", label: "nav.champions", icon: Swords },
  { id: "my-skins", label: "nav.mySkins", icon: Layers },
  { id: "customs", label: "nav.customs", icon: Package },
  { id: "settings", label: "nav.settings", icon: SettingsIcon },
];

function App() {
  const { t } = useI18n();
  const { gamePath, detectedPath, status, selectPath, confirmSetup, checkPath } = useGamePath();
  const patcher = usePatcher();
  const dl = useDownloads();
  const skinUpdates = useSkinUpdates(dl.downloads, dl.downloadMultiple);
  const customs = useCustoms();
  const update = useVersionCheck();
  const [view, setView] = useState<View>("champions");
  const [selectedChampion, setSelectedChampion] = useState<Champion | null>(null);
  // Shared by the champion grid and a champion's skins, so a type picked on one carries over.
  const [skinType, setSkinType] = useState<SkinType | null>(null);
  const [skinSelection, setSkinSelection] = useState<Record<string, string>>(() => {
    try {
      const raw = localStorage.getItem("zushi_skin_selection");
      if (raw) return JSON.parse(raw) as Record<string, string>;
    } catch {}
    return {};
  });
  const [appVersion, setAppVersion] = useState("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    getVersion()
      .then(setAppVersion)
      .catch(() => {});
  }, []);

  // Show window once webview is ready
  useEffect(() => {
    const win = getCurrentWebviewWindow();
    win.show();
    win.setAlwaysOnTop(true).then(() => {
      win.setFocus();
      setTimeout(() => win.setAlwaysOnTop(false), 100);
    });
  }, []);

  // Preload caches
  useEffect(() => {
    ensureChampions().catch(() => {});
    ensureSkinIds().catch(() => {});
    ensureRepoZips().catch(() => {});
    ensureChromaInfo().catch(() => {});
  }, []);

  // pt_BR skin names are display-only: load them when (and only if) Portuguese is picked.
  useEffect(
    () =>
      onLangChange((lang) => {
        document.documentElement.lang = lang === "pt" ? "pt-BR" : "en";
        if (lang === "pt") void ensureLocalizedSkinNames();
      }),
    []
  );

  // Surface patcher errors as toast
  useEffect(() => {
    if (patcher.error) setToastMessage(patcher.error);
  }, [patcher.error]);

  // Surface customs errors as toast
  useEffect(() => {
    if (customs.error) setToastMessage(customs.error);
  }, [customs.error]);

  function handleNavClick(id: View): void {
    setView(id);
    if (id !== "champions") setSelectedChampion(null);
  }

  const handleApply = useCallback(() => {
    const skinPaths: string[] = [];
    for (const [championName, skinName] of Object.entries(skinSelection)) {
      const skin = dl.downloads.find(
        (d) => d.champion_name === championName && d.skin_name === skinName
      );
      if (skin) skinPaths.push(skin.zip_path);
    }
    const allPaths = [...skinPaths, ...customs.enabledPaths];
    if (allPaths.length > 0) patcher.apply(allPaths);
  }, [skinSelection, dl.downloads, customs.enabledPaths, patcher]);

  useEffect(() => {
    localStorage.setItem("zushi_skin_selection", JSON.stringify(skinSelection));
  }, [skinSelection]);

  const skinCount = Object.keys(skinSelection).length;

  const ownedCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const d of dl.downloads) counts.set(d.champion_name, (counts.get(d.champion_name) ?? 0) + 1);
    return counts;
  }, [dl.downloads]);
  const selectedChampions = useMemo(() => new Set(Object.keys(skinSelection)), [skinSelection]);

  function renderContent() {
    if (view === "settings") {
      return (
        <div className="flex-1 overflow-y-auto">
          <Settings
            gamePath={gamePath}
            onPathChange={selectPath}
            patcherActive={patcher.isActive}
            onSkinsCleared={async () => {
              setSkinSelection({});
              await dl.refresh();
            }}
            onCustomsCleared={customs.refresh}
          />
        </div>
      );
    }

    if (view === "customs") {
      return (
        <Customs
          customs={customs.customs}
          patcherActive={patcher.isActive}
          onAdd={customs.addCustom}
          onRemove={customs.remove}
          onToggle={customs.toggle}
        />
      );
    }

    if (view === "my-skins") {
      return (
        <MySkins
          downloads={dl.downloads}
          patcherActive={patcher.isActive}
          selection={skinSelection}
          onSelectionChange={setSkinSelection}
          onDelete={dl.deleteSkin}
          outdatedKeys={skinUpdates.outdatedKeys}
          updateCount={skinUpdates.outdated.length}
          updating={skinUpdates.updating || dl.downloading !== null}
          onUpdateAll={skinUpdates.updateAll}
        />
      );
    }

    if (selectedChampion) {
      return (
        <ChampionDetail
          champion={selectedChampion}
          onBack={() => setSelectedChampion(null)}
          isDownloaded={dl.isDownloaded}
          downloading={dl.downloading}
          onDownload={dl.download}
          onDownloadAll={dl.downloadMultiple}
          skinType={skinType}
          onSkinTypeChange={setSkinType}
        />
      );
    }

    return (
      <ChampionGrid
        onSelect={setSelectedChampion}
        ownedCounts={ownedCounts}
        selectedChampions={selectedChampions}
        skinType={skinType}
        onSkinTypeChange={setSkinType}
      />
    );
  }

  return (
    <div className="relative flex h-screen">
      {/* Transparent: the window's sidebar vibrancy shows through. The top strip clears
          the traffic lights of the overlay title bar and drags the window. */}
      <aside className="flex w-52 shrink-0 flex-col">
        <div data-tauri-drag-region className="h-9 shrink-0" />
        <div data-tauri-drag-region className="flex items-center gap-2.5 px-4 pb-3 select-none">
          <img src={logo} alt="Zushi" className="h-9 w-9 drop-shadow-[0_2px_8px_rgba(200,170,110,0.25)]" />
          {/* Line height must fit the glyphs: the gradient (bg-clip-text) only paints the line box. */}
          <span className="font-logo from-gold-200 to-gold-500 bg-linear-to-b bg-clip-text pt-1 text-4xl leading-[1.15] text-transparent uppercase">
            Zushi
          </span>
        </div>

        <nav className="flex flex-col gap-0.5 px-2.5 py-2 select-none">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
            const active = view === id;
            return (
              <button
                key={id}
                onClick={() => handleNavClick(id)}
                className={[
                  "flex cursor-default items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors",
                  active ? "bg-white/10 text-ink font-medium" : "text-ink/85 hover:bg-white/5",
                ].join(" ")}
              >
                <Icon
                  size={16}
                  strokeWidth={active ? 2 : 1.75}
                  className={active ? "text-gold-400" : "text-gold-400/70"}
                />
                {t(label)}
                {id === "my-skins" && skinUpdates.outdated.length === 0 && dl.downloads.length > 0 && (
                  <span className="text-ink-muted ml-auto text-[11px] tabular-nums">
                    {dl.downloads.length}
                  </span>
                )}
                {id === "my-skins" && skinUpdates.outdated.length > 0 && (
                  <span
                    className="bg-gold-400/15 text-gold-400 ml-auto rounded-full px-1.5 text-[10px] leading-4 font-medium tabular-nums"
                    title={t("nav.updates", { n: skinUpdates.outdated.length })}
                  >
                    {skinUpdates.outdated.length}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="mt-auto">
          <button
            onClick={() =>
              invoke("open_url", { url: "https://github.com/Mouadzz/zushi" }).catch(() => {})
            }
            className="text-ink-secondary hover:text-ink mx-2.5 mb-1 flex w-[calc(100%-1.25rem)] cursor-default items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] transition-colors hover:bg-white/5"
          >
            <Star
              size={16}
              strokeWidth={1.5}
              fill="currentColor"
              className="text-gold-400 shrink-0"
            />
            <span className="truncate">{t("sidebar.star")}</span>
          </button>

          {update.updateAvailable && update.latestVersion ? (
            <UpdateBanner
              version={update.latestVersion}
              releasesUrl={update.releasesUrl}
              canInstall={update.canInstall}
              installing={update.installing}
              error={update.error}
              onInstall={update.install}
            />
          ) : (
            <div className="px-4 pb-4 select-none">
              <span className="text-ink-muted text-xs">{appVersion ? `v${appVersion}` : ""}</span>
            </div>
          )}
        </div>
      </aside>

      <div className="bg-charcoal-400 flex min-w-0 flex-1 flex-col border-l border-black/50 shadow-[-1px_0_0_rgba(255,255,255,0.04)]">
        <main className="flex flex-1 flex-col overflow-hidden">{renderContent()}</main>

        <DownloadBar downloading={dl.downloading} />

        <StatusBar
          patcherStatus={patcher.status}
          skinCount={skinCount}
          customCount={customs.enabledCount}
          onApply={handleApply}
          onStop={patcher.stop}
        />
      </div>

      {(toastMessage || dl.error) && (
        <Toast
          key={toastMessage ?? dl.error ?? ""}
          message={toastMessage ?? dl.error ?? ""}
          onClose={() => {
            setToastMessage(null);
            dl.clearError();
            customs.clearError();
          }}
        />
      )}

      {status !== "game-detected" && (
        <div className="bg-charcoal-400 absolute inset-0 z-50">
          <GamePathSelector
            onConfirm={confirmSetup}
            onSelect={selectPath}
            onCheck={checkPath}
            detectedPath={detectedPath}
            status={status}
          />
        </div>
      )}
    </div>
  );
}

export default App;
