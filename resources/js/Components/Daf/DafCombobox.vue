<template>
    <div class="relative">
        <DafInput
            :model-value="modelValue"
            :placeholder="placeholder"
            leading-icon="search"
            :tone="tone"
            @update:model-value="handleInput"
        />
        <div
            v-if="options.length > 0"
            class="absolute z-30 mt-2 w-full overflow-hidden rounded-dafLg border border-daf-border bg-daf-surface-card shadow-dafFloat"
        >
            <button
                v-for="option in options"
                :key="option.value ?? option.label"
                class="flex min-h-11 w-full items-center gap-3 px-3 text-left text-daf-body text-daf-text-primary hover:bg-daf-surface-alt"
                type="button"
                @click="$emit('select', option)"
            >
                <DafIcon :name="option.icon ?? 'map-pin'" size="18" />
                <span class="min-w-0 flex-1 truncate">{{ option.label }}</span>
            </button>
        </div>
    </div>
</template>

<script setup>
import DafIcon from './DafIcon.vue';
import DafInput from './DafInput.vue';

const emit = defineEmits(['update:modelValue', 'search', 'select']);

defineProps({
    modelValue: {
        type: String,
        default: '',
    },
    placeholder: {
        type: String,
        default: 'Search',
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

function handleInput(value) {
    emit('update:modelValue', value);
    emit('search', value);
}
</script>
