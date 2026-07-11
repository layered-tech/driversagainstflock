const onLoaded = (map, markers, viewports) => {
    map.value.addSource(`source-markers`, {
        type: 'geojson',
        data: markers,
        cluster: true,
        clusterMaxZoom: 15,
        clusterProperties: {
            cluster_circle_color: [
                'coalesce',
                ['get', 'cluster_circle_color', ['get', 'style']],
            ],
            cluster_stroke_color: [
                'coalesce',
                ['get', 'cluster_stroke_color', ['get', 'style']],
            ],
        },
    });

    map.value.addLayer({
        id: `layer-cluster`,
        type: 'circle',
        source: `source-markers`,
        filter: ['has', 'point_count'],
        paint: {
            'circle-pitch-alignment': 'map',
            'circle-color': ['get', 'cluster_circle_color'],
            'circle-radius': 20,
            'circle-opacity': 1,
            'circle-stroke-width': 2,
            'circle-stroke-color': ['get', 'cluster_stroke_color'],
        },
    });

    map.value.addLayer({
        id: `layer-cluster-count`,
        type: 'symbol',
        source: `source-markers`,
        filter: ['has', 'point_count'],
        layout: {
            'text-field': ['get', 'point_count_abbreviated'],
            'text-font': ['Arial Unicode MS Bold'],
            'text-size': 14,
        },
        paint: {
            'text-color': '#FFFFFF',
        },
    });

    map.value.addLayer({
        id: `layer-marker`,
        type: 'symbol',
        source: `source-markers`,
        filter: ['!', ['has', 'point_count']],
        layout: {
            'icon-image': ['get', 'icon'],
            'icon-offset': [-25, 0],
            'icon-allow-overlap': true,
            'icon-anchor': ['step', ['zoom'], 'center', 17, 'bottom'],
            'icon-size': [
                'interpolate',
                ['exponential', 2],
                ['zoom'],
                5,
                0.045,
                16,
                0.04,
                18,
                0.08,
            ],
        },
    });

    map.value.addLayer(
        {
            id: `layer-marker-base`,
            type: 'circle',
            source: `source-markers`,
            filter: ['!', ['has', 'point_count']],
            maxzoom: 17,
            paint: {
                'circle-pitch-alignment': 'map',
                'circle-color': ['get', 'circle_color', ['get', 'style']],
                'circle-radius': 20,
                'circle-opacity': 1,
                'circle-stroke-width': 2,
                'circle-stroke-color': [
                    'get',
                    'stroke_color',
                    ['get', 'style'],
                ],
            },
        },
        `layer-marker`,
    );

    map.value.on('click', `layer-marker`, (e) => {
        console.log(e.features);
    });

    map.value.on('click', `layer-cluster`, (e) => {
        console.log(e.features);
    });

    map.value.on('mouseenter', `layer-marker`, () => {
        map.value.getCanvas().style.cursor = 'pointer';
    });

    map.value.on('mouseleave', `layer-marker`, () => {
        map.value.getCanvas().style.cursor = '';
    });

    map.value.addSource(`source-viewports`, {
        type: 'geojson',
        data: viewports,
        cluster: false,
    });

    map.value.addLayer({
        id: `layer-viewports-fill`,
        type: 'fill',
        source: `source-viewports`,
        layout: {},
        minzoom: 17,
        paint: {
            'fill-color': ['get', 'fill_color'],
            'fill-opacity': 0.2,
        },
    });

    map.value.addLayer({
        id: `layer-viewports-outline`,
        type: 'line',
        source: `source-viewports`,
        layout: {},
        minzoom: 17,
        paint: {
            'line-color': ['get', 'line_color'],
            'line-width': 2,
        },
    });
};

const addCurrentPositionSources = (map, position) => {
    map.value.addSource('current-location', {
        type: 'geojson',
        data: {
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: [
                    position.coords.longitude,
                    position.coords.latitude,
                ],
            },
            properties: {},
        },
    });

    map.value.addLayer({
        id: 'driving-current-location-circle',
        type: 'symbol',
        source: 'current-location',
        layout: {
            visibility: 'none',
            'icon-image': 'arrow',
            'icon-anchor': 'bottom',
            'icon-offset': [0, 0],
            'icon-allow-overlap': true,
            'icon-size': [
                'interpolate',
                ['exponential', 2],
                ['zoom'],
                1,
                0.1,
                18,
                0.75,
            ],
        },
    });

    function metersToPixels(meters, latitude, zoomLevel) {
        const earthCircumference = 2 * Math.PI * 6378137; // Earth's circumference in meters
        const mapResolution =
            earthCircumference / (256 * Math.pow(2, zoomLevel));
        const pixels = meters / mapResolution;

        return pixels / Math.cos((latitude * Math.PI) / 180);
    }

    map.value.addLayer({
        id: 'station-current-location-circle',
        type: 'circle',
        source: 'current-location',
        layout: {
            visibility: 'visible',
        },
        paint: {
            'circle-color': 'lightblue',
            'circle-opacity': 0.5,
            'circle-radius': [
                'interpolate',
                ['exponential', 2],
                ['zoom'],
                0,
                metersToPixels(
                    position.coords.accuracy,
                    position.coords.latitude,
                    0,
                ),
                24,
                metersToPixels(
                    position.coords.accuracy,
                    position.coords.latitude,
                    24,
                ),
            ],
        },
    });

    map.value.addLayer({
        id: 'station-current-location-dot',
        type: 'circle',
        source: 'current-location',
        layout: {
            visibility: 'visible',
        },
        paint: {
            'circle-color': '#4285f4',
            'circle-opacity': 1,
            'circle-radius': [
                'interpolate',
                ['exponential', 2],
                ['zoom'],
                0,
                5,
                24,
                15,
            ],
        },
    });
};

const addDirections = (
    map,
    id = 'directions-source',
    lineColor = '#2196f3',
    geometry,
) => {
    map.value.addSource(id, {
        type: 'geojson',
        data: {
            type: 'Feature',
            properties: {},
            geometry: geometry,
        },
    });

    map.value.addLayer({
        id: `${id}-route`,
        type: 'line',
        source: id,
        layout: {
            'line-join': 'round',
            'line-cap': 'round',
        },
        paint: {
            'line-color': lineColor,
            'line-width': [
                'interpolate',
                ['exponential', 2],
                ['zoom'],
                0,
                5,
                18,
                10,
            ],
        },
    });
};

const removeDirections = (map, id) => {
    if (map.value.getLayer(`${id}-route`)) {
        map.value.removeLayer(`${id}-route`);
    }

    if (map.value.getSource(id)) {
        map.value.removeSource(id);
    }
};

const updateSourcePosition = (map, sourceId, position) => {
    map.value.getSource(sourceId).setData({
        type: 'Feature',
        properties: {},
        geometry: {
            type: 'Point',
            coordinates: [position.coords.longitude, position.coords.latitude],
        },
    });
};

const updateSourceData = (map, sourceId, data) => {
    map.value.getSource(sourceId).setData(data);
};

const point = (data, properties = {}) => {
    return {
        type: 'Feature',
        properties: properties,
        geometry: {
            type: 'Point',
            coordinates: data,
        },
    };
};

export {
    addCurrentPositionSources,
    addDirections,
    onLoaded,
    point,
    removeDirections,
    updateSourceData,
    updateSourcePosition,
};
