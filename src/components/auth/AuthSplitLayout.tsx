import Image from 'next/image';
import type { ReactNode } from 'react';

/**
 * AuthSplitLayout — split-screen wrapper for auth pages.
 *
 *  ┌──────────────────┬──────────────┐
 *  │  brand + form    │   B&W photo  │
 *  │  (children)      │   (decor)    │
 *  └──────────────────┴──────────────┘
 *
 * On narrow viewports the photo column collapses (see .auth-split rules in
 * globals.css). The image is decorative — `alt=""` and `aria-hidden`.
 */
export function AuthSplitLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-split">
      <section className="auth-split__form">
        <div className="brand">
          <span className="brand-name">The <em>Ride</em></span>
        </div>
        <div className="auth-split__content">
          {children}
        </div>
      </section>
      <aside className="auth-split__hero" aria-hidden="true">
        <Image
          src="/auth/cyclists.png"
          alt=""
          fill
          priority
          sizes="(max-width: 880px) 0px, 45vw"
          style={{ objectFit: 'cover' }}
        />
      </aside>
    </div>
  );
}
