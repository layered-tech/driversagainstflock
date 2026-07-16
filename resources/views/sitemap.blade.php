<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
@foreach ($urls as $url)
    <url>
        <loc>{{ $url['url'] }}</loc>
        @if ($url['lastModified'] !== null)
        <lastmod>{{ $url['lastModified'] }}</lastmod>
        @endif
    </url>
@endforeach
</urlset>
