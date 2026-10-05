<script setup>
import NodeListing from '@/Components/Moderation/NodeListing.vue';
import { computed } from 'vue';
import {
    moderationListingProps,
    useModerationListing,
} from '@/useModerationListing';

const props = defineProps(moderationListingProps);
const listing = useModerationListing(props, 'flagged');
const columns = computed(() =>
    [
        ['id', 'Node', 'node'],
        [null, 'Rules', 'rules'],
        ['severity', 'Severity', 'severity'],
        ['direction', 'Direction', 'direction'],
        ['operator', 'Operator', 'operator'],
        ['osm_user', 'Changed by', 'editor'],
        [
            props.filters?.flag_source === 'alpr_presence'
                ? 'reported_at'
                : 'detected_at',
            'Detected',
            'detected',
        ],
        [null, 'Actions', 'actions'],
        [null, '', 'expand'],
    ].filter(([, , key]) => listing.columnVisible(key)),
);
</script>
<template><NodeListing :columns="columns" :listing="listing" /></template>
