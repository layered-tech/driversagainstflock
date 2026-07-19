<template>
    <div
        class="flex w-full items-center gap-[11px] border-b border-daf-border bg-daf-surface-card px-3.5 py-2.5 text-daf-text-primary md:hidden"
    >
        <img
            class="size-[38px] shrink-0 rounded-dafSm border border-daf-border bg-daf-surface-alt object-contain p-1.5"
            :src="logoMark"
            alt=""
        />

        <div class="min-w-0 flex-1">
            <p class="truncate text-daf-body-sm font-semibold leading-tight">
                DAF — private navigation
            </p>
            <p class="truncate text-daf-caption text-daf-text-tertiary">
                Free on the App Store
            </p>
        </div>

        <DafButton
            class="!min-h-8 !px-3"
            href="https://apps.apple.com/us/app/drivers-against-flock/id6741054638"
            external
            size="sm"
        >
            Open
        </DafButton>

        <button
            class="daf-pressable inline-flex size-8 shrink-0 items-center justify-center rounded-dafPill text-daf-text-tertiary hover:bg-daf-surface-alt hover:text-daf-text-primary"
            type="button"
            aria-label="Dismiss app banner"
            @click="dismiss"
        >
            <DafIcon name="x" size="15" stroke="2.2" />
        </button>
    </div>
</template>

<script setup>
import logoMark from '../../../../assets/daf-logo-mark.png';
import DafButton from '../DafButton.vue';
import DafIcon from '../DafIcon.vue';

const emit = defineEmits(['dismiss']);

function dismiss() {
    emit('dismiss');
}
</script>
