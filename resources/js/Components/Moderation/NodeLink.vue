<script setup>
import { Link } from '@inertiajs/vue3';
import { inject } from 'vue';

defineProps({
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
                from === 'flagged' ? { node: nodeId, from } : nodeId,
            )
        "
    >
        <slot>{{ nodeId }}</slot>
    </Link>
</template>
