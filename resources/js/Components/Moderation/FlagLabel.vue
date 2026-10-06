<script setup>
import { Link } from '@inertiajs/vue3';
import { inject } from 'vue';

defineProps({ flag: { type: Object, required: true } });
const route = inject('route');
</script>
<template>
    <span v-if="flag.source === 'alpr_presence'">Driver reported missing</span>
    <span v-else-if="flag.rule?.deleted_at" title="Deleted rule"
        >{{ flag.rule.name }} · Deleted</span
    >
    <Link
        v-else-if="flag.rule"
        :href="route('moderation.rules.edit', flag.rule_id)"
        >{{ flag.rule.name }}{{ flag.stale ? ' · Stale' : '' }}</Link
    >
    <span v-else>Rule unavailable</span>
</template>
