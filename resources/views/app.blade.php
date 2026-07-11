<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}" class="h-full bg-daf-surface-page" data-theme="light">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta name="theme-color" content="#1FBF6B">

        <title inertia>{{ config('app.name', 'Laravel') }}</title>

        <script>
            (() => {
                try {
                    const storedTheme = window.localStorage.getItem('daf-theme');
                    const theme = ['light', 'dark'].includes(storedTheme)
                        ? storedTheme
                        : window.matchMedia('(prefers-color-scheme: dark)').matches
                            ? 'dark'
                            : 'light';

                    document.documentElement.dataset.theme = theme;
                    document.documentElement.classList.toggle('dark', theme === 'dark');
                } catch (error) {
                    document.documentElement.dataset.theme = 'light';
                }
            })();
        </script>

        <!-- Scripts -->
        @routes
        @vite('resources/js/app.js')
        @inertiaHead
    </head>
    <body class="h-full bg-daf-surface-page font-sans text-daf-text-primary antialiased">
        @inertia
    </body>
</html>
