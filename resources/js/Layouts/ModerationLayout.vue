<script setup>
import DafIcon from '@/Components/Daf/DafIcon.vue';
import { Link, usePage } from '@inertiajs/vue3';
import { computed } from 'vue';
import logoMark from '../../assets/daf-logo-mark.png';

defineProps({
    navigation: { type: Boolean, default: false },
    view: { type: String, default: '' },
    counts: { type: Object, default: () => ({}) },
});
const page = usePage();
const user = computed(() => page.props.auth?.user);
const initials = computed(() =>
    (user.value?.name || '')
        .split(/\s+/)
        .map((word) => word[0])
        .slice(0, 2)
        .join('')
        .toUpperCase(),
);
const links = [
    { view: 'changesets', label: 'Changesets' },
    { view: 'nodes', label: 'ALPR nodes' },
    { view: 'flagged', label: 'Flagged' },
    { view: 'editors', label: 'Editors' },
    { view: 'areas', label: 'Areas' },
];
</script>
<template>
    <div
        class="moderation-page flex min-h-screen flex-col bg-daf-surface-page font-ui text-daf-text-primary antialiased"
    >
        <header
            class="sticky top-0 z-30 flex h-[57px] shrink-0 items-center gap-3 border-b border-daf-border bg-daf-surface-card px-5"
        >
            <img :src="logoMark" alt="DAF" class="size-[26px] object-contain" />
            <span
                class="font-display text-[15px] font-bold tracking-[var(--ls-display)]"
                >DAF Moderation</span
            >
            <span
                class="rounded-dafPill bg-[var(--amber-100)] px-[9px] py-[3px] font-mono text-[10px] font-bold uppercase tracking-[var(--ls-label)] text-[var(--amber-600)]"
                >Internal</span
            >
            <div
                v-if="user && navigation"
                class="ml-auto flex items-center gap-2.5"
            >
                <div class="hidden text-right sm:block">
                    <div class="text-daf-caption font-semibold">
                        {{ user.name }}
                    </div>
                    <div class="font-mono text-[10px] text-daf-text-tertiary">
                        moderator
                    </div>
                </div>
                <span
                    class="flex size-8 items-center justify-center rounded-full bg-[var(--brand-soft)] text-xs font-bold text-daf-text-brand"
                    >{{ initials }}</span
                >
                <Link
                    :href="route('logout')"
                    aria-label="Sign out"
                    as="button"
                    class="rounded-dafSm p-2 text-daf-text-secondary hover:bg-[var(--brand-soft)]"
                    method="post"
                    title="Sign out"
                    ><DafIcon :size="18" name="log-out"
                /></Link>
            </div>
        </header>
        <div
            v-if="navigation"
            class="grid flex-1 items-start md:grid-cols-[212px_minmax(0,1fr)]"
        >
            <nav
                aria-label="Moderation"
                class="flex gap-1 overflow-x-auto border-b border-daf-border p-3 md:sticky md:top-[57px] md:min-h-[calc(100vh-57px)] md:flex-col md:border-b-0 md:border-r md:py-[18px]"
            >
                <div
                    class="hidden px-3 pb-2 text-[10px] font-bold uppercase tracking-[var(--ls-label)] text-daf-text-tertiary md:block"
                >
                    Review
                </div>
                <Link
                    v-for="item in links"
                    :key="item.view"
                    :aria-current="
                        view === item.view ||
                        (view === 'profile' && item.view === 'editors')
                            ? 'page'
                            : undefined
                    "
                    :class="[
                        'flex items-center justify-between gap-2 whitespace-nowrap rounded-dafSm px-3 py-[9px] text-daf-body-sm font-bold',
                        view === item.view ||
                        (view === 'profile' && item.view === 'editors')
                            ? 'bg-[var(--brand-soft)] text-daf-text-brand'
                            : 'text-daf-text-secondary hover:bg-[var(--brand-soft)]',
                    ]"
                    :href="route('moderation.index', { view: item.view })"
                >
                    {{ item.label
                    }}<span
                        v-if="counts[item.view] != null"
                        :class="[
                            'rounded-dafPill px-2 font-mono text-[11px]',
                            item.view === 'flagged'
                                ? 'bg-[var(--alert-100)] text-[var(--alert-600)]'
                                : 'bg-daf-surface-alt text-daf-text-tertiary',
                        ]"
                        >{{ counts[item.view] }}</span
                    >
                </Link>
                <div
                    class="mt-[18px] hidden px-3 pb-2 text-[10px] font-bold uppercase tracking-[var(--ls-label)] text-daf-text-tertiary md:block"
                >
                    System
                </div>
                <Link
                    :aria-current="view === 'rules' ? 'page' : undefined"
                    :href="route('moderation.rules.index')"
                    class="whitespace-nowrap rounded-dafSm px-3 py-[9px] text-daf-body-sm font-semibold text-daf-text-secondary hover:bg-[var(--brand-soft)]"
                    >Rules</Link
                >
                <Link
                    :aria-current="view === 'audit' ? 'page' : undefined"
                    :href="route('moderation.index', { view: 'audit' })"
                    class="whitespace-nowrap rounded-dafSm px-3 py-[9px] text-daf-body-sm font-semibold text-daf-text-secondary hover:bg-[var(--brand-soft)]"
                    >Audit log</Link
                >
            </nav>
            <main class="min-w-0"><slot /></main>
        </div>
        <main v-else class="flex flex-1 items-center justify-center px-5 py-10">
            <slot />
        </main>
    </div>
