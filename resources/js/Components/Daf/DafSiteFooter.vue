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
                    class="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-daf-body-sm text-daf-text-secondary"
                    aria-label="Legal links"
                >
                    <a
                        class="inline-flex items-center text-current hover:text-daf-text-primary"
                        href="https://github.com/layered-tech/driversagainstflock"
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="GitHub"
                    >
                        <svg
                            width="18"
                            height="18"
                            viewBox="0 0 16 16"
                            fill="currentColor"
                            aria-hidden="true"
                        >
                            <path
                                d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"
                            />
                        </svg>
                    </a>
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
