<template>
    <div
        class="flex min-h-full flex-col bg-daf-surface-page text-daf-text-primary"
    >
        <Head title="Private routes around ALPR cameras" />

        <DafSiteHeader
            :links="headerLinks"
            cta-href="/map"
            cta-label="Open Full Map"
            home-href="#top"
        />

        <main>
            <section id="top" class="border-b border-daf-border">
                <div
                    class="mx-auto grid max-w-[var(--width-wide)] items-center gap-8 px-6 py-20 lg:grid-cols-[1.05fr_1fr] lg:py-[88px]"
                >
                    <div>
                        <div
                            class="mb-[18px] font-mono text-daf-label font-bold uppercase tracking-[var(--ls-label)] text-daf-text-brand"
                        >
                            Privacy-first navigation
                        </div>
                        <h1
                            class="m-0 text-balance font-display text-daf-display-lg font-bold tracking-[var(--ls-display)] text-daf-text-primary"
                        >
                            See what's watching the road. Then drive around it.
                        </h1>
                        <p
                            class="mt-5 text-daf-body-lg text-daf-text-secondary"
                        >
                            Drivers Against Flock maps the license-plate readers
                            and roadside cameras along your route — then offers
                            a quieter way through. The fastest way, or the one
                            with fewer little boxes on poles.
                        </p>
                        <form
                            class="mt-7 flex max-w-[440px] gap-2.5"
                            @submit.prevent="openMap"
                        >
                            <input
                                v-model="zipCode"
                                class="min-h-[52px] min-w-0 flex-1 rounded-dafSm border border-daf-border bg-daf-surface-card px-4 text-daf-body text-daf-text-primary shadow-dafCard placeholder:text-daf-text-tertiary focus:border-daf-brand focus:ring-daf-focus"
                                placeholder="Enter your ZIP code"
                                type="text"
                                inputmode="numeric"
                            />
                            <DafButton type="submit" size="lg">
                                Check my area
                            </DafButton>
                        </form>
                        <div class="mt-4 flex flex-wrap gap-2">
                            <DafBadge tone="ghost">Free, always</DafBadge>
                            <DafBadge tone="ghost">No login</DafBadge>
                            <DafBadge tone="ghost">No tracking, ever</DafBadge>
                        </div>
                    </div>

                    <div id="preview">
                        <HeroMapboxPreview />
                    </div>
                </div>
            </section>

            <section
                id="johndoe"
                class="daf-band border-b border-daf-border bg-daf-surface-page text-daf-text-primary"
            >
                <div class="mx-auto max-w-[var(--width-wide)] px-6 py-[88px]">
                    <div class="mb-9 max-w-[84ch]">
                        <div
                            class="mb-4 font-mono text-daf-label font-bold uppercase tracking-[var(--ls-label)] text-daf-alert"
                        >
                            One week · one driver
                        </div>
                        <h2
                            class="m-0 text-balance font-display text-daf-display-md font-bold tracking-[var(--ls-display)] text-daf-text-primary"
                        >
                            This is "John Doe." Watch his week resolve, one
                            pattern at a time.
                        </h2>
                        <p
                            class="mt-4 text-daf-body-lg text-daf-text-secondary"
                        >
                            No GPS. No phone. Just the plate reads left behind
                            on public roads. Each pattern below lights up only
                            the cameras that caught it — and traces the route he
                            drove between them.
                        </p>
                    </div>

                    <div
                        class="grid items-stretch gap-6 lg:grid-cols-[1.45fr_1fr]"
                    >
                        <JohnDoeMapStub
                            :active-pattern="activePattern"
                            :nodes="johnDoeNodes"
                        />

                        <div class="flex flex-col gap-3">
                            <div
                                class="flex flex-col gap-2 rounded-dafLg border border-daf-border bg-daf-surface-card px-4 py-3.5"
                            >
                                <div class="flex items-center gap-3">
                                    <button
                                        class="daf-pressable inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-dafMd border border-daf-border-strong bg-daf-surface-alt px-3.5 text-daf-body-sm font-semibold text-daf-text-primary"
                                        type="button"
                                        aria-label="Pause or resume auto-cycle"
                                        @click="togglePlaying"
                                    >
                                        <span
                                            class="font-mono text-[15px] leading-none"
                                            >{{ playing ? '||' : '▶' }}</span
                                        >
                                        <span>{{
                                            playing ? 'Pause' : 'Play'
                                        }}</span>
                                    </button>
                                    <div
                                        class="h-1.5 flex-1 overflow-hidden rounded-dafPill bg-daf-surface-alt"
                                    >
                                        <div
                                            class="h-full rounded-dafPill bg-daf-alert transition-[width] duration-100"
                                            :style="{
                                                width: `${progressPercent}%`,
                                            }"
                                        />
                                    </div>
                                    <span
                                        class="min-w-[52px] whitespace-nowrap text-right font-mono text-daf-caption text-daf-text-tertiary"
                                    >
                                        {{ countdownLabel }}
                                    </span>
                                </div>
                                <div
                                    class="text-daf-caption leading-[1.4] text-daf-text-tertiary"
                                >
                                    {{ playHint }}
                                </div>
                            </div>

                            <button
                                v-for="(pattern, index) in johnDoePatterns"
                                :key="pattern.id"
                                :class="patternCardClasses(index)"
                                type="button"
                                @click="selectPattern(index)"
                            >
                                <template v-if="index === activePatternIndex">
                                    <span
                                        class="absolute inset-y-0 left-0 w-1 bg-daf-alert"
                                    />
                                    <div class="mb-2 flex items-center gap-2.5">
                                        <span
                                            class="font-mono text-daf-caption font-bold text-daf-alert"
                                        >
                                            {{ pattern.num }}
                                        </span>
                                        <span
                                            class="font-mono text-daf-label font-bold uppercase tracking-[var(--ls-label)] text-daf-alert"
                                        >
                                            {{ pattern.tag }}
                                        </span>
                                    </div>
                                    <div
                                        class="mb-1 font-display text-daf-h3 font-semibold tracking-[var(--ls-heading)] text-daf-text-primary"
                                    >
                                        {{ pattern.title }}
                                    </div>
                                    <div
                                        class="mb-3 font-mono text-daf-caption text-daf-text-tertiary"
                                    >
                                        {{ pattern.when }}
                                    </div>
                                    <p
                                        class="mb-3 text-daf-body-sm leading-[1.5] text-daf-text-secondary"
                                    >
                                        {{ pattern.desc }}
                                    </p>
                                    <div
                                        class="mb-3 rounded-dafMd border border-daf-border bg-daf-surface-alt px-3 py-2.5"
                                    >
                                        <div
                                            class="mb-1 font-mono text-daf-caption font-bold uppercase tracking-[var(--ls-label)] text-daf-text-tertiary"
                                        >
                                            Inferred behavior
                                        </div>
                                        <p
                                            class="m-0 text-daf-body-sm leading-[1.45] text-daf-text-primary"
                                        >
                                            {{ pattern.inference }}
                                        </p>
                                    </div>
                                    <div class="flex flex-wrap gap-1.5">
                                        <span
                                            v-for="camera in pattern.cameraLabels"
                                            :key="`${pattern.id}-${camera}`"
                                            class="inline-flex items-center gap-1.5 rounded-dafPill border border-daf-border bg-daf-surface-alt px-2 py-1 font-mono text-daf-caption text-daf-text-secondary"
                                        >
                                            <span
                                                class="size-1.5 rounded-full bg-daf-alert"
                                            />
                                            {{ camera }}
                                        </span>
                                    </div>
                                </template>

                                <template v-else>
                                    <span
                                        class="shrink-0 font-mono text-daf-caption font-bold text-daf-text-tertiary"
                                    >
                                        {{ pattern.num }}
                                    </span>
                                    <span class="min-w-0 flex-1">
                                        <span
                                            class="block text-daf-body-sm font-semibold text-daf-text-primary"
                                        >
                                            {{ pattern.title }}
                                        </span>
                                        <span
                                            class="block font-mono text-daf-caption uppercase tracking-[var(--ls-label)] text-daf-text-tertiary"
                                        >
                                            {{ pattern.tag }}
                                        </span>
                                    </span>
                                    <DafIcon
                                        class="shrink-0 text-daf-text-tertiary"
                                        name="chevron-right"
                                        size="18"
                                    />
                                </template>
                            </button>
                        </div>
                    </div>
                </div>
            </section>

            <section id="how" class="border-b border-daf-border">
                <div class="mx-auto max-w-[var(--width-wide)] px-6 py-[88px]">
                    <div class="mb-12 max-w-[84ch]">
                        <div
                            class="mb-4 font-mono text-daf-label font-bold uppercase tracking-[var(--ls-label)] text-daf-text-brand"
                        >
                            How ALPR tracking works
                        </div>
                        <h2
                            class="m-0 text-balance font-display text-daf-display-md font-bold tracking-[var(--ls-display)] text-daf-text-primary"
                        >
                            A photo of your plate is a point on a map. Enough
                            points are a story.
                        </h2>
                        <p
                            class="mt-4 text-daf-body-lg text-daf-text-secondary"
                        >
                            You don't have to do anything wrong — or anything at
                            all — to end up in the dataset. Here's the chain, in
                            plain terms.
                        </p>
                    </div>

                    <div class="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
                        <DafCard
                            v-for="step in steps"
                            :key="step.n"
                            class="flex h-full flex-col px-6 py-7"
                        >
                            <div class="mb-4 flex items-center justify-between">
                                <div
                                    class="flex size-[52px] items-center justify-center rounded-dafMd bg-[var(--brand-soft)] text-daf-text-brand"
                                >
                                    <DafIcon :name="step.icon" size="24" />
                                </div>
                                <div
                                    class="font-mono text-[22px] font-bold text-daf-border-strong"
                                >
                                    {{ step.n }}
                                </div>
                            </div>
                            <h3
                                class="m-0 mb-2 font-display text-daf-h3 font-semibold tracking-[var(--ls-heading)] text-daf-text-primary"
                            >
                                {{ step.title }}
                            </h3>
                            <p
                                class="m-0 text-daf-body text-daf-text-secondary"
                            >
                                {{ step.body }}
                            </p>
                        </DafCard>
                    </div>
                </div>
            </section>

            <section
                id="apps"
                class="daf-band bg-daf-surface-page text-daf-text-primary"
            >
                <div
                    class="mx-auto max-w-[var(--width-wide)] px-6 py-[88px] lg:pb-24"
                >
                    <div
                        class="grid items-center gap-14 lg:grid-cols-[1fr_1fr]"
                    >
                        <div>
                            <div
                                class="mb-4 font-mono text-daf-label font-bold uppercase tracking-[var(--ls-label)] text-daf-text-brand"
                            >
                                Get the app
                            </div>
                            <h2
                                class="m-0 font-display text-daf-display-md font-bold tracking-[var(--ls-display)] text-daf-text-primary"
                            >
                                Drive a little less surveilled.
                            </h2>
                            <p
                                class="mt-[18px] max-w-[46ch] text-daf-body-lg text-daf-text-secondary"
                            >
                                Turn-by-turn navigation that knows where the
                                cameras are. Free, no account, nothing to
                                cancel.
                            </p>
                            <div class="mt-7 flex flex-wrap gap-3">
                                <a
                                    :href="iosUrl"
                                    target="_blank"
                                    rel="noreferrer"
                                    class="daf-pressable flex min-h-[58px] min-w-[204px] items-center gap-3 rounded-dafMd bg-daf-surface-inverse px-[18px] py-3 text-daf-text-inverse no-underline"
                                >
                                    <svg
                                        width="22"
                                        height="22"
                                        viewBox="0 0 448 512"
                                        fill="currentColor"
                                        aria-hidden="true"
                                    >
                                        <path
                                            d="M400 32H48C21.5 32 0 53.5 0 80v352c0 26.5 21.5 48 48 48h352c26.5 0 48-21.5 48-48V80c0-26.5-21.5-48-48-48zM127 384.5c-5.5 9.6-17.8 12.8-27.3 7.3-9.6-5.5-12.8-17.8-7.3-27.3l14.3-24.7c16.1-4.9 29.3-1.1 39.6 11.4L127 384.5zm138.9-53.9H84c-11 0-20-9-20-20s9-20 20-20h51l65.4-113.2-20.5-35.4c-5.5-9.6-2.2-21.8 7.3-27.3 9.6-5.5 21.8-2.2 27.3 7.3l8.9 15.4 8.9-15.4c5.5-9.6 17.8-12.8 27.3-7.3 9.6 5.5 12.8 17.8 7.3 27.3l-85.8 148.6h62.1c20.2 0 31.5 23.7 22.7 40zm98.1 0h-29l19.6 33.9c5.5 9.6 2.2 21.8-7.3 27.3-9.6 5.5-21.8 2.2-27.3-7.3-32.9-56.9-57.5-99.7-74-128.1-16.7-29-4.8-58 7.1-67.8 13.1 22.7 32.7 56.7 58.9 102h52c11 0 20 9 20 20 0 11.1-9 20-20 20z"
                                        />
                                    </svg>
                                    <span
                                        class="flex flex-col whitespace-nowrap leading-[1.15]"
                                    >
                                        <span class="text-[11px] opacity-70">
                                            Download on
                                        </span>
                                        <span class="text-[16px] font-bold">
                                            the App Store
                                        </span>
                                    </span>
                                </a>
                                <button
                                    aria-controls="android-install-instructions"
                                    aria-haspopup="dialog"
                                    class="daf-pressable flex min-h-[58px] min-w-[204px] items-center gap-3 rounded-dafMd bg-daf-surface-inverse px-[18px] py-3 text-daf-text-inverse no-underline"
                                    type="button"
                                    @click="openAndroidInstallInstructions"
                                >
                                    <svg
                                        width="22"
                                        height="22"
                                        viewBox="0 0 512 512"
                                        fill="currentColor"
                                        aria-hidden="true"
                                    >
                                        <path
                                            d="M325.3 234.3 104.6 13l280.8 161.2-60.1 60.1zM47 0C34 6.8 25.3 19.2 25.3 35.3v441.3c0 16.1 8.7 28.5 21.7 35.3l256.6-256L47 0zm425.2 225.6-58.9-34.1-65.7 64.5 65.7 64.5 60.1-34.1c18-14.3 18-46.5-1.2-60.8zM104.6 499l280.8-161.2-60.1-60.1L104.6 499z"
                                        />
                                    </svg>
                                    <span
                                        class="flex flex-col whitespace-nowrap leading-[1.15]"
                                    >
                                        <span class="text-[11px] opacity-70">
                                            Get it on
                                        </span>
                                        <span class="text-[16px] font-bold">
                                            Google Play
                                        </span>
                                    </span>
                                </button>
                            </div>
                            <div
                                class="mt-[18px] flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-daf-body-sm text-daf-text-secondary"
                            >
                                <a
                                    :href="apkUrl"
                                    target="_blank"
                                    class="inline-flex items-center gap-[7px] font-semibold text-daf-text-primary no-underline transition-colors hover:text-daf-text-brand"
                                >
                                    <svg
                                        width="15"
                                        height="15"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="2.2"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        aria-hidden="true"
                                    >
                                        <path d="M12 3v12" />
                                        <path d="m7 10 5 5 5-5" />
                                        <path d="M4 21h16" />
                                    </svg>
                                    Download the APK directly
                                </a>
                                <span>
                                    — no Google Play account needed. Verify the
                                    SHA-256 checksum before installing.
                                </span>
                            </div>
                            <div class="mt-[18px] flex flex-wrap gap-2">
                                <DafBadge tone="brand"
                                    >Android Auto — available now</DafBadge
                                >
                                <DafBadge tone="neutral"
                                    >CarPlay — in testing</DafBadge
                                >
                            </div>
                        </div>

                        <DafCard class="p-8">
                            <div
                                class="mb-5 font-display text-daf-h3 font-semibold text-daf-text-primary"
                            >
                                Our promise
                            </div>
                            <div class="flex flex-col gap-4">
                                <div
                                    v-for="promise in promises"
                                    :key="promise.title"
                                    class="flex items-start gap-3"
                                >
                                    <DafIcon
                                        class="mt-0.5 shrink-0 text-daf-brand"
                                        name="check"
                                        size="20"
                                        stroke="2.4"
                                    />
                                    <div>
                                        <div
                                            class="text-daf-body font-semibold text-daf-text-primary"
                                        >
                                            {{ promise.title }}
                                        </div>
                                        <div
                                            class="text-daf-body-sm text-daf-text-secondary"
                                        >
                                            {{ promise.body }}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </DafCard>
                    </div>
                </div>
            </section>

            <section id="android-auto" class="border-y border-daf-border">
                <div class="mx-auto max-w-[var(--width-wide)] px-6 py-[88px]">
                    <div class="mb-11 max-w-[84ch]">
                        <div
                            class="mb-4 font-mono text-daf-label font-bold uppercase tracking-[var(--ls-label)] text-daf-text-brand"
                        >
                            On the dash · available now
                        </div>
                        <h2
                            class="m-0 text-balance font-display text-daf-display-md font-bold tracking-[var(--ls-display)] text-daf-text-primary"
                        >
                            Drivers Against Flock, right on your car's screen.
                        </h2>
                        <p
                            class="mt-4 text-daf-body-lg text-daf-text-secondary"
                        >
                            Plug in and DAF takes over the head unit with full
                            turn-by-turn — big, glanceable directions, your live
                            speed, and the same private routing you get on the
                            phone. CarPlay is on the way.
                        </p>
                    </div>

                    <AndroidAutoScreenStub />

                    <div class="mt-8 grid gap-5 md:grid-cols-3">
                        <DafCard
                            v-for="feature in autoFeatures"
                            :key="feature.title"
                            class="p-6"
                        >
                            <div
                                class="mb-3.5 flex size-[46px] items-center justify-center rounded-dafMd bg-[var(--brand-soft)] text-daf-text-brand"
                            >
                                <DafIcon :name="feature.icon" size="24" />
                            </div>
                            <h3
                                class="m-0 mb-1.5 font-display text-daf-h3 font-semibold tracking-[var(--ls-heading)] text-daf-text-primary"
                            >
                                {{ feature.title }}
                            </h3>
                            <p
                                class="m-0 text-daf-body text-daf-text-secondary"
                            >
                                {{ feature.body }}
                            </p>
                        </DafCard>
                    </div>
                </div>
            </section>

            <section id="faq" class="border-t border-daf-border">
                <div class="mx-auto max-w-[var(--width-wide)] px-6 py-[88px]">
                    <div class="mb-10 max-w-[84ch]">
                        <div
                            class="mb-4 font-mono text-daf-label font-bold uppercase tracking-[var(--ls-label)] text-daf-text-brand"
                        >
                            Common questions
                        </div>
                        <h2
                            class="m-0 text-balance font-display text-daf-display-md font-bold tracking-[var(--ls-display)] text-daf-text-primary"
                        >
                            The short answers, before you ask.
                        </h2>
                        <p
                            class="mt-4 text-daf-body-lg text-daf-text-secondary"
                        >
                            What we map, where it comes from, and what we do —
                            and don't — do with it.
                        </p>
                    </div>

                    <div class="flex flex-col gap-3">
                        <article
                            v-for="(faq, index) in faqItems"
                            :key="faq.question"
                            :data-open="faqOpenIndex === index ? '1' : '0'"
                            class="daf-faq-item"
                        >
                            <button
                                class="flex w-full items-center justify-between gap-[18px] border-0 bg-transparent px-6 py-[22px] text-left font-ui text-daf-text-primary"
                                type="button"
                                :aria-expanded="
                                    faqOpenIndex === index ? 'true' : 'false'
                                "
                                @click="toggleFaq(index)"
                            >
                                <span
                                    class="font-display text-daf-h3 font-semibold tracking-[var(--ls-heading)]"
                                >
                                    {{ faq.question }}
                                </span>
                                <DafIcon
                                    class="daf-faq-chev text-daf-text-tertiary"
                                    name="chevron-down"
                                    size="22"
                                    stroke="2.2"
                                />
                            </button>
                            <div class="daf-faq-answer">
                                <div>
                                    <p
                                        class="m-0 px-6 pb-6 text-daf-body text-daf-text-secondary"
                                    >
                                        {{ faq.answer }}
                                    </p>
                                </div>
                            </div>
                        </article>
                    </div>
                </div>
            </section>
        </main>

        <DafSiteFooter :links="footerLinks" />

        <Modal
            :show="showingAndroidInstallInstructions"
            aria-describedby="android-install-instructions-description"
            aria-labelledby="android-install-instructions-title"
            max-width="md"
            @close="closeAndroidInstallInstructions"
        >
            <div
                id="android-install-instructions"
                class="border border-daf-border bg-daf-surface-card p-6 text-daf-text-primary sm:p-8"
            >
                <div class="flex items-start justify-between gap-4">
                    <div>
                        <div
                            class="font-mono text-daf-label font-bold uppercase tracking-[var(--ls-label)] text-daf-text-brand"
                        >
                            Android testing
                        </div>
                        <h2
                            id="android-install-instructions-title"
                            class="mt-2 font-display text-daf-h2 font-semibold tracking-[var(--ls-heading)]"
                        >
                            Install the Android app
                        </h2>
                    </div>
                    <button
                        aria-label="Close Android app install instructions"
                        class="daf-pressable inline-flex size-10 shrink-0 items-center justify-center rounded-dafPill text-daf-text-secondary hover:bg-daf-surface-alt hover:text-daf-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-daf-focus"
                        type="button"
                        @click="closeAndroidInstallInstructions"
                    >
                        <DafIcon name="x" size="20" />
                    </button>
                </div>

                <p
                    id="android-install-instructions-description"
                    class="mt-4 text-daf-body text-daf-text-secondary"
                >
                    Google Play only shows the test version after you join the
                    Android test group with the same Google account you use in
                    the Play Store.
                </p>

                <ol class="mt-6 flex flex-col gap-4">
                    <li
                        class="flex gap-3 rounded-dafLg border border-daf-border bg-daf-surface-alt p-4"
                    >
                        <span
                            class="inline-flex size-8 shrink-0 items-center justify-center rounded-dafPill bg-daf-brand font-mono text-daf-caption font-bold text-daf-brand-contrast"
                        >
                            1
                        </span>
                        <div
                            class="flex min-w-0 flex-1 flex-col items-start gap-3"
                        >
                            <div>
                                <h3
                                    class="font-display text-daf-h3 font-semibold tracking-[var(--ls-heading)]"
                                >
                                    Join the Google Group
                                </h3>
                                <p
                                    class="mt-1 text-daf-body-sm text-daf-text-secondary"
                                >
                                    Sign in with your Play Store Google account,
                                    then join the Android test group.
                                </p>
                            </div>
                            <DafButton
                                :href="androidTestGroupUrl"
                                external
                                size="sm"
                                variant="secondary"
                            >
                                Join the Android test group
                            </DafButton>
                        </div>
                    </li>
                    <li
                        class="flex gap-3 rounded-dafLg border border-daf-border bg-daf-surface-alt p-4"
                    >
                        <span
                            class="inline-flex size-8 shrink-0 items-center justify-center rounded-dafPill bg-daf-brand font-mono text-daf-caption font-bold text-daf-brand-contrast"
                        >
                            2
                        </span>
                        <div
                            class="flex min-w-0 flex-1 flex-col items-start gap-3"
                        >
                            <div>
                                <h3
                                    class="font-display text-daf-h3 font-semibold tracking-[var(--ls-heading)]"
                                >
                                    Open Google Play
                                </h3>
                                <p
                                    class="mt-1 text-daf-body-sm text-daf-text-secondary"
                                >
                                    Return to Google Play to install the app. It
                                    can take a few minutes for new group access
                                    to appear.
                                </p>
                            </div>
                            <DafButton :href="androidUrl" external size="sm">
                                Open Google Play
                            </DafButton>
                        </div>
                    </li>
                </ol>

                <div class="mt-6 flex justify-end">
                    <DafButton
                        type="button"
                        variant="ghost"
                        @click="closeAndroidInstallInstructions"
                    >
                        Close
                    </DafButton>
                </div>
            </div>
        </Modal>
    </div>
