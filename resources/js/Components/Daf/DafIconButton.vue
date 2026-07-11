<template>
    <button
        :aria-label="label"
        :aria-pressed="pressed"
        :class="classes"
        :disabled="disabled"
        type="button"
    >
        <DafIcon :name="icon" :size="size" />
    </button>
</template>

<script setup>
import { computed } from 'vue';
import DafIcon from './DafIcon.vue';

const props = defineProps({
    icon: {
        type: String,
        required: true,
    },
    label: {
        type: String,
        required: true,
    },
    variant: {
        type: String,
        default: 'glass',
    },
    active: {
        type: Boolean,
        default: false,
    },
    disabled: {
        type: Boolean,
        default: false,
    },
    size: {
        type: [Number, String],
        default: 20,
    },
});

const pressed = computed(() => (props.active ? 'true' : undefined));

const classes = computed(() => [
    'daf-pressable inline-flex min-h-11 min-w-11 items-center justify-center rounded-dafSm',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-daf-focus',
    'disabled:pointer-events-none disabled:opacity-50',
    props.variant === 'brand'
        ? 'bg-daf-brand text-daf-brand-contrast shadow-dafFloat'
        : '',
    props.variant === 'solid'
        ? 'border border-daf-border bg-daf-surface-card text-daf-text-primary shadow-dafCard'
        : '',
    props.variant === 'plain'
        ? 'text-daf-text-primary hover:bg-daf-surface-alt'
        : '',
    props.variant === 'glass' ? 'daf-glass text-daf-text-primary' : '',
    props.active ? 'border-daf-brand text-daf-brand' : '',
]);
</script>
