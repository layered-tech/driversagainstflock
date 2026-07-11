<template>
    <div
        class="overflow-hidden rounded-daf2xl border border-daf-border bg-[var(--map-water)] shadow-dafCard"
    >
        <div
            class="relative aspect-[16/11] overflow-hidden bg-[var(--map-water)]"
        >
            <div
                ref="mapContainer"
                class="mapbox-hero absolute inset-0 z-0 size-full"
            />

            <div
                v-if="mapMessage"
                class="absolute inset-0 flex items-center justify-center bg-daf-surface-alt px-6 text-center text-daf-body-sm text-daf-text-secondary"
            >
                {{ mapMessage }}
            </div>

            <div
                class="absolute bottom-4 left-4 rounded-dafMd border border-daf-border-glass bg-daf-surface-glass-2 px-4 py-3 shadow-dafFloat backdrop-blur-[var(--blur-glass)]"
            >
                <div
                    class="font-mono text-[24px] font-extrabold leading-none text-daf-text-primary"
                >
                    {{ formattedMarkerCount }}
                </div>
                <div class="mt-1 text-daf-caption text-daf-text-secondary">
                    {{ markerStatLabel }}
                </div>
            </div>

            <Transition name="map-splash">
                <div
                    v-if="heroSplashIsVisible"
                    class="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-daf-surface-page text-daf-text-primary"
                    role="status"
                    aria-live="polite"
                    aria-label="Loading camera map"
                >
                    <DafMarkerLoadingProgress
                        :stage="markerLoadingStage"
                        :stages="MARKER_LOADING_STAGES"
                    />
                </div>
            </Transition>
        </div>
    </div>
</template>

<script setup>
import DafMarkerLoadingProgress from '@/Components/Daf/Map/DafMarkerLoadingProgress.vue';
import { getActiveDafTheme } from '@/design-system/theme';
import mapboxgl from 'mapbox-gl';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

const accessToken = import.meta.env.VITE_MAPBOX_TOKEN;
const mapStyle = 'mapbox://styles/mapbox/standard';
const sourceId = 'marketing-hero-markers';
const cameraConeImageId = 'marketing-hero-camera-cone';
const MAP_LAYER_EMISSIVE_STRENGTH = 1;
const MARKER_SPLASH_SETTLE_DELAY_MS = 800;
const formatter = new Intl.NumberFormat('en-US');
const clusterVisualScale = 0.8;
const continentalUnitedStatesBounds = [
    [-124.8, 24.4],
    [-66.9, 49.4],
];
const MARKER_LOADING_STAGES = [
    { key: 'map', label: 'Starting map' },
    { key: 'layers', label: 'Preparing camera layers' },
    { key: 'markers', label: 'Loading nationwide markers' },
    { key: 'render', label: 'Rendering marker clusters' },
    { key: 'ready', label: 'Camera map ready' },
];

const mapContainer = ref(null);
const markerCount = ref(null);
const markerLoadError = ref('');
const mapLoadError = ref('');
const heroSplashIsVisible = ref(true);
const markerLoadingStage = ref(MARKER_LOADING_STAGES[0].key);

let map = null;
let resizeObserver = null;
let resizeTimeoutId = null;
let splashFrameId = null;
let splashTimeoutId = null;
let themeObserver = null;

const formattedMarkerCount = computed(() => {
    if (markerCount.value === null) {
        return '...';
    }

    return formatter.format(markerCount.value);
});

const markerStatLabel = computed(() => {
    if (markerLoadError.value) {
        return markerLoadError.value;
    }

    if (markerCount.value === null) {
        return 'loading devices nationwide';
    }

    return 'known devices mapped nationwide';
});

const mapMessage = computed(() => mapLoadError.value);

