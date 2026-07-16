<?php

use App\Models\OsmNode;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Inertia\Testing\AssertableInertia as Assert;
use MatanYadaev\EloquentSpatial\Objects\Point;

test('landing page is displayed at the home route', function () {
    $this->get('/')
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('Landing')
            ->where('user', null)
            ->has('canLogin')
            ->has('canRegister')
        );
});

test('public pages render crawler-visible metadata and the branded favicon', function () {
    $baseUrl = rtrim((string) config('app.url'), '/');

    $this->get('/')
        ->assertOk()
        ->assertSee('Private routes around ALPR cameras - Drivers Against Flock')
        ->assertSee('data-inertia="description"', false)
        ->assertSee('href="'.$baseUrl.'/favicon-48x48.png"', false)
        ->assertSee('rel="canonical" href="'.$baseUrl.'/"', false)
        ->assertSee('property="og:site_name" content="Drivers Against Flock"', false)
        ->assertSee('"@type":"WebSite"', false)
        ->assertSee('"@type":"WebPage"', false);

    [$width, $height] = getimagesize(public_path('favicon-48x48.png'));

    expect($width)->toBe(48)
        ->and($height)->toBe(48)
        ->and(filesize(public_path('favicon.ico')))->toBeGreaterThan(0);

    collect(['Landing', 'Map', 'Hotlist', 'Help', 'Privacy', 'Terms'])
        ->each(function (string $page): void {
            expect(file_get_contents(resource_path("js/Pages/{$page}.vue")))
                ->toContain('<DafSiteHead />');
        });
});

test('landing footer links scroll to page sections', function () {
    $landingPage = file_get_contents(resource_path('js/Pages/Landing.vue'));
    $footerComponent = file_get_contents(resource_path('js/Components/Daf/DafSiteFooter.vue'));

    expect($landingPage)
        ->toContain('DafSiteFooter')
        ->toContain('https://apps.apple.com/us/app/drivers-against-flock/id6741054638')
        ->toContain("{ label: 'How it works', href: '#how' }")
        ->toContain("{ label: 'Full map', href: '/map' }")
        ->toContain("{ label: 'Apps', href: '#apps' }")
        ->toContain("{ label: 'FAQ', href: '#faq' }")
        ->toContain("{ label: 'Help', href: '/help' }")
        ->and($footerComponent)
        ->toContain('© 2026 LayeredTech, LLC. All rights reserved.')
        ->toContain('href="https://github.com/layered-tech/driversagainstflock"')
        ->toContain('aria-label="GitHub"')
        ->toContain('Privacy Policy')
        ->toContain('Terms of Use')
        ->toContain("default: '/privacy-policy'")
        ->toContain("default: '/terms-of-use'")
        ->toContain("behavior: prefersReducedMotion() ? 'auto' : 'smooth',");
});

test('landing apk link points to the download route', function () {
    $landingPage = file_get_contents(resource_path('js/Pages/Landing.vue'));

    expect($landingPage)
        ->toContain("const apkUrl = '/downloads/android-apk';")
        ->not->toContain("const apkUrl = '/assets/com.anonymous.drivefree.apk';");
});

test('android apk route downloads the APK from S3', function () {
    Storage::fake('s3');
    Storage::disk('s3')->put('android.apk', 'APK contents');

    $response = $this->get('/downloads/android-apk');

    $response
        ->assertOk()
        ->assertDownload('android.apk');

    expect($response->streamedContent())->toBe('APK contents');
});

test('daf site footer fills available viewport space on base pages', function () {
    $footerComponent = file_get_contents(resource_path('js/Components/Daf/DafSiteFooter.vue'));

    expect($footerComponent)
        ->toContain('<footer class="flex-1 border-t border-daf-border bg-daf-surface-card">');

    collect(['Landing', 'Hotlist', 'Help', 'Privacy', 'Terms'])
        ->each(function (string $page): void {
            expect(file_get_contents(resource_path("js/Pages/{$page}.vue")))
                ->toContain('class="flex min-h-full flex-col bg-daf-surface-page text-daf-text-primary"')
                ->toContain('<DafSiteFooter :links="footerLinks" />');
        });
});

test('privacy policy page is displayed at the policy route', function () {
    $this->get('/privacy-policy')
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('Privacy')
            ->where('user', null)
            ->has('canLogin')
            ->has('canRegister')
        );
});

test('privacy policy uses the dedicated DAF policy page', function () {
    $privacyPage = file_get_contents(resource_path('js/Pages/Privacy.vue'));

    expect($privacyPage)
        ->toContain('DafSiteHeader')
        ->toContain('DafSiteFooter')
        ->toContain('Last updated {{ lastUpdated }}')
        ->toContain('Location is optional')
        ->toContain('DAF does not store your location history.')
        ->toContain('OpenRouteService')
        ->toContain('support@driversagainstflock.com')
        ->not->toContain('Payday')
        ->not->toContain('privacy@driversagainstflock.com');
});

test('terms of use page is displayed at the terms route', function () {
    $this->get('/terms-of-use')
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('Terms')
            ->where('user', null)
            ->has('canLogin')
            ->has('canRegister')
        );
});

