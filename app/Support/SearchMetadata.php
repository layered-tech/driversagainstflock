<?php

namespace App\Support;

use App\Models\OsmNode;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class SearchMetadata
{
    private const HOTLIST_UPDATED_AT_EXPRESSION = 'coalesce(osm_updated_at, created_at)';

    /**
     * @var array<string, array{path: string, title: string, description: string, structuredDataType: string}>
     */
    private const INDEXABLE_PAGES = [
        'home' => [
            'path' => '/',
            'title' => 'Private routes around ALPR cameras',
            'description' => 'Drivers Against Flock maps license-plate readers and roadside cameras so you can plan a route with fewer surveillance devices.',
            'structuredDataType' => 'WebPage',
        ],
        'map' => [
            'path' => '/map',
            'title' => 'ALPR camera route planner',
            'description' => 'Plan a route around automated license-plate readers and roadside cameras with the Drivers Against Flock map.',
            'structuredDataType' => 'WebPage',
        ],
        'hotlist' => [
            'path' => '/hotlist',
            'title' => 'Recently updated ALPR cameras',
            'description' => 'Browse recently updated OpenStreetMap nodes for license-plate readers and roadside cameras.',
            'structuredDataType' => 'CollectionPage',
        ],
        'help' => [
            'path' => '/help',
            'title' => 'Help improve the map',
            'description' => 'Help Drivers Against Flock keep its community-maintained map of license-plate readers and roadside cameras current.',
            'structuredDataType' => 'WebPage',
        ],
        'privacy' => [
            'path' => '/privacy-policy',
            'title' => 'Privacy Policy',
            'description' => 'Read the Drivers Against Flock Privacy Policy and learn how the service handles your data.',
            'structuredDataType' => 'WebPage',
        ],
        'terms' => [
            'path' => '/terms-of-use',
            'title' => 'Terms of Use',
            'description' => 'Read the Drivers Against Flock Terms of Use for the map and route-planning service.',
            'structuredDataType' => 'WebPage',
        ],
    ];

    /**
     * @return array{siteName: string, title: string, description: string, canonical: string, structuredDataType: string, dateModified: string|null, robots: string, isHome: bool}
     */
    public function forRequest(Request $request, ?string $dateModified = null): array
    {
        $routeName = $request->route()?->getName();
        $page = self::INDEXABLE_PAGES[$routeName] ?? null;
        $siteName = (string) config('seo.site_name', 'Drivers Against Flock');

        return [
            'siteName' => $siteName,
            'title' => $page['title'] ?? $siteName,
            'description' => $page['description'] ?? 'Drivers Against Flock helps drivers plan routes around license-plate readers and roadside cameras.',
            'canonical' => $page === null ? $request->url() : $this->absoluteUrl($page['path']),
            'structuredDataType' => $page['structuredDataType'] ?? 'WebPage',
            'dateModified' => $routeName === 'hotlist' ? $dateModified : null,
            'robots' => $page === null ? 'noindex, nofollow' : 'index, follow',
            'isHome' => $routeName === 'home',
        ];
    }

    public function latestHotlistUpdatedAt(): ?string
    {
        $latestUpdatedAt = OsmNode::query()
            ->where('osm_version', 1)
            ->orderByRaw(self::HOTLIST_UPDATED_AT_EXPRESSION.' desc')
            ->toBase()
            ->rawValue(self::HOTLIST_UPDATED_AT_EXPRESSION);

        return $latestUpdatedAt === null
            ? null
            : Carbon::parse($latestUpdatedAt)->toJSON();
    }

    /**
     * @return array<int, array{url: string, lastModified: string|null}>
     */
    public function sitemapEntries(): array
    {
        return [
            ['url' => $this->absoluteUrl('/'), 'lastModified' => null],
            ['url' => $this->absoluteUrl('/map'), 'lastModified' => null],
            ['url' => $this->absoluteUrl('/hotlist'), 'lastModified' => $this->latestHotlistUpdatedAt()],
            ['url' => $this->absoluteUrl('/help'), 'lastModified' => null],
            ['url' => $this->absoluteUrl('/privacy-policy'), 'lastModified' => null],
            ['url' => $this->absoluteUrl('/terms-of-use'), 'lastModified' => null],
        ];
    }

    public function sitemapUrl(): string
    {
        return $this->absoluteUrl('/sitemap.xml');
    }

    private function absoluteUrl(string $path): string
    {
        $baseUrl = rtrim((string) config('app.url', 'http://localhost'), '/');

        return $path === '/' ? $baseUrl.'/' : $baseUrl.$path;
    }
}
