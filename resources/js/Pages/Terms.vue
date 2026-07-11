<template>
    <div
        class="flex min-h-full flex-col bg-daf-surface-page text-daf-text-primary"
    >
        <Head title="Terms of Use" />

        <DafSiteHeader
            :links="headerLinks"
            cta-href="/map"
            cta-label="Open Full Map"
            home-href="/"
        />

        <main>
            <section class="border-b border-daf-border">
                <div
                    class="mx-auto max-w-[var(--width-wide)] px-6 py-14 lg:py-[72px]"
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
                        Legal
                    </div>
                    <h1
                        class="m-0 text-balance font-display text-daf-display-lg font-bold tracking-[var(--ls-display)] text-daf-text-primary"
                    >
                        Terms of Use
                    </h1>
                    <p
                        class="mb-0 mt-[18px] max-w-[60ch] text-daf-body-lg text-daf-text-secondary"
                    >
                        These Terms are the agreement between you and Drivers
                        Against Flock. They cover what the app does, what it
                        does not promise, and the rules for using it. By using
                        the app, you agree to them in plain language below.
                    </p>
                    <div class="mt-5 flex flex-wrap gap-2">
                        <DafBadge tone="ghost">
                            Effective {{ lastUpdated }}
                        </DafBadge>
                        <DafBadge tone="ghost">Ages 13+</DafBadge>
                        <DafBadge tone="ghost">
                            Drive safely & legally
                        </DafBadge>
                    </div>
                </div>
            </section>

            <section class="border-b border-daf-border">
                <div class="mx-auto max-w-[var(--width-wide)] px-6 py-14">
                    <div
                        class="mb-5 font-mono text-daf-label font-bold uppercase tracking-[var(--ls-label)] text-daf-text-tertiary"
                    >
                        The short version
                    </div>
                    <div class="grid gap-5 md:grid-cols-3">
                        <DafCard
                            v-for="item in tldr"
                            :key="item.title"
                            :padded="false"
                            class="p-6"
                        >
                            <span
                                class="mb-3.5 flex size-[42px] items-center justify-center rounded-dafMd bg-[var(--brand-soft)] text-daf-text-brand"
                            >
                                <DafIcon name="check" size="20" stroke="2.4" />
                            </span>
                            <h2
                                class="m-0 mb-1.5 font-display text-daf-h3 font-semibold tracking-[var(--ls-heading)] text-daf-text-primary"
                            >
                                {{ item.title }}
                            </h2>
                            <p
                                class="m-0 text-daf-body text-daf-text-secondary"
                            >
                                {{ item.body }}
                            </p>
                        </DafCard>
                    </div>
                </div>
            </section>

            <section>
                <div
                    class="mx-auto grid max-w-[var(--width-wide)] gap-12 px-6 py-16 lg:grid-cols-[240px_1fr] lg:gap-14 lg:py-[88px]"
                >
                    <nav
                        class="hidden flex-col gap-0.5 self-start lg:sticky lg:top-24 lg:flex"
                        aria-label="Terms of use sections"
                    >
                        <div
                            class="mb-3 font-mono text-daf-label font-bold uppercase tracking-[var(--ls-label)] text-daf-text-tertiary"
                        >
                            On this page
                        </div>
                        <a
                            v-for="section in termsSections"
                            :key="section.id"
                            class="py-1.5 text-daf-body-sm leading-[1.4] text-daf-text-secondary no-underline hover:text-daf-text-primary"
                            :href="`#${section.id}`"
                        >
                            {{ section.title }}
                        </a>
                    </nav>

                    <div class="min-w-0">
                        <section
                            v-for="section in termsSections"
                            :id="section.id"
                            :key="section.id"
                            class="mb-11 scroll-mt-24 border-b border-daf-border pb-11"
                        >
                            <h2
                                class="m-0 mb-[18px] font-display text-daf-h2 font-bold tracking-[var(--ls-heading)] text-daf-text-primary"
                            >
                                {{ section.title }}
                            </h2>

                            <template
                                v-for="(block, index) in section.blocks"
                                :key="`${section.id}-${index}`"
                            >
                                <h3
                                    v-if="block.type === 'heading'"
                                    class="mb-2.5 mt-5 font-display text-daf-h3 font-semibold tracking-[var(--ls-heading)] text-daf-text-primary"
                                >
                                    {{ block.text }}
                                </h3>
                                <p
                                    v-else-if="block.type === 'paragraph'"
                                    class="mb-3.5 mt-0 text-daf-body text-daf-text-secondary"
                                >
                                    {{ block.text }}
                                </p>
                                <ul
                                    v-else-if="block.type === 'list'"
                                    class="mb-3.5 mt-0 flex list-disc flex-col gap-2 pl-6 text-daf-body text-daf-text-secondary"
                                >
                                    <li v-for="item in block.items" :key="item">
                                        {{ item }}
                                    </li>
                                </ul>
                            </template>
                        </section>

                        <DafCard
                            id="contact"
                            :padded="false"
                            class="scroll-mt-24 p-6 sm:p-8"
                        >
                            <h2
                                class="m-0 mb-2.5 font-display text-daf-h3 font-bold tracking-[var(--ls-heading)] text-daf-text-primary"
                            >
                                Questions about these Terms?
                            </h2>
                            <p
                                class="mb-2 mt-0 text-daf-body text-daf-text-secondary"
                            >
                                If anything here is unclear, reach us at
                                <a
                                    class="text-daf-text-brand no-underline hover:underline"
                                    href="mailto:support@driversagainstflock.com"
                                >
                                    support@driversagainstflock.com</a
                                >.
                            </p>
                            <p
                                class="m-0 text-daf-body-sm text-daf-text-tertiary"
                            >
                                Drivers Against Flock is operated by
                                LayeredTech, LLC.
                            </p>
                        </DafCard>
                    </div>
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
import DafSiteHeader from '@/Components/Daf/DafSiteHeader.vue';
import { Head, Link } from '@inertiajs/vue3';

