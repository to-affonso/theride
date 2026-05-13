import Image from 'next/image';
import type { ReactNode } from 'react';
import { ElevationBg } from './ElevationBg';

/**
 * AuthSplitLayout — split-screen wrapper for auth pages.
 *
 *  ┌──────────────────┬──────────────┐
 *  │  ┌── card ──┐    │              │
 *  │  │  logo    │    │   B&W photo  │
 *  │  │  form    │    │   (decor)    │
 *  │  └──────────┘    │              │
 *  ├──────────────────┴──────────────┤
 *  │   ⤳ ElevationBg (lime, bottom)  │  ← bleeds across both columns
 *  └─────────────────────────────────┘
 *
 * The card sits centered in the left column; the right column shows the
 * cyclists photo (decorative — `alt=""` and `aria-hidden`). An animated lime
 * elevation silhouette spans the bottom of the whole layout behind both
 * columns.
 */
export function AuthSplitLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-split">
      <ElevationBg />

      <section className="auth-split__form">
        <div className="auth-split__content">
          <div className="brand">
            <Image
              src="/images/theRideLogo.svg"
              alt="theRide"
              width={58}
              height={40}
              priority
            />
          </div>
          {children}
        </div>
      </section>

      <aside className="auth-split__hero" aria-hidden="true">
        <Image
          src="/auth/cyclists.png"
          alt=""
          fill
          priority
          sizes="(max-width: 880px) 0px, 50vw"
          style={{ objectFit: 'cover' }}
        />
      </aside>
    </div>
  );
}
