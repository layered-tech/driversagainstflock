<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class AreaDevice extends Model
{
    use HasFactory;

    protected $guarded = [];

    protected $hidden = ['token_hash', 'push_token'];

    public function subscriptions(): HasMany
    {
        return $this->hasMany(AreaSubscription::class);
    }

    protected function casts(): array
    {
        return ['push_token' => 'encrypted', 'last_seen_at' => 'immutable_datetime'];
    }
}
