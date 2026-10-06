<script setup>
import DafIcon from '@/Components/Daf/DafIcon.vue';
import DafSwitch from '@/Components/Daf/DafSwitch.vue';
import ModerationLayout from '@/Layouts/ModerationLayout.vue';
import { ruleGroups, ruleSummary, ruleTypes } from '@/moderationRules';
import { severityClass } from '@/moderationFlags';
import { useModerationTime } from '@/useModerationTime';
import { Head, Link, router } from '@inertiajs/vue3';
import { computed, inject, ref } from 'vue';

const props = defineProps({
    rules: Array,
    processes: Array,
    areas: { type: Array, default: () => [] },
    filters: { type: Object, default: () => ({}) },
});
const { absoluteTime } = useModerationTime();
const route = inject('route');
const pending = ref([]);
const errors = ref({});
const groups = computed(() => ruleGroups(props.rules, props.filters));
const filteredCount = computed(() =>
    groups.value.reduce((count, group) => count + group.rows.length, 0),
);
const enabledCount = computed(
    () => props.rules.filter((rule) => rule.enabled).length,
);
const filterActive = computed(() =>
    Object.values(props.filters).some((values) => values.length),
);
const filterGroups = [
    {
        key: 'types',
        name: 'Type',
        values: ruleTypes.map((type) => ({
            value: type.value,
            label: type.name,
        })),
    },
    {
        key: 'severities',
        name: 'Severity',
        values: ['High', 'Medium', 'Low'].map((value) => ({
            value,
            label: value,
        })),
    },
    {
        key: 'states',
        name: 'Status',
        values: ['Enabled', 'Paused'].map((value) => ({ value, label: value })),
    },
];
function apply(filters) {
    router.get(route('moderation.rules.index'), filters, {
        preserveState: true,
        preserveScroll: true,
        replace: true,
    });
}
function toggleFilter(key, value) {
    const selected = props.filters[key] || [];
    apply({
        ...props.filters,
        [key]: selected.includes(value)
            ? selected.filter((item) => item !== value)
            : [...selected, value],
    });
}
function scope(rule) {
    return rule.area_ids.length
        ? rule.area_ids
              .map(
                  (id) =>
                      props.areas.find((area) => area.id === id)?.name ||
                      `Area ${id}`,
              )
              .join(', ')
        : 'All areas';
}
function toggleRule(rule, enabled) {
    pending.value.push(rule.id);
    delete errors.value[rule.id];
    router.patch(
        route('moderation.rules.state', rule.id),
        { version: rule.version, enabled },
        {
            preserveScroll: true,
            onError: (messages) => {
                errors.value[rule.id] = Object.values(messages).join(' ');
            },
            onFinish: () => {
                pending.value = pending.value.filter((id) => id !== rule.id);
            },
        },
    );
}
</script>
<template>
    <ModerationLayout navigation view="rules">
        <Head title="Moderation rules" />
        <section class="px-4 pb-11 pt-[22px] sm:px-6">
            <header class="flex flex-wrap items-start gap-4">
                <div class="min-w-0 flex-[1_1_320px]">
                    <h1
                        class="font-display text-daf-h1 font-bold tracking-[var(--ls-display)]"
                    >
                        Rules
                    </h1>
                    <p
                        class="mt-1.5 max-w-[70ch] text-daf-body text-daf-text-secondary"
                    >
                        What trips a flag. Rules check current ALPR nodes inside
                        tracked areas; anything that breaks an enabled rule
                        lands in Flagged.
                    </p>
                </div>
                <Link
                    :href="route('moderation.rules.create')"
                    class="mod-primary-button !h-10 gap-[7px] !pl-3.5 !pr-[18px]"
                    ><DafIcon :size="16" name="plus" />New rule</Link
                >
            </header>
            <div
                class="mt-[18px] flex flex-wrap items-center gap-x-[18px] gap-y-2.5"
            >
                <div
                    v-for="group in filterGroups"
                    :key="group.key"
                    class="flex flex-wrap items-center gap-[5px]"
                >
                    <span class="mod-label mr-[3px]">{{ group.name }}</span>
                    <button
                        v-for="option in group.values"
                        :key="option.value"
                        :aria-pressed="
                            filters[group.key]?.includes(option.value) || false
                        "
                        :class="{
                            'mod-chip-active': filters[group.key]?.includes(
                                option.value,
                            ),
                        }"
                        class="mod-chip"
                        @click="toggleFilter(group.key, option.value)"
                    >
                        {{ option.label }}
                    </button>
                </div>
                <button v-if="filterActive" class="mod-chip" @click="apply({})">
                    Clear
                </button>
                <span
                    class="ml-auto whitespace-nowrap font-mono text-daf-caption text-daf-text-tertiary"
                    >{{
                        filterActive
                            ? `${filteredCount} of ${rules.length}`
                            : rules.length
                    }}
                    rules · {{ enabledCount }} enabled</span
                >
            </div>
            <div class="mod-card mt-3.5 overflow-x-auto">
                <table class="mod-table-rules w-full text-left">
                    <thead>
                        <tr class="border-b border-daf-border">
                            <th class="mod-label !px-4 py-3">Rule</th>
                            <th class="mod-label">Severity</th>
                            <th class="mod-label mod-rule-scope">Scope</th>
                            <th class="mod-label whitespace-nowrap text-right">
                                Flags · 30 d
                            </th>
                            <th class="mod-label">On</th>
                            <th><span class="sr-only">Edit</span></th>
                        </tr>
                    </thead>
                    <tbody v-for="group in groups" :key="group.value">
                        <tr
                            class="border-b border-daf-border bg-[color-mix(in_oklab,var(--text-primary)_3%,var(--surface-card))]"
                        >
                            <td class="!px-4 !pb-2 !pt-[11px]" colspan="6">
                                <div
                                    class="flex flex-wrap items-baseline gap-2.5"
                                >
                                    <span
                                        class="font-display text-[13px] font-bold"
                                        >{{ group.name }}</span
                                    ><span
                                        class="text-xs text-daf-text-secondary"
                                        >{{ group.description }}</span
                                    ><span
                                        class="ml-auto font-mono text-[11px] text-daf-text-tertiary"
                                        >{{ group.rows.length }}
                                        {{
                                            group.rows.length === 1
                                                ? 'rule'
                                                : 'rules'
                                        }}</span
                                    >
                                </div>
                            </td>
                        </tr>
                        <tr
                            v-for="rule in group.rows"
                            :key="rule.id"
                            class="border-b border-daf-border hover:bg-[color-mix(in_oklab,var(--brand)_4%,var(--surface-card))]"
                        >
                            <td class="!pl-4">
                                <Link
                                    :href="
                                        route('moderation.rules.edit', rule.id)
                                    "
                                    :class="{ 'opacity-50': !rule.enabled }"
                                    class="block truncate text-daf-body-sm font-bold hover:text-daf-text-brand"
                                    >{{ rule.name }}</Link
                                >
                                <p
                                    class="mt-0.5 text-xs leading-[1.45] text-daf-text-secondary"
                                >
                                    {{ ruleSummary(rule) }}
                                </p>
                                <p
                                    v-if="errors[rule.id]"
                                    class="mt-1 text-xs text-[var(--alert-600)]"
                                    role="alert"
                                >
                                    {{ errors[rule.id] }}
                                </p>
                            </td>
                            <td>
                                <span
                                    :class="severityClass(rule.severity)"
                                    class="mod-severity"
                                    >{{ rule.severity }}</span
                                >
                            </td>
                            <td class="mod-rule-scope">
                                <span
                                    :title="scope(rule)"
                                    class="block truncate text-xs text-daf-text-secondary"
                                    >{{ scope(rule) }}</span
                                >
                            </td>
                            <td
                                :class="{
                                    'text-daf-text-tertiary':
                                        !rule.enabled || !rule.flags_30d,
                                }"
                                class="text-right font-mono text-[13px] font-semibold"
                            >
                                {{
                                    rule.enabled ? (rule.flags_30d ?? '—') : '—'
                                }}
                            </td>
                            <td>
                                <DafSwitch
                                    :aria-label="`Enable ${rule.name}`"
                                    :disabled="pending.includes(rule.id)"
                                    :model-value="rule.enabled"
                                    size="compact"
                                    @update:model-value="
                                        toggleRule(rule, $event)
                                    "
                                />
                            </td>
                            <td class="!pr-4">
                                <Link
                                    :aria-label="`Edit ${rule.name}`"
                                    :href="
                                        route('moderation.rules.edit', rule.id)
                                    "
                                    class="mod-expand"
                                    title="Edit rule"
                                    ><DafIcon :size="16" name="chevron-right"
                                /></Link>
                            </td>
                        </tr>
                    </tbody>
                </table>
                <div v-if="!groups.length" class="px-6 py-[72px] text-center">
                    <h2 class="font-display text-daf-h3 font-semibold">
                        {{ rules.length ? 'No rules match' : 'No rules yet' }}
                    </h2>
                    <p class="mb-5 mt-2 text-daf-body text-daf-text-secondary">
                        {{
                            rules.length
                                ? 'Loosen the filters.'
                                : 'Add a rule to start checking nodes.'
                        }}
                    </p>
                    <button
                        v-if="filterActive"
                        class="mod-button"
                        @click="apply({})"
                    >
                        Clear filters
                    </button>
                </div>
            </div>
            <details class="mod-card mt-5 p-4">
                <summary class="cursor-pointer text-sm font-semibold">
                    Processing
                </summary>
                <div
                    v-for="process in processes"
                    :key="process.id"
                    class="mt-4 border-t border-daf-border pt-3 text-sm"
                >
                    <div class="flex flex-wrap justify-between gap-2">
                        <strong>{{ process.name }}</strong
                        ><span>{{ process.state }}</span>
                    </div>
                    <p class="mt-1 text-xs text-daf-text-secondary">
                        {{ process.pending_jobs }} of
                        {{ process.total_jobs }} jobs pending ·
                        {{ process.failed_jobs }} failed<br />Last success:
                        {{
                            process.last_success_at
                                ? absoluteTime(process.last_success_at)
                                : 'Not yet completed'
                        }}
                    </p>
                    <p
                        v-if="process.last_error"
                        class="mt-2 break-words text-xs text-[var(--alert-600)]"
                    >
                        {{ process.last_error }}
                    </p>
                </div>
                <p
                    v-if="!processes.length"
                    class="mt-4 text-sm text-daf-text-tertiary"
                >
                    Processing has not run yet.
                </p>
            </details>
        </section>
    </ModerationLayout>
</template>
