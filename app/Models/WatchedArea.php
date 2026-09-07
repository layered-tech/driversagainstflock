<?php

namespace App\Models;

use Database\Factories\WatchedAreaFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class WatchedArea extends Model
{
    /** @use HasFactory<WatchedAreaFactory> */
    use HasFactory;

    protected $guarded = [];

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
        ];
    }
}
