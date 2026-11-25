import { useState } from "react";
import ArtImage from "./ArtImage";
import { ArrowLeft, Download, Check, Loader2, Info } from "lucide-react";
import {
  useSkinData,
  skinDownloadUrl,
  isSkinAvailable,
  getSplashNum,
  skinDisplayName,
  formLabel,
  baseFormLabelOf,
  skinSplashUrlById,
  skinIsType,
  SKIN_TYPES,
  type SkinType,
} from "../hooks/useSkinData";
import {
  splashUrl,
  championAvatar,
  championDisplayName,
  championTitle,
} from "../hooks/useChampions";
import { useI18n, t as translate, type Key } from "../lib/i18n";
import RarityBadge from "./RarityBadge";
import { FormPreview, FormThumb } from "./FormPreview";
import { formIcon } from "../lib/forms";
import SkinTypeChips from "./SkinTypeChips";
import type { Champion, Skin, Chroma, SkinGroup } from "../types";

interface ChampionDetailProps {
  champion: Champion;
  onBack: () => void;
  isDownloaded: (championName: string, skinName: string) => boolean;
  downloading: string | null;
  onDownload: (url: string, championName: string, skinName: string) => void;
  onDownloadAll: (items: { url: string; championName: string; skinName: string }[]) => void;
  skinType: SkinType | null;
  onSkinTypeChange: (type: SkinType | null) => void;
}

type SkinState = {
  downloaded: boolean;
  isDownloading: boolean;
  available: boolean;
  url: string | null;
};

function SkinSplash({ skin }: { skin: Skin }) {
  const { t } = useI18n();
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="bg-charcoal-600 flex h-full w-full items-center justify-center">
        <span className="text-ink-muted text-[10px] select-none">{t("detail.noPreview")}</span>
      </div>
    );
  }

  return (
    <ArtImage
      srcs={[skinSplashUrlById(skin.id), splashUrl(skin.championId, getSplashNum(skin))]}
      alt={skin.name}
      className="h-full w-full object-cover object-[center_30%] group-hover:scale-[1.04]"
      onFail={() => setFailed(true)}
    />
  );
}

// Plain `t`: called during render by components that already subscribe via useI18n.
function variantTitle(name: string, s: SkinState): string {
  if (s.downloaded) return translate("detail.variantDownloaded", { name });
  if (!s.available) return translate("detail.variantMissing", { name });
  return translate("detail.variantDownload", { name });
}

function ChromaSwatch({
  chroma,
  state,
  disabled,
  onDownload,
}: {
  chroma: Chroma;
  state: SkinState;
  disabled: boolean;
  onDownload: () => void;
}) {
  const [c1, c2] = chroma.colors;
  const bg = !c1 ? undefined : c2 ? `linear-gradient(135deg, ${c1} 0% 50%, ${c2} 50% 100%)` : c1;
  const clickable = state.available && !state.downloaded && !disabled;

  return (
    <button
      onClick={clickable ? onDownload : undefined}
      disabled={!clickable}
      title={variantTitle(skinDisplayName(chroma), state)}
      className={[
        "relative h-5 w-5 shrink-0 rounded-sm transition-all",
        state.downloaded
          ? "ring-success/80 ring-offset-charcoal-500 ring-2 ring-offset-1"
          : state.available
            ? "ring-charcoal-50/30 ring-1"
            : "ring-charcoal-50/10 opacity-30 ring-1",
        clickable ? "hover:ring-gold-400 cursor-pointer hover:scale-110" : "cursor-default",
      ].join(" ")}
      style={{ background: bg ?? "var(--color-charcoal-200)" }}
    >
      {state.isDownloading && (
        <Loader2
          size={11}
          className="absolute inset-0 m-auto animate-spin text-white drop-shadow"
        />
      )}
    </button>
  );
}

