<script setup>
import ChangeCounts from '@/Components/Moderation/ChangeCounts.vue';
import { Link } from '@inertiajs/vue3';
import { relativeTime } from '@/moderation';
import ModerationListing from '@/Components/Moderation/ModerationListing.vue';
import {
    moderationListingProps,
    useModerationListing,
} from '@/useModerationListing';

const props = defineProps(moderationListingProps);
const listing = useModerationListing(props, 'editors');
const { query, absoluteTime } = listing;
const columns = [
    ['name', 'Editor'],
    ['changesets_count', 'Changesets'],
    ['changes', '+ / ~ / −'],
    ['flags_count', 'Open flags'],
    ['survival', 'Survival'],
    ['area_count', 'Areas'],
    ['last_active', 'Last active'],
];
</script>
<template>
    <ModerationListing :columns="columns" :listing="listing"
        ><template #row="{ row }"
            ><td>
                <Link
                    :href="
                        query('profile', {
                            uid: row.osm_uid,
                        })
                    "
                    class="font-semibold hover:text-daf-text-brand"
                    >{{ row.name || row.osm_uid }}</Link
                ><span class="ml-2 font-mono text-[10px] text-daf-text-tertiary"
                    >uid {{ row.osm_uid }}</span
                >
                <div class="mt-1.5 flex gap-3">
                    <Link
                        :href="
                            query('profile', {
                                uid: row.osm_uid,
                            })
                        "
                        class="mod-link"
                        >Profile</Link
                    ><Link
                        :href="
                            query('changesets', {
                                user: String(row.osm_uid),
                            })
                        "
                        class="mod-link"
                        >Changesets</Link
                    ><Link
                        :href="
                            query('nodes', {
                                user: String(row.osm_uid),
                            })
                        "
                        class="mod-link"
                        >ALPR nodes</Link
                    >
                </div>
            </td>
            <td class="font-mono">
                {{ row.tracked_changesets }}
            </td>
            <td><ChangeCounts :row="row" /></td>
            <td class="font-mono">
                {{ row.flags_count ?? '—' }}
            </td>
            <td class="font-mono">
                {{
                    row.survival?.percent == null
                        ? '—'
                        : `${row.survival.percent}%`
                }}
            </td>
            <td class="font-mono">
                {{ row.area_count ?? '—' }}
            </td>
            <td
                class="whitespace-nowrap font-mono text-xs text-daf-text-tertiary"
            >
                <time
                    :datetime="row.last_active"
                    :title="absoluteTime(row.last_active)"
                    >{{ relativeTime(row.last_active) }}</time
                >
            </td></template
        ></ModerationListing
    >
</template>
