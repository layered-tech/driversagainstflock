<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ModerationFlag extends Model
{
    protected $guarded = [];

    public function rule(): BelongsTo
    {
        return $this->belongsTo(ModerationRule::class, 'rule_id');
    }

    public function scopeActive(Builder $query): void
    {
        $query->where('status', 'open')->whereHas('rule', fn ($rule) => $rule->where('enabled', true));
    }

    protected function casts(): array
    {
        return ['evidence' => 'array', 'stale' => 'boolean', 'evaluated_at' => 'immutable_datetime', 'dismissed_at' => 'immutable_datetime'];
    }
}
