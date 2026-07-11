<template>
    <div
        class="flex min-h-full flex-col bg-daf-surface-page text-daf-text-primary"
    >
        <Head title="Privacy Policy" />

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
                        Privacy Policy
                    </h1>
                    <p
                        class="mb-0 mt-[18px] max-w-[60ch] text-daf-body-lg text-daf-text-secondary"
                    >
                        We built Drivers Against Flock because tracking drivers
                        is wrong. It would be hypocritical to turn around and
                        track you. This page explains, in plain language,
                        exactly what that means.
                    </p>
                    <div class="mt-5 flex flex-wrap gap-2">
                        <DafBadge tone="ghost">
                            Last updated {{ lastUpdated }}
                        </DafBadge>
                        <DafBadge tone="ghost">Location optional</DafBadge>
                        <DafBadge tone="ghost">No ads, ever</DafBadge>
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
                        aria-label="Privacy policy sections"
                    >
                        <div
                            class="mb-3 font-mono text-daf-label font-bold uppercase tracking-[var(--ls-label)] text-daf-text-tertiary"
                        >
                            On this page
                        </div>
                        <a
                            v-for="section in privacySections"
                            :key="section.id"
                            class="py-1.5 text-daf-body-sm leading-[1.4] text-daf-text-secondary no-underline hover:text-daf-text-primary"
                            :href="`#${section.id}`"
                        >
                            {{ section.title }}
                        </a>
                    </nav>

                    <div class="min-w-0">
                        <section
                            v-for="section in privacySections"
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
                                Questions?
                            </h2>
                            <p
                                class="mb-2 mt-0 text-daf-body text-daf-text-secondary"
                            >
                                If anything here is unclear, or you want to
                                request deletion of account information, reach
                                us at
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
        title: 'Location is optional',
        body: 'The app works with or without it. Deny or revoke access anytime — and we never store your location history.',
    },
    {
        title: 'We don’t sell or advertise',
        body: 'No selling personal data, no advertisers, no advertising profiles. Ever.',
    },
    {
        title: 'Sign-in is optional',
        body: 'Use OpenStreetMap OAuth if you want — we never see your password, only the basics you allow.',
    },
];

