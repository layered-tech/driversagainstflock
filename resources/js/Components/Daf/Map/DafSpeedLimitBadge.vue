<template>
    <div class="relative inline-block">
        <div
            :class="signClasses"
            :style="{ height: `${height}px`, width: `${width}px` }"
            :aria-label="`Speed limit ${limit} miles per hour`"
        >
            <span
                class="text-center text-[9px] font-black leading-[10px] tracking-[0.5px]"
            >
                SPEED LIMIT
            </span>
            <span
                class="mt-0.5 font-mono text-[30px] font-black leading-[34px]"
            >
                {{ limit }}
            </span>
            <span
                class="text-center text-[9px] font-black leading-[10px] tracking-[0.5px]"
            >
                MPH
            </span>
        </div>
        <div
            v-if="currentSpeed !== null"
            :class="currentSpeedClasses"
            :style="currentSpeedStyle"
            :aria-label="`Current speed ${currentSpeed} miles per hour`"
        >
            {{ currentSpeed }}
        </div>
    </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
    limit: {
        type: Number,
        required: true,
    },
    currentSpeed: {
        type: Number,
        default: null,
    },
    size: {
        type: String,
        default: 'md',
    },
    currentSpeedPlacement: {
        type: String,
        default: 'bottom-left',
    },
});

const dimensions = computed(
    () =>
        ({
            sm: { height: 66, width: 54 },
            md: { height: 78, width: 64 },
            lg: { height: 92, width: 76 },
        })[props.size] ?? { height: 78, width: 64 },
);

const height = computed(() => dimensions.value.height);
const width = computed(() => dimensions.value.width);
const speedIsOver = computed(
    () => props.currentSpeed !== null && props.currentSpeed > props.limit,
);

const signClasses =
    'flex flex-col items-center justify-center rounded-md border-[3px] border-neutral-950 bg-white px-1 text-neutral-950 shadow-dafFloat';

const currentSpeedClasses = computed(() => [
    'absolute flex size-[42px] items-center justify-center rounded-full border-[3px] bg-white font-mono text-[18px] font-black leading-[22px] shadow-dafMarker',
    speedIsOver.value
        ? 'border-[var(--speed-over)] text-[var(--speed-over)]'
        : 'border-[var(--speed-limit-ring)] text-[var(--speed-ok)]',
]);

const currentSpeedStyle = computed(() =>
    props.currentSpeedPlacement === 'bottom-right'
        ? { bottom: '-10px', right: '-14px' }
        : { bottom: '-10px', left: '-14px' },
);
</script>