onMounted(() => {
    if (!mapContainer.value) {
        return;
    }

    if (!accessToken) {
        mapLoadError.value = 'Map preview unavailable';
        heroSplashIsVisible.value = false;

        return;
    }

    mapboxgl.accessToken = accessToken;
    bindThemeListeners();

    map = new mapboxgl.Map({
        accessToken,
        attributionControl: false,
        center: [-98.58, 39.83],
        config: mapStyleConfig(),
        container: mapContainer.value,
        interactive: false,
        logoPosition: 'bottom-right',
        projection: 'mercator',
        style: mapStyle,
        zoom: 2.35,
    });

    observeMapContainer();

    map.addControl(
        new mapboxgl.AttributionControl({
            compact: true,
        }),
        'bottom-right',
    );

    map.on('load', () => {
        markerLoadingStage.value = 'layers';
        fitCountryBounds();
        addMarkerSource();
        loadMarkers();
    });

    map.on('style.load', () => {
        applyMapLightPreset();
        syncMarkerLayerPaint();
    });

    map.once('idle', () => {
        fitCountryBounds();
    });

    map.once('error', () => {
        mapLoadError.value = 'Map preview unavailable';
        heroSplashIsVisible.value = false;
    });

    queueMapResize();
});

onBeforeUnmount(() => {
    if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
    }

    if (resizeTimeoutId !== null) {
        window.clearTimeout(resizeTimeoutId);
        resizeTimeoutId = null;
    }

    if (splashFrameId !== null) {
        window.cancelAnimationFrame(splashFrameId);
        splashFrameId = null;
    }

    if (splashTimeoutId !== null) {
        window.clearTimeout(splashTimeoutId);
        splashTimeoutId = null;
    }

    unbindThemeListeners();

    if (map) {
        map.remove();
        map = null;
    }
});

function addMarkerSource() {
    const colors = getMapColors();

    if (getMarkerSource()) {
        return;
    }

    addMarkerImages(colors);

    map.addSource(sourceId, {
        type: 'geojson',
        data: {
            type: 'FeatureCollection',
            features: [],
        },
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 28,
    });

    map.addLayer({
        id: `${sourceId}-camera-cones`,
        type: 'symbol',
        source: sourceId,
        filter: [
            'all',
            ['!', ['has', 'point_count']],
            ['==', ['get', 'hero_has_heading'], true],
        ],
        layout: {
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
            'icon-image': cameraConeImageId,
            'icon-rotate': ['get', 'hero_heading'],
            'icon-rotation-alignment': 'viewport',
            'icon-size': 1,
        },
        paint: {
            'icon-emissive-strength': MAP_LAYER_EMISSIVE_STRENGTH,
            'icon-opacity': 0.96,
        },
    });

    map.addLayer({
        id: `${sourceId}-cluster-glow`,
        type: 'circle',
        source: sourceId,
        filter: ['has', 'point_count'],
        paint: {
            'circle-blur': 0.6,
            'circle-color': colors.alertGlow,
            'circle-emissive-strength': MAP_LAYER_EMISSIVE_STRENGTH,
            'circle-opacity': 0.72,
            'circle-radius': [
                'step',
                ['get', 'point_count'],
                scaleClusterVisual(19),
                100,
                scaleClusterVisual(22),
                1000,
                scaleClusterVisual(26),
                5000,
                scaleClusterVisual(31),
            ],
        },
    });

    map.addLayer({
        id: `${sourceId}-clusters`,
        type: 'circle',
        source: sourceId,
        filter: ['has', 'point_count'],
        paint: {
            'circle-color': colors.alert,
            'circle-emissive-strength': MAP_LAYER_EMISSIVE_STRENGTH,
            'circle-opacity': 1,
            'circle-radius': [
                'step',
                ['get', 'point_count'],
                scaleClusterVisual(17),
                100,
                scaleClusterVisual(20),
                1000,
                scaleClusterVisual(24),
                5000,
                scaleClusterVisual(29),
            ],
            'circle-stroke-color': colors.markerBorder,
            'circle-stroke-width': scaleClusterVisual(3),
        },
    });

    map.addLayer({
        id: `${sourceId}-cluster-count`,
        type: 'symbol',
        source: sourceId,
        filter: ['has', 'point_count'],
        layout: {
            'text-field': ['get', 'point_count_abbreviated'],
            'text-font': ['Arial Unicode MS Bold'],
            'text-size': scaleClusterVisual(15),
        },
        paint: {
            'text-emissive-strength': MAP_LAYER_EMISSIVE_STRENGTH,
            'text-color': colors.markerBorder,
        },
    });

    map.addLayer({
        id: `${sourceId}-unclustered-glow`,
        type: 'circle',
        source: sourceId,
        filter: ['!', ['has', 'point_count']],
        paint: {
            'circle-blur': 0.55,
            'circle-color': colors.alertGlow,
            'circle-emissive-strength': MAP_LAYER_EMISSIVE_STRENGTH,
            'circle-opacity': 0.78,
            'circle-radius': 20,
        },
    });

    map.addLayer({
        id: `${sourceId}-unclustered`,
        type: 'circle',
        source: sourceId,
        filter: ['!', ['has', 'point_count']],
        paint: {
            'circle-color': colors.alert,
            'circle-emissive-strength': MAP_LAYER_EMISSIVE_STRENGTH,
            'circle-opacity': 1,
            'circle-radius': 7.5,
            'circle-stroke-color': colors.markerBorder,
            'circle-stroke-width': 2,
        },
    });

    map.addLayer({
        id: `${sourceId}-unclustered-highlight`,
        type: 'circle',
        source: sourceId,
        filter: ['!', ['has', 'point_count']],
        paint: {
            'circle-color': colors.markerHighlight,
            'circle-emissive-strength': MAP_LAYER_EMISSIVE_STRENGTH,
            'circle-opacity': 1,
            'circle-radius': 3.2,
        },
    });

    syncMarkerLayerPaint();
}

