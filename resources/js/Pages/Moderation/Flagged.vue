<script setup>
import NodeListing from '@/Components/Moderation/NodeListing.vue';
import { computed } from 'vue';
import {
    moderationListingProps,
    useModerationListing,
} from '@/useModerationListing';

const props = defineProps(moderationListingProps);
const listing = useModerationListing(props, 'flagged');
const columns = computed(() => [
    ['id', 'Node'],
    [null, 'What happened'],
    [null, 'Changeset'],
    ['direction', 'Direction'],
    ['operator', 'Operator'],
    ['osm_user', 'Editor'],
    [null, 'Location'],
    [
        props.filters?.flag_source === 'alpr_presence'
            ? 'reported_at'
            : 'changed_at',
        props.filters?.flag_source === 'alpr_presence'
            ? 'Report received'
            : 'Node updated',
    ],
    [null, 'Actions'],
    [null, ''],
]);
</script>
<template><NodeListing :columns="columns" :listing="listing" /></template>
