<script setup>
import FlagDetails from '@/Components/Moderation/FlagDetails.vue';
import { flagTiming } from '@/moderationFlags';
import ModerationListing from '@/Components/Moderation/ModerationListing.vue';
import DafIcon from '@/Components/Daf/DafIcon.vue';
import NodeLink from '@/Components/Moderation/NodeLink.vue';
import { Link } from '@inertiajs/vue3';
import { locationLabel, relativeTime } from '@/moderation';

const props = defineProps({
    listing: { type: Object, required: true },
    columns: { type: Array, required: true },
});
const {
    view,
    state,
    expanded,
    dismissingFlag,
    details,
    loadDetails,
    query,
    osm,
    rowKey,
    expand,
    dismissFlag,
    absoluteTime,
} = props.listing;
</script>
<template>
    <ModerationListing :columns="columns" :listing="listing"
        ><template #row="{ row }"
            ><td class="font-mono text-xs font-semibold">
                <NodeLink
                    :from="view"
                    :filters="state"
                    :node-id="row.id"
                    class="hover:text-daf-text-brand hover:underline"
                    >{{ row.id }}</NodeLink
                >
                <div
                    class="mt-1 text-[10px] font-normal text-daf-text-tertiary"
                >
                    v{{ row.osm_version }}
                </div>
                <span
                    v-if="view === 'nodes' && row.flags?.length"
                    class="mt-2 block text-xs font-normal text-[var(--alert-600)]"
                >
                    {{ row.flags.length }}
                    {{ row.flags.length === 1 ? 'flag' : 'flags' }} · expand for
                    details
                </span>
            </td>
            <td v-if="view === 'flagged'" class="min-w-[180px]">
                <div class="divide-y divide-daf-border">
                    <div
                        v-for="flag in row.flags"
                        :key="flag.id"
                        class="flex flex-col items-start gap-1 py-2 first:pt-0 last:pb-0"
                    >
                        <span class="mod-chip">
                            {{
                                flag.source === 'alpr_presence'
                                    ? 'not-there'
                                    : flag.rule?.name || 'Rule unavailable'
                            }}
                            <template
                                v-if="
                                    flag.source === 'alpr_presence' &&
                                    flag.evidence?.report_count != null
                                "
                            >
                                · {{ flag.evidence.report_count }}</template
                            >
                        </span>
                        <span
                            v-if="flagTiming(flag).at"
                            class="text-[11px] text-daf-text-tertiary"
                        >
                            {{
                                flag.source === 'alpr_presence'
                                    ? 'Last reported'
                                    : 'Last checked'
                            }}
                            ·
                            <time
                                :datetime="flagTiming(flag).at"
                                :title="absoluteTime(flagTiming(flag).at)"
                                >{{ relativeTime(flagTiming(flag).at) }}</time
                            >
                        </span>
                    </div>
                </div>
            </td>
            <td>
                <Link
                    :href="
                        query('changesets', {
                            changeset: row.osm_changeset_id,
                        })
                    "
                    class="mod-link font-mono"
                    >#{{ row.osm_changeset_id }}</Link
                >
            </td>
            <td class="font-mono text-xs">
                {{ row.direction === null ? '—' : `${row.direction}°` }}
            </td>
            <td class="max-w-[150px] text-xs">
                {{ row.operator || 'Unknown' }}
            </td>
            <td class="max-w-[180px]">
                <Link
                    v-if="row.osm_uid"
                    :href="
                        query('profile', {
                            uid: row.osm_uid,
                        })
                    "
                    class="text-xs font-semibold hover:text-daf-text-brand"
                    >{{ row.osm_user || row.osm_uid }}</Link
                ><span v-else class="text-xs text-daf-text-tertiary"
                    >Unknown</span
                >
            </td>
            <td class="max-w-[160px] truncate text-xs text-daf-text-secondary">
                {{ locationLabel(row) }}
            </td>
            <td
                class="whitespace-nowrap font-mono text-xs text-daf-text-tertiary"
            >
                <time
                    :datetime="
                        state.flag_source === 'alpr_presence'
                            ? row.reported_at
                            : row.changed_at
                    "
                    :title="
                        absoluteTime(
                            state.flag_source === 'alpr_presence'
                                ? row.reported_at
                                : row.changed_at,
                        )
                    "
                    >{{
                        relativeTime(
                            state.flag_source === 'alpr_presence'
                                ? row.reported_at
                                : row.changed_at,
                        )
                    }}</time
                >
            </td>
            <td>
                <div class="flex flex-wrap items-center gap-3">
                    <a
                        :href="osm(`/edit?editor=id&node=${row.id}`)"
                        class="mod-link"
                        rel="noopener noreferrer"
                        target="_blank"
                        >Edit ↗</a
                    >
                </div>
            </td>
            <td>
                <button
                    :aria-expanded="expanded === rowKey(row)"
                    :aria-label="`Details for node ${row.id}`"
                    :aria-controls="`node-details-${row.id}`"
                    class="mod-expand"
                    @click="expand(row)"
                >
                    <DafIcon
                        :class="expanded === rowKey(row) && 'rotate-180'"
                        :size="16"
                        name="chevron-down"
                    />
                </button></td></template
        ><template #detail-top="{ row }">
            <section
                :id="`node-details-${row.id}`"
                :aria-label="`Flagged violations for node ${row.id}`"
            >
                <FlagDetails
                    :absolute-time="absoluteTime"
                    :dismissing="dismissingFlag !== null"
                    :flags="row.flags || []"
                    :node-id="row.id"
                    :reports="details[rowKey(row)]?.reports"
                    inline
                    @dismiss="dismissFlag"
                    @reports-page="loadDetails(row, $event)"
                />
            </section> </template
        ><template #detail="{ row }">
            <section :aria-label="`Node information for ${row.id}`">
                <h2 class="mod-subheading">
                    <NodeLink
                        :node-id="row.id"
                        class="hover:text-daf-text-brand hover:underline"
                        >Node {{ row.id }}</NodeLink
                    >
                    · version
                    {{ row.osm_version }}
                </h2>
                <div class="my-3 flex gap-4">
                    <a
                        :href="osm(`/node/${row.id}`)"
                        class="mod-link"
                        rel="noopener noreferrer"
                        target="_blank"
                        >View on OSM ↗</a
                    ><a
                        :href="osm(`/node/${row.id}/history`)"
                        class="mod-link"
                        rel="noopener noreferrer"
                        target="_blank"
                        >History ↗</a
                    ><Link
                        :href="
                            query('changesets', {
                                changeset: row.osm_changeset_id,
                            })
                        "
                        class="mod-link"
                        >Changeset #{{ row.osm_changeset_id }}</Link
                    >
                </div>
                <dl class="mod-details">
                    <dt>Location</dt>
                    <dd>
                        {{ locationLabel(row) }}
                    </dd>
                    <dt>State</dt>
                    <dd>
                        {{ row.visible ? 'Visible' : 'Deleted' }}
                    </dd>
                    <dt>Previous editor</dt>
                    <dd>
                        {{
                            row.previous?.osm_user ||
                            'No prior version available'
                        }}
                    </dd>
                </dl>
                <h3 class="mod-label mt-5">Tags · previous → current</h3>
                <dl class="mod-details mt-2">
                    <template
                        v-for="key in [
                            ...new Set([
                                ...Object.keys(row.previous?.tags || {}),
                                ...Object.keys(row.tags || {}),
                            ]),
                        ]"
                        :key="key"
                        ><dt>{{ key }}</dt>
                        <dd>
                            <span
                                v-if="
                                    row.previous &&
                                    row.previous.tags[key] !== row.tags[key]
                                "
                                class="text-[var(--alert-600)]"
                                >{{ row.previous.tags[key] || '—' }} → </span
                            >{{ row.tags[key] || '—' }}
                        </dd></template
                    >
                </dl>
            </section></template
        ></ModerationListing
    >
</template>
