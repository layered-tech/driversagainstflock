<template>
    <button :class="classes" type="button">
        <DafIcon v-if="icon" :name="icon" size="15" />
        <slot />
    </button>
</template>

<script setup>
import { computed } from 'vue';
import DafIcon from './DafIcon.vue';

const props = defineProps({
    selected: {
        type: Boolean,
        default: false,
    },
    icon: {
        type: String,
        default: '',
    },
});

const classes = computed(() => [
    'daf-pressable inline-flex min-h-11 items-center justify-center gap-2 rounded-dafPill border px-4 text-daf-body-sm font-semibold',
    props.selected
        ? 'border-daf-brand bg-daf-brand text-daf-brand-contrast'
        : 'border-daf-border bg-daf-surface-card text-daf-text-primary hover:border-daf-border-strong',
]);
</script>
