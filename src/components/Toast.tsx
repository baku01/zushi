import { useEffect, useRef, useState } from "react";
import { X, CheckCircle2 } from "lucide-react";

interface ToastProps {
  message: string;
  onClose: () => void;
  duration?: number;
  variant?: "error" | "success";
}

export default function Toast({ message, onClose, duration = 4000, variant = "error" }: ToastProps) {
  const [visible, setVisible] = useState(false);
  // The parent passes a fresh onClose every render: keep it out of the effect deps
  // so unrelated re-renders don't restart the timer.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    let closing: ReturnType<typeof setTimeout> | undefined;
    const timer = setTimeout(() => {
      setVisible(false);
      closing = setTimeout(() => onCloseRef.current(), 200); // wait for exit animation
    }, duration);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      clearTimeout(closing);
    };
  }, [duration]);

  const close = () => {
    setVisible(false);
    setTimeout(() => onCloseRef.current(), 200);
  };

  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={[
        "fixed top-3 right-5 z-50",
        "flex items-center gap-3 rounded-lg py-3 pr-3 pl-4",
        "bg-charcoal-200 border-border border border-l-2",
        variant === "error" ? "border-l-error" : "border-l-success",
        "shadow-lg shadow-black/40",
        "transition-[transform,opacity] duration-200 ease-out",
        visible ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0",
      ].join(" ")}
    >
      {variant === "success" && (
        <CheckCircle2 size={15} strokeWidth={2} className="text-success shrink-0" />
      )}
      <span className="text-ink-secondary max-w-sm text-sm">{message}</span>
      <button
        onClick={close}
        className="text-ink-muted hover:text-ink shrink-0 cursor-pointer transition-colors"
        aria-label="Close"
      >
        <X size={14} strokeWidth={1.5} />
      </button>
    </div>
  );
}
