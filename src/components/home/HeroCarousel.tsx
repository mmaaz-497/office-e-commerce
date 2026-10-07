"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import {
  HERO_ADVANCE_MS,
  HERO_DESKTOP_ASPECT,
  HERO_DESKTOP_MEDIA,
  HERO_DESKTOP_SIZES,
  HERO_MOBILE_ASPECT,
  HERO_MOBILE_MEDIA,
  HERO_MOBILE_SIZES,
  HERO_QUALITY,
  type HeroLabels,
  type HeroSlide,
} from "./hero-config";

/**
 * Art-directed hero (FR-010 to FR-013).
 *
 * Two tracks rather than one, because the breakpoints do not share a slide
 * list: the landscape banners and the portrait/square banners are different
 * artwork in different numbers, so a single track with swapped images per
 * slide cannot express it.
 *
 * Only one track is ever displayed. The hidden one costs nothing: every image
 * is `loading="lazy"`, and a lazy image inside a `display:none` subtree never
 * intersects the viewport, so the browser defers it indefinitely. The visible
 * track's first slide is warmed by the media-scoped preload links in
 * HeroPreload, so exactly one hero image is fetched per viewport (research R-002).
 *
 * No dependency: the scroll track is native CSS scroll-snap, the same pattern
 * the product gallery already uses (Constitution Principle X). The framing,
 * the progress dots and the arrows are all CSS on top of that same track —
 * none of them changes how a slide is chosen or loaded.
 */

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const list = window.matchMedia(query);
    setMatches(list.matches);
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