test('terms of use uses the dedicated DAF terms page', function () {
    $termsPage = file_get_contents(resource_path('js/Pages/Terms.vue'));

    expect($termsPage)
        ->toContain('DafSiteHeader')
        ->toContain('DafSiteFooter')
        ->toContain('Effective {{ lastUpdated }}')
        ->toContain('Drive safely & legally')
        ->toContain('Navigation and routing disclaimer')
        ->toContain('Surveillance device and marker data')
        ->toContain('Questions about these Terms?')
        ->toContain('support@driversagainstflock.com')
        ->not->toContain('Payday')
        ->not->toContain('legal@driversagainstflock.com');
});

test('legal page email links use visible mailto addresses', function () {
    $privacyPage = file_get_contents(resource_path('js/Pages/Privacy.vue'));
    $termsPage = file_get_contents(resource_path('js/Pages/Terms.vue'));

    expect($privacyPage)
        ->toContain('href="mailto:support@driversagainstflock.com"')
        ->toContain('support@driversagainstflock.com')
        ->not->toContain('DafObfuscatedEmailLink')
        ->not->toContain(':domain-parts="emailDomainParts"')
        ->and($termsPage)
        ->toContain('href="mailto:support@driversagainstflock.com"')
        ->toContain('support@driversagainstflock.com')
        ->not->toContain('DafObfuscatedEmailLink')
        ->not->toContain(':domain-parts="emailDomainParts"');
});

test('legacy mobile install pages are removed from the public site', function () {
    $this->get('/android')->assertNotFound();
    $this->get('/ios')->assertNotFound();

    expect(file_exists(resource_path('js/Pages/Android.vue')))->toBeFalse()
        ->and(file_exists(resource_path('js/Pages/iOS.vue')))->toBeFalse();
});

test('site headers do not show the map preview link', function () {
    $landingPage = file_get_contents(resource_path('js/Pages/Landing.vue'));
    $mapPage = file_get_contents(resource_path('js/Pages/Map.vue'));

    expect($landingPage)
        ->not->toContain('Map Preview')
        ->and($mapPage)
        ->not->toContain('Map Preview');
});

test('site headers label the help route as contribute', function () {
    collect(['Landing', 'Hotlist', 'Map', 'Help', 'Privacy', 'Terms'])
        ->each(function (string $page): void {
            expect(file_get_contents(resource_path("js/Pages/{$page}.vue")))
                ->toContain("{ label: 'Contribute', href: '/help' }");
        });
});

test('site header removes theme toggle and empty desktop action slot', function () {
    $headerComponent = file_get_contents(resource_path('js/Components/Daf/DafSiteHeader.vue'));
    $mapPage = file_get_contents(resource_path('js/Pages/Map.vue'));

    expect($headerComponent)
        ->toContain('desktopActionsAreVisible')
        ->toContain("!desktopActionsAreVisible.value ? 'lg:hidden' : ''")
        ->toContain('class="hidden items-center gap-0 lg:flex xl:gap-1"')
        ->toContain('class="hidden xl:inline-flex"')
        ->not->toContain('showThemeToggle')
        ->not->toContain('toggleDafTheme')
        ->not->toContain('getActiveDafTheme')
        ->not->toContain('DafIconButton')
        ->and($mapPage)
        ->toContain(':cta-href="\'\'"')
        ->not->toContain(':show-theme-toggle')
        ->not->toContain('@theme-change="handleThemeChanged"');
});

test('landing hero map follows the active ui theme', function () {
    $heroPreview = file_get_contents(resource_path('js/Components/Daf/Marketing/HeroMapboxPreview.vue'));

    expect($heroPreview)
        ->toContain("import { getActiveDafTheme } from '@/design-system/theme';")
        ->toContain('config: mapStyleConfig()')
        ->toContain("setConfigProperty(\n            'basemap',\n            'lightPreset',")
        ->toContain("getActiveDafTheme() === 'dark' ? 'night' : 'day'")
        ->toContain("window.addEventListener('daf-theme-change', handleThemeChanged)")
        ->toContain("attributeFilter: ['data-theme']");
});

test('landing hero map runtime layers stay emissive in night mode', function () {
    $heroPreview = file_get_contents(resource_path('js/Components/Daf/Marketing/HeroMapboxPreview.vue'));

    expect($heroPreview)
        ->toContain('MAP_LAYER_EMISSIVE_STRENGTH = 1')
        ->toContain("'icon-emissive-strength': MAP_LAYER_EMISSIVE_STRENGTH")
        ->toContain("'circle-emissive-strength': MAP_LAYER_EMISSIVE_STRENGTH")
        ->toContain("'text-emissive-strength': MAP_LAYER_EMISSIVE_STRENGTH")
        ->and(substr_count($heroPreview, "'circle-emissive-strength': MAP_LAYER_EMISSIVE_STRENGTH"))
        ->toBeGreaterThanOrEqual(5);
});

test('map page remains available at the map route', function () {
    $this->get('/map')
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('Map')
            ->where('points', [])
            ->has('canLogin')
            ->has('canRegister')
        );
});

