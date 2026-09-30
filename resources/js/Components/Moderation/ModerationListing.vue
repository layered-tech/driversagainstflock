<script setup>
import DafButton from '@/Components/Daf/DafButton.vue';
import AreaDialog from '@/Components/Moderation/AreaDialog.vue';
import ModerationMap from '@/Components/Moderation/ModerationMap.vue';
import ModerationLayout from '@/Layouts/ModerationLayout.vue';
import ModerationPageHeader from '@/Components/Moderation/ModerationPageHeader.vue';
import { Head, Link } from '@inertiajs/vue3';
import {
    changesetNodes,
    locationLabel,
    moderationDetailNodes,
} from '@/moderation';
import {
    Combobox,
    ComboboxInput,
    ComboboxOption,
    ComboboxOptions,
} from '@headlessui/vue';

const props = defineProps({
    listing: { type: Object, required: true },
    columns: { type: Array, required: true },
});
const {
    view,
    title,
    isChangesets,
    isNodes,
    groups,
    filtersActive,
    state,
    loading,
    areaSearch,
    matchingAreas,
    selectedArea,
    selectArea,
    expanded,
    details,
    detailErrors,
    detailLoading,
    selectedNodes,
    areaDialog,
    apply,
    debounce,
    toggle,
    clear,
    sort,
    rowKey,
    loadDetails,
    expand,
    page,
    ruleOptions,
    records,
    counts,
    source,
} = props.listing;
</script>
<template>
    <ModerationLayout :counts="counts" :view="view" navigation>
        <Head :title="`${title} · DAF Moderation`"
            ><meta content="noindex, nofollow" name="robots"
        /></Head>
        <div class="moderation-page">
            <ModerationPageHeader :listing="listing" />
            <p
                v-if="page.props.errors?.flag"
                class="px-6 py-3 text-sm text-[var(--alert-600)]"
                role="alert"
            >
                {{ page.props.errors.flag }}
            </p>

            <form
                v-if="!['audit', 'profile'].includes(view)"
                class="sticky top-[57px] z-20 flex flex-col gap-2.5 border-b border-daf-border bg-[color-mix(in_oklab,var(--surface-page)_95%,transparent)] px-4 py-3.5 backdrop-blur-xl sm:px-6"
                @submit.prevent="apply()"
            >
                <div
                    v-if="['flagged', 'nodes', 'areas'].includes(view)"
                    class="flex gap-2"
                >
                    <button
                        :aria-pressed="state.area_scope !== 'my' && !state.area"
                        class="mod-chip"
                        type="button"
                        @click="apply({ area_scope: '', area: '' })"
                    >
                        All Areas
                    </button>
                    <button
                        :aria-pressed="state.area_scope === 'my'"
                        class="mod-chip"
                        type="button"
                        @click="apply({ area_scope: 'my', area: '' })"
                    >
                        My Areas
                    </button>
                </div>
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
                    <template v-if="view === 'flagged'">
                        <label class="mod-label"
                            >Source
                            <select
                                :value="state.flag_source || 'all'"
                                aria-label="Flag source"
                                class="mod-input"
                                @change="
                                    apply({
                                        flag_source: $event.target.value,
                                        rules: [],
                                        severities: [],
                                        window: '',
                                        sort: '',
                                        report_state: '',
                                        report_window: '',
                                    })
                                "
                            >
                                <option value="all">All</option>
                                <option value="rule">Rule flags</option>
                                <option value="alpr_presence">
                                    Driver reports
                                </option>
                            </select>
                        </label>
                        <template v-if="state.flag_source === 'alpr_presence'">
                            <label class="mod-label"
                                >Review state
                                <select
                                    :value="state.report_state || 'open'"
                                    aria-label="Report review state"
                                    class="mod-input"
                                    @change="
                                        apply({
                                            report_state: $event.target.value,
                                        })
                                    "
                                >
                                    <option value="open">Open</option>
                                    <option value="dismissed">Dismissed</option>
                                    <option value="all">All</option>
                                </select>
                            </label>
                            <label class="mod-label"
                                >Report received
                                <select
                                    :value="state.report_window || ''"
                                    aria-label="Report received window"
                                    class="mod-input"
                                    @change="
                                        apply({
                                            report_window: $event.target.value,
                                        })
                                    "
                                >
                                    <option value="">Any report time</option>
                                    <option value="24h">Last 24 h</option>
                                    <option value="7d">Last 7 d</option>
                                    <option value="30d">Last 30 d</option>
                                </select>
                            </label>
                        </template>
                    </template>
                    <template
                        v-if="
                            view === 'flagged' &&
                            state.flag_source !== 'alpr_presence'
                        "
                    >
                        <div class="flex flex-wrap items-center gap-[5px]">
                            <span class="mod-label mr-1">Rule</span>
                            <button
                                v-for="rule in ruleOptions"
                                :key="rule.id"
                                :aria-pressed="
                                    (state.rules || [])
                                        .map(Number)
                                        .includes(rule.id)
                                "
                                :class="[
                                    'mod-chip',
                                    (state.rules || [])
                                        .map(Number)
                                        .includes(rule.id) && 'mod-chip-active',
                                ]"
                                type="button"
                                @click="
                                    state.rules = (state.rules || []).map(
                                        Number,
                                    );
                                    toggle('rules', rule.id);
                                "
                            >
                                {{ rule.name }}
                            </button>
                            <span
                                v-if="!ruleOptions.length"
                                class="text-xs text-daf-text-tertiary"
                                >No active rules</span
                            >
                        </div>
                        <div class="flex flex-wrap items-center gap-[5px]">
                            <span class="mod-label mr-1">Severity</span>
                            <button
                                v-for="severity in ['High', 'Medium', 'Low']"
                                :key="severity"
                                :aria-pressed="
                                    (state.severities || []).includes(severity)
                                "
                                :class="[
                                    'mod-chip',
                                    (state.severities || []).includes(
                                        severity,
                                    ) && 'mod-chip-active',
                                ]"
                                type="button"
                                @click="toggle('severities', severity)"
                            >
                                {{ severity }}
                            </button>
                        </div>
                    </template>
                    <div v-if="isNodes" class="flex items-center gap-[5px]">
                        <span class="mod-label mr-1">Direction</span
                        ><input
                            v-model="state.direction_from"
                            aria-label="Direction from"
                            class="mod-input !h-7 !w-[58px] !px-2 text-center !text-xs"
                            max="359"
                            min="0"
                            placeholder="0°"
                            type="number"
                            @input="debounce"
                        /><span class="text-daf-text-tertiary">–</span
                        ><input
                            v-model="state.direction_to"
                            aria-label="Direction to"
                            class="mod-input !h-7 !w-[58px] !px-2 text-center !text-xs"
                            max="359"
                            min="0"
                            placeholder="359°"
                            type="number"
                            @input="debounce"
                        /><button
                            :aria-pressed="!!state.missing_direction"
                            :class="[
                                'mod-chip',
                                state.missing_direction && 'mod-chip-active',
                            ]"
                            type="button"
                            @click="
                                state.missing_direction =
                                    state.missing_direction ? false : 1;
                                apply();
                            "
                        >
                            Missing
                        </button>
                    </div>
                    <div class="flex flex-wrap items-center gap-[5px]">
                        <span class="mod-label mr-1">{{
                            view === 'editors' ? 'Active in' : 'Location'
                        }}</span>
                        <button
                            v-if="selectedArea"
                            :aria-label="`Remove location ${selectedArea.name}`"
                            class="mod-chip mod-chip-active gap-1.5"
                            type="button"
                            @click="selectArea('')"
                        >
                            {{ selectedArea.name }}
                            <span aria-hidden="true">×</span>
                        </button>
                        <Combobox
                            :model-value="state.area"
                            @update:model-value="selectArea"
                        >
                            <div class="relative">
                                <ComboboxInput
                                    :display-value="() => areaSearch"
                                    aria-label="Watched area"
                                    class="mod-input !h-7 !w-[170px] !px-3 !text-xs"
                                    placeholder="Search locations…"
                                    @change="areaSearch = $event.target.value"
                                />
                                <ComboboxOptions
                                    class="absolute left-0 top-8 z-30 max-h-[260px] min-w-[200px] overflow-auto rounded-dafMd border border-daf-border bg-daf-surface-card p-1 shadow-dafFloat"
                                >
                                    <ComboboxOption
                                        v-for="area in matchingAreas"
                                        :key="area.id"
                                        v-slot="{ active }"
                                        :value="area.id"
                                        as="template"
                                    >
                                        <li
                                            :class="[
                                                'cursor-pointer rounded-dafXs px-2.5 py-[7px] text-[13px]',
                                                active &&
                                                    'bg-[var(--brand-soft)] text-daf-text-brand',
                                            ]"
                                        >
                                            {{ area.name }}
                                        </li>
                                    </ComboboxOption>
                                    <li
                                        v-if="!matchingAreas.length"
                                        class="px-2.5 py-[7px] text-xs text-daf-text-tertiary"
                                    >
                                        No matching locations
                                    </li>
                                </ComboboxOptions>
                            </div>
                        </Combobox>
                    </div>
                    <label v-if="isNodes" class="flex items-center gap-[5px]">
                        <span class="mod-label mr-1">Operator</span>
                        <input
                            v-model="state.operator"
                            aria-label="Operator"
                            class="mod-input !h-7 !w-[170px] !px-3 !text-xs"
                            placeholder="Search operators…"
                            @input="debounce"
                        />
                    </label>
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
                            v-if="isNodes"
                            v-model="state.osm_id"
                            aria-label="OSM node ID"
                            class="mod-input !w-[220px] min-w-[170px]"
                            inputmode="numeric"
                            placeholder="#  OSM node ID"
                            @input="debounce"
                        />
                        <input
                            v-if="view !== 'editors'"
                            v-model="state.changeset"
                            aria-label="Changeset ID"
                            class="mod-input !w-[220px] min-w-[170px]"
                            inputmode="numeric"
                            placeholder="#  Changeset ID"
                            @input="debounce"
                        />
                        <input
                            v-model="state.user"
                            :placeholder="
                                isNodes
                                    ? '@  Changed by — user or UID'
                                    : '@  User or UID'
                            "
                            aria-label="User or UID"
                            class="mod-input !w-[220px] min-w-[170px]"
                            @input="debounce"
                        />
                        <select
                            v-model="state.window"
                            aria-label="Node edit time window"
                            class="mod-input !w-[150px]"
                            @change="apply()"
                        >
                            <option value="">Any edit time</option>
                            <option value="24h">Last 24 h</option>
                            <option value="7d">Last 7 d</option>
                            <option value="30d">Last 30 d</option>
                        </select>
                    </template>
                    <button
                        v-if="filtersActive"
                        class="mod-button !h-10"
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
                                : source.summary_progress?.failed
                                  ? `${source.summary_progress.failed} summary job${source.summary_progress.failed === 1 ? '' : 's'} failed`
                                  : source.state === 'refreshing' &&
                                      source.summary_progress?.total
                                    ? `Refreshing ${source.summary_progress.completed}/${source.summary_progress.total} summaries…`
                                    : source.state === 'refreshing'
                                      ? 'Refreshing summaries…'
                                      : source.state === 'unavailable' &&
                                          !['areas', 'audit'].includes(view)
                                        ? 'Data unavailable'
                                        : `${records.data.length} ${view === 'flagged' ? 'flagged nodes' : view} on this page`
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
            <section :aria-busy="loading" class="px-4 pb-4 pt-2.5 sm:px-6">
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
                                    :aria-expanded="
                                        isChangesets ||
                                        isNodes ||
                                        view === 'areas'
                                            ? expanded === rowKey(row)
                                            : undefined
                                    "
                                    :tabindex="
                                        isChangesets ||
                                        isNodes ||
                                        view === 'areas'
                                            ? 0
                                            : undefined
                                    "
                                    class="border-b border-daf-border hover:bg-[color-mix(in_oklab,var(--brand)_4%,var(--surface-card))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--brand)]"
                                    @click="
                                        (isChangesets ||
                                            isNodes ||
                                            view === 'areas') &&
                                        !$event.target.closest(
                                            'a, button, input, select, textarea, summary, label, [role=button]',
                                        ) &&
                                        expand(row)
                                    "
                                    @keydown.enter.self.prevent="
                                        (isChangesets ||
                                            isNodes ||
                                            view === 'areas') &&
                                        expand(row)
                                    "
                                    @keydown.space.self.prevent="
                                        (isChangesets ||
                                            isNodes ||
                                            view === 'areas') &&
                                        expand(row)
                                    "
                                >
                                    <slot :row="row" name="row" />
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
                                            <div
                                                v-if="$slots['detail-top']"
                                                class="min-w-0 xl:col-span-2"
                                            >
                                                <slot
                                                    :row="row"
                                                    name="detail-top"
                                                />
                                            </div>
                                            <div class="min-w-0">
                                                <slot
                                                    :row="row"
                                                    name="detail"
                                                />
                                            </div>
                                            <div>
                                                <ModerationMap
                                                    :bounds="row.bounds"
                                                    :geometry="row.geometry"
                                                    :nodes="
                                                        isNodes
                                                            ? [row]
                                                            : moderationDetailNodes(
                                                                  view,
                                                                  details[
                                                                      rowKey(
                                                                          row,
                                                                      )
                                                                  ],
                                                              )
                                                    "
                                                    @node="
                                                        selectedNodes[
                                                            rowKey(row)
                                                        ] = $event
                                                    "
                                                />
                                                <p
                                                    class="mt-2 text-xs text-daf-text-tertiary"
                                                >
                                                    {{
                                                        isNodes
                                                            ? `${locationLabel(row)}${row.visible ? '' : ' · Last known location before deletion'}`
                                                            : view === 'areas'
                                                              ? row.name
                                                              : changesetNodes(
                                                                      details[
                                                                          rowKey(
                                                                              row,
                                                                          )
                                                                      ],
                                                                  ).some(
                                                                      (node) =>
                                                                          node.location_is_historical,
                                                                  )
                                                                ? 'Deleted nodes are shown at their last known location'
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
                                            source.state === 'refreshing'
                                                ? 'Waiting for summaries'
                                                : source.state ===
                                                        'unavailable' &&
                                                    ![
                                                        'areas',
                                                        'audit',
                                                    ].includes(view)
                                                  ? 'Waiting for OpenStreetMap data'
                                                  : view === 'areas'
                                                    ? 'No areas yet'
                                                    : view === 'audit'
                                                      ? 'No moderation activity yet'
                                                      : `No ${view === 'profile' ? 'changesets' : view === 'flagged' ? 'flagged nodes' : view === 'nodes' ? 'ALPR nodes' : view} match`
                                        }}
                                    </h2>
                                    <p
                                        class="mb-5 mt-2 text-daf-body text-daf-text-secondary"
                                    >
                                        {{
                                            source.state === 'refreshing'
                                                ? 'Summary calculation is in progress. Try again shortly.'
                                                : source.state ===
                                                        'unavailable' &&
                                                    ![
                                                        'areas',
                                                        'audit',
                                                    ].includes(view)
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
