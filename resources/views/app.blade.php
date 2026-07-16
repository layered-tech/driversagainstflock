<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}" class="h-full bg-daf-surface-page" data-theme="light">
    @php
        $seo = $page['props']['seo'];
        $homeUrl = rtrim((string) config('app.url'), '/').'/';
        $pageStructuredData = [
            '@context' => 'https://schema.org',
            '@type' => $seo['structuredDataType'],
            'name' => $seo['title'],
            'description' => $seo['description'],
            'url' => $seo['canonical'],
            'isPartOf' => [
                '@type' => 'WebSite',
                'name' => $seo['siteName'],
                'url' => $homeUrl,
            ],
        ];

        if ($seo['dateModified'] !== null) {
            $pageStructuredData['dateModified'] = $seo['dateModified'];
        }

        $pageStructuredDataJson = json_encode(
            $pageStructuredData,
            JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_SLASHES,
        );
        $siteStructuredDataJson = json_encode(
            [
                '@context' => 'https://schema.org',
                '@type' => 'WebSite',
                'name' => $seo['siteName'],
                'alternateName' => 'DAF',
                'url' => $homeUrl,
            ],
            JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_SLASHES,
        );
    @endphp
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta name="theme-color" content="#1FBF6B">
        <meta name="application-name" content="{{ $seo['siteName'] }}">

        <link rel="icon" href="{{ asset('favicon.ico') }}" sizes="any">
        <link rel="icon" type="image/png" sizes="48x48" href="{{ asset('favicon-48x48.png') }}">
        <link rel="icon" type="image/png" sizes="192x192" href="{{ asset('favicon-192x192.png') }}">
        <link rel="apple-touch-icon" sizes="180x180" href="{{ asset('apple-touch-icon.png') }}">

        <title data-inertia>{{ $seo['title'] }} - {{ $seo['siteName'] }}</title>
        <meta data-inertia="description" name="description" content="{{ $seo['description'] }}">
        <meta data-inertia="robots" name="robots" content="{{ $seo['robots'] }}">
        <link data-inertia="canonical" rel="canonical" href="{{ $seo['canonical'] }}">
        <meta data-inertia="og:title" property="og:title" content="{{ $seo['title'] }} - {{ $seo['siteName'] }}">
        <meta data-inertia="og:description" property="og:description" content="{{ $seo['description'] }}">
        <meta data-inertia="og:type" property="og:type" content="website">
        <meta data-inertia="og:url" property="og:url" content="{{ $seo['canonical'] }}">
        <meta data-inertia="og:site_name" property="og:site_name" content="{{ $seo['siteName'] }}">
        <meta data-inertia="twitter:card" name="twitter:card" content="summary">
        <meta data-inertia="twitter:title" name="twitter:title" content="{{ $seo['title'] }} - {{ $seo['siteName'] }}">
        <meta data-inertia="twitter:description" name="twitter:description" content="{{ $seo['description'] }}">

        @if ($seo['isHome'])
            <script data-inertia="site-structured-data" type="application/ld+json">{!! $siteStructuredDataJson !!}</script>
        @endif
        <script data-inertia="page-structured-data" type="application/ld+json">{!! $pageStructuredDataJson !!}</script>

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
