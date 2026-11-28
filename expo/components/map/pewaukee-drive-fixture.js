const { getRoadCoordinateDistanceMeters } = require('./road-graph.js');
const savedRoute = require('../../.android-auto/route-pewaukee.json');
const leg = savedRoute.routes[0].legs[0];
const step = leg.steps[0];
const pewaukeeCoordinates = step.path.map(({ lng, lat }) => [lng, lat]);
const distances = [0];
for (let index = 1; index < pewaukeeCoordinates.length; index++) {
    distances.push(
        distances[index - 1] +
            getRoadCoordinateDistanceMeters(
                pewaukeeCoordinates[index - 1],
                pewaukeeCoordinates[index],
            ),
    );
}
const last = pewaukeeCoordinates.length - 1;

const pewaukeeStops = [
    {
        id: 'pewaukee-road',
        name: 'Pewaukee Road',
        address: 'Pewaukee Road, WI',
        index: 48,
    },
    {
        id: 'pewaukee-parkland',
        name: '377 Parkland Ct',
        address: leg.end_address,
        index: last,
    },
].map((stop) => ({ ...stop, coordinate: pewaukeeCoordinates[stop.index] }));

function pewaukeeDirections(start, end, waypoints = []) {
    const stop = pewaukeeStops.find(
        ({ coordinate }) =>
            Math.abs(coordinate[0] - end?.longitude) < 0.00001 &&
            Math.abs(coordinate[1] - end?.latitude) < 0.00001,
    );
    if (
        !stop ||
        waypoints?.length ||
        !Number.isFinite(start?.longitude) ||
        !Number.isFinite(start?.latitude)
    )
        return null;
    const origin = [start.longitude, start.latitude];
    let closest = 0;
    let minimum = Infinity;
    for (let index = 0; index < stop.index; index++) {
        const distance = getRoadCoordinateDistanceMeters(
            origin,
            pewaukeeCoordinates[index],
        );
        if (distance < minimum) {
            minimum = distance;
            closest = index;
        }
    }
    if (minimum > 75) return null;
    const coordinates = pewaukeeCoordinates.slice(closest, stop.index + 1);
    const endIndex = coordinates.length - 1;
    const fraction =
        (distances[stop.index] - distances[closest]) / distances[last];
    const distance = leg.distance.value * fraction;
    const duration = leg.duration.value * fraction;
    return {
        routes: {
            direct: {
                coordinates,
                distance,
                duration,
                maneuvers: [
                    {
                        type: 11,
                        instruction: step.instructions.replace(/<[^>]+>/g, ''),
                        name: 'Pewaukee Road',
                        distance,
                        duration,
                        way_points: [0, endIndex],
                        maneuver: { location: coordinates[0] },
                    },
                    {
                        type: 10,
                        instruction: 'Arrive at your destination',
                        distance: 0,
                        duration: 0,
                        way_points: [endIndex, endIndex],
                        maneuver: { location: coordinates[endIndex] },
                    },
                ],
            },
        },
    };
}

module.exports = { pewaukeeCoordinates, pewaukeeDirections, pewaukeeStops };
