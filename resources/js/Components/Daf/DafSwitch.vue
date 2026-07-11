<template>
    <button
        :aria-checked="modelValue"
        :class="classes"
        role="switch"
        type="button"
        @click="$emit('update:modelValue', !modelValue)"
    >
        <span :class="thumbClasses" />
    </button>
</template>

<script setup>
import { computed } from 'vue';

defineEmits(['update:modelValue']);

const props = defineProps({
    modelValue: {
        type: Boolean,
        default: false,
    },
    size: {
        type: String,
        default: 'md',
        validator: (value) => ['xs', 'sm', 'md'].includes(value),
    },
});

const switchSizeClasses = {
    xs: {
        track: 'h-7 w-11 p-1',
        thumb: 'size-5',
        checkedThumb: 'translate-x-4',
    },
    sm: {
        track: 'h-8 w-[52px] p-1',
        thumb: 'size-6',
        checkedThumb: 'translate-x-5',
    },
    md: {
        track: 'h-11 w-[72px] p-1',
        thumb: 'h-8 w-8',
        checkedThumb: 'translate-x-7',
    },
};

const sizeClasses = computed(() => switchSizeClasses[props.size]);

const classes = computed(() => [
    'daf-pressable inline-flex items-center rounded-dafPill border',
    sizeClasses.value.track,
    props.modelValue
        ? 'border-daf-brand bg-daf-brand'
        : 'border-daf-border bg-daf-surface-card',
]);

const thumbClasses = computed(() => [
    'block rounded-full bg-white shadow-dafCard transition-transform duration-150',
    sizeClasses.value.thumb,
    props.modelValue ? sizeClasses.value.checkedThumb : 'translate-x-0',
]);
</script>
