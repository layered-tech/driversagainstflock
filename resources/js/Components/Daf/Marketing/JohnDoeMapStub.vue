<template>
    <div
        data-theme="dark"
        class="relative min-h-[540px] overflow-hidden rounded-dafXl border border-daf-border bg-[var(--map-land)] shadow-dafCard"
    >
        <div
            ref="mapContainer"
            class="john-doe-mapbox absolute inset-0 z-0 size-full"
            aria-label="Mocked John Doe location pattern map"
        />

        <div
            v-if="mapMessage"
            class="absolute inset-0 z-[8] flex items-center justify-center bg-daf-surface-alt px-6 text-center text-daf-body-sm text-daf-text-secondary"
        >
            {{ mapMessage }}
        </div>

        <div
            class="absolute left-3.5 top-3.5 z-[7] max-w-[min(360px,calc(100%-28px))] rounded-dafMd border border-daf-border-glass bg-daf-surface-glass-2 px-4 py-3 shadow-dafFloat backdrop-blur-[var(--blur-glass)]"
        >
            <div class="flex items-start gap-3">
                <span
                    class="flex size-9 shrink-0 items-center justify-center rounded-dafSm bg-[var(--brand-soft)] text-daf-text-brand"
                >
                    <DafIcon :name="activePattern.icon" size="19" />
                </span>
                <div class="min-w-0">
                    <div
                        class="font-mono text-daf-caption font-bold uppercase tracking-[var(--ls-label)] text-daf-alert"
                    >
                        {{ activePattern.tag }}
                    </div>
                    <div
                        class="mt-0.5 font-display text-daf-h3 font-semibold leading-tight tracking-[var(--ls-heading)] text-daf-text-primary"
                    >
                        {{ activePattern.title }}
                    </div>
                    <p
                        class="mt-1.5 line-clamp-3 text-daf-body-sm leading-[1.45] text-daf-text-secondary"
                    >
                        {{ activePattern.inference }}
                    </p>
                </div>
            </div>
            <div class="mt-3 flex flex-wrap gap-1.5">
                <span
                    class="inline-flex items-center gap-1.5 rounded-dafPill border border-daf-border bg-daf-surface-alt px-2 py-1 font-mono text-daf-caption text-daf-text-secondary"
                >
                    <span class="size-1.5 rounded-full bg-daf-alert" />
                    {{ activeCameraCount }} reads
                </span>
                <span
                    class="inline-flex items-center gap-1.5 rounded-dafPill border border-daf-border bg-daf-surface-alt px-2 py-1 font-mono text-daf-caption text-daf-text-secondary"
                >
                    <span class="size-1.5 rounded-full bg-daf-brand" />
                    {{ activeZoneCount }} inferred
                    {{ activeZoneCount === 1 ? 'zone' : 'zones' }}
                </span>
            </div>
        </div>

        <div
            class="absolute bottom-3.5 left-3.5 right-3.5 z-[7] flex flex-wrap items-center gap-3 rounded-dafMd border border-daf-border-glass bg-daf-surface-glass-2 px-3 py-2 backdrop-blur-[var(--blur-glass)] md:right-auto"
        >
            <span
                class="flex items-center gap-1.5 whitespace-nowrap text-daf-caption text-daf-text-secondary"
            >
                <span
                    class="size-[9px] rounded-full bg-daf-alert shadow-[0_0_0_3px_var(--marker-alpr-glow)]"
                />
                Active ALPR read
            </span>
            <span
                class="flex items-center gap-1.5 whitespace-nowrap text-daf-caption text-daf-text-secondary"
            >
                <span
                    class="size-[7px] rounded-full bg-[var(--map-ink)] opacity-70"
                />
                Other reader
            </span>
            <span
                class="flex items-center gap-1.5 whitespace-nowrap text-daf-caption text-daf-text-secondary"
            >
                <span
                    class="h-[3px] w-[18px] rounded-dafPill bg-daf-route-private"
                />
                Captured route
            </span>
        </div>
    </div>
</template>

<script setup>
import DafIcon from '@/Components/Daf/DafIcon.vue';
import mapboxgl from 'mapbox-gl';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = defineProps({
    activePattern: {
        type: Object,
        required: true,
    },
    nodes: {
        type: Array,
        required: true,
    },
});

const accessToken = import.meta.env.VITE_MAPBOX_TOKEN;
const mapStyle = 'mapbox://styles/mapbox/dark-v11';
const cameraSourceId = 'john-doe-cameras';
const routeSourceId = 'john-doe-route';
const zoneSourceId = 'john-doe-zones';
const zoneLabelSourceId = 'john-doe-zone-labels';

