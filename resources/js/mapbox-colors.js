export function normalizeMapboxColor(color) {
    const hexWithAlpha = color.match(/^#([0-9a-f]{4}|[0-9a-f]{8})$/i)?.[1];

    if (!hexWithAlpha) {
        return color;
    }

    const expandedHex =
        hexWithAlpha.length === 4
            ? [...hexWithAlpha].map((character) => character.repeat(2)).join('')
            : hexWithAlpha;
    const red = Number.parseInt(expandedHex.slice(0, 2), 16);
    const green = Number.parseInt(expandedHex.slice(2, 4), 16);
    const blue = Number.parseInt(expandedHex.slice(4, 6), 16);
    const alpha = Number.parseInt(expandedHex.slice(6, 8), 16) / 255;

    return `rgba(${red},${green},${blue},${alpha})`;
}