test('hotlist page is displayed with recent node rows', function () {
    $this->travelTo('2026-06-24 12:00:00');

    $osmUpdatedAt = now()->subHours(3);

    OsmNode::query()->create([
        'osm_id' => 12379768752,
        'latitude' => 43.0063950,
        'longitude' => -88.1077715,
        'location' => new Point(43.0063950, -88.1077715),
        'tags' => [
            'operator' => 'Flock Safety',
            'name' => 'Bluemound camera',
            'addr:housenumber' => '2401',
            'addr:street' => 'W Bluemound Rd',
            'addr:city' => 'Waukesha',
            'surveillance:type' => 'ALPR',
        ],
        'surveillance_type' => 'ALPR',
        'osm_updated_at' => $osmUpdatedAt,
        'osm_version' => 1,
        'osm_changeset_id' => 987654321,
        'osm_user' => 'mapper-one',
        'osm_uid' => 1234567,
        'last_synced_at' => now(),
    ]);

    $this->get('/hotlist')
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('Hotlist')
            ->where('user', null)
            ->has('canLogin')
            ->has('canRegister')
            ->where('nodes.total', 1)
            ->where('nodes.perPage', 25)
            ->has('nodes.data', 1)
            ->where('nodes.data.0.osmId', 12379768752)
            ->where('nodes.data.0.type', 'alpr')
            ->where('nodes.data.0.typeLabel', 'ALPR reader')
            ->where('nodes.data.0.operator', 'Flock Safety')
            ->where('nodes.data.0.manufacturer', 'Flock Safety')
            ->where('nodes.data.0.street', '2401 W Bluemound Rd')
            ->where('nodes.data.0.city', 'Waukesha')
            ->where('nodes.data.0.contributor', 'mapper-one')
            ->where('nodes.data.0.updatedAt', $osmUpdatedAt->toJSON())
            ->where('nodes.data.0.osmUpdatedAt', $osmUpdatedAt->toJSON())
            ->where('nodes.data.0.osmVersion', 1)
            ->where('nodes.data.0.osmChangesetId', 987654321)
            ->where('nodes.data.0.osmUser', 'mapper-one')
            ->where('nodes.data.0.osmUid', 1234567)
            ->where('nodes.data.0.coordinates.0', -88.1077715)
            ->where('nodes.data.0.coordinates.1', 43.0063950)
            ->where('filters.window', '7')
            ->where('filters.manufacturer', 'all')
            ->where('filters.sort', 'updated')
            ->where('manufacturerCounts.all', 1)
            ->where('manufacturerCounts.flock', 1)
            ->where('manufacturerCounts.other', 0)
            ->has('stats', 4)
            ->where('latestUpdatedAt', $osmUpdatedAt->toJSON())
        );
});

test('hotlist publishes its latest public update in crawlable metadata and the sitemap', function () {
    $this->travelTo('2026-06-24 12:00:00');

    $latestUpdatedAt = now()->subMinutes(15);

    OsmNode::query()->create([
        'osm_id' => 12379768800,
        'latitude' => 43.0063950,
        'longitude' => -88.1077715,
        'location' => new Point(43.0063950, -88.1077715),
        'tags' => [
            'operator' => 'Flock Safety',
            'surveillance:type' => 'ALPR',
        ],
        'surveillance_type' => 'ALPR',
        'osm_updated_at' => $latestUpdatedAt,
        'osm_version' => 1,
        'last_synced_at' => now(),
    ]);

    OsmNode::query()->create([
        'osm_id' => 12379768801,
        'latitude' => 43.1063950,
        'longitude' => -88.2077715,
        'location' => new Point(43.1063950, -88.2077715),
        'tags' => [
            'operator' => 'Flock Safety',
            'surveillance:type' => 'ALPR',
        ],
        'surveillance_type' => 'ALPR',
        'osm_updated_at' => now()->subMinute(),
        'osm_version' => 2,
        'last_synced_at' => now(),
    ]);

    $baseUrl = rtrim((string) config('app.url'), '/');

    $this->get('/hotlist?window=24&manufacturer=flock')
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('Hotlist')
            ->where('latestUpdatedAt', $latestUpdatedAt->toJSON())
        )
        ->assertSee('rel="canonical" href="'.$baseUrl.'/hotlist"', false)
        ->assertSee('"@type":"CollectionPage"', false)
        ->assertSee('"dateModified":"'.$latestUpdatedAt->toJSON().'"', false);

    $this->get('/sitemap.xml')
        ->assertOk()
        ->assertHeader('Content-Type', 'application/xml; charset=UTF-8')
        ->assertSee('<loc>'.$baseUrl.'/hotlist</loc>', false)
        ->assertSee('<lastmod>'.$latestUpdatedAt->toJSON().'</lastmod>', false);

    $this->get('/robots.txt')
        ->assertOk()
        ->assertHeader('Content-Type', 'text/plain; charset=UTF-8')
        ->assertSee('Sitemap: '.$baseUrl.'/sitemap.xml');
});

