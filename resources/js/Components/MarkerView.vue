<script setup>
import { onMounted, ref } from 'vue';
import {
    MapboxFullscreenControl,
    MapboxMap as mapboxgl,
    MapboxNavigationControl,
} from '@studiometa/vue-mapbox-gl';
import { MapboxMap, MapboxImage } from '@studiometa/vue-mapbox-gl';

import { point as pointMethod } from '@/mapbox.js';

import 'mapbox-gl/dist/mapbox-gl.css';
import '@mapbox/mapbox-gl-geocoder/lib/mapbox-gl-geocoder.css';
import FalconSr from '../../assets/falcon-sr.webp';
import FalconLr from '../../assets/falcon-lr.webp';

window.mapboxgl = mapboxgl;
const accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

const props = defineProps(['point']);

const map = ref();

const markers = {
    type: 'FeatureCollection',
    features: [pointMethod(props.point.location, props.point?.properties)],
};

onMounted(() => {
    map.value.on('load', () => {
        map.value.addSource(`source-marker-${props.point.properties.id}`, {
            type: 'geojson',
            data: markers,
        });

        map.value.addLayer({
            id: `layer-marker-${props.point.properties.id}`,
            type: 'symbol',
            source: `source-marker-${props.point.properties.id}`,
            filter: ['!', ['has', 'point_count']],
            layout: {
                'icon-image': ['get', 'icon'],
                'icon-offset': [-25, 0],
                'icon-anchor': 'bottom',
                'icon-size': 0.075,
            },
        });

        map.value.jumpTo({
            center: props.point.location,
            zoom: 14,
            pitch: 0,
            essential: true,
        });
    });
});
</script>

<template>
    <MapboxMap
        :access-token="accessToken"
        map-style="mapbox://styles/cpfeifer1990/cm2y6vg6m004n01pf0pzv696t"
        @mb-created="(mapInstance) => (map = mapInstance)"
    >
        <MapboxNavigationControl />
        <MapboxFullscreenControl />
        <MapboxImage id="falcon-sr" :src="FalconSr" />
        <MapboxImage id="falcon-lr" :src="FalconLr" />
        <MapboxImage id="arrow" src="/assets/navigation-arrow.png" />
    </MapboxMap>
</template>
