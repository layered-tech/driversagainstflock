<script setup>
import DafButton from '@/Components/Daf/DafButton.vue';
import DafIcon from '@/Components/Daf/DafIcon.vue';
import AreaDialog from '@/Components/Moderation/AreaDialog.vue';
import ChangeCounts from '@/Components/Moderation/ChangeCounts.vue';
import EditorProfile from '@/Components/Moderation/EditorProfile.vue';
import ModerationMap from '@/Components/Moderation/ModerationMap.vue';
import ModerationLayout from '@/Layouts/ModerationLayout.vue';
import {
    absoluteTime,
    filterQuery,
    locationLabel,
    relativeTime,
} from '@/moderation';
import { Head, Link, router, useForm, usePage } from '@inertiajs/vue3';
import { computed, inject, onBeforeUnmount, reactive, ref, watch } from 'vue';

const route = inject('route');
const props = defineProps({
    view: String,
    filters: Object,
    records: Object,
    profile: Object,
    weeks: Array,
    areas: Array,
    counts: Object,
    source: Object,
    osmUrl: String,
});
const page = usePage();
const state = reactive({});
const loading = ref(false);
const expanded = ref(null);
const details = reactive({});
const detailErrors = reactive({});
const detailLoading = reactive({});
const areaDialog = ref(false);
const removeArea = ref(null);
const actionBusy = ref(false);
const review = useForm({ revision: '', status: '' });
let timer;
const requests = new Map();
const title = computed(
    () =>
        ({
            changesets: 'Changesets',
            nodes: 'ALPR nodes',
            editors: 'Editors',
            areas: 'Areas',
            audit: 'Audit log',
            profile: props.profile?.name || 'Editor profile',
        })[props.view],
);
const descriptions = {
    changesets:
        'Every OpenStreetMap edit that touches a surveillance node, as it lands.',
    nodes: 'Surveillance nodes and their latest OpenStreetMap edits.',
    editors:
        'The people editing the surveillance map, and the edits they leave behind.',
    areas: 'Shared boundaries. Subscribe to keep the places you care about close.',
    audit: 'A record of moderation decisions and changes to watched areas.',
};
const columns = computed(
    () =>
        ({
            nodes: [
                ['id', 'Node'],
                [null, 'Changeset'],
                ['direction', 'Direction'],
                ['operator', 'Operator'],
                ['osm_user', 'Editor'],
                [null, 'Location'],
                ['changed_at', 'Updated'],
                [null, 'Actions'],
                [null, ''],
            ],
            changesets: [
                ['id', 'Changeset'],
                ['osm_user', 'Editor'],
                ['changes', '+ / ~ / −'],
                ['status', 'Status'],
                [null, 'Location'],
                ['changed_at', 'Time'],
                [null, ''],
            ],
            profile: [
                ['id', 'Changeset'],
                ['osm_user', 'Editor'],
                ['changes', '+ / ~ / −'],
                ['status', 'Status'],
                [null, 'Location'],
                ['changed_at', 'Time'],
                [null, ''],
            ],
            editors: [
                ['name', 'Editor'],
                ['changesets_count', 'Changesets'],
                ['changes', '+ / ~ / −'],
                [null, 'Open flags'],
                [null, 'Survival'],
                [null, 'Areas'],
                ['last_active', 'Last active'],
                [null, 'Status'],
            ],
            areas: [
                [null, 'Area'],
                [null, 'Watchers'],
                [null, 'Open flags'],
                [null, 'Edits · 7 d'],
                [null, 'Flagged'],
                [null, 'Created'],
                [null, 'Actions'],
                [null, ''],
            ],
            audit: [
                [null, 'Time'],
                [null, 'Moderator'],
                [null, 'Action'],
                [null, 'Subject'],
                [null, 'Details'],
            ],
        })[props.view],
);
const isChangesets = computed(() =>
    ['changesets', 'profile'].includes(props.view),
);
const groups = computed(() =>
    ['nodes', 'editors'].includes(props.view)
        ? []
        : [
              {
                  key: 'statuses',
                  label: 'Status',
                  options: ['Needs review', 'Reviewed', 'Flagged'],
              },
              {
                  key: 'kinds',
                  label: 'Changes',
                  options: ['added', 'modified', 'deleted'],
              },
          ],
);
const filtersActive = computed(() =>
    Object.keys(filterQuery(state)).some(
        (key) => !['view', 'uid', 'page', 'sort', 'order'].includes(key),
    ),
);
watch(
    () => [props.view, props.filters],
    () => {
        clearTimeout(timer);
        Object.keys(state).forEach((key) => delete state[key]);
        Object.assign(state, { area: '', window: '' }, props.filters, {
            view: props.view,
        });
        expanded.value = null;
        review.clearErrors();
        for (const request of requests.values()) request.abort();
        requests.clear();
        for (const cache of [details, detailErrors, detailLoading])
            Object.keys(cache).forEach((key) => delete cache[key]);
    },
    { immediate: true },
);
function apply(extra = {}) {
    clearTimeout(timer);
    Object.assign(state, { page: 1 }, extra);
    router.get(route('moderation.index'), filterQuery(state), {
        preserveState: true,
        preserveScroll: true,
        replace: true,
        onStart: () => (loading.value = true),
        onFinish: () => (loading.value = false),
    });
}
function debounce() {
    clearTimeout(timer);
    timer = setTimeout(() => apply(), 400);
}
function toggle(key, value) {
    const selected = state[key] || [];
    state[key] = selected.includes(value)
        ? selected.filter((item) => item !== value)
        : [...selected, value];
    apply();
}
function clear() {
    const uid = state.uid;
    Object.keys(state).forEach((key) => delete state[key]);
    Object.assign(state, {
        area: '',
        window: '',
        view: props.view,
        ...(uid ? { uid } : {}),
    });
    apply();
}
function sort(key) {
    apply({
        sort: key,
        order: state.sort === key && state.order === 'desc' ? 'asc' : 'desc',
    });
}
function query(view, extras = {}) {
    return route('moderation.index', { view, ...extras });
}
function osm(path) {
    return `${props.osmUrl}${path}`;
}
function rowKey(row) {
    return `${props.view}:${row.id}`;
}
async function loadDetails(row, url) {
    const key = rowKey(row);
    requests.get(key)?.abort();
    const request = new AbortController();
    requests.set(key, request);
    detailLoading[key] = true;
    delete detailErrors[key];
    try {
        const response = await fetch(
            url ||
                (props.view === 'areas'
                    ? route('moderation.areas.show', row.id)
                    : route('moderation.changesets.show', row.id)),
            { headers: { Accept: 'application/json' }, signal: request.signal },
        );
        const data = await response.json();
        if (!response.ok)
            throw new Error(
                data.message ||
                    'Details could not be loaded. Please try again.',
            );
        details[key] = data;
    } catch (error) {
        if (error.name !== 'AbortError') detailErrors[key] = error.message;
    } finally {
        detailLoading[key] = false;
        requests.delete(key);
    }
}
function expand(row) {
    const key = rowKey(row);
    expanded.value = expanded.value === key ? null : key;
    if (
        expanded.value &&
        (isChangesets.value || props.view === 'areas') &&
        !details[key]
    )
        loadDetails(row);
}
function saveReview(row, status) {
    if (review.processing) return;
    review.revision = row.revision;
    review.status = status;
    review.patch(
        route(
            props.view === 'nodes'
                ? 'moderation.nodes.review'
                : 'moderation.changesets.review',
            row.id,
        ),
        { preserveScroll: true },
    );
}
function subscribed(row) {
    return row.watchers?.some((user) => user.id === page.props.auth.user.id);
}
function areaAction(row, action) {
    if (actionBusy.value) return;
    const method = action === 'subscribe' ? 'post' : 'delete';
    router[method](
        route(`moderation.areas.${action}`, row.id),
        ...(method === 'post' ? [{}] : []),
        {
            preserveScroll: true,
            onStart: () => (actionBusy.value = true),
            onFinish: () => {
                actionBusy.value = false;
                removeArea.value = null;
            },
        },
    );
}
function statusClass(value) {
    return {
        Reviewed: 'text-daf-text-brand',
        Flagged: 'text-[var(--alert-600)]',
        'Needs review': 'text-[var(--azure-500)]',
    }[value];
}
onBeforeUnmount(() => {
    clearTimeout(timer);
    for (const request of requests.values()) request.abort();
});
</script>
<template>
    <ModerationLayout :counts="counts" :view="view" navigation>
        <Head :title="`${title} · DAF Moderation`"
            ><meta content="noindex, nofollow" name="robots"
        /></Head>
        <div class="moderation-page">
            <div v-if="!profile" class="px-4 pb-2 pt-[22px] sm:px-6">
                <Link
                    v-if="view === 'profile'"
                    :href="query('editors')"
                    class="mb-4 inline-flex text-sm font-semibold text-daf-text-secondary"
                    >← Editors</Link
                >
                <div class="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h1
                            class="m-0 font-display text-daf-h1 font-bold tracking-[var(--ls-display)]"
                        >
                            {{ title }}
                        </h1>
                        <p
                            class="mb-0 mt-1.5 max-w-[70ch] text-daf-body text-daf-text-secondary"
                        >
                            {{
                                descriptions[view] ||
                                `uid ${profile?.osm_uid ?? filters.uid} · Activity in the tracked ALPR dataset`
                            }}
                        </p>
                    </div>
                    <DafButton
                        v-if="view === 'areas'"
                        @click="areaDialog = true"
                        >Create area</DafButton
                    >
                </div>
                <div
                    v-if="source.state === 'unavailable'"
                    class="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-dafMd border border-[var(--amber-500)] bg-[var(--amber-100)] px-4 py-3 text-sm text-[var(--amber-600)]"
                    role="status"
                >
                    <span
                        ><strong>OpenStreetMap data is unavailable.</strong>
                        Please try again shortly.</span
                    ><button class="font-bold underline" @click="apply()">
                        Try again
                    </button>
                </div>
                <p
                    v-else-if="source.observed_at"
                    class="mt-3 font-mono text-[10px] text-daf-text-tertiary"
                >
                    Latest changeset observation ·
                    {{ absoluteTime(source.observed_at) }}
                </p>
            </div>
            <EditorProfile
                v-if="profile"
                :filters="filters"
                :osm-url="osmUrl"
                :profile="profile"
                :records="records"
                :weeks="weeks"
            />
            <form
                v-if="!['audit', 'profile'].includes(view)"
                class="sticky top-[57px] z-20 flex flex-col gap-2.5 border-b border-daf-border bg-[color-mix(in_oklab,var(--surface-page)_95%,transparent)] px-4 py-3.5 backdrop-blur-xl sm:px-6"
                @submit.prevent="apply()"
            >
                <div
                    v-if="view !== 'areas'"
                    class="flex flex-wrap items-center gap-x-[18px] gap-y-2.5"
                >
                    <div
                        v-for="group in groups"
                        :key="group.key"
                        class="flex flex-wrap items-center gap-[5px]"
                    >
                        <span class="mod-label mr-1">{{ group.label }}</span
                        ><button
                            v-for="option in group.options"
                            :key="option"
                            :aria-pressed="
                                (state[group.key] || []).includes(option)
                            "
                            :class="[
                                'mod-chip',
                                (state[group.key] || []).includes(option) &&
                                    'mod-chip-active',
                            ]"
                            type="button"
                            @click="toggle(group.key, option)"
                        >
                            {{
                                {
                                    added: 'Added',
                                    modified: 'Modified',
                                    deleted: 'Deleted',
                                }[option] || option
                            }}
                        </button>
                    </div>
                    <label class="flex items-center gap-2"
                        ><span class="mod-label">Location</span
                        ><select
                            v-model="state.area"
                            aria-label="Watched area"
                            class="mod-input !h-7 !w-[170px] !py-0 text-xs"
                            @change="apply()"
                        >
                            <option value="">All locations</option>
                            <option
                                v-for="area in areas"
                                :key="area.id"
                                :value="area.id"
                            >
                                {{ area.name }}
                            </option>
                        </select></label
                    >
                </div>
                <div class="flex flex-wrap items-center gap-2.5">
                    <input
                        v-if="view === 'areas'"
                        v-model="state.search"
                        aria-label="Filter areas"
                        class="mod-input max-w-sm"
                        placeholder="Filter areas…"
                        @input="debounce"
                    />
                    <template v-else>
                        <input
                            v-if="view !== 'editors'"
                            v-model="state.changeset"
                            aria-label="Changeset ID"
                            class="mod-input !w-[200px]"
                            inputmode="numeric"
                            placeholder="#  Changeset ID"
                            @input="debounce"
                        />
                        <input
                            v-model="state.user"
                            aria-label="User or UID"
                            class="mod-input !w-[200px]"
                            placeholder="@  User or UID"
                            @input="debounce"
                        />
                        <select
                            v-model="state.window"
                            aria-label="Time window"
                            class="mod-input !w-[150px]"
                            @change="apply()"
                        >
                            <option value="">Any time</option>
                            <option value="24h">Last 24 h</option>
                            <option value="7d">Last 7 d</option>
                            <option value="30d">Last 30 d</option>
                        </select>
                        <template v-if="view === 'nodes'"
                            ><input
                                v-model="state.operator"
                                aria-label="Operator"
                                class="mod-input !w-[170px]"
                                placeholder="Operator…"
                                @input="debounce"
                            /><span class="mod-label">Direction</span
                            ><input
                                v-model="state.direction_from"
                                aria-label="Direction from"
                                class="mod-input !w-20"
                                max="359"
                                min="0"
                                placeholder="From°"
                                type="number"
                                @input="debounce"
                            /><span class="text-daf-text-tertiary">→</span
                            ><input
                                v-model="state.direction_to"
                                aria-label="Direction to"
                                class="mod-input !w-20"
                                max="359"
                                min="0"
                                placeholder="To°"
                                type="number"
                                @input="debounce"
                            /><button
                                :aria-pressed="!!state.missing_direction"
                                :class="[
                                    'mod-chip',
                                    state.missing_direction &&
                                        'mod-chip-active',
                                ]"
                                type="button"
                                @click="
                                    state.missing_direction =
                                        state.missing_direction ? false : 1;
                                    apply();
                                "
                            >
                                Missing
                            </button></template
                        >
                    </template>
                    <button
                        v-if="filtersActive"
                        class="mod-button"
                        type="button"
                        @click="clear"
                    >
                        Clear</button
                    ><span
                        aria-live="polite"
                        class="ml-auto font-mono text-xs text-daf-text-tertiary"
                        >{{
                            loading
                                ? 'Loading…'
                                : source.state === 'unavailable' &&
                                    !['areas', 'audit'].includes(view)
                                  ? 'Data unavailable'
                                  : `${records.data.length} ${view === 'profile' ? 'changesets' : view} on this page`
                        }}</span
                    >
                </div>
                <p
                    v-for="(error, key) in page.props.errors"
                    :key="key"
                    class="text-sm text-[var(--alert-600)]"
                    role="alert"
                >
                    {{ error }}
                </p>
            </form>
            <section
                v-if="view !== 'profile'"
                :aria-busy="loading"
                class="px-4 pb-4 pt-2.5 sm:px-6"
            >
                <div class="mod-card overflow-x-auto">
                    <table
                        :class="`mod-table-${view}`"
                        class="mod-table w-full border-collapse text-left text-daf-body-sm"
                    >
                        <caption class="sr-only">
                            {{
                                title
                            }}
                            moderation records
                        </caption>
                        <thead>
                            <tr
                                class="border-b border-daf-border bg-daf-surface-page"
                            >
                                <th
                                    v-for="([key, label], index) in columns"
                                    :key="index"
                                    :aria-sort="
                                        key && state.sort === key
                                            ? state.order === 'asc'
                                                ? 'ascending'
                                                : 'descending'
                                            : undefined
                                    "
                                    class="px-3 py-3"
                                >
                                    <div
                                        v-if="key === 'changes'"
                                        class="flex gap-2"
                                    >
                                        <button
                                            v-for="[kind, sign] in [
                                                ['added', '+'],
                                                ['modified', '~'],
                                                ['deleted', '−'],
                                            ]"
                                            :key="kind"
                                            :aria-label="`Sort by ${kind}`"
                                            class="w-[38px] font-mono text-xs text-daf-text-tertiary"
                                            type="button"
                                            @click="sort(kind)"
                                        >
                                            {{ sign }}
                                            {{
                                                state.sort === kind
                                                    ? state.order === 'asc'
                                                        ? '↑'
                                                        : '↓'
                                                    : ''
                                            }}
                                        </button>
                                    </div>
                                    <button
                                        v-else-if="key"
                                        class="mod-label whitespace-nowrap"
                                        @click="sort(key)"
                                    >
                                        {{ label }}
                                        {{
                                            state.sort === key
                                                ? state.order === 'asc'
                                                    ? '↑'
                                                    : '↓'
                                                : ''
                                        }}</button
                                    ><span v-else class="mod-label">{{
                                        label
                                    }}</span>
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            <template
                                v-for="row in records.data"
                                :key="rowKey(row)"
                            >
                                <tr
                                    class="border-b border-daf-border hover:bg-[color-mix(in_oklab,var(--brand)_4%,var(--surface-card))]"
                                >
                                    <template v-if="isChangesets"
                                        ><td
                                            class="font-mono text-[13px] font-semibold"
                                        >
                                            #{{ row.id }}
                                            <div class="mt-1">
                                                <a
                                                    :href="
                                                        osm(
                                                            `/changeset/${row.id}`,
                                                        )
                                                    "
                                                    class="mod-link"
                                                    rel="noopener noreferrer"
                                                    target="_blank"
                                                    >OSM ↗</a
                                                >
                                            </div>
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
                                                >{{
                                                    row.osm_user ||
                                                    'Unknown editor'
                                                }}</Link
                                            ><span
                                                v-else
                                                class="font-semibold text-daf-text-tertiary"
                                                >Unknown editor</span
                                            >
                                            <div
                                                :title="row.comment"
                                                class="mt-1 truncate text-xs text-daf-text-secondary"
                                            >
                                                {{
                                                    row.comment ||
                                                    'No changeset comment'
                                                }}
                                            </div>
                                            <div
                                                v-if="row.osm_uid"
                                                class="mt-[3px] flex gap-3"
                                            >
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
                                        <td>
                                            <span
                                                class="inline-flex items-center gap-[7px] whitespace-nowrap text-xs font-semibold text-daf-text-secondary"
                                                ><span
                                                    :class="
                                                        statusClass(row.status)
                                                    "
                                                    aria-hidden="true"
                                                    >●</span
                                                >{{ row.status }}</span
                                            >
                                        </td>
                                        <td
                                            class="max-w-[160px] truncate text-xs text-daf-text-secondary"
                                        >
                                            {{ locationLabel(row) }}
                                        </td>
                                        <td
                                            class="whitespace-nowrap text-right font-mono text-xs text-daf-text-tertiary"
                                        >
                                            <time
                                                :datetime="row.changed_at"
                                                :title="
                                                    absoluteTime(row.changed_at)
                                                "
                                                >{{
                                                    relativeTime(row.changed_at)
                                                }}</time
                                            >
                                        </td>
                                        <td>
                                            <button
                                                :aria-expanded="
                                                    expanded === rowKey(row)
                                                "
                                                :aria-label="`Details for changeset ${row.id}`"
                                                class="mod-expand"
                                                @click="expand(row)"
                                            >
                                                <DafIcon
                                                    :class="
                                                        expanded ===
                                                            rowKey(row) &&
                                                        'rotate-180'
                                                    "
                                                    :size="16"
                                                    name="chevron-down"
                                                />
                                            </button></td
                                    ></template>
                                    <template v-else-if="view === 'nodes'"
                                        ><td
                                            class="font-mono text-xs font-semibold"
                                        >
                                            {{ row.id }}
                                            <div
                                                class="mt-1 text-[10px] font-normal text-daf-text-tertiary"
                                            >
                                                v{{ row.osm_version }}
                                            </div>
                                        </td>
                                        <td>
                                            <Link
                                                :href="
                                                    query('changesets', {
                                                        changeset:
                                                            row.osm_changeset_id,
                                                    })
                                                "
                                                class="mod-link font-mono"
                                                >#{{
                                                    row.osm_changeset_id
                                                }}</Link
                                            >
                                        </td>
                                        <td class="font-mono text-xs">
                                            {{
                                                row.direction === null
                                                    ? '—'
                                                    : `${row.direction}°`
                                            }}
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
                                                >{{
                                                    row.osm_user || row.osm_uid
                                                }}</Link
                                            ><span
                                                v-else
                                                class="text-xs text-daf-text-tertiary"
                                                >Unknown</span
                                            >
                                        </td>
                                        <td
                                            class="max-w-[160px] truncate text-xs text-daf-text-secondary"
                                        >
                                            {{ locationLabel(row) }}
                                        </td>
                                        <td
                                            class="whitespace-nowrap font-mono text-xs text-daf-text-tertiary"
                                        >
                                            <time
                                                :datetime="row.changed_at"
                                                :title="
                                                    absoluteTime(row.changed_at)
                                                "
                                                >{{
                                                    relativeTime(row.changed_at)
                                                }}</time
                                            >
                                        </td>
                                        <td>
                                            <div class="flex gap-3">
                                                <a
                                                    :href="
                                                        osm(
                                                            `/edit?editor=id&node=${row.id}`,
                                                        )
                                                    "
                                                    class="mod-link"
                                                    rel="noopener noreferrer"
                                                    target="_blank"
                                                    >Edit ↗</a
                                                >
                                            </div>
                                        </td>
                                        <td>
                                            <button
                                                :aria-expanded="
                                                    expanded === rowKey(row)
                                                "
                                                :aria-label="`Details for node ${row.id}`"
                                                class="mod-expand"
                                                @click="expand(row)"
                                            >
                                                <DafIcon
                                                    :class="
                                                        expanded ===
                                                            rowKey(row) &&
                                                        'rotate-180'
                                                    "
                                                    :size="16"
                                                    name="chevron-down"
                                                />
                                            </button></td
                                    ></template>
                                    <template v-else-if="view === 'editors'"
                                        ><td>
                                            <Link
                                                :href="
                                                    query('profile', {
                                                        uid: row.osm_uid,
                                                    })
                                                "
                                                class="font-semibold hover:text-daf-text-brand"
                                                >{{
                                                    row.name || row.osm_uid
                                                }}</Link
                                            ><span
                                                class="ml-2 font-mono text-[10px] text-daf-text-tertiary"
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
                                                            user: String(
                                                                row.osm_uid,
                                                            ),
                                                        })
                                                    "
                                                    class="mod-link"
                                                    >Changesets</Link
                                                ><Link
                                                    :href="
                                                        query('nodes', {
                                                            user: String(
                                                                row.osm_uid,
                                                            ),
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
                                        <td
                                            class="font-mono text-daf-text-tertiary"
                                            title="Rules have not been configured"
                                        >
                                            —
                                        </td>
                                        <td
                                            class="font-mono text-daf-text-tertiary"
                                            title="Revert tracking is not available yet"
                                        >
                                            —
                                        </td>
                                        <td
                                            class="font-mono text-daf-text-tertiary"
                                            title="Mapping areas have not been calculated yet"
                                        >
                                            —
                                        </td>
                                        <td
                                            class="whitespace-nowrap font-mono text-xs text-daf-text-tertiary"
                                        >
                                            <time
                                                :datetime="row.last_active"
                                                :title="
                                                    absoluteTime(
                                                        row.last_active,
                                                    )
                                                "
                                                >{{
                                                    relativeTime(
                                                        row.last_active,
                                                    )
                                                }}</time
                                            >
                                        </td>
                                        <td
                                            class="text-xs text-daf-text-tertiary"
                                            title="Editor status is not configured"
                                        >
                                            —
                                        </td>
                                    </template>
                                    <template v-else-if="view === 'areas'"
                                        ><td>
                                            <div class="font-semibold">
                                                {{ row.name }}
                                                <span
                                                    class="ml-1 rounded bg-daf-surface-alt px-1.5 py-0.5 font-mono text-[10px] uppercase text-daf-text-tertiary"
                                                    >{{ row.kind }}</span
                                                >
                                            </div>
                                            <div
                                                class="mt-1 text-xs text-daf-text-tertiary"
                                            >
                                                {{ row.definition }}
                                            </div>
                                            <div class="mt-1.5 flex gap-3">
                                                <Link
                                                    v-for="[key, label] in [
                                                        [
                                                            'changesets',
                                                            'Changesets',
                                                        ],
                                                        ['nodes', 'ALPR nodes'],
                                                        ['editors', 'Editors'],
                                                    ]"
                                                    :key="key"
                                                    :href="
                                                        query(key, {
                                                            area: row.id,
                                                        })
                                                    "
                                                    class="mod-link"
                                                    >{{ label }}</Link
                                                >
                                            </div>
                                        </td>
                                        <td class="max-w-[160px] text-xs">
                                            {{
                                                row.watchers
                                                    .map((user) =>
                                                        user.id ===
                                                        page.props.auth.user.id
                                                            ? `${user.name} (you)`
                                                            : user.name,
                                                    )
                                                    .join(', ') || 'No watchers'
                                            }}
                                        </td>
                                        <td class="font-mono">
                                            {{
                                                details[rowKey(row)]
                                                    ?.open_flags ??
                                                row.open_flags ??
                                                '—'
                                            }}
                                        </td>
                                        <td class="font-mono">
                                            {{
                                                details[rowKey(row)]
                                                    ?.changesets_7d ??
                                                row.changesets_7d ??
                                                '—'
                                            }}
                                        </td>
                                        <td class="font-mono">
                                            {{
                                                details[rowKey(row)]
                                                    ?.flagged_changesets ??
                                                row.flagged_changesets ??
                                                '—'
                                            }}
                                        </td>
                                        <td
                                            class="max-w-[130px] text-xs text-daf-text-secondary"
                                        >
                                            {{ absoluteTime(row.created_at) }}
                                        </td>
                                        <td>
                                            <div
                                                v-if="removeArea === row.id"
                                                class="flex gap-2"
                                            >
                                                <button
                                                    :disabled="actionBusy"
                                                    class="mod-link !text-[var(--alert-600)]"
                                                    @click="
                                                        areaAction(
                                                            row,
                                                            'destroy',
                                                        )
                                                    "
                                                >
                                                    Yes, remove</button
                                                ><button
                                                    class="mod-link"
                                                    @click="removeArea = null"
                                                >
                                                    Keep
                                                </button>
                                            </div>
                                            <div v-else class="flex gap-3">
                                                <button
                                                    :disabled="actionBusy"
                                                    class="mod-link"
                                                    @click="
                                                        areaAction(
                                                            row,
                                                            subscribed(row)
                                                                ? 'unsubscribe'
                                                                : 'subscribe',
                                                        )
                                                    "
                                                >
                                                    {{
                                                        subscribed(row)
                                                            ? 'Unsubscribe'
                                                            : 'Subscribe'
                                                    }}</button
                                                ><button
                                                    class="mod-link"
                                                    @click="removeArea = row.id"
                                                >
                                                    Remove
                                                </button>
                                            </div>
                                        </td>
                                        <td>
                                            <button
                                                :aria-expanded="
                                                    expanded === rowKey(row)
                                                "
                                                :aria-label="`Details for area ${row.name}`"
                                                class="mod-expand"
                                                @click="expand(row)"
                                            >
                                                <DafIcon
                                                    :class="
                                                        expanded ===
                                                            rowKey(row) &&
                                                        'rotate-180'
                                                    "
                                                    :size="16"
                                                    name="chevron-down"
                                                />
                                            </button></td
                                    ></template>
                                    <template v-else
                                        ><td class="text-xs">
                                            {{ absoluteTime(row.created_at) }}
                                        </td>
                                        <td>{{ row.actor }}</td>
                                        <td class="text-xs">
                                            {{
                                                row.action.replaceAll('.', ' ')
                                            }}
                                        </td>
                                        <td class="font-mono text-xs">
                                            {{ row.subject_type }} #{{
                                                row.subject_id
                                            }}
                                        </td>
                                        <td
                                            class="text-xs text-daf-text-secondary"
                                        >
                                            {{
                                                row.details.name ||
                                                `${row.details.from} → ${row.details.to}`
                                            }}
                                        </td></template
                                    >
                                </tr>
                                <tr
                                    v-if="expanded === rowKey(row)"
                                    class="border-b border-daf-border bg-daf-surface-page"
                                >
                                    <td :colspan="columns.length" class="!p-5">
                                        <div
                                            v-if="detailLoading[rowKey(row)]"
                                            class="flex animate-pulse flex-col gap-3 py-6"
                                            role="status"
                                        >
                                            <span
                                                class="h-3 w-2/3 rounded bg-daf-surface-alt"
                                            /><span
                                                class="h-3 w-1/2 rounded bg-daf-surface-alt"
                                            /><span class="sr-only"
                                                >Loading details…</span
                                            >
                                        </div>
                                        <div
                                            v-else-if="
                                                detailErrors[rowKey(row)]
                                            "
                                            class="py-4 text-sm text-[var(--alert-600)]"
                                            role="alert"
                                        >
                                            {{ detailErrors[rowKey(row)] }}
                                            <button
                                                class="mod-link"
                                                @click="loadDetails(row)"
                                            >
                                                Try again
                                            </button>
                                        </div>
                                        <div
                                            v-else
                                            class="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,420px)]"
                                        >
                                            <div class="min-w-0">
                                                <template v-if="isChangesets"
                                                    ><h2 class="mod-subheading">
                                                        {{
                                                            row.comment ||
                                                            `Changeset #${row.id}`
                                                        }}
                                                    </h2>
                                                    <div
                                                        class="my-3 flex flex-wrap gap-3"
                                                    >
                                                        <button
                                                            :disabled="
                                                                review.processing
                                                            "
                                                            class="mod-button"
                                                            @click="
                                                                saveReview(
                                                                    row,
                                                                    'Reviewed',
                                                                )
                                                            "
                                                        >
                                                            Mark reviewed</button
                                                        ><button
                                                            :disabled="
                                                                review.processing
                                                            "
                                                            class="mod-button"
                                                            @click="
                                                                saveReview(
                                                                    row,
                                                                    'Flagged',
                                                                )
                                                            "
                                                        >
                                                            Flag changeset</button
                                                        ><button
                                                            v-if="
                                                                row.status !==
                                                                'Needs review'
                                                            "
                                                            :disabled="
                                                                review.processing
                                                            "
                                                            class="mod-link"
                                                            @click="
                                                                saveReview(
                                                                    row,
                                                                    'Needs review',
                                                                )
                                                            "
                                                        >
                                                            Return to review
                                                        </button>
                                                    </div>
                                                    <dl class="mod-details">
                                                        <dt>Editor</dt>
                                                        <dd>
                                                            {{ row.osm_user }} ·
                                                            uid
                                                            {{ row.osm_uid }}
                                                        </dd>
                                                        <dt>Opened</dt>
                                                        <dd>
                                                            {{
                                                                absoluteTime(
                                                                    row.changed_at,
                                                                )
                                                            }}
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
                                                            {{ row.total }}
                                                            tracked ALPR nodes ·
                                                            {{
                                                                row.osm_num_changes
                                                            }}
                                                            total OSM changes
                                                        </dd>
                                                    </dl>
                                                    <h3 class="mod-label mt-5">
                                                        Changeset tags
                                                    </h3>
                                                    <dl
                                                        class="mod-details mt-2"
                                                    >
                                                        <template
                                                            v-for="(
                                                                value, key
                                                            ) in row.tags"
                                                            :key="key"
                                                            ><dt>{{ key }}</dt>
                                                            <dd>
                                                                {{ value }}
                                                            </dd></template
                                                        >
                                                    </dl>
                                                    <div
                                                        v-if="
                                                            details[rowKey(row)]
                                                        "
                                                        class="mt-5"
                                                    >
                                                        <h3 class="mod-label">
                                                            Node versions in
                                                            this changeset
                                                        </h3>
                                                        <ul
                                                            class="mt-2 flex flex-wrap gap-2"
                                                        >
                                                            <li
                                                                v-for="node in details[
                                                                    rowKey(row)
                                                                ].versions.data"
                                                                :key="node.id"
                                                            >
                                                                <a
                                                                    :href="
                                                                        osm(
                                                                            `/node/${node.node_id}/history`,
                                                                        )
                                                                    "
                                                                    class="mod-link"
                                                                    rel="noopener noreferrer"
                                                                    target="_blank"
                                                                    >{{
                                                                        node.node_id
                                                                    }}
                                                                    · v{{
                                                                        node.osm_version
                                                                    }}
                                                                    {{
                                                                        node.visible
                                                                            ? ''
                                                                            : '· deleted'
                                                                    }}
                                                                    ↗</a
                                                                >
                                                            </li>
                                                        </ul>
                                                        <button
                                                            v-if="
                                                                details[
                                                                    rowKey(row)
                                                                ].versions
                                                                    .prev_page_url
                                                            "
                                                            class="mod-link mr-3 mt-2"
                                                            @click="
                                                                loadDetails(
                                                                    row,
                                                                    details[
                                                                        rowKey(
                                                                            row,
                                                                        )
                                                                    ].versions
                                                                        .prev_page_url,
                                                                )
                                                            "
                                                        >
                                                            ← Previous node
                                                            versions
                                                        </button>
                                                        <button
                                                            v-if="
                                                                details[
                                                                    rowKey(row)
                                                                ].versions
                                                                    .next_page_url
                                                            "
                                                            class="mod-link mt-2"
                                                            @click="
                                                                loadDetails(
                                                                    row,
                                                                    details[
                                                                        rowKey(
                                                                            row,
                                                                        )
                                                                    ].versions
                                                                        .next_page_url,
                                                                )
                                                            "
                                                        >
                                                            Next node versions →
                                                        </button>
                                                        <h3
                                                            class="mod-label mt-5"
                                                        >
                                                            Discussion ·
                                                            {{
                                                                row.available_discussion_comments
                                                            }}
                                                            available /
                                                            {{
                                                                row.comments_count
                                                            }}
                                                            reported
                                                        </h3>
                                                        <p
                                                            v-if="
                                                                !details[
                                                                    rowKey(row)
                                                                ].comments.data
                                                                    .length
                                                            "
                                                            class="mt-2 text-xs text-daf-text-tertiary"
                                                        >
                                                            No discussion
                                                            comments available.
                                                        </p>
                                                        <article
                                                            v-for="comment in details[
                                                                rowKey(row)
                                                            ].comments.data"
                                                            :key="
                                                                comment.ordinal
                                                            "
                                                            class="mt-3 border-l-2 border-daf-border pl-3"
                                                        >
                                                            <div
                                                                class="text-xs font-semibold"
                                                            >
                                                                {{
                                                                    comment.osm_user ||
                                                                    'Unknown editor'
                                                                }}
                                                                ·
                                                                {{
                                                                    absoluteTime(
                                                                        comment.commented_at,
                                                                    )
                                                                }}
                                                            </div>
                                                            <p
                                                                class="mt-1 whitespace-pre-wrap break-words text-sm text-daf-text-secondary"
                                                            >
                                                                {{
                                                                    comment.body
                                                                }}
                                                            </p>
                                                        </article>
                                                        <button
                                                            v-if="
                                                                details[
                                                                    rowKey(row)
                                                                ].comments
                                                                    .prev_page_url
                                                            "
                                                            class="mod-link mr-3 mt-2"
                                                            @click="
                                                                loadDetails(
                                                                    row,
                                                                    details[
                                                                        rowKey(
                                                                            row,
                                                                        )
                                                                    ].comments
                                                                        .prev_page_url,
                                                                )
                                                            "
                                                        >
                                                            ← Previous comments
                                                        </button>
                                                        <button
                                                            v-if="
                                                                details[
                                                                    rowKey(row)
                                                                ].comments
                                                                    .next_page_url
                                                            "
                                                            class="mod-link mt-2"
                                                            @click="
                                                                loadDetails(
                                                                    row,
                                                                    details[
                                                                        rowKey(
                                                                            row,
                                                                        )
                                                                    ].comments
                                                                        .next_page_url,
                                                                )
                                                            "
                                                        >
                                                            Next comments →
                                                        </button>
                                                    </div>
                                                </template>
                                                <template
                                                    v-else-if="view === 'nodes'"
                                                    ><h2 class="mod-subheading">
                                                        Node {{ row.id }} ·
                                                        version
                                                        {{ row.osm_version }}
                                                    </h2>
                                                    <div
                                                        class="my-3 flex gap-4"
                                                    >
                                                        <a
                                                            :href="
                                                                osm(
                                                                    `/node/${row.id}`,
                                                                )
                                                            "
                                                            class="mod-link"
                                                            rel="noopener noreferrer"
                                                            target="_blank"
                                                            >View on OSM ↗</a
                                                        ><a
                                                            :href="
                                                                osm(
                                                                    `/node/${row.id}/history`,
                                                                )
                                                            "
                                                            class="mod-link"
                                                            rel="noopener noreferrer"
                                                            target="_blank"
                                                            >History ↗</a
                                                        ><Link
                                                            :href="
                                                                query(
                                                                    'changesets',
                                                                    {
                                                                        changeset:
                                                                            row.osm_changeset_id,
                                                                    },
                                                                )
                                                            "
                                                            class="mod-link"
                                                            >Changeset #{{
                                                                row.osm_changeset_id
                                                            }}</Link
                                                        >
                                                    </div>
                                                    <dl class="mod-details">
                                                        <dt>Location</dt>
                                                        <dd>
                                                            {{
                                                                locationLabel(
                                                                    row,
                                                                )
                                                            }}
                                                        </dd>
                                                        <dt>State</dt>
                                                        <dd>
                                                            {{
                                                                row.visible
                                                                    ? 'Visible'
                                                                    : 'Deleted'
                                                            }}
                                                        </dd>
                                                        <dt>Previous editor</dt>
                                                        <dd>
                                                            {{
                                                                row.previous
                                                                    ?.osm_user ||
                                                                'No prior version available'
                                                            }}
                                                        </dd>
                                                    </dl>
                                                    <h3 class="mod-label mt-5">
                                                        Tags · previous →
                                                        current
                                                    </h3>
                                                    <dl
                                                        class="mod-details mt-2"
                                                    >
                                                        <template
                                                            v-for="key in [
                                                                ...new Set([
                                                                    ...Object.keys(
                                                                        row
                                                                            .previous
                                                                            ?.tags ||
                                                                            {},
                                                                    ),
                                                                    ...Object.keys(
                                                                        row.tags,
                                                                    ),
                                                                ]),
                                                            ]"
                                                            :key="key"
                                                            ><dt>{{ key }}</dt>
                                                            <dd>
                                                                <span
                                                                    v-if="
                                                                        row.previous &&
                                                                        row
                                                                            .previous
                                                                            .tags[
                                                                            key
                                                                        ] !==
                                                                            row
                                                                                .tags[
                                                                                key
                                                                            ]
                                                                    "
                                                                    class="text-[var(--alert-600)]"
                                                                    >{{
                                                                        row
                                                                            .previous
                                                                            .tags[
                                                                            key
                                                                        ] || '—'
                                                                    }}
                                                                    → </span
                                                                >{{
                                                                    row.tags[
                                                                        key
                                                                    ] || '—'
                                                                }}
                                                            </dd></template
                                                        >
                                                    </dl></template
                                                >
                                                <template v-else
                                                    ><h2 class="mod-subheading">
                                                        {{ row.name }}
                                                    </h2>
                                                    <dl
                                                        class="mod-details mt-3"
                                                    >
                                                        <dt>Defined as</dt>
                                                        <dd>
                                                            {{ row.definition }}
                                                        </dd>
                                                        <dt>Created by</dt>
                                                        <dd>
                                                            {{
                                                                row.creator
                                                                    ?.name ||
                                                                'Former moderator'
                                                            }}
                                                            ·
                                                            {{
                                                                absoluteTime(
                                                                    row.created_at,
                                                                )
                                                            }}
                                                        </dd>
                                                        <dt>Watchers</dt>
                                                        <dd>
                                                            {{
                                                                row.watchers
                                                                    .map(
                                                                        (
                                                                            user,
                                                                        ) =>
                                                                            user.name,
                                                                    )
                                                                    .join(
                                                                        ', ',
                                                                    ) ||
                                                                'No watchers'
                                                            }}
                                                        </dd>
                                                        <dt>Open flags</dt>
                                                        <dd>
                                                            {{
                                                                details[
                                                                    rowKey(row)
                                                                ]?.open_flags ??
                                                                '—'
                                                            }}
                                                        </dd>
                                                        <dt>Edits · 7 d</dt>
                                                        <dd>
                                                            {{
                                                                details[
                                                                    rowKey(row)
                                                                ]
                                                                    ?.changesets_7d ??
                                                                '—'
                                                            }}
                                                        </dd>
                                                        <dt>
                                                            Flagged changesets
                                                        </dt>
                                                        <dd>
                                                            {{
                                                                details[
                                                                    rowKey(row)
                                                                ]
                                                                    ?.flagged_changesets ??
                                                                '—'
                                                            }}
                                                        </dd>
                                                    </dl></template
                                                >
                                            </div>
                                            <div>
                                                <ModerationMap
                                                    :bounds="row.bounds"
                                                    :geometry="row.geometry"
                                                    :nodes="
                                                        view === 'nodes'
                                                            ? [row]
                                                            : details[
                                                                  rowKey(row)
                                                              ]?.nodes || []
                                                    "
                                                />
                                                <p
                                                    class="mt-2 text-xs text-daf-text-tertiary"
                                                >
                                                    {{
                                                        view === 'nodes'
                                                            ? locationLabel(row)
                                                            : view === 'areas'
                                                              ? row.name
                                                              : 'Changeset extent reported by OpenStreetMap'
                                                    }}
                                                </p>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            </template>
                            <tr v-if="!records.data.length">
                                <td
                                    :colspan="columns.length"
                                    class="!px-6 !py-[72px] text-center"
                                >
                                    <h2
                                        class="font-display text-daf-h3 font-semibold"
                                    >
                                        {{
                                            source.state === 'unavailable' &&
                                            !['areas', 'audit'].includes(view)
                                                ? 'Waiting for OpenStreetMap data'
                                                : view === 'areas'
                                                  ? 'No areas yet'
                                                  : view === 'audit'
                                                    ? 'No moderation activity yet'
                                                    : `No ${view === 'profile' ? 'changesets' : view === 'nodes' ? 'flagged nodes' : view} match`
                                        }}
                                    </h2>
                                    <p
                                        class="mb-5 mt-2 text-daf-body text-daf-text-secondary"
                                    >
                                        {{
                                            source.state === 'unavailable' &&
                                            !['areas', 'audit'].includes(view)
                                                ? 'The review tools are ready. Records will appear when the source is available.'
                                                : view === 'areas'
                                                  ? 'Create a boundary to start watching a location.'
                                                  : view === 'audit'
                                                    ? 'Review decisions and area changes will appear here.'
                                                    : 'Loosen the filters, or enjoy the quiet.'
                                        }}
                                    </p>
                                    <button
                                        v-if="filtersActive"
                                        class="mod-button"
                                        @click="clear"
                                    >
                                        Clear filters</button
                                    ><DafButton
                                        v-else-if="view === 'areas'"
                                        @click="areaDialog = true"
                                        >Create area</DafButton
                                    >
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <nav
                    v-if="records.prev_page_url || records.next_page_url"
                    aria-label="Pagination"
                    class="mt-4 flex flex-wrap items-center gap-2"
                >
                    <span
                        class="mr-auto font-mono text-xs text-daf-text-tertiary"
                        >Showing {{ records.from }}–{{ records.to }}</span
                    ><Link
                        v-if="records.prev_page_url"
                        :href="records.prev_page_url"
                        class="mod-button"
                        preserve-scroll
                        >← Previous</Link
                    ><span class="font-mono text-xs text-daf-text-tertiary"
                        >Page {{ records.current_page }}</span
                    ><Link
                        v-if="records.next_page_url"
                        :href="records.next_page_url"
                        class="mod-button"
                        preserve-scroll
                        >Next →</Link
                    >
                </nav>
            </section>
            <AreaDialog :show="areaDialog" @close="areaDialog = false" />
        </div>
    </ModerationLayout>
