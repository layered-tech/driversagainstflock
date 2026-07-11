<template>
    <header ref="headerElement" :class="headerClasses">
        <div
            data-site-header-bar
            class="mx-auto flex h-16 w-full max-w-[var(--width-wide)] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8"
        >
            <component
                :is="linkComponent(homeHref)"
                class="flex min-w-0 items-center gap-3"
                :href="homeHref"
                @click="handleHeaderLinkClick($event, homeHref)"
            >
                <img
                    class="size-10 shrink-0 rounded-dafSm object-contain shadow-dafMarker"
                    :src="logoMark"
                    alt=""
                />
                <span
                    class="truncate font-display text-daf-title font-semibold text-daf-text-primary"
                >
                    Drivers Against Flock
                </span>
            </component>

            <nav
                class="hidden items-center gap-0 lg:flex xl:gap-1"
                aria-label="Main navigation"
            >
                <component
                    :is="linkComponent(item.href)"
                    v-for="item in links"
                    :key="item.href"
                    :href="item.href"
                    class="rounded-dafPill px-2.5 py-2 text-daf-body-sm font-semibold text-daf-text-secondary hover:bg-daf-surface-alt hover:text-daf-text-primary xl:px-4"
                    @click="handleHeaderLinkClick($event, item.href)"
                >
                    {{ item.label }}
                </component>
            </nav>

            <div :class="actionClasses">
                <DafButton
                    v-if="ctaHref"
                    class="hidden xl:inline-flex"
                    :href="ctaHref"
                    size="sm"
                    trailing-icon="arrow-right"
                    :variant="variant === 'marketing' ? 'primary' : 'secondary'"
                >
                    {{ ctaLabel }}
                </DafButton>
                <button
                    class="daf-pressable inline-flex min-h-11 min-w-11 items-center justify-center rounded-dafSm text-daf-text-primary hover:bg-daf-surface-alt lg:hidden"
                    type="button"
                    aria-label="Open menu"
                    @click="menuIsOpen = !menuIsOpen"
                >
                    <DafIcon :name="menuIsOpen ? 'x' : 'menu'" size="22" />
                </button>
            </div>
        </div>

        <div
            v-if="menuIsOpen"
            class="border-t border-daf-border bg-daf-surface-card px-4 py-3 lg:hidden"
        >
            <div class="flex flex-col gap-1">
                <component
                    :is="linkComponent(item.href)"
                    v-for="item in links"
                    :key="item.href"
                    :href="item.href"
                    class="rounded-dafSm px-3 py-3 text-daf-body font-semibold text-daf-text-secondary hover:bg-daf-surface-alt hover:text-daf-text-primary"
                    @click="handleHeaderLinkClick($event, item.href)"
                >
                    {{ item.label }}
                </component>
                <DafButton
                    v-if="ctaHref"
                    class="mt-2"
                    :href="ctaHref"
                    full-width
                >
                    {{ ctaLabel }}
                </DafButton>
            </div>
        </div>
    </header>
</template>

<script setup>
import { Link } from '@inertiajs/vue3';
import { computed, ref } from 'vue';
import logoMark from '../../../assets/daf-logo-mark.png';
import DafButton from './DafButton.vue';
import DafIcon from './DafIcon.vue';

const props = defineProps({
    variant: {
        type: String,
        default: 'marketing',
    },
    links: {
        type: Array,
        default: () => [
            { label: 'How it works', href: '#how-it-works' },
            { label: 'Apps', href: '#apps' },
            { label: 'Android Auto', href: '#android-auto' },
        ],
    },
    ctaHref: {
        type: String,
        default: '/map',
    },
    ctaLabel: {
        type: String,
        default: 'Open full map',
    },
    homeHref: {
        type: String,
        default: '/',
    },
});

const menuIsOpen = ref(false);
const headerElement = ref(null);

const headerClasses = computed(() => [
    'sticky top-0 z-40 border-b',
    props.variant === 'app'
        ? 'border-daf-border bg-daf-surface-card'
        : 'border-daf-border-glass bg-daf-surface-glass backdrop-blur-[var(--blur-glass)]',
]);

const desktopActionsAreVisible = computed(() => Boolean(props.ctaHref));

const actionClasses = computed(() => [
    'flex items-center gap-2',
    !desktopActionsAreVisible.value ? 'lg:hidden' : '',
]);

function linkComponent(href) {
    return isHashLink(href) ? 'a' : Link;
}

function handleHeaderLinkClick(event, href) {
    const hash = getHash(href);

    if (!hash || shouldUseDefaultNavigation(event)) {
        return;
    }

    const target = document.getElementById(getTargetId(hash));

    if (!target) {
        return;
    }

    event.preventDefault();
    menuIsOpen.value = false;

    const targetTop =
        target.getBoundingClientRect().top + window.scrollY - headerOffset();

    window.scrollTo({
        top: Math.max(0, targetTop),
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });

    window.history.pushState(null, '', hash);
}

function getHash(href) {
    if (!isHashLink(href)) {
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
    const headerBar = headerElement.value?.querySelector(
        '[data-site-header-bar]',
    );

    return headerBar?.getBoundingClientRect().height ?? 0;
}

function isHashLink(href) {
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
