<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use LogicException;

class AlprPresenceReport extends Model
{
    use HasFactory;

    public $timestamps = false;

    protected $guarded = [];

    protected $hidden = ['reporter_key', 'event_key', 'payload_hash'];

    protected static function booted(): void
    {
        static::updating(function (): void {
            throw new LogicException('Presence report evidence is immutable.');
        });
        static::deleting(function (): void {
            throw new LogicException('Presence report evidence is immutable.');
        });
    }

    public function flag(): BelongsTo
    {
        return $this->belongsTo(ModerationFlag::class, 'moderation_flag_id');
    }

    protected function casts(): array
    {
        return ['osm_node_id' => 'integer', 'observed' => 'array', 'server_latitude' => 'float', 'server_longitude' => 'float',
            'passed_at' => 'immutable_datetime', 'occurred_at' => 'immutable_datetime', 'submitted_at' => 'immutable_datetime', 'received_at' => 'immutable_datetime'];
    }
}
