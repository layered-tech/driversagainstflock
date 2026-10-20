import Svg, {
    Defs,
    Ellipse,
    LinearGradient,
    Path,
    Stop,
} from 'react-native-svg';

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

export function ConeOfViewImage({ coneStyle, variant = 'flat' }) {
    const padding = 4;
    const size = Math.ceil(coneStyle.length * 2 + padding * 2);
    const center = size / 2;
    const conePath = getConePath(center, coneStyle.length, coneStyle.angle);

    if (variant !== 'flat') {
        const halfAngle = (coneStyle.angle * Math.PI) / 360;
        const radiusX = Math.sin(halfAngle) * coneStyle.length;
        const radiusY = radiusX * 0.3;
        const endY = center - Math.cos(halfAngle) * coneStyle.length + radiusY;
        const left = center - radiusX;
        const right = center + radiusX;
        const tip = `M ${center} ${center}`;
        const body =
            variant === 'faceted'
                ? `${tip} L ${left} ${endY} L ${center} ${endY - radiusY} L ${right} ${endY} Z`
                : `${tip} L ${left} ${endY} A ${radiusX} ${radiusY} 0 0 1 ${right} ${endY} Z`;
        const gradientId = `cone-${variant}-${coneStyle.imageName}`;

        return (
            <Svg height={size} viewBox={`0 0 ${size} ${size}`} width={size}>
                <Defs>
                    <LinearGradient
                        id={gradientId}
                        x1="0%"
                        y1="100%"
                        x2="0%"
                        y2="0%"
                    >
                        <Stop
                            offset="0"
                            stopColor={coneStyle.color}
                            stopOpacity={0.65}
                        />
                        <Stop
                            offset="0.55"
                            stopColor={coneStyle.color}
                            stopOpacity={0.28}
                        />
                        <Stop
                            offset="1"
                            stopColor={coneStyle.color}
                            stopOpacity={variant === 'beam' ? 0 : 0.08}
                        />
                    </LinearGradient>
                </Defs>
                <Path
                    d={variant === 'beam' ? conePath : body}
                    fill={`url(#${gradientId})`}
                />
                {variant === 'volume' ? (
                    <>
                        <Ellipse
                            cx={center}
                            cy={endY}
                            rx={radiusX}
                            ry={radiusY}
                            fill={coneStyle.color}
                            fillOpacity={0.08}
                            stroke={coneStyle.borderColor}
                            strokeOpacity={0.5}
                            strokeWidth={0.8}
                        />
                        <Path
                            d={`${tip} L ${left} ${endY} M ${center} ${center} L ${right} ${endY}`}
                            fill="none"
                            stroke={coneStyle.borderColor}
                            strokeOpacity={0.4}
                            strokeWidth={0.8}
                        />
                        <Path
                            d={`${tip} Q ${center - radiusX * 0.18} ${endY + coneStyle.length * 0.4} ${center} ${endY - radiusY}`}
                            fill="none"
                            stroke={coneStyle.color}
                            strokeOpacity={0.5}
                            strokeWidth={1.2}
                        />
                    </>
                ) : null}
                {variant === 'faceted' ? (
                    <>
                        <Path
                            d={`${tip} L ${left} ${endY} L ${center} ${endY - radiusY} Z`}
                            fill={coneStyle.color}
                            fillOpacity={0.24}
                        />
                        <Path
                            d={`${tip} L ${center} ${endY - radiusY} L ${right} ${endY} Z`}
                            fill={coneStyle.color}
                            fillOpacity={0.1}
                        />
                        <Path
                            d={`M ${left} ${endY} L ${center} ${endY - radiusY} L ${right} ${endY} L ${center} ${endY + radiusY} Z`}
                            fill={coneStyle.color}
                            fillOpacity={0.12}
                            stroke={coneStyle.borderColor}
                            strokeOpacity={0.5}
                            strokeWidth={0.8}
                        />
                        <Path
                            d={`${tip} L ${center} ${endY - radiusY}`}
                            fill="none"
                            stroke={coneStyle.borderColor}
                            strokeOpacity={0.45}
                            strokeWidth={0.8}
                        />
                    </>
                ) : null}
            </Svg>
        );
    }

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