const mapContainer = ref(null);
const mapMessage = ref('');

let map = null;
let mapLoaded = false;
let mapColors = null;
let resizeObserver = null;
let resizeTimeoutId = null;

const nodeMap = computed(() =>
    Object.fromEntries(props.nodes.map((node) => [node.id, node])),
);

const activeCameraCount = computed(
    () => new Set(props.activePattern.route).size,
);

const activeZoneCount = computed(() => props.activePattern.zones.length);

watch(
    () => props.activePattern.id,
    () => {
        syncMapData();
        fitActivePattern();
    },
);

onMounted(() => {
    if (!mapContainer.value) {
        return;
    }

    if (!accessToken) {
        mapMessage.value = 'Map preview unavailable';

        return;
    }

    mapboxgl.accessToken = accessToken;

    map = new mapboxgl.Map({
        accessToken,
        attributionControl: false,
        center: [-122.314, 37.808],
        container: mapContainer.value,
        interactive: false,
        logoPosition: 'bottom-right',
        projection: 'mercator',
        style: mapStyle,
        zoom: 10.4,
    });

    observeMapContainer();

    map.addControl(
        new mapboxgl.AttributionControl({
            compact: true,
        }),
        'bottom-right',
    );

    map.on('load', () => {
        mapLoaded = true;
        mapColors = getMapColors();
        addMapSources();
        addMapLayers();
        syncMapData();
        fitActivePattern(0);
        queueMapResize();
    });

    map.once('error', () => {
        if (!mapLoaded) {
            mapMessage.value = 'Map preview unavailable';
        }
    });
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

    if (map) {
        map.remove();
        map = null;
    }
});

function addMapSources() {
    map.addSource(zoneSourceId, emptyGeoJsonSource());
    map.addSource(zoneLabelSourceId, emptyGeoJsonSource());
    map.addSource(routeSourceId, emptyGeoJsonSource());
    map.addSource(cameraSourceId, emptyGeoJsonSource());
}

function addMapLayers() {
    const colors = mapColors ?? getMapColors();
    mapColors = colors;

    map.addLayer({
        id: `${zoneSourceId}-fill`,
        type: 'fill',
        source: zoneSourceId,
        paint: {
            'fill-color': ['get', 'fill'],
            'fill-opacity': 1,
        },
    });

    map.addLayer({
        id: `${zoneSourceId}-line`,
        type: 'line',
        source: zoneSourceId,
        paint: {
            'line-color': ['get', 'line'],
            'line-opacity': 0.95,
            'line-width': 2,
        },
    });

    map.addLayer({
        id: `${routeSourceId}-casing`,
        type: 'line',
        source: routeSourceId,
        layout: {
            'line-cap': 'round',
            'line-join': 'round',
        },
        paint: {
            'line-color': colors.routeCasing,
            'line-opacity': 0.96,
            'line-width': 8,
        },
    });

    map.addLayer({
        id: `${routeSourceId}-line`,
        type: 'line',
        source: routeSourceId,
        layout: {
            'line-cap': 'round',
            'line-join': 'round',
        },
        paint: {
            'line-color': colors.routePrivate,
            'line-opacity': 1,
            'line-width': 4.5,
        },
    });

    map.addLayer({
        id: `${cameraSourceId}-active-glow`,
        type: 'circle',
        source: cameraSourceId,
        filter: ['==', ['get', 'active'], true],
        paint: {
            'circle-blur': 0.45,
            'circle-color': colors.alertGlow,
            'circle-opacity': 0.86,
            'circle-radius': 19,
        },
    });

    map.addLayer({
        id: `${cameraSourceId}-points`,
        type: 'circle',
        source: cameraSourceId,
        paint: {
            'circle-color': [
                'case',
                ['boolean', ['get', 'active'], false],
                colors.alert,
                colors.mapInk,
            ],
            'circle-opacity': [
                'case',
                ['boolean', ['get', 'active'], false],
                1,
                0.55,
            ],
            'circle-radius': [
                'case',
                ['boolean', ['get', 'active'], false],
                7.5,
                4.5,
            ],
            'circle-stroke-color': colors.markerBorder,
            'circle-stroke-opacity': [
                'case',
                ['boolean', ['get', 'active'], false],
                1,
                0.45,
            ],
            'circle-stroke-width': [
                'case',
                ['boolean', ['get', 'active'], false],
                2,
                1,
            ],
        },
    });

    map.addLayer({
        id: `${cameraSourceId}-labels`,
        type: 'symbol',
        source: cameraSourceId,
        filter: ['==', ['get', 'active'], true],
        layout: {
            'text-anchor': 'top',
            'text-field': ['get', 'label'],
            'text-font': ['Arial Unicode MS Bold'],
            'text-offset': [0, 0.9],
            'text-size': 11,
        },
        paint: {
            'text-color': colors.textPrimary,
            'text-halo-blur': 0.5,
            'text-halo-color': colors.surfaceCard,
            'text-halo-width': 1.2,
        },
    });

    map.addLayer({
        id: `${zoneLabelSourceId}-labels`,
        type: 'symbol',
        source: zoneLabelSourceId,
        layout: {
            'text-anchor': 'center',
            'text-field': [
                'format',
                ['get', 'label'],
                { 'font-scale': 1 },
                '\n',
                {},
                ['get', 'detail'],
                { 'font-scale': 0.72 },
            ],
            'text-font': ['Arial Unicode MS Bold'],
            'text-line-height': 1.1,
            'text-size': 12,
        },
        paint: {
            'text-color': colors.textPrimary,
            'text-halo-blur': 0.7,
            'text-halo-color': colors.surfaceCard,
            'text-halo-width': 1.6,
        },
    });
}

