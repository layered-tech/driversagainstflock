<script setup>
import { onMounted, ref, toRaw } from 'vue';
import {
    MapboxFullscreenControl,
    MapboxMap as mapboxgl,
} from '@studiometa/vue-mapbox-gl';
import {
    MapboxMap,
    MapboxImage,
    MapboxNavigationControl,
} from '@studiometa/vue-mapbox-gl';

import axios from 'axios';
import AutoComplete from 'primevue/autocomplete';

import {
    addCurrentPositionSources,
    onLoaded,
    updateSourcePosition,
    point,
    addDirections,
    removeDirections,
    updateSourceData,
} from '@/mapbox.js';

import 'mapbox-gl/dist/mapbox-gl.css';
import '@mapbox/mapbox-gl-geocoder/lib/mapbox-gl-geocoder.css';

window.mapboxgl = mapboxgl;
const accessToken = import.meta.env.VITE_MAPBOX_TOKEN;
const MAX_MARKER_REQUEST_LATITUDE_SPAN_DEGREES = 40;
const MAX_MARKER_REQUEST_LONGITUDE_SPAN_DEGREES = 40;

const props = defineProps(['points', 'user']);

const map = ref();
const currentPosition = ref(null);
const directionsRoute = ref(null);
const item = ref(null);
const items = ref([]);
let markerLoadMode = null;

const markers = {
    type: 'FeatureCollection',
    features: toRaw(props.points).map((p) => point(p.location, p?.properties)),
};

const pointsForViewPorts = toRaw(props.points)
    .filter((p) => p?.properties?.headingPoints)
    .map((p) => p?.properties?.headingPoints);

const viewports = {
    type: 'FeatureCollection',
    features: pointsForViewPorts,
};

const getLongitudeSpan = (west, east) => {
    if (!Number.isFinite(west) || !Number.isFinite(east)) {
        return Number.POSITIVE_INFINITY;
    }

    if (west <= east) {
        return east - west;
    }

    return 360 - west + east;
};

const markerBoundsAreRequestable = (bounds) => {
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    const latitudeSpan = Math.abs(ne.lat - sw.lat);
    const longitudeSpan = getLongitudeSpan(sw.lng, ne.lng);

    return (
        latitudeSpan <= MAX_MARKER_REQUEST_LATITUDE_SPAN_DEGREES &&
        longitudeSpan <= MAX_MARKER_REQUEST_LONGITUDE_SPAN_DEGREES
    );
};

const getRouteGeometry = (route) => route?.features?.[0]?.geometry ?? null;

const locationChanged = (position) => {
    currentPosition.value = position;

    updateSourcePosition(map, 'current-location', position);
};

const onInput = async (event) => {
    let response = await axios.post('/search', {
        textQuery: event.query,
        locationBias: {
            circle: {
                center: {
                    latitude: currentPosition.value.coords.latitude,
                    longitude: currentPosition.value.coords.longitude,
                },
            },
        },
    });

    items.value = response.data.places;
};

const onSelect = async ({ value }) => {
    await getDirections([value.location.longitude, value.location.latitude]);
};

const clearDirections = () => {
    directionsRoute.value = null;

    map.value.easeTo({
        center: [
            currentPosition.value.coords.longitude,
            currentPosition.value.coords.latitude,
        ],
        bearing: currentPosition.value.coords.heading,
        zoom: 11,
        pitch: 0,
        essential: true,
        duration: 2000,
        padding: {
            top: 0,
        },
    });

    removeDirections(map, 'directions-direct-source');
    removeDirections(map, 'directions-source');

    item.value = null;

    getMarkers();
};

const getMarkers = async () => {
    if (!map.value) return;

    const bounds = map.value.getBounds();
    const requestConfig = {};
    const requestIsBounded = markerBoundsAreRequestable(bounds);

    if (!requestIsBounded && markerLoadMode === 'nationwide') {
        return;
    }

    if (requestIsBounded) {
        const sw = bounds.getSouthWest();
        const ne = bounds.getNorthEast();

        requestConfig.params = {
            sw_lng: sw.lng,
            sw_lat: sw.lat,
            ne_lng: ne.lng,
            ne_lat: ne.lat,
        };
    }

    let response = await axios.get('/markers', requestConfig);
    markerLoadMode = requestIsBounded ? 'viewport' : 'nationwide';

    updateSourceData(map, 'source-markers', {
        type: 'FeatureCollection',
        features: response.data.points.map((p) =>
            point(p.location, p?.properties),
        ),
    });
};

