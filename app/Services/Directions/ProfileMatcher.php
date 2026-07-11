<?php

namespace App\Services\Directions;

class ProfileMatcher
{
    /**
     * @param  array<string, mixed>|null  $tags
     * @param  array<int, array<string, mixed>>  $profiles
     */
    public function tagsMatch(?array $tags, array $profiles): bool
    {
        if ($profiles === []) {
            return true;
        }

        if (! $tags) {
            return false;
        }

        foreach ($profiles as $profile) {
            $profileTags = $profile['tags'] ?? [];

            if ($profileTags !== [] && $this->profileTagsMatch($tags, $profileTags)) {
                return true;
            }
        }

        return false;
    }

    /**
     * @param  array<int, array<string, mixed>>  $profiles
     */
    public function markerTypeMatches(?string $markerType, array $profiles): bool
    {
        if ($profiles === []) {
            return true;
        }

        if (! in_array($markerType, $this->alprMarkerTypes(), true)) {
            return false;
        }

        foreach ($profiles as $profile) {
            if ($this->markerTypeMatchesProfile($profile['tags'] ?? [])) {
                return true;
            }
        }

        return false;
    }

    /**
     * @param  array<string, mixed>  $tags
     * @param  array<string, mixed>  $profileTags
     */
    private function profileTagsMatch(array $tags, array $profileTags): bool
    {
        foreach ($profileTags as $key => $expected) {
            if (! array_key_exists($key, $tags) || (string) $tags[$key] !== (string) $expected) {
                return false;
            }
        }

        return true;
    }

    /**
     * @param  array<string, mixed>  $profileTags
     */
    private function markerTypeMatchesProfile(array $profileTags): bool
    {
        foreach ($profileTags as $key => $value) {
            $value = strtolower((string) $value);

            $matches = match ($key) {
                'surveillance:type' => $value === 'alpr',
                'manufacturer', 'brand' => str_contains($value, 'flock'),
                'manufacturer:wikidata', 'brand:wikidata' => $value === 'q108485435',
                'man_made' => $value === 'surveillance',
                'surveillance' => in_array($value, ['public', 'traffic', 'camera'], true),
                'surveillance:zone' => in_array($value, ['traffic', 'public'], true),
                'camera:type' => $value === 'fixed',
                default => false,
            };

            if (! $matches) {
                return false;
            }
        }

        return $profileTags !== [];
    }

    /**
     * @return array<int, string>
     */
    private function alprMarkerTypes(): array
    {
        return ['falcon-sr', 'falcon-lr', 'condor', 'raven', 'flock-trailer'];
    }
}
