<template>
    <button :class="classes" type="button">
        <span :class="glyphClasses">
            <DafIcon :name="routeIcon" size="22" stroke="2.4" />
        </span>
        <span class="min-w-0 flex-1 text-left">
            <span class="flex items-center gap-2">
                <span
                    class="font-display text-daf-title font-semibold text-daf-text-primary"
                >
                    {{ title }}
                </span>
                <DafBadge :icon="routeIcon" :tone="badgeTone">
                    {{ badgeLabel }}
                </DafBadge>
            </span>
            <span class="mt-1 block text-daf-body-sm text-daf-text-secondary">
                {{ summary }}
            </span>
        </span>
        <span
            class="text-right font-mono text-daf-caption text-daf-text-secondary"
        >
            <span
                class="block text-daf-title font-semibold text-daf-text-primary"
            >
                {{ eta }}
            </span>
            {{ distance }}
        </span>
    </button>
</template>

<script setup>
import { computed } from 'vue';
import DafBadge from '../DafBadge.vue';
import DafIcon from '../DafIcon.vue';

const props = defineProps({
    type: {
        type: String,
        default: 'private',
    },
    selected: {
        type: Boolean,
        default: false,
    },
    eta: {
        type: String,
        default: '27 min',
    },
    distance: {
        type: String,
        default: '13.1 mi',
    },
    cameras: {
        type: Number,
        default: 0,
    },
});

const routeIsFast = computed(() => props.type === 'fastest');
const routeIcon = computed(() => (routeIsFast.value ? 'zap' : 'shield-check'));
const title = computed(() =>
    routeIsFast.value ? 'Fastest route' : 'Private route',
);
const badgeLabel = computed(() => (routeIsFast.value ? 'Fastest' : 'Private'));
const badgeTone = computed(() => (routeIsFast.value ? 'info' : 'brand'));
const summary = computed(() => {
    if (routeIsFast.value) {
        return `${props.cameras} cameras on the direct path`;
    }

    return props.cameras === 0
        ? 'Skips known cameras'
        : `Skips ${props.cameras} known cameras`;
});

const classes = computed(() => [
    'daf-pressable flex w-full items-center gap-4 rounded-dafMd border p-4 text-left',
    props.selected
        ? 'border-daf-brand bg-daf-surface-card shadow-dafFloat'
        : 'border-daf-border bg-daf-surface-card shadow-dafCard hover:border-daf-border-strong',
]);

const glyphClasses = computed(() => [
    'flex size-11 shrink-0 items-center justify-center rounded-dafSm text-white',
    routeIsFast.value ? 'bg-daf-route-fast' : 'bg-daf-route-private',
]);
</script>
