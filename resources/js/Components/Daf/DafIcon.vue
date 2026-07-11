<template>
    <svg
        xmlns="http://www.w3.org/2000/svg"
        :width="size"
        :height="size"
        viewBox="0 0 24 24"
        fill="none"
        :stroke="color"
        :stroke-width="stroke"
        stroke-linecap="round"
        stroke-linejoin="round"
        :aria-hidden="title ? undefined : 'true'"
        :role="title ? 'img' : undefined"
        class="block shrink-0"
    >
        <title v-if="title">{{ title }}</title>
        <component
            :is="tag"
            v-for="([tag, attrs], index) in nodes"
            :key="`${name}-${index}`"
            v-bind="attrs"
        />
    </svg>
</template>

<script setup>
import { computed } from 'vue';
import { iconPaths } from './iconPaths';

const props = defineProps({
    name: {
        type: String,
        required: true,
    },
    size: {
        type: [Number, String],
        default: 20,
    },
    stroke: {
        type: [Number, String],
        default: 2,
    },
    color: {
        type: String,
        default: 'currentColor',
    },
    title: {
        type: String,
        default: '',
    },
});

const nodes = computed(() => iconPaths[props.name] ?? []);
</script>