</template>

<script setup>
import DafBadge from '@/Components/Daf/DafBadge.vue';
import DafButton from '@/Components/Daf/DafButton.vue';
import DafCard from '@/Components/Daf/DafCard.vue';
import DafIcon from '@/Components/Daf/DafIcon.vue';
import DafSiteFooter from '@/Components/Daf/DafSiteFooter.vue';
import DafSiteHeader from '@/Components/Daf/DafSiteHeader.vue';
import Modal from '@/Components/Modal.vue';
import AndroidAutoScreenStub from '@/Components/Daf/Marketing/AndroidAutoScreenStub.vue';
import HeroMapboxPreview from '@/Components/Daf/Marketing/HeroMapboxPreview.vue';
import JohnDoeMapStub from '@/Components/Daf/Marketing/JohnDoeMapStub.vue';
import { Head, router } from '@inertiajs/vue3';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

const iosUrl =
    'https://apps.apple.com/us/app/drivers-against-flock/id6741054638';
const androidUrl =
    'https://play.google.com/store/apps/details?id=com.anonymous.drivefree&pli=1';
const androidTestGroupUrl =
    'https://groups.google.com/g/drivers-against-flock-android-test';
const apkUrl = '/downloads/android-apk';

const period = 15000;
const step = 100;
const zipCode = ref('');
const activePatternIndex = ref(0);
const faqOpenIndex = ref(0);
const playing = ref(true);
const progress = ref(0);
const showingAndroidInstallInstructions = ref(false);
let intervalId = null;

