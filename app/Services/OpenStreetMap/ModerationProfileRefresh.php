<?php

namespace App\Services\OpenStreetMap;

use App\Models\OsmEditorProfile;
use Illuminate\Support\Facades\Http;
use RuntimeException;
use Throwable;

class ModerationProfileRefresh
{
    public function refresh(int $uid): void
    {
        $currentName = OsmEditorProfile::where('osm_uid', $uid)->value('display_name');
        try {
            $response = Http::acceptJson()->withUserAgent('DriversAgainstFlock moderation')->connectTimeout(3)->timeout(15)
                ->get(rtrim(config('moderation.profiles.api_url'), '/').'/user/'.$uid.'.json');
            if ($response->notFound() || $response->status() === 410) {
                OsmEditorProfile::updateOrCreate(['osm_uid' => $uid], ['fetched_at' => now(), 'last_error' => 'This OSM profile is no longer available.']);

                return;
            }
            $profile = $response->throw()->json('user');
            if (! is_array($profile) || (int) ($profile['id'] ?? 0) !== $uid || ! is_string($profile['display_name'] ?? null)) {
                throw new RuntimeException('OSM returned an invalid user profile.');
            }
            $avatar = $profile['img']['href'] ?? null;
            OsmEditorProfile::updateOrCreate(['osm_uid' => $uid], [
                'display_name' => $profile['display_name'], 'account_created_at' => $profile['account_created'] ?? null,
                'avatar_url' => is_string($avatar) && str_starts_with($avatar, 'https://') ? $avatar : null,
                'changesets_count' => $profile['changesets']['count'] ?? null, 'fetched_at' => now(), 'last_error' => null,
            ]);
            if ($currentName !== $profile['display_name']) {
                app(ModerationEditorSummaries::class)->markEditorsDirty([$uid]);
            }
        } catch (Throwable $exception) {
            OsmEditorProfile::updateOrCreate(['osm_uid' => $uid], ['last_error' => 'OSM profile refresh failed.']);
            throw $exception;
        }
    }
}
