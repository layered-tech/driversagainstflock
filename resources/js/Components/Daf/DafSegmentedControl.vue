<template>
    <div :class="classes" role="tablist">
        <button
            v-for="option in options"
            :key="option.value"
            :aria-selected="option.value === modelValue"
            :class="buttonClass(option.value === modelValue)"
            role="tab"
            type="button"
            @click="$emit('update:modelValue', option.value)"
        >
            <DafIcon v-if="option.icon" :name="option.icon" size="16" />
            {{ option.label }}
        </button>
    </div>
</template>

<script setup>
import { computed } from 'vue';
import DafIcon from './DafIcon.vue';

defineEmits(['update:modelValue']);

const props = defineProps({
    modelValue: {
        type: [String, Number],
        required: true,
    },
    options: {
        type: Array,
        default: () => [],
    },
    tone: {
        type: String,
        default: 'solid',
    },
});

const classes = computed(() => [
    'inline-flex min-h-11 rounded-dafPill p-1',
    props.tone === 'glass'
        ? 'daf-glass'
        : 'border border-daf-border bg-daf-surface-card shadow-dafCard',
]);

function buttonClass(selected) {
    return [
        'daf-pressable inline-flex min-h-9 items-center justify-center gap-2 rounded-dafPill px-4 text-daf-body-sm font-semibold',
        selected
            ? 'bg-daf-brand text-daf-brand-contrast shadow-dafCard'
            : 'text-daf-text-secondary hover:text-daf-text-primary',
    ];
}
</script>
