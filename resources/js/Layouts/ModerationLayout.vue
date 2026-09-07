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
    { view: 'editors', label: 'Editors' },
    { view: 'areas', label: 'Areas' },
];
</script>
<template>
    <div
        class="flex min-h-screen flex-col bg-daf-surface-page font-ui text-daf-text-primary antialiased"
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
                            item.view === 'nodes'
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