async function loadMarkers() {
    markerLoadingStage.value = 'markers';

    try {
        const response = await fetch('/markers', {
            headers: {
                Accept: 'application/json',
            },
        });

        if (!response.ok) {
            throw new Error('Unable to load markers');
        }

        const payload = await response.json();
        const features = pointsToFeatures(payload.points);

        markerLoadingStage.value = 'render';
        markerCount.value = features.length;
        updateMarkerSource(features);
    } catch {
        markerLoadError.value = 'marker statistics unavailable';
        markerCount.value = 0;
    } finally {
        completeHeroMarkerLoad();
    }
}

function completeHeroMarkerLoad() {
    markerLoadingStage.value = 'ready';

    if (
        !heroSplashIsVisible.value ||
        splashFrameId !== null ||
        splashTimeoutId !== null
    ) {
        return;
    }

    splashFrameId = window.requestAnimationFrame(() => {
        splashFrameId = null;
        splashTimeoutId = window.setTimeout(() => {
            heroSplashIsVisible.value = false;
            splashTimeoutId = null;
        }, MARKER_SPLASH_SETTLE_DELAY_MS);
    });
}

function fitCountryBounds() {
    map.resize();
    map.fitBounds(continentalUnitedStatesBounds, {
        duration: 0,
        padding: 18,
    });
}

function queueMapResize() {
    window.requestAnimationFrame(() => {
        fitCountryBounds();

        resizeTimeoutId = window.setTimeout(() => {
            if (map) {
                fitCountryBounds();
            }

            resizeTimeoutId = null;
        }, 250);
    });
}

function observeMapContainer() {
    if (!('ResizeObserver' in window) || !mapContainer.value) {
        return;
    }

    resizeObserver = new ResizeObserver(() => {
        if (map) {
            fitCountryBounds();
        }
    });

    resizeObserver.observe(mapContainer.value);
}

function updateMarkerSource(features) {
    if (!map) {
        return;
    }

    const source = getMarkerSource();

    if (!source) {
        return;
    }

    source.setData({
        type: 'FeatureCollection',
        features,
    });
}

function getMarkerSource() {
    try {
        return map?.getSource(sourceId) ?? null;
    } catch {
        return null;
    }
}

function pointsToFeatures(points = []) {
    if (!Array.isArray(points)) {
        return [];
    }

    return points
        .map((point) => {
            const longitude = Number(point.location?.[0]);
            const latitude = Number(point.location?.[1]);

            if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
                return null;
            }

            const properties = point.properties ?? {};
            const heading = normalizeHeading(
                properties.heading ?? properties.bearing,
            );

            return {
                type: 'Feature',
                properties: {
                    ...properties,
                    hero_has_heading: heading !== null,
                    hero_heading: heading ?? 0,
                },
                geometry: {
                    type: 'Point',
                    coordinates: [longitude, latitude],
                },
            };
        })
        .filter(Boolean);
}

