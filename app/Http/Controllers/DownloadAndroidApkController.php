<?php

namespace App\Http\Controllers;

use Illuminate\Http\RedirectResponse;

class DownloadAndroidApkController extends Controller
{
    private const APK_DOWNLOAD_URL = 'https://drive.proton.me/urls/JN8MTAH4FM#5BvW7rnB6krr';

    public function __invoke(): RedirectResponse
    {
        return redirect()->away(self::APK_DOWNLOAD_URL);
    }
}
