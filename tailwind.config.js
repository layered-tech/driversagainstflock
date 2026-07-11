import forms from '@tailwindcss/forms';
import defaultTheme from 'tailwindcss/defaultTheme';

/** @type {import('tailwindcss').Config} */
export default {
    darkMode: ['class', '[data-theme="dark"]'],

    content: [
        './vendor/laravel/framework/src/Illuminate/Pagination/resources/views/*.blade.php',
        './storage/framework/views/*.php',
        './resources/views/**/*.blade.php',
        './resources/**/*.vue',
    ],

    theme: {
        extend: {
            borderRadius: {
                dafXs: 'var(--radius-xs)',
                dafSm: 'var(--radius-sm)',
                dafMd: 'var(--radius-md)',
                dafLg: 'var(--radius-lg)',
                dafXl: 'var(--radius-xl)',
                daf2xl: 'var(--radius-2xl)',
                dafPill: 'var(--radius-pill)',
                dafSheet: 'var(--radius-sheet)',
            },
            boxShadow: {
                dafCard: 'var(--shadow-card)',
                dafFloat: 'var(--shadow-float)',
                dafSheet: 'var(--shadow-sheet)',
                dafMarker: 'var(--shadow-marker)',
                dafFocus: 'var(--shadow-focus)',
            },
            colors: {
                daf: {
                    brand: 'var(--brand)',
                    'brand-hover': 'var(--brand-hover)',
                    'brand-press': 'var(--brand-press)',
                    'brand-contrast': 'var(--brand-contrast)',
                    success: 'var(--success)',
                    warning: 'var(--warning)',
                    danger: 'var(--danger)',
                    info: 'var(--info)',
                    focus: 'var(--focus-ring)',
                    azure: 'var(--azure-500)',
                    alert: 'var(--alert-500)',
                    amber: 'var(--amber-500)',
                    violet: 'var(--violet-500)',
                    surface: {
                        page: 'var(--surface-page)',
                        card: 'var(--surface-card)',
                        alt: 'var(--surface-card-alt)',
                        raised: 'var(--surface-raised)',
                        sheet: 'var(--surface-sheet)',
                        glass: 'var(--surface-glass)',
                        'glass-2': 'var(--surface-glass-2)',
                        inverse: 'var(--surface-inverse)',
                    },
                    text: {
                        primary: 'var(--text-primary)',
                        secondary: 'var(--text-secondary)',
                        tertiary: 'var(--text-tertiary)',
                        disabled: 'var(--text-disabled)',
                        inverse: 'var(--text-inverse)',
                        brand: 'var(--text-brand)',
                    },
                    border: {
                        DEFAULT: 'var(--border)',
                        light: 'var(--border-light)',
                        strong: 'var(--border-strong)',
                        glass: 'var(--border-glass)',
                    },
                    route: {
                        fast: 'var(--route-fast)',
                        private: 'var(--route-private)',
                        inactive: 'var(--route-inactive)',
                    },
                    marker: {
                        alpr: 'var(--marker-alpr)',
                        destination: 'var(--marker-destination)',
                        user: 'var(--marker-user)',
                        monitored: 'var(--node-monitored)',
                    },
                },
            },
            fontFamily: {
                sans: ['Hanken Grotesk', ...defaultTheme.fontFamily.sans],
                display: [
                    'Geist',
                    'Hanken Grotesk',
                    ...defaultTheme.fontFamily.sans,
                ],
                ui: ['Hanken Grotesk', ...defaultTheme.fontFamily.sans],
                mono: ['JetBrains Mono', ...defaultTheme.fontFamily.mono],
                inter: ['Hanken Grotesk', ...defaultTheme.fontFamily.sans],
            },
            fontSize: {
                'daf-display-xl': [
                    'var(--fs-display-xl)',
                    { lineHeight: 'var(--lh-display-xl)' },
                ],
                'daf-display-lg': [
                    'var(--fs-display-lg)',
                    { lineHeight: 'var(--lh-display-lg)' },
                ],
                'daf-display-md': [
                    'var(--fs-display-md)',
                    { lineHeight: 'var(--lh-display-md)' },
                ],
                'daf-h1': ['var(--fs-h1)', { lineHeight: 'var(--lh-h1)' }],
                'daf-h2': ['var(--fs-h2)', { lineHeight: 'var(--lh-h2)' }],
                'daf-h3': ['var(--fs-h3)', { lineHeight: 'var(--lh-h3)' }],
                'daf-title': [
                    'var(--fs-title)',
                    { lineHeight: 'var(--lh-title)' },
                ],
                'daf-body-lg': [
                    'var(--fs-body-lg)',
                    { lineHeight: 'var(--lh-body-lg)' },
                ],
                'daf-body': [
                    'var(--fs-body)',
                    { lineHeight: 'var(--lh-body)' },
                ],
                'daf-body-sm': [
                    'var(--fs-body-sm)',
                    { lineHeight: 'var(--lh-body-sm)' },
                ],
                'daf-caption': [
                    'var(--fs-caption)',
                    { lineHeight: 'var(--lh-caption)' },
                ],
                'daf-label': [
                    'var(--fs-label)',
                    { lineHeight: 'var(--lh-label)' },
                ],
            },
        },
    },

    plugins: [forms],
};
