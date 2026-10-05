<script setup>
import FlagLabel from '@/Components/Moderation/FlagLabel.vue';
import NodeLink from '@/Components/Moderation/NodeLink.vue';
import NodeActions from '@/Components/Moderation/NodeActions.vue';
import {
    flagFacts,
    flagRelatedNodeId,
    flagSummary,
    reportEvidence,
    severityClass,
} from '@/moderationFlags';
import { Link } from '@inertiajs/vue3';
import { computed, ref } from 'vue';

const props = defineProps({
    flags: { type: Array, default: () => [] },
    reports: { type: Object, default: () => ({ data: [] }) },
    nodeId: { type: Number, required: true },
    absoluteTime: { type: Function, required: true },
    dismissing: { type: Boolean, default: false },
    showActions: { type: Boolean, default: true },
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
const rawReports = ref([]);
const rawRules = ref([]);
function toggleRule(id) {
    rawRules.value = rawRules.value.includes(id)
        ? rawRules.value.filter((value) => value !== id)
        : [...rawRules.value, id];
}
const reportCount = computed(
    () =>
        props.reports.total ??
        reportFlag.value?.evidence?.report_count ??
        props.reports.data?.length ??
        0,
);
const shortReportTime = (value) =>
    props
        .absoluteTime(value)
        .replace(/, \d{4}/, '')
        .replace(/\s(?:[A-Z]{2,5}|GMT[+-]\d+(?::\d+)?)$/, '');
function toggleReport(id) {
    rawReports.value = rawReports.value.includes(id)
        ? rawReports.value.filter((value) => value !== id)
        : [...rawReports.value, id];
}
const platformLabel = (platform) =>
    ({ android_auto: 'Android Auto', carplay: 'CarPlay' })[platform] ||
    platform ||
    'Unknown';
</script>

<template>
    <div class="moderation-page flex flex-col gap-6">
        <section v-if="rules.length" aria-label="Rule violations">
            <div class="mb-2 flex items-center gap-2">
                <h2 class="mod-label">Rule violations</h2>
                <span
                    class="rounded-dafPill bg-[var(--alert-100)] px-2 font-mono text-[11px] font-bold text-[var(--alert-600)]"
                    >{{ rules.length }}</span
                ><span class="ml-auto text-[11px] text-daf-text-tertiary"
                    >Re-checked after edits</span
                >
            </div>
            <div
                class="overflow-hidden rounded-dafSm border border-daf-border bg-daf-surface-card"
            >
                <article
                    v-for="flag in rules"
                    :key="flag.id"
                    :class="severityClass(flag.rule?.severity)"
                    class="mod-violation border-b border-daf-border last:border-b-0"
                >
                    <div class="min-w-0 px-3.5 py-3">
                        <div class="flex flex-wrap items-center gap-2">
                            <span class="mod-severity">{{
                                flag.rule?.severity || 'Unavailable'
                            }}</span
                            ><FlagLabel
                                :flag="flag"
                                class="text-[13px] font-bold"
                            />
                            <span
                                class="ml-auto inline-flex items-center gap-1.5 font-mono text-[11px] text-daf-text-tertiary"
                                ><span
                                    :class="
                                        flag.status === 'open'
                                            ? 'bg-[var(--alert-500)]'
                                            : 'bg-daf-text-tertiary'
                                    "
                                    class="size-1.5 rounded-full"
                                />{{ stateLabel(flag) }}</span
                            >
                        </div>
                        <NodeLink
                            v-if="flagRelatedNodeId(flag, nodeId)"
                            :node-id="flagRelatedNodeId(flag, nodeId)"
                            class="mt-1.5 block text-[13px] leading-relaxed hover:text-daf-text-brand hover:underline"
                            >{{ flagSummary(flag, nodeId) }}</NodeLink
                        >
                        <p v-else class="mt-1.5 text-[13px] leading-relaxed">
                            {{ flagSummary(flag, nodeId) }}
                        </p>
                        <p
                            v-for="fact in flagFacts(flag).filter((fact) =>
                                ['Expected value', 'Matching tags'].includes(
                                    fact.label,
                                ),
                            )"
                            :key="fact.label"
                            class="mt-1 text-xs text-daf-text-secondary"
                        >
                            {{ fact.label }}: {{ fact.value }}
                        </p>
                        <p
                            v-if="flag.stale"
                            class="mt-1 text-xs text-[var(--amber-600)]"
                        >
                            Stale evidence · awaiting a fresh rule check
                        </p>
                        <div
                            class="mt-2.5 flex flex-wrap items-start gap-x-3.5 gap-y-2 font-mono text-[11px] text-daf-text-tertiary"
                        >
                            <span
                                >First flagged
                                <time
                                    v-if="flag.created_at"
                                    :datetime="flag.created_at"
                                    class="font-semibold text-daf-text-secondary"
                                    >{{ absoluteTime(flag.created_at) }}</time
                                ><span v-else>Unavailable</span></span
                            >
                            <span
                                >Last checked
                                <time
                                    v-if="flag.evaluated_at"
                                    :datetime="flag.evaluated_at"
                                    class="font-semibold text-daf-text-secondary"
                                    >{{ absoluteTime(flag.evaluated_at) }}</time
                                ><span v-else>Unavailable</span></span
                            >
                            <button
                                v-if="Object.keys(flag.evidence || {}).length"
                                :aria-controls="`rule-evidence-${flag.id}`"
                                :aria-expanded="rawRules.includes(flag.id)"
                                :aria-label="`Raw evidence for rule ${flag.rule?.name || flag.id}`"
                                class="ml-auto inline-flex items-center gap-1 whitespace-nowrap font-ui text-[11px] font-semibold text-daf-text-secondary hover:text-daf-text-brand hover:underline"
                                type="button"
                                @click="toggleRule(flag.id)"
                            >
                                <span
                                    :class="
                                        rawRules.includes(flag.id) &&
                                        'rotate-90'
                                    "
                                    aria-hidden="true"
                                    class="inline-block transition-transform"
                                    >›</span
                                >Raw evidence
                            </button>
                        </div>
                        <pre
                            v-if="rawRules.includes(flag.id)"
                            :id="`rule-evidence-${flag.id}`"
                            class="mt-2.5 max-h-[260px] overflow-auto rounded-dafXs border border-daf-border bg-daf-surface-page px-3 py-2.5 font-mono text-[11.5px] leading-relaxed text-daf-text-secondary"
                            >{{ JSON.stringify(flag.evidence, null, 2) }}</pre>
                        <NodeActions
                            v-if="showActions"
                            :flag="flag"
                            :node-id="nodeId"
                        />
                    </div>
                </article>
            </div>
        </section>
        <section
            v-if="reportFlag || reports.data?.length"
            aria-label="Not there reports"
        >
            <div class="mb-[7px] flex flex-wrap items-center gap-2">
                <h2 class="mod-label">Not there reports</h2>
                <span
                    class="rounded-dafPill bg-[color-mix(in_oklab,var(--text-primary)_9%,transparent)] px-[7px] font-mono text-[11px] font-bold text-daf-text-secondary"
                    >{{ reportCount }}</span
                >
                <span class="min-w-0 text-[11px] text-daf-text-tertiary"
                    >Unverified ·
                    {{
                        reportCount === 1
                            ? 'one driver tapped'
                            : 'drivers tapped'
                    }}
                    “Not there” passing this camera</span
                >
                <span
                    v-if="reportFlag && reportFlag.status !== 'open'"
                    class="mod-chip"
                    >{{ stateLabel(reportFlag) }}</span
                >
                <button
                    v-if="reportFlag?.status === 'open'"
                    :aria-label="`Dismiss Driver reported missing for node ${nodeId}`"
                    :disabled="dismissing"
                    class="mod-button ml-auto !h-[26px] !px-[11px] !text-[11.5px]"
                    @click="$emit('dismiss', reportFlag)"
                >
                    Dismiss reports
                </button>
            </div>
            <NodeActions
                v-if="reportFlag && showActions"
                :flag="reportFlag"
                :node-id="nodeId"
            />
            <div
                aria-label="Individual not-there reports"
                class="overflow-hidden rounded-dafSm border border-daf-border bg-daf-surface-card"
            >
                <div
                    class="mod-report-row border-b border-daf-border bg-[color-mix(in_oklab,var(--text-primary)_3%,var(--surface-card))] !py-2"
                >
                    <span
                        v-for="label in [
                            'Report',
                            'Reported',
                            'Platform',
                            'Received',
                            'Evidence',
                        ]"
                        :key="label"
                        class="mod-label last:text-right"
                        >{{ label }}</span
                    >
                </div>
                <article
                    v-for="report in reports.data"
                    :key="report.id"
                    class="border-b border-daf-border last:border-b-0"
                >
                    <div class="mod-report-row">
                        <span class="font-mono text-[12.5px] font-bold"
                            >#{{ report.id }}</span
                        >
                        <time
                            :datetime="report.occurred_at"
                            :title="absoluteTime(report.occurred_at)"
                            class="break-anywhere font-mono text-xs"
                            >{{ shortReportTime(report.occurred_at) }}</time
                        >
                        <span
                            class="break-anywhere text-[13px] text-daf-text-secondary"
                            >{{ platformLabel(report.platform) }}</span
                        >
                        <time
                            :datetime="report.received_at"
                            :title="absoluteTime(report.received_at)"
                            class="break-anywhere font-mono text-xs text-daf-text-secondary"
                            >{{ shortReportTime(report.received_at) }}</time
                        >
                        <button
                            :aria-controls="`report-evidence-${nodeId}-${report.id}`"
                            :aria-expanded="rawReports.includes(report.id)"
                            :aria-label="`Raw evidence for report ${report.id}`"
                            class="inline-flex items-center gap-1 justify-self-end whitespace-nowrap text-[11px] font-semibold text-daf-text-secondary hover:text-daf-text-brand hover:underline"
                            type="button"
                            @click="toggleReport(report.id)"
                        >
                            <span
                                :class="
                                    rawReports.includes(report.id) &&
                                    'rotate-90'
                                "
                                aria-hidden="true"
                                class="inline-block transition-transform"
                                >›</span
                            >Raw evidence
                        </button>
                    </div>
                    <pre
                        v-if="rawReports.includes(report.id)"
                        :id="`report-evidence-${nodeId}-${report.id}`"
                        class="mx-3.5 mb-3 max-h-[260px] overflow-auto rounded-dafXs border border-daf-border bg-daf-surface-page px-3 py-2.5 font-mono text-[11.5px] leading-relaxed text-daf-text-secondary"
                        >{{
                            JSON.stringify(
                                reportEvidence(report, nodeId),
                                null,
                                2,
                            )
                        }}</pre>
                </article>
                <p
                    v-if="!reports.data?.length"
                    class="px-3.5 py-3 text-xs text-daf-text-secondary"
                >
                    No individual reports available.
                </p>
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
