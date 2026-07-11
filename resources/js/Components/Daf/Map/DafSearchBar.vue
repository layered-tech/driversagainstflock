<template>
    <form :class="classes" @submit.prevent="$emit('submit', query)">
        <button
            v-if="showMenu"
            class="daf-pressable inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-dafPill text-daf-text-primary hover:bg-daf-surface-alt"
            type="button"
            aria-label="Open menu"
            @click="$emit('menu')"
        >
            <DafIcon name="menu" size="21" />
        </button>
        <span :class="searchIconClasses">
            <DafIcon name="search" size="18" />
        </span>
        <input
            v-model="query"
            class="min-h-11 min-w-0 flex-1 border-0 bg-transparent p-0 text-daf-body font-medium text-daf-text-primary placeholder:text-daf-text-tertiary focus:ring-0 [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none"
            :placeholder="placeholder"
            type="search"
            @input="$emit('search', query)"
        />
        <button
            v-if="query"
            class="daf-pressable inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-dafPill text-daf-text-tertiary hover:bg-daf-surface-alt hover:text-daf-text-primary"
            type="button"
            aria-label="Clear search"
            @click="clear"
        >
            <DafIcon name="x" size="19" />
        </button>
        <button
            v-if="showVoice"
            :class="voiceButtonClasses"
            type="button"
            :aria-pressed="voiceActive"
            aria-label="Voice search"
            @click="$emit('voice')"
        >
            <DafIcon name="mic" size="20" />
        </button>
        <span
            v-if="showDirections"
            aria-hidden="true"
            class="h-6 w-px shrink-0 bg-daf-border-glass"
        />
        <button
            v-if="showDirections"
            class="daf-pressable inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-dafPill text-daf-text-primary hover:bg-daf-surface-alt"
            type="submit"
            aria-label="Get directions"
        >
            <DafIcon name="corner-up-right" size="20" />
        </button>
    </form>
</template>

<script setup>
import { computed } from 'vue';
import DafIcon from '../DafIcon.vue';

const query = defineModel({
    type: String,
    default: '',
});

const props = defineProps({
    placeholder: {
        type: String,
        default: 'Search a place or address',
    },
    tone: {
        type: String,
        default: 'glass',
    },
    showMenu: {
        type: Boolean,
        default: true,
    },
    showVoice: {
        type: Boolean,
        default: false,
    },
    voiceActive: {
        type: Boolean,
        default: false,
    },
    showDirections: {
        type: Boolean,
        default: true,
    },
});

const emit = defineEmits(['clear', 'menu', 'search', 'submit', 'voice']);

const classes = computed(() => [
    'flex min-h-[52px] items-center gap-1 rounded-dafPill px-1.5',
    props.tone === 'glass'
        ? 'daf-glass'
        : 'border border-daf-border bg-daf-surface-card shadow-dafCard',
]);

const searchIconClasses = computed(() => [
    'inline-flex shrink-0 text-daf-text-tertiary',
    props.showMenu ? 'ml-0.5' : 'ml-2',
]);

const voiceButtonClasses = computed(() => [
    'daf-pressable inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-dafPill hover:bg-daf-surface-alt',
    props.voiceActive ? 'text-daf-brand' : 'text-daf-text-secondary',
]);

function clear() {
    query.value = '';
    emit('clear');
}
</script>
