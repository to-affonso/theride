'use client';

/**
 * Tooltip — hover/focus tooltip for jargon and metric labels.
 *
 * Use sparingly: jargon definitions, abbreviations, units. Don't use for
 * decorative or redundant text.
 *
 * Trigger has a dotted underline so users discover it's interactive.
 */

import { ReactNode, useState, useRef, useEffect } from 'react';

interface TooltipProps {
  /** Content shown inside the tooltip. Can be rich JSX. */
  content: ReactNode;
  /** The element that triggers the tooltip on hover/focus. */
  children: ReactNode;
  /** Side relative to trigger. Defaults to 'top'. */
  side?: 'top' | 'bottom';
  /** Width of tooltip in px. Defaults to 240. */
  width?: number;
}

export function Tooltip({ content, children, side = 'top', width = 240 }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function show() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setVisible(true), 200);
  }
  function hide() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setVisible(false);
  }

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  return (
    <span
      className="tooltip-trigger"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      tabIndex={0}
    >
      {children}
      {visible && (
        <span className={`tooltip-content tooltip-${side}`} style={{ width }} role="tooltip">
          {content}
        </span>
      )}
    </span>
  );
}
