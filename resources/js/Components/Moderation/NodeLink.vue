<script setup>
import { Link } from '@inertiajs/vue3';
import { inject } from 'vue';

defineProps({
    filters: { type: Object, default: () => ({}) },
    from: { type: String, default: 'nodes' },
    nodeId: { type: [Number, String], required: true },
});

const route = inject('route');
</script>

<template>
    <Link
        :href="
            route(
                'moderation.nodes.show',
                from === 'nodes' && !Object.keys(filters).length
                    ? nodeId
                    : { node: nodeId, from, ...filters },
            )
        "
    >
        <slot>{{ nodeId }}</slot>
    </Link>
</template>
