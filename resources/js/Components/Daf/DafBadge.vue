<template>
    <span :class="classes">
        <DafIcon v-if="icon" :name="icon" size="13" stroke="2.3" />
        <slot />
    </span>
</template>

<script setup>
import { computed } from 'vue';
import DafIcon from './DafIcon.vue';

const props = defineProps({
    tone: {
        type: String,
        default: 'neutral',
    },
    size: {
        type: String,
        default: 'md',
    },
    icon: {
        type: String,
        default: '',
    },
});

const toneClasses = computed(
    () =>
        ({
            brand: 'border-transparent bg-[var(--green-050)] text-[var(--green-700)]',
            alert: 'border-transparent bg-[var(--alert-100)] text-[var(--alert-600)]',
            warning:
                'border-transparent bg-[var(--amber-100)] text-[var(--amber-600)]',
            info: 'border-transparent bg-[var(--azure-100)] text-[var(--azure-600)]',
            ghost: 'border-daf-border-glass bg-[rgba(255,255,255,0.10)] text-daf-text-primary',
            neutral:
                'border-transparent bg-[var(--ink-100)] text-[var(--ink-700)]',
        })[props.tone] ?? 'bg-daf-surface-alt text-daf-text-secondary',
);

const sizeClasses = computed(() =>
    props.size === 'sm'
        ? 'h-5 px-2 text-daf-label'
        : 'h-6 px-2.5 text-daf-caption',
);

const classes = computed(() => [
    'inline-flex items-center gap-[5px] whitespace-nowrap rounded-dafPill border font-ui font-semibold leading-none tracking-[0.01em]',
    sizeClasses.value,
    toneClasses.value,
]);
</script>
