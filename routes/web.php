<?php

use App\Http\Controllers\Api\DirectionsController;
use App\Http\Controllers\Api\MarkersController;
use App\Http\Controllers\Api\SearchController;
use App\Http\Controllers\DownloadAndroidApkController;
use App\Http\Controllers\HotlistController;
use App\Http\Controllers\ProfileController;
use Illuminate\Routing\Router;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

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
});

Route::get('/terms-of-use', function () {
    return Inertia::render('Terms', [
        'user' => auth()->user(),
        'canLogin' => Route::has('login'),
        'canRegister' => Route::has('register'),
    ]);
});

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