function bindThemeListeners() {
    window.addEventListener('daf-theme-change', handleThemeChanged);

    if (typeof MutationObserver === 'undefined') {
        return;
    }

    themeObserver = new MutationObserver(handleThemeChanged);
    themeObserver.observe(document.documentElement, {
        attributeFilter: ['data-theme'],
        attributes: true,
    });
}

function unbindThemeListeners() {
    window.removeEventListener('daf-theme-change', handleThemeChanged);

    if (themeObserver) {
        themeObserver.disconnect();
        themeObserver = null;
    }
}

function handleThemeChanged() {
    applyMapLightPreset();
}

function applyMapLightPreset() {
    if (!map) {
        return;
    }

    try {
        map.setConfigProperty(
            'basemap',
            'lightPreset',
            mapLightPresetForActiveTheme(),
        );
        syncMarkerLayerPaint();
    } catch {
        // Ignore unsupported style config updates; initial config still applies.
    }
}

function mapStyleConfig() {
    return {
        basemap: {
            lightPreset: mapLightPresetForActiveTheme(),
        },
    };
}

function mapLightPresetForActiveTheme() {
    return getActiveDafTheme() === 'dark' ? 'night' : 'day';
}

function setLayerPaintProperty(layerId, property, value) {
    if (map?.getLayer(layerId)) {
        map.setPaintProperty(layerId, property, value);
    }
}

function syncMarkerLayerPaint() {
    const colors = getMapColors();

    setLayerPaintProperty(
        `${sourceId}-camera-cones`,
        'icon-emissive-strength',
        MAP_LAYER_EMISSIVE_STRENGTH,
    );
    setLayerPaintProperty(
        `${sourceId}-cluster-glow`,
        'circle-color',
        colors.alertGlow,
    );
    setLayerPaintProperty(
        `${sourceId}-cluster-glow`,
        'circle-emissive-strength',
        MAP_LAYER_EMISSIVE_STRENGTH,
    );
    setLayerPaintProperty(`${sourceId}-clusters`, 'circle-color', colors.alert);
    setLayerPaintProperty(
        `${sourceId}-clusters`,
        'circle-emissive-strength',
        MAP_LAYER_EMISSIVE_STRENGTH,
    );
    setLayerPaintProperty(
        `${sourceId}-clusters`,
        'circle-stroke-color',
        colors.markerBorder,
    );
    setLayerPaintProperty(
        `${sourceId}-cluster-count`,
        'text-emissive-strength',
        MAP_LAYER_EMISSIVE_STRENGTH,
    );
    setLayerPaintProperty(
        `${sourceId}-cluster-count`,
        'text-color',
        colors.markerBorder,
    );
    setLayerPaintProperty(
        `${sourceId}-unclustered-glow`,
        'circle-color',
        colors.alertGlow,
    );
    setLayerPaintProperty(
        `${sourceId}-unclustered-glow`,
        'circle-emissive-strength',
        MAP_LAYER_EMISSIVE_STRENGTH,
    );
    setLayerPaintProperty(
        `${sourceId}-unclustered`,
        'circle-color',
        colors.alert,
    );
    setLayerPaintProperty(
        `${sourceId}-unclustered`,
        'circle-emissive-strength',
        MAP_LAYER_EMISSIVE_STRENGTH,
    );
    setLayerPaintProperty(
        `${sourceId}-unclustered`,
        'circle-stroke-color',
        colors.markerBorder,
    );
    setLayerPaintProperty(
        `${sourceId}-unclustered-highlight`,
        'circle-color',
        colors.markerHighlight,
    );
    setLayerPaintProperty(
        `${sourceId}-unclustered-highlight`,
        'circle-emissive-strength',
        MAP_LAYER_EMISSIVE_STRENGTH,
    );
}