const getDirections = async (coords) => {
    let response = await axios.post('directions', {
        currentPosition: [
            currentPosition.value.coords.longitude,
            currentPosition.value.coords.latitude,
        ],
        resultPosition: coords,
    });

    const directGeometry = getRouteGeometry(response.data.direct);
    const idealGeometry = getRouteGeometry(response.data.ideal);

    if (!directGeometry) {
        return;
    }

    directionsRoute.value = idealGeometry ?? directGeometry;

    removeDirections(map, 'directions-direct-source');
    removeDirections(map, 'directions-source');

    if (response.data.bounds) {
        map.value.fitBounds(response.data.bounds, {
            padding: { top: 35, bottom: 35, left: 35, right: 35 },
        });
    }

    addDirections(
        map,
        'directions-direct-source',
        idealGeometry ? colors.red[700] : colors.blue[700],
        directGeometry,
    );

    if (idealGeometry) {
        addDirections(
            map,
            'directions-source',
            colors.green[700],
            idealGeometry,
        );
    }
};

onMounted(() => {
    map.value.on('load', () => {
        onLoaded(map, markers, viewports);

        getMarkers(); // Fetch initial markers based on map bounds
        map.value.on('moveend', getMarkers);

        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition((position) => {
                map.value.jumpTo({
                    center: [
                        position.coords.longitude,
                        position.coords.latitude,
                    ],
                    zoom: 11,
                    pitch: 0,
                    essential: true,
                });

                addCurrentPositionSources(map, position);
            });

            navigator.geolocation.watchPosition(locationChanged, () => {}, {
                enableHighAccuracy: true,
                timeout: 5000,
                maximumAge: 0,
            });
        }
    });
});

import FalconSr from '../../assets/falcon-sr.webp';
import FalconLr from '../../assets/falcon-lr.webp';
import colors from 'tailwindcss/colors.js';
</script>

<template>
    <div class="relative flex h-full flex-auto">
        <MapboxMap
            :access-token="accessToken"
            map-style="mapbox://styles/cpfeifer1990/cm2y6vg6m004n01pf0pzv696t"
            class="h-full flex-auto"
            @mb-created="(mapInstance) => (map = mapInstance)"
        >
            <MapboxNavigationControl />
            <MapboxFullscreenControl />
            <MapboxImage id="falcon-sr" :src="FalconSr" />
            <MapboxImage id="falcon-lr" :src="FalconLr" />
        </MapboxMap>
        <div class="absolute left-2.5 top-2.5 z-10 w-auto">
            <div class="relative space-x-2 md:w-96">
                <AutoComplete
                    v-model="item"
                    optionLabel="displayName.text"
                    placeholder="Search..."
                    panelClass="!mt-2.5"
                    :suggestions="items"
                    :typeahead="true"
                    :fluid="true"
                    @complete="onInput"
                    @item-select="onSelect"
                    className="shadow-lg"
                    size="large"
                >
                    <template #option="slotProps">
                        <div class="flex flex-col">
                            <div>
                                <div class="text-sm font-bold">
                                    {{ slotProps.option.displayName.text }}
                                </div>
                            </div>
                            <div>
                                <div class="text-wrap text-xs">
                                    {{ slotProps.option.formattedAddress }}
                                </div>
                            </div>
                        </div>
                    </template>
                </AutoComplete>
                <button
                    v-if="!!directionsRoute"
                    type="button"
                    class="absolute right-3 top-3 text-sm font-semibold text-gray-900 hover:bg-blue-400 hover:text-white"
                    @click="clearDirections"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke-width="1.5"
                        stroke="currentColor"
                        class="w-6"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            d="M6 18 18 6M6 6l12 12"
                        />
                    </svg>
                </button>
            </div>
        </div>
    </div>
</template>