const privacySections = [
    {
        id: 'overview',
        title: 'Overview',
        blocks: [
            {
                type: 'paragraph',
                text: 'Drivers Against Flock ("DAF," "we," "us") is a privacy-focused navigation app operated by LayeredTech, LLC. It is designed to collect only the information needed to provide app features.',
            },
            {
                type: 'paragraph',
                text: 'The app helps you search for places, view maps, get directions, and choose routes with privacy in mind. DAF works with or without location access — granting it can improve features like showing your current position, searching nearby, and routing from where you are, but the app stays usable if you deny it.',
            },
            {
                type: 'paragraph',
                text: 'We do not sell personal information. We do not use it for advertising. We do not build advertising profiles about users.',
            },
        ],
    },
    {
        id: 'info-we-collect',
        title: 'Information we collect and use',
        blocks: [
            { type: 'heading', text: 'Location information' },
            {
                type: 'paragraph',
                text: 'DAF may request access to your device’s location. If you grant it, your location may be used to provide app features such as:',
            },
            {
                type: 'list',
                items: [
                    'Showing your current location on the map',
                    'Searching for nearby places',
                    'Calculating routes and directions',
                    'Supporting navigation features',
                ],
            },
            {
                type: 'paragraph',
                text: 'DAF does not store your location history. When location is needed for a feature, it may be sent to the service required to complete that request — for example, search information may go to Google Maps, and origin, destination, or route information may go to OpenRouteService.',
            },
            {
                type: 'paragraph',
                text: 'You can deny location access and still use the app, and you can revoke it at any time through your device settings.',
            },
            { type: 'heading', text: 'Search and routing information' },
            {
                type: 'paragraph',
                text: 'When you search for a place, enter a destination, or request directions, the app may process that information to provide the feature. This can include search terms, manually entered locations, your current location (if enabled), route start and end points, and routing preferences.',
            },
            { type: 'heading', text: 'OpenStreetMap account information' },
            {
                type: 'paragraph',
                text: 'DAF lets you sign in using the OpenStreetMap.org OAuth provider. If you choose to, we may receive limited account information from OpenStreetMap — your display name, email address, and OpenStreetMap user ID — which we use to identify your account and support connected features. DAF never receives or stores your OpenStreetMap password.',
            },
        ],
    },
    {
        id: 'third-party',
        title: 'Third-party services',
        blocks: [
            {
                type: 'paragraph',
                text: 'DAF uses third-party services to provide certain app features:',
            },
            {
                type: 'list',
                items: [
                    'Google Maps — for place searching',
                    'OpenRouteService — for directions and route calculation',
                    'OpenStreetMap.org — for optional account sign-in through OAuth',
                ],
            },
            {
                type: 'paragraph',
                text: 'When you use a feature that depends on these services, the information needed to complete your request may be sent to the relevant service. Your use of these services may also be subject to their own privacy policies and terms.',
            },
        ],
    },
    {
        id: 'no-sell',
        title: 'Not sold, not for advertising',
        blocks: [
            {
                type: 'list',
                items: [
                    'DAF does not sell personal information.',
                    'DAF does not share personal information with advertisers.',
                    'DAF does not use your location, search, routing, or account information to build advertising profiles.',
                ],
            },
        ],
    },
    {
        id: 'how-we-use',
        title: 'How we use information',
        blocks: [
            {
                type: 'paragraph',
                text: 'We use information only to provide, maintain, and improve app functionality, including:',
            },
            {
                type: 'list',
                items: [
                    'Displaying maps and searching for places',
                    'Providing directions and supporting navigation',
                    'Showing route options',
                    'Authenticating users who choose to sign in with OpenStreetMap',
                    'Maintaining app security and reliability',
                ],
            },
        ],
    },
    {
        id: 'sharing',
        title: 'How information is shared',
        blocks: [
            {
                type: 'paragraph',
                text: 'DAF may share information with third-party services only as needed to provide the feature you requested — place search through Google Maps, directions and routing through OpenRouteService, and optional account sign-in through OpenStreetMap OAuth.',
            },
            {
                type: 'paragraph',
                text: 'We may also disclose information if required by law or legal process, or to protect the rights, safety, and security of DAF, LayeredTech, LLC, our users, or others.',
            },
        ],
    },
    {
        id: 'retention',
        title: 'Data retention',
        blocks: [
            {
                type: 'paragraph',
                text: 'DAF does not store your location history. If you sign in with OpenStreetMap, we may retain your display name, email address, and OpenStreetMap user ID for as long as needed to support your account or app features.',
            },
            {
                type: 'paragraph',
                text: 'If you want your account information deleted, contact us at support@driversagainstflock.com.',
            },
        ],
    },
    {
        id: 'your-choices',
        title: 'Your choices',
        blocks: [
            {
                type: 'paragraph',
                text: 'You control whether DAF can access your location. You can:',
            },
            {
                type: 'list',
                items: [
                    'Deny location access when prompted',
                    'Use the app without location access',
                    'Enter locations manually instead of using your current location',
                    'Revoke location access through your device settings',
                    'Choose whether to sign in with OpenStreetMap',
                    'Request deletion of account information associated with your OpenStreetMap login',
                ],
            },
        ],
    },
    {
        id: 'osm-signin',
        title: 'OpenStreetMap sign-in',
        blocks: [
            {
                type: 'paragraph',
                text: 'DAF uses OpenStreetMap OAuth for optional account sign-in. OAuth lets you sign in with your OpenStreetMap account without giving DAF your OpenStreetMap password.',
            },
            {
                type: 'paragraph',
                text: 'If you use OpenStreetMap sign-in, OpenStreetMap may provide us with your display name, email address, and OpenStreetMap user ID.',
            },
        ],
    },
    {
        id: 'security',
        title: 'Security',
        blocks: [
            {
                type: 'paragraph',
                text: 'We use reasonable technical and organizational measures to protect the information we process. No system can be guaranteed completely secure, but DAF is designed to limit the information collected and avoid storing unnecessary data such as location history.',
            },
        ],
    },
    {
        id: 'children',
        title: 'Children’s privacy',
        blocks: [
            {
                type: 'paragraph',
                text: 'DAF is not intended for children under 13. We do not knowingly collect personal information from children under 13. If you believe a child has provided us personal information, contact us and we will take appropriate steps to delete it.',
            },
        ],
    },
    {
        id: 'changes',
        title: 'Changes to this policy',
        blocks: [
            {
                type: 'paragraph',
                text: 'We may update this Privacy Policy from time to time. If we make material changes, we will update the "Last updated" date above and may provide additional notice in the app or on our website.',
            },
        ],
    },
];
</script>
