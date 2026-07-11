import '../css/app.css';
import './bootstrap';

import { createGtm } from '@gtm-support/vue-gtm';
import { createInertiaApp } from '@inertiajs/vue3';
import Lara from '@primevue/themes/lara';
import { resolvePageComponent } from 'laravel-vite-plugin/inertia-helpers';
import PrimeVue from 'primevue/config';
import { createApp, h } from 'vue';
import { ZiggyVue } from '../../vendor/tightenco/ziggy';
import { bootDafTheme } from './design-system/theme';

const appName = import.meta.env.VITE_APP_NAME || 'Laravel';

bootDafTheme();

createInertiaApp({
    title: (title) => `${title} - ${appName}`,
    resolve: (name) =>
        resolvePageComponent(
            `./Pages/${name}.vue`,
            import.meta.glob('./Pages/**/*.vue'),
        ),
    setup({ el, App, props, plugin }) {
        const app = createApp({ render: () => h(App, props) });

        app.use(plugin);
        app.use(ZiggyVue);
        app.use(PrimeVue, {
            theme: {
                preset: Lara,
                options: {
                    darkModeSelector: false,
                },
            },
        });

        if (import.meta.env.VITE_GTAG_ID) {
            app.use(
                createGtm({
                    id: import.meta.env.VITE_GTAG_ID,
                    // queryParams: {
                    //     // Add URL query string when loading gtm.js with GTM ID (required when using custom environments)
                    //     gtm_auth: 'AB7cDEf3GHIjkl-MnOP8qr',
                    //     gtm_preview: 'env-4',
                    //     gtm_cookies_win: 'x',
                    // },
                    // defer: false, // Script can be set to `defer` to speed up page load at the cost of less accurate results (in case visitor leaves before script is loaded, which is unlikely but possible). Defaults to false, so the script is loaded `async` by default
                    // compatibility: false, // Will add `async` and `defer` to the script tag to not block requests for old browsers that do not support `async`
                    // nonce: '2726c7f26c', // Will add `nonce` to the script tag
                    enabled: true, // defaults to true. Plugin can be disabled by setting this to false for Ex: enabled: !!GDPR_Cookie (optional)
                    debug: false, // Whether to display console logs debugs (optional)
                    // loadScript: true, // Whether to load the GTM Script (Helpful if you are including GTM manually, but need the dataLayer functionality in your components) (optional)
                    vueRouter: null, // Pass the router instance to automatically sync with router (optional)
                    // ignoredViews: ['homepage'], // Don't trigger events for specified router names (optional)
                    // trackOnNextTick: false, // Whether to call trackView in Vue.nextTick
                }),
            );
        }

        app.mount(el);
    },
    progress: {
        color: '#1FBF6B',
    },
});
