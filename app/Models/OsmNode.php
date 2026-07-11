<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use MatanYadaev\EloquentSpatial\Objects\Point;
use MatanYadaev\EloquentSpatial\Traits\HasSpatial;

class OsmNode extends Model
{
    use HasFactory, HasSpatial;

    protected $table = 'nodes';

    /**
     * The attributes that are mass assignable.
     *
     * @var array<int, string>
     */
    protected $fillable = [
        'osm_id',
        'latitude',
        'longitude',
        'location',
        'tags',
        'surveillance_type',
        'direction',
        'camera_direction',
        'osm_updated_at',
        'osm_version',
        'osm_changeset_id',
        'osm_user',
        'osm_uid',
        'sync_import_id',
        'last_synced_at',
    ];

    /**
     * The attributes that should be cast.
     *
     * @var array<string, string>
     */
    protected $casts = [
        'location' => Point::class,
        'tags' => 'array',
        'osm_updated_at' => 'datetime',
        'osm_version' => 'integer',
        'osm_changeset_id' => 'integer',
        'osm_uid' => 'integer',
        'last_synced_at' => 'datetime',
    ];

    /**
     * @param  Builder<self>  $query
     * @param  array{west: float|int|string, south: float|int|string, east: float|int|string, north: float|int|string}  $bounds
     * @return Builder<self>
     */
    public function scopeWithinBounds(Builder $query, array $bounds): Builder
    {
        return $query->where(function (Builder $query) use ($bounds) {
            foreach ($this->boundsEnvelopes($bounds) as $envelope) {
                $query->orWhere(function (Builder $query) use ($envelope) {
                    $query
                        ->whereBetween('longitude', [$envelope['west'], $envelope['east']])
                        ->whereBetween('latitude', [$envelope['south'], $envelope['north']]);
                });
            }
        });
    }

    /**
     * @param  Builder<self>  $query
     * @param  array<int, array<string, mixed>>  $profiles
     * @return Builder<self>
     */
    public function scopeMatchingProfiles(Builder $query, array $profiles): Builder
    {
        if ($profiles === []) {
            return $query;
        }

        $profileTags = $this->profileTags($profiles);

        if ($profileTags === []) {
            return $query->whereRaw('false');
        }

        return $query->where(function (Builder $query) use ($profileTags) {
            foreach ($profileTags as $tags) {
                $query->orWhere(function (Builder $query) use ($tags) {
                    $query->whereRaw('tags @> ?::jsonb', [
                        json_encode($tags, JSON_THROW_ON_ERROR),
                    ]);

                    if (array_key_exists('surveillance:type', $tags)) {
                        $query->orWhere(function (Builder $query) use ($tags) {
                            $query->where('surveillance_type', $tags['surveillance:type']);

                            foreach (array_diff_key($tags, ['surveillance:type' => true]) as $key => $value) {
                                $query->whereRaw('tags @> ?::jsonb', [
                                    json_encode([$key => $value], JSON_THROW_ON_ERROR),
                                ]);
                            }
                        });
                    }
                });
            }
        });
    }

    /**
     * @param  Builder<self>  $query
     * @param  array<int, array<int, float>>  $coordinates
     * @return Builder<self>
     */
    public function scopeNearRoute(Builder $query, array $coordinates, float $bufferMeters): Builder
    {
        $lineString = $this->lineStringFromCoordinates($coordinates);

        if ($lineString === null) {
            return $query->whereRaw('false');
        }

        $degreePadding = $this->degreePaddingForRoute($coordinates, $bufferMeters);
        $bounds = $this->routeBounds($coordinates, $degreePadding);

        return $query
            ->when($bounds !== null, fn (Builder $query) => $query->withinBounds($bounds))
            ->whereRaw(
                'ST_DWithin(ST_SetSRID(ST_MakePoint(longitude::double precision, latitude::double precision), 4326)::geography, ST_SetSRID(ST_GeomFromText(?), 4326)::geography, ?)',
                [$lineString, $bufferMeters],
            );
    }

