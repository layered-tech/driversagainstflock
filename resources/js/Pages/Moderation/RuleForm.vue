<script setup>
import { useModerationTime } from '@/useModerationTime';
import NodeLink from '@/Components/Moderation/NodeLink.vue';
import ModerationLayout from '@/Layouts/ModerationLayout.vue';
import { Head, Link, useForm } from '@inertiajs/vue3';
import { inject, ref, watch } from 'vue';

const { absoluteTime } = useModerationTime();
const props = defineProps({ rule: Object, areas: Array, versions: Array });
const route = inject('route');
const defaults = (type) =>
    ({
        missing_tags: { keys: ['operator'], blank_is_missing: true },
        invalid_tag: {
            key: 'direction',
            allowed_values: [],
            min: null,
            max: null,
            format: 'direction',
        },
        road_distance: {
            distance_meters: 50,
            road_types: ['primary', 'secondary', 'tertiary', 'residential'],
        },
        duplicate_nodes: { distance_meters: 10, match_tags: ['operator'] },
    })[type];
const form = useForm(
    props.rule
        ? {
              name: props.rule.name,
              description: props.rule.description || '',
              type: props.rule.type,
              severity: props.rule.severity,
              enabled: props.rule.enabled,
              version: props.rule.version,
              settings: JSON.parse(JSON.stringify(props.rule.settings)),
              conditions: JSON.parse(JSON.stringify(props.rule.conditions)),
              exceptions: JSON.parse(JSON.stringify(props.rule.exceptions)),
              area_ids: [...props.rule.area_ids],
          }
        : {
              name: '',
              description: '',
              type: 'missing_tags',
              severity: 'Medium',
              enabled: false,
              settings: defaults('missing_tags'),
              conditions: [],
              exceptions: [],
              area_ids: [],
          },
);
const preview = ref(null);
const previewError = ref('');
const previewBusy = ref(false);
watch(
    () => form.type,
    (type) => {
        form.settings = defaults(type);
        preview.value = null;
    },
);
watch(
    () => props.rule?.version,
    (version) => {
        if (version) form.version = version;
    },
);
const list = (value) => [
    ...new Set(
        value
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean),
    ),
];
function save() {
    if (props.rule)
        form.put(route('moderation.rules.update', props.rule.id), {
            preserveScroll: true,
        });
    else form.post(route('moderation.rules.store'));
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
        <Head :title="rule ? `Edit ${rule.name}` : 'Create rule'" />
        <section class="max-w-6xl space-y-5 p-5 sm:p-6">
            <Link :href="route('moderation.rules.index')" class="mod-link"
                >← Rules</Link
            >
            <h1 class="font-display text-daf-h2 font-bold">
                {{ rule ? 'Edit rule' : 'Create rule' }}
            </h1>
            <form
                class="grid items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(240px,1fr)]"
                @submit.prevent="save"
            >
                <div class="space-y-5">
                    <article class="mod-card space-y-4 p-5">
                        <label class="block text-sm font-semibold"
                            >Name<input
                                v-model="form.name"
                                class="mod-input mt-1 w-full"
                                maxlength="120"
                                required
                        /></label>
                        <label class="block text-sm font-semibold"
                            >Description<textarea
                                v-model="form.description"
                                class="mod-input mt-1 !h-auto w-full !rounded-dafMd !py-2"
                                maxlength="2000"
                                rows="2"
                            />
                        </label>
                        <div class="grid gap-4 sm:grid-cols-2">
                            <label class="block text-sm font-semibold"
                                >Check<select
                                    v-model="form.type"
                                    class="mod-input mt-1 w-full"
                                >
                                    <option value="missing_tags">
                                        Missing tags
                                    </option>
                                    <option value="invalid_tag">
                                        Invalid tags
                                    </option>
                                    <option value="road_distance">
                                        Distance from road
                                    </option>
                                    <option value="duplicate_nodes">
                                        Duplicate nodes
                                    </option>
                                </select></label
                            ><label class="block text-sm font-semibold"
                                >Severity<select
                                    v-model="form.severity"
                                    class="mod-input mt-1 w-full"
                                >
                                    <option>Low</option>
                                    <option>Medium</option>
                                    <option>High</option>
                                </select></label
                            >
                        </div>
                        <template v-if="form.type === 'missing_tags'"
                            ><label class="block text-sm font-semibold"
                                >Required tags, separated by commas<input
                                    :value="form.settings.keys.join(', ')"
                                    class="mod-input mt-1 w-full"
                                    @change="
                                        form.settings.keys = list(
                                            $event.target.value,
                                        )
                                    " /></label
                            ><label class="flex items-center gap-2 text-sm"
                                ><input
                                    v-model="form.settings.blank_is_missing"
                                    type="checkbox"
                                />Treat blank values as missing</label
                            ></template
                        >
                        <template v-if="form.type === 'invalid_tag'"
                            ><label class="block text-sm font-semibold"
                                >Tag key<input
                                    v-model="form.settings.key"
                                    class="mod-input mt-1 w-full" /></label
                            ><label class="block text-sm font-semibold"
                                >Allowed values, separated by commas<input
                                    :value="
                                        form.settings.allowed_values?.join(', ')
                                    "
                                    class="mod-input mt-1 w-full"
                                    @change="
                                        form.settings.allowed_values = list(
                                            $event.target.value,
                                        )
                                    "
                            /></label>
                            <div class="grid gap-3 sm:grid-cols-2">
                                <label class="text-sm"
                                    >Minimum<input
                                        v-model.number="form.settings.min"
                                        class="mod-input mt-1 w-full"
                                        step="any"
                                        type="number" /></label
                                ><label class="text-sm"
                                    >Maximum<input
                                        v-model.number="form.settings.max"
                                        class="mod-input mt-1 w-full"
                                        step="any"
                                        type="number"
                                /></label>
                            </div>
                            <label class="block text-sm"
                                >Format<select
                                    v-model="form.settings.format"
                                    class="mod-input mt-1 w-full"
                                >
                                    <option :value="null">Any format</option>
                                    <option value="integer">Integer</option>
                                    <option value="decimal">Number</option>
                                    <option value="direction">
                                        Compass direction or 0–360
                                    </option>
                                    <option value="url">
                                        HTTP / HTTPS URL
                                    </option>
                                </select></label
                            >
                            <p class="text-xs text-daf-text-secondary">
                                All configured checks must pass. Use a
                                missing-tags rule to require this tag.
                            </p></template
                        >
                        <template
                            v-if="
                                ['road_distance', 'duplicate_nodes'].includes(
                                    form.type,
                                )
                            "
                            ><label class="block text-sm font-semibold"
                                >{{
                                    form.type === 'road_distance'
                                        ? 'Maximum distance from road'
                                        : 'Duplicate search radius'
                                }}
                                (meters)<input
                                    v-model.number="
                                        form.settings.distance_meters
                                    "
                                    class="mod-input mt-1 w-full"
                                    max="5000"
                                    min="0.01"
                                    step="any"
                                    type="number" /></label
                        ></template>
                        <label
                            v-if="form.type === 'road_distance'"
                            class="block text-sm font-semibold"
                            >Eligible highway types, separated by commas<input
                                :value="form.settings.road_types.join(', ')"
                                class="mod-input mt-1 w-full"
                                @change="
                                    form.settings.road_types = list(
                                        $event.target.value,
                                    )
                                "
                        /></label>
                        <label
                            v-if="form.type === 'duplicate_nodes'"
                            class="block text-sm font-semibold"
                            >Tags that must match, separated by commas<input
                                :value="form.settings.match_tags.join(', ')"
                                class="mod-input mt-1 w-full"
                                @change="
                                    form.settings.match_tags = list(
                                        $event.target.value,
                                    )
                                "
                            /><span
                                class="mt-1 block text-xs font-normal text-daf-text-secondary"
                                >Leave blank to compare all nearby ALPR
                                nodes.</span
                            ></label
                        >
                    </article>
                    <article class="mod-card space-y-5 p-5">
                        <div>
                            <h2 class="font-display text-lg font-bold">
                                Geographic scope
                            </h2>
                            <p class="mt-1 text-xs text-daf-text-secondary">
                                No areas selected means everywhere in tracked
                                coverage.
                            </p>
                            <label
                                v-for="area in areas"
                                :key="area.id"
                                class="mt-2 flex items-center gap-2 text-sm"
                                ><input
                                    v-model="form.area_ids"
                                    :value="area.id"
                                    type="checkbox"
                                />{{ area.name }}</label
                            >
                        </div>
                        <div
                            v-for="group in ['conditions', 'exceptions']"
                            :key="group"
                        >
                            <h2 class="font-display text-lg font-bold">
                                {{
                                    group === 'conditions'
                                        ? 'Apply when all match'
                                        : 'Except when any match'
                                }}
                            </h2>
                            <div
                                v-for="(condition, index) in form[group]"
                                :key="index"
                                class="mt-2 flex flex-wrap gap-2"
                            >
                                <input
                                    v-model="condition.key"
                                    aria-label="Tag key"
                                    class="mod-input min-w-0 flex-1"
                                    placeholder="Tag key"
                                /><select
                                    v-model="condition.operator"
                                    aria-label="Comparison"
                                    class="mod-input"
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
                                    class="mod-input min-w-0 flex-1"
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
                                class="mod-link mt-3 text-sm"
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
                    </article>
                    <div
                        v-if="Object.keys(form.errors).length"
                        class="mod-card p-4 text-sm text-[var(--alert-600)]"
                        role="alert"
                    >
                        <p v-for="(error, key) in form.errors" :key="key">
                            {{ error }}
                        </p>
                    </div>
                    <div class="flex flex-wrap items-center gap-4">
                        <button :disabled="form.processing" class="mod-button">
                            {{
                                rule ? 'Save rule' : 'Create disabled rule'
                            }}</button
                        ><label
                            v-if="rule"
                            class="flex items-center gap-2 text-sm"
                            ><input
                                v-model="form.enabled"
                                type="checkbox"
                            />Enabled</label
                        ><span v-else class="text-xs text-daf-text-secondary"
                            >Enable after saving and previewing.</span
                        >
                    </div>
                </div>
                <aside class="space-y-5">
                    <article class="mod-card p-5">
                        <h2 class="font-display text-lg font-bold">Preview</h2>
                        <p class="mt-2 text-sm text-daf-text-secondary">
                            Check up to 25 current nodes with this
                            configuration. Preview does not create flags.
                        </p>
                        <button
                            :disabled="previewBusy"
                            class="mod-button mt-4"
                            type="button"
                            @click="runPreview"
                        >
                            {{ previewBusy ? 'Checking…' : 'Preview rule' }}
                        </button>
                        <p
                            v-if="previewError"
                            class="mt-3 text-sm text-[var(--alert-600)]"
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
                                <summary class="cursor-pointer font-semibold">
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
                                        JSON.stringify(result.matches, null, 2)
                                    }}</pre
                                >
                            </details>
                        </div>
                    </article>
                    <article v-if="versions.length" class="mod-card p-5">
                        <h2 class="font-display text-lg font-bold">
                            Version history
                        </h2>
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
                                }}</pre
                            >
                        </details>
                    </article>
                </aside>
            </form>
        </section>
    </ModerationLayout>
</template>
