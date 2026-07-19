<template>
    <section :class="classes">
        <div v-if="showHandle" class="flex justify-center pb-3 md:hidden">
            <span
                class="h-[5px] w-[var(--sheet-grab)] rounded-dafPill bg-daf-border-strong"
            />
        </div>
        <div
            v-if="eyebrow || title || subtitle || $slots.actions"
            class="mb-3.5 flex items-start justify-between gap-3"
        >
            <div class="min-w-0">
                <p
                    v-if="eyebrow"
                    class="font-mono text-daf-label font-semibold uppercase tracking-[var(--ls-label)] text-daf-text-tertiary"
                >
                    {{ eyebrow }}
                </p>
                <h2
                    v-if="title"
                    class="font-display text-daf-h3 font-bold tracking-[var(--ls-heading)] text-daf-text-primary"
                >
                    {{ title }}
                </h2>
                <p
                    v-if="subtitle"
                    class="mt-0.5 font-ui text-daf-body-sm text-daf-text-secondary"
                >
                    {{ subtitle }}
                </p>
            </div>
            <slot name="actions" />
        </div>
        <slot />
    </section>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
    title: {
        type: String,
        default: '',
    },
    eyebrow: {
        type: String,
        default: '',
    },
    subtitle: {
        type: String,
        default: '',
    },
    glass: {
        type: Boolean,
        default: false,
    },
    showHandle: {
        type: Boolean,
        default: true,
    },
});

const classes = computed(() => [
    'max-h-[66vh] overflow-auto rounded-t-dafSheet border-x-0 border-b-0 border-t border-daf-border-glass bg-daf-surface-sheet px-4 pb-5 pt-2 text-daf-text-primary shadow-dafSheet md:rounded-dafSheet md:border md:p-4',
    props.glass
        ? 'md:border-daf-border-glass md:bg-daf-surface-glass md:shadow-dafFloat md:backdrop-blur-[var(--blur-glass)]'
        : 'md:border-daf-border md:bg-daf-surface-sheet',
]);
</script>