const headerLinks = [
    { label: 'John Doe', href: '#johndoe' },
    { label: 'How it works', href: '#how' },
    { label: 'Android Auto', href: '#android-auto' },
    { label: 'Apps', href: '#apps' },
    { label: 'FAQ', href: '#faq' },
    { label: 'Hotlist', href: '/hotlist' },
    { label: 'Contribute', href: '/help' },
];

const footerLinks = [
    { label: 'How it works', href: '#how' },
    { label: 'Full map', href: '/map' },
    { label: 'Apps', href: '#apps' },
    { label: 'FAQ', href: '#faq' },
    { label: 'Help', href: '/help' },
];

const johnDoeNodes = [
    { id: 'home1', coordinates: [-122.286, 37.8049], label: 'Cypress Ave' },
    { id: 'home2', coordinates: [-122.2798, 37.8073], label: '3rd & Elm' },
    {
        id: 'ramp',
        coordinates: [-122.3025, 37.8135],
        label: 'Bay Bridge ramp',
    },
    {
        id: 'dt1',
        coordinates: [-122.4009, 37.7892],
        label: '2nd & Mission',
    },
    {
        id: 'dt2',
        coordinates: [-122.4142, 37.7776],
        label: 'Market & 9th',
    },
    {
        id: 'mid',
        coordinates: [-122.2594, 37.8116],
        label: 'Midtown transit',
    },
    {
        id: 'school',
        coordinates: [-122.2217, 37.8026],
        label: 'Glenview Elem.',
    },
    {
        id: 'grocery',
        coordinates: [-122.2686, 37.8562],
        label: 'Berkeley Bowl',
    },
    { id: 'lake', coordinates: [-122.2578, 37.807], label: 'Lakeside Dr' },
    {
        id: 'foothill',
        coordinates: [-122.2392, 37.7864],
        label: 'Foothill Blvd',
    },
];

