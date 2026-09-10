<script setup>
import { useModerationTime } from '@/useModerationTime';
import ChangeCounts from '@/Components/Moderation/ChangeCounts.vue';
import DafIcon from '@/Components/Daf/DafIcon.vue';
import ModerationMap from '@/Components/Moderation/ModerationMap.vue';
import NodeLink from '@/Components/Moderation/NodeLink.vue';
import {
    changesetNodes,
    locationLabel,
    nodeChangeKind,
    relativeTime,
} from '@/moderation';
import { Link } from '@inertiajs/vue3';
import { computed, inject, onBeforeUnmount, reactive, ref, watch } from 'vue';

const { absoluteTime } = useModerationTime();
const props = defineProps({
    profile: Object,
    records: Object,
    weeks: Array,
    filters: Object,
    osmUrl: String,
});
const route = inject('route');
const expanded = ref(null);
const details = reactive({});
const detailErrors = reactive({});
const detailLoading = reactive({});
const selectedNodes = reactive({});
const requests = new Map();
const initials = computed(() =>
    (props.profile.name || String(props.profile.osm_uid))
        .split(/[_\s.-]+/)
        .filter(Boolean)
        .map((part) => part[0])
        .join('')
        .slice(0, 2)
        .toUpperCase(),
);
const tiles = computed(() => [
    [
        props.profile.tracked_changesets,
        'changesets',
        'in the tracked history',
        'text-daf-text-primary',
    ],
    [
        `+${props.profile.added}`,
        'nodes created',
        'added to the map',
        'text-daf-text-brand',
    ],
    [
        `~${props.profile.modified}`,
        'nodes edited',
        'retagged or moved',
        'text-[var(--amber-600)]',
    ],
    [
        `−${props.profile.deleted}`,
        'nodes deleted',
        'removed from the map',
        'text-[var(--alert-600)]',
    ],
    [
        props.profile.survival?.reverted ?? '—',
        'reverted',
        'changesets affected',
        'text-[var(--alert-600)]',
    ],
    [
        props.profile.flags_count ?? '—',
        'open flags',
        'flagged nodes',
        'text-daf-text-tertiary',
    ],
]);
const maxWeek = computed(() =>
    Math.max(1, ...props.weeks.map((week) => Number(week.total))),
);
const flagged = computed(() => props.filters.statuses?.includes('Flagged'));
function listing(view) {
    return route('moderation.index', { view, uid: props.profile.osm_uid });
}
function timeline(onlyFlagged = false, reverted = false) {
    return route('moderation.index', {
        view: 'profile',
        uid: props.profile.osm_uid,
        ...(onlyFlagged ? { statuses: ['Flagged'] } : {}),
        ...(reverted ? { outcome: 'reverted' } : {}),
    });
}
async function loadDetails(row, url) {
    requests.get(row.id)?.abort();
    const request = new AbortController();
    requests.set(row.id, request);
    detailLoading[row.id] = true;
    delete detailErrors[row.id];
    try {
        const response = await fetch(
            url || route('moderation.changesets.show', row.id),
            {
                headers: { Accept: 'application/json' },
                signal: request.signal,
            },
        );
        const data = await response.json();
        if (!response.ok) {
            throw new Error(
                data.message ||
                    'Details could not be loaded. Please try again.',
            );
        }
        details[row.id] = data;
    } catch (error) {
        if (error.name !== 'AbortError') {
            detailErrors[row.id] = error.message;
        }
    } finally {
        if (requests.get(row.id) === request) {
            detailLoading[row.id] = false;
            requests.delete(row.id);
        }
    }
}
function expand(row) {
    expanded.value = expanded.value === row.id ? null : row.id;
    if (expanded.value && !details[row.id]) {
        loadDetails(row);
    }
}
function nodeChangeLabel(node) {
    return { added: 'Created', edited: 'Updated', deleted: 'Deleted' }[
        nodeChangeKind(node)
    ];
}
function resetDetails() {
    expanded.value = null;
    for (const request of requests.values()) {
        request.abort();
    }
    requests.clear();
    for (const cache of [details, detailErrors, detailLoading, selectedNodes]) {
        Object.keys(cache).forEach((key) => delete cache[key]);
    }
}
watch(() => props.records, resetDetails);
onBeforeUnmount(resetDetails);
</script>

