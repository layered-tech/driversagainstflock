<template>
    <div
        class="daf-glass flex min-h-[72px] items-center gap-4 rounded-dafLg p-4"
    >
        <span
            class="flex size-12 shrink-0 items-center justify-center rounded-dafSm bg-daf-brand text-daf-brand-contrast"
        >
            <DafIcon :name="icon" size="30" stroke="2.4" />
        </span>
        <div class="min-w-0 flex-1">
            <p
                class="font-display text-daf-h3 font-semibold text-daf-text-primary"
            >
                {{ instruction }}
            </p>
            <p v-if="meta" class="text-daf-body-sm text-daf-text-secondary">
                {{ meta }}
            </p>
        </div>
        <p
            v-if="distance"
            class="font-mono text-daf-title font-semibold text-daf-text-primary"
        >
            {{ distance }}
        </p>
    </div>
</template>

<script setup>
import DafIcon from '../DafIcon.vue';

defineProps({
    icon: {
        type: String,
        default: 'arrow-up',
    },
    instruction: {
        type: String,
        default: 'Continue straight',
    },
    meta: {
        type: String,
        default: '',
    },
    distance: {
        type: String,
        default: '',
    },
});
</script>
