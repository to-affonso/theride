'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Measure a container's width via ResizeObserver.
 *
 * Used by SVG-based charts so their viewBox can match real pixel dimensions —
 * otherwise `width="100%"` with a fixed viewBox scales text and geometry
 * uniformly, breaking font-size consistency with canvas-based charts.
 */
export function useContainerWidth<T extends HTMLElement>(fallback = 600) {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(fallback);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return { ref, width };
}
