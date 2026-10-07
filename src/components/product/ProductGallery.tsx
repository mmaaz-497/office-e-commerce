"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import Image from "next/image";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import type { GalleryItem } from "./gallery-items";

/**
 * The product gallery (007 FR-014, research R-702). The main view is a native
 * CSS scroll-snap track, so it swipes on touch before hydration and with no
 * carousel dependency (Constitution X). The thumbnails are the enhancement:
 * buttons that scroll the track, with the visible slide marked by an
 * IntersectionObserver.
 *
 * Every item sits in a square frame shown `object-contain` on surface-muted:
 * the banners carry baked-in text, and cropping would cut words (Design System
 * §ProductCard, legacy banners). Labels arrive translated from the server.
 */

const MAIN_SIZES = "(min-width: 1024px) 560px, (min-width: 768px) 50vw, 100vw";
const FRAME = "aspect-square w-full rounded-lg bg-surface-muted object-contain";

export function ProductGallery({
  items,
  label,
  thumbsLabel,
  thumbLabels,
  eagerFirst,
}: {
  items: GalleryItem[];
  label: string;
  /** The accessible name of the thumbnail list. */
  thumbsLabel: string;
  /** One label per item, already numbered ("Lihat foto 2", "Putar video"). */
  thumbLabels: string[];
  /** Only the product page's first image is an LCP candidate (R-702). */
  eagerFirst: boolean;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const root = track.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActive(Number((entry.target as HTMLElement).dataset.index));
          }
        }
      },
      { root, threshold: 0.6 },
    );
    for (const slide of root.children) observer.observe(slide);
    return () => observer.disconnect();
  }, [items.length]);

  const show = (index: number) => {
    const root = track.current;
    if (!root) return;
    root.scrollTo({ left: index * root.clientWidth, behavior: "smooth" });
    setActive(index);
  };

  const onThumbKey = (event: KeyboardEvent<HTMLUListElement>) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const next =
      event.key === "ArrowRight" ? Math.min(items.length - 1, active + 1) : Math.max(0, active - 1);
    show(next);
    event.currentTarget.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
  };

  if (items.length === 0) return null;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div
        ref={track}
        role="region"
        aria-label={label}
        // The track is a scroll container a keyboard user must be able to reach.
        tabIndex={0}
        className="flex snap-x snap-mandatory [scrollbar-width:none] overflow-x-auto rounded-lg [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item, index) => (
          <div key={item.src} data-index={index} className="w-full flex-none snap-center">
            {item.kind === "video" ? (
              <video
                src={item.src}
                poster={item.poster}
                controls
                playsInline
                preload="none"
                aria-label={item.alt}
                className={FRAME}
              />
            ) : (
              <Image
                src={item.src}
                alt={item.alt}
                width={item.width}
                height={item.height}
                sizes={MAIN_SIZES}
                quality={80}
                loading={eagerFirst && index === 0 ? "eager" : "lazy"}
                fetchPriority={eagerFirst && index === 0 ? "high" : undefined}
                className={FRAME}
              />
            )}
          </div>
        ))}
      </div>

      {items.length > 1 && (
        <ul
          aria-label={thumbsLabel}
          onKeyDown={onThumbKey}
          className="flex [scrollbar-width:none] gap-2 overflow-x-auto [&::-webkit-scrollbar]:hidden"
        >
          {items.map((item, index) => (
            <li key={item.src} className="flex-none">
              <button
                type="button"
                onClick={() => show(index)}
                aria-label={thumbLabels[index]}
                aria-current={active === index ? "true" : undefined}
                tabIndex={active === index ? 0 : -1}
                className={cx(
                  "bg-surface-muted relative block h-16 w-16 overflow-hidden rounded-md border-2 transition-colors duration-150 ease-out",
                  active === index ? "border-primary" : "border-border hover:border-ink-3",
                )}
              >
                <Image
                  src={item.kind === "video" ? item.poster : item.src}
                  alt=""
                  fill
                  sizes="64px"
                  // 80 is the only quality next.config.ts allows (images.qualities).
                  quality={80}
                  className="object-cover"
                />
                {item.kind === "video" && (
                  <span className="bg-ink/40 absolute inset-0 flex items-center justify-center text-white">
                    <Icon name="play" className="h-6 w-6" />
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
