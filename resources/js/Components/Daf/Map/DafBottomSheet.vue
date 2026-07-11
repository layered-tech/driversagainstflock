<template>
    <section :class="classes">
        <div
            v-if="showHandle"
            class="mx-auto mb-3 h-1 w-[var(--sheet-grab)] rounded-dafPill bg-daf-border-strong"
        />
        <div
            v-if="title || subtitle || $slots.actions"
            class="mb-4 flex items-start justify-between gap-4"
        >
            <div>
                <p
                    v-if="eyebrow"
                    class="font-mono text-daf-label font-semibold uppercase tracking-[var(--ls-label)] text-daf-text-tertiary"
                >
                    {{ eyebrow }}
                </p>
                <h2
                    v-if="title"
                    class="font-display text-daf-h3 font-semibold text-daf-text-primary"
                >
                    {{ title }}
                </h2>
                <p
                    v-if="subtitle"
                    class="mt-1 font-mono text-daf-caption text-daf-text-tertiary"
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
    'max-h-[66vh] overflow-auto rounded-t-dafSheet border-t p-4 shadow-dafSheet sm:rounded-dafSheet sm:border',
    props.glass
        ? 'daf-glass'
        : 'border-daf-border bg-daf-surface-sheet text-daf-text-primary',
]);
</script>
