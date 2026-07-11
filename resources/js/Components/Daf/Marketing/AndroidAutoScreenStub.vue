<template>
    <div
        class="mx-auto max-w-[1020px]"
        @mouseenter="pauseRotation"
        @mouseleave="resumeRotation"
    >
        <div
            class="rounded-[28px] border border-[#222a33] bg-[#0b0e12] p-4 shadow-dafSheet"
        >
            <div
                data-theme="dark"
                class="relative aspect-[119/70] overflow-hidden rounded-dafLg bg-daf-surface-card"
            >
                <Transition name="android-auto-fade">
                    <img
                        :key="activeImage.src"
                        class="absolute inset-0 size-full object-cover"
                        :src="activeImage.src"
                        :alt="activeImage.alt"
                        draggable="false"
                    />
                </Transition>

                <template v-if="galleryImages.length > 1">
                    <button
                        class="absolute left-3 top-1/2 z-10 flex size-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-[#0b0e12]/85 text-white shadow-dafFloat backdrop-blur transition hover:bg-[#161b22]/95 focus:outline-none focus:ring-2 focus:ring-daf-focus"
                        type="button"
                        aria-label="Show previous Android Auto image"
                        @click="showPreviousImage"
                    >
                        <DafIcon name="chevron-left" size="24" stroke="2.4" />
                    </button>

                    <button
                        class="absolute right-3 top-1/2 z-10 flex size-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-[#0b0e12]/85 text-white shadow-dafFloat backdrop-blur transition hover:bg-[#161b22]/95 focus:outline-none focus:ring-2 focus:ring-daf-focus"
                        type="button"
                        aria-label="Show next Android Auto image"
                        @click="showNextImage"
                    >
                        <DafIcon name="chevron-right" size="24" stroke="2.4" />
                    </button>
                </template>
            </div>
        </div>

        <template v-if="galleryImages.length > 1">
            <div
                class="relative mx-6 mt-3 h-2 overflow-hidden rounded-dafPill border border-daf-border-strong bg-daf-surface-card"
                aria-hidden="true"
            >
                <div
                    class="h-full w-full origin-left rounded-dafPill bg-daf-brand transition-transform duration-100 ease-linear"
                    :style="{ transform: `scaleX(${progressScale})` }"
                />
                <div
                    class="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_12px_rgba(255,255,255,0.65)] transition-[left] duration-100 ease-linear"
                    :style="{ left: `${progressPercent}%` }"
                />
            </div>
        </template>
    </div>
</template>

<script setup>
import DafIcon from '@/Components/Daf/DafIcon.vue';
import androidAutoDarkImage from '../../../../assets/android-auto-dark.png';
import androidAutoImage from '../../../../assets/android-auto.png';
import androidAutoMapImage from '../../../../assets/android-auto-map.png';
import androidAutoRouteOptionsImage from '../../../../assets/android-auto-route-options.png';
import androidAutoSearchResultsImage from '../../../../assets/android-auto-search-results.png';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

const galleryInterval = 20000;
const galleryTick = 100;

const galleryImages = [
    {
        src: androidAutoImage,
        alt: 'Android Auto route guidance screenshot',
    },
    {
        src: androidAutoDarkImage,
        alt: 'Android Auto dark route guidance screenshot',
    },
    {
        src: androidAutoMapImage,
        alt: 'Android Auto map screenshot',
    },
    {
        src: androidAutoRouteOptionsImage,
        alt: 'Android Auto route options screenshot',
    },
    {
        src: androidAutoSearchResultsImage,
        alt: 'Android Auto search results screenshot',
    },
];

const fallbackImage = {
    src: '',
    alt: 'Android Auto route guidance screenshot',
};
const activeImageIndex = ref(0);
const isRotationPaused = ref(false);
const elapsedRotationTime = ref(0);
let rotationTickIntervalId = null;

const activeImage = computed(
    () => galleryImages[activeImageIndex.value] ?? fallbackImage,
);
const progressScale = computed(() =>
    Math.min(1, elapsedRotationTime.value / galleryInterval),
);
const progressPercent = computed(() => progressScale.value * 100);

onMounted(() => {
    rotationTickIntervalId = window.setInterval(() => {
        if (isRotationPaused.value || galleryImages.length < 2) {
            return;
        }

        elapsedRotationTime.value += galleryTick;

        if (elapsedRotationTime.value >= galleryInterval) {
            showImage(1);
        }
    }, galleryTick);
});

onBeforeUnmount(() => {
    if (rotationTickIntervalId !== null) {
        window.clearInterval(rotationTickIntervalId);
    }
});

function showPreviousImage() {
    showImage(-1);
}

function showNextImage() {
    showImage(1);
}

function pauseRotation() {
    isRotationPaused.value = true;
}

function resumeRotation() {
    isRotationPaused.value = false;
}

function showImage(direction) {
    if (galleryImages.length < 2) {
        return;
    }

    activeImageIndex.value =
        (activeImageIndex.value + direction + galleryImages.length) %
        galleryImages.length;

    elapsedRotationTime.value = 0;
}
</script>

<style scoped>
.android-auto-fade-enter-active,
.android-auto-fade-leave-active {
    transition: opacity 260ms ease;
}

.android-auto-fade-enter-from,
.android-auto-fade-leave-to {
    opacity: 0;
}
</style>
