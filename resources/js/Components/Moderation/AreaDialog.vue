<script setup>
import Modal from '@/Components/Modal.vue';
import DafButton from '@/Components/Daf/DafButton.vue';
import ModerationMap from './ModerationMap.vue';
import { boundsGeometry, drawnGeometry } from '@/moderation';
import { useForm } from '@inertiajs/vue3';
import { inject, onBeforeUnmount, ref, watch } from 'vue';

const route = inject('route');
const props = defineProps({ show: Boolean });
const emit = defineEmits(['close']);
const form = useForm({ name: '', kind: 'zip', definition: '', geometry: null });
const text = ref('');
const results = ref([]);
const points = ref([]);
const searching = ref(false);
const message = ref('');
let searchRequest;
onBeforeUnmount(() => searchRequest?.abort());
watch(
    () => props.show,
    (open) => {
        if (open) {
            form.reset();
            form.clearErrors();
            text.value = '';
            results.value = [];
            points.value = [];
            message.value = '';
        } else searchRequest?.abort();
    },
);
function changeKind(kind) {
    searchRequest?.abort();
    form.kind = kind;
    form.geometry = null;
    form.clearErrors();
    text.value = '';
    results.value = [];
    message.value = '';
    points.value = [];
}
async function search() {
    if (!text.value.trim()) return;
    searchRequest?.abort();
    searchRequest = new AbortController();
    searching.value = true;
    message.value = '';
    results.value = [];
    form.geometry = null;
    try {
        const response = await fetch(
            route('moderation.areas.search', {
                query: text.value.trim(),
                kind: form.kind,
            }),
            {
                headers: { Accept: 'application/json' },
                signal: searchRequest.signal,
            },
        );
        const data = await response.json();
        if (!response.ok)
            throw new Error(data.message || 'Search failed. Please try again.');
        results.value = data;
        if (!data.length)
            message.value =
                'No boundary found. Try a more specific location or draw an area.';
    } catch (error) {
        if (error.name !== 'AbortError') message.value = error.message;
    } finally {
        searching.value = false;
    }
}
function choose(result) {
    form.geometry = result.geometry;
    form.name = result.name.slice(0, 120);
    form.definition = text.value.slice(0, 255);
    results.value = [];
}
function submit() {
    form.clearErrors();
    try {
        if (form.kind === 'bbox') {
            form.geometry = boundsGeometry(text.value);
            form.definition = text.value;
        }
        if (form.kind === 'drawn') {
            form.geometry = drawnGeometry(points.value);
            form.definition = `Drawn boundary · ${points.value.length} points`;
        }
        if (!form.geometry) {
            message.value =
                'Search for a location and choose its boundary first.';
            return;
        }
        form.post(route('moderation.areas.store'), {
            preserveScroll: true,
            onSuccess: () => emit('close'),
        });
    } catch (error) {
        message.value = error.message;
    }
}
</script>
<template>
    <Modal :show="show" @close="emit('close')">
        <form
            class="flex flex-col gap-5 bg-daf-surface-card p-6 text-daf-text-primary"
            @submit.prevent="submit"
        >
            <div>
                <h2
                    class="font-display text-daf-h2 font-bold tracking-[var(--ls-display)]"
                >
                    Create area
                </h2>
                <p class="text-daf-body-sm text-daf-text-secondary">
                    Define a boundary to follow edits and flags in one place.
                </p>
            </div>
            <div
                class="flex flex-wrap gap-1 rounded-dafPill border border-daf-border p-1"
            >
                <button
                    v-for="[key, label] in [
                        ['zip', 'ZIP code'],
                        ['county', 'City / county'],
                        ['bbox', 'Bounding box'],
                        ['drawn', 'Draw on map'],
                    ]"
                    :key="key"
                    :aria-pressed="form.kind === key"
                    :class="[
                        'flex-1 whitespace-nowrap rounded-dafPill px-3 py-2 text-xs font-bold',
                        form.kind === key
                            ? 'bg-[var(--brand-soft)] text-daf-text-brand'
                            : 'text-daf-text-secondary',
                    ]"
                    type="button"
                    @click="changeKind(key)"
                >
                    {{ label }}
                </button>
            </div>
            <div v-if="form.kind !== 'drawn'" class="flex flex-col gap-2">
                <label
                    class="text-daf-body-sm font-semibold"
                    for="area-definition"
                    >{{
                        form.kind === 'bbox'
                            ? 'Bounds — S, W → N, E'
                            : form.kind === 'zip'
                              ? 'ZIP code'
                              : 'City or county'
                    }}</label
                >
                <div class="flex gap-2">
                    <input
                        id="area-definition"
                        v-model="text"
                        :placeholder="
                            form.kind === 'bbox'
                                ? '30.09, -97.92 → 30.51, -97.56'
                                : form.kind === 'zip'
                                  ? 'e.g. 78704'
                                  : 'e.g. Travis County, TX'
                        "
                        class="min-w-0 flex-1 rounded-dafPill border-daf-border bg-daf-surface-page text-sm"
                        @input="form.geometry = null"
                        @keydown.enter.prevent="
                            form.kind === 'bbox' ? submit() : search()
                        "
                    /><DafButton
                        v-if="form.kind !== 'bbox'"
                        :disabled="searching"
                        size="sm"
                        @click="search"
                        >{{ searching ? 'Searching…' : 'Search' }}</DafButton
                    >
                </div>
                <div
                    v-if="results.length"
                    class="flex max-h-52 flex-col gap-1 overflow-auto rounded-dafMd border border-daf-border p-1"
                >
                    <button
                        v-for="result in results"
                        :key="result.name"
                        class="rounded-dafSm p-3 text-left text-sm hover:bg-[var(--brand-soft)]"
                        type="button"
                        @click="choose(result)"
                    >
                        {{ result.name }}
                    </button>
                </div>
                <p
                    v-if="form.geometry && form.kind !== 'bbox'"
                    class="text-xs text-daf-text-brand"
                >
                    Boundary selected.
                </p>
            </div>
            <label class="flex flex-col gap-2 text-daf-body-sm font-semibold"
                >Area name<input
                    v-model="form.name"
                    class="rounded-dafPill border-daf-border bg-daf-surface-page text-sm"
                    maxlength="120"
                    placeholder="e.g. Midtown sweep"
                    required
            /></label>
            <template v-if="form.kind === 'drawn'"
                ><ModerationMap
                    :points="points"
                    draw
                    @point="points.push($event)"
                /><button
                    :disabled="!points.length"
                    class="self-start text-sm font-semibold text-daf-text-brand"
                    type="button"
                    @click="points.pop()"
                >
                    Undo point
                </button></template
            >
            <p
                v-if="message"
                class="text-sm text-[var(--alert-600)]"
                role="alert"
            >
                {{ message }}
            </p>
            <p
                v-for="(error, field) in form.errors"
                :key="field"
                class="text-sm text-[var(--alert-600)]"
                role="alert"
            >
                {{ error }}
            </p>
            <div class="flex justify-end gap-2">
                <DafButton
                    :disabled="form.processing"
                    variant="secondary"
                    @click="emit('close')"
                    >Cancel</DafButton
                ><DafButton :disabled="form.processing" type="submit">{{
                    form.processing ? 'Saving…' : 'Create area'
                }}</DafButton>
            </div>
        </form>
    </Modal>
</template>
