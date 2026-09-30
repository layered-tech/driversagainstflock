<script setup>
import { Link } from '@inertiajs/vue3';
import NodeLink from '@/Components/Moderation/NodeLink.vue';
import ModerationListing from '@/Components/Moderation/ModerationListing.vue';
import {
    moderationListingProps,
    useModerationListing,
} from '@/useModerationListing';

const props = defineProps(moderationListingProps);
const listing = useModerationListing(props, 'audit');
const { absoluteTime, query } = listing;
const columns = [
    [null, 'Time'],
    [null, 'Moderator'],
    [null, 'Action'],
    [null, 'Subject'],
    [null, 'Details'],
];
</script>
<template>
    <ModerationListing :columns="columns" :listing="listing"
        ><template #row="{ row }"
            ><td class="text-xs">
                {{ absoluteTime(row.created_at) }}
            </td>
            <td>{{ row.actor }}</td>
            <td class="text-xs">
                {{ row.action.replaceAll('.', ' ') }}
            </td>
            <td class="font-mono text-xs">
                <NodeLink
                    v-if="row.subject_type === 'node'"
                    :node-id="row.subject_id"
                    class="mod-link"
                    >{{ row.subject_type }} #{{ row.subject_id }}</NodeLink
                >
                <Link
                    v-else-if="row.subject_type === 'changeset'"
                    :href="query('changesets', { changeset: row.subject_id })"
                    class="mod-link"
                    >{{ row.subject_type }} #{{ row.subject_id }}</Link
                >
                <template v-else>
                    {{ row.subject_type }} #{{ row.subject_id }}
                </template>
            </td>
            <td class="text-xs text-daf-text-secondary">
                {{
                    row.details.name ||
                    `${row.details.from} → ${row.details.to}`
                }}
            </td></template
        ></ModerationListing
    >
</template>