const johnDoeNodeLabels = Object.fromEntries(
    johnDoeNodes.map((node) => [node.id, node.label]),
);

const johnDoeZones = {
    home: {
        id: 'home',
        label: 'Home',
        detail: 'Overnight cluster',
        coordinates: [-122.2833, 37.8062],
        radiusMeters: 520,
        tone: 'home',
    },
    work: {
        id: 'work',
        label: 'Work',
        detail: 'Weekday dwell',
        coordinates: [-122.4076, 37.7838],
        radiusMeters: 760,
        tone: 'work',
    },
    school: {
        id: 'school',
        label: 'School',
        detail: '3:14p pickup',
        coordinates: [-122.2217, 37.8026],
        radiusMeters: 420,
        tone: 'school',
    },
    grocery: {
        id: 'grocery',
        label: 'Grocery',
        detail: 'Saturday stop',
        coordinates: [-122.2686, 37.8562],
        radiusMeters: 500,
        tone: 'routine',
    },
    lake: {
        id: 'lake',
        label: 'Lake loop',
        detail: 'Sunday route',
        coordinates: [-122.2578, 37.807],
        radiusMeters: 900,
        tone: 'routine',
    },
};

const johnDoePatterns = [
    {
        id: 'home',
        num: '01',
        tag: 'Where he sleeps',
        title: 'The home block',
        icon: 'home',
        when: 'Every day · ~6:00a & ~11:00p',
        route: ['home2', 'home1'],
        zoneIds: ['home'],
        inference:
            'The likely home zone is the block between the first morning read and the last late-night read.',
        desc: 'The first read of the morning and the last read of the night land on the same two residential cameras, three blocks apart, all week long. A reader that sees your plate leaving at dawn and returning after dark is, in effect, photographing your driveway.',
    },
    {
        id: 'work',
        num: '02',
        tag: 'Where he works',
        title: 'The weekday commute',
        icon: 'briefcase',
        when: 'Mon–Fri · 7:58a out, 6:12p back',
        route: ['home1', 'home2', 'ramp', 'dt1', 'dt2'],
        zoneIds: ['home', 'work'],
        inference:
            'The pattern points to an 8a–6p weekday job: the same plate leaves the home zone, crosses the bridge, and dwells near the work zone.',
        desc: 'Twice every weekday the same chain of readers fires in order — outbound in the morning, reversed at night. Direction plus timing is what separates “lives here” from “works there,” and pins both ends of the trip to an address.',
    },
    {
        id: 'family',
        num: '03',
        tag: 'His family',
        title: 'School pickup',
        icon: 'map-pin',
        when: 'Mon–Fri · 3:14p',
        route: ['dt2', 'mid', 'school'],
        zoneIds: ['work', 'school'],
        inference:
            'A weekday departure from the work zone followed by the same school-side read suggests a recurring child pickup.',
        desc: 'Every weekday afternoon a single camera outside Glenview Elementary catches the plate four minutes before the bell. A recurring stop at a school, at the same minute each day, quietly attaches a child to a person, a place, and a schedule.',
    },
    {
        id: 'weekend',
        num: '04',
        tag: 'His routine',
        title: 'The Sunday loop',
        icon: 'clock',
        when: 'Sat 10:31a · Sun 8:47a',
        route: ['home1', 'grocery', 'lake', 'home1'],
        zoneIds: ['home', 'grocery', 'lake'],
        inference:
            'Weekend reads infer a predictable grocery stop and a Sunday morning lake loop before returning home.',
        desc: 'Saturdays cluster at the grocery; Sunday mornings trace the same loop around the lake and back home. The cadence is weekly and predictable — enough to know, with confidence, where he’ll be next Sunday at 8:47 in the morning.',
    },
].map((pattern) => ({
    ...pattern,
    zones: pattern.zoneIds.map((id) => johnDoeZones[id]).filter(Boolean),
    cameraLabels: [...new Set(pattern.route)].map(
        (id) => johnDoeNodeLabels[id],
    ),
}));

