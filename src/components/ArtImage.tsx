import { useState, useEffect } from "react";

interface ArtImageProps {
  /** Candidate URLs, best first; nulls are skipped. The next one is tried on error or timeout. */
  srcs: (string | null | undefined)[];
  alt: string;
  className?: string;
  /** Load only when scrolled near (long lists such as the champion grid). */
  lazy?: boolean;
  onFail?: () => void;
}

// A source that hasn't loaded by then is skipped for the next one (a stalled CDN).
const SOURCE_TIMEOUT_MS = 8000;

/**
 * Image with fallbacks over a placeholder. The image is drawn above the
 * placeholder, so it shows as soon as it paints even if no load event arrives.
 */
export default function ArtImage({
  srcs,
  alt,
  className = "",
  lazy = false,
  onFail,
}: ArtImageProps) {
  const list = srcs.filter((s): s is string => !!s);
  const key = list.join("|");
  const [index, setIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setIndex(0);
    setLoaded(false);
  }, [key]);

  const src = list[index];

  useEffect(() => {
    if (!src) {
      onFail?.();
      return;
    }
    if (loaded || index >= list.length - 1) return;
    const timer = setTimeout(() => setIndex((i) => i + 1), SOURCE_TIMEOUT_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, loaded]);

  if (!src) return null;

  return (
    <>
      {/* Static placeholder: an infinite animation on every tile of a long list repaints
          the whole grid each frame and is what made scrolling stutter. */}
      {!loaded && <div className="bg-charcoal-300/60 absolute inset-0" />}
      <img
        key={src}
        src={src}
        alt={alt}
        className={`relative ${className} animate-fade-in transition-transform duration-300`}
        loading={lazy ? "lazy" : "eager"}
        decoding="async"
        draggable={false}
        onLoad={() => setLoaded(true)}
        onError={() => {
          setLoaded(false);
          setIndex((i) => i + 1);
        }}
      />
    </>
  );
}