test('hotlist page paginates without capping node totals', function () {
    foreach (range(1, 121) as $index) {
        $latitude = 43 + ($index / 10000);
        $longitude = -88 - ($index / 10000);

        OsmNode::query()->create([
            'osm_id' => 20000000000 + $index,
            'latitude' => $latitude,
            'longitude' => $longitude,
            'location' => new Point($latitude, $longitude),
            'tags' => ['surveillance:type' => 'ALPR'],
            'surveillance_type' => 'ALPR',
            'osm_updated_at' => now()->subMinutes($index),
            'osm_version' => 1,
            'last_synced_at' => now(),
        ]);
    }

    $this->get('/hotlist')
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('Hotlist')
            ->where('nodes.total', 121)
            ->where('nodes.perPage', 25)
            ->where('nodes.currentPage', 1)
            ->where('nodes.lastPage', 5)
            ->where('nodes.from', 1)
            ->where('nodes.to', 25)
            ->has('nodes.data', 25)
        );
});

test('hotlist page supports server side filters', function () {
    OsmNode::query()->create([
        'osm_id' => 12379768752,
        'latitude' => 43.0063950,
        'longitude' => -88.1077715,
        'location' => new Point(43.0063950, -88.1077715),
        'tags' => [
            'operator' => 'Flock Safety',
            'name' => 'W Bluemound Rd',
            'addr:city' => 'Waukesha',
            'surveillance:type' => 'ALPR',
        ],
        'surveillance_type' => 'ALPR',
        'osm_updated_at' => now()->subDay(),
        'osm_version' => 1,
        'last_synced_at' => now(),
    ]);

    OsmNode::query()->create([
        'osm_id' => 12379768753,
        'latitude' => 43.1063950,
        'longitude' => -88.2077715,
        'location' => new Point(43.1063950, -88.2077715),
        'tags' => [
            'operator' => 'City Traffic',
            'name' => 'Main St',
            'addr:city' => 'Milwaukee',
            'surveillance:type' => 'camera',
        ],
        'surveillance_type' => 'camera',
        'osm_updated_at' => now()->subHours(2),
        'osm_version' => 1,
        'last_synced_at' => now(),
    ]);

    $this->get('/hotlist?manufacturer=other&query=Milwaukee&sort=city&direction=asc')
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('Hotlist')
            ->where('nodes.total', 1)
            ->has('nodes.data', 1)
            ->where('nodes.data.0.type', 'camera')
            ->where('nodes.data.0.manufacturer', 'City Traffic')
            ->where('nodes.data.0.city', 'Milwaukee')
            ->where('filters.manufacturer', 'other')
            ->where('filters.query', 'Milwaukee')
            ->where('filters.sort', 'city')
            ->where('filters.direction', 'asc')
            ->where('manufacturerCounts.all', 2)
            ->where('manufacturerCounts.flock', 1)
            ->where('manufacturerCounts.other', 1)
        );
});

test('hotlist page uses version one osm update timestamps for freshness windows', function () {
    $this->travelTo('2026-06-24 12:00:00');

    $recentOsmUpdatedAt = now()->subDay();

    $recentOsmNode = OsmNode::query()->create([
        'osm_id' => 12379768754,
        'latitude' => 43.2063950,
        'longitude' => -88.3077715,
        'location' => new Point(43.2063950, -88.3077715),
        'tags' => [
            'operator' => 'Flock Safety',
            'name' => 'Recent OSM edit',
            'surveillance:type' => 'ALPR',
        ],
        'surveillance_type' => 'ALPR',
        'osm_updated_at' => $recentOsmUpdatedAt,
        'osm_version' => 1,
        'osm_user' => 'recent-mapper',
        'last_synced_at' => now(),
    ]);

    $recentOsmNode->forceFill([
        'created_at' => now()->subMonths(6),
        'updated_at' => now()->subMonths(6),
    ])->save();

    OsmNode::query()->create([
        'osm_id' => 12379768755,
        'latitude' => 43.3063950,
        'longitude' => -88.4077715,
        'location' => new Point(43.3063950, -88.4077715),
        'tags' => [
            'operator' => 'Flock Safety',
            'name' => 'Stale OSM edit',
            'surveillance:type' => 'ALPR',
        ],
        'surveillance_type' => 'ALPR',
        'osm_updated_at' => now()->subDays(10),
        'osm_version' => 1,
        'last_synced_at' => now(),
    ]);

    OsmNode::query()->create([
        'osm_id' => 12379768756,
        'latitude' => 43.4063950,
        'longitude' => -88.5077715,
        'location' => new Point(43.4063950, -88.5077715),
        'tags' => [
            'operator' => 'Flock Safety',
            'name' => 'Recent OSM edit but not new',
            'surveillance:type' => 'ALPR',
        ],
        'surveillance_type' => 'ALPR',
        'osm_updated_at' => now()->subHours(2),
        'osm_version' => 2,
        'last_synced_at' => now(),
    ]);

    $this->get('/hotlist?window=7')
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('Hotlist')
            ->where('nodes.total', 1)
            ->where('nodes.data.0.osmId', 12379768754)
            ->where('nodes.data.0.contributor', 'recent-mapper')
            ->where('nodes.data.0.updatedAt', $recentOsmUpdatedAt->toJSON())
        );
});

