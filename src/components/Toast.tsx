import { useEffect, useRef, useState } from "react";
import { X, CheckCircle2, AlertCircle } from "lucide-react";

interface ToastProps {
  message: string;
  onClose: () => void;
  duration?: number;
  variant?: "error" | "success";
}

export default function Toast({
  message,
  onClose,
  duration = 4000,
  variant = "error",
}: ToastProps) {
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
        "fixed top-3.5 right-4 z-50",
        "flex items-center gap-2.5 rounded-[10px] py-2.5 pr-2.5 pl-3.5",
        "border border-white/[0.14] bg-[#26262b]/92 backdrop-blur-2xl",
        "shadow-[0_14px_38px_rgba(0,0,0,0.58),inset_0_1px_0_rgba(255,255,255,0.08)]",
        "transition-[transform,opacity] duration-200 ease-out",
        visible ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0",
      ].join(" ")}
    >
      {variant === "success" ? (
        <CheckCircle2 size={15} strokeWidth={2} className="text-success shrink-0" />
      ) : (
        <AlertCircle size={15} strokeWidth={2} className="text-error shrink-0" />
      )}
      <span className="text-ink max-w-sm text-[13px]">{message}</span>
      <button
        onClick={close}
        className="text-ink-muted hover:text-ink flex h-6 w-6 shrink-0 cursor-default items-center justify-center rounded-md transition-colors hover:bg-white/[0.08]"
        aria-label="Close"
      >
        <X size={13} strokeWidth={2} />
      </button>
    </div>
  );
}
