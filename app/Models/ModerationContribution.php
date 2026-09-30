<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ModerationContribution extends Model
{
    protected $guarded = [];

    public function outcomes(): HasMany
    {
        return $this->hasMany(ModerationOutcome::class, 'contribution_id');
    }

    protected function casts(): array
    {
        return ['tags_set' => 'array', 'locations' => 'array', 'edited_at' => 'immutable_datetime', 'visible' => 'boolean', 'history_complete' => 'boolean'];
    }
}