test('hotlist update stat follows the selected timeframe window', function () {
    $this->travelTo('2026-06-24 12:00:00');

    foreach ([
        12379768756 => now()->subHours(2),
        12379768757 => now()->subHours(20),
        12379768758 => now()->subHours(30),
        12379768759 => now()->subDays(10),
        12379768760 => now()->subDays(40),
    ] as $osmId => $osmUpdatedAt) {
        $latitude = 43 + (($osmId - 12379768750) / 10000);
        $longitude = -88 - (($osmId - 12379768750) / 10000);

        OsmNode::query()->create([
            'osm_id' => $osmId,
            'latitude' => $latitude,
            'longitude' => $longitude,
            'location' => new Point($latitude, $longitude),
            'tags' => [
                'operator' => 'Flock Safety',
                'surveillance:type' => 'ALPR',
            ],
            'surveillance_type' => 'ALPR',
            'osm_updated_at' => $osmUpdatedAt,
            'osm_version' => 1,
            'last_synced_at' => now(),
        ]);
    }

    $this->get('/hotlist?window=24')
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('Hotlist')
            ->where('nodes.total', 2)
            ->where('stats.0.label', 'Added last 24 hours')
            ->where('stats.0.value', '2')
            ->where('stats.0.sub', '+100% vs previous 24 hours')
        );

    $this->get('/hotlist?window=30')
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('Hotlist')
            ->where('nodes.total', 4)
            ->where('stats.0.label', 'Added last 30 days')
            ->where('stats.0.value', '4')
            ->where('stats.0.sub', '+300% vs previous 30 days')
        );
});

test('hotlist indexes exist for newest first queries', function () {
    $indexes = collect(Schema::getIndexes('nodes'))->pluck('name');

    expect($indexes)
        ->toContain('nodes_hotlist_osm_updated_at_id_index')
        ->toContain('nodes_hotlist_type_osm_updated_at_id_index');
});

test('landing hero passes zip codes to the full map', function () {
    $landingPage = file_get_contents(resource_path('js/Pages/Landing.vue'));

    expect($landingPage)
        ->toContain('normalizeLandingZipCode')
        ->toContain('`/map?zip=${encodeURIComponent(normalizedZipCode)}`')
        ->toContain('@submit.prevent="openMap"')
        ->toContain('Check my area');
});

test('landing page includes the FAQ section from the design system', function () {
    $landingPage = file_get_contents(resource_path('js/Pages/Landing.vue'));

    expect($landingPage)
        ->toContain('id="faq"')
        ->toContain('Common questions')
        ->toContain('The short answers, before you ask.')
        ->toContain('faqItems')
        ->toContain('toggleFaq')
        ->toContain('Is Drivers Against Flock really free?')
        ->toContain('Where does the camera data come from?')
        ->toContain('Do you track me or store my trips?')
        ->toContain('A camera is missing or in the wrong spot');
});

test('help page is displayed at the help route', function () {
    $this->get('/help')
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('Help')
            ->where('user', null)
            ->has('canLogin')
            ->has('canRegister')
        );
});

test('help page uses the dedicated DAF support page', function () {
    $helpPage = file_get_contents(resource_path('js/Pages/Help.vue'));

    expect($helpPage)
        ->toContain('DafSiteHeader')
        ->toContain('DafSiteFooter')
        ->toContain('Help keep the creepy boxes on the map')
        ->toContain('Buy us a coffee')
        ->toContain('https://buymeacoffee.com/driversagainstflock')
        ->toContain('Any amount helps')
        ->toContain('Powered by Buy Me a Coffee')
        ->toContain('No ads, no trackers')
        ->toContain("{ label: 'Contribute', href: '/help' }");
});

