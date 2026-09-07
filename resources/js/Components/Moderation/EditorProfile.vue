<script setup>
import ChangeCounts from '@/Components/Moderation/ChangeCounts.vue';
import { absoluteTime, locationLabel, relativeTime } from '@/moderation';
import { Link } from '@inertiajs/vue3';
import { computed, inject } from 'vue';

const props = defineProps({
    profile: Object,
    records: Object,
    weeks: Array,
    filters: Object,
    osmUrl: String,
});
const route = inject('route');
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
    ['—', 'reverted', 'Not yet tracked', 'text-daf-text-tertiary'],
    ['—', 'open flags', 'Not yet configured', 'text-daf-text-tertiary'],
]);
const maxWeek = computed(() =>
    Math.max(1, ...props.weeks.map((week) => Number(week.total))),
);
const flagged = computed(() => props.filters.statuses?.includes('Flagged'));
function listing(view) {
    return route('moderation.index', { view, uid: props.profile.osm_uid });
}
function timeline(onlyFlagged = false) {
    return route('moderation.index', {
        view: 'profile',
        uid: props.profile.osm_uid,
        ...(onlyFlagged ? { statuses: ['Flagged'] } : {}),
    });
}
</script>

<template>
    <section aria-label="Editor profile" class="px-4 pb-11 pt-5 sm:px-6">
        <Link
            :href="route('moderation.index', { view: 'editors' })"
            class="text-daf-body-sm font-semibold text-daf-text-secondary hover:text-daf-text-brand"
            >← Editors</Link
        >
        <header class="mt-4 flex flex-wrap items-center gap-3.5">
            <span
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
                        :aria-current="!flagged ? 'page' : undefined"
                        :class="[
                            'mod-chip !h-[26px] !px-2.5 !text-[11px]',
                            !flagged && 'mod-chip-active',
                        ]"
                        :href="timeline()"
                        >All · {{ profile.tracked_changesets }}</Link
                    >
                    <span
                        aria-disabled="true"
                        class="mod-chip !h-[26px] !px-2.5 !text-[11px] opacity-50"
                        title="Revert tracking is not available yet"
                        >Reverted · —</span
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
                            </div>
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
                            >—</span
                        ><span class="text-daf-caption text-daf-text-tertiary"
                            >still standing</span
                        >
                    </div>
                    <p
                        class="my-3 rounded-dafSm bg-daf-surface-alt px-3 py-2 text-xs text-daf-text-secondary"
                    >
                        Revert tracking is not available yet.
                    </p>
                    <dl class="flex flex-col gap-[7px]">
                        <div
                            v-for="[label, color] in [
                                ['Intact', 'bg-daf-brand'],
                                ['Edited by others', 'bg-[var(--amber-500)]'],
                                ['Reverted', 'bg-[var(--alert-500)]'],
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
                                —
                            </dd>
                        </div>
                    </dl>
                    <dl
                        class="mt-3.5 flex flex-col gap-[9px] border-t border-daf-border pt-3"
                    >
                        <div
                            v-for="label in [
                                'Median time to revert',
                                'Most reverted by',
                                'Last revert',
                                'Nodes in reverted sets',
                                'Reverts performed',
                            ]"
                            :key="label"
                            class="flex items-center gap-2.5"
                        >
                            <dt class="mod-label">{{ label }}</dt>
                            <dd
                                class="ml-auto font-mono text-xs text-daf-text-tertiary"
                            >
                                —
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
                                'min-w-0 flex-1 rounded-sm',
                                Number(week.total)
                                    ? 'bg-[color-mix(in_oklab,var(--brand)_55%,transparent)]'
                                    : 'bg-daf-surface-alt',
                            ]"
                            :style="{
                                height: `${Math.max(2, (Number(week.total) / maxWeek) * 84)}px`,
                            }"
                            :title="`${absoluteTime(week.week)} · ${week.total} changesets`"
                        />
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
                        Mapping areas have not been calculated yet.
                    </p>
                </article>
            </aside>
        </div>
    </section>
</template>