</template>

<style>
.moderation-page .mod-card {
    @apply rounded-dafLg border border-daf-border bg-daf-surface-card shadow-dafCard;
}
.moderation-page .mod-label {
    @apply text-[10px] font-bold uppercase tracking-[var(--ls-label)] text-daf-text-tertiary;
}
.moderation-page .mod-chip {
    @apply inline-flex h-7 items-center whitespace-nowrap rounded-dafPill border border-daf-border px-[11px] text-xs font-semibold text-daf-text-secondary;
}
.moderation-page .mod-chip-active {
    @apply border-daf-brand bg-[var(--brand-soft)] text-daf-text-brand;
}
.moderation-page .mod-input {
    @apply h-10 w-full min-w-0 rounded-dafPill border border-daf-border bg-daf-surface-card px-4 py-0 text-[13px] text-daf-text-primary placeholder:text-daf-text-tertiary focus:border-daf-brand focus:ring-daf-brand;
}
.moderation-page .mod-button {
    @apply inline-flex h-9 items-center justify-center whitespace-nowrap rounded-dafPill border border-daf-border px-4 text-xs font-semibold text-daf-text-secondary hover:border-daf-brand hover:text-daf-text-brand disabled:opacity-50;
}
.moderation-page .mod-link {
    @apply text-[11px] font-semibold text-daf-text-brand hover:underline disabled:opacity-50;
}
.moderation-page .mod-expand {
    @apply flex size-7 items-center justify-center rounded-dafXs text-daf-text-tertiary hover:bg-daf-surface-alt;
}
.moderation-page .mod-subheading {
    @apply font-display text-daf-h3 font-semibold tracking-[var(--ls-display)];
}
.moderation-page td {
    @apply px-3 py-3 align-middle;
}
.moderation-page .mod-details {
    @apply grid grid-cols-[minmax(100px,0.4fr)_minmax(0,1fr)] gap-x-4 gap-y-2 text-xs;
}
.moderation-page .mod-details dt {
    @apply break-words font-mono text-daf-text-tertiary;
}
.moderation-page .mod-details dd {
    @apply break-words text-daf-text-secondary;
}
.moderation-page .mod-table-changesets {
    min-width: 680px;
    table-layout: fixed;
}
.moderation-page .mod-table-changesets th:nth-child(1) {
    width: 116px;
}
.moderation-page .mod-table-changesets th:nth-child(3) {
    width: 164px;
}
.moderation-page .mod-table-changesets th:nth-child(4) {
    width: 15%;
}
.moderation-page .mod-table-changesets th:nth-child(5) {
    width: 88px;
}
.moderation-page .mod-table-changesets th:nth-child(6) {
    width: 48px;
}
.moderation-page .mod-table-nodes,
.moderation-page .mod-table-flagged {
    min-width: 1080px;
}
.moderation-page .mod-table-editors {
    min-width: 960px;
}
.moderation-page .mod-table-areas {
    min-width: 1100px;
}
.moderation-page .mod-table-audit {
    min-width: 650px;
}
@media (max-width: 960px) {
    .moderation-page .mod-table-changesets th:nth-child(4),
    .moderation-page
        .mod-table-changesets
        tr:not(:has(td[colspan]))
        td:nth-child(4) {
        display: none;
    }
}
</style>