defineProps({
    canLogin: Boolean,
    canRegister: Boolean,
    user: {
        type: Object,
        default: () => null,
    },
});

const lastUpdated = 'June 2026';

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
    { label: 'Apps', href: '/#apps' },
    { label: 'FAQ', href: '/#faq' },
    { label: 'Help', href: '/help' },
];

const tldr = [
    {
        title: 'Drive safely & legally',
        body: 'Obey traffic laws and real-world conditions. The app assists your judgment; it never replaces it.',
    },
    {
        title: 'Provided as is',
        body: 'Routes and marker data may be incomplete or wrong. We make no guarantee a route is safe, legal, or surveillance-free.',
    },
    {
        title: 'Your content, your rights',
        body: 'Submit only what you have the right to. You keep ownership; you grant us a license to use it to run the app.',
    },
];

const termsSections = [
    {
        id: 'about',
        title: '1. About Drivers Against Flock',
        blocks: [
            {
                type: 'paragraph',
                text: 'These Terms of Use govern your access to and use of Drivers Against Flock, including the mobile app, website, map features, navigation features, routing tools, place search, marker data, and related services. By using Drivers Against Flock, you agree to these Terms. If you do not agree, do not use the app or service.',
            },
            {
                type: 'paragraph',
                text: 'Drivers Against Flock is a privacy-focused navigation and mapping app designed to help users discover places, view map information, get directions, and choose routes with fewer known ALPR, surveillance, or similar roadside devices.',
            },
            {
                type: 'paragraph',
                text: 'Drivers Against Flock may provide information about cameras, surveillance devices, routes, places, traffic-related conditions, and other map-based data. This information is provided for general informational and navigation purposes only.',
            },
        ],
    },
    {
        id: 'eligibility',
        title: '2. Eligibility',
        blocks: [
            {
                type: 'paragraph',
                text: 'You must be at least 13 years old to use Drivers Against Flock.',
            },
            {
                type: 'paragraph',
                text: 'By using the app, you confirm that you are old enough to use it and that your use of the app is legal in your location.',
            },
        ],
    },
    {
        id: 'safe-legal',
        title: '3. Safe and legal use',
        blocks: [
            {
                type: 'paragraph',
                text: 'You are responsible for using Drivers Against Flock safely and legally. Do not use the app in a way that distracts you while driving. Always obey traffic laws, road signs, posted speed limits, law enforcement instructions, and real-world road conditions.',
            },
            {
                type: 'paragraph',
                text: 'Drivers Against Flock is not a substitute for your own judgment. Routes, alerts, map markers, directions, and other information may be incomplete, outdated, inaccurate, or unavailable.',
            },
            {
                type: 'paragraph',
                text: 'You agree not to use Drivers Against Flock to:',
            },
            {
                type: 'list',
                items: [
                    'Violate any law or regulation',
                    'Interfere with public safety or emergency services',
                    'Harass, threaten, stalk, or harm any person',
                    'Damage, tamper with, or interfere with property or infrastructure',
                    'Scrape, copy, or misuse app data without permission',
                    'Reverse engineer, exploit, overload, or disrupt the app or related services',
                    'Use the app for unlawful surveillance, evasion, or other illegal activity',
                ],
            },
        ],
    },
    {
        id: 'navigation',
        title: '4. Navigation and routing disclaimer',
        blocks: [
            {
                type: 'paragraph',
                text: 'Drivers Against Flock may provide directions, routing options, estimated travel times, and route comparisons.',
            },
            {
                type: 'paragraph',
                text: 'Routes may be incorrect, unsafe, unavailable, or unsuitable for your vehicle or situation. Roads may be closed, restricted, private, dangerous, or otherwise inappropriate. You are solely responsible for deciding whether to follow any route or instruction.',
            },
            {
                type: 'paragraph',
                text: 'Drivers Against Flock does not guarantee that any route is safe, legal, private, accurate, or free of surveillance devices.',
            },
        ],
    },
    {
        id: 'marker-data',
        title: '5. Surveillance device and marker data',
        blocks: [
            {
                type: 'paragraph',
                text: 'Drivers Against Flock may display known or reported ALPR cameras, surveillance devices, or similar markers.',
            },
            {
                type: 'paragraph',
                text: 'This data may be incomplete, inaccurate, outdated, duplicated, or based on third-party or community-sourced information. A missing marker does not mean a location is free from surveillance. A displayed marker does not guarantee that a device is active, operational, lawful, or accurately classified.',
            },
            {
                type: 'paragraph',
                text: 'Drivers Against Flock does not guarantee the accuracy, completeness, or availability of any marker data.',
            },
        ],
    },
    {
        id: 'location',
        title: '6. Location features',
        blocks: [
            {
                type: 'paragraph',
                text: 'Drivers Against Flock may request access to your device location to support features such as map positioning, nearby search, routing, and navigation.',
            },
            {
                type: 'paragraph',
                text: 'Location access is optional. The app can still be used without granting location access, though some features may be less convenient or may require manual input.',
            },
            {
                type: 'paragraph',
                text: 'Use of location-related features is also governed by our Privacy Policy.',
            },
        ],
    },
    {
        id: 'osm-login',
        title: '7. OpenStreetMap login',
        blocks: [
            {
                type: 'paragraph',
                text: 'Drivers Against Flock may allow you to sign in using OpenStreetMap.org through OAuth.',
            },
            {
                type: 'paragraph',
                text: "If you choose to sign in, you are responsible for maintaining access to your OpenStreetMap account and complying with OpenStreetMap's own terms and policies.",
            },
            {
                type: 'paragraph',
                text: 'Drivers Against Flock is not responsible for OpenStreetMap, its availability, its account system, or any changes to its service.',
            },
        ],
    },
    {
        id: 'third-party',
        title: '8. Third-party services',
        blocks: [
            {
                type: 'paragraph',
                text: 'Drivers Against Flock may rely on third-party services for maps, routing, directions, place search, authentication, hosting, infrastructure, or other app functionality.',
            },
            {
                type: 'paragraph',
                text: 'These services may have their own terms, privacy policies, rate limits, restrictions, data practices, and availability. Drivers Against Flock is not responsible for third-party services, data, outages, errors, or changes.',
            },
        ],
    },
    {
        id: 'contributions',
        title: '9. User contributions and reports',
        blocks: [
            {
                type: 'paragraph',
                text: 'Drivers Against Flock may allow users to submit, edit, report, or suggest map data, marker locations, corrections, or other content.',
            },
            {
                type: 'paragraph',
                text: 'If you submit content, you represent that you have the right to submit it and that it is accurate to the best of your knowledge.',
            },
            {
                type: 'paragraph',
                text: 'You grant Drivers Against Flock a non-exclusive, worldwide, royalty-free license to use, reproduce, modify, display, distribute, and incorporate your submitted content for operating, improving, and providing the app and related services.',
            },
            {
                type: 'paragraph',
                text: 'Do not submit content that is unlawful, misleading, defamatory, invasive of privacy, threatening, abusive, spam, or otherwise harmful. We may review, edit, reject, or remove submitted content at our discretion.',
            },
        ],
    },
    {
        id: 'availability',
        title: '10. App availability',
        blocks: [
            {
                type: 'paragraph',
                text: 'Drivers Against Flock may change, suspend, discontinue, limit, or remove any feature at any time.',
            },
            {
                type: 'paragraph',
                text: 'We do not guarantee that the app will always be available, uninterrupted, secure, accurate, or error-free.',
            },
        ],
    },
    {
        id: 'ip',
        title: '11. Intellectual property',
        blocks: [
            {
                type: 'paragraph',
                text: 'Drivers Against Flock, including its name, branding, design, software, interface, features, and original content, is owned by LayeredTech, LLC or its licensors.',
            },
            {
                type: 'paragraph',
                text: 'You may not copy, modify, distribute, sell, lease, reverse engineer, or create derivative works from Drivers Against Flock except as allowed by law or with written permission.',
            },
            {
                type: 'paragraph',
                text: 'Third-party map data, routing data, place data, and other third-party content may be subject to separate rights and licenses.',
            },
        ],
    },
    {
        id: 'feedback',
        title: '12. Feedback',
        blocks: [
            {
                type: 'paragraph',
                text: 'If you send us feedback, ideas, suggestions, bug reports, or feature requests, you allow us to use them without restriction or compensation to you.',
            },
        ],
    },
    {
        id: 'no-warranties',
        title: '13. No warranties',
        blocks: [
            {
                type: 'paragraph',
                text: 'Drivers Against Flock is provided "as is" and "as available."',
            },
            {
                type: 'paragraph',
                text: 'To the fullest extent permitted by law, we disclaim all warranties, whether express, implied, or statutory, including warranties of accuracy, reliability, availability, merchantability, fitness for a particular purpose, non-infringement, and safety.',
            },
            {
                type: 'paragraph',
                text: 'We do not warrant that the app will meet your needs, operate without interruption, be error-free, or provide accurate routes, marker data, map data, place data, or navigation information.',
            },
        ],
    },
    {
        id: 'liability',
        title: '14. Limitation of liability',
        blocks: [
            {
                type: 'paragraph',
                text: 'To the fullest extent permitted by law, LayeredTech, LLC and its owners, developers, contributors, affiliates, service providers, and licensors will not be liable for any indirect, incidental, special, consequential, exemplary, or punitive damages, or for any loss of profits, data, goodwill, use, or other intangible losses. This includes damages resulting from:',
            },
            {
                type: 'list',
                items: [
                    'Your use of or inability to use Drivers Against Flock',
                    'Navigation decisions or driving behavior',
                    'Inaccurate, missing, or outdated map, route, place, or marker data',
                    'Third-party services or outages',
                    'Unauthorized access, bugs, errors, or interruptions',
                    'Any conduct or content of other users or third parties',
                ],
            },
            {
                type: 'paragraph',
                text: 'To the fullest extent permitted by law, our total liability for any claim related to Drivers Against Flock will not exceed the greater of $100 or the amount you paid to use the app in the 12 months before the claim.',
            },
        ],
    },
    {
        id: 'indemnification',
        title: '15. Indemnification',
        blocks: [
            {
                type: 'paragraph',
                text: "You agree to defend, indemnify, and hold harmless LayeredTech, LLC and its owners, developers, contributors, affiliates, service providers, and licensors from any claims, damages, losses, liabilities, costs, and expenses, including reasonable attorneys' fees, arising from:",
            },
            {
                type: 'list',
                items: [
                    'Your use of Drivers Against Flock',
                    'Your violation of these Terms',
                    'Your violation of any law or regulation',
                    'Your submitted content',
                    'Your misuse of app data or third-party services',
                ],
            },
        ],
    },
    {
        id: 'termination',
        title: '16. Termination',
        blocks: [
            {
                type: 'paragraph',
                text: 'We may suspend or terminate your access to Drivers Against Flock at any time if we believe you violated these Terms, created risk, caused harm, or misused the app. You may stop using Drivers Against Flock at any time.',
            },
            {
                type: 'paragraph',
                text: 'Sections that by their nature should survive termination will continue to apply, including intellectual property, disclaimers, limitation of liability, indemnification, and dispute provisions.',
            },
        ],
    },
    {
        id: 'changes',
        title: '17. Changes to these Terms',
        blocks: [
            {
                type: 'paragraph',
                text: 'We may update these Terms from time to time. If we make changes, we will update the effective date above. Continued use of Drivers Against Flock after the updated Terms become effective means you accept the updated Terms.',
            },
        ],
    },
    {
        id: 'governing-law',
        title: '18. Governing law',
        blocks: [
            {
                type: 'paragraph',
                text: 'These Terms are governed by the laws of the State of Delaware, without regard to conflict of law principles.',
            },
            {
                type: 'paragraph',
                text: 'Any disputes related to these Terms or Drivers Against Flock will be handled in the courts located in Delaware, unless applicable law requires otherwise.',
            },
        ],
    },
];
</script>
