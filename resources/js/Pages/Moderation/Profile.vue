<script setup>
import EditorProfile from '@/Components/Moderation/EditorProfile.vue';
import ModerationLayout from '@/Layouts/ModerationLayout.vue';
import ModerationPageHeader from '@/Components/Moderation/ModerationPageHeader.vue';
import { Head } from '@inertiajs/vue3';
import {
    moderationListingProps,
    useModerationListing,
} from '@/useModerationListing';

const props = defineProps(moderationListingProps);
const listing = useModerationListing(props, 'profile');
const { title, filters, records, profile, weeks, counts, osmUrl } = listing;
</script>
<template>
    <ModerationLayout :counts="counts" navigation view="profile"
        ><Head :title="`${title} · DAF Moderation`"
            ><meta content="noindex, nofollow" name="robots"
        /></Head>
        <div class="moderation-page">
            <ModerationPageHeader :listing="listing" /><EditorProfile
                v-if="profile"
                :filters="filters"
                :osm-url="osmUrl"
                :profile="profile"
                :records="records"
                :weeks="weeks"
            /></div
    ></ModerationLayout>
</template>