test('hotlist page uses a non-interactive mapbox locator', function () {
    $hotlistPage = file_get_contents(resource_path('js/Pages/Hotlist.vue'));
    $landingPage = file_get_contents(resource_path('js/Pages/Landing.vue'));
    $mapPage = file_get_contents(resource_path('js/Pages/Map.vue'));

    expect($hotlistPage)
        ->toContain("from 'mapbox-gl'")
        ->toContain('new mapboxgl.Map')
        ->toContain('source-hotlist-nodes')
        ->toContain('visibleRows.value.map')
        ->toContain('selected: row.id === selectedNodeId.value')
        ->toContain(':href="selectedNodeMapHref"')
        ->toContain("params.set('marker', selectedNode.value.mapMarkerId)")
        ->toContain("params.set('osm_id', selectedNode.value.osmId)")
        ->toContain('mapMarkerId: `osm-node-${id}`')
        ->toContain('interactive: false')
        ->toContain('dragPan: false')
        ->toContain('scrollZoom: false')
        ->toContain('touchZoomRotate: false')
        ->toContain('keyboard: false')
        ->toContain('maxPitch: 0')
        ->toContain('instance.dragPan.disable()')
        ->toContain('instance.scrollZoom.disable()')
        ->toContain('instance.touchZoomRotate.disable()')
        ->toContain('instance.easeTo')
        ->toContain('instance.fitBounds')
        ->toContain('perPage: 25')
        ->toContain('filterChips')
        ->toContain('lengthAwarePaginationLinks')
        ->toContain('paginationLinks')
        ->toContain('label: formatNumber(pageNumber)')
        ->toContain('`Go to page ${paginationLink.label}`')
        ->toContain('maximumFractionDigits: 0')
        ->toContain('value: formatNumber(stat.value)')
        ->toContain('formatNumber(manufacturerCounts.value.all)')
        ->toContain('manufacturerFilter')
        ->toContain('setManufacturerFilter')
        ->not->toContain('Filter hotlist nodes')
        ->not->toContain('type="search"')
        ->not->toContain('searchDebounceTimer')
        ->toContain("router.get('/hotlist'")
        ->toContain('props.nodes.data')
        ->toContain('class="max-w-full overflow-hidden"')
        ->toContain('class="min-w-0 truncate"')
        ->and($landingPage)
        ->toContain("{ label: 'Hotlist', href: '/hotlist' }")
        ->toContain("{ label: 'Contribute', href: '/help' }")
        ->and($mapPage)
        ->toContain("{ label: 'Hotlist', href: '/hotlist' }")
        ->toContain("{ label: 'Contribute', href: '/help' }");
});

test('map page uses the V3 full screen map surface', function () {
    $mapPage = file_get_contents(resource_path('js/Pages/Map.vue'));

    expect($mapPage)
        ->toContain("from 'mapbox-gl'")
        ->toContain("axios.post('/api/v1/directions'")
        ->toContain('DafSiteHeader')
        ->toContain('DafSegmentedControl')
        ->toContain('DafRouteCard')
        ->toContain('daf-marker-cones-fill')
        ->toContain(':show-directions="false"')
        ->toContain('show-voice')
        ->toContain('directionWaypointRows')
        ->toContain('dragOverDirectionWaypoint')
        ->toContain('activateDirectionWaypointSearch')
        ->toContain('activeDirectionWaypointId')
        ->toContain('waypointCoordinates.map')
        ->toContain('avoid_buffer: avoidBufferMeters.value')
        ->toContain('allow_alpr_near_start_destination')
        ->toContain('allowAlprNearStartDestination')
        ->toContain('DEFAULT_AVOID_BUFFER_METERS = 50')
        ->toContain('DafSwitch')
        ->toContain('size="xs"')
        ->toContain('Advanced Settings')
        ->toContain('Avoid cameras by')
        ->toContain('Allow ALPR near Start & Destination')
        ->toContain('routeFitPadding')
        ->toContain('Choose destination')
        ->toContain('Add stop')
        ->toContain("activeMode === 'directions'")
        ->toContain('ADDRESS_PLACE_TYPES')
        ->toContain('PLACE_ICON_TYPES')
        ->toContain('getPlaceDistance')
        ->toContain('result.meta')
        ->toContain('bg-daf-surface-card')
        ->toContain("setConfigProperty('basemap', 'lightPreset'")
        ->toContain('cooperativeGestures: false')
        ->toContain('h-screen min-h-screen')
        ->toContain('bottom-4 left-1/2 z-20 w-[calc(100%_-_1.5rem)] max-w-sm -translate-x-1/2')
        ->toContain('sm:right-5 sm:ml-0 sm:w-[25rem]')
        ->toContain('nodeTotalsCardIsVisible')
        ->toContain('visibleMarkerCountLabel')
        ->toContain('DafNodeStatusBadge')
        ->toContain('markerRequestsInFlight')
        ->toContain('markersAreLoading')
        ->toContain(':loading="markersAreLoading"')
        ->not->toContain('<DafNodeStatusBadge count-label="0" loading />')
        ->toContain('selectedDetailItemIsVisible')
        ->toContain('selectedPlace')
        ->toContain('selectedPlaceIsAddress')
        ->toContain('selectedPlaceBusinessFields')
        ->toContain('selectedPlaceResidentialFields')
        ->toContain('selectedPlaceRatingValueLabel')
        ->toContain('selectedPlaceRatingCountLabel')
        ->toContain('selectedPlaceCategoryPriceLabel')
        ->toContain('selectedPlaceNearbyNodeCount')
        ->toContain('selectedPlaceNearbyNodeCountLabel')
        ->toContain('NEARBY_NODE_RADIUS_FEET = 1500')
        ->toContain("NEARBY_NODE_RADIUS_LABEL = '1,500 ft'")
        ->toContain('selectedPlaceGoogleMapsUrl')
        ->toContain('Residential')
        ->toContain('Plus code')
        ->toContain('Open in Google Maps')
        ->not->toContain('Save')
        ->toContain('startDirectionsToSelectedPlace')
        ->toContain('loadSelectedPlaceDetails')
        ->toContain('/api/place/${encodeURIComponent(placeId)}')
        ->toContain('ALPR camera')
        ->toContain('selectedMarkerCoordinateLabel')
        ->toContain('selectedMarkerFields')
        ->toContain('selectedMarkerManufacturer')
        ->toContain('selectedMarkerDirection')
        ->toContain('Open on OpenStreetMap')
        ->toContain('const bounds = visibleMapBounds();')
        ->toContain('bounds.extend(instance.unproject([0, 0]));')
        ->toContain('retainPadding: false')
        ->toContain("'circle-stroke-color': colors.nodeMonitored")
        ->toContain("cssVar('--node-monitored'")
        ->toContain('initialMarkersLoaded')
        ->toContain('mapSplashIsVisible')
        ->toContain('MARKER_SPLASH_SETTLE_DELAY_MS = 800')
        ->toContain('completeInitialMarkerLoad')
        ->toContain('Loading camera markers')
        ->toContain('<Transition name="map-splash">')
        ->toContain('.map-splash-leave-active')
        ->toContain('initialZipCodeFromUrl')
        ->toContain('localityBoundaryMessage')
        ->toContain('localityBoundaryActiveZipCode')
        ->toContain('floatingMapMessage')
        ->toContain('clearLocalityBoundary')
        ->toContain('clearZipCodeFromUrl')
        ->toContain('initialSelectedMarkerFromUrl')
        ->toContain('pendingSelectedMarkerId')
        ->toContain('reconcilePendingSelectedMarker')
        ->toContain('markerFeatureMatchesPendingSelection')
        ->toContain('initialSelectedMarker ? 13.4 : 3.4')
        ->toContain('zipCodeSearchSuggestion')
        ->toContain('selectZipCodeSearchSuggestion')
        ->toContain('fiveDigitZipCode')
        ->toContain('Show locality for ${zipCode}')
        ->toContain('Highlight the city boundary')
        ->toContain("axios.get('/api/locality-boundary'")
        ->toContain('source-locality-boundary')
        ->toContain('daf-locality-boundary-fill')
        ->toContain('daf-locality-boundary-outline')
        ->toContain('LOCALITY_BOUNDARY_FIT_BUFFER_RATIO = 0.2')
        ->toContain('expandBounds(bounds, LOCALITY_BOUNDARY_FIT_BUFFER_RATIO)')
        ->toContain('centeredOnCurrentPosition.value = true')
        ->not->toContain('Edit this node')
        ->not->toContain('Edit node')
        ->not->toContain('leading-icon="trash-2"')
        ->not->toContain("import Navigation from '@/Layouts/Navigation.vue'")
        ->not->toContain("import Map from '../Components/Map.vue'")
        ->not->toContain("axios.post('directions'")
        ->not->toContain(':show-theme-toggle');
});

