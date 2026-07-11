// Helper functions for degree-radian conversion
const degToRad = (deg) => (deg * Math.PI) / 180;
const radToDeg = (rad) => (rad * 180) / Math.PI;

// Earth's radius in feet
const earthRadiusFt = 20925646.325;

// Function to calculate new coordinates
function calculateNewPosition(lat, lon, distanceFt, bearingDeg) {
    const distanceRad = distanceFt / earthRadiusFt; // Convert distance to radians

    const latRad = degToRad(lat); // Convert latitude to radians
    const lonRad = degToRad(lon); // Convert longitude to radians
    const bearingRad = degToRad(bearingDeg); // Convert bearing to radians

    // Calculate the new latitude
    const newLatRad = Math.asin(
        Math.sin(latRad) * Math.cos(distanceRad) +
            Math.cos(latRad) * Math.sin(distanceRad) * Math.cos(bearingRad),
    );

    // Calculate the new longitude
    const newLonRad =
        lonRad +
        Math.atan2(
            Math.sin(bearingRad) * Math.sin(distanceRad) * Math.cos(latRad),
            Math.cos(distanceRad) - Math.sin(latRad) * Math.sin(newLatRad),
        );

    // Convert the result back to degrees
    const newLat = radToDeg(newLatRad);
    const newLon = radToDeg(newLonRad);

    return { lat: newLat, lon: newLon };
}

export { calculateNewPosition };
