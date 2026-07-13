<?php

namespace App\Http\Controllers;

use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

class DownloadAndroidApkController extends Controller
{
    private const APK_PATH = 'android.apk';

    public function __invoke(): StreamedResponse
    {
        return Storage::disk('s3')->download(self::APK_PATH);
    }
}