test('map nodes in view badge is grouped with the mode toggle', function () {
    $mapPage = file_get_contents(resource_path('js/Pages/Map.vue'));

    $segmentedControlPosition = strpos($mapPage, '<DafSegmentedControl');
    $nodeBadgePosition = strpos(
        $mapPage,
        '<DafNodeStatusBadge',
        $segmentedControlPosition,
    );
    $searchPanelPosition = strpos($mapPage, '<DafSearchBar');
    $detailPanelStackPosition = strpos($mapPage, ':class="detailPanelStackClasses"');

    expect($segmentedControlPosition)->not->toBeFalse()
        ->and($nodeBadgePosition)->not->toBeFalse()
        ->and($searchPanelPosition)->not->toBeFalse()
        ->and($detailPanelStackPosition)->not->toBeFalse()
        ->and($nodeBadgePosition)
        ->toBeGreaterThan($segmentedControlPosition)
        ->toBeLessThan($searchPanelPosition)
        ->toBeLessThan($detailPanelStackPosition)
        ->and($mapPage)
        ->toContain('v-if="nodeTotalsCardIsVisible"')
        ->toContain(':count-label="visibleMarkerCountLabel"')
        ->toContain(':loading="markersAreLoading"')
        ->toContain('() => initialMarkersLoaded.value && !mapStatus.value');
});

test('map node status badge handles loading and live pulses', function () {
    $badge = file_get_contents(resource_path('js/Components/Daf/Map/DafNodeStatusBadge.vue'));

    expect($badge)
        ->toContain('nodes in view')
        ->toContain('animate-spin')
        ->toContain('node-status-dot-ring')
        ->toContain('node-status-dot')
        ->toContain('@keyframes node-status-ring-pulse')
        ->toContain('@keyframes node-status-dot-pulse')
        ->toContain('animation: node-status-dot-pulse')
        ->toContain('Loading ${props.label}')
        ->toContain('prefers-reduced-motion: reduce')
        ->not->toContain('loadingLabel')
        ->not->toContain('loadingDescription');
});

test('place details include fields needed by the map detail cards', function () {
    $placeController = file_get_contents(app_path('Http/Controllers/Api/PlaceController.php'));

    expect($placeController)
        ->toContain("'addressComponents'")
        ->toContain("'plusCode'")
        ->toContain("'regularOpeningHours'")
        ->toContain("'currentOpeningHours'")
        ->toContain("'nationalPhoneNumber'")
        ->toContain("'googleMapsUri'")
        ->toContain("'websiteUri'");
});

