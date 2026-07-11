<template>
    <footer class="flex-1 border-t border-daf-border bg-daf-surface-card">
        <div class="mx-auto max-w-[var(--width-wide)] px-6 py-9">
            <div
                class="flex flex-wrap items-center justify-between gap-6 text-center md:text-left"
            >
                <component
                    :is="linkComponent(homeHref)"
                    :href="homeHref"
                    class="mx-auto flex items-center gap-2.5 no-underline md:mx-0"
                    @click="handleLinkClick($event, homeHref)"
                >
                    <img
                        class="size-7 rounded-dafXs object-contain"
                        :src="logoMark"
                        alt="DAF"
                    />
                    <span class="font-display text-[15px] font-bold">
                        Drivers Against Flock
                    </span>
                </component>

                <p
                    class="m-0 max-w-[42ch] text-center text-daf-body-sm text-daf-text-tertiary"
                >
                    Camera data from OpenStreetMap contributors. We don't keep
                    your trips. We don't sell them, either.
                </p>

                <nav
                    class="flex flex-wrap justify-center gap-x-5 gap-y-2 text-daf-body-sm text-daf-text-secondary"
                    aria-label="Footer navigation"
                >
                    <component
                        :is="linkComponent(item.href)"
                        v-for="item in links"
                        :key="item.href"
                        :href="item.href"
                        class="no-underline hover:text-daf-text-primary"
                        @click="handleLinkClick($event, item.href)"
                    >
                        {{ item.label }}
                    </component>
                </nav>
            </div>

            <div
                class="mt-7 flex flex-wrap items-center justify-center gap-4 border-t border-daf-border pt-6 md:justify-between"
            >
                <div class="text-daf-caption text-daf-text-tertiary">
                    © 2026 LayeredTech, LLC. All rights reserved.
                </div>

                <nav
                    class="flex flex-wrap justify-center gap-x-5 gap-y-2 text-daf-body-sm text-daf-text-secondary"
                    aria-label="Legal links"
                >
                    <Link
                        class="no-underline hover:text-daf-text-primary"
                        :href="privacyHref"
                    >
                        Privacy Policy
                    </Link>
                    <Link
                        class="no-underline hover:text-daf-text-primary"
                        :href="termsHref"
                    >
                        Terms of Use
                    </Link>
                </nav>
            </div>
        </div>
    </footer>
</template>

<script setup>
import { Link } from '@inertiajs/vue3';
import logoMark from '../../../assets/daf-logo-mark.png';

defineProps({
    homeHref: {
        type: String,
        default: '/',
    },
    privacyHref: {
        type: String,
        default: '/privacy-policy',
    },
    termsHref: {
        type: String,
        default: '/terms-of-use',
    },
    links: {
        type: Array,
        default: () => [
            { label: 'How it works', href: '#how' },
            { label: 'Full map', href: '/map' },
            { label: 'Apps', href: '#apps' },
        ],
    },
});

function linkComponent(href) {
    return isSamePageHashLink(href) ? 'a' : Link;
}

function handleLinkClick(event, href) {
    const hash = getHash(href);

    if (!hash || shouldUseDefaultNavigation(event)) {
        return;
    }

    const target = document.getElementById(getTargetId(hash));

    if (!target) {
        return;
    }

    event.preventDefault();

    const targetTop =
        target.getBoundingClientRect().top + window.scrollY - headerOffset();

    window.scrollTo({
        top: Math.max(0, targetTop),
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });

    window.history.pushState(null, '', hash);
}

function getHash(href) {
    if (!isSamePageHashLink(href)) {
        return null;
    }

    return href;
}

function getTargetId(hash) {
    try {
        return decodeURIComponent(hash.slice(1));
    } catch {
        return hash.slice(1);
    }
}

function headerOffset() {
    const headerBar = document.querySelector('[data-site-header-bar]');

    return headerBar?.getBoundingClientRect().height ?? 0;
}

function isSamePageHashLink(href) {
    return typeof href === 'string' && href.startsWith('#') && href.length > 1;
}

function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function shouldUseDefaultNavigation(event) {
    return (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.altKey ||
        event.ctrlKey ||
        event.shiftKey
    );
}
</script>