<template>
    <section aria-label="Editor profile" class="px-4 pb-11 pt-5 sm:px-6">
        <Link
            :href="route('moderation.index', { view: 'editors' })"
            class="text-daf-body-sm font-semibold text-daf-text-secondary hover:text-daf-text-brand"
            >← Editors</Link
        >
        <header class="mt-4 flex flex-wrap items-center gap-3.5">
            <img
                v-if="profile.identity?.avatar_url"
                :src="profile.identity.avatar_url"
                alt=""
                class="size-12 rounded-full object-cover"
            />
            <span
                v-else
                class="flex size-12 shrink-0 items-center justify-center rounded-full bg-[var(--brand-soft)] text-base font-bold text-daf-text-brand"
                >{{ initials }}</span
            >
            <div class="min-w-0 flex-[1_1_260px]">
                <div class="flex flex-wrap items-center gap-2.5">
                    <h1
                        class="break-words font-display text-daf-h2 font-bold tracking-[var(--ls-display)]"
                    >
                        {{ profile.name || profile.osm_uid }}
                    </h1>
                    <span class="font-mono text-xs text-daf-text-tertiary"
                        >uid {{ profile.osm_uid }}</span
                    >
                </div>
                <p class="mt-1 text-daf-caption text-daf-text-secondary">
                    First seen {{ absoluteTime(profile.first_active) }} · Last
                    active
                    <time
                        :datetime="profile.last_active"
                        :title="absoluteTime(profile.last_active)"
                        >{{ relativeTime(profile.last_active) }}</time
                    >
                </p>
            </div>
            <p class="basis-full text-xs text-daf-text-secondary">
                OSM account created:
                {{
                    profile.identity?.account_created_at
                        ? absoluteTime(profile.identity.account_created_at)
                        : 'Unavailable'
                }}
                · Lifetime changesets:
                {{ profile.identity?.changesets_count ?? 'Unavailable'
                }}<span v-if="profile.identity?.last_error">
                    · {{ profile.identity.last_error }}</span
                >
            </p>
            <div class="flex flex-wrap gap-2">
                <Link :href="listing('changesets')" class="mod-button !h-[34px]"
                    >Changesets</Link
                >
                <Link :href="listing('nodes')" class="mod-button !h-[34px]"
                    >ALPR nodes</Link
                >
                <a
                    :href="`${osmUrl}/user/${encodeURIComponent(profile.name)}`"
                    class="mod-button !h-[34px] !border-transparent bg-[var(--brand-soft)] !font-bold !text-daf-text-brand"
                    rel="noopener noreferrer"
                    target="_blank"
                    >OSM profile ↗</a
                >
            </div>
        </header>
        <div
            class="mb-[18px] mt-5 grid grid-cols-2 gap-3 min-[641px]:grid-cols-3 min-[1151px]:grid-cols-6"
        >
            <article
                v-for="[value, label, note, color] in tiles"
                :key="label"
                class="mod-card !rounded-dafMd px-4 py-3.5"
            >
                <div
                    :class="[
                        'font-display text-[28px] font-bold leading-none tracking-[var(--ls-display)]',
                        color,
                    ]"
                >
                    {{ value }}
                </div>
                <div
                    class="mt-2 text-[11px] font-bold uppercase tracking-[var(--ls-label)] text-daf-text-secondary"
                >
                    {{ label }}
                </div>
                <p class="mt-1 text-[11px] text-daf-text-tertiary">
                    {{ note }}
                </p>
            </article>
        </div>
        <div
            class="grid items-start gap-4 min-[1181px]:grid-cols-[minmax(0,1.5fr)_minmax(300px,380px)]"
        >
            <article class="mod-card min-w-0">
                <header
                    class="flex flex-wrap items-center gap-1.5 border-b border-daf-border px-[18px] pb-3 pt-3.5"
                >
                    <h2 class="mr-2 font-display text-[15px] font-bold">
                        Timeline
                    </h2>
                    <Link
                        :aria-current="
                            !flagged && !filters.outcome ? 'page' : undefined
                        "
                        :class="[
                            'mod-chip !h-[26px] !px-2.5 !text-[11px]',
                            !flagged && !filters.outcome && 'mod-chip-active',
                        ]"
                        :href="timeline()"
                        >All · {{ profile.tracked_changesets }}</Link
                    >
                    <Link
                        :class="[
                            'mod-chip !h-[26px] !px-2.5 !text-[11px]',
                            filters.outcome === 'reverted' && 'mod-chip-active',
                        ]"
                        :href="timeline(false, true)"
                        >Reverted ·
                        {{ profile.survival?.reverted ?? '—' }}</Link
                    >
                    <Link
                        :aria-current="flagged ? 'page' : undefined"
                        :class="[
                            'mod-chip !h-[26px] !px-2.5 !text-[11px]',
                            flagged && 'mod-chip-active',
                        ]"
                        :href="timeline(true)"
                        >Flagged · {{ profile.flagged_changesets }}</Link
                    >
                </header>
                <ol class="px-[18px] pb-1 pt-[18px]">
                    <li
                        v-for="(row, index) in records.data"
                        :key="row.id"
                        class="flex gap-3.5"
                    >
                        <div
                            aria-hidden="true"
                            class="flex w-3 shrink-0 flex-col items-center"
                        >
                            <span
                                :class="[
                                    'mt-1 size-[11px] shrink-0 rounded-full ring-[3px]',
                                    row.status === 'Flagged'
                                        ? 'bg-[var(--amber-500)] ring-[var(--amber-100)]'
                                        : 'bg-daf-brand ring-[var(--brand-soft)]',
                                ]"
                            />
                            <span
                                v-if="index < records.data.length - 1"
                                class="mt-1.5 w-0.5 flex-1 rounded bg-daf-border"
                            />
                        </div>
                        <div class="min-w-0 flex-1 pb-5">
                            <div class="flex flex-wrap items-baseline gap-2.5">
                                <Link
                                    :href="
                                        route('moderation.index', {
                                            view: 'changesets',
                                            changeset: row.id,
                                        })
                                    "
                                    class="font-mono text-[13px] font-bold hover:text-daf-text-brand"
                                    >#{{ row.id }}</Link
                                >
                                <span
                                    class="text-[11px] font-semibold text-daf-text-secondary"
                                    >● {{ row.status }}</span
                                >
                                <time
                                    :datetime="row.changed_at"
                                    class="ml-auto font-mono text-[11px] text-daf-text-tertiary"
                                    >{{ absoluteTime(row.changed_at) }}</time
                                >
                            </div>
                            <p
                                class="mt-1 break-words text-daf-body-sm leading-relaxed"
                            >
                                {{ row.comment || 'No changeset comment' }}
                            </p>
                            <div
                                class="mt-[7px] flex flex-wrap items-center gap-2"
                            >
                                <ChangeCounts :row="row" />
                                <span
                                    class="text-xs font-semibold text-daf-text-secondary"
                                    >{{ locationLabel(row) }}</span
                                >
                                <a
                                    :href="`${osmUrl}/changeset/${row.id}`"
                                    class="mod-link ml-auto"
                                    rel="noopener noreferrer"
                                    target="_blank"
                                    >OSM ↗</a
                                >
                                <button
                                    :aria-expanded="expanded === row.id"
                                    :aria-label="`Details for changeset ${row.id}`"
                                    class="mod-expand"
                                    @click="expand(row)"
                                >
                                    <DafIcon
                                        :class="
                                            expanded === row.id && 'rotate-180'
                                        "
                                        :size="16"
                                        name="chevron-down"
                                    />
                                </button>
                            </div>
                            <div
                                v-if="expanded === row.id"
                                class="mt-3 rounded-dafMd border border-daf-border bg-daf-surface-page p-4"
                            >
                                <div
                                    v-if="detailLoading[row.id]"
                                    class="flex animate-pulse flex-col gap-3 py-6"
                                    role="status"
                                >
                                    <span
                                        class="h-3 w-2/3 rounded bg-daf-surface-alt"
                                    />
                                    <span
                                        class="h-3 w-1/2 rounded bg-daf-surface-alt"
                                    />
                                    <span class="sr-only"
                                        >Loading details…</span
                                    >
                                </div>
                                <div
                                    v-else-if="detailErrors[row.id]"
                                    class="py-4 text-sm text-[var(--alert-600)]"
                                    role="alert"
                                >
                                    {{ detailErrors[row.id] }}
                                    <button
                                        class="mod-link ml-2"
                                        @click="loadDetails(row)"
                                    >
                                        Try again
                                    </button>
                                </div>
                                <div v-else-if="details[row.id]">
                                    <h3 class="mod-subheading">
                                        {{
                                            row.comment ||
                                            `Changeset #${row.id}`
                                        }}
                                    </h3>
                                    <dl class="mod-details mt-3">
                                        <dt>Editor</dt>
                                        <dd>
                                            {{
                                                row.osm_user || 'Unknown editor'
                                            }}
                                            · uid {{ row.osm_uid || '—' }}
                                        </dd>
                                        <dt>Opened</dt>
                                        <dd>
                                            {{ absoluteTime(row.changed_at) }}
                                        </dd>
                                        <dt>Closed</dt>
                                        <dd>
                                            {{
                                                row.open
                                                    ? 'Still open'
                                                    : absoluteTime(
                                                          row.closed_at,
                                                      )
                                            }}
                                        </dd>
                                        <dt>Changes</dt>
                                        <dd>
                                            {{ row.total }} tracked ALPR nodes ·
                                            {{ row.osm_num_changes ?? '—' }}
                                            total OSM changes
                                        </dd>
                                    </dl>
                                    <h4 class="mod-label mt-5">
                                        Changeset tags
                                    </h4>
                                    <dl
                                        v-if="
                                            Object.keys(row.tags || {}).length
                                        "
                                        class="mod-details mt-2"
                                    >
                                        <template
                                            v-for="(value, key) in row.tags"
                                            :key="key"
                                        >
                                            <dt>{{ key }}</dt>
                                            <dd>{{ value }}</dd>
                                        </template>
                                    </dl>
                                    <p
                                        v-else
                                        class="mt-2 text-xs text-daf-text-tertiary"
                                    >
                                        No changeset tags available.
                                    </p>
                                    <h4 class="mod-label mt-5">
                                        Nodes in this changeset ·
                                        {{ details[row.id].versions.total }}
                                    </h4>
                                    <ModerationMap
                                        :bounds="row.bounds"
                                        :nodes="changesetNodes(details[row.id])"
                                        class="mt-2"
                                        @node="selectedNodes[row.id] = $event"
                                    />
                                    <div class="mt-2 grid gap-3">
                                        <article
                                            v-for="node in details[row.id]
                                                .versions.data"
                                            :key="node.id"
                                            :class="[
                                                'rounded-dafSm border bg-daf-surface-card p-3 transition-colors',
                                                selectedNodes[row.id] ===
                                                node.id
                                                    ? 'border-daf-brand bg-[var(--brand-soft)] ring-2 ring-daf-brand'
                                                    : 'border-daf-border',
                                            ]"
                                        >
                                            <div
                                                class="flex flex-wrap items-center gap-2"
                                            >
                                                <NodeLink
                                                    :node-id="node.node_id"
                                                    class="font-mono text-xs font-bold text-daf-text-brand hover:underline"
                                                >
                                                    Node {{ node.node_id }}
                                                </NodeLink>
                                                <span
                                                    class="text-[11px] font-semibold text-daf-text-secondary"
                                                >
                                                    {{ nodeChangeLabel(node) }}
                                                    · version
                                                    {{ node.osm_version }}
                                                </span>
                                            </div>
                                            <dl class="mod-details mt-3">
                                                <dt>Editor</dt>
                                                <dd>
                                                    {{
                                                        node.osm_user ||
                                                        node.osm_uid ||
                                                        'Unknown editor'
                                                    }}
                                                </dd>
                                                <dt>
                                                    {{
                                                        node.location_is_historical
                                                            ? 'Last known location'
                                                            : 'Location'
                                                    }}
                                                </dt>
                                                <dd>
                                                    {{ locationLabel(node) }}
                                                </dd>
                                            </dl>
                                            <dl
                                                v-if="
                                                    Object.keys(node.tags || {})
                                                        .length
                                                "
                                                class="mod-details mt-3 border-t border-daf-border pt-3"
                                            >
                                                <template
                                                    v-for="(
                                                        value, key
                                                    ) in node.tags"
                                                    :key="key"
                                                >
                                                    <dt>{{ key }}</dt>
                                                    <dd>{{ value }}</dd>
                                                </template>
                                            </dl>
                                            <p
                                                v-else
                                                class="mt-3 border-t border-daf-border pt-3 text-xs text-daf-text-tertiary"
                                            >
                                                No tags on this node version.
                                            </p>
                                        </article>
                                        <p
                                            v-if="
                                                !details[row.id].versions.data
                                                    .length
                                            "
                                            class="text-xs text-daf-text-tertiary"
                                        >
                                            No node versions are available for
                                            this changeset.
                                        </p>
                                    </div>
                                    <div class="mt-3 flex flex-wrap gap-3">
                                        <button
                                            v-if="
                                                details[row.id].versions
                                                    .prev_page_url
                                            "
                                            class="mod-link"
                                            @click="
                                                loadDetails(
                                                    row,
                                                    details[row.id].versions
                                                        .prev_page_url,
                                                )
                                            "
                                        >
                                            ← Previous nodes
                                        </button>
                                        <button
                                            v-if="
                                                details[row.id].versions
                                                    .next_page_url
                                            "
                                            class="mod-link"
                                            @click="
                                                loadDetails(
                                                    row,
                                                    details[row.id].versions
                                                        .next_page_url,
                                                )
                                            "
                                        >
                                            Next nodes →
                                        </button>
                                    </div>
                                </div>
                            </div>
                            <details
                                v-if="row.outcomes?.length"
                                class="mt-3 rounded-dafSm bg-[var(--alert-100)] p-3 text-xs text-[var(--alert-600)]"
                            >
                                <summary class="cursor-pointer font-semibold">
                                    {{
                                        new Set(
                                            row.outcomes
                                                .filter(
                                                    (event) =>
                                                        event.history_complete,
                                                )
                                                .map((event) => event.node_id),
                                        ).size
                                    }}
                                    affected nodes · Revert details
                                </summary>
                                <div
                                    v-for="event in row.outcomes"
                                    :key="event.id"
                                    class="mt-2"
                                >
                                    <p>
                                        <NodeLink
                                            :node-id="event.node_id"
                                            class="font-semibold underline"
                                            >Node {{ event.node_id }}</NodeLink
                                        >
                                        ·
                                        {{
                                            event.kind === 'deleted'
                                                ? 'Deleted'
                                                : 'Tags changed'
                                        }}
                                        by
                                        {{
                                            event.later_osm_user ||
                                            event.later_osm_uid
                                        }}
                                        in
                                        <a
                                            :href="`${osmUrl}/changeset/${event.later_changeset_id}`"
                                            class="underline"
                                            rel="noopener noreferrer"
                                            target="_blank"
                                            >#{{ event.later_changeset_id }}</a
                                        >
                                        · {{ absoluteTime(event.occurred_at)
                                        }}{{
                                            event.history_complete
                                                ? ''
                                                : ' · Incomplete history'
                                        }}
                                    </p>
                                    <p
                                        v-for="(change, key) in event.evidence
                                            .tags"
                                        :key="key"
                                        class="mt-1 font-mono"
                                    >
                                        {{ key }}:
                                        {{ change.before ?? '(missing)' }} →
                                        {{ change.after ?? '(removed)' }}
                                    </p>
                                </div>
                            </details>
                        </div>
                    </li>
                </ol>
                <p
                    v-if="!records.data.length"
                    class="px-5 py-10 text-center text-sm text-daf-text-tertiary"
                >
                    {{
                        flagged
                            ? 'No flagged changesets for this editor.'
                            : 'No changesets on record for this editor.'
                    }}
                </p>
                <nav
                    v-if="records.prev_page_url || records.next_page_url"
                    aria-label="Timeline pagination"
                    class="flex flex-wrap items-center gap-2 border-t border-daf-border p-4"
                >
                    <span
                        class="mr-auto font-mono text-xs text-daf-text-tertiary"
                        >Showing {{ records.from }}–{{ records.to }}</span
                    >
                    <Link
                        v-if="records.prev_page_url"
                        :href="records.prev_page_url"
                        class="mod-button"
                        preserve-scroll
                        >← Prev</Link
                    >
                    <Link
                        v-if="records.next_page_url"
                        :href="records.next_page_url"
                        class="mod-button"
                        preserve-scroll
                        >Next →</Link
                    >
                </nav>
            </article>
            <aside class="flex min-w-0 flex-col gap-4">
                <article class="mod-card px-[18px] py-4">
                    <h2 class="font-display text-[15px] font-bold">
                        Edit survival
                    </h2>
                    <p class="mt-0.5 text-daf-caption text-daf-text-secondary">
                        How their changesets have held up on OSM.
                    </p>
                    <div class="mt-3.5 flex items-baseline gap-2">
                        <span
                            class="font-display text-[38px] font-bold leading-none text-daf-text-tertiary"
                            >{{
                                profile.survival?.percent == null
                                    ? '—'
                                    : `${profile.survival.percent}%`
                            }}</span
                        ><span class="text-daf-caption text-daf-text-tertiary"
                            >still standing</span
                        >
                    </div>
                    <p
                        class="my-3 rounded-dafSm bg-daf-surface-alt px-3 py-2 text-xs text-daf-text-secondary"
                    >
                        {{
                            profile.survival
                                ? 'Percentages use classified changesets. Unknown histories are excluded.'
                                : 'Revert tracking is not available yet.'
                        }}
                    </p>
                    <div
                        v-if="profile.survival?.classified"
                        aria-label="Classified changeset survival"
                        class="mb-3 flex h-2 overflow-hidden rounded-full"
                    >
                        <span
                            v-for="[key, color] in [
                                ['intact', 'bg-daf-brand'],
                                ['edited', 'bg-[var(--amber-500)]'],
                                ['reverted', 'bg-[var(--alert-500)]'],
                            ]"
                            :key="key"
                            :class="color"
                            :style="{
                                width: `${(100 * profile.survival[key]) / profile.survival.classified}%`,
                            }"
                            :title="`${key}: ${profile.survival[key]}`"
                        />
                    </div>
                    <dl class="flex flex-col gap-[7px]">
                        <div
                            v-for="[label, color, key] in [
                                ['Intact', 'bg-daf-brand', 'intact'],
                                [
                                    'Edited by others',
                                    'bg-[var(--amber-500)]',
                                    'edited',
                                ],
                                [
                                    'Reverted',
                                    'bg-[var(--alert-500)]',
                                    'reverted',
                                ],
                                ['Unknown', 'bg-daf-border', 'unknown'],
                            ]"
                            :key="label"
                            class="flex items-center gap-2 text-xs"
                        >
                            <span
                                :class="['size-[9px] rounded-[3px]', color]"
                                aria-hidden="true"
                            />
                            <dt class="font-semibold text-daf-text-secondary">
                                {{ label }}
                            </dt>
                            <dd
                                class="ml-auto font-mono text-daf-text-tertiary"
                            >
                                {{ profile.survival?.[key] ?? '—' }}
                            </dd>
                        </div>
                    </dl>
                    <dl
                        class="mt-3.5 flex flex-col gap-[9px] border-t border-daf-border pt-3"
                    >
                        <div
                            v-for="[label, value] in [
                                [
                                    'Median time to revert',
                                    profile.revert_stats?.median_seconds == null
                                        ? '—'
                                        : `${Math.round(profile.revert_stats.median_seconds / 3600)} hours`,
                                ],
                                [
                                    'Most reverted by',
                                    profile.revert_stats?.most_reverted_by
                                        ?.name ?? '—',
                                ],
                                [
                                    'Last revert',
                                    profile.revert_stats?.last_revert
                                        ? absoluteTime(
                                              profile.revert_stats.last_revert,
                                          )
                                        : '—',
                                ],
                                [
                                    'Affected nodes',
                                    profile.revert_stats?.affected_nodes ?? '—',
                                ],
                                [
                                    'Reverts performed',
                                    profile.revert_stats?.performed ?? '—',
                                ],
                            ]"
                            :key="label"
                            class="flex items-center gap-2.5"
                        >
                            <dt class="mod-label">{{ label }}</dt>
                            <dd
                                class="ml-auto font-mono text-xs text-daf-text-tertiary"
                            >
                                {{ value }}
                            </dd>
                        </div>
                    </dl>
                </article>
                <article class="mod-card px-[18px] py-4">
                    <h2 class="font-display text-[15px] font-bold">Activity</h2>
                    <p class="mt-0.5 text-daf-caption text-daf-text-secondary">
                        Changesets per week in the tracked history.
                    </p>
                    <div
                        aria-label="Weekly changeset activity"
                        class="mt-3.5 flex h-[92px] items-end gap-[5px]"
                    >
                        <div
                            v-for="week in weeks"
                            :key="week.week"
                            :class="[
                                'relative min-w-0 flex-1 overflow-hidden rounded-sm',
                                Number(week.total)
                                    ? 'bg-[color-mix(in_oklab,var(--brand)_55%,transparent)]'
                                    : 'bg-daf-surface-alt',
                            ]"
                            :style="{
                                height: `${Math.max(2, (Number(week.total) / maxWeek) * 84)}px`,
                            }"
                            :title="`${absoluteTime(week.week)} · ${week.total} changesets · ${week.reverted ?? 'unknown'} reverted`"
                        >
                            <span
                                v-if="week.reverted"
                                :style="{
                                    height: `${(week.reverted / week.total) * 100}%`,
                                }"
                                class="absolute inset-x-0 bottom-0 bg-[var(--alert-500)]"
                            />
                        </div>
                    </div>
                    <div
                        class="mt-1.5 flex justify-between font-mono text-[10px] text-daf-text-tertiary"
                    >
                        <span>12 weeks</span><span>this week</span>
                    </div>
                </article>
                <article class="mod-card px-[18px] py-4">
                    <h2 class="font-display text-[15px] font-bold">
                        Where they map
                    </h2>
                    <p class="mt-3 text-daf-body-sm text-daf-text-tertiary">
                        {{
                            profile.mapping_areas
                                ? profile.mapping_areas.length
                                    ? 'Saved areas in their tracked history.'
                                    : 'No edits within saved areas.'
                                : 'Mapping areas have not been calculated yet.'
                        }}
                    </p>
                    <ul class="mt-3 space-y-3">
                        <li
                            v-for="area in profile.mapping_areas"
                            :key="area.id"
                            class="text-xs"
                        >
                            <Link
                                :href="
                                    route('moderation.index', {
                                        view: 'changesets',
                                        uid: profile.osm_uid,
                                        area: area.id,
                                    })
                                "
                                class="mod-link"
                                >{{ area.name }}</Link
                            >
                            <p class="mt-1 text-daf-text-secondary">
                                {{ area.count }} changesets ·
                                {{ relativeTime(area.last_active) }}
                            </p>
                        </li>
                    </ul>
                </article>
                <p
                    v-if="profile.calculated_at"
                    class="text-xs text-daf-text-tertiary"
                >
                    Calculated {{ absoluteTime(profile.calculated_at) }}
                </p>
            </aside>
        </div>
    </section>
</template>
