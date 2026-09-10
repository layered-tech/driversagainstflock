<?php

use App\Http\Controllers\Api\DirectionsController;
use App\Http\Controllers\Api\MarkersController;
use App\Http\Controllers\Api\SearchController;
use App\Http\Controllers\DownloadAndroidApkController;
use App\Http\Controllers\HotlistController;
use App\Http\Controllers\ModerationController;
use App\Http\Controllers\ModerationReviewController;
use App\Http\Controllers\ModerationRuleController;
use App\Http\Controllers\ProfileController;
use App\Http\Controllers\WatchedAreaController;
use App\Http\Middleware\EnsureOsmModerator;
use App\Support\SearchMetadata;
use Illuminate\Routing\Router;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

Route::get('/sitemap.xml', function (SearchMetadata $searchMetadata) {
    return response()->view('sitemap', [
        'urls' => $searchMetadata->sitemapEntries(),
    ], 200, [
        'Content-Type' => 'application/xml; charset=UTF-8',
    ]);
})->name('sitemap');

Route::get('/robots.txt', function (SearchMetadata $searchMetadata) {
    return response("User-agent: *\nAllow: /\n\nSitemap: {$searchMetadata->sitemapUrl()}\n", 200, [
        'Content-Type' => 'text/plain; charset=UTF-8',
    ]);
})->name('robots');

Route::get('/', function () {
    return Inertia::render('Landing', [
        'user' => auth()->user(),
        'canLogin' => Route::has('login'),
        'canRegister' => Route::has('register'),
    ]);
})->name('home');

Route::get('/map', function () {
    return Inertia::render('Map', array_merge([
        'user' => auth()->user(),
        'canLogin' => Route::has('login'),
        'canRegister' => Route::has('register'),
    ], ['points' => []]));
})->name('map');

Route::get('/hotlist', HotlistController::class)->name('hotlist');

Route::get('/downloads/android-apk', DownloadAndroidApkController::class)->name('android.apk.download');

Route::get('/help', function () {
    return Inertia::render('Help', [
        'user' => auth()->user(),
        'canLogin' => Route::has('login'),
        'canRegister' => Route::has('register'),
    ]);
})->name('help');

Route::redirect('/dashboard', '/map')->name('dashboard');

Route::get('/privacy-policy', function () {
    return Inertia::render('Privacy', [
        'user' => auth()->user(),
        'canLogin' => Route::has('login'),
        'canRegister' => Route::has('register'),
    ]);
})->name('privacy');

Route::get('/terms-of-use', function () {
    return Inertia::render('Terms', [
        'user' => auth()->user(),
        'canLogin' => Route::has('login'),
        'canRegister' => Route::has('register'),
    ]);
})->name('terms');

Route::group(['middleware' => ['throttle:directions']], function (Router $route) {
    Route::post('search', SearchController::class);
    Route::post('directions', DirectionsController::class);
});

Route::get('markers', MarkersController::class);

Route::middleware('auth')->group(function () {
    Route::get('/profile', [ProfileController::class, 'edit'])->name('profile.edit');
    Route::patch('/profile', [ProfileController::class, 'update'])->name('profile.update');
    Route::delete('/profile', [ProfileController::class, 'destroy'])->name('profile.destroy');
});

require __DIR__.'/auth.php';

Route::middleware(['auth', EnsureOsmModerator::class])->prefix('moderation')->name('moderation.')->group(function (): void {
    Route::get('/', [ModerationController::class, 'index'])->name('index');
    Route::get('/nodes', [ModerationController::class, 'nodes'])->name('nodes.index');
    Route::get('/changesets', [ModerationController::class, 'changesets'])->name('changesets.index');
    Route::get('/flagged', [ModerationController::class, 'flagged'])->name('flagged.index');
    Route::get('/editors', [ModerationController::class, 'editors'])->name('editors.index');
    Route::get('/areas', [ModerationController::class, 'areas'])->name('areas.index');
    Route::get('/audit', [ModerationController::class, 'audit'])->name('audit.index');
    Route::get('/editors/{uid}', [ModerationController::class, 'profile'])->where('uid', '[1-9][0-9]*')->name('editors.show');
    Route::get('/rules', [ModerationRuleController::class, 'index'])->name('rules.index');
    Route::get('/rules/create', [ModerationRuleController::class, 'create'])->name('rules.create');
    Route::post('/rules/preview', [ModerationRuleController::class, 'preview'])->middleware('throttle:10,1')->name('rules.preview');
    Route::post('/rules', [ModerationRuleController::class, 'store'])->name('rules.store');
    Route::get('/rules/{rule}/edit', [ModerationRuleController::class, 'edit'])->name('rules.edit');
    Route::put('/rules/{rule}', [ModerationRuleController::class, 'update'])->name('rules.update');
    Route::patch('/flags/{flag}/dismiss', [ModerationRuleController::class, 'dismiss'])->name('flags.dismiss');

    Route::get('/changesets/{changeset}', [ModerationController::class, 'changeset'])->whereNumber('changeset')->name('changesets.show');
    Route::get('/nodes/{node}', [ModerationController::class, 'node'])->whereNumber('node')->name('nodes.show');
    Route::patch('/changesets/{changeset}/review', [ModerationReviewController::class, 'changeset'])->whereNumber('changeset')->name('changesets.review');
    Route::patch('/nodes/{node}/review', [ModerationReviewController::class, 'node'])->whereNumber('node')->name('nodes.review');
    Route::get('/areas/search', [WatchedAreaController::class, 'search'])->middleware('throttle:30,1')->name('areas.search');
    Route::post('/areas', [WatchedAreaController::class, 'store'])->name('areas.store');
    Route::get('/areas/{area}', [ModerationController::class, 'area'])->name('areas.show');
    Route::delete('/areas/{area}', [WatchedAreaController::class, 'destroy'])->name('areas.destroy');
    Route::post('/areas/{area}/subscription', [WatchedAreaController::class, 'subscribe'])->name('areas.subscribe');
    Route::delete('/areas/{area}/subscription', [WatchedAreaController::class, 'unsubscribe'])->name('areas.unsubscribe');
});
