<template>
    <label class="block">
        <span
            v-if="label"
            class="mb-2 block text-daf-body-sm font-semibold text-daf-text-secondary"
        >
            {{ label }}
        </span>
        <span :class="shellClasses">
            <DafIcon v-if="leadingIcon" :name="leadingIcon" size="18" />
            <input
                :id="id"
                :autocomplete="autocomplete"
                :class="inputClasses"
                :disabled="disabled"
                :placeholder="placeholder"
                :type="type"
                :value="modelValue"
                @input="$emit('update:modelValue', $event.target.value)"
            />
        </span>
    </label>
</template>

<script setup>
import { computed } from 'vue';
import DafIcon from './DafIcon.vue';

defineEmits(['update:modelValue']);

const props = defineProps({
    modelValue: {
        type: [String, Number],
        default: '',
    },
    id: {
        type: String,
        default: '',
    },
    label: {
        type: String,
        default: '',
    },
    placeholder: {
        type: String,
        default: '',
    },
    type: {
        type: String,
        default: 'text',
    },
    autocomplete: {
        type: String,
        default: '',
    },
    leadingIcon: {
        type: String,
        default: '',
    },
    tone: {
        type: String,
        default: 'solid',
    },
    disabled: {
        type: Boolean,
        default: false,
    },
});

const shellClasses = computed(() => [
    'flex min-h-11 items-center gap-2 rounded-dafSm border px-3 text-daf-text-primary',
    props.tone === 'glass'
        ? 'daf-glass'
        : 'border-daf-border bg-daf-surface-card shadow-dafCard',
]);

const inputClasses = computed(() => [
    'min-w-0 flex-1 border-0 bg-transparent p-0 text-daf-body text-daf-text-primary placeholder:text-daf-text-tertiary focus:ring-0',
    'disabled:cursor-not-allowed disabled:opacity-60',
]);
</script>