function getMapColors() {
    return {
        alert: cssVariable('--marker-alpr', '#FF4D4F'),
        alertGlow: cssVariable('--marker-alpr-glow', 'rgba(255, 77, 79, 0.55)'),
        coneEdge: cssVariable('--marker-cone-edge', 'rgba(255, 77, 79, 0.55)'),
        markerBorder: '#FFFFFF',
        markerHighlight: 'rgba(255, 255, 255, 0.55)',
    };
}

function addMarkerImages(colors) {
    if (map.hasImage(cameraConeImageId)) {
        return;
    }

    map.addImage(cameraConeImageId, createConeImage(colors), {
        pixelRatio: 2,
    });
}

function createConeImage(colors) {
    const logicalSize = 132;
    const pixelRatio = 2;
    const canvas = document.createElement('canvas');
    canvas.width = logicalSize * pixelRatio;
    canvas.height = logicalSize * pixelRatio;

    const context = canvas.getContext('2d');
    context.scale(pixelRatio, pixelRatio);

    const center = logicalSize / 2;
    const radius = logicalSize * 0.46;
    const startAngle = degreesToRadians(-110);
    const endAngle = degreesToRadians(-70);
    const coneColor = parseCssColor(colors.coneEdge);

    const gradient = context.createRadialGradient(
        center,
        center,
        0,
        center,
        center,
        radius,
    );
    gradient.addColorStop(0, rgba(coneColor, 0.95));
    gradient.addColorStop(0.55, rgba(coneColor, 0.55));
    gradient.addColorStop(1, rgba(coneColor, 0.04));

    context.beginPath();
    context.moveTo(center, center);
    context.lineTo(
        center + radius * Math.cos(startAngle),
        center + radius * Math.sin(startAngle),
    );
    context.arc(center, center, radius, startAngle, endAngle);
    context.closePath();
    context.fillStyle = gradient;
    context.fill();
    context.strokeStyle = rgba(coneColor, 1);
    context.lineJoin = 'round';
    context.lineWidth = 0.9;
    context.stroke();

    return context.getImageData(0, 0, canvas.width, canvas.height);
}

function normalizeHeading(value) {
    const heading = Number(value);

    if (!Number.isFinite(heading)) {
        return null;
    }

    return ((heading % 360) + 360) % 360;
}

function scaleClusterVisual(value) {
    return value * clusterVisualScale;
}

function degreesToRadians(degrees) {
    return degrees * (Math.PI / 180);
}

function parseCssColor(value) {
    const match = value.match(
        /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([.\d]+))?\)$/,
    );

    if (!match) {
        return {
            red: 255,
            green: 77,
            blue: 79,
            alpha: 1,
        };
    }

    return {
        red: Number(match[1]),
        green: Number(match[2]),
        blue: Number(match[3]),
        alpha: match[4] === undefined ? 1 : Number(match[4]),
    };
}

function rgba(color, alphaMultiplier) {
    const alpha = Math.min(1, Math.max(0, color.alpha * alphaMultiplier));

    return `rgba(${color.red}, ${color.green}, ${color.blue}, ${alpha})`;
}

function cssVariable(name, fallback) {
    const element = document.createElement('span');
    element.style.color = `var(${name}, ${fallback})`;
    element.style.display = 'none';
    document.body.appendChild(element);

    const value = window.getComputedStyle(element).color;
    element.remove();

    return value || fallback;
}
</script>

<style scoped>
.mapbox-hero {
    height: 100%;
    inset: 0;
    position: absolute;
    width: 100%;
}

.mapbox-hero :deep(.mapboxgl-canvas-container),
.mapbox-hero :deep(.mapboxgl-canvas) {
    height: 100% !important;
    width: 100% !important;
}

.map-splash-enter-active,
.map-splash-leave-active {
    transition:
        opacity var(--dur-sheet) var(--ease-standard),
        transform var(--dur-sheet) var(--ease-standard);
}

.map-splash-enter-from,
.map-splash-leave-to {
    opacity: 0;
    transform: scale(1.01);
}

@media (prefers-reduced-motion: reduce) {
    .map-splash-enter-active,
    .map-splash-leave-active {
        transition-duration: 0ms;
    }

    .map-splash-enter-from,
    .map-splash-leave-to {
        transform: none;
    }
}
</style>