const steps = [
    {
        n: '01',
        title: 'A camera reads your plate',
        body: 'Roadside readers photograph every passing plate — no suspicion or stop required.',
        icon: 'camera',
    },
    {
        n: '02',
        title: 'It becomes a point',
        body: 'Each read is logged with a precise time and location — a single dot on a map.',
        icon: 'map-pin',
    },
    {
        n: '03',
        title: 'Points become a pattern',
        body: 'Strung together, the dots trace your commute, errands, and the places you return to.',
        icon: 'layers',
    },
    {
        n: '04',
        title: 'The pattern can be queried',
        body: 'That history can be searched, shared, or pulled long after you have driven on.',
        icon: 'search',
    },
];

const promises = [
    {
        title: 'Free to use',
        body: 'No subscriptions, no payments, to search and route.',
    },
    {
        title: 'No login required',
        body: 'Search and route without an account.',
    },
    {
        title: 'We don’t sell your data',
        body: 'Your trips stay on your device — we don’t keep them.',
    },
    {
        title: 'Open data',
        body: 'Camera locations from public OpenStreetMap contributors.',
    },
];

const autoFeatures = [
    {
        title: 'Glanceable by design',
        body: 'Oversized type and high contrast, built for a quick look and eyes back on the road.',
        icon: 'clock',
    },
    {
        title: 'Private routes on the dash',
        body: 'Pick the quieter way before you pull out — the same routing you get on your phone.',
        icon: 'shield-check',
    },
    {
        title: 'Camera awareness while driving',
        body: 'A calm heads-up on monitored points ahead — never an alarm, never a distraction.',
        icon: 'camera',
    },
];