function syncMapData() {
    if (!mapLoaded || !map) {
        return;
    }

    setSourceData(cameraSourceId, cameraFeatureCollection());
    setSourceData(routeSourceId, routeFeatureCollection());
    setSourceData(zoneSourceId, zoneFeatureCollection());
    setSourceData(zoneLabelSourceId, zoneLabelFeatureCollection());
}

function cameraFeatureCollection() {
    const activeNodeIds = new Set(props.activePattern.route);

    return {
        type: 'FeatureCollection',
        features: props.nodes
            .filter((node) => isCoordinate(node.coordinates))
            .map((node) => ({
                type: 'Feature',
                properties: {
                    active: activeNodeIds.has(node.id),
                    id: node.id,
                    label: node.label,
                },
                geometry: {
                    type: 'Point',
                    coordinates: node.coordinates,
                },
            })),
    };
}

function routeFeatureCollection() {
    const coordinates = patternCoordinates();

    return {
        type: 'FeatureCollection',
        features:
            coordinates.length > 1
                ? [
                      {
                          type: 'Feature',
                          properties: {
                              id: props.activePattern.id,
                          },
                          geometry: {
                              type: 'LineString',
                              coordinates,
                          },
                      },
                  ]
                : [],
    };
}

function zoneFeatureCollection() {
    return {
        type: 'FeatureCollection',
        features: props.activePattern.zones
            .filter((zone) => isCoordinate(zone.coordinates))
            .map((zone) => {
                const paint = zonePaint(zone.tone);

                return {
                    type: 'Feature',
                    properties: {
                        detail: zone.detail,
                        fill: paint.fill,
                        id: zone.id,
                        label: zone.label,
                        line: paint.line,
                    },
                    geometry: {
                        type: 'Polygon',
                        coordinates: [
                            circleCoordinates(
                                zone.coordinates,
                                zone.radiusMeters,
                            ),
                        ],
                    },
                };
            }),
    };
}

function zoneLabelFeatureCollection() {
    return {
        type: 'FeatureCollection',
        features: props.activePattern.zones
            .filter((zone) => isCoordinate(zone.coordinates))
            .map((zone) => ({
                type: 'Feature',
                properties: {
                    detail: zone.detail,
                    id: zone.id,
                    label: zone.label,
                },
                geometry: {
                    type: 'Point',
                    coordinates: zone.coordinates,
                },
            })),
    };
}

function patternCoordinates() {
    return props.activePattern.route
        .map((id) => nodeMap.value[id]?.coordinates)
        .filter(isCoordinate);
}

function fitActivePattern(duration = 720) {
    if (!mapLoaded || !map) {
        return;
    }

    const coordinates = patternCoordinates();

    if (coordinates.length === 0) {
        return;
    }

    const bounds = new mapboxgl.LngLatBounds();

    coordinates.forEach((coordinate) => bounds.extend(coordinate));

    props.activePattern.zones
        .filter((zone) => isCoordinate(zone.coordinates))
        .forEach((zone) => {
            zoneBounds(zone.coordinates, zone.radiusMeters).forEach(
                (coordinate) => bounds.extend(coordinate),
            );
        });

    map.fitBounds(bounds, {
        duration: prefersReducedMotion() ? 0 : duration,
        maxZoom: 13.35,
        padding: {
            bottom: 88,
            left: 64,
            right: 64,
            top: 120,
        },
    });
}

function observeMapContainer() {
    if (!('ResizeObserver' in window) || !mapContainer.value) {
        return;
    }

    resizeObserver = new ResizeObserver(() => {
        if (!map) {
            return;
        }

        map.resize();
        fitActivePattern(0);
    });

    resizeObserver.observe(mapContainer.value);
}

