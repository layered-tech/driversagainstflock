<template>
    <div
        class="daf-glass inline-flex h-11 shrink-0 items-center gap-2.5 whitespace-nowrap rounded-dafPill border border-daf-border-glass px-3 text-daf-text-primary shadow-dafFloat sm:gap-[11px] sm:px-[18px]"
        :aria-label="accessibleLabel"
        :aria-live="loading ? 'polite' : null"
        :role="loading ? 'status' : null"
    >
        <span class="inline-flex min-w-[2.25rem] items-center justify-center">
            <span
                v-if="loading"
                class="size-4 animate-spin rounded-full border-2 border-daf-border-strong border-t-daf-brand motion-reduce:animate-none"
                aria-hidden="true"
            />
            <template v-else>
                <span
                    class="relative flex size-[7px] shrink-0 items-center justify-center"
                    aria-hidden="true"
                >
                    <span
                        class="node-status-dot-ring absolute inset-0 rounded-full bg-daf-brand"
                    />
                    <span
                        class="node-status-dot relative size-[7px] rounded-full bg-daf-brand"
                    />
                </span>
                <span
                    class="ml-2.5 font-display text-[1.375rem] font-medium leading-none text-daf-text-primary [font-variant-numeric:tabular-nums]"
                >
                    {{ countLabel }}
                </span>
            </template>
        </span>
        <span
            class="hidden text-daf-body-sm leading-tight text-daf-text-secondary sm:inline"
        >
            {{ label }}
        </span>
    </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
    countLabel: {
        type: String,
        required: true,
    },
    label: {
        type: String,
        default: 'nodes in view',
    },
    loading: {
        type: Boolean,
        default: false,
    },
});

const accessibleLabel = computed(() =>
    props.loading
        ? `Loading ${props.label}`
        : `${props.countLabel} ${props.label}`,
);
</script>

<style scoped>
@keyframes node-status-ring-pulse {
    0% {
        opacity: 0.55;
        transform: scale(1);
    }

    70%,
    100% {
        opacity: 0;
        transform: scale(2.6);
    }
}

@keyframes node-status-dot-pulse {
    0%,
    100% {
        opacity: 1;
        transform: scale(1);
    }

    50% {
        opacity: 0.7;
        transform: scale(0.78);
    }
}

.node-status-dot-ring {
    animation: node-status-ring-pulse 2.4s var(--ease-standard) infinite;
}

.node-status-dot {
    animation: node-status-dot-pulse 1.4s var(--ease-standard) infinite;
}

@media (prefers-reduced-motion: reduce) {
    .node-status-dot,
    .node-status-dot-ring {
        animation: none;
    }
}
</style>
