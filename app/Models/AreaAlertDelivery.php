<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AreaAlertDelivery extends Model
{
    protected $guarded = [];

    public function subscription(): BelongsTo
    {
        return $this->belongsTo(AreaSubscription::class, 'area_subscription_id');
    }

    protected function casts(): array
    {
        return ['payload' => 'array', 'sent_at' => 'immutable_datetime'];
    }
}
