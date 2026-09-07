<script setup>
import DafIcon from '@/Components/Daf/DafIcon.vue';
import ModerationLayout from '@/Layouts/ModerationLayout.vue';
import { Head } from '@inertiajs/vue3';
import { inject, onMounted, onUnmounted, ref } from 'vue';

const route = inject('route');
defineProps({ loginState: { type: String, default: 'idle' } });
const busy = ref(false);
function reset() {
    busy.value = false;
}
function signIn() {
    if (busy.value) return;
    busy.value = true;
    window.location.assign(route('login.osm'));
}
onMounted(() => window.addEventListener('pageshow', reset));
onUnmounted(() => window.removeEventListener('pageshow', reset));
</script>
<template>
    <ModerationLayout>
        <Head title="Sign in · DAF Moderation"
            ><meta content="noindex, nofollow" name="robots"
        /></Head>
        <section
            aria-labelledby="sign-in-title"
            class="flex w-full max-w-[400px] flex-col gap-6 rounded-dafLg border border-daf-border bg-daf-surface-card p-8 shadow-dafCard"
        >
            <div class="flex flex-col gap-2">
                <h1
                    id="sign-in-title"
                    class="m-0 font-display text-daf-h2 font-bold tracking-[var(--ls-display)]"
                >
                    Sign in
                </h1>
                <p
                    class="m-0 text-daf-body-sm leading-[var(--lh-body)] text-daf-text-secondary"
                >
                    Use your OpenStreetMap account. It's the only way in.
                </p>
            </div>
            <div
                v-if="loginState === 'denied'"
                class="flex items-start gap-2.5 rounded-dafMd border border-[var(--amber-500)] bg-[var(--amber-100)] px-3.5 py-3 text-daf-body-sm text-[var(--amber-600)]"
                role="alert"
            >
                <DafIcon :size="18" name="shield-alert" />
                <div>
                    <strong>Sign-in cancelled.</strong> Nothing was shared. Try
                    again when ready.
                </div>
            </div>
            <div
                v-if="loginState === 'error'"
                class="flex items-start gap-2.5 rounded-dafMd border border-[var(--alert-500)] bg-[var(--alert-100)] px-3.5 py-3 text-daf-body-sm text-[var(--alert-600)]"
                role="alert"
            >
                <DafIcon :size="18" name="triangle-alert" />
                <div>
                    <strong>OpenStreetMap didn't respond.</strong> Wait a minute
                    and try again.
                </div>
            </div>
            <div
                v-if="loginState === 'unapproved'"
                class="flex items-start gap-2.5 rounded-dafMd border border-[var(--amber-500)] bg-[var(--amber-100)] px-3.5 py-3 text-daf-body-sm text-[var(--amber-600)]"
                role="alert"
            >
                <DafIcon :size="18" name="shield-alert" />
                <div>
                    <strong>This account isn't approved.</strong> Ask a
                    moderator administrator to approve your OpenStreetMap
                    account, then try again.
                </div>
            </div>
            <div class="flex flex-col gap-2.5">
                <button
                    :disabled="busy"
                    class="daf-pressable inline-flex h-12 w-full items-center justify-center gap-2.5 rounded-dafPill bg-daf-brand text-daf-body font-bold text-white hover:brightness-105 disabled:cursor-progress disabled:opacity-70"
                    @click="signIn"
                >
                    <span
                        v-if="busy"
                        aria-hidden="true"
                        class="size-[18px] animate-spin rounded-full border-2 border-white/40 border-t-white"
                    /><DafIcon v-else :size="18" name="shield-check" />
                    <span>{{
                        busy
                            ? 'Redirecting to OpenStreetMap…'
                            : loginState === 'idle'
                              ? 'Continue with OpenStreetMap'
                              : 'Try again with OpenStreetMap'
                    }}</span>
                </button>
                <p
                    class="m-0 text-center text-daf-caption leading-[var(--lh-body)] text-daf-text-tertiary"
                >
                    You'll be redirected to openstreetmap.org and back.
                </p>
            </div>
            <p
                class="m-0 border-t border-daf-border pt-4 text-daf-caption leading-[var(--lh-body)] text-daf-text-tertiary"
            >
                Moderator access is granted per account. Signing in with an
                unapproved account won't get you further.
            </p>
        </section>
    </ModerationLayout>
</template>
