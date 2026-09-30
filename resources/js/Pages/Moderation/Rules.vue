<script setup>
import { useModerationTime } from '@/useModerationTime';
import ModerationLayout from '@/Layouts/ModerationLayout.vue';
import { Head, Link } from '@inertiajs/vue3';
import { inject } from 'vue';

defineProps({ rules: Array, processes: Array });
const { absoluteTime } = useModerationTime();
const route = inject('route');
const types = {
    missing_tags: 'Missing tags',
    invalid_tag: 'Invalid tags',
    road_distance: 'Road distance',
    duplicate_nodes: 'Duplicate nodes',
};
</script>
<template>
    <ModerationLayout navigation view="rules">
        <Head title="Moderation rules" />
        <section class="space-y-5 p-5 sm:p-6">
            <header class="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 class="font-display text-daf-h2 font-bold">Rules</h1>
                    <p class="mt-1 text-sm text-daf-text-secondary">
                        Checks for current ALPR nodes. New rules start disabled.
                    </p>
                </div>
                <Link
                    :href="route('moderation.rules.create')"
                    class="mod-button"
                    >Create rule</Link
                >
            </header>
            <div class="mod-card overflow-x-auto">
                <table class="w-full text-left text-sm">
                    <thead
                        class="border-b border-daf-border text-xs text-daf-text-secondary"
                    >
                        <tr>
                            <th class="p-4">Rule</th>
                            <th class="p-4">Check</th>
                            <th class="p-4">Severity</th>
                            <th class="p-4">State</th>
                            <th class="p-4">Version</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr
                            v-for="rule in rules"
                            :key="rule.id"
                            class="border-b border-daf-border last:border-0"
                        >
                            <td class="p-4">
                                <Link
                                    :href="
                                        route('moderation.rules.edit', rule.id)
                                    "
                                    class="mod-link font-semibold"
                                    >{{ rule.name }}</Link
                                >
                                <p class="mt-1 text-xs text-daf-text-secondary">
                                    {{ rule.description }}
                                </p>
                            </td>
                            <td class="p-4">{{ types[rule.type] }}</td>
                            <td class="p-4">{{ rule.severity }}</td>
                            <td class="p-4">
                                {{ rule.enabled ? 'Enabled' : 'Disabled' }}
                            </td>
                            <td class="p-4 font-mono">{{ rule.version }}</td>
                        </tr>
                    </tbody>
                </table>
                <p
                    v-if="!rules.length"
                    class="p-8 text-center text-daf-text-secondary"
                >
                    No rules configured. Create a rule and preview its results
                    before enabling it.
                </p>
            </div>
            <article class="mod-card p-5">
                <h2 class="font-display text-lg font-bold">Processing</h2>
                <p class="mt-1 text-xs text-daf-text-secondary">
                    Frequencies are controlled by the Laravel scheduler. Failed
                    jobs retry independently while Horizon scales the queue.
                </p>
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
                        {{ process.failed_jobs }} failed<br />
                        Last success:
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
            </article>
        </section>
    </ModerationLayout>
</template>
