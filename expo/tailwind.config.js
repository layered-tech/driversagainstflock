const { hairlineWidth } = require('nativewind/theme');

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'media',
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
    './*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      borderWidth: {
        hairline: hairlineWidth(),
      },
      borderRadius: {
        dafXs: 6,
        dafSm: 10,
        dafMd: 14,
        dafLg: 18,
        dafXl: 24,
        daf2xl: 32,
        dafPill: 999,
        dafSheet: 22,
      },
      colors: {
        daf: {
          brand: '#1FBF6B',
          'brand-hover': '#2FC177',
          'brand-press': '#149E57',
          'brand-contrast': '#0B0E12',
          success: '#1FBF6B',
          warning: '#FFB02E',
          danger: '#FF4D4F',
          info: '#2E8BFF',
          azure: '#2E8BFF',
          alert: '#FF4D4F',
          amber: '#FFB02E',
          violet: '#7A5CFF',
          surface: {
            page: '#F5F7F9',
            card: '#FFFFFF',
            alt: '#EFF2F5',
            raised: '#FFFFFF',
            sheet: '#FFFFFF',
            inverse: '#0B0E12',
            dark: '#161B22',
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
            DEFAULT: '#E7EAEE',
            strong: '#D4D9DF',
            dark: '#262E37',
            glass: 'rgba(11, 14, 18, 0.10)',
            'glass-dark': 'rgba(255, 255, 255, 0.10)',
          },
          route: {
            fast: '#2E8BFF',
            private: '#1FBF6B',
            inactive: '#A9B2BD',
          },
          marker: {
            alpr: '#FF4D4F',
            destination: '#7A5CFF',
            user: '#1FBF6B',
            monitored: '#FFB02E',
          },
        },
      },
      fontFamily: {
        dafDisplay: ['System'],
        dafUi: ['System'],
        dafMono: ['monospace'],
      },
      spacing: {
        hitMin: 44,
        hitComfy: 46,
        hitLarge: 52,
        gutterScreen: 12,
        gapStack: 8,
      },
    },
  },
  plugins: [],
};
