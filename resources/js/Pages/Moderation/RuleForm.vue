<script setup>
import DafSwitch from '@/Components/Daf/DafSwitch.vue';
import NodeLink from '@/Components/Moderation/NodeLink.vue';
import ModerationLayout from '@/Layouts/ModerationLayout.vue';
import {
    duplicateTagConfiguration,
    duplicateTagText,
    roadClasses,
    ruleDefaults,
    ruleFormValues,
    ruleLines,
    ruleSummary,
    ruleTypes,
    validRule,
} from '@/moderationRules';
import { severityClass } from '@/moderationFlags';
import { useModerationTime } from '@/useModerationTime';
import { Head, Link, router, useForm } from '@inertiajs/vue3';
import { computed, inject, ref, watch } from 'vue';

const props = defineProps({
    rule: Object,
    areas: { type: Array, default: () => [] },
    versions: { type: Array, default: () => [] },
    recentMatches: { type: Array, default: () => [] },
});
const { absoluteTime, relativeTime } = useModerationTime();
const route = inject('route');
const form = useForm(ruleFormValues(props.rule));
const type = computed(() => ruleTypes.find((type) => type.value === form.type));
const summary = computed(() => ruleSummary(form));
const valid = computed(() => validRule(form, invalidMode.value));
const canSave = computed(
    () => valid.value && (!props.rule || form.isDirty) && !form.processing,
);
const footLabel = computed(() =>
    !form.name.trim()
        ? 'Give the rule a name to save'
        : !valid.value
          ? 'Finish the condition to save'
          : !props.rule
            ? 'Ready to save'
            : form.isDirty
              ? 'Unsaved changes'
              : 'No changes',
);
const requiredTags = ref((form.settings.keys || []).join('\n'));
const duplicateTags = ref(
    form.type === 'duplicate_nodes' ? duplicateTagText(form) : '',
);
const acceptedValues = ref((form.settings.allowed_values || []).join('\n'));
const whenTagged = ref(
    form.conditions
        .filter((condition) => condition.operator === 'equals')
        .map((condition) => `${condition.key}=${condition.value}`)
        .join('\n') || 'surveillance:type=ALPR',
);
const invalidMode = ref(
    form.settings.min != null || form.settings.max != null
        ? 'range'
        : form.settings.allowed_values?.length
          ? 'list'
          : form.settings.format
            ? 'format'
            : 'list',
);
const preview = ref(null);
const previewError = ref('');
const previewBusy = ref(false);
const confirmDelete = ref(false);
const deleteBusy = ref(false);
const deleteError = ref('');
const availableRoads = computed(() => [
    ...new Set([...roadClasses, ...(form.settings.road_types || [])]),
]);
const creator = computed(() => props.versions.at(-1)?.user?.name);
watch(requiredTags, (value) => {
    if (form.type === 'missing_tags') form.settings.keys = ruleLines(value);
});
watch(acceptedValues, (value) => {
    if (form.type === 'invalid_tag')
        form.settings.allowed_values = ruleLines(value);
});
watch(duplicateTags, (value) => {
    if (form.type !== 'duplicate_nodes') return;
    const configuration = duplicateTagConfiguration(value, form);
    form.settings.match_tags = configuration.match_tags;
    form.conditions = configuration.conditions;
});
watch(whenTagged, (value, previous) => {
    if (form.type !== 'missing_tags') return;
    const conditions = ruleLines(value).map((tag) => {
        const equal = tag.indexOf('=');
        return equal < 0
            ? { key: tag, operator: 'exists', value: '' }
            : {
                  key: tag.slice(0, equal).trim(),
                  operator: 'equals',
                  value: tag.slice(equal + 1).trim(),
              };
    });
    const previousExists = ruleLines(previous).filter(
        (tag) => !tag.includes('='),
    );
    form.conditions = [
        ...form.conditions.filter(
            (condition) =>
                condition.operator !== 'equals' &&
                !previousExists.includes(condition.key),
        ),
        ...conditions,
    ];
});
watch(
    () => form.type,
    (type) => {
        const defaults = ruleDefaults(type);
        form.settings = defaults.settings;
        form.conditions = defaults.conditions;
        requiredTags.value = (form.settings.keys || []).join('\n');
        duplicateTags.value =
            type === 'duplicate_nodes' ? duplicateTagText(form) : '';
        acceptedValues.value = '';
        whenTagged.value = 'surveillance:type=ALPR';
        invalidMode.value = 'list';
    },
);
watch(
    () => props.rule?.version,
    (version) => {
        if (version) {
            form.version = version;
            form.defaults(form.data());
        }
    },
);
watch(
    () => form.data(),
    () => {
        preview.value = null;
    },
    { deep: true },
);
function setMode(mode) {
    invalidMode.value = mode;
    form.settings.allowed_values = [];
    acceptedValues.value = '';
    form.settings.min = null;
    form.settings.max = null;
    form.settings.format =
        mode === 'range' ? 'integer' : mode === 'format' ? 'direction' : null;
}
function toggle(key, value) {
    form[key] = form[key].includes(value)
        ? form[key].filter((item) => item !== value)
        : [...form[key], value];
}
function toggleRoad(value) {
    form.settings.road_types = form.settings.road_types.includes(value)
        ? form.settings.road_types.filter((item) => item !== value)
        : [...form.settings.road_types, value];
}
function save() {
    if (!canSave.value) return;
    if (props.rule)
        form.put(route('moderation.rules.update', props.rule.id), {
            preserveScroll: true,
        });
    else form.post(route('moderation.rules.store'));
}
function deleteRule() {
    deleteBusy.value = true;
    deleteError.value = '';
    router.delete(route('moderation.rules.destroy', props.rule.id), {
        data: { version: props.rule.version },
        onError: (errors) => {
            deleteError.value = Object.values(errors).join(' ');
        },
        onFinish: () => {
            deleteBusy.value = false;
        },
    });
}
async function runPreview() {
    previewBusy.value = true;
    previewError.value = '';
    preview.value = null;
    try {
        const token = decodeURIComponent(
            document.cookie
                .split('; ')
                .find((cookie) => cookie.startsWith('XSRF-TOKEN='))
                ?.slice(11) || '',
        );
        const response = await fetch(route('moderation.rules.preview'), {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                'X-XSRF-TOKEN': token,
            },
            body: JSON.stringify(form.data()),
        });
        const result = await response.json();
        if (!response.ok)
            throw new Error(
                Object.values(result.errors || {})
                    .flat()
                    .join(' ') ||
                    result.message ||
                    'Preview is unavailable.',
            );
        preview.value = result;
    } catch (error) {
        previewError.value = error.message;
    } finally {
        previewBusy.value = false;
    }
}
</script>
<template>
    <ModerationLayout navigation view="rules">
        <Head :title="rule ? rule.name : 'New rule'" />
        <section class="px-4 pt-5 sm:px-6">
            <Link
                :href="route('moderation.rules.index')"
                class="text-daf-body-sm font-semibold text-daf-text-secondary hover:text-daf-text-brand"
                >← Rules</Link
            >
            <div class="mt-4 flex flex-wrap items-center gap-2.5">
                <h1
                    class="mr-1 font-display text-daf-h2 font-bold tracking-[var(--ls-display)]"
                >
                    {{ rule ? rule.name : 'New rule' }}
                </h1>
                <span
                    class="rounded-dafXs border border-daf-border px-2 py-[3px] text-[11px] font-semibold text-daf-text-secondary"
                    >{{ type.name }}</span
                >
                <span
                    :class="severityClass(form.severity)"
                    class="mod-severity"
                    >{{ form.severity }}</span
                >
                <span
                    :class="
                        form.enabled
                            ? 'bg-[var(--brand-soft)] text-daf-text-brand'
                            : 'bg-daf-surface-alt text-daf-text-tertiary'
                    "
                    class="rounded-dafPill px-[9px] py-[3px] font-mono text-[11px] font-bold"
                    >{{ form.enabled ? 'Enabled' : 'Paused' }}</span
                >
            </div>
            <form @submit.prevent="save">
                <div class="mod-rule-editor mt-[18px]">
                    <div class="min-w-0 space-y-4">
                        <section class="mod-rule-card">
                            <h2 class="mod-rule-heading">Basics</h2>
                            <label class="mod-rule-label" for="rule-name"
                                >Name</label
                            >
                            <input
                                id="rule-name"
                                v-model="form.name"
                                class="mod-dialog-input"
                                maxlength="120"
                                placeholder="e.g. Missing direction"
                                required
                            />
                            <div class="mt-4">
                                <div class="mod-rule-label">Type</div>
                                <div
                                    v-if="!rule"
                                    class="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2"
                                >
                                    <button
                                        v-for="option in ruleTypes"
                                        :key="option.value"
                                        :aria-pressed="
                                            form.type === option.value
                                        "
                                        :class="
                                            form.type === option.value
                                                ? 'border-daf-brand bg-[var(--brand-soft)]'
                                                : 'border-daf-border bg-daf-surface-card'
                                        "
                                        class="flex flex-col items-start gap-[3px] rounded-dafMd border px-3 py-[11px] text-left hover:border-daf-brand"
                                        type="button"
                                        @click="form.type = option.value"
                                    >
                                        <span
                                            :class="{
                                                'text-daf-text-brand':
                                                    form.type === option.value,
                                            }"
                                            class="text-[13px] font-bold"
                                            >{{ option.name }}</span
                                        ><span
                                            class="text-xs leading-[1.4] text-daf-text-secondary"
                                            >{{ option.description }}</span
                                        >
                                    </button>
                                </div>
                                <div
                                    v-else
                                    class="flex flex-wrap items-center gap-3 rounded-dafMd border border-daf-border bg-[color-mix(in_oklab,var(--text-primary)_3%,var(--surface-card))] px-3 py-[11px]"
                                >
                                    <div class="min-w-0 flex-[1_1_200px]">
                                        <div class="text-[13px] font-bold">
                                            {{ type.name }}
                                        </div>
                                        <p
                                            class="mt-0.5 text-xs text-daf-text-secondary"
                                        >
                                            {{ type.description }}
                                        </p>
                                    </div>
                                    <span
                                        class="text-[11px] text-daf-text-tertiary"
                                        >Fixed after creation — make a new rule
                                        to change it.</span
                                    >
                                </div>
                            </div>
                            <div class="mt-4">
                                <div class="mod-rule-label">Severity</div>
                                <div class="flex flex-wrap gap-1.5">
                                    <button
                                        v-for="severity in [
                                            'High',
                                            'Medium',
                                            'Low',
                                        ]"
                                        :key="severity"
                                        :aria-pressed="
                                            form.severity === severity
                                        "
                                        :class="[
                                            severityClass(severity),
                                            {
                                                'mod-rule-severity-selected':
                                                    form.severity === severity,
                                            },
                                        ]"
                                        class="mod-rule-severity"
                                        type="button"
                                        @click="form.severity = severity"
                                    >
                                        <span
                                            class="mod-severity-dot !size-2"
                                        />{{ severity }}
                                    </button>
                                </div>
                            </div>
                        </section>
                        <section class="mod-rule-card">
                            <h2 class="mod-rule-heading">Condition</h2>
                            <template v-if="form.type === 'duplicate_nodes'">
                                <label class="mod-rule-label" for="rule-radius"
                                    >Another node within · m</label
                                ><input
                                    id="rule-radius"
                                    v-model.number="
                                        form.settings.distance_meters
                                    "
                                    class="mod-dialog-input max-w-[300px] font-mono"
                                    max="5000"
                                    min="0.01"
                                    step="any"
                                    type="number"
                                />
                                <label
                                    class="mod-rule-label mt-3.5"
                                    for="rule-duplicate-tags"
                                    >Sharing all of these tags · one per
                                    line</label
                                ><textarea
                                    id="rule-duplicate-tags"
                                    v-model="duplicateTags"
                                    class="mod-rule-textarea"
                                    placeholder="man_made=surveillance"
                                />
                            </template>
                            <template v-if="form.type === 'missing_tags'">
                                <label
                                    class="mod-rule-label"
                                    for="rule-required-tags"
                                    >Required tags · one per line</label
                                ><textarea
                                    id="rule-required-tags"
                                    v-model="requiredTags"
                                    class="mod-rule-textarea"
                                    placeholder="operator"
                                />
                                <label
                                    class="mod-rule-label mt-3.5"
                                    for="rule-tagged"
                                    >On nodes tagged</label
                                ><textarea
                                    id="rule-tagged"
                                    v-model="whenTagged"
                                    class="mod-rule-textarea"
                                    placeholder="surveillance:type=ALPR"
                                />
                                <p
                                    class="mt-3 max-w-[60ch] text-xs leading-[1.5] text-daf-text-secondary"
                                >
                                    Trips when any listed tag is absent. Use one
                                    rule per tag if they need different
                                    severities.
                                </p>
                            </template>
                            <template v-if="form.type === 'road_distance'">
                                <label
                                    class="mod-rule-label"
                                    for="rule-distance"
                                    >Farther than · m from the nearest
                                    road</label
                                ><input
                                    id="rule-distance"
                                    v-model.number="
                                        form.settings.distance_meters
                                    "
                                    class="mod-dialog-input max-w-[300px] font-mono"
                                    max="5000"
                                    min="0.01"
                                    step="any"
                                    type="number"
                                />
                                <div class="mod-rule-label mt-3.5">
                                    Roads that count
                                </div>
                                <div class="flex flex-wrap gap-1.5">
                                    <button
                                        v-for="road in availableRoads"
                                        :key="road"
                                        :aria-pressed="
                                            form.settings.road_types.includes(
                                                road,
                                            )
                                        "
                                        :class="{
                                            'mod-chip-active':
                                                form.settings.road_types.includes(
                                                    road,
                                                ),
                                        }"
                                        class="mod-chip font-mono"
                                        type="button"
                                        @click="toggleRoad(road)"
                                    >
                                        {{ road }}
                                    </button>
                                </div>
                                <p
                                    class="mt-3 max-w-[60ch] text-xs leading-[1.5] text-daf-text-secondary"
                                >
                                    Measured to the centreline of the nearest
                                    way with one of these highway values. Leave
                                    service off to ignore parking lots and
                                    driveways.
                                </p>
                            </template>
                            <template v-if="form.type === 'invalid_tag'">
                                <label class="mod-rule-label" for="rule-tag-key"
                                    >Tag</label
                                ><input
                                    id="rule-tag-key"
                                    v-model="form.settings.key"
                                    class="mod-dialog-input max-w-[300px] font-mono"
                                    placeholder="camera:type"
                                />
                                <div class="mod-rule-label mt-3.5">
                                    Trip when the value is
                                </div>
                                <div class="flex flex-wrap gap-1.5">
                                    <button
                                        v-for="mode in [
                                            {
                                                value: 'list',
                                                label: 'Not one of the accepted values',
                                            },
                                            {
                                                value: 'range',
                                                label: 'Not a whole number in a range',
                                            },
                                            {
                                                value: 'format',
                                                label: 'Invalid format',
                                            },
                                        ]"
                                        :key="mode.value"
                                        :aria-pressed="
                                            invalidMode === mode.value
                                        "
                                        :class="{
                                            'mod-chip-active':
                                                invalidMode === mode.value,
                                        }"
                                        class="mod-chip"
                                        type="button"
                                        @click="setMode(mode.value)"
                                    >
                                        {{ mode.label }}
                                    </button>
                                </div>
                                <div
                                    v-if="invalidMode === 'list'"
                                    class="mt-3.5"
                                >
                                    <label
                                        class="mod-rule-label"
                                        for="rule-values"
                                        >Accepted values · one per line</label
                                    ><textarea
                                        id="rule-values"
                                        v-model="acceptedValues"
                                        class="mod-rule-textarea"
                                        placeholder="fixed"
                                    />
                                </div>
                                <div
                                    v-if="invalidMode === 'range'"
                                    class="mt-3.5 grid max-w-[380px] grid-cols-2 gap-4"
                                >
                                    <label class="mod-field-label"
                                        >From<input
                                            v-model.number="form.settings.min"
                                            class="mod-dialog-input font-mono"
                                            placeholder="0"
                                            step="any"
                                            type="number" /></label
                                    ><label class="mod-field-label"
                                        >To<input
                                            v-model.number="form.settings.max"
                                            class="mod-dialog-input font-mono"
                                            placeholder="359"
                                            step="any"
                                            type="number"
                                    /></label>
                                </div>
                                <label
                                    v-if="invalidMode === 'format'"
                                    class="mod-field-label mt-3.5"
                                    >Format<select
                                        v-model="form.settings.format"
                                        class="mod-dialog-input"
                                    >
                                        <option value="integer">
                                            Whole number
                                        </option>
                                        <option value="decimal">Number</option>
                                        <option value="direction">
                                            Compass direction or 0–360
                                        </option>
                                        <option value="url">
                                            HTTP / HTTPS URL
                                        </option>
                                    </select></label
                                >
                            </template>
                        </section>
                        <section class="mod-rule-card">
                            <h2 class="mod-rule-heading">Scope</h2>
                            <div class="mod-rule-label">Areas</div>
                            <div class="flex flex-wrap gap-1.5">
                                <button
                                    :aria-pressed="!form.area_ids.length"
                                    :class="{
                                        'mod-chip-active':
                                            !form.area_ids.length,
                                    }"
                                    class="mod-chip"
                                    type="button"
                                    @click="form.area_ids = []"
                                >
                                    All areas</button
                                ><button
                                    v-for="area in areas"
                                    :key="area.id"
                                    :aria-pressed="
                                        form.area_ids.includes(area.id)
                                    "
                                    :class="{
                                        'mod-chip-active':
                                            form.area_ids.includes(area.id),
                                    }"
                                    class="mod-chip"
                                    type="button"
                                    @click="toggle('area_ids', area.id)"
                                >
                                    {{ area.name }}
                                </button>
                            </div>
                            <div
                                class="mt-2.5 flex flex-wrap items-baseline gap-1.5 text-xs text-daf-text-secondary"
                            >
                                <span>{{
                                    form.area_ids.length
                                        ? 'Only nodes inside the selected areas trip this rule.'
                                        : 'Runs inside tracked areas. Pick areas to narrow it.'
                                }}</span
                                ><Link
                                    :href="route('moderation.areas.index')"
                                    class="mod-link"
                                    >Manage areas</Link
                                >
                            </div>
                        </section>
                        <section class="mod-rule-card !pb-1.5">
                            <h2 class="mod-rule-heading !mb-1.5">
                                When it fires
                            </h2>
                            <div class="flex items-center gap-3.5 pb-2 pt-3">
                                <div class="min-w-0 flex-1">
                                    <div class="text-[13px] font-semibold">
                                        Flag the node
                                    </div>
                                    <p
                                        class="mt-0.5 text-xs text-daf-text-secondary"
                                    >
                                        Always on. The node lands in Flagged
                                        with this rule's severity.
                                    </p>
                                </div>
                                <DafSwitch
                                    :model-value="true"
                                    aria-label="Flag the node"
                                    disabled
                                    size="compact"
                                />
                            </div>
                        </section>
                        <details class="mod-rule-card">
                            <summary
                                class="cursor-pointer text-[13px] font-semibold"
                            >
                                Additional settings
                            </summary>
                            <label class="mod-field-label mt-4"
                                >Description<textarea
                                    v-model="form.description"
                                    class="mod-rule-textarea !font-ui"
                                    maxlength="2000"
                                />
                            </label>
                            <label
                                v-if="form.type === 'missing_tags'"
                                class="mt-4 flex items-center gap-2 text-xs"
                                ><input
                                    v-model="form.settings.blank_is_missing"
                                    type="checkbox"
                                />Treat blank values as missing</label
                            >
                            <div
                                v-for="group in ['conditions', 'exceptions']"
                                :key="group"
                                class="mt-4"
                            >
                                <h3 class="mod-rule-label">
                                    {{
                                        group === 'conditions'
                                            ? 'Apply when all match'
                                            : 'Except when any match'
                                    }}
                                </h3>
                                <div
                                    v-for="(condition, index) in form[group]"
                                    :key="index"
                                    class="mt-2 flex flex-wrap gap-2"
                                >
                                    <input
                                        v-model="condition.key"
                                        aria-label="Tag key"
                                        class="mod-dialog-input !w-auto min-w-0 flex-1"
                                        placeholder="Tag key"
                                    /><select
                                        v-model="condition.operator"
                                        aria-label="Comparison"
                                        class="mod-dialog-input !w-auto"
                                    >
                                        <option value="exists">Exists</option>
                                        <option value="missing">Missing</option>
                                        <option value="equals">Equals</option>
                                        <option value="not_equals">
                                            Does not equal
                                        </option></select
                                    ><input
                                        v-if="
                                            ['equals', 'not_equals'].includes(
                                                condition.operator,
                                            )
                                        "
                                        v-model="condition.value"
                                        aria-label="Tag value"
                                        class="mod-dialog-input !w-auto min-w-0 flex-1"
                                        placeholder="Value"
                                    /><button
                                        aria-label="Remove condition"
                                        class="mod-link"
                                        type="button"
                                        @click="form[group].splice(index, 1)"
                                    >
                                        Remove
                                    </button>
                                </div>
                                <button
                                    class="mod-link mt-3"
                                    type="button"
                                    @click="
                                        form[group].push({
                                            key: '',
                                            operator: 'exists',
                                            value: '',
                                        })
                                    "
                                >
                                    + Add
                                    {{
                                        group === 'conditions'
                                            ? 'condition'
                                            : 'exception'
                                    }}
                                </button>
                            </div>
                        </details>
                        <div
                            v-if="Object.keys(form.errors).length"
                            class="mod-card p-4 text-sm text-[var(--alert-600)]"
                            role="alert"
                        >
                            <p v-for="(error, key) in form.errors" :key="key">
                                {{ error }}
                            </p>
                        </div>
                    </div>
                    <aside class="mod-rule-side space-y-4">
                        <section class="mod-rule-card">
                            <h2 class="mod-label mb-2">In plain English</h2>
                            <p
                                class="font-display text-base font-semibold leading-[1.4] tracking-[var(--ls-display)]"
                            >
                                {{ summary }}
                            </p>
                            <div
                                class="mt-4 flex items-baseline gap-2 border-t border-daf-border pt-3.5"
                            >
                                <span
                                    class="font-mono text-[22px] font-bold leading-none"
                                    >{{
                                        rule ? (rule.flags_30d ?? '—') : '—'
                                    }}</span
                                ><span
                                    class="text-xs text-daf-text-secondary"
                                    >{{
                                        rule
                                            ? 'recorded flags in the last 30 days'
                                            : 'No history yet — counting starts when you save.'
                                    }}</span
                                >
                            </div>
                            <template v-if="recentMatches.length"
                                ><h3 class="mod-label mb-1 mt-4">
                                    Recent matches
                                </h3>
                                <NodeLink
                                    v-for="match in recentMatches"
                                    :key="match.id"
                                    :filters="{ rule: rule.id }"
                                    :node-id="match.node_id"
                                    class="flex items-center gap-2.5 border-t border-daf-border py-2 hover:text-daf-text-brand"
                                    from="rules"
                                    ><span
                                        class="font-mono text-[12.5px] font-semibold"
                                        >{{ match.node_id }}</span
                                    ><span
                                        class="min-w-0 flex-1 truncate text-xs text-daf-text-secondary"
                                        >{{ match.status }}</span
                                    ><time
                                        :datetime="match.created_at"
                                        :title="absoluteTime(match.created_at)"
                                        class="font-mono text-[11px] text-daf-text-tertiary"
                                        >{{
                                            relativeTime(match.created_at)
                                        }}</time
                                    ></NodeLink
                                ></template
                            >
                        </section>
                        <section class="mod-rule-card !py-4">
                            <div class="flex items-center gap-3.5">
                                <div class="min-w-0 flex-1">
                                    <div class="text-[13px] font-semibold">
                                        Enabled
                                    </div>
                                    <p
                                        class="mt-0.5 text-xs text-daf-text-secondary"
                                    >
                                        Paused rules keep their history but stop
                                        flagging.
                                    </p>
                                </div>
                                <DafSwitch
                                    v-model="form.enabled"
                                    aria-label="Enabled"
                                    size="compact"
                                />
                            </div>
                            <div
                                class="mt-3 border-t border-daf-border pt-3 font-mono text-[11px] text-daf-text-tertiary"
                            >
                                {{
                                    rule
                                        ? `Created by ${creator || 'unknown'} · updated ${absoluteTime(rule.updated_at)}`
                                        : 'Saved under your account as the creator.'
                                }}
                            </div>
                        </section>
                        <div v-if="rule" class="px-1">
                            <button
                                v-if="!confirmDelete"
                                class="text-xs font-semibold text-[var(--alert-600)] hover:underline"
                                type="button"
                                @click="confirmDelete = true"
                            >
                                Delete this rule
                            </button>
                            <div
                                v-else
                                class="rounded-dafMd border border-[color-mix(in_oklab,var(--alert-500)_40%,transparent)] bg-[color-mix(in_oklab,var(--alert-500)_6%,var(--surface-card))] px-3.5 py-3"
                            >
                                <div class="text-[13px] font-semibold">
                                    Delete “{{ rule.name }}”?
                                </div>
                                <p
                                    class="mt-[3px] text-xs text-daf-text-secondary"
                                >
                                    Existing flags stay. Nothing new trips it.
                                </p>
                                <p
                                    v-if="deleteError"
                                    class="mt-2 text-xs text-[var(--alert-600)]"
                                    role="alert"
                                >
                                    {{ deleteError }}
                                </p>
                                <div class="mt-2.5 flex gap-2">
                                    <button
                                        :disabled="deleteBusy"
                                        class="h-8 rounded-dafPill bg-[var(--alert-500)] px-3.5 text-xs font-bold text-white disabled:opacity-50"
                                        type="button"
                                        @click="deleteRule"
                                    >
                                        Delete</button
                                    ><button
                                        :disabled="deleteBusy"
                                        class="mod-button !h-8 !px-3.5"
                                        type="button"
                                        @click="confirmDelete = false"
                                    >
                                        Keep
                                    </button>
                                </div>
                            </div>
                        </div>
                        <details class="mod-rule-card">
                            <summary
                                class="cursor-pointer text-[13px] font-semibold"
                            >
                                Preview
                            </summary>
                            <p class="mt-3 text-xs text-daf-text-secondary">
                                Check up to 25 current nodes. Preview does not
                                create flags.
                            </p>
                            <button
                                :disabled="previewBusy || !valid"
                                class="mod-button mt-4"
                                type="button"
                                @click="runPreview"
                            >
                                {{ previewBusy ? 'Checking…' : 'Preview rule' }}
                            </button>
                            <p
                                v-if="previewError"
                                class="mt-3 text-xs text-[var(--alert-600)]"
                                role="alert"
                            >
                                {{ previewError }}
                            </p>
                            <div v-if="preview" class="mt-4 space-y-3 text-xs">
                                <p>
                                    {{ preview.results.length }} nodes checked{{
                                        preview.truncated
                                            ? ' · sample limited to 25'
                                            : ''
                                    }}
                                </p>
                                <details
                                    v-for="result in preview.results"
                                    :key="result.node_id"
                                    class="border-t border-daf-border pt-2"
                                >
                                    <summary
                                        class="cursor-pointer font-semibold"
                                    >
                                        <NodeLink
                                            :node-id="result.node_id"
                                            class="text-daf-text-brand hover:underline"
                                            @click.stop
                                            >Node {{ result.node_id }}</NodeLink
                                        >
                                        ·
                                        {{ result.state.replaceAll('_', ' ') }}
                                    </summary>
                                    <p v-if="result.error" class="mt-2">
                                        {{ result.error }}
                                    </p>
                                    <pre
                                        class="mt-2 whitespace-pre-wrap break-all"
                                        >{{
                                            JSON.stringify(
                                                result.matches,
                                                null,
                                                2,
                                            )
                                        }}</pre>
                                </details>
                            </div>
                        </details>
                        <details v-if="versions.length" class="mod-rule-card">
                            <summary
                                class="cursor-pointer text-[13px] font-semibold"
                            >
                                Version history
                            </summary>
                            <details
                                v-for="version in versions"
                                :key="version.id"
                                class="mt-3 text-xs"
                            >
                                <summary class="cursor-pointer font-semibold">
                                    Version {{ version.version }} ·
                                    {{ absoluteTime(version.created_at) }}
                                </summary>
                                <pre
                                    class="mt-2 whitespace-pre-wrap break-all text-daf-text-secondary"
                                    >{{
                                        JSON.stringify(
                                            version.configuration,
                                            null,
                                            2,
                                        )
                                    }}</pre>
                            </details>
                        </details>
                    </aside>
                </div>
                <footer
                    class="sticky bottom-0 z-10 -mx-4 mt-7 flex flex-wrap items-center gap-2.5 border-t border-daf-border bg-[color-mix(in_oklab,var(--surface-page)_92%,transparent)] px-4 py-3 backdrop-blur-xl sm:-mx-6 sm:px-6"
                >
                    <span
                        :class="
                            !valid && form.isDirty
                                ? 'text-[var(--amber-600)]'
                                : 'text-daf-text-tertiary'
                        "
                        class="font-mono text-daf-caption"
                        >{{ footLabel }}</span
                    >
                    <div class="ml-auto flex gap-2">
                        <Link
                            :href="route('moderation.rules.index')"
                            class="mod-button !h-[38px]"
                            >Cancel</Link
                        ><button
                            :disabled="!canSave"
                            class="mod-primary-button !h-[38px]"
                        >
                            {{ rule ? 'Save changes' : 'Create rule' }}
                        </button>
                    </div>
                </footer>
            </form>
        </section>
    </ModerationLayout>
</template>
