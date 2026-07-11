# SiteHeader

Shared top navigation bar. Two chrome variants keep the marketing and app pages
consistent while retaining their differences.

```jsx
// Marketing (landing) — glass, sticky, with CTA
<SiteHeader
  variant="marketing"
  logoHref="#top"
  links={[
    { label: 'Map Preview', href: '#preview' },
    { label: 'John Doe', href: '#johndoe' },
    { label: 'How it works', href: '#how' },
    { label: 'Android Auto', href: '#android-auto' },
    { label: 'Apps', href: '#apps' },
  ]}
  cta={{ label: 'Open Full Map', href: '../web-full-map/WebFullMap.dc.html' }}
/>

// App (full map) — opaque, drop shadow, no CTA, cross-page links
<SiteHeader
  variant="app"
  logoHref="../web-landing/WebLanding.dc.html"
  links={[
    { label: 'Map Preview', href: '../web-landing/WebLanding.dc.html#preview' },
    { label: 'John Doe', href: '../web-landing/WebLanding.dc.html#johndoe' },
    { label: 'How it works', href: '../web-landing/WebLanding.dc.html#how' },
    { label: 'Android Auto', href: '../web-landing/WebLanding.dc.html#android-auto' },
    { label: 'Apps', href: '../web-landing/WebLanding.dc.html#apps' },
  ]}
/>
```

- `variant` controls chrome, logo size, logo shadow, brand wrapping, and container width.
- `links` and `cta` are passed per-page so targets, labels, and CTA presence stay page-specific.
- Nav links handle their own hover color; no surrounding CSS required.