test('directions source defaults use a 50 meter avoid buffer', function () {
    expect(file_get_contents(config_path('directions.php')))
        ->toContain("env('DIRECTIONS_AVOID_BUFFER_METERS', 50)")
        ->and(file_get_contents(base_path('.env.example')))
        ->toContain('DIRECTIONS_AVOID_BUFFER_METERS=50');
});

test('map route choices and marker details can be visible together', function () {
    $mapPage = file_get_contents(resource_path('js/Pages/Map.vue'));

    expect($mapPage)
        ->toContain('routeSelectionCardIsVisible')
        ->toContain('selectedDetailItemIsVisible')
        ->toContain('v-if="routeSelectionCardIsVisible"')
        ->toContain('v-if="selectedDetailItemIsVisible"')
        ->not->toContain('v-else-if="selectedMarker"');
});

test('expo route choices suppress place detail overlay controls', function () {
    $mapScreen = file_get_contents(base_path('expo/components/map-screen.js'));
    $placeDetailsMode = Str::between(
        $mapScreen,
        'const placeDetailsModeIsActive = Boolean(',
        '  );',
    );

    expect($mapScreen)
        ->toContain('const directionsModeIsActive =')
        ->toContain('directionsFormIsActive || routeComparisonIsActive')
        ->and($placeDetailsMode)
        ->toContain('!directionsModeIsActive')
        ->toContain('searchController.selectedSearchResult');
});

test('map search results open detail cards before loading directions', function () {
    $mapPage = file_get_contents(resource_path('js/Pages/Map.vue'));
    $selectSearchResult = Str::between(
        $mapPage,
        'async function selectSearchResult(result) {',
        'function setSelectedPlace(place, coordinate) {',
    );
    $mapModeSearchSelection = Str::after(
        $selectSearchResult,
        'searchQuery.value = getPlaceDisplayName(result);',
    );
    $directionsCta = Str::between(
        $mapPage,
        'async function startDirectionsToSelectedPlace() {',
        'async function selectZipCodeSearchSuggestion(zipCode) {',
    );

    expect($mapModeSearchSelection)
        ->toContain('setSelectedPlace(result, coordinate);')
        ->toContain('clearLoadedDirectionsRoute();')
        ->not->toContain("activeMode.value = 'directions';")
        ->not->toContain('await maybeLoadDirectionsRoute();')
        ->and($directionsCta)
        ->toContain("activeMode.value = 'directions';")
        ->toContain('setDirectionWaypointResult(')
        ->toContain('await maybeLoadDirectionsRoute();')
        ->and($mapPage)
        ->toContain('@click="startDirectionsToSelectedPlace"');
});

test('map runtime layers keep app colors in night mode', function () {
    $mapPage = file_get_contents(resource_path('js/Pages/Map.vue'));

    expect($mapPage)
        ->toContain('MAP_LAYER_EMISSIVE_STRENGTH = 1')
        ->toContain("'fill-emissive-strength': MAP_LAYER_EMISSIVE_STRENGTH")
        ->toContain("'line-emissive-strength': MAP_LAYER_EMISSIVE_STRENGTH")
        ->toContain("'circle-emissive-strength': MAP_LAYER_EMISSIVE_STRENGTH")
        ->toContain("'text-emissive-strength': MAP_LAYER_EMISSIVE_STRENGTH")
        ->and(substr_count($mapPage, "'line-emissive-strength': MAP_LAYER_EMISSIVE_STRENGTH"))
        ->toBeGreaterThanOrEqual(3)
        ->and(substr_count($mapPage, "'circle-emissive-strength': MAP_LAYER_EMISSIVE_STRENGTH"))
        ->toBeGreaterThanOrEqual(8);
});

test('map route and marker cards collapse behind edge handles', function () {
    $mapPage = file_get_contents(resource_path('js/Pages/Map.vue'));

    expect($mapPage)
        ->toContain('routePanelIsCollapsed')
        ->toContain('markerPanelIsCollapsed')
        ->toContain('routePanelClasses')
        ->toContain('markerPanelClasses')
        ->toContain('routePanelToggleLabel')
        ->toContain('markerPanelToggleLabel')
        ->toContain('aria-controls="route-selection-card"')
        ->toContain('aria-controls="marker-details-card"')
        ->toContain('class="relative z-20"')
        ->toContain('class="absolute right-[-22px] top-1/2 z-10')
        ->toContain('class="absolute left-[-22px] top-1/2 z-10')
        ->toContain('toggleRoutePanel')
        ->toContain('toggleMarkerPanel')
        ->toContain('routePanelIsCollapsed ? \'rotate-180\' : \'\'')
        ->toContain('markerPanelIsCollapsed ? \'rotate-180\' : \'\'')
        ->not->toContain('class="daf-pressable absolute right-[-22px]')
        ->not->toContain('class="daf-pressable absolute left-[-22px]');
});

test('dashboard redirects to the map route', function () {
    $this->get('/dashboard')
        ->assertRedirect('/map');
});
