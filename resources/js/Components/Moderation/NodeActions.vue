<script setup>
import { router, useHttp } from '@inertiajs/vue3';
import { inject, ref } from 'vue';

const props = defineProps({
    flag: { type: Object, required: true },
    nodeId: { type: Number, required: true },
});
const route = inject('route');
const opened = ref(false);
const state = ref(null);
const error = ref('');
const saved = ref(null);
const form = useHttp({
    flag_id: props.flag.id,
    version: null,
    action: '',
    confirmed: false,
    comment: '',
    tags: {},
    latitude: null,
    longitude: null,
});
async function openEditor() {
    opened.value = true;
    error.value = '';
    try {
        state.value = await form.get(
            route('moderation.nodes.osm-edit.show', {
                node: props.nodeId,
                flag_id: props.flag.id,
            }),
        );
        if (state.value.authorized) {
            form.version = state.value.node.version;
            form.action = state.value.actions.includes('remove')
                ? 'remove'
                : state.value.actions[0];
            form.tags = Object.fromEntries(
                state.value.tag_keys.map((key) => [
                    key,
                    state.value.node.tags?.[key] ?? '',
                ]),
            );
            form.latitude = state.value.node.lat;
            form.longitude = state.value.node.lon;
            form.confirmed = false;
        }
    } catch {
        error.value =
            form.errors.edit ||
            'The node editor could not be loaded. Please retry.';
    }
}
async function save() {
    if (!form.confirmed || form.processing) return;
    error.value = '';
    try {
        saved.value = await form.post(
            route('moderation.nodes.osm-edit.store', props.nodeId),
        );
        state.value = null;
        if (saved.value.recorded !== false) {
            router.reload({ preserveScroll: true });
        }
    } catch {
        error.value =
            Object.values(form.errors).join(' ') ||
            'The edit response could not be confirmed. Check OSM history before retrying.';
    }
}
</script>

<template>
    <div class="mt-3 text-xs">
        <button
            v-if="flag.status === 'open' && !saved"
            :aria-label="`Edit reported node ${nodeId}`"
            :disabled="form.processing"
            class="mod-button !h-[30px] !px-3"
            type="button"
            @click="openEditor"
        >
            {{
                flag.related_node_id
                    ? 'Edit / remove node'
                    : 'Edit reported node'
            }}
        </button>
        <div v-if="opened" class="mt-3 flex max-w-lg flex-col gap-3">
            <p v-if="error" class="text-[var(--alert-600)]" role="alert">
                {{ error }}
            </p>
            <p v-if="saved" role="status">
                Saved to OpenStreetMap as version {{ saved.node.version }} in
                changeset #{{ saved.changeset_id }}. Report history and rule
                checks will refresh shortly.
                <span v-if="!saved.closed"
                    >The changeset is still open; close it on
                    OpenStreetMap.</span
                >
                <span v-if="!saved.verified"
                    >The saved version is awaiting a follow-up read from
                    OpenStreetMap.</span
                >
                <span v-if="saved.recorded === false"
                    >The change was saved on OSM, but this report could not save
                    its receipt. Check OSM history before taking further
                    action.</span
                >
            </p>
            <template v-if="state && !state.authorized">
                <p>
                    Authorize OpenStreetMap editing with your moderator account
                    to make changes.
                </p>
                <a
                    :href="
                        route('moderation.osm.edit.authorize', { node: nodeId })
                    "
                    class="mod-link"
                    >Authorize editing on OpenStreetMap</a
                >
            </template>
            <form
                v-if="state?.authorized && state.actions.length"
                class="flex flex-col gap-3"
                @submit.prevent="save"
            >
                <p>
                    Editing current OSM version {{ form.version }}. Confirm the
                    evidence before changing this node.
                </p>
                <label class="flex flex-col gap-1">
                    Action
                    <select
                        v-model="form.action"
                        class="mod-input"
                        @change="form.confirmed = false"
                    >
                        <option
                            v-for="action in state.actions"
                            :key="action"
                            :value="action"
                        >
                            {{
                                {
                                    tags: 'Fix reported tags',
                                    location: 'Correct location',
                                    remove: 'Remove node from OpenStreetMap',
                                }[action]
                            }}
                        </option>
                    </select>
                </label>
                <template v-if="form.action === 'tags'">
                    <label
                        v-for="key in state.tag_keys"
                        :key="key"
                        class="flex flex-col gap-1"
                    >
                        {{ key }}
                        <input
                            v-model="form.tags[key]"
                            class="mod-input"
                            maxlength="255"
                        />
                    </label>
                    <p>
                        Use values supported by your survey. Leaving a value
                        blank removes that tag.
                    </p>
                </template>
                <template v-if="form.action === 'location'">
                    <label class="flex flex-col gap-1"
                        >Latitude<input
                            v-model="form.latitude"
                            class="mod-input"
                            max="90"
                            min="-90"
                            required
                            step="any"
                            type="number"
                    /></label>
                    <label class="flex flex-col gap-1"
                        >Longitude<input
                            v-model="form.longitude"
                            class="mod-input"
                            max="180"
                            min="-180"
                            required
                            step="any"
                            type="number"
                    /></label>
                    <p>
                        Enter the surveyed position. A distance flag alone does
                        not establish the correct location.
                    </p>
                </template>
                <p
                    v-if="form.action === 'remove'"
                    class="text-[var(--alert-600)]"
                >
                    This removes node {{ nodeId }} from OpenStreetMap. For a
                    duplicate, keep the original node. A report alone is not
                    proof that removal is appropriate.
                </p>
                <label class="flex flex-col gap-1"
                    >Changeset comment<input
                        v-model="form.comment"
                        class="mod-input"
                        maxlength="255"
                        minlength="5"
                        placeholder="Explain the evidence and change"
                        required
                /></label>
                <label class="flex items-start gap-2">
                    <input v-model="form.confirmed" required type="checkbox" />
                    I reviewed the evidence and confirm this
                    {{ form.action === 'remove' ? 'removal' : 'edit' }}.
                </label>
                <button
                    :disabled="form.processing || !form.confirmed"
                    class="mod-button self-start"
                    type="submit"
                >
                    {{
                        form.processing
                            ? 'Saving…'
                            : form.action === 'remove'
                              ? 'Confirm removal on OSM'
                              : 'Save changes to OSM'
                    }}
                </button>
            </form>
            <p v-if="state?.authorized && !state.actions.length">
                This report is no longer actionable. Refresh to see its current
                status.
            </p>
            <button
                v-if="state && !form.processing"
                class="mod-link self-start"
                type="button"
                @click="opened = false"
            >
                Close editor
            </button>
        </div>
    </div>
</template>
