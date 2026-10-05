export const MAP_OPTIONS_TOUR = {
    id: 'map-options',
    storageKey: 'driversagainstflock.mapOptionsTour.v1',
    label: 'Map options tour',
    steps: [
        {
            id: 'police-reports',
            target: 'police-reports',
            title: 'Police reports from Waze',
            description:
                'Turn this on to show community police reports from Waze around your location and include them in driving alerts. Report details show when a report was made. New reports need an internet connection.',
            scroll: true,
        },
        {
            id: 'time-of-day',
            target: 'time-of-day',
            title: "Choose the map's time of day",
            description:
                'Auto adjusts the map lighting for dawn, day, dusk, and night using the current time and your location. It uses local time when location is unavailable. Choose a fixed preset to keep that appearance.',
            scroll: true,
        },
        {
            id: 'offline-data',
            target: 'offline-data',
            title: 'Take map data offline',
            description:
                'Expand Offline Data to download the selected map layer for an area. Use Current View chooses the region; Max Zoom controls detail and storage. Check progress, resume an interrupted download, or delete saved tiles here. Route calculation and new police reports need internet.',
            scroll: true,
        },
    ],
};
