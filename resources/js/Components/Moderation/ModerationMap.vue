<script setup>
import {
    moderationNodeFeatures,
    moderationNodeRecordId,
    nodeChangeColors,
} from '@/moderation';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = defineProps({
    geometry: { type: Object, default: null },
    bounds: { type: Array, default: null },
    points: { type: Array, default: () => [] },
    nodes: { type: Array, default: () => [] },
    draw: Boolean,
    lineColor: { type: String, default: '#0e8a4c' },
});
const emit = defineEmits(['node', 'point']);
const container = ref(null);
const error = ref('');
let map;
let removed = false;
function data() {
    const features = [];
    if (props.geometry)
        features.push({
            type: 'Feature',
            properties: {},
            geometry: props.geometry,
        });
    if (props.points.length > 1)
        features.push({
            type: 'Feature',
            properties: {},
            geometry: { type: 'LineString', coordinates: props.points },
        });
    for (const point of props.points)
        features.push({
            type: 'Feature',
            properties: {},
            geometry: { type: 'Point', coordinates: point },
        });
    features.push(...moderationNodeFeatures(props.nodes));
    return { type: 'FeatureCollection', features };
}
function update() {
    map?.getSource('moderation')?.setData(data());
}
function fitLocation() {
    if (!map?.getSource('moderation')) return;
    if (props.bounds?.length === 4 && props.bounds.every(Number.isFinite)) {
        map.fitBounds(
            [
                [props.bounds[0], props.bounds[1]],
                [props.bounds[2], props.bounds[3]],
            ],
            { padding: 35, maxZoom: 16, duration: 0 },
        );
        return;
    }
    const coordinates = moderationNodeFeatures(props.nodes)
        .map((feature) => feature.geometry.coordinates)
        .filter((point) => point.every(Number.isFinite));
    if (coordinates.length > 1) {
        map.fitBounds(
            [
                [
                    Math.min(...coordinates.map(([longitude]) => longitude)),
                    Math.min(...coordinates.map(([, latitude]) => latitude)),
                ],
                [
                    Math.max(...coordinates.map(([longitude]) => longitude)),
                    Math.max(...coordinates.map(([, latitude]) => latitude)),
                ],
            ],
            { padding: 35, maxZoom: 19, duration: 0 },
        );
    } else if (coordinates.length) {
        map.jumpTo({ center: coordinates[0], zoom: 16 });
    }
}
onMounted(async () => {
    const token = import.meta.env.VITE_MAPBOX_TOKEN;
    if (!token) {
        error.value =
            'Map preview unavailable. Coordinates and OpenStreetMap links remain available.';
        return;
    }
    try {
        const { default: mapboxgl } = await import('mapbox-gl');
        if (removed) return;
        map = new mapboxgl.Map({
            container: container.value,
            accessToken: token,
            style: 'mapbox://styles/mapbox/streets-v12',
            center: [-98.5, 39.5],
            zoom: 3,
            attributionControl: true,
        });
        map.addControl(new mapboxgl.NavigationControl(), 'top-right');
        map.on('error', () => {
            error.value = 'The map could not load. Please try again later.';
        });
        map.on('load', () => {
            map.addSource('moderation', { type: 'geojson', data: data() });
            map.addLayer({
                id: 'moderation-fill',
                type: 'fill',
                source: 'moderation',
                filter: ['==', '$type', 'Polygon'],
                paint: { 'fill-color': '#0e8a4c', 'fill-opacity': 0.15 },
            });
            map.addLayer({
                id: 'moderation-line',
                type: 'line',
                source: 'moderation',
                filter: ['!=', '$type', 'Point'],
                paint: { 'line-color': props.lineColor, 'line-width': 2 },
            });
            map.addLayer({
                id: 'moderation-node-labels',
                type: 'symbol',
                source: 'moderation',
                filter: ['has', 'label'],
                layout: {
                    'text-field': ['get', 'label'],
                    'text-size': 11,
                    'text-variable-anchor': ['top', 'bottom', 'left', 'right'],
                    'text-radial-offset': 1,
                },
                paint: {
                    'text-color': '#1f2937',
                    'text-halo-color': '#fff',
                    'text-halo-width': 2,
                },
            });
            map.addLayer({
                id: 'moderation-points',
                type: 'circle',
                source: 'moderation',
                filter: ['==', '$type', 'Point'],
                paint: {
                    'circle-color': [
                        'match',
                        ['get', 'change'],
                        'added',
                        nodeChangeColors.added,
                        'edited',
                        nodeChangeColors.edited,
                        'deleted',
                        nodeChangeColors.deleted,
                        nodeChangeColors.deleted,
                    ],
                    'circle-radius': 7,
                    'circle-stroke-width': 2,
                    'circle-stroke-color': '#fff',
                },
            });
            map.on('click', 'moderation-points', (event) => {
                const recordId = moderationNodeRecordId(event.features?.[0]);
                if (recordId !== null) emit('node', recordId);
            });
            map.on('mouseenter', 'moderation-points', (event) => {
                if (moderationNodeRecordId(event.features?.[0]) !== null)
                    map.getCanvas().style.cursor = 'pointer';
            });
            map.on('mouseleave', 'moderation-points', () => {
                map.getCanvas().style.cursor = '';
            });
            fitLocation();
        });
        map.on('click', (event) => {
            if (props.draw)
                emit('point', [
                    Number(event.lngLat.lng.toFixed(7)),
                    Number(event.lngLat.lat.toFixed(7)),
                ]);
        });
    } catch {
        error.value = 'Map preview unavailable.';
    }
});
watch(() => [props.geometry, props.points, props.nodes], update, {
    deep: true,
});
watch(() => [props.bounds, props.nodes], fitLocation, { deep: true });
onBeforeUnmount(() => {
    removed = true;
    map?.remove();
});
</script>
<template>
    <div
        class="relative min-h-[252px] overflow-hidden rounded-dafMd border border-daf-border bg-[var(--map-land)]"
    >
        <div
            ref="container"
            :aria-label="
                draw
                    ? 'Click on the map to add boundary points'
                    : 'OpenStreetMap location preview'
            "
            class="absolute inset-0"
        />
        <p
            v-if="error"
            class="absolute inset-x-3 bottom-3 rounded-dafSm bg-daf-surface-card p-3 text-daf-caption text-daf-text-secondary"
            role="status"
        >
            {{ error }}
        </p>
        <div
            v-if="draw"
            class="pointer-events-none absolute left-3 top-3 rounded-dafPill bg-daf-surface-card px-3 py-1 font-mono text-xs"
        >
            {{ points.length }} points · click to add
        </div>
    </div>
</template>
