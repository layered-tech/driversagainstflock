<template>
    <div
        class="flex min-h-full flex-col bg-daf-surface-page text-daf-text-primary"
    >
        <DafSiteHead />

        <DafSiteHeader
            :links="headerLinks"
            cta-href="/map"
            cta-label="Open Full Map"
            home-href="/"
        />

        <main>
            <section class="border-b border-daf-border">
                <div
                    class="mx-auto max-w-[var(--width-wide)] px-6 py-14 lg:pb-14 lg:pt-[72px]"
                >
                    <Link
                        class="mb-6 inline-flex items-center gap-2 text-daf-body-sm font-semibold text-daf-text-secondary no-underline hover:text-daf-text-primary"
                        href="/"
                    >
                        <DafIcon name="chevron-left" size="16" stroke="2.2" />
                        Back to home
                    </Link>

                    <div
                        class="mb-4 font-mono text-daf-label font-bold uppercase tracking-[var(--ls-label)] text-daf-text-brand"
                    >
                        Pitch in
                    </div>
                    <h1
                        class="m-0 text-balance font-display text-daf-display-lg font-bold tracking-[var(--ls-display)] text-daf-text-primary"
                    >
                        Help keep the creepy boxes on the map
                    </h1>
                    <p
                        class="mb-0 mt-[18px] max-w-[62ch] text-daf-body-lg text-daf-text-secondary"
                    >
                        Drivers Against Flock is community-run, ad-free, and
                        stubbornly free to use. The bills are real, though —
                        here's how you can keep the map running.
                    </p>
                    <div class="mt-5 flex flex-wrap gap-2">
                        <DafBadge tone="ghost">Community-run</DafBadge>
                        <DafBadge tone="ghost">No ads, ever</DafBadge>
                        <DafBadge tone="ghost">Open data</DafBadge>
                    </div>
                </div>
            </section>

            <section>
                <div class="mx-auto max-w-[var(--width-wide)] px-6 py-14">
                    <div
                        class="mb-[22px] font-mono text-daf-label font-bold uppercase tracking-[var(--ls-label)] text-daf-text-tertiary"
                    >
                        Ways to help
                    </div>

                    <DafCard
                        :padded="false"
                        class="overflow-hidden rounded-dafXl"
                    >
                        <div
                            class="grid items-stretch min-[881px]:grid-cols-[minmax(0,1fr)_400px]"
                        >
                            <div class="min-w-0 p-6 sm:p-9">
                                <div class="mb-[18px] flex items-center gap-3">
                                    <span
                                        class="inline-flex size-11 shrink-0 items-center justify-center rounded-dafMd bg-[var(--brand-soft)] text-daf-text-brand"
                                    >
                                        <DafIcon name="coffee" size="22" />
                                    </span>
                                    <div>
                                        <div
                                            class="font-mono text-daf-label font-bold uppercase leading-tight tracking-[var(--ls-label)] text-daf-text-tertiary"
                                        >
                                            01 · Financial support
                                        </div>
                                        <div
                                            class="mt-1 font-display text-daf-h2 font-bold leading-tight tracking-[var(--ls-heading)] text-daf-text-primary"
                                        >
                                            Buy us a coffee
                                        </div>
                                    </div>
                                </div>

                                <p
                                    class="m-0 mb-6 max-w-[46ch] text-daf-body text-daf-text-secondary"
                                >
                                    Server bills, map tiles, and round-the-clock
                                    OpenStreetMap syncing all cost money. A
                                    coffee — or a few — keeps the lights on and
                                    the map free for everyone. No subscriptions,
                                    no ads, no strings.
                                </p>

                                <div class="grid gap-5 md:grid-cols-3">
                                    <div
                                        v-for="item in fundingUses"
                                        :key="item.title"
                                    >
                                        <span
                                            class="mb-3 flex size-[38px] items-center justify-center rounded-dafSm bg-daf-surface-alt text-daf-text-brand"
                                        >
                                            <DafIcon
                                                :name="item.icon"
                                                size="19"
                                            />
                                        </span>
                                        <div
                                            class="mb-1 text-daf-body-sm font-bold leading-snug text-daf-text-primary"
                                        >
                                            {{ item.title }}
                                        </div>
                                        <div
                                            class="text-daf-caption leading-[1.5] text-daf-text-tertiary"
                                        >
                                            {{ item.body }}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div
                                class="flex flex-col justify-center gap-[18px] border-t border-daf-border bg-daf-surface-alt p-6 sm:p-8 min-[881px]:border-l min-[881px]:border-t-0"
                            >
                                <span
                                    class="inline-flex size-[52px] items-center justify-center rounded-dafMd bg-[var(--brand-soft)] text-daf-text-brand"
                                >
                                    <DafIcon name="coffee" size="26" />
                                </span>

                                <div>
                                    <div
                                        class="mb-2 font-display text-daf-h3 font-bold leading-[1.15] tracking-[var(--ls-heading)] text-daf-text-primary"
                                    >
                                        Any amount helps
                                    </div>
                                    <p
                                        class="m-0 max-w-[40ch] text-daf-body-sm text-daf-text-secondary"
                                    >
                                        Chip in whatever you like — you'll
                                        choose the amount on the next screen.
                                    </p>
                                </div>

                                <a
                                    class="inline-flex w-full items-center justify-center gap-2.5 rounded-dafPill bg-[#ffdd00] px-[22px] py-[15px] text-daf-body-lg font-bold text-[#0d0c0c] no-underline shadow-dafCard transition-[filter,transform] duration-[var(--dur-base)] ease-[var(--ease-standard)] hover:-translate-y-0.5 hover:brightness-105 active:scale-[0.98]"
                                    :href="bmcUrl"
                                    target="_blank"
                                    rel="noopener"
                                >
                                    <DafIcon name="coffee" size="20" />
                                    Buy us a coffee
                                </a>

                                <div
                                    class="flex items-center gap-2 text-daf-caption leading-[1.4] text-daf-text-tertiary"
                                >
                                    <DafIcon
                                        class="shrink-0"
                                        name="shield-check"
                                        size="14"
                                    />
                                    Powered by Buy Me a Coffee · one-time, no
                                    account needed.
                                </div>
                            </div>
                        </div>
                    </DafCard>

                    <p
                        class="mb-0 mt-[18px] text-daf-body-sm leading-[1.5] text-daf-text-tertiary"
                    >
                        More ways to pitch in — like adding cameras you spot to
                        OpenStreetMap — are on the way.
                    </p>
                </div>
            </section>
        </main>

        <DafSiteFooter :links="footerLinks" />
    </div>
