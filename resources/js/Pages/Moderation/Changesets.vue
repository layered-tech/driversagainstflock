<script setup>
import DafIcon from '@/Components/Daf/DafIcon.vue';
import ChangeCounts from '@/Components/Moderation/ChangeCounts.vue';
import NodeLink from '@/Components/Moderation/NodeLink.vue';
import { Link } from '@inertiajs/vue3';
import { locationLabel, relativeTime } from '@/moderation';
import ModerationListing from '@/Components/Moderation/ModerationListing.vue';
import {
    moderationListingProps,
    useModerationListing,
} from '@/useModerationListing';

const props = defineProps(moderationListingProps);
const listing = useModerationListing(props, 'changesets');
const {
    expanded,
    details,
    selectedNodes,
    review,
    query,
    rowKey,
    loadDetails,
    expand,
    saveReview,
    absoluteTime,
} = listing;
const columns = [
    ['id', 'Changeset'],
    ['osm_user', 'Editor'],
    ['changes', '+ / ~ / −'],
    [null, 'Location'],
    ['changed_at', 'Time'],
    [null, ''],
];
</script>
<template>
    <ModerationListing :columns="columns" :listing="listing"
        ><template #row="{ row }"
            ><td class="font-mono text-[13px] font-semibold">
                <Link
                    :href="query('changesets', { changeset: row.id })"
                    class="mod-link"
                    >#{{ row.id }}</Link
                >
            </td>
            <td class="max-w-[260px]">
                <Link
                    v-if="row.osm_uid"
                    :href="
                        query('profile', {
                            uid: row.osm_uid,
                        })
                    "
                    class="font-semibold hover:text-daf-text-brand"
                    >{{ row.osm_user || 'Unknown editor' }}</Link
                ><span v-else class="font-semibold text-daf-text-tertiary"
                    >Unknown editor</span
                >
                <div
                    :title="row.comment"
                    class="mt-1 truncate text-xs text-daf-text-secondary"
                >
                    {{ row.comment || 'No changeset comment' }}
                </div>
                <div v-if="row.osm_uid" class="mt-[3px] flex gap-3">
                    <Link
                        :href="
                            query('profile', {
                                uid: row.osm_uid,
                            })
                        "
                        class="mod-link"
                        >Profile</Link
                    >
                    <Link
                        :href="
                            query('nodes', {
                                uid: row.osm_uid,
                            })
                        "
                        class="mod-link"
                        >ALPR nodes</Link
                    >
                </div>
            </td>
            <td><ChangeCounts :row="row" /></td>
            <td class="max-w-[160px] truncate text-xs text-daf-text-secondary">
                {{ locationLabel(row) }}
            </td>
            <td
                class="whitespace-nowrap text-right font-mono text-xs text-daf-text-tertiary"
            >
                <time
                    :datetime="row.changed_at"
                    :title="absoluteTime(row.changed_at)"
                    >{{ relativeTime(row.changed_at) }}</time
                >
            </td>
            <td>
                <button
                    :aria-expanded="expanded === rowKey(row)"
                    :aria-label="`Details for changeset ${row.id}`"
                    class="mod-expand"
                    @click="expand(row)"
                >
                    <DafIcon
                        :class="expanded === rowKey(row) && 'rotate-180'"
                        :size="16"
                        name="chevron-down"
                    />
                </button></td></template
        ><template #detail="{ row }"
            ><h2 class="mod-subheading">
                {{ row.comment || `Changeset #${row.id}` }}
            </h2>
            <div class="my-3 flex flex-wrap gap-3">
                <button
                    :disabled="review.processing"
                    class="mod-button"
                    @click="saveReview(row, 'Reviewed')"
                >
                    Mark reviewed</button
                ><button
                    :disabled="review.processing"
                    class="mod-button"
                    @click="saveReview(row, 'Flagged')"
                >
                    Flag changeset</button
                ><button
                    v-if="row.status !== 'Needs review'"
                    :disabled="review.processing"
                    class="mod-link"
                    @click="saveReview(row, 'Needs review')"
                >
                    Return to review
                </button>
            </div>
            <dl class="mod-details">
                <dt>Editor</dt>
                <dd>
                    {{ row.osm_user }} · uid
                    {{ row.osm_uid }}
                </dd>
                <dt>Opened</dt>
                <dd>
                    {{ absoluteTime(row.changed_at) }}
                </dd>
                <dt>Closed</dt>
                <dd>
                    {{ row.open ? 'Still open' : absoluteTime(row.closed_at) }}
                </dd>
                <dt>Changes</dt>
                <dd>
                    {{ row.total }}
                    tracked ALPR nodes ·
                    {{ row.osm_num_changes }}
                    total OSM changes
                </dd>
            </dl>
            <details v-if="row.outcomes?.length" class="mt-4 text-xs">
                <summary
                    class="cursor-pointer font-semibold text-[var(--alert-600)]"
                >
                    Revert details ·
                    {{ row.outcomes.length }}
                    events
                </summary>
                <p v-for="event in row.outcomes" :key="event.id" class="mt-2">
                    <NodeLink :node-id="event.node_id" class="mod-link"
                        >Node {{ event.node_id }}</NodeLink
                    >
                    ·
                    {{ event.kind === 'deleted' ? 'Deleted' : 'Tags changed' }}
                    by
                    {{ event.later_osm_user || event.later_osm_uid }}
                    ·
                    {{ absoluteTime(event.occurred_at)
                    }}{{
                        event.history_complete ? '' : ' · Incomplete history'
                    }}
                </p>
            </details>
            <h3 class="mod-label mt-5">Changeset tags</h3>
            <dl class="mod-details mt-2">
                <template v-for="(value, key) in row.tags" :key="key"
                    ><dt>{{ key }}</dt>
                    <dd>
                        {{ value }}
                    </dd></template
                >
            </dl>
            <div v-if="details[rowKey(row)]" class="mt-5">
                <h3 class="mod-label">Node versions in this changeset</h3>
                <ul class="mt-2 flex flex-wrap gap-2">
                    <li
                        v-for="node in details[rowKey(row)].versions.data"
                        :key="node.id"
                        :class="[
                            'rounded-dafXs px-2 py-1 transition-colors',
                            selectedNodes[rowKey(row)] === node.id
                                ? 'bg-[var(--brand-soft)] ring-2 ring-daf-brand'
                                : '',
                        ]"
                    >
                        <NodeLink :node-id="node.node_id" class="mod-link"
                            >{{ node.node_id }} · v{{ node.osm_version }}
                            {{ node.visible ? '' : '· deleted' }}
                        </NodeLink>
                    </li>
                </ul>
                <button
                    v-if="details[rowKey(row)].versions.prev_page_url"
                    class="mod-link mr-3 mt-2"
                    @click="
                        loadDetails(
                            row,
                            details[rowKey(row)].versions.prev_page_url,
                        )
                    "
                >
                    ← Previous node versions
                </button>
                <button
                    v-if="details[rowKey(row)].versions.next_page_url"
                    class="mod-link mt-2"
                    @click="
                        loadDetails(
                            row,
                            details[rowKey(row)].versions.next_page_url,
                        )
                    "
                >
                    Next node versions →
                </button>
                <h3 class="mod-label mt-5">
                    Discussion ·
                    {{ row.available_discussion_comments }}
                    available /
                    {{ row.comments_count }}
                    reported
                </h3>
                <p
                    v-if="!details[rowKey(row)].comments.data.length"
                    class="mt-2 text-xs text-daf-text-tertiary"
                >
                    No discussion comments available.
                </p>
                <article
                    v-for="comment in details[rowKey(row)].comments.data"
                    :key="comment.ordinal"
                    class="mt-3 border-l-2 border-daf-border pl-3"
                >
                    <div class="text-xs font-semibold">
                        {{ comment.osm_user || 'Unknown editor' }}
                        ·
                        {{ absoluteTime(comment.commented_at) }}
                    </div>
                    <p
                        class="mt-1 whitespace-pre-wrap break-words text-sm text-daf-text-secondary"
                    >
                        {{ comment.body }}
                    </p>
                </article>
                <button
                    v-if="details[rowKey(row)].comments.prev_page_url"
                    class="mod-link mr-3 mt-2"
                    @click="
                        loadDetails(
                            row,
                            details[rowKey(row)].comments.prev_page_url,
                        )
                    "
                >
                    ← Previous comments
                </button>
                <button
                    v-if="details[rowKey(row)].comments.next_page_url"
                    class="mod-link mt-2"
                    @click="
                        loadDetails(
                            row,
                            details[rowKey(row)].comments.next_page_url,
                        )
                    "
                >
                    Next comments →
                </button>
            </div></template
        ></ModerationListing
    >
</template>
