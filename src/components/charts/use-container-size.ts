"use client";

import { useEffect, useRef, useState } from "react";

export type ContainerSize = { width: number; height: number };

/** Tracks an element's content-box size with a ResizeObserver; null until first measured. */
export function useContainerSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState<ContainerSize | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize((current) =>
        current && current.width === width && current.height === height ? current : { width, height },
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { ref, size };
}
