/**
 * Browser-side entry point: build a FIT file for a Session and trigger
 * a download. Client-only (uses `URL.createObjectURL` and DOM).
 */

'use client';

import type { Session } from '@/types';
import { buildFitFile, LapInput } from './build';

export { lapsFromInMemory, lapsFromDbRows } from './build';
export type { LapInput } from './build';

export interface DownloadFitOptions {
  session: Session;
  laps?: LapInput[];
}

/** Build the .fit and trigger the browser download. Returns the suggested filename. */
export function downloadSessionAsFit(opts: DownloadFitOptions): string {
  const { bytes, filename } = buildFitFile(opts);

  const blob = new Blob([new Uint8Array(bytes)], { type: 'application/octet-stream' });
  const url  = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  // Release the object URL after the click handler has a chance to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  return filename;
}