</template>
<style>
.moderation-page .mod-card {
    @apply rounded-dafLg border border-daf-border bg-daf-surface-card shadow-dafCard;
}
.moderation-page .mod-label {
    @apply text-[10px] font-bold uppercase tracking-[var(--ls-label)] text-daf-text-tertiary;
}
.moderation-page .mod-chip {
    @apply inline-flex h-7 items-center whitespace-nowrap rounded-dafPill border border-daf-border px-[11px] text-xs font-semibold text-daf-text-secondary;
}
.moderation-page .mod-chip-active {
    @apply border-daf-brand bg-[var(--brand-soft)] text-daf-text-brand;
}
.moderation-page .mod-input {
    @apply h-10 w-full min-w-0 rounded-dafPill border border-daf-border bg-daf-surface-card px-4 py-0 text-[13px] text-daf-text-primary placeholder:text-daf-text-tertiary focus:border-daf-brand focus:ring-daf-brand;
}
.moderation-page .mod-button {
    @apply inline-flex h-9 items-center justify-center whitespace-nowrap rounded-dafPill border border-daf-border px-4 text-xs font-semibold text-daf-text-secondary hover:border-daf-brand hover:text-daf-text-brand disabled:opacity-50;
}
.moderation-page .mod-link {
    @apply text-[11px] font-semibold text-daf-text-brand hover:underline disabled:opacity-50;
}
.moderation-page .mod-expand {
    @apply flex size-7 items-center justify-center rounded-dafXs text-daf-text-tertiary hover:bg-daf-surface-alt;
}
.moderation-page .mod-subheading {
    @apply font-display text-daf-h3 font-semibold tracking-[var(--ls-display)];
}
.moderation-page td {
    @apply px-3 py-3 align-middle;
}
.moderation-page .mod-details {
    @apply grid grid-cols-[minmax(100px,0.4fr)_minmax(0,1fr)] gap-x-4 gap-y-2 text-xs;
}
.moderation-page .mod-details dt {
    @apply break-words font-mono text-daf-text-tertiary;
}
.moderation-page .mod-details dd {
    @apply break-words text-daf-text-secondary;
}
.moderation-page .mod-table-changesets {
    min-width: 680px;
    table-layout: fixed;
}
.moderation-page .mod-table-changesets th:nth-child(1) {
    width: 116px;
}
.moderation-page .mod-table-changesets th:nth-child(3) {
    width: 164px;
}
.moderation-page .mod-table-changesets th:nth-child(4) {
    width: 120px;
}
.moderation-page .mod-table-changesets th:nth-child(5) {
    width: 15%;
}
.moderation-page .mod-table-changesets th:nth-child(6) {
    width: 88px;
}
.moderation-page .mod-table-changesets th:nth-child(7) {
    width: 48px;
}
.moderation-page .mod-table-nodes {
    min-width: 1080px;
}
.moderation-page .mod-table-editors {
    min-width: 960px;
}
.moderation-page .mod-table-areas {
    min-width: 1100px;
}
.moderation-page .mod-table-audit {
    min-width: 650px;
}
@media (max-width: 960px) {
    .moderation-page .mod-table-changesets th:nth-child(5),
    .moderation-page
        .mod-table-changesets
        tr:not(:has(td[colspan]))
        td:nth-child(5) {
        display: none;
    }
}
</style>
