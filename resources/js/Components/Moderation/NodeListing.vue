<script setup>
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
    expanded,
    dismissingFlag,
    query,
    osm,
    rowKey,
    expand,
    dismissFlag,
    route,
    absoluteTime,
} = props.listing;
</script>
<template>
    <ModerationListing :columns="columns" :listing="listing"
        ><template #row="{ row }"
            ><td class="font-mono text-xs font-semibold">
                <NodeLink
                    :from="view"
                    :node-id="row.id"
                    class="hover:text-daf-text-brand hover:underline"
                    >{{ row.id }}</NodeLink
                >
                <div
                    class="mt-1 text-[10px] font-normal text-daf-text-tertiary"
                >
                    v{{ row.osm_version }}
                </div>
                <details v-if="row.flags?.length" class="mt-2 text-xs">
                    <summary class="cursor-pointer text-[var(--alert-600)]">
                        {{ row.flags.length }} rule violations
                    </summary>
                    <div
                        v-for="flag in row.flags"
                        :key="flag.id"
                        class="mt-2 max-w-sm space-y-2"
                    >
                        <Link
                            :href="route('moderation.rules.edit', flag.rule_id)"
                            class="mod-link"
                            >{{ flag.rule.name }}</Link
                        ><span>
                            · {{ flag.rule.severity
                            }}{{ flag.stale ? ' · Stale' : '' }}</span
                        >
                        <pre class="whitespace-pre-wrap break-all">{{
                            JSON.stringify(flag.evidence, null, 2)
                        }}</pre>
                        <button
                            v-if="view === 'nodes'"
                            :disabled="dismissingFlag !== null"
                            class="mod-link"
                            @click="dismissFlag(flag)"
                        >
                            Dismiss flag
                        </button>
                    </div>
                </details>
            </td>
            <td v-if="view === 'flagged'">
                <div class="flex min-w-[150px] flex-wrap gap-1">
                    <Link
                        v-for="flag in row.flags"
                        :key="flag.id"
                        :href="route('moderation.rules.edit', flag.rule_id)"
                        class="rounded-dafXs border border-daf-border px-[7px] py-0.5 text-[11px] font-semibold text-daf-text-secondary hover:text-daf-text-brand"
                    >
                        {{ flag.rule.name }}{{ flag.stale ? ' · Stale' : '' }}
                    </Link>
                </div>
            </td>
            <td v-if="view === 'flagged'">
                <span
                    v-for="severity in [
                        ...new Set(
                            (row.flags || []).map((flag) => flag.rule.severity),
                        ),
                    ]"
                    :key="severity"
                    :class="[
                        'mod-chip',
                        severity === 'High'
                            ? '!border-[var(--alert-500)] bg-[var(--alert-100)] !text-[var(--alert-600)]'
                            : severity === 'Medium'
                              ? '!border-[var(--amber-500)] bg-[var(--amber-100)] !text-[var(--amber-600)]'
                              : 'bg-daf-surface-alt',
                    ]"
                    >{{ severity }}</span
                >
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
                    :datetime="row.changed_at"
                    :title="absoluteTime(row.changed_at)"
                    >{{ relativeTime(row.changed_at) }}</time
                >
            </td>
            <td>
                <div class="flex flex-wrap items-center gap-3">
                    <template v-if="view === 'flagged'">
                        <button
                            v-for="flag in row.flags"
                            :key="flag.id"
                            :aria-label="`Dismiss ${flag.rule.name} for node ${row.id}`"
                            :disabled="dismissingFlag !== null"
                            class="mod-button !h-[30px] !px-3"
                            @click="dismissFlag(flag)"
                        >
                            {{
                                row.flags.length === 1
                                    ? 'Dismiss'
                                    : `Dismiss ${flag.rule.name}`
                            }}
                        </button>
                    </template>
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
                    {{ row.previous?.osm_user || 'No prior version available' }}
                </dd>
            </dl>
            <h3 class="mod-label mt-5">Tags · previous → current</h3>
            <dl class="mod-details mt-2">
                <template
                    v-for="key in [
                        ...new Set([
                            ...Object.keys(row.previous?.tags || {}),
                            ...Object.keys(row.tags),
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
            </dl></template
        ></ModerationListing
    >
</template>
