<template>
    <div
        class="flex w-full max-w-[min(18rem,calc(100vw-3rem))] flex-col items-center gap-3"
    >
        <span
            class="flex size-14 items-center justify-center rounded-full border border-daf-border-glass bg-daf-surface-glass shadow-dafFloat backdrop-blur-[var(--blur-glass)]"
        >
            <span
                class="size-8 animate-spin rounded-full border-2 border-daf-border-strong border-t-daf-alert motion-reduce:animate-none"
                aria-hidden="true"
            />
        </span>

        <div class="flex w-full flex-col gap-2">
            <div class="flex items-center justify-between gap-3">
                <span
                    class="min-w-0 truncate font-mono text-daf-label font-bold uppercase tracking-[var(--ls-label)] text-daf-text-secondary"
                >
                    {{ activeStageLabel }}
                </span>
                <span
                    class="shrink-0 font-mono text-daf-caption text-daf-text-tertiary"
                >
                    {{ progressPercent }}%
                </span>
            </div>

            <div
                class="h-1.5 overflow-hidden rounded-dafPill bg-daf-surface-alt"
                role="progressbar"
                aria-valuemin="0"
                aria-valuemax="100"
                :aria-valuenow="progressPercent"
                :aria-label="activeStageLabel"
            >
                <div
                    class="h-full rounded-dafPill bg-daf-alert transition-[width] duration-300 ease-out motion-reduce:transition-none"
                    :style="{ width: `${progressPercent}%` }"
                />
            </div>

            <ol
                class="grid w-full gap-1"
                :style="{
                    gridTemplateColumns: `repeat(${stageCount}, minmax(0, 1fr))`,
                }"
                aria-hidden="true"
            >
                <li
                    v-for="(stage, index) in normalizedStages"
                    :key="stage.key"
                    :class="
                        index <= currentStageIndex
                            ? 'bg-daf-alert'
                            : 'bg-daf-border-strong'
                    "
                    class="h-1 rounded-dafPill transition-colors duration-300 motion-reduce:transition-none"
                />
            </ol>
        </div>
    </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
    stages: {
        type: Array,
        required: true,
    },
    stage: {
        type: String,
        required: true,
    },
});

const normalizedStages = computed(() =>
    props.stages.filter(
        (stage) =>
            stage &&
            typeof stage.key === 'string' &&
            typeof stage.label === 'string',
    ),
);

const stageCount = computed(() => Math.max(normalizedStages.value.length, 1));

const currentStageIndex = computed(() => {
    const index = normalizedStages.value.findIndex(
        (stage) => stage.key === props.stage,
    );

    return index === -1 ? 0 : index;
});

const activeStageLabel = computed(
    () =>
        normalizedStages.value[currentStageIndex.value]?.label ??
        'Loading markers',
);

const progressPercent = computed(() =>
    Math.round(((currentStageIndex.value + 1) / stageCount.value) * 100),
);
</script>
