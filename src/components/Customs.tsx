import { useState, useEffect, useCallback, type MouseEvent } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { open } from "@tauri-apps/plugin-dialog";
import { Upload, Check, FileArchive, Package, MoreHorizontal, Trash2, X } from "lucide-react";
import { useI18n } from "../lib/i18n";
import ContextMenu, { type ContextMenuItem } from "./ContextMenu";
import ConfirmDialog from "./ConfirmDialog";
import type { CustomMod } from "../types";

interface CustomsProps {
  customs: CustomMod[];
  patcherActive: boolean;
  onAdd: (path: string) => Promise<void>;
  onRemove: (name: string) => Promise<void>;
  onToggle: (name: string) => void;
}

type ModMenuState = {
  x: number;
  y: number;
  modName: string;
  items: ContextMenuItem[];
};

export default function Customs({
  customs,
  patcherActive,
  onAdd,
  onRemove,
  onToggle,
}: CustomsProps) {
  const { t } = useI18n();
  const [draggingOver, setDraggingOver] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState<ModMenuState | null>(null);
  const [pendingRemove, setPendingRemove] = useState<string | null>(null);

  const handleAdd = useCallback(
    async (path: string) => {
      const fileName = path.split("/").pop() ?? path;
      setAdding(fileName);
      setError(null);
      try {
        await onAdd(path);
      } catch (e) {
        setError(String(e));
      } finally {
        setAdding(null);
      }
    },
    [onAdd]
  );

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let disposed = false;

    getCurrentWebviewWindow()
      .onDragDropEvent((event) => {
        const { type } = event.payload;
        if (type === "drop") {
          setDraggingOver(false);
          if (patcherActive) return;
          const paths = (event.payload as { type: "drop"; paths: string[] }).paths;
          const zips = paths.filter((p) => {
            const lower = p.toLowerCase();
            return lower.endsWith(".zip") || lower.endsWith(".fantome") || lower.endsWith(".modpkg");
          });
          zips.forEach(handleAdd);
        } else if (type === "leave") {
          setDraggingOver(false);
        } else {
          setDraggingOver(true);
        }
      })
      .then((fn) => {
        // Cleanup can run before the listener is registered; drop it right away then,
        // otherwise a second listener stays alive and every drop imports twice.
        if (disposed) fn();
        else unlisten = fn;
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [handleAdd, patcherActive]);

  async function handleBrowse() {
    if (patcherActive) return;
    const selected = await open({
      multiple: true,
      filters: [{ name: "Mod", extensions: ["zip", "fantome", "modpkg"] }],
    });
    if (!selected) return;
    const paths = Array.isArray(selected) ? selected : [selected];
    for (const p of paths) handleAdd(p);
  }

  const openModMenu = (custom: CustomMod, x: number, y: number) => {
    if (patcherActive) return;
    setMenu({
      x,
      y,
      modName: custom.name,
      items: [
        {
          label: custom.enabled ? t("customs.disable") : t("customs.enable"),
          icon: custom.enabled ? <X size={13} strokeWidth={2} /> : <Check size={13} strokeWidth={2.2} />,
          onSelect: () => onToggle(custom.name),
        },
        { type: "separator" },
        {
          label: t("customs.removeMenu"),
          icon: <Trash2 size={13} strokeWidth={1.75} />,
          destructive: true,
          onSelect: () => setPendingRemove(custom.name),
        },
      ],
    });
  };

  const handleCardContextMenu = (e: MouseEvent, custom: CustomMod) => {
    if (patcherActive) return;
    e.preventDefault();
    openModMenu(custom, e.clientX, e.clientY);
  };

  const activeCount = customs.filter((c) => c.enabled).length;

  return (
    <div className="flex h-full flex-col">
      <div
        data-tauri-drag-region
        className="border-border flex h-[52px] shrink-0 items-center gap-2.5 border-b px-4"
      >
        <span className="text-ink text-[13px] font-medium select-none">
          {t("nav.customs")}
        </span>
        <span className="text-ink-muted text-xs tabular-nums select-none">
          · {t("customs.count", { n: customs.length })}
        </span>
        {activeCount > 0 && (
          <span className="border-gold-400/25 bg-gold-400/10 text-gold-300 ml-auto rounded-lg border px-2.5 py-1 text-xs font-medium tabular-nums select-none">
            {t("customs.active", { n: activeCount })}
          </span>
        )}
      </div>

      <div
        onClick={handleBrowse}
        className={[
          "mx-4 mt-4 flex flex-col items-center justify-center gap-2 rounded-[12px] border border-dashed px-4 py-5 transition-all",
          patcherActive
            ? "border-border cursor-default opacity-40"
            : draggingOver
              ? "border-gold-400 bg-gold-400/10 cursor-pointer"
              : "border-white/[0.13] bg-charcoal-500/45 hover:border-white/[0.22] hover:bg-charcoal-500/75 cursor-pointer",
        ].join(" ")}
      >
        <div
          className={[
            "flex h-9 w-9 items-center justify-center rounded-xl border transition-colors",
            draggingOver && !patcherActive
              ? "border-gold-400/40 bg-gold-400/15 text-gold-300"
              : "border-white/[0.08] bg-white/[0.04] text-ink-muted",
          ].join(" ")}
        >
          <Upload size={16} strokeWidth={1.75} />
        </div>
        <p
          className={`text-[13px] font-medium ${draggingOver && !patcherActive ? "text-gold-300" : "text-ink"}`}
        >
          {patcherActive
            ? t("customs.stopFirst")
            : adding
              ? t("customs.adding", { name: adding })
              : t("customs.drop")}
        </p>
        {!patcherActive && <p className="text-ink-muted text-xs">{t("customs.browse")}</p>}
      </div>

      {error && (
        <div className="bg-error/10 border-error/25 text-error mx-4 mt-2.5 rounded-lg border px-3 py-2 text-xs">
          {error}
        </div>
      )}

      {customs.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <div className="mac-surface flex h-12 w-12 items-center justify-center rounded-2xl">
            <Package size={20} strokeWidth={1.5} className="text-ink-muted" />
          </div>
          <p className="text-ink-secondary text-sm">{t("customs.none")}</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(196px,1fr))] gap-3">
            {customs.map((custom) => {
              const menuOpen = menu?.modName === custom.name;
              return (
                <div
                  key={custom.name}
                  onContextMenu={(e) => handleCardContextMenu(e, custom)}
                  className={[
                    "group/mod flex flex-col gap-2 rounded-[10px] border p-2 transition-all duration-150",
                    custom.enabled
                      ? "border-gold-400/70 bg-gold-400/[0.07] shadow-[inset_0_1px_0_rgba(234,214,166,0.14),0_0_0_1px_rgba(200,170,110,0.18)]"
                      : menuOpen
                        ? "border-white/[0.18] bg-charcoal-500"
                        : "border-white/[0.07] bg-charcoal-500/75 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] hover:border-white/[0.14] hover:bg-charcoal-500",
                  ].join(" ")}
                >
                  <button
                    onClick={() => !patcherActive && onToggle(custom.name)}
                    disabled={patcherActive}
                    className={[
                      "relative flex h-20 w-full flex-col items-center justify-center overflow-hidden rounded-[7px] border border-white/[0.06] bg-charcoal-600/80 transition-colors",
                      patcherActive ? "cursor-default opacity-50" : "cursor-pointer",
                    ].join(" ")}
                    title={custom.name}
                  >
                    <FileArchive
                      size={26}
                      strokeWidth={1.35}
                      className={custom.enabled ? "text-gold-400/85" : "text-ink-muted/50"}
                    />
                    {custom.enabled && (
                      <div className="bg-gold-400 absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-white/35 shadow-sm">
                        <Check size={11} strokeWidth={3} className="text-charcoal-600" />
                      </div>
                    )}
                  </button>

                  <div className="flex items-center justify-between gap-1.5 px-0.5">
                    <button
                      onClick={() => !patcherActive && onToggle(custom.name)}
                      disabled={patcherActive}
                      className={[
                        "text-ink min-w-0 flex-1 truncate text-left text-xs font-medium",
                        patcherActive ? "cursor-default opacity-50" : "cursor-pointer",
                      ].join(" ")}
                      title={custom.name}
                    >
                      {custom.name}
                    </button>

                    {!patcherActive && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const rect = e.currentTarget.getBoundingClientRect();
                          openModMenu(custom, rect.right - 190, rect.bottom + 4);
                        }}
                        className={[
                          "flex h-5 w-5 shrink-0 cursor-default items-center justify-center rounded-[5px] transition-all duration-150",
                          menuOpen
                            ? "bg-white/[0.12] text-ink opacity-100"
                            : "text-ink-muted/70 hover:bg-white/[0.09] hover:text-ink opacity-50 group-focus-within/mod:opacity-100 group-hover/mod:opacity-100",
                        ].join(" ")}
                        title={t("customs.actions")}
                        aria-label={t("customs.actions")}
                        aria-haspopup="menu"
                        aria-expanded={menuOpen}
                      >
                        <MoreHorizontal size={13.5} strokeWidth={2} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}

      {pendingRemove && (
        <ConfirmDialog
          title={t("customs.removeDialogTitle", { name: pendingRemove })}
          description={t("customs.removeDialogBody")}
          confirmLabel={t("customs.remove")}
          cancelLabel={t("common.cancel")}
          onConfirm={() => {
            const name = pendingRemove;
            setPendingRemove(null);
            void onRemove(name);
          }}
          onCancel={() => setPendingRemove(null)}
        />
      )}
    </div>
  );
}
