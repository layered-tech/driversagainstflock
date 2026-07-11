<?php

namespace App\Models;

use App\Support\Bearing;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use MatanYadaev\EloquentSpatial\Objects\Point;
use MatanYadaev\EloquentSpatial\Traits\HasSpatial;

class Marker extends Model
{
    use HasFactory, HasSpatial, SoftDeletes;

    protected $fillable = [
        'bearing',
        'point',
        'type',
        'user_id',
    ];

    protected $casts = [
        'point' => Point::class,
    ];

    public function setBearingAttribute(mixed $value): void
    {
        $this->attributes['bearing'] = Bearing::normalize($value);
    }

    public function confirmations(): HasMany
    {
        return $this->hasMany(Confirmation::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
