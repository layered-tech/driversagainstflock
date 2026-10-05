<script setup>
import FlagDetails from '@/Components/Moderation/FlagDetails.vue';
import FlaggedActions from '@/Components/Moderation/FlaggedActions.vue';
import {
    flagDetectedAt,
    flagSeverity,
    flagSummary,
    severityClass,
} from '@/moderationFlags';
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
    columnVisible,
    toggle,
    changeSource,
    osmUrl,
} = props.listing;
const visible = (key) => view !== 'flagged' || columnVisible(key);
const detected = (row) =>
    state.flag_source === 'alpr_presence'
        ? row.reported_at
        : flagDetectedAt(row) || row.reported_at;
function filterRule(flag) {
    if (flag.source === 'alpr_presence') {
        changeSource('alpr_presence', true);
    } else if (flag.rule_id) {
        state.rules = (state.rules || []).map(Number);
        if (!state.rules.includes(Number(flag.rule_id)))
            toggle('rules', Number(flag.rule_id));
    }
}
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
            <td
                v-if="view === 'flagged' && visible('rules')"
                class="min-w-[150px] max-w-[260px]"
            >
                <div class="flex flex-wrap items-center gap-1">
                    <button
                        v-for="flag in (row.flags || []).slice(0, 2)"
                        :key="flag.id"
                        :class="severityClass(flag.rule?.severity)"
                        :title="`${flag.rule?.severity || 'Unverified'} · ${flagSummary(flag, row.id)}`"
                        class="mod-rule-tag"
                        type="button"
                        @click="filterRule(flag)"
                    >
                        <span class="mod-severity-dot" />{{
                            flag.source === 'alpr_presence'
                                ? 'Not there'
                                : flag.rule?.name || 'Rule unavailable'
                        }}<template
                            v-if="
                                flag.source === 'alpr_presence' &&
                                flag.evidence?.report_count != null
                            "
                        >
                            · {{ flag.evidence.report_count }}</template
                        >
                    </button>
                    <button
                        v-if="row.flags?.length > 2"
                        :title="
                            row.flags
                                .slice(2)
                                .map((flag) => flag.rule?.name || 'Not there')
                                .join(', ')
                        "
                        class="mod-rule-tag !border-dashed font-mono"
                        type="button"
                        @click="expand(row)"
                    >
                        +{{ row.flags.length - 2 }}
                    </button>
                </div>
            </td>
            <td v-if="view === 'flagged' && visible('severity')">
                <span
                    v-if="flagSeverity(row.flags)"
                    :class="severityClass(flagSeverity(row.flags))"
                    class="mod-severity"
                    >{{ flagSeverity(row.flags) }}</span
                >
                <span
                    v-else
                    aria-label="Severity unavailable"
                    class="text-xs text-daf-text-tertiary"
                    >—</span
                >
            </td>
            <td v-if="view !== 'flagged'">
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
            <td
                v-if="visible('direction')"
                class="whitespace-nowrap font-mono text-xs"
            >
                {{ row.direction === null ? '—' : `${row.direction}°` }}
            </td>
            <td
                v-if="visible('operator')"
                :title="row.operator"
                class="max-w-[150px] truncate text-xs text-daf-text-secondary"
            >
                {{ row.operator || 'Unknown' }}
            </td>
            <td v-if="visible('editor')" class="max-w-[180px]">
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
                <div
                    v-if="view === 'flagged' && row.osm_uid"
                    class="mt-1 flex gap-2.5"
                >
                    <Link
                        :href="
                            query('changesets', { user: String(row.osm_uid) })
                        "
                        class="mod-link"
                        >Changesets</Link
                    >
                    <Link
                        :href="query('profile', { uid: row.osm_uid })"
                        class="mod-link"
                        >Profile</Link
                    >
                </div>
            </td>
            <td
                v-if="view !== 'flagged'"
                class="max-w-[160px] truncate text-xs text-daf-text-secondary"
            >
                {{ locationLabel(row) }}
            </td>
            <td
                v-if="visible('detected')"
                class="whitespace-nowrap font-mono text-xs text-daf-text-tertiary"
            >
                <time
                    :datetime="
                        view === 'flagged' ? detected(row) : row.changed_at
                    "
                    :title="
                        absoluteTime(
                            view === 'flagged' ? detected(row) : row.changed_at,
                        )
                    "
                    >{{
                        relativeTime(
                            view === 'flagged' ? detected(row) : row.changed_at,
                        )
                    }}</time
                >
            </td>
            <td :class="view === 'flagged' && '!px-0'">
                <div
                    v-if="view === 'flagged'"
                    class="flex items-center gap-1.5"
                >
                    <button
                        v-if="
                            row.flags?.find(
                                (flag) =>
                                    flag.source === 'alpr_presence' &&
                                    flag.status === 'open',
                            )
                        "
                        :disabled="dismissingFlag !== null"
                        class="mod-button !h-[30px] !px-3"
                        type="button"
                        @click="
                            dismissFlag(
                                row.flags.find(
                                    (flag) =>
                                        flag.source === 'alpr_presence' &&
                                        flag.status === 'open',
                                ),
                            )
                        "
                    >
                        Dismiss
                    </button>
                    <FlaggedActions :node="row" :osm-url="osmUrl" />
                </div>
                <div v-else class="flex flex-wrap items-center gap-3">
                    <a
                        :href="osm(`/edit?editor=id&node=${row.id}`)"
                        class="mod-link"
                        rel="noopener noreferrer"
                        target="_blank"
                        >Edit ↗</a
                    >
                </div>
            </td>
            <td :class="view === 'flagged' && '!px-1'">
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
                <p
                    v-if="row.osm_edit?.pending_sync"
                    class="mb-3 text-xs text-daf-text-secondary"
                    role="status"
                >
                    Saved to OSM as version {{ row.osm_version }}. Report
                    history and rule checks are refreshing; flagged evidence may
                    describe an earlier version.
                </p>
                <FlagDetails
                    :absolute-time="absoluteTime"
                    :dismissing="dismissingFlag !== null"
                    :flags="row.flags || []"
                    :node-id="row.id"
                    :reports="details[rowKey(row)]?.reports"
                    :show-actions="view !== 'flagged'"
                    inline
                    @dismiss="dismissFlag"
                    @reports-page="loadDetails(row, $event)"
                />
            </section> </template
        ><template #detail="{ row }">
            <section
                v-if="view === 'flagged'"
                :aria-label="`Node information for ${row.id}`"
            >
                <dl
                    class="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-x-7 gap-y-0.5 rounded-dafSm border border-daf-border bg-daf-surface-card px-3.5 py-2 text-xs"
                >
                    <div
                        v-for="[label, value] in [
                            [
                                'Coordinates',
                                `${row.latitude}, ${row.longitude}`,
                            ],
                            ['Location', locationLabel(row)],
                            ['Last changeset', `#${row.osm_changeset_id}`],
                            [
                                'Changed by',
                                `${row.osm_user || 'Unknown'} · uid ${row.osm_uid || '—'}`,
                            ],
                            [
                                row.flags?.some(
                                    (flag) => flag.source === 'rule',
                                )
                                    ? 'Detected'
                                    : 'Latest report',
                                absoluteTime(detected(row)),
                            ],
                        ]"
                        :key="label"
                        class="grid min-w-0 grid-cols-[112px_minmax(0,1fr)] items-baseline gap-3 py-[5px]"
                    >
                        <dt class="mod-label leading-normal">{{ label }}</dt>
                        <dd
                            class="min-w-0 break-words font-mono text-[12.5px] leading-normal text-daf-text-primary"
                        >
                            {{ value }}
                        </dd>
                    </div>
                </dl>
                <h3 class="mod-label mb-2 mt-4">OSM tags</h3>
                <div
                    class="flex max-w-[420px] flex-col gap-1 rounded-dafSm border border-daf-border bg-daf-surface-card px-3 py-2.5"
                >
                    <span
                        v-for="key in [
                            ...new Set([
                                'man_made',
                                'surveillance',
                                'surveillance:type',
                                'camera:mount',
                                'camera:type',
                                'operator',
                                'direction',
                                ...Object.keys(row.tags || {}),
                            ]),
                        ]"
                        :key="key"
                        class="break-words font-mono text-xs text-daf-text-primary"
                        ><span class="text-daf-text-tertiary">{{ key }} = </span
                        ><span
                            :class="
                                !row.tags?.[key] && 'text-[var(--alert-600)]'
                            "
                            class="font-semibold"
                            >{{ row.tags?.[key] || '(missing)' }}</span
                        ></span
                    >
                </div>
                <div class="mt-4 flex gap-4">
                    <NodeLink
                        :filters="state"
                        :from="view"
                        :node-id="row.id"
                        class="mod-button !border-0 bg-[var(--brand-soft)] !font-bold !text-daf-text-brand"
                        >Node history</NodeLink
                    ><a
                        :href="osm(`/node/${row.id}`)"
                        class="mod-link"
                        rel="noopener noreferrer"
                        target="_blank"
                        >Open in OSM ↗</a
                    >
                </div>
            </section>
            <section v-else :aria-label="`Node information for ${row.id}`">
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
