import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Trash2 } from "lucide-react";

interface ConfirmDialogProps {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
  /** Optional preview media (e.g. skin thumbnail) shown at the top of the sheet. */
  preview?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}

/** macOS-style alert dialog (NSAlert) for confirming destructive actions. */
export default function ConfirmDialog({
  title,
  description,
  confirmLabel,
  cancelLabel,
  destructive = true,
  preview,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      } else if (e.key === "Enter") {
        e.preventDefault();
        onConfirm();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel, onConfirm]);

  return createPortal(
    <div
      className="animate-backdrop-in fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-[3px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        className="animate-sheet-in flex w-[320px] flex-col items-center rounded-[14px] border border-white/[0.14] bg-[#242429]/96 px-5 pt-5 pb-4 text-center shadow-[0_24px_64px_rgba(0,0,0,0.68),inset_0_1px_0_rgba(255,255,255,0.09)] backdrop-blur-2xl select-none"
      >
        {preview ? (
          <div className="mb-3.5">{preview}</div>
        ) : (
          <div
            className={[
              "mb-3.5 flex h-11 w-11 items-center justify-center rounded-full border",
              destructive
                ? "border-error/25 bg-error/12 text-error"
                : "border-gold-400/25 bg-gold-400/12 text-gold-400",
            ].join(" ")}
          >
            <Trash2 size={20} strokeWidth={1.75} />
          </div>
        )}

        <h2 className="text-ink text-[14px] leading-snug font-semibold">{title}</h2>
        <p className="text-ink-secondary mt-1.5 text-[12px] leading-relaxed">{description}</p>

        <div className="mt-5 grid w-full grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="mac-btn h-8 cursor-default rounded-[7px] text-[12.5px] font-medium transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={[
              "h-8 cursor-default rounded-[7px] text-[12.5px] font-semibold transition-all",
              destructive ? "mac-btn-danger" : "btn-gold",
            ].join(" ")}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
