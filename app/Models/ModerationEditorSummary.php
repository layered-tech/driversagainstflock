<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class ModerationEditorSummary extends Model
{
    protected $guarded = [];

    public function areas(): BelongsToMany
    {
        return $this->belongsToMany(WatchedArea::class, 'moderation_editor_areas')->withTimestamps();
    }

    protected function casts(): array
    {
        return [
            'first_active' => 'immutable_datetime',
            'last_active' => 'immutable_datetime',
            'tracked_changesets' => 'integer',
            'added' => 'integer',
            'modified' => 'integer',
            'deleted' => 'integer',
            'flagged_changesets' => 'integer',
            'reviewed_changesets' => 'integer',
            'flags_count' => 'integer',
            'survival_percent' => 'float',
            'survival_reverted' => 'integer',
            'areas_count' => 'integer',
            'calculated_at' => 'immutable_datetime',
            'dirty_at' => 'immutable_datetime',
            'rebuild_run' => 'integer',
        ];
    }
}
