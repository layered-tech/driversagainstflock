import { Platform } from 'react-native';

export const dafColors = {
    green: {
        50: '#E6F9EF',
        100: '#C2F0D6',
        200: '#8FE2B4',
        300: '#56CF8E',
        400: '#2FC177',
        500: '#1FBF6B',
        600: '#149E57',
        700: '#0F7D45',
        800: '#0C5E34',
        900: '#0A4327',
    },
    ink: {
        950: '#0B0E12',
        900: '#11151B',
        850: '#161B22',
        800: '#1A2027',
        700: '#262E37',
        600: '#3A434E',
        500: '#5A6573',
        400: '#828D9B',
        300: '#A9B2BD',
        200: '#CFD5DC',
        100: '#E7EAEE',
        75: '#EFF2F5',
        50: '#F5F7F9',
    },
    azure: {
        100: '#D6E7FF',
        500: '#2E8BFF',
        600: '#1F6FE0',
    },
    alert: {
        100: '#FFDCDC',
        500: '#FF4D4F',
        600: '#E5383B',
    },
    amber: {
        100: '#FFEFCC',
        500: '#FFB02E',
        600: '#E5901A',
    },
    violet: {
        500: '#7A5CFF',
        600: '#6244E5',
    },
    white: '#FFFFFF',
};

export const dafThemes = {
    light: {
        map: {
            land: '#EAEDF0',
            landAlt: '#E1E5E9',
            park: '#DCEBD6',
            water: '#BBD7EE',
            road: '#FFFFFF',
            roadMinor: '#F4F6F8',
            ink: '#5A6573',
        },
        surface: {
            page: '#F5F7F9',
            card: '#FFFFFF',
            cardAlt: '#EFF2F5',
            raised: '#FFFFFF',
            sheet: '#FFFFFF',
            glass: 'rgba(255, 255, 255, 0.80)',
            glassStrong: 'rgba(255, 255, 255, 0.92)',
            inverse: '#0B0E12',
        },
        text: {
            primary: '#11151B',
            secondary: '#4A5562',
            tertiary: '#828D9B',
            disabled: '#A9B2BD',
            inverse: '#F5F7F9',
            brand: '#0F7D45',
        },
        border: {
            default: '#E7EAEE',
            strong: '#D4D9DF',
            glass: 'rgba(11, 14, 18, 0.10)',
        },
    },
    dark: {
        map: {
            land: '#1A1D23',
            landAlt: '#21262E',
            park: '#1B2A20',
            water: '#15313F',
            road: '#2E353F',
            roadMinor: '#262C34',
            ink: '#8A94A2',
        },
        surface: {
            page: '#0B0E12',
            card: '#161B22',
            cardAlt: '#1A2027',
            raised: '#1A2027',
            sheet: '#11151B',
            glass: 'rgba(17, 21, 27, 0.82)',
            glassStrong: 'rgba(26, 32, 39, 0.92)',
            inverse: '#F5F7F9',
        },
        text: {
            primary: '#F5F7F9',
            secondary: '#A9B2BD',
            tertiary: '#828D9B',
            disabled: '#5A6573',
            inverse: '#11151B',
            brand: '#2FC177',
        },
        border: {
            default: '#262E37',
            strong: '#3A434E',
            glass: 'rgba(255, 255, 255, 0.10)',
        },
    },
};

export const dafSemanticColors = {
    brand: dafColors.green[500],
    brandHover: dafColors.green[400],
    brandPress: dafColors.green[600],
    brandContrast: dafColors.ink[950],
    success: dafColors.green[500],
    warning: dafColors.amber[500],
    danger: dafColors.alert[500],
    info: dafColors.azure[500],
    routeFast: dafColors.azure[500],
    routePrivate: dafColors.green[500],
    markerAlpr: dafColors.alert[500],
    markerDestination: dafColors.violet[500],
    markerUser: dafColors.green[500],
    nodeMonitored: dafColors.amber[500],
    speedOk: dafColors.ink[500],
    speedLimitRing: dafColors.ink[400],
    speedOver: dafColors.ink[900],
};

export const dafSpacing = {
    0: 0,
    1: 4,
    2: 8,
    3: 12,
    4: 16,
    5: 20,
    6: 24,
    7: 32,
    8: 40,
    9: 48,
    10: 64,
    11: 80,
    12: 96,
    13: 128,
    hitMin: 44,
    hitComfy: 46,
    hitLarge: 52,
    gutterScreen: 12,
    gapStack: 8,
};

export const dafRadius = {
    xs: 6,
    sm: 10,
    md: 14,
    lg: 18,
    xl: 24,
    '2xl': 32,
    pill: 999,
    sheet: 22,
};

export const dafTypography = {
    display: {
        fontFamily: undefined,
        fontFamilyName: 'Geist',
    },
    ui: {
        fontFamily: undefined,
        fontFamilyName: 'Hanken Grotesk',
    },
    mono: {
        fontFamily: Platform.select({
            ios: 'Menlo',
            android: 'monospace',
            default: 'monospace',
        }),
        fontFamilyName: 'JetBrains Mono',
    },
    sizes: {
        h1: 32,
        h2: 26,
        h3: 21,
        title: 18,
        bodyLarge: 17,
        body: 15,
        bodySmall: 13,
        caption: 12,
        label: 11,
    },
};

export const dafMotion = {
    instant: 90,
    fast: 140,
    base: 220,
    slow: 320,
    sheet: 420,
    pressScale: 0.97,
};

export function getDafTheme(colorScheme) {
    return colorScheme === 'dark' ? dafThemes.dark : dafThemes.light;
}
