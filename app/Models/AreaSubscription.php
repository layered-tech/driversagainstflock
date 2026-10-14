<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class AreaSubscription extends Model
{
    use HasFactory;

    protected $guarded = [];

    public function device(): BelongsTo
    {
        return $this->belongsTo(AreaDevice::class, 'area_device_id');
    }

    public function deliveries(): HasMany
    {
        return $this->hasMany(AreaAlertDelivery::class);
    }

    protected function casts(): array
    {
        return ['geometry' => 'array', 'bounds' => 'array', 'notify_added' => 'boolean', 'notify_removed' => 'boolean', 'next_digest_at' => 'immutable_datetime'];
    }
}
