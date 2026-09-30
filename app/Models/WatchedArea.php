<?php

namespace App\Models;

use App\Jobs\ReconcileAlprPresenceReports;
use App\Services\OpenStreetMap\ModerationEditorSummaries;
use App\Services\OpenStreetMap\ModerationSummaryCache;
use Database\Factories\WatchedAreaFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Support\Facades\DB;

class WatchedArea extends Model
{
    /** @use HasFactory<WatchedAreaFactory> */
    use HasFactory;

    protected $guarded = [];

    protected static function booted(): void
    {
        static::saved(function (WatchedArea $area): void {
            DB::afterCommit(function () use ($area): void {
                ReconcileAlprPresenceReports::dispatch();
                static::whereKey($area)->update(['summary_dirty_at' => now()]);
                app(ModerationSummaryCache::class)->invalidate();
            });
        });
        static::deleting(function (WatchedArea $area): void {
            $summaryIds = DB::table('moderation_editor_areas')->where('watched_area_id', $area->id)
                ->pluck('moderation_editor_summary_id');
            DB::afterCommit(function () use ($summaryIds): void {
                app(ModerationEditorSummaries::class)->recountAreas($summaryIds);
                app(ModerationSummaryCache::class)->invalidate();
            });
        });
    }

    public function watchers(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'watched_area_user');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    protected function casts(): array
    {
        return [
            'geometry' => 'array',
            'bounds' => 'array',
            'summary_dirty_at' => 'immutable_datetime',
            'summary_refreshed_at' => 'immutable_datetime',
        ];
    }
}
