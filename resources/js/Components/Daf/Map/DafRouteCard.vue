<template>
    <button :class="classes" type="button" :aria-pressed="selected">
        <span :class="glyphClasses">
            <DafIcon :name="routeIcon" size="22" stroke="2.4" />
        </span>
        <span class="min-w-0 flex-1 text-left">
            <span class="mb-[3px] flex min-w-0 items-center gap-2">
                <span
                    class="truncate font-ui text-daf-body font-bold text-daf-text-primary"
                >
                    {{ title }}
                </span>
                <span
                    v-if="recommended"
                    class="shrink-0 rounded-dafPill bg-daf-brand px-[7px] py-0.5 font-ui text-daf-label font-bold uppercase tracking-[var(--ls-label)] text-daf-brand-contrast"
                >
                    Pick
                </span>
            </span>
            <span
                class="flex items-center gap-2 whitespace-nowrap font-ui text-daf-body-sm text-daf-text-secondary md:gap-2.5"
            >
                <svg
                    class="h-3 w-10 shrink-0"
                    viewBox="0 0 40 12"
                    aria-hidden="true"
                >
                    <line
                        x1="2"
                        y1="6"
                        x2="38"
                        y2="6"
                        :stroke="routeCasing"
                        stroke-width="9"
                        stroke-linecap="round"
                    />
                    <line
                        x1="2"
                        y1="6"
                        x2="38"
                        y2="6"
                        :stroke="routeAccent"
                        stroke-width="6"
                        stroke-linecap="round"
                    />
                </svg>
                <span>{{ distance }}</span>
                <span class="hidden opacity-40 md:inline" aria-hidden="true">
                    &middot;
                </span>
                <span :class="cameraClasses">
                    <DafIcon :name="cameraIcon" size="14" />
                    {{ cameraLabel }}
                </span>
            </span>
        </span>
        <span class="shrink-0 text-right">
            <span
                class="block font-mono text-daf-h3 font-bold leading-[1.1] text-daf-text-primary"
            >
                {{ eta }}
            </span>
            <span
                v-if="arrival"
                class="block font-ui text-daf-caption text-daf-text-tertiary"
            >
                {{ arrival }}
            </span>
        </span>
    </button>
</template>

<script setup>
import { computed } from 'vue';
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
    recommended: {
        type: Boolean,
        default: false,
    },
    eta: {
        type: String,
        default: '27 min',
    },
    arrival: {
        type: String,
        default: '',
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
const routeAccent = computed(() =>
    routeIsFast.value ? 'var(--route-fast)' : 'var(--route-private)',
);
const routeCasing = computed(() =>
    routeIsFast.value
        ? 'var(--route-fast-casing)'
        : 'var(--route-private-casing)',
);
const cameraIcon = computed(() => (props.cameras === 0 ? 'check' : 'scan-eye'));
const cameraLabel = computed(() => {
    if (props.cameras === 0) {
        return 'No cameras';
    }

    return `${props.cameras} camera${props.cameras === 1 ? '' : 's'}`;
});
const cameraClasses = computed(() => [
    'inline-flex items-center gap-[5px] font-semibold',
    props.cameras === 0 ? 'text-daf-text-brand' : 'text-daf-alert',
]);

const classes = computed(() => [
    'daf-pressable flex w-full cursor-pointer items-center gap-3 rounded-dafMd border-[1.5px] bg-daf-surface-glass p-3 text-left shadow-dafFloat backdrop-blur-[var(--blur-glass)]',
    props.selected
        ? routeIsFast.value
            ? 'border-daf-route-fast ring-[3px] ring-[rgba(46,139,255,0.18)]'
            : 'border-daf-route-private ring-[3px] ring-[rgba(31,191,107,0.18)]'
        : 'border-daf-border-glass hover:border-daf-border-strong',
]);

const glyphClasses = computed(() => [
    'flex size-[42px] shrink-0 items-center justify-center rounded-dafSm',
    routeIsFast.value
        ? 'bg-[rgba(46,139,255,0.16)] text-daf-route-fast'
        : 'bg-[rgba(31,191,107,0.16)] text-daf-route-private',
]);
</script>