function queueMapResize() {
    window.requestAnimationFrame(() => {
        if (!map) {
            return;
        }

        map.resize();
        fitActivePattern(0);

        resizeTimeoutId = window.setTimeout(() => {
            if (map) {
                map.resize();
                fitActivePattern(0);
            }

            resizeTimeoutId = null;
        }, 250);
    });
}

function setSourceData(sourceId, data) {
    const source = map?.getSource(sourceId);

    if (!source) {
        return;
    }

    source.setData(data);
}

function emptyGeoJsonSource() {
    return {
        type: 'geojson',
        data: {
            type: 'FeatureCollection',
            features: [],
        },
    };
}

function circleCoordinates(center, radiusMeters, steps = 72) {
    const [longitude, latitude] = center;
    const latitudeRadius = radiusMeters / 111_320;
    const longitudeRadius =
        radiusMeters / (111_320 * Math.cos(degreesToRadians(latitude)));
    const coordinates = [];

    for (let index = 0; index <= steps; index += 1) {
        const angle = (index / steps) * Math.PI * 2;

        coordinates.push([
            longitude + Math.cos(angle) * longitudeRadius,
            latitude + Math.sin(angle) * latitudeRadius,
        ]);
    }

    return coordinates;
}

function zoneBounds(center, radiusMeters) {
    const [longitude, latitude] = center;
    const latitudeRadius = radiusMeters / 111_320;
    const longitudeRadius =
        radiusMeters / (111_320 * Math.cos(degreesToRadians(latitude)));

    return [
        [longitude - longitudeRadius, latitude - latitudeRadius],
        [longitude + longitudeRadius, latitude + latitudeRadius],
    ];
}

function zonePaint(tone) {
    const colors = mapColors ?? getMapColors();
    const toneColors = {
        home: colors.brand,
        routine: colors.amber,
        school: colors.violet,
        work: colors.info,
    };
    const line = toneColors[tone] ?? colors.brand;
    const parsed = parseCssColor(line);

    return {
        fill: rgba(parsed, 0.16),
        line: rgba(parsed, 0.9),
    };
}

function getMapColors() {
    return {
        alert: cssVariable('--marker-alpr', '#FF4D4F'),
        alertGlow: cssVariable('--marker-alpr-glow', 'rgba(255, 77, 79, 0.65)'),
        amber: cssVariable('--warning', '#FFB02E'),
        brand: cssVariable('--brand', '#1FBF6B'),
        info: cssVariable('--info', '#2E8BFF'),
        mapInk: cssVariable('--map-ink', '#8A94A2'),
        markerBorder: cssVariable('--surface-marker', '#11151B'),
        routeCasing: cssVariable('--route-private-casing', '#0B0E12'),
        routePrivate: cssVariable('--route-private', '#1FBF6B'),
        surfaceCard: cssVariable('--surface-card', '#161B22'),
        textPrimary: cssVariable('--text-primary', '#F5F7F9'),
        violet: cssVariable('--marker-destination', '#7A5CFF'),
    };
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

function parseCssColor(value) {
    const match = value.match(
        /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([.\d]+))?\)$/,
    );

    if (!match) {
        return {
            alpha: 1,
            blue: 107,
            green: 191,
            red: 31,
        };
    }

    return {
        alpha: match[4] === undefined ? 1 : Number(match[4]),
        blue: Number(match[3]),
        green: Number(match[2]),
        red: Number(match[1]),
    };
}

function rgba(color, alphaMultiplier) {
    const alpha = Math.min(1, Math.max(0, color.alpha * alphaMultiplier));

    return `rgba(${color.red}, ${color.green}, ${color.blue}, ${alpha})`;
}

function degreesToRadians(degrees) {
    return degrees * (Math.PI / 180);
}

function isCoordinate(value) {
    return (
        Array.isArray(value) &&
        value.length === 2 &&
        Number.isFinite(value[0]) &&
        Number.isFinite(value[1])
    );
}

function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
</script>

<style scoped>
.john-doe-mapbox {
    height: 100%;
    inset: 0;
    position: absolute;
    width: 100%;
}

.john-doe-mapbox :deep(.mapboxgl-canvas-container),
.john-doe-mapbox :deep(.mapboxgl-canvas) {
    height: 100% !important;
    width: 100% !important;
}

.john-doe-mapbox :deep(.mapboxgl-ctrl-logo),
.john-doe-mapbox :deep(.mapboxgl-ctrl-attrib) {
    opacity: 0.72;
}
</style>
