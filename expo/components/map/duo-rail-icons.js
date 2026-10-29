// Template images preserve the design's line geometry and follow the native tint.
const sources = {
    plus: require('../../assets/map/rail-plus.png'),
    minus: require('../../assets/map/rail-minus.png'),
    scope: require('../../assets/map/rail-recenter.png'),
    pencil: require('../../assets/map/rail-pencil.png'),
    'location.north': require('../../assets/map/rail-navigation.png'),
    'line.3.horizontal': require('../../assets/map/rail-menu.png'),
    xmark: require('../../assets/map/rail-x.png'),
    map: require('../../assets/map/rail-map.png'),
    'point.topleft.down.to.point.bottomright.curvepath': require('../../assets/map/rail-route.png'),
    'slider.vertical.3': require('../../assets/map/rail-filters.png'),
};

export function getDuoRailIcon(symbol) {
    const source = sources[symbol];
    return source == null
        ? undefined
        : { type: 'templateSource', templateSource: source };
}
