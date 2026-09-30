<?php

namespace App\Models;

use App\Services\OpenStreetMap\AlprPresenceReports;
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
        $covered = app(AlprPresenceReports::class)->coveredFlagNodeIds();
        $query->where('status', 'open')->where(function (Builder $query) use ($covered): void {
            $query->where(fn (Builder $rule) => $rule->where('source', 'rule')->whereHas('rule', fn ($rule) => $rule->where('enabled', true)))
                ->orWhere(fn (Builder $reports) => $reports->where('source', 'alpr_presence')->whereIntegerInRaw('node_id', $covered));
        });
    }

    /** @param array<string, mixed> $filters */
    public function scopeForListing(Builder $query, array $filters): void
    {
        $source = $filters['flag_source'] ?? 'all';
        if ($source === 'alpr_presence') {
            $query->where('source', 'alpr_presence');
            if (($filters['report_state'] ?? 'open') !== 'all') {
                $query->where('status', $filters['report_state'] ?? 'open');
            }
            $query->whereIntegerInRaw('node_id', app(AlprPresenceReports::class)->coveredFlagNodeIds());
        } else {
            $query->active()->when($source === 'rule', fn (Builder $query) => $query->where('source', 'rule'));
        }
        $query->when($filters['rules'] ?? [], fn (Builder $query, array $rules) => $query->whereIn('rule_id', $rules))
            ->when($filters['severities'] ?? [], fn (Builder $query, array $severities) => $query->whereHas('rule', fn ($rule) => $rule->whereIn('severity', $severities)));
        if (! empty($filters['report_window'])) {
            $since = match ($filters['report_window']) {
                '24h' => now()->subDay(), '7d' => now()->subDays(7), default => now()->subDays(30),
            };
            $query->where('source', 'alpr_presence')->whereRaw("(evidence->>'latest_received_at')::timestamptz >= ?", [$since]);
        }
    }

    protected function casts(): array
    {
        return ['evidence' => 'array', 'stale' => 'boolean', 'evaluated_at' => 'immutable_datetime', 'dismissed_at' => 'immutable_datetime'];
    }
}
