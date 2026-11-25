/** A form's picture shown large over a skin's splash, with its name. */
export function FormPreview({ icon, label }: { icon: string | null; label: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-1.5 bg-black/60">
      {icon && (
        <img
          src={icon}
          alt=""
          draggable={false}
          className="max-h-[62%] max-w-[70%] object-contain drop-shadow-lg"
        />
      )}
      <span className="rounded-sm bg-black/50 px-1.5 text-[11px] leading-4 font-semibold text-white">
        {label}
      </span>
    </div>
  );
}

/** Small picture of a form inside its button. */
export function FormThumb({ icon }: { icon: string | null }) {
  if (!icon) return null;
  return (
    <img
      src={icon}
      alt=""
      draggable={false}
      className="-ml-0.5 h-4 w-4 shrink-0 rounded-[3px] object-contain"
    />
  );
}
