<template>
    <div class="relative z-40 flex w-full flex-col gap-2.5 md:hidden">
        <button
            v-if="open"
            class="fixed inset-0 z-0 cursor-default border-0 bg-[#101412]/40 p-0 md:hidden"
            type="button"
            aria-label="Close menu"
            @click="closeMenu"
        />

        <div class="relative z-10 flex items-center gap-2.5">
            <button
                class="daf-glass daf-pressable inline-flex h-12 shrink-0 items-center gap-2 rounded-dafPill px-3 text-daf-text-primary"
                type="button"
                :aria-label="open ? 'Close menu' : 'Open menu'"
                :aria-expanded="open"
                aria-controls="daf-mobile-map-menu"
                @click="toggleMenu"
            >
                <img class="size-6 object-contain" :src="logoMark" alt="DAF" />
                <DafIcon :name="open ? 'x' : 'menu'" size="18" />
            </button>

            <div class="min-w-0 flex-1">
                <slot />
            </div>
        </div>

        <div
            v-if="open"
            id="daf-mobile-map-menu"
            class="relative z-10 w-full rounded-dafXl border border-daf-border-glass bg-daf-surface-raised px-4 pb-4 pt-1 text-daf-text-primary shadow-dafSheet"
        >
            <nav aria-label="Main navigation">
                <component
                    :is="linkComponent(item.href)"
                    v-for="item in links"
                    :key="`${item.label}-${item.href}`"
                    :href="item.href"
                    v-bind="externalLinkProps(item.href)"
                    class="daf-pressable flex w-full items-center gap-2.5 border-b border-daf-border px-0.5 py-[13px] text-left text-daf-body font-semibold text-daf-text-primary hover:text-daf-text-brand"
                    @click="closeMenu"
                >
                    <span class="min-w-0 flex-1 truncate">{{
                        item.label
                    }}</span>
                    <DafIcon
                        class="text-daf-text-tertiary"
                        name="chevron-right"
                        size="16"
                    />
                </component>
            </nav>

            <div class="pt-3.5">
                <DafButton href="/#apps" full-width @click="closeMenu">
                    Get the app
                </DafButton>
                <p
                    class="pt-2 text-center text-daf-caption text-daf-text-tertiary"
                >
                    or add daf.app to your Home Screen
                </p>
            </div>
        </div>
    </div>
</template>

<script setup>
import { Link } from '@inertiajs/vue3';
import { onBeforeUnmount, onMounted } from 'vue';
import logoMark from '../../../../assets/daf-logo-mark.png';
import DafButton from '../DafButton.vue';
import DafIcon from '../DafIcon.vue';

const open = defineModel('open', {
    type: Boolean,
    default: false,
});

defineProps({
    links: {
        type: Array,
        default: () => [],
    },
});

function closeMenu() {
    open.value = false;
}

function toggleMenu() {
    open.value = !open.value;
}

function closeMenuOnEscape(event) {
    if (event.key === 'Escape' && open.value) {
        closeMenu();
    }
}

function externalLinkProps(href) {
    if (isInternalHref(href) || isHashLink(href)) {
        return {};
    }

    return {
        rel: 'noreferrer',
        target: '_blank',
    };
}

function linkComponent(href) {
    return isInternalHref(href) ? Link : 'a';
}

function isHashLink(href) {
    return typeof href === 'string' && href.startsWith('#');
}

function isInternalHref(href) {
    return (
        typeof href === 'string' &&
        href.startsWith('/') &&
        !href.startsWith('//')
    );
}

onMounted(() => {
    document.addEventListener('keydown', closeMenuOnEscape);
});

onBeforeUnmount(() => {
    document.removeEventListener('keydown', closeMenuOnEscape);
});
</script>
