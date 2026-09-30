<script setup>
import DafButton from '@/Components/Daf/DafButton.vue';
import { Link } from '@inertiajs/vue3';

const props = defineProps({ listing: { type: Object, required: true } });
const {
    view,
    title,
    descriptions,
    isClient,
    areaDialog,
    apply,
    query,
    absoluteTime,
    localTime,
    filters,
    profile,
    source,
} = props.listing;
</script>
<template>
    <div>
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
                <DafButton v-if="view === 'areas'" @click="areaDialog = true"
                    >Create area</DafButton
                >
            </div>
            <div
                v-if="['unavailable', 'refreshing'].includes(source.state)"
                class="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-dafMd border border-[var(--amber-500)] bg-[var(--amber-100)] px-4 py-3 text-sm text-[var(--amber-600)]"
                role="status"
            >
                <span
                    ><strong>{{
                        source.summary_progress?.failed
                            ? `${source.summary_progress.failed} summary job${source.summary_progress.failed === 1 ? '' : 's'} failed.`
                            : source.state === 'refreshing'
                              ? 'Summaries are still being calculated.'
                              : 'OpenStreetMap data is unavailable.'
                    }}</strong>
                    {{
                        source.summary_progress?.failed
                            ? 'Stale calculated rows remain visible.'
                            : 'Please try again shortly.'
                    }}</span
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
        <p
            v-if="isClient && source.calculated_at && view !== 'profile'"
            class="px-6 py-2 text-xs text-daf-text-tertiary"
        >
            Last calculated {{ localTime(source.calculated_at) }}
        </p>
    </div>
</template>