function FormPill({
  label,
  fullName,
  icon,
  state,
  disabled,
  onDownload,
  onPreview,
}: {
  label: string;
  fullName: string;
  icon: string | null;
  state: SkinState;
  disabled: boolean;
  onDownload: () => void;
  onPreview: (preview: { icon: string | null; label: string } | null) => void;
}) {
  const clickable = state.available && !state.downloaded && !disabled;
  return (
    // A wrapper takes the hover: disabled buttons don't fire mouse events.
    <span onMouseEnter={() => onPreview({ icon, label })} onMouseLeave={() => onPreview(null)}>
      <button
        onClick={clickable ? onDownload : undefined}
        disabled={!clickable}
        title={variantTitle(fullName, state)}
        className={[
          "flex h-6 items-center gap-1 rounded-sm border px-1.5 text-[10px] leading-none transition-colors",
          state.downloaded
            ? "border-success/40 bg-success/10 text-success"
            : state.available
              ? "border-charcoal-50/30 text-ink-secondary"
              : "border-charcoal-50/10 text-ink-muted opacity-40",
          clickable ? "hover:border-gold-400 hover:text-gold-300 cursor-pointer" : "cursor-default",
        ].join(" ")}
      >
        {state.isDownloading ? (
          <Loader2 size={9} className="animate-spin" />
        ) : state.downloaded ? (
          <Check size={9} strokeWidth={3} />
        ) : (
          <FormThumb icon={icon} />
        )}
        {label}
      </button>
    </span>
  );
}