const faqItems = [
    {
        question: 'Is Drivers Against Flock really free?',
        answer: 'Yes — completely. No subscription, no paywall, no account to create, and no ads anywhere. The map and routing stay free for everyone. Running it does cost money, so if you want to chip in there’s a Buy Me a Coffee on our Contribute page, but it’s never required.',
    },
    {
        question: 'Where does the camera data come from?',
        answer: 'Every reader location is sourced from OpenStreetMap, the open, community-maintained map of the world. Contributors tag license-plate readers and roadside cameras they spot, and we sync those tags around the clock. It’s all public data — nothing scraped, nothing private.',
    },
    {
        question: 'Do you track me or store my trips?',
        answer: 'Your searches and routes are computed server-side, but nothing is stored or associated with your IP or device. We have nothing to sell or hand over because we never keep it in the first place.',
    },
    {
        question: 'What kinds of cameras does it show?',
        answer: 'Primarily automated license-plate readers (ALPRs) — the pole- and trailer-mounted units that photograph every passing plate — plus other fixed roadside surveillance cameras tagged in OpenStreetMap. We focus on the devices that quietly build a record of your movements.',
    },
    {
        question: 'Is it legal to use?',
        answer: 'Yes. You’re looking at public information about devices on public roads and choosing your own route, which you’re free to do. Drivers Against Flock doesn’t hide your plate or interfere with any camera — it just shows you where they are so you can decide how to drive.',
    },
    {
        question: 'A camera is missing or in the wrong spot — how do I fix it?',
        answer: 'Because the data lives in OpenStreetMap, anyone can correct it: add, move, or remove a reader directly in OSM and the change flows back to us on the next sync. We’re also building an in-app way to flag cameras you spot, so reporting gets even easier soon.',
    },
];