    /**
     * @param  array{west: float|int|string, south: float|int|string, east: float|int|string, north: float|int|string}  $bounds
     * @return array<int, array{west: float, south: float, east: float, north: float}>
     */
    private function boundsEnvelopes(array $bounds): array
    {
        $west = (float) $bounds['west'];
        $south = (float) $bounds['south'];
        $east = (float) $bounds['east'];
        $north = (float) $bounds['north'];

        if ($west <= $east) {
            return [[
                'west' => $west,
                'south' => $south,
                'east' => $east,
                'north' => $north,
            ]];
        }

        return [
            [
                'west' => $west,
                'south' => $south,
                'east' => 180.0,
                'north' => $north,
            ],
            [
                'west' => -180.0,
                'south' => $south,
                'east' => $east,
                'north' => $north,
            ],
        ];
    }

    /**
     * @param  array<int, array<string, mixed>>  $profiles
     * @return array<int, array<string, string>>
     */
    private function profileTags(array $profiles): array
    {
        $profileTags = [];

        foreach ($profiles as $profile) {
            $tags = $profile['tags'] ?? [];

            if (! is_array($tags) || $tags === []) {
                continue;
            }

            $profileTags[] = array_map(
                fn (mixed $value): string => (string) $value,
                $tags,
            );
        }

        return $profileTags;
    }

    /**
     * @param  array<int, array<int, float>>  $coordinates
     */
    private function lineStringFromCoordinates(array $coordinates): ?string
    {
        $points = [];

        foreach ($coordinates as $coordinate) {
            if (! is_array($coordinate) || count($coordinate) < 2) {
                continue;
            }

            $longitude = $coordinate[0] ?? null;
            $latitude = $coordinate[1] ?? null;

            if (! is_numeric($longitude) || ! is_numeric($latitude)) {
                continue;
            }

            $points[] = sprintf('%F %F', (float) $longitude, (float) $latitude);
        }

        if (count($points) < 2) {
            return null;
        }

        return 'LINESTRING('.implode(',', $points).')';
    }

    /**
     * @param  array<int, array<int, float>>  $coordinates
     */
    private function degreePaddingForRoute(array $coordinates, float $bufferMeters): float
    {
        $maxAbsLatitude = 0.0;

        foreach ($coordinates as $coordinate) {
            if (! is_array($coordinate) || ! is_numeric($coordinate[1] ?? null)) {
                continue;
            }

            $maxAbsLatitude = max($maxAbsLatitude, min(89.999, abs((float) $coordinate[1])));
        }

        $latitudePadding = $bufferMeters / 111_320;
        $longitudePadding = $bufferMeters / max(1, 111_320 * cos(deg2rad($maxAbsLatitude)));

        return max($latitudePadding, $longitudePadding, 0.000001);
    }

    /**
     * @param  array<int, array<int, float>>  $coordinates
     * @return array{west: float, south: float, east: float, north: float}|null
     */
    private function routeBounds(array $coordinates, float $paddingDegrees): ?array
    {
        $longitudes = [];
        $latitudes = [];

        foreach ($coordinates as $coordinate) {
            if (! is_array($coordinate) || ! is_numeric($coordinate[0] ?? null) || ! is_numeric($coordinate[1] ?? null)) {
                continue;
            }

            $longitudes[] = (float) $coordinate[0];
            $latitudes[] = (float) $coordinate[1];
        }

        if ($longitudes === [] || $latitudes === []) {
            return null;
        }

        return [
            'west' => max(-180, min($longitudes) - $paddingDegrees),
            'south' => max(-90, min($latitudes) - $paddingDegrees),
            'east' => min(180, max($longitudes) + $paddingDegrees),
            'north' => min(90, max($latitudes) + $paddingDegrees),
        ];
    }
}