function SkinCard({
  group,
  stateOf,
  busy,
  onDownloadGroup,
  onDownloadOne,
}: {
  group: SkinGroup;
  stateOf: (skin: Skin) => SkinState;
  busy: boolean;
  onDownloadGroup: (group: SkinGroup) => void;
  onDownloadOne: (skin: Skin) => void;
}) {
  const { t } = useI18n();
  const baseState = stateOf(group.base);
  const variants: Skin[] = [group.base, ...group.chromas, ...group.forms];
  const states = variants.map(stateOf);
  const allDownloaded = states.every((s) => s.downloaded || !s.available);
  const anyDownloading = states.some((s) => s.isDownloading);
  const downloadedCount = states.filter((s) => s.downloaded).length;
  const name = skinDisplayName(group.base);
  // Form whose picture shows over the splash while its button is hovered.
  const [preview, setPreview] = useState<{ icon: string | null; label: string } | null>(null);

  return (
    <div
      className={[
        "group bg-charcoal-500 relative flex flex-col overflow-hidden rounded-md border transition-colors",
        baseState.available
          ? "border-charcoal-50/20 hover:border-gold-400/50"
          : "border-charcoal-50/10 opacity-50",
      ].join(" ")}
    >
      <div className="bg-charcoal-600 relative aspect-video overflow-hidden">
        <SkinSplash skin={group.base} />
        {preview && <FormPreview icon={preview.icon} label={preview.label} />}

        <div className="absolute top-2 right-2 z-10">
          {anyDownloading ? (
            <span className="bg-gold-400/90 flex h-7 w-7 items-center justify-center rounded-full shadow-lg">
              <Loader2 size={14} strokeWidth={2} className="text-charcoal-600 animate-spin" />
            </span>
          ) : allDownloaded && downloadedCount > 0 ? (
            <span className="bg-success/90 flex h-7 w-7 items-center justify-center rounded-full border border-white/20 shadow-lg">
              <Check size={14} strokeWidth={2.5} className="text-white" />
            </span>
          ) : baseState.available && !busy ? (
            <button
              onClick={() => onDownloadGroup(group)}
              className="bg-charcoal-600/85 hover:bg-gold-400 hover:text-charcoal-600 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-white/10 text-white shadow-lg transition-colors"
              title={
                variants.length > 1
                  ? `${t("detail.downloadGroup")} (${variants.length})`
                  : t("detail.download")
              }
            >
              <Download size={14} strokeWidth={2} />
            </button>
          ) : null}
        </div>

        {downloadedCount > 0 && !allDownloaded && (
          <span className="bg-charcoal-600/90 text-success absolute top-2 left-2 rounded-full px-1.5 text-[10px] leading-5 font-medium tabular-nums">
            {downloadedCount}/{variants.length}
          </span>
        )}

        {!baseState.available && (
          <div className="bg-charcoal-600/60 absolute inset-0 flex items-center justify-center">
            <span className="text-[10px] font-medium tracking-wide text-white/60 uppercase select-none">
              {t("detail.notAvailable")}
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1.5 px-3 pt-2 pb-2.5">
        <p className="text-ink line-clamp-2 text-xs leading-snug font-medium" title={name}>
          {name}
        </p>
        <RarityBadge skinId={group.base.id} />

        {group.forms.length > 0 && (
          <div className="mt-0.5 flex flex-col gap-1">
            <span className="text-gold-400/80 text-[9.5px] font-semibold tracking-wider uppercase select-none">
              {t("detail.forms")}
            </span>
            <div className="flex flex-wrap gap-1">
              <FormPill
                label={baseFormLabelOf(group.base.id)}
                fullName={name}
                icon={formIcon(group.base.id)}
                state={baseState}
                disabled={busy}
                onDownload={() => onDownloadOne(group.base)}
                onPreview={setPreview}
              />
              {group.forms.map((f) => (
                <FormPill
                  key={f.id}
                  label={formLabel(f)}
                  fullName={skinDisplayName(f)}
                  icon={formIcon(f.id)}
                  state={stateOf(f)}
                  disabled={busy}
                  onDownload={() => onDownloadOne(f)}
                  onPreview={setPreview}
                />
              ))}
            </div>
          </div>
        )}

        {group.chromas.length > 0 && (
          <div className="mt-0.5 flex flex-col gap-1">
            <span className="text-ink-muted text-[9.5px] font-semibold tracking-wider uppercase select-none">
              {t("detail.chromas")}
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {group.chromas.map((chroma) => (
                <ChromaSwatch
                  key={chroma.id}
                  chroma={chroma}
                  state={stateOf(chroma)}
                  disabled={busy}
                  onDownload={() => onDownloadOne(chroma)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ChampionDetail({
  champion,
  onBack,
  isDownloaded,
  downloading,
  onDownload,
  onDownloadAll,
  skinType,
  onSkinTypeChange,
}: ChampionDetailProps) {
  const { t } = useI18n();
  const { skins, groups, loading, error } = useSkinData(champion);

  const typeCounts = new Map<SkinType, number>();
  for (const g of groups) {
    for (const type of SKIN_TYPES) {
      if (skinIsType(g.base.id, type, g.forms.length > 0)) {
        typeCounts.set(type, (typeCounts.get(type) ?? 0) + 1);
      }
    }
  }
  // A type picked on the champion grid may not exist for this champion: show all then.
  const activeType = skinType && typeCounts.has(skinType) ? skinType : null;
  const visibleGroups = activeType
    ? groups.filter((g) => skinIsType(g.base.id, activeType, g.forms.length > 0))
    : groups;

  const busy = downloading !== null;
  const notDownloaded = skins.filter(
    (s) => !isDownloaded(s.championName, s.name) && isSkinAvailable(s)
  );
  const downloadedCount = skins.filter((s) => isDownloaded(s.championName, s.name)).length;
  const allDownloaded = notDownloaded.length === 0 && skins.length > 0;
  const hasForms = groups.some((g) => g.forms.length > 0);

  const stateOf = (skin: Skin): SkinState => ({
    downloaded: isDownloaded(skin.championName, skin.name),
    isDownloading: downloading === `${skin.championName}/${skin.name}`,
    available: isSkinAvailable(skin),
    url: skinDownloadUrl(skin),
  });

  const toItems = (list: Skin[]) => {
    const items: { url: string; championName: string; skinName: string }[] = [];
    for (const s of list) {
      if (isDownloaded(s.championName, s.name)) continue;
      const url = skinDownloadUrl(s);
      if (url) items.push({ url, championName: s.championName, skinName: s.name });
    }
    return items;
  };

  const download = (list: Skin[]) => {
    const items = toItems(list);
    if (items.length === 1) onDownload(items[0].url, items[0].championName, items[0].skinName);
    else if (items.length > 1) onDownloadAll(items);
  };

  const name = championDisplayName(champion);

  return (
    <div className="flex h-full flex-col">
      <div
        data-tauri-drag-region
        className="border-border relative flex shrink-0 items-center gap-3 overflow-hidden border-b px-4 py-3"
      >
        {/* Faint splash of the default skin behind the header */}
        <img
          src={
            skinSplashUrlById(String(parseInt(champion.key, 10) * 1000)) ??
            splashUrl(champion.id, 0)
          }
          alt=""
          className="pointer-events-none absolute inset-0 h-full w-full object-cover object-[center_25%] opacity-[0.14]"
          draggable={false}
        />
        <div className="from-charcoal-400 via-charcoal-400/80 pointer-events-none absolute inset-0 bg-linear-to-r to-transparent" />

        <button
          onClick={onBack}
          title={t("detail.back")}
          className="hover:bg-charcoal-200 text-ink-muted hover:text-ink relative -ml-1 flex h-8 w-8 cursor-pointer items-center justify-center rounded-md transition-colors"
        >
          <ArrowLeft size={20} strokeWidth={1.5} />
        </button>

        <img
          src={championAvatar(champion.id)}
          alt={name}
          className="border-gold-400/40 relative h-10 w-10 rounded-sm border"
          draggable={false}
        />

        <div className="relative flex min-w-0 flex-col">
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="text-ink truncate text-base font-semibold">{name}</span>
            <span className="text-ink-muted truncate text-xs">{championTitle(champion)}</span>
          </div>
          <div className="mt-0.5 flex items-center gap-1.5">
            {champion.tags.map((tag) => (
              <span
                key={tag}
                className="bg-charcoal-200/80 text-ink-secondary rounded-sm px-1.5 text-[10px] leading-4"
              >
                {t(`tag.${tag}` as Key)}
              </span>
            ))}
          </div>
        </div>

        <div className="relative ml-auto flex shrink-0 items-center gap-3">
          {!loading && (
            <span className="text-ink-muted text-[11px] tabular-nums select-none">
              {t("detail.skins", { n: groups.length })}
              {downloadedCount > 0 && (
                <span className="text-success">
                  {" "}
                  · {t("detail.downloaded", { n: downloadedCount })}
                </span>
              )}
            </span>
          )}

          {!loading && skins.length > 0 && !allDownloaded && (
            <button
              onClick={() => download(notDownloaded)}
              disabled={busy}
              className="btn-gold flex cursor-pointer items-center gap-1.5 rounded px-3 py-1.5 text-xs font-semibold transition-colors disabled:pointer-events-none disabled:opacity-40"
            >
              <Download size={13} strokeWidth={2} />
              {t("detail.downloadAll")}
            </button>
          )}
        </div>
      </div>

      {!loading && groups.length > 0 && typeCounts.size > 0 && (
        <div className="border-border shrink-0 border-b px-4 py-2">
          <SkinTypeChips
            value={activeType}
            onChange={onSkinTypeChange}
            allLabel={t("detail.allSkins")}
            counts={typeCounts}
            total={groups.length}
          />
        </div>
      )}

      {hasForms && !loading && (!activeType || activeType === "forms") && (
        <div className="bg-gold-400/8 border-gold-400/15 mx-4 mt-3 flex items-start gap-2.5 rounded-lg border px-3 py-2">
          <Info size={14} strokeWidth={1.5} className="text-gold-400 mt-0.5 shrink-0" />
          <p className="text-ink-secondary text-xs leading-relaxed">{t("detail.formsHint")}</p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
            {Array.from({ length: 8 }, (_, i) => (
              <div
                key={i}
                className="bg-charcoal-500 border-charcoal-50/10 overflow-hidden rounded-md border"
              >
                <div className="bg-charcoal-600 aspect-video animate-pulse" />
                <div className="space-y-2 px-3 py-3">
                  <div className="bg-charcoal-300 h-2.5 w-3/4 rounded-sm" />
                  <div className="bg-charcoal-300 h-2 w-1/3 rounded-sm" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="flex h-32 flex-col items-center justify-center gap-1">
            <span className="text-error text-sm">{t("detail.failed")}</span>
            <span className="text-ink-muted text-xs">{error}</span>
          </div>
        ) : groups.length === 0 ? (
          <div className="flex h-32 items-center justify-center">
            <span className="text-ink-muted text-sm">{t("detail.none")}</span>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
            {visibleGroups.map((group) => (
              <SkinCard
                key={group.base.id}
                group={group}
                stateOf={stateOf}
                busy={busy}
                onDownloadGroup={(g) => download([g.base, ...g.chromas, ...g.forms])}
                onDownloadOne={(s) => download([s])}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