const activePattern = computed(() => johnDoePatterns[activePatternIndex.value]);
const progressPercent = computed(() =>
    Math.min(100, (progress.value / period) * 100),
);
const countdownLabel = computed(() => {
    if (!playing.value) {
        return 'Paused';
    }

    return `Next ${Math.max(1, Math.ceil((period - progress.value) / 1000))}s`;
});
const playHint = computed(() =>
    playing.value
        ? 'Auto-cycling through John Doe’s week — tap a pattern to hold it.'
        : 'Paused — tap a pattern, or press Play to resume.',
);

onMounted(() => {
    intervalId = window.setInterval(() => {
        if (!playing.value) {
            return;
        }

        const nextProgress = progress.value + step;

        if (nextProgress >= period) {
            progress.value = 0;
            activePatternIndex.value =
                (activePatternIndex.value + 1) % johnDoePatterns.length;

            return;
        }

        progress.value = nextProgress;
    }, step);
});

onBeforeUnmount(() => {
    if (intervalId !== null) {
        window.clearInterval(intervalId);
    }
});

function openMap() {
    const normalizedZipCode = normalizeLandingZipCode(zipCode.value);

    router.visit(
        normalizedZipCode
            ? `/map?zip=${encodeURIComponent(normalizedZipCode)}`
            : '/map',
    );
}

