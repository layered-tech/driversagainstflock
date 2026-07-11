import Svg, { Path } from 'react-native-svg';

function getConePoint(center, length, degreesFromNorth) {
    const radians = (degreesFromNorth * Math.PI) / 180;

    return {
        x: center + Math.sin(radians) * length,
        y: center - Math.cos(radians) * length,
    };
}

function getConePath(center, length, angle) {
    const halfAngle = angle / 2;
    const leftPoint = getConePoint(center, length, -halfAngle);
    const rightPoint = getConePoint(center, length, halfAngle);
    const largeArcFlag = angle > 180 ? 1 : 0;

    return [
        `M ${center} ${center}`,
        `L ${leftPoint.x.toFixed(2)} ${leftPoint.y.toFixed(2)}`,
        `A ${length} ${length} 0 ${largeArcFlag} 1 ${rightPoint.x.toFixed(2)} ${rightPoint.y.toFixed(2)}`,
        'Z',
    ].join(' ');
}

export function ConeOfViewImage({ coneStyle }) {
    const padding = 4;
    const size = Math.ceil(coneStyle.length * 2 + padding * 2);
    const center = size / 2;
    const conePath = getConePath(center, coneStyle.length, coneStyle.angle);

    return (
        <Svg height={size} viewBox={`0 0 ${size} ${size}`} width={size}>
            <Path
                d={conePath}
                fill={coneStyle.color}
                fillOpacity={coneStyle.opacity}
                stroke={coneStyle.borderColor}
                strokeLinejoin="round"
                strokeWidth={1}
            />
        </Svg>
    );
}
