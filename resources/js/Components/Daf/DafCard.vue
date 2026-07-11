<template>
    <component :is="as" :class="classes">
        <slot />
    </component>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
    as: {
        type: String,
        default: 'div',
    },
    tone: {
        type: String,
        default: 'solid',
    },
    padded: {
        type: Boolean,
        default: true,
    },
});

const classes = computed(() => [
    'rounded-dafLg border',
    props.padded ? 'p-5' : '',
    props.tone === 'glass'
        ? 'daf-glass'
        : 'border-daf-border bg-daf-surface-card shadow-dafCard',
]);
</script>
