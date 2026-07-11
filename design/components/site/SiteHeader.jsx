import React from 'react';
import { Button } from '../core/Button/Button';

/**
 * DAF SiteHeader — top navigation bar shared across the marketing and app pages.
 *
 * Two chrome variants:
 *  - "marketing": translucent glass, sticky, content-width container, larger
 *    logo with a soft shadow. Used on the landing page.
 *  - "app": opaque card surface with a drop shadow, full-bleed, slightly smaller
 *    logo, non-wrapping brand. Used on the full-screen map.
 *
 * Links and the optional CTA are passed in so each page keeps its own targets,
 * labels, and whether a call-to-action shows at all.
 */

const VARIANTS = {
  marketing: {
    header: {
      position: 'sticky',
      top: 0,
      zIndex: 50,
      background: 'var(--surface-glass-2)',
      backdropFilter: 'blur(var(--blur-glass))',
      WebkitBackdropFilter: 'blur(var(--blur-glass))',
      borderBottom: '1px solid var(--border)',
    },
    container: { maxWidth: 'var(--width-content)', margin: '0 auto', height: 68 },
    logoSize: 34,
    logoShadow: true,
    brandNoWrap: false,
  },
  app: {
    header: {
      flex: '0 0 auto',
      position: 'relative',
      zIndex: 60,
      background: 'var(--surface-card)',
      borderBottom: '1px solid var(--border)',
      boxShadow: 'var(--shadow-card)',
    },
    container: { height: 64 },
    logoSize: 32,
    logoShadow: true,
    brandNoWrap: true,
  },
};

function NavLink({ href, children }) {
  const [hover, setHover] = React.useState(false);
  return (
    <a
      href={href}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        color: hover ? 'var(--text-primary)' : 'inherit',
        textDecoration: 'none',
        transition: 'color var(--dur-base) var(--ease-standard)',
      }}
    >
      {children}
    </a>
  );
}

export function SiteHeader({
  variant = 'marketing',
  logoSrc = '../../assets/logo-mark.png',
  brand = 'Drivers Against Flock',
  logoHref = '#top',
  links = [],
  cta = null,
  style = {},
  ...rest
}) {
  const v = VARIANTS[variant] || VARIANTS.marketing;

  return (
    <header style={{ ...v.header, ...style }} {...rest}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 24,
          padding: '0 24px',
          ...v.container,
        }}
      >
        <a
          href={logoHref}
          style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'inherit' }}
        >
          <img
            src={logoSrc}
            alt="DAF"
            style={{
              width: v.logoSize,
              height: v.logoSize,
              objectFit: 'contain',
              display: 'block',
              borderRadius: 'var(--radius-sm)',
              boxShadow: v.logoShadow ? '0px 0px 2px 0px rgba(11,14,18,0.14)' : 'none',
            }}
          />
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: 17,
              letterSpacing: 'var(--ls-heading)',
              whiteSpace: v.brandNoWrap ? 'nowrap' : 'normal',
            }}
          >
            {brand}
          </span>
        </a>

        <nav
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 28,
            fontSize: 'var(--fs-body-sm)',
            fontWeight: 'var(--fw-medium)',
            color: 'var(--text-secondary)',
          }}
        >
          {links.map((l, i) => (
            <NavLink key={i} href={l.href}>{l.label}</NavLink>
          ))}
          {cta && (
            <a href={cta.href} style={{ textDecoration: 'none' }}>
              <Button variant="primary" size="sm">{cta.label}</Button>
            </a>
          )}
        </nav>
      </div>
    </header>
  );
}