</template>

<script setup>
import DafBadge from '@/Components/Daf/DafBadge.vue';
import DafCard from '@/Components/Daf/DafCard.vue';
import DafIcon from '@/Components/Daf/DafIcon.vue';
import DafSiteFooter from '@/Components/Daf/DafSiteFooter.vue';
import DafSiteHead from '@/Components/Daf/DafSiteHead.vue';
import DafSiteHeader from '@/Components/Daf/DafSiteHeader.vue';
import { Link } from '@inertiajs/vue3';

defineProps({
    canLogin: Boolean,
    canRegister: Boolean,
    user: {
        type: Object,
        default: () => null,
    },
});

const bmcUrl = 'https://buymeacoffee.com/driversagainstflock';

const headerLinks = [
    { label: 'John Doe', href: '/#johndoe' },
    { label: 'How it works', href: '/#how' },
    { label: 'Android Auto', href: '/#android-auto' },
    { label: 'Apps', href: '/#apps' },
    { label: 'FAQ', href: '/#faq' },
    { label: 'Hotlist', href: '/hotlist' },
    { label: 'Contribute', href: '/help' },
];

const footerLinks = [
    { label: 'How it works', href: '/#how' },
    { label: 'Full map', href: '/map' },
    { label: 'Help', href: '/help' },
];

const fundingUses = [
    {
        icon: 'layers',
        title: 'Servers & map tiles',
        body: 'Every map you pan loads tiles we pay for. Coffees keep them loading fast.',
    },
    {
        icon: 'map-pin',
        title: 'Fresh camera data',
        body: 'We sync new ALPR locations from OpenStreetMap around the clock.',
    },
    {
        icon: 'shield-check',
        title: 'No ads, no trackers',
        body: "We'll never sell your trips or run ads. Donations are what keep that promise.",
    },
];
</script>
