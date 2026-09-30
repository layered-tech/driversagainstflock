<script setup>
import FlagLabel from '@/Components/Moderation/FlagLabel.vue';
import FlagDetails from '@/Components/Moderation/FlagDetails.vue';
import { useModerationTime } from '@/useModerationTime';
import ModerationMap from '@/Components/Moderation/ModerationMap.vue';
import NodeLink from '@/Components/Moderation/NodeLink.vue';
import ModerationLayout from '@/Layouts/ModerationLayout.vue';
import { locationLabel, nodeProfileSummary, relativeTime } from '@/moderation';
import { Head, Link, router, usePage } from '@inertiajs/vue3';
import { computed, inject, ref } from 'vue';

const { absoluteTime, localDate } = useModerationTime();
const props = defineProps({
    reports: { type: Object, default: () => ({ data: [] }) },
    reportReviews: { type: Object, default: () => ({ data: [] }) },
    listingFilters: { type: Object, default: () => ({}) },
    from: { type: String, default: 'nodes' },
    node: Object,
    versions: Array,
    flags: Array,
    counts: Object,
    source: Object,
    osmUrl: String,
});
const route = inject('route');
const page = usePage();
const timelineFilter = ref('All');
const summary = computed(() => nodeProfileSummary(props.versions, props.flags));
const activeFlags = computed(() =>
    props.flags.filter(
        (flag) => flag.status === 'open' && flag.rule?.enabled !== false,
    ),
);
const severity = computed(() => {
    const rank = { High: 3, Medium: 2, Low: 1 };

    return activeFlags.value
        .map((flag) => flag.rule?.severity)
        .filter(Boolean)
        .sort((left, right) => rank[right] - rank[left])[0];
});
const severityClasses = {
    High: 'bg-[var(--alert-100)] text-[var(--alert-600)]',
    Medium: 'bg-[var(--amber-100)] text-[var(--amber-600)]',
    Low: 'bg-[color-mix(in_oklab,var(--azure-500)_14%,transparent)] text-[var(--azure-600,#1D6FE0)]',
};
const directionLabel = computed(() => {
    if (props.node.direction === null || props.node.direction === undefined)
        return 'No direction';
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const direction = Number(props.node.direction);

    return (
        'Facing ' +
        direction +
        '° ' +
        directions[Math.round(direction / 45) % 8]
    );
});
const displayedTags = computed(() => {
    const tags = Object.entries(summary.value.current_tags).map(
        ([key, value]) => ({ key, value, missing: false }),
    );
    if (props.node.visible !== false) {
        if (!summary.value.current_tags.operator)
            tags.push({ key: 'operator', value: '(missing)', missing: true });
        if (
            !summary.value.current_tags.direction &&
            !summary.value.current_tags['camera:direction']
        )
            tags.push({ key: 'direction', value: '(missing)', missing: true });
    }

    return tags;
});
const mapPoints = computed(() => {
    const seen = new Set();

    return [...props.versions]
        .sort(
            (left, right) =>
                Number(left.osm_version) - Number(right.osm_version),
        )
        .filter(
            (version) =>
                !version.location_is_historical &&
                version.latitude != null &&
                version.longitude != null,
        )
        .map((version) => [Number(version.longitude), Number(version.latitude)])
        .filter((point) => {
            const key = point.join(',');
            if (seen.has(key)) return false;
            seen.add(key);

            return true;
        });
});
const mapNodes = computed(() =>
    props.node.latitude == null || props.node.longitude == null
        ? []
        : [props.node],
);
const firstMappedDate = computed(() =>
    summary.value.first_mapped_at
        ? localDate(summary.value.first_mapped_at)
        : 'Unknown',
);
const daysOnMap = computed(() => {
    if (!summary.value.first_mapped_at) return '—';
    const end =
        summary.value.latest?.visible === false
            ? new Date(summary.value.latest.osm_updated_at).getTime()
            : Date.now();

    return (
        Math.max(
            1,
            Math.round(
                (end - new Date(summary.value.first_mapped_at).getTime()) /
                    86400000,
            ),
        ) + 'd'
    );
});
const timeline = computed(() => [
    ...summary.value.history.map((version) => ({
        type: 'version',
        occurred_at: version.osm_updated_at,
        kind: version.kind,
        version,
    })),
    ...props.flags.map((flag) => ({
        type: 'flag',
        occurred_at:
            flag.status === 'dismissed' ? flag.dismissed_at : flag.evaluated_at,
        kind: flag.status === 'dismissed' ? 'Dismissed' : 'Flagged',
        flag,
    })),
]);
const timelineCounts = computed(() => ({
    All: timeline.value.length,
    Tags: summary.value.history.filter((version) => version.tag_edits > 0)
        .length,
    Moves: summary.value.history.filter(
        (version) => version.movement_meters >= 0.5,
    ).length,
    Flags: props.flags.length,
}));
const filteredTimeline = computed(() =>
    timeline.value
        .filter((item) => {
            if (timelineFilter.value === 'Tags')
                return item.type === 'version' && item.version.tag_edits > 0;
            if (timelineFilter.value === 'Moves')
                return (
                    item.type === 'version' &&
                    item.version.movement_meters >= 0.5
                );
            if (timelineFilter.value === 'Flags') return item.type === 'flag';

            return true;
        })
        .sort(
            (left, right) =>
                new Date(right.occurred_at).getTime() -
                new Date(left.occurred_at).getTime(),
        ),
);
const kindClasses = {
    Created: 'bg-[var(--brand-soft)] text-[var(--green-700,#0E8A4C)]',
    Retagged:
        'bg-[color-mix(in_oklab,var(--azure-500)_14%,transparent)] text-[var(--azure-600,#1D6FE0)]',
    Moved: 'bg-[var(--amber-100)] text-[var(--amber-600)]',
    Deleted: 'bg-[var(--alert-100)] text-[var(--alert-600)]',
    Flagged: 'bg-[var(--alert-100)] text-[var(--alert-600)]',
    Dismissed: 'bg-daf-surface-alt text-daf-text-secondary',
};
const toneClasses = {
    added: 'text-[var(--green-700,#0E8A4C)]',
    edited: 'text-[var(--amber-600)]',
    deleted: 'text-[var(--alert-600)]',
};
const initials = (name) =>
    String(name)
        .split(/[_\s.-]+/)
        .filter(Boolean)
        .map((part) => part[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();
const editorHref = (editor) =>
    editor.osm_uid
        ? route('moderation.editors.show', {
              uid: editor.osm_uid,
          })
        : null;
const dismissFlag = (flag) =>
    router.patch(
        route('moderation.flags.dismiss', flag.id),
        { evidence_hash: flag.evidence_hash },
        { preserveScroll: true },
    );
</script>

<template>
    <ModerationLayout :counts="counts" :view="from" navigation>
        <Head :title="'Node ' + node.id + ' · DAF Moderation'">
            <meta content="noindex, nofollow" name="robots" />
        </Head>
        <section class="px-4 pb-11 pt-5 sm:px-6">
            <Link
                :href="route(`moderation.${from}.index`, listingFilters)"
                class="inline-flex text-sm font-semibold text-daf-text-secondary hover:text-daf-text-brand"
            >
                ← {{ from === 'flagged' ? 'Flagged nodes' : 'ALPR nodes' }}
            </Link>

            <div
                v-if="source.state === 'unavailable'"
                class="mt-5 rounded-dafMd border border-[var(--amber-500)] bg-[var(--amber-100)] px-4 py-3 text-sm text-[var(--amber-600)]"
                role="status"
            >
                <strong>OpenStreetMap history is unavailable.</strong> Please
                try again shortly.
            </div>

            <template v-if="source.state !== 'unavailable'">
                <header class="mt-4 flex flex-wrap items-center gap-3.5">
                    <span
                        class="flex size-12 shrink-0 items-center justify-center rounded-full bg-[var(--alert-100)]"
                    >
                        <span
                            class="size-3 rounded-full bg-[var(--alert-500)] shadow-[0_0_0_3px_color-mix(in_oklab,var(--alert-500)_25%,transparent),0_0_12px_color-mix(in_oklab,var(--alert-500)_70%,transparent)]"
                        />
                    </span>
                    <div class="min-w-0 flex-[1_1_260px]">
                        <div class="flex flex-wrap items-center gap-2.5">
                            <h1
                                class="font-display text-daf-h2 font-bold tracking-[var(--ls-display)]"
                            >
                                Node
                            </h1>
                            <NodeLink
                                :from="from"
                                :node-id="node.id"
                                class="font-mono text-daf-h2 font-bold tracking-[var(--ls-mono)]"
                                >{{ node.id }}</NodeLink
                            >
                            <span
                                v-if="severity"
                                :class="[
                                    'rounded-dafPill px-[9px] py-[3px] font-mono text-[11px] font-bold tracking-[var(--ls-mono)]',
                                    severityClasses[severity],
                                ]"
                                >{{ severity }}</span
                            >
                            <span
                                v-else
                                class="rounded-dafPill bg-daf-surface-alt px-[9px] py-[3px] font-mono text-[11px] font-bold text-daf-text-tertiary"
                                >No open flags</span
                            >
                            <FlagLabel
                                v-for="flag in activeFlags"
                                :key="flag.id"
                                :flag="flag"
                                class="mod-chip"
                            />
                        </div>
                        <p
                            class="mt-1 text-daf-caption text-daf-text-secondary"
                        >
                            {{ locationLabel(node) }} ·
                            {{ node.operator || 'Unknown operator' }} ·
                            {{ directionLabel }} · first mapped
                            {{ firstMappedDate }} · last change
                            {{ relativeTime(node.changed_at) }}
                        </p>
                    </div>
                    <div class="flex flex-wrap gap-2">
                        <Link
                            v-if="node.osm_changeset_id"
                            :href="
                                route('moderation.changesets.index', {
                                    changeset: node.osm_changeset_id,
                                })
                            "
                            class="mod-button"
                            >Last changeset</Link
                        >

                        <a
                            :href="osmUrl + '/edit?node=' + node.id"
                            class="inline-flex h-9 items-center rounded-dafPill bg-[var(--brand-soft)] px-4 text-xs font-bold text-daf-text-brand hover:bg-[color-mix(in_oklab,var(--brand)_22%,transparent)]"
                            rel="noopener noreferrer"
                            target="_blank"
                            >Adjust in OSM ↗</a
                        >
                    </div>
                </header>

                <p
                    v-if="page.props.errors?.flag"
                    class="mt-4 text-sm text-[var(--alert-600)]"
                    role="alert"
                >
                    {{ page.props.errors.flag }}
                </p>

                <div
                    class="my-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6"
                >
                    <article
                        v-for="metric in [
                            {
                                value:
                                    'v' + (summary.latest?.osm_version || '—'),
                                label: 'Versions',
                                sub: 'since ' + firstMappedDate,
                            },
                            {
                                value: summary.editors.length,
                                label: 'Editors',
                                sub:
                                    summary.editors.length === 1
                                        ? 'one pair of hands'
                                        : 'last: ' +
                                          (node.osm_user || 'unknown'),
                            },
                            {
                                value: summary.tag_edits,
                                label: 'Tag edits',
                                sub: 'after creation',
                            },
                            {
                                value: summary.moves,
                                label: 'Moves',
                                sub: summary.moves
                                    ? Math.round(summary.movement_meters) +
                                      ' m total'
                                    : 'never moved',
                            },
                            {
                                value: daysOnMap,
                                label: 'On the map',
                                sub:
                                    node.visible === false
                                        ? 'deleted in v' +
                                          summary.latest?.osm_version
                                        : 'still standing',
                            },
                            {
                                value: summary.open_flags,
                                label: 'Open flags',
                                sub: severity ? severity + ' severity' : 'none',
                            },
                        ]"
                        :key="metric.label"
                        class="mod-card min-w-0 !rounded-dafMd px-4 py-3.5"
                    >
                        <div
                            class="font-mono text-2xl font-bold tracking-[var(--ls-mono)]"
                        >
                            {{ metric.value }}
                        </div>
                        <div class="mod-label mt-1">{{ metric.label }}</div>
                        <div
                            class="mt-0.5 truncate text-[11px] text-daf-text-tertiary"
                        >
                            {{ metric.sub }}
                        </div>
                    </article>
                </div>

                <div
                    class="grid items-start gap-4 xl:grid-cols-[minmax(0,1.75fr)_minmax(300px,1fr)]"
                >
                    <article class="mod-card min-w-0">
                        <header
                            class="flex flex-wrap items-center gap-1.5 border-b border-daf-border px-[18px] py-3"
                        >
                            <h2
                                class="mr-2 font-display text-[15px] font-bold tracking-[var(--ls-display)]"
                            >
                                History
                            </h2>
                            <button
                                v-for="filter in [
                                    'All',
                                    'Tags',
                                    'Moves',
                                    'Flags',
                                ]"
                                :key="filter"
                                :aria-pressed="timelineFilter === filter"
                                :class="[
                                    'mod-chip !h-[26px] !px-2.5 !text-[11.5px]',
                                    timelineFilter === filter &&
                                        'mod-chip-active',
                                ]"
                                type="button"
                                @click="timelineFilter = filter"
                            >
                                {{ filter }} · {{ timelineCounts[filter] }}
                            </button>
                            <span
                                class="ml-auto font-mono text-[11px] tracking-[var(--ls-mono)] text-daf-text-tertiary"
                                >{{ versions.length }} versions ·
                                {{ summary.editors.length }}
                                {{
                                    summary.editors.length === 1
                                        ? 'editor'
                                        : 'editors'
                                }}</span
                            >
                        </header>
                        <div class="px-[18px] pb-1 pt-[18px]">
                            <div
                                v-for="(item, index) in filteredTimeline"
                                :key="
                                    item.type === 'version'
                                        ? 'version-' + item.version.id
                                        : 'flag-' + item.flag.id
                                "
                                class="flex gap-3.5"
                            >
                                <div
                                    class="flex w-3 shrink-0 flex-col items-center"
                                >
                                    <span
                                        class="mt-1 size-[11px] shrink-0 rounded-full bg-daf-brand ring-[3px] ring-[var(--brand-soft)]"
                                    />
                                    <span
                                        :class="[
                                            'mt-1.5 w-0.5 flex-1 rounded',
                                            index ===
                                            filteredTimeline.length - 1
                                                ? 'bg-transparent'
                                                : 'bg-daf-border',
                                        ]"
                                    />
                                </div>
                                <div class="min-w-0 flex-1 pb-5">
                                    <div
                                        class="flex flex-wrap items-center gap-2.5"
                                    >
                                        <span
                                            class="min-w-6 font-mono text-[13px] font-bold tracking-[var(--ls-mono)]"
                                            >{{
                                                item.type === 'version'
                                                    ? 'v' +
                                                      item.version.osm_version
                                                    : ''
                                            }}</span
                                        >
                                        <span
                                            :class="[
                                                'rounded-dafPill px-[9px] py-0.5 font-mono text-[11px] font-bold tracking-[var(--ls-mono)]',
                                                kindClasses[item.kind],
                                            ]"
                                            >{{ item.kind }}</span
                                        >
                                        <template
                                            v-if="item.type === 'version'"
                                        >
                                            <span
                                                class="text-xs text-daf-text-secondary"
                                                >by</span
                                            >
                                            <Link
                                                v-if="editorHref(item.version)"
                                                :href="editorHref(item.version)"
                                                class="text-[12.5px] font-semibold hover:text-daf-text-brand"
                                                >{{
                                                    item.version.osm_user ||
                                                    item.version.osm_uid
                                                }}</Link
                                            >
                                            <span
                                                v-else
                                                class="text-[12.5px] text-daf-text-secondary"
                                                >Unknown editor</span
                                            >
                                            <Link
                                                :href="
                                                    route(
                                                        'moderation.changesets.index',
                                                        {
                                                            changeset:
                                                                item.version
                                                                    .changeset_id,
                                                        },
                                                    )
                                                "
                                                class="font-mono text-[11px] tracking-[var(--ls-mono)] text-daf-text-tertiary hover:text-daf-text-brand hover:underline"
                                                >#{{
                                                    item.version.changeset_id
                                                }}</Link
                                            >
                                        </template>
                                        <span
                                            class="ml-auto font-mono text-[11px] tracking-[var(--ls-mono)] text-daf-text-tertiary"
                                            >{{
                                                absoluteTime(item.occurred_at)
                                            }}</span
                                        >
                                    </div>
                                    <p class="mt-1 text-daf-body-sm leading-6">
                                        {{
                                            item.type === 'version'
                                                ? item.version.comment ||
                                                  'No changeset comment available.'
                                                : item.kind === 'Flagged'
                                                  ? (item.flag.source ===
                                                    'alpr_presence'
                                                        ? 'Driver reported missing'
                                                        : item.flag.rule
                                                              ?.name) +
                                                    ' flagged this node.'
                                                  : (item.flag.source ===
                                                    'alpr_presence'
                                                        ? 'Driver reported missing'
                                                        : item.flag.rule
                                                              ?.name) +
                                                    ' was dismissed.'
                                        }}
                                    </p>
                                    <div
                                        v-if="
                                            item.type === 'version' &&
                                            item.version.changes.length
                                        "
                                        class="mt-2 flex flex-col gap-1 rounded-dafSm border border-daf-border bg-[color-mix(in_oklab,var(--text-primary)_3%,var(--surface-card))] px-3 py-2 font-mono text-xs tracking-[var(--ls-mono)]"
                                    >
                                        <div
                                            v-for="change in item.version
                                                .changes"
                                            :key="
                                                change.sign +
                                                change.key +
                                                change.value
                                            "
                                            class="flex min-w-0 gap-2"
                                        >
                                            <span
                                                :class="[
                                                    'w-3 shrink-0 font-bold',
                                                    toneClasses[change.tone],
                                                ]"
                                                >{{ change.sign }}</span
                                            ><span
                                                class="shrink-0 text-daf-text-tertiary"
                                                >{{ change.key }} =</span
                                            ><span
                                                class="min-w-0 break-words font-semibold"
                                                >{{ change.value }}</span
                                            >
                                        </div>
                                    </div>
                                    <div
                                        v-if="item.type === 'flag'"
                                        class="mt-2 flex flex-wrap items-center gap-2"
                                    >
                                        <FlagLabel
                                            :flag="item.flag"
                                            class="mod-chip"
                                        />
                                    </div>
                                </div>
                            </div>
                            <p
                                v-if="!filteredTimeline.length"
                                class="px-4 py-10 text-center text-sm text-daf-text-tertiary"
                            >
                                Nothing under this filter.
                            </p>
                        </div>
                    </article>

                    <aside class="grid min-w-0 gap-4">
                        <div class="relative">
                            <ModerationMap
                                :nodes="mapNodes"
                                :points="mapPoints"
                                class="shadow-dafCard"
                                line-color="#d98b00"
                            />
                            <span
                                class="bg-daf-surface-card/90 absolute left-2.5 top-2.5 rounded-dafPill border border-daf-border px-3 py-1 font-mono text-[11px] font-bold shadow-dafFloat backdrop-blur-xl"
                                >{{
                                    node.visible === false
                                        ? 'Deleted in v' +
                                          summary.latest?.osm_version +
                                          ' · last known position'
                                        : directionLabel +
                                          ' · ' +
                                          (node.operator || 'Unknown operator')
                                }}</span
                            >
                            <span
                                class="bg-daf-surface-card/90 absolute bottom-2.5 left-2.5 rounded-dafPill border border-daf-border px-2.5 py-1 font-mono text-[11px] text-daf-text-secondary backdrop-blur-xl"
                                >{{ locationLabel(node) }}</span
                            >
                        </div>

                        <article class="mod-card px-[18px] py-4">
                            <div class="flex flex-wrap items-baseline gap-2">
                                <h2
                                    class="font-display text-[15px] font-bold tracking-[var(--ls-display)]"
                                >
                                    Tags
                                </h2>
                                <span
                                    class="ml-auto font-mono text-[11px] tracking-[var(--ls-mono)] text-daf-text-tertiary"
                                    >{{
                                        node.visible === false
                                            ? 'deleted in v' +
                                              summary.latest?.osm_version +
                                              ' · last visible version'
                                            : 'as of v' +
                                              summary.latest?.osm_version
                                    }}</span
                                >
                            </div>
                            <dl
                                class="mt-3 flex flex-col gap-1 font-mono text-xs tracking-[var(--ls-mono)]"
                            >
                                <div
                                    v-for="tag in displayedTags"
                                    :key="tag.key"
                                    class="flex min-w-0 gap-1.5"
                                >
                                    <dt class="text-daf-text-tertiary">
                                        {{ tag.key }} =
                                    </dt>
                                    <dd
                                        :class="[
                                            'min-w-0 break-words font-semibold',
                                            tag.missing
                                                ? 'text-[var(--alert-600)]'
                                                : node.visible === false
                                                  ? 'text-daf-text-tertiary'
                                                  : 'text-daf-text-primary',
                                        ]"
                                    >
                                        {{ tag.value }}
                                    </dd>
                                </div>
                            </dl>
                        </article>

                        <article class="mod-card px-[18px] py-4">
                            <h2
                                class="font-display text-[15px] font-bold tracking-[var(--ls-display)]"
                            >
                                Who touched it
                            </h2>
                            <p
                                class="mt-0.5 text-daf-caption text-daf-text-secondary"
                            >
                                Every editor across this node's versions.
                            </p>
                            <div class="mt-3.5 grid gap-2.5">
                                <div
                                    v-for="editor in summary.editors"
                                    :key="
                                        editor.osm_uid ||
                                        editor.name + '-' + editor.last_version
                                    "
                                    class="flex min-w-0 items-center gap-2.5"
                                >
                                    <span
                                        class="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-[var(--brand-soft)] text-[11px] font-bold text-daf-text-brand"
                                        >{{ initials(editor.name) }}</span
                                    >
                                    <div class="min-w-0 flex-1">
                                        <Link
                                            v-if="editorHref(editor)"
                                            :href="editorHref(editor)"
                                            class="block truncate text-daf-body-sm font-semibold hover:text-daf-text-brand"
                                            >{{ editor.name }}</Link
                                        >
                                        <span
                                            v-else
                                            class="block truncate text-daf-body-sm font-semibold"
                                            >{{ editor.name }}</span
                                        >
                                        <div
                                            class="mt-px text-[11px] text-daf-text-tertiary"
                                        >
                                            last v{{ editor.last_version }} ·
                                            {{
                                                relativeTime(editor.last_active)
                                            }}
                                        </div>
                                    </div>
                                    <span
                                        class="whitespace-nowrap font-mono text-xs font-bold tracking-[var(--ls-mono)] text-daf-text-secondary"
                                        >{{ editor.versions }}
                                        {{
                                            editor.versions === 1
                                                ? 'version'
                                                : 'versions'
                                        }}</span
                                    >
                                </div>
                            </div>
                        </article>
                    </aside>
                </div>
            </template>
            <section
                aria-label="Flagged violations"
                class="moderation-page mt-6 rounded-dafMd border border-daf-border bg-daf-surface-card p-5"
            >
                <h2 class="mod-subheading mb-5">Flagged violations</h2>
                <FlagDetails
                    :absolute-time="absoluteTime"
                    :flags="flags"
                    :node-id="node.id"
                    :reports="reports"
                    @dismiss="dismissFlag"
                />
                <p
                    v-if="
                        reports.data.length &&
                        (node.current_unavailable || node.visible === false)
                    "
                    class="mt-3 text-sm text-daf-text-secondary"
                >
                    Current node deleted or unavailable. Historical observations
                    are retained.
                </p>
                <div v-if="reports.data.length || reportReviews.data.length">
                    <h3 class="mod-label mt-4">Review history</h3>
                    <p v-if="!reportReviews.data.length" class="text-sm">
                        No reviews recorded.
                    </p>
                    <p
                        v-for="review in reportReviews.data"
                        :key="review.id"
                        class="text-sm"
                    >
                        {{ review.actor }} dismissed this driver-report flag ·
                        {{ absoluteTime(review.created_at) }}
                    </p>
                    <nav
                        aria-label="Review history pages"
                        class="mt-3 flex gap-4"
                    >
                        <Link
                            v-if="reportReviews.prev_page_url"
                            :href="reportReviews.prev_page_url"
                            class="mod-link"
                            >Previous reviews</Link
                        >
                        <Link
                            v-if="reportReviews.next_page_url"
                            :href="reportReviews.next_page_url"
                            class="mod-link"
                            >More reviews</Link
                        >
                    </nav>
                </div>
            </section>
        </section>
    </ModerationLayout>
</template>
