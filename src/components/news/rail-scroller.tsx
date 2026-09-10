"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

type RailScrollerProps = {
  /** Accessible name for the scrollable region, e.g. "Compute stories". */
  label: string;
  children: ReactNode;
};

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400";

/**
 * Native horizontal scroller with scroll snapping and understated
 * previous/next controls on large screens. The controls only appear when
 * there is somewhere to scroll; touch and trackpad users scroll directly.
 * Children are server-rendered cards passed straight through.
 */
export function RailScroller({ label, children }: RailScrollerProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ atStart: true, atEnd: true });

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const update = () => {
      const maxScroll = scroller.scrollWidth - scroller.clientWidth;
      setEdges((current) => {
        const next = { atStart: scroller.scrollLeft <= 1, atEnd: scroller.scrollLeft >= maxScroll - 1 };
        return current.atStart === next.atStart && current.atEnd === next.atEnd ? current : next;
      });
    };

    const observer = new ResizeObserver(update);
    observer.observe(scroller);
    scroller.addEventListener("scroll", update, { passive: true });
    return () => {
      observer.disconnect();
      scroller.removeEventListener("scroll", update);
    };
  }, []);

  function scrollByPage(direction: -1 | 1) {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    scroller.scrollBy({ left: direction * scroller.clientWidth * 0.9, behavior: "smooth" });
  }

  return (
    <div className="relative">
      <div
        ref={scrollerRef}
        role="region"
        aria-label={label}
        tabIndex={0}
        className={`flex snap-x snap-proximity gap-4 overflow-x-auto scroll-smooth pb-2 [scrollbar-color:#2a2a2a_transparent] [scrollbar-width:thin] ${focusRing}`}
      >
        {children}
      </div>

      <RailButton direction={-1} hidden={edges.atStart} onClick={() => scrollByPage(-1)} />
      <RailButton direction={1} hidden={edges.atEnd} onClick={() => scrollByPage(1)} />
    </div>
  );
}

function RailButton({
  direction,
  hidden,
  onClick,
}: {
  direction: -1 | 1;
  hidden: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={direction === 1 ? "Show next stories" : "Show previous stories"}
      disabled={hidden}
      onClick={onClick}
      className={`absolute top-[calc(28%-1.25rem)] hidden size-10 items-center justify-center rounded-full border border-white/10 bg-[#111111]/90 text-neutral-200 shadow-[0_6px_20px_rgba(0,0,0,0.45)] transition-[opacity,border-color] hover:border-white/20 lg:flex ${
        direction === 1 ? "right-0 translate-x-1/2" : "left-0 -translate-x-1/2"
      } ${hidden ? "pointer-events-none opacity-0" : "opacity-100"} ${focusRing}`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="size-4"
      >
        {direction === 1 ? <path d="m9 6 6 6-6 6" /> : <path d="m15 6-6 6 6 6" />}
      </svg>
    </button>
  );
}
