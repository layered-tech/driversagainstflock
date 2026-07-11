import { createElement } from 'react';
import Svg, {
    Circle,
    Line,
    Path,
    Polygon,
    Polyline,
    Rect,
} from 'react-native-svg';
import { iconPaths } from './icon-paths';

const SVG_TAGS = {
    circle: Circle,
    line: Line,
    path: Path,
    polygon: Polygon,
    polyline: Polyline,
    rect: Rect,
};

export function Icon({
    color = 'currentColor',
    name,
    size = 20,
    stroke = 2,
    title,
    ...svgProps
}) {
    const nodes = iconPaths[name] ?? [];

    return (
        <Svg
            accessibilityLabel={title}
            accessible={Boolean(title)}
            fill="none"
            height={size}
            stroke={color}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={stroke}
            viewBox="0 0 24 24"
            width={size}
            {...svgProps}
        >
            {nodes.map(([tag, attrs], index) => {
                const Component = SVG_TAGS[tag];

                return Component
                    ? createElement(Component, {
                          key: `${name}-${index}`,
                          ...attrs,
                      })
                    : null;
            })}
        </Svg>
    );
}
