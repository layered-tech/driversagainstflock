import Mapbox from '@rnmapbox/maps';
import Svg, { Circle, Path } from 'react-native-svg';
import { ConeOfViewImage } from './cone-of-view-image';
import { MAPBOX_ACCESS_TOKEN } from './config';
import {
    ALPR_SYMBOL_IMAGE_NAME,
    ALPR_SYMBOL_IMAGE_SOURCE,
    ANDROID_AUTO_NAVIGATION_PUCK_BEARING_IMAGE,
    ANDROID_AUTO_NAVIGATION_PUCK_SHADOW_IMAGE,
    MARKER_CONE_ZOOM_STYLES,
    NAVIGATION_PUCK_BEARING_IMAGE,
    NAVIGATION_PUCK_SHADOW_IMAGE,
    NAVIGATION_PUCK_TOP_TRANSPARENT_IMAGE,
    POLICE_ALERT_GENERIC_IMAGE,
    POLICE_ALERT_HIDING_IMAGE,
} from './constants';

const POLICE_BADGE_SHIELD_PATH =
    'M24 4 L40.5 10.2 V21.8 C40.5 32.6 33.9 40.7 24 44 C14.1 40.7 7.5 32.6 7.5 21.8 V10.2 Z';
const POLICE_BADGE_STAR_PATH =
    'M24 16 L26.23 21.93 L32.56 22.22 L27.61 26.17 L29.29 32.28 L24 28.8 L18.71 32.28 L20.39 26.17 L15.44 22.22 L21.77 21.93 Z';
const POLICE_HIDING_BUSH_PATH =
    'M5 45.5 C4.5 37.5 8 31.5 14 31.8 C16.5 26.5 25 26 28 30.5 C34.5 27.5 41.5 32.5 42.5 45.5 Z';

function PoliceBadgeShield() {
    return (
        <>
            <Path
                d={POLICE_BADGE_SHIELD_PATH}
                fill="#2E8BFF"
                stroke="#ffffff"
                strokeLinejoin="round"
                strokeWidth={3}
            />
            <Path d={POLICE_BADGE_STAR_PATH} fill="#ffffff" />
        </>
    );
}

if (MAPBOX_ACCESS_TOKEN) {
    Mapbox.setAccessToken(MAPBOX_ACCESS_TOKEN);
}

export function MarkerConeImages() {
    return (
        <Mapbox.Images>
            {MARKER_CONE_ZOOM_STYLES.map((coneStyle) => (
                <Mapbox.Image
                    key={coneStyle.imageName}
                    name={coneStyle.imageName}
                >
                    <ConeOfViewImage coneStyle={coneStyle} />
                </Mapbox.Image>
            ))}
        </Mapbox.Images>
    );
}

export function AlprMarkerImages() {
    return (
        <Mapbox.Images
            images={{
                [ALPR_SYMBOL_IMAGE_NAME]: ALPR_SYMBOL_IMAGE_SOURCE,
            }}
        />
    );
}

export function PoliceAlertImages() {
    return (
        <Mapbox.Images>
            <Mapbox.Image name={POLICE_ALERT_GENERIC_IMAGE}>
                <Svg height={48} viewBox="0 0 48 48" width={48}>
                    <PoliceBadgeShield />
                </Svg>
            </Mapbox.Image>

            {/* POLICE_HIDING: the same badge ducked behind a bush so speed traps
          read differently from visible police at a glance. */}
            <Mapbox.Image name={POLICE_ALERT_HIDING_IMAGE}>
                <Svg height={48} viewBox="0 0 48 48" width={48}>
                    <PoliceBadgeShield />
                    <Path
                        d={POLICE_HIDING_BUSH_PATH}
                        fill="#149E57"
                        stroke="#ffffff"
                        strokeLinejoin="round"
                        strokeWidth={3}
                    />
                </Svg>
            </Mapbox.Image>
        </Mapbox.Images>
    );
}

export function NavigationPuckImages() {
    return (
        <Mapbox.Images>
            {/* The iOS Mapbox SDK substitutes its built-in blue location dot
          whenever the puck's topImage is nil, drawing it on top of the
          custom bearing arrow. Registering a fully transparent top image
          lets the navigation puck suppress that fallback. */}
            <Mapbox.Image name={NAVIGATION_PUCK_TOP_TRANSPARENT_IMAGE}>
                <Svg height={4} viewBox="0 0 4 4" width={4}>
                    <Circle
                        cx={2}
                        cy={2}
                        fill="#000000"
                        fillOpacity={0}
                        r={2}
                    />
                </Svg>
            </Mapbox.Image>

            <Mapbox.Image name={NAVIGATION_PUCK_SHADOW_IMAGE}>
                <Svg height={80} viewBox="0 0 72 80" width={72}>
                    <Path
                        d="M36 10 L60 66 L36 52 L12 66 Z"
                        fill="#5A6573"
                        fillOpacity={0.16}
                    />
                </Svg>
            </Mapbox.Image>

            <Mapbox.Image name={NAVIGATION_PUCK_BEARING_IMAGE}>
                <Svg height={80} viewBox="0 0 72 80" width={72}>
                    <Path
                        d="M36 5 L58 66 L36 51 L14 66 Z"
                        fill="#149E57"
                        stroke="#0B6B3E"
                        strokeLinejoin="round"
                        strokeWidth={7}
                    />
                    <Path
                        d="M36 5 L56 62 L36 48 L16 62 Z"
                        fill="#1FBF6B"
                        stroke="#ffffff"
                        strokeLinejoin="round"
                        strokeWidth={3.75}
                    />
                </Svg>
            </Mapbox.Image>

            <Mapbox.Image name={ANDROID_AUTO_NAVIGATION_PUCK_SHADOW_IMAGE}>
                <Svg height={50} viewBox="0 0 50 50" width={50}>
                    <Circle
                        cx={25}
                        cy={27}
                        fill="#000000"
                        fillOpacity={0.22}
                        r={20}
                    />
                    <Circle cx={25} cy={25} fill="#ffffff" r={19} />
                </Svg>
            </Mapbox.Image>

            <Mapbox.Image name={ANDROID_AUTO_NAVIGATION_PUCK_BEARING_IMAGE}>
                <Svg height={50} viewBox="0 0 50 50" width={50}>
                    <Path
                        d="M25 12 L35 37 L25 31 L15 37 Z"
                        fill="#1FBF6B"
                        stroke="#149E57"
                        strokeLinejoin="round"
                        strokeOpacity={0.2}
                        strokeWidth={3}
                    />
                </Svg>
            </Mapbox.Image>
        </Mapbox.Images>
    );
}