function openAndroidInstallInstructions() {
    showingAndroidInstallInstructions.value = true;
}

function closeAndroidInstallInstructions() {
    showingAndroidInstallInstructions.value = false;
}

function normalizeLandingZipCode(value) {
    const trimmedValue = String(value).trim();

    return /^\d{5}(?:-\d{4})?$/.test(trimmedValue) ? trimmedValue : '';
}

function selectPattern(index) {
    activePatternIndex.value = index;
    progress.value = 0;
}

function togglePlaying() {
    playing.value = !playing.value;
}

function toggleFaq(index) {
    faqOpenIndex.value = faqOpenIndex.value === index ? -1 : index;
}

function patternCardClasses(index) {
    if (index === activePatternIndex.value) {
        return [
            'relative cursor-pointer overflow-hidden rounded-dafLg border-[1.5px] border-daf-alert bg-daf-surface-card px-[18px] py-[18px] pl-[22px] text-left shadow-dafCard',
        ];
    }

    return [
        'flex cursor-pointer items-center gap-3 rounded-dafLg border border-daf-border bg-daf-surface-card px-4 py-3.5 text-left opacity-70',
    ];
}
</script>

<style scoped>
.daf-band {
    color-scheme: dark;
    --surface-page: #0b0e12;
    --surface-card: #161b22;
    --surface-card-alt: #1a2027;
    --surface-glass-2: rgba(26, 32, 39, 0.92);
    --text-primary: #f5f7f9;
    --text-secondary: #a9b2bd;
    --text-tertiary: #828d9b;
    --text-brand: var(--green-400);
    --border: #262e37;
    --border-strong: #3a434e;
    --border-glass: rgba(255, 255, 255, 0.1);
    --brand-soft: rgba(31, 191, 107, 0.16);
    --shadow-card:
        0 1px 2px rgba(0, 0, 0, 0.35), 0 8px 26px rgba(0, 0, 0, 0.45);
}

[data-theme='dark'] .daf-band {
    --surface-page: #1a2027;
    --surface-card: #222b35;
    --surface-card-alt: #29333e;
    --border: #313b46;
    --border-strong: #3e4854;
    --shadow-card:
        0 1px 2px rgba(0, 0, 0, 0.45), 0 8px 26px rgba(0, 0, 0, 0.55);
}

.daf-faq-item {
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--surface-card);
    box-shadow: var(--shadow-card);
    transition: border-color var(--dur-base) var(--ease-standard);
}

.daf-faq-item[data-open='1'] {
    border-color: var(--border-strong);
}

.daf-faq-chev {
    transition:
        color var(--dur-base) var(--ease-standard),
        transform var(--dur-base) var(--ease-standard);
}

.daf-faq-item[data-open='1'] .daf-faq-chev {
    color: var(--text-brand);
    transform: rotate(180deg);
}

.daf-faq-answer {
    display: grid;
    grid-template-rows: 0fr;
    transition: grid-template-rows var(--dur-base) var(--ease-standard);
}

.daf-faq-item[data-open='1'] .daf-faq-answer {
    grid-template-rows: 1fr;
}

.daf-faq-answer > div {
    overflow: hidden;
}
</style>
