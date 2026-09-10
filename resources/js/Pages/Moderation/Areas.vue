<script setup>
import DafIcon from '@/Components/Daf/DafIcon.vue';
import { Link } from '@inertiajs/vue3';
import ModerationListing from '@/Components/Moderation/ModerationListing.vue';
import {
    moderationListingProps,
    useModerationListing,
} from '@/useModerationListing';

const props = defineProps(moderationListingProps);
const listing = useModerationListing(props, 'areas');
const {
    expanded,
    details,
    removeArea,
    actionBusy,
    query,
    rowKey,
    expand,
    subscribed,
    areaAction,
    page,
    absoluteTime,
} = listing;
const columns = [
    [null, 'Area'],
    [null, 'Watchers'],
    [null, 'Open flags'],
    [null, 'Edits · 7 d'],
    [null, 'Flagged'],
    [null, 'Created'],
    [null, 'Actions'],
    [null, ''],
];
</script>
<template>
    <ModerationListing :columns="columns" :listing="listing"
        ><template #row="{ row }"
            ><td>
                <div class="font-semibold">
                    {{ row.name }}
                    <span
                        class="ml-1 rounded bg-daf-surface-alt px-1.5 py-0.5 font-mono text-[10px] uppercase text-daf-text-tertiary"
                        >{{ row.kind }}</span
                    >
                </div>
                <div class="mt-1 text-xs text-daf-text-tertiary">
                    {{ row.definition }}
                </div>
                <div class="mt-1.5 flex gap-3">
                    <Link
                        v-for="[key, label] in [
                            ['changesets', 'Changesets'],
                            ['nodes', 'ALPR nodes'],
                            ['editors', 'Editors'],
                        ]"
                        :key="key"
                        :href="
                            query(key, {
                                area: row.id,
                            })
                        "
                        class="mod-link"
                        >{{ label }}</Link
                    >
                </div>
            </td>
            <td class="max-w-[160px] text-xs">
                {{
                    row.watchers
                        .map((user) =>
                            user.id === page.props.auth.user.id
                                ? `${user.name} (you)`
                                : user.name,
                        )
                        .join(', ') || 'No watchers'
                }}
            </td>
            <td class="font-mono">
                {{ details[rowKey(row)]?.open_flags ?? row.open_flags ?? '—' }}
            </td>
            <td class="font-mono">
                {{
                    details[rowKey(row)]?.changesets_7d ??
                    row.changesets_7d ??
                    '—'
                }}
            </td>
            <td class="font-mono">
                {{
                    details[rowKey(row)]?.flagged_changesets ??
                    row.flagged_changesets ??
                    '—'
                }}
            </td>
            <td class="max-w-[130px] text-xs text-daf-text-secondary">
                {{ absoluteTime(row.created_at) }}
            </td>
            <td>
                <div v-if="removeArea === row.id" class="flex gap-2">
                    <button
                        :disabled="actionBusy"
                        class="mod-link !text-[var(--alert-600)]"
                        @click="areaAction(row, 'destroy')"
                    >
                        Yes, remove</button
                    ><button class="mod-link" @click="removeArea = null">
                        Keep
                    </button>
                </div>
                <div v-else class="flex gap-3">
                    <button
                        :disabled="actionBusy"
                        class="mod-link"
                        @click="
                            areaAction(
                                row,
                                subscribed(row) ? 'unsubscribe' : 'subscribe',
                            )
                        "
                    >
                        {{
                            subscribed(row) ? 'Unsubscribe' : 'Subscribe'
                        }}</button
                    ><button class="mod-link" @click="removeArea = row.id">
                        Remove
                    </button>
                </div>
            </td>
            <td>
                <button
                    :aria-expanded="expanded === rowKey(row)"
                    :aria-label="`Details for area ${row.name}`"
                    class="mod-expand"
                    @click="expand(row)"
                >
                    <DafIcon
                        :class="expanded === rowKey(row) && 'rotate-180'"
                        :size="16"
                        name="chevron-down"
                    />
                </button></td></template
        ><template #detail="{ row }"
            ><h2 class="mod-subheading">
                {{ row.name }}
            </h2>
            <dl class="mod-details mt-3">
                <dt>Defined as</dt>
                <dd>
                    {{ row.definition }}
                </dd>
                <dt>Created by</dt>
                <dd>
                    {{ row.creator?.name || 'Former moderator' }}
                    ·
                    {{ absoluteTime(row.created_at) }}
                </dd>
                <dt>Watchers</dt>
                <dd>
                    {{
                        row.watchers.map((user) => user.name).join(', ') ||
                        'No watchers'
                    }}
                </dd>
                <template
                    v-for="[label, key] in [
                        ['Active editors', 'active_editors'],
                        ['Affected nodes', 'affected_nodes'],
                        ['Reverted changesets', 'reverted_changesets'],
                        ['Individual rule violations', 'open_violations'],
                        ['Calculated at', 'calculated_at'],
                    ]"
                    :key="key"
                    ><dt>
                        {{ label }}
                    </dt>
                    <dd>
                        {{
                            key === 'calculated_at'
                                ? absoluteTime(
                                      details[rowKey(row)]?.[key] ?? row[key],
                                  )
                                : (details[rowKey(row)]?.[key] ??
                                  row[key] ??
                                  '—')
                        }}
                    </dd></template
                >
                <dt>Open flags</dt>
                <dd>
                    {{ details[rowKey(row)]?.open_flags ?? '—' }}
                </dd>
                <dt>Edits · 7 d</dt>
                <dd>
                    {{ details[rowKey(row)]?.changesets_7d ?? '—' }}
                </dd>
                <dt>Flagged changesets</dt>
                <dd>
                    {{ details[rowKey(row)]?.flagged_changesets ?? '—' }}
                </dd>
            </dl></template
        ></ModerationListing
    >
</template>
