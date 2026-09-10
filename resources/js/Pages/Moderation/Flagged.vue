<script setup>
import NodeListing from '@/Components/Moderation/NodeListing.vue';
import {
    moderationListingProps,
    useModerationListing,
} from '@/useModerationListing';

const props = defineProps(moderationListingProps);
const listing = useModerationListing(props, 'flagged');
const columns = [
    ['id', 'Node'],
    [null, 'Rules'],
    [null, 'Severity'],
    [null, 'Changeset'],
    ['direction', 'Direction'],
    ['operator', 'Operator'],
    ['osm_user', 'Editor'],
    [null, 'Location'],
    ['changed_at', 'Updated'],
    [null, 'Actions'],
    [null, ''],
];
</script>
<template><NodeListing :columns="columns" :listing="listing" /></template>
