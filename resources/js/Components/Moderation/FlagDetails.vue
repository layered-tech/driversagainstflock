<script setup>
import FlagLabel from '@/Components/Moderation/FlagLabel.vue';
import { flagFacts, flagSummary } from '@/moderationFlags';
import { Link } from '@inertiajs/vue3';
import { computed } from 'vue';

const props = defineProps({
    flags: { type: Array, default: () => [] },
    reports: { type: Object, default: () => ({ data: [] }) },
    nodeId: { type: Number, required: true },
    absoluteTime: { type: Function, required: true },
    dismissing: { type: Boolean, default: false },
    inline: { type: Boolean, default: false },
});
defineEmits(['dismiss', 'reports-page']);
const rules = computed(() =>
    props.flags.filter((flag) => flag.source !== 'alpr_presence'),
);
const reportFlag = computed(() =>
    props.flags.find((flag) => flag.source === 'alpr_presence'),
);
const stateLabel = (flag) =>
    ({ open: 'Open', dismissed: 'Dismissed', resolved: 'Resolved' })[
        flag.status
    ] || 'Unavailable';
const platformLabel = (platform) =>
    ({ android_auto: 'Android Auto', carplay: 'CarPlay' })[platform] ||
    platform ||
    'Unknown';
</script>

<template>
    <div class="moderation-page flex flex-col gap-6">
        <section v-if="rules.length" aria-label="Rule violations">
            <h2 class="mod-subheading mb-3">
                Rule violations · {{ rules.length }}
            </h2>
            <div class="overflow-x-auto rounded-dafMd border border-daf-border">
                <table
                    aria-label="Individual rule violations"
                    class="w-full text-left text-xs [&_td]:align-top [&_th]:whitespace-nowrap [&_th]:bg-daf-surface-alt [&_th]:px-3 [&_th]:py-2 [&_th]:text-[11px] [&_th]:font-semibold [&_th]:text-daf-text-tertiary"
                >
                    <thead>
                        <tr>
                            <th>Rule</th>
                            <th>Evidence</th>
                            <th>Severity</th>
                            <th>Status</th>
                            <th>First flagged</th>
                            <th>Last checked</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr
                            v-for="flag in rules"
                            :key="flag.id"
                            class="border-t border-daf-border align-top"
                        >
                            <td><FlagLabel :flag="flag" class="mod-chip" /></td>
                            <td class="min-w-[220px] max-w-md">
                                <p>{{ flagSummary(flag, nodeId) }}</p>
                                <p
                                    v-for="fact in flagFacts(flag).filter(
                                        (fact) =>
                                            [
                                                'Expected value',
                                                'Matching tags',
                                            ].includes(fact.label),
                                    )"
                                    :key="fact.label"
                                    class="mt-1 text-daf-text-secondary"
                                >
                                    {{ fact.label }}: {{ fact.value }}
                                </p>
                                <details
                                    v-if="
                                        Object.keys(flag.evidence || {}).length
                                    "
                                    class="mt-2 text-daf-text-secondary"
                                >
                                    <summary class="cursor-pointer">
                                        Raw evidence
                                    </summary>
                                    <pre
                                        class="mt-2 whitespace-pre-wrap break-all"
                                        >{{
                                            JSON.stringify(
                                                flag.evidence,
                                                null,
                                                2,
                                            )
                                        }}</pre
                                    >
                                </details>
                            </td>
                            <td>{{ flag.rule?.severity || 'Unavailable' }}</td>
                            <td>
                                {{ stateLabel(flag)
                                }}<span
                                    v-if="flag.stale"
                                    class="mt-1 block text-[var(--amber-600)]"
                                    >Stale evidence</span
                                >
                            </td>
                            <td class="whitespace-nowrap">
                                <time
                                    v-if="flag.created_at"
                                    :datetime="flag.created_at"
                                    >{{ absoluteTime(flag.created_at) }}</time
                                ><span v-else>Unavailable</span>
                            </td>
                            <td class="whitespace-nowrap">
                                <time
                                    v-if="flag.evaluated_at"
                                    :datetime="flag.evaluated_at"
                                    >{{ absoluteTime(flag.evaluated_at) }}</time
                                ><span v-else>Unavailable</span>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </section>
        <section
            v-if="reportFlag || reports.data?.length"
            aria-label="Not there reports"
        >
            <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h2 class="mod-subheading">
                    Not there reports ·
                    {{
                        reports.total ??
                        reportFlag?.evidence?.report_count ??
                        reports.data.length
                    }}
                </h2>
                <div v-if="reportFlag" class="flex items-center gap-3">
                    <span class="mod-chip">{{ stateLabel(reportFlag) }}</span>
                    <button
                        v-if="reportFlag.status === 'open'"
                        :aria-label="`Dismiss Driver reported missing for node ${nodeId}`"
                        :disabled="dismissing"
                        class="mod-button !h-[30px] !px-3"
                        @click="$emit('dismiss', reportFlag)"
                    >
                        Dismiss
                    </button>
                </div>
            </div>
            <p class="mb-3 text-xs text-daf-text-secondary">
                Unverified user reports.
            </p>
            <div class="overflow-x-auto rounded-dafMd border border-daf-border">
                <table
                    aria-label="Individual not-there reports"
                    class="w-full text-left text-xs [&_td]:align-top [&_th]:whitespace-nowrap [&_th]:bg-daf-surface-alt [&_th]:px-3 [&_th]:py-2 [&_th]:text-[11px] [&_th]:font-semibold [&_th]:text-daf-text-tertiary"
                >
                    <thead>
                        <tr>
                            <th>Report</th>
                            <th>Response</th>
                            <th>Reported</th>
                            <th>Platform</th>
                            <th>Received</th>
                            <th>Evidence</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr
                            v-for="report in reports.data"
                            :key="report.id"
                            class="border-t border-daf-border align-top"
                        >
                            <td class="font-mono">#{{ report.id }}</td>
                            <td><span class="mod-chip">not-there</span></td>
                            <td class="whitespace-nowrap">
                                <time :datetime="report.occurred_at">{{
                                    absoluteTime(report.occurred_at)
                                }}</time>
                            </td>
                            <td>{{ platformLabel(report.platform) }}</td>
                            <td class="whitespace-nowrap">
                                <time :datetime="report.received_at">{{
                                    absoluteTime(report.received_at)
                                }}</time>
                            </td>
                            <td class="min-w-[160px]">
                                <details>
                                    <summary class="cursor-pointer">
                                        Report evidence
                                    </summary>
                                    <dl class="mt-2 grid gap-2">
                                        <div>
                                            <dt>Passed</dt>
                                            <dd>
                                                {{
                                                    absoluteTime(
                                                        report.passed_at,
                                                    )
                                                }}
                                            </dd>
                                        </div>
                                        <div>
                                            <dt>Submitted</dt>
                                            <dd>
                                                {{
                                                    absoluteTime(
                                                        report.submitted_at,
                                                    )
                                                }}
                                            </dd>
                                        </div>
                                        <div>
                                            <dt>Client-observed version</dt>
                                            <dd>
                                                {{
                                                    report.observed?.version ??
                                                    'Unknown'
                                                }}
                                            </dd>
                                        </div>
                                        <div>
                                            <dt>Client-observed location</dt>
                                            <dd>
                                                {{
                                                    report.observed?.latitude ??
                                                    'Unknown'
                                                }},
                                                {{
                                                    report.observed
                                                        ?.longitude ?? 'Unknown'
                                                }}
                                            </dd>
                                        </div>
                                        <div v-if="report.observed?.street">
                                            <dt>Client-observed street</dt>
                                            <dd>
                                                {{ report.observed.street }}
                                            </dd>
                                        </div>
                                        <div>
                                            <dt>Server node snapshot</dt>
                                            <dd>
                                                v{{
                                                    report.server_node_version ??
                                                    'Unknown'
                                                }}
                                                ·
                                                {{
                                                    report.server_latitude ??
                                                    'Unknown'
                                                }},
                                                {{
                                                    report.server_longitude ??
                                                    'Unknown'
                                                }}
                                            </dd>
                                        </div>
                                    </dl>
                                </details>
                            </td>
                        </tr>
                        <tr v-if="!reports.data?.length">
                            <td colspan="6">
                                No individual reports available.
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <nav
                v-if="reports.prev_page_url || reports.next_page_url"
                aria-label="Report history pages"
                class="mt-3 flex gap-4"
            >
                <template
                    v-for="page in [
                        {
                            url: reports.prev_page_url,
                            label: 'Previous reports',
                        },
                        { url: reports.next_page_url, label: 'More reports' },
                    ]"
                    :key="page.label"
                >
                    <button
                        v-if="page.url && inline"
                        class="mod-link"
                        @click="$emit('reports-page', page.url)"
                    >
                        {{ page.label }}
                    </button>
                    <Link
                        v-else-if="page.url"
                        :href="page.url"
                        class="mod-link"
                        preserve-scroll
                        >{{ page.label }}</Link
                    >
                </template>
            </nav>
            <p
                v-if="
                    reportFlag?.dismissed_at &&
                    reportFlag.status === 'dismissed'
                "
                class="mt-3 text-xs text-daf-text-secondary"
            >
                Dismissed
                <time :datetime="reportFlag.dismissed_at">{{
                    absoluteTime(reportFlag.dismissed_at)
                }}</time>
            </p>
        </section>
        <p
            v-if="!flags.length && !reports.data?.length"
            class="text-sm text-daf-text-secondary"
        >
            No flagged violations.
        </p>
    </div>
</template>