function Track({
  slides,
  href,
  media,
  sizes,
  aspect,
  labels,
  className,
}: {
  slides: HeroSlide[];
  href: string;
  /** The breakpoint this track owns; it only auto-advances while this matches. */
  media: string;
  sizes: string;
  aspect: string;
  labels: HeroLabels;
  className: string;
}) {
  const trackRef = useRef<HTMLUListElement>(null);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  const isActiveBreakpoint = useMediaQuery(media);
  const prefersReducedMotion = useMediaQuery(REDUCED_MOTION);

  const scrollToIndex = useCallback(
    (index: number) => {
      const track = trackRef.current;
      if (!track) return;
      track.scrollTo({
        left: index * track.clientWidth,
        // FR-013: reduced motion still navigates, it just does not animate.
        behavior: prefersReducedMotion ? "auto" : "smooth",
      });
    },
    [prefersReducedMotion],
  );

  // Derive the active slide from where the track actually is, so a manual
  // swipe and a dot press cannot disagree about which dot is lit.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const index = Number((entry.target as HTMLElement).dataset.index);
          if (!Number.isNaN(index)) setActive(index);
        }
      },
      { root: track, threshold: 0.6 },
    );

    for (const child of track.children) observer.observe(child);
    return () => observer.disconnect();
  }, [slides.length]);

  // FR-011 + FR-013: advance only while this breakpoint is the visible one,
  // motion is welcome, the visitor is not interacting, and the tab is in front.
  const advancing = isActiveBreakpoint && !prefersReducedMotion && !paused && slides.length > 1;

  useEffect(() => {
    if (!advancing) return;

    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      setActive((current) => {
        const next = (current + 1) % slides.length;
        scrollToIndex(next);
        return next;
      });
    }, HERO_ADVANCE_MS);

    return () => window.clearInterval(timer);
  }, [advancing, slides.length, scrollToIndex]);

  const step = (delta: number) => scrollToIndex((active + delta + slides.length) % slides.length);

  const pause = () => setPaused(true);
  const resume = () => setPaused(false);

  return (
    <div className={`group/hero relative ${className}`}>
      {/* The frame: radius lg on the wrapper, so the scroller's own
          `overflow-x: auto` does not have to carry the rounding. */}
      <div className="bg-surface-muted overflow-hidden rounded-lg">
        <ul
          ref={trackRef}
          className="flex w-full snap-x snap-mandatory [scrollbar-width:none] overflow-x-auto overflow-y-hidden [&::-webkit-scrollbar]:hidden"
          onPointerEnter={pause}
          onPointerLeave={resume}
          onTouchStart={pause}
          onTouchEnd={resume}
          onFocusCapture={pause}
          onBlurCapture={resume}
        >
          {slides.map((slide, index) => (
            <li
              key={slide.src}
              data-index={index}
              className={`${aspect} w-full flex-none snap-center`}
            >
              <Link href={href} aria-label={labels.viewProduct} className="block h-full w-full">
                <Image
                  src={slide.src}
                  alt={slide.alt}
                  width={slide.width}
                  height={slide.height}
                  sizes={sizes}
                  quality={HERO_QUALITY}
                  // Every slide is lazy on purpose: it is what stops the
                  // off-breakpoint track from ever downloading. The visible
                  // first slide is already in cache from its preload link.
                  loading="lazy"
                  className="h-full w-full object-contain"
                />
              </Link>
            </li>
          ))}
        </ul>
      </div>

      {slides.length > 1 && (
        <>
          {/* Arrows are pointer affordances layered on top of a track that is
              already fully operable by swipe and by the dots below, so they are
              hidden from assistive technology rather than duplicating those
              controls in the tab order. */}
          <div aria-hidden className="pointer-events-none absolute inset-0 hidden md:block">
            {(
              [
                { delta: -1, icon: "arrowLeft", side: "left-4", label: labels.previous },
                { delta: 1, icon: "arrowRight", side: "right-4", label: labels.next },
              ] as const
            ).map(({ delta, icon, side, label }) => (
              <button
                key={label}
                type="button"
                tabIndex={-1}
                onClick={() => step(delta)}
                title={label}
                className={`pointer-events-auto absolute top-1/2 ${side} bg-surface/90 text-ink hover:bg-surface flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-md opacity-0 shadow-sm transition-[opacity,background-color] duration-150 ease-out group-hover/hero:opacity-100`}
              >
                <Icon name={icon} className="h-4 w-4" />
              </button>
            ))}
          </div>

          <div className="mt-1 flex items-center justify-center">
            {slides.map((slide, index) => (
              <button
                key={slide.src}
                type="button"
                onClick={() => scrollToIndex(index)}
                aria-label={slide.dotLabel}
                aria-current={index === active}
                // A 48 × 44 hit area around a small visual dot. The width is
                // fixed, wide enough for the active pill, so moving the active
                // dot on auto-advance never shifts its neighbours (CLS, SC-005).
                className="group/dot flex h-11 w-12 items-center justify-center px-1"
              >
                {/* A fixed 40 × 8 track: the dot and the pill are separate,
                    keyed elements inside it, so switching the active slide
                    remounts them instead of resizing (and moving) one box. */}
                <span
                  aria-hidden
                  className={`flex h-2 w-10 items-center justify-center overflow-hidden rounded-full ${
                    index === active ? "bg-primary-soft" : ""
                  }`}
                >
                  {index === active ? (
                    <span
                      // Remounted whenever the slide or the paused state changes,
                      // which is what restarts the fill from zero.
                      key={`${active}-${advancing}`}
                      className="bg-primary block h-full w-full origin-left rounded-full"
                      style={
                        advancing
                          ? {
                              animation: `hero-progress ${HERO_ADVANCE_MS}ms linear forwards`,
                            }
                          : undefined
                      }
                    />
                  ) : (
                    <span
                      key="dot"
                      className="bg-border-strong group-hover/dot:bg-ink-3 block h-2 w-2 rounded-full transition-colors duration-150 ease-out"
                    />
                  )}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function HeroCarousel({
  mobileSlides,
  desktopSlides,
  href,
  labels,
}: {
  mobileSlides: HeroSlide[];
  desktopSlides: HeroSlide[];
  href: string;
  labels: HeroLabels;
}) {
  return (
    <section aria-roledescription="carousel" aria-label={labels.region} className="relative w-full">
      <Track
        slides={mobileSlides}
        href={href}
        media={HERO_MOBILE_MEDIA}
        sizes={HERO_MOBILE_SIZES}
        aspect={HERO_MOBILE_ASPECT}
        labels={labels}
        className="md:hidden"
      />
      <Track
        slides={desktopSlides}
        href={href}
        media={HERO_DESKTOP_MEDIA}
        sizes={HERO_DESKTOP_SIZES}
        aspect={HERO_DESKTOP_ASPECT}
        labels={labels}
        className="hidden md:block"
      />
    </section>
  );
}
