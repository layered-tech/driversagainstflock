import React from 'react';

export interface SiteNavLink {
    /** Visible text. */
    label: React.ReactNode;
    /** Destination URL or in-page anchor. */
    href: string;
}

export interface SiteHeaderCTA {
    label: React.ReactNode;
    href: string;
}

/**
 * @startingPoint section="Site" subtitle="Shared top nav — marketing & app chrome" viewport="1200x340"
 */
export interface SiteHeaderProps {
    /**
     * Chrome treatment.
     * "marketing" = translucent glass, sticky, content-width, logo + soft shadow.
     * "app" = opaque card surface, drop shadow, full-bleed, compact logo.
     * @default "marketing"
     */
    variant?: 'marketing' | 'app';
    /** Logo image source. @default "../../assets/logo-mark.png" */
    logoSrc?: string;
    /** Brand wordmark text. @default "Drivers Against Flock" */
    brand?: React.ReactNode;
    /** Where the logo/brand links to. @default "#top" */
    logoHref?: string;
    /** Nav links, in order. */
    links?: SiteNavLink[];
    /** Optional trailing call-to-action pill. Omit to hide. */
    cta?: SiteHeaderCTA | null;
    style?: React.CSSProperties;
}

/** Shared site header with marketing (glass) and app (opaque) chrome variants. */
export function SiteHeader(props: SiteHeaderProps): JSX.Element;
