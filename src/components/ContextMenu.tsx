import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type ContextMenuItem =
  | { type: "separator" }
  | { type: "header"; label: string }
  | {
      type?: "action";
      label: string;
      icon?: ReactNode;
      destructive?: boolean;
      disabled?: boolean;
      onSelect: () => void;
    };

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

const EDGE_PAD = 8;

/** macOS-style floating dark-glass popover / context menu (NSMenu). */
export default function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const maxLeft = window.innerWidth - rect.width - EDGE_PAD;
    const maxTop = window.innerHeight - rect.height - EDGE_PAD;
    setPos({
      left: Math.max(EDGE_PAD, Math.min(x, maxLeft)),
      top: Math.max(EDGE_PAD, Math.min(y, maxTop)),
    });
  }, [x, y]);

  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    const onDismiss = () => onClose();

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
  }, [onClose]);

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      style={{ left: pos.left, top: pos.top }}
      onContextMenu={(e) => e.preventDefault()}
      className="animate-menu-in fixed z-50 min-w-[190px] max-w-[260px] rounded-[10px] border border-white/[0.14] bg-[#242429]/95 p-1 shadow-[0_14px_38px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-2xl select-none"
    >
      {items.map((item, idx) => {
        if (item.type === "separator") {
          return <div key={`sep-${idx}`} className="mx-2 my-1 h-px bg-white/[0.09]" />;
        }
        if (item.type === "header") {
          return (
            <div
              key={`hdr-${idx}`}
              className="text-ink-muted truncate px-2.5 pt-1 pb-1 text-[10.5px] font-medium"
            >
              {item.label}
            </div>
          );
        }
        return (
          <button
            key={`${item.label}-${idx}`}
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              if (item.disabled) return;
              onClose();
              item.onSelect();
            }}
            className={[
              "flex w-full cursor-default items-center gap-2 rounded-[6px] px-2.5 py-1.5 text-left text-[12.5px] leading-tight transition-colors duration-75",
              item.disabled
                ? "text-ink-muted/50 cursor-default"
                : item.destructive
                  ? "text-error hover:bg-error hover:text-white"
                  : "text-ink hover:bg-white/[0.11]",
            ].join(" ")}
          >
            {item.icon && <span className="flex shrink-0 items-center opacity-85">{item.icon}</span>}
            <span className="truncate">{item.label}</span>
          </button>
        );
      })}
    </div>,
    document.body
  );
}
