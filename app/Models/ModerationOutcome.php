<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ModerationOutcome extends Model
{
    protected $guarded = [];

    protected function casts(): array
    {
        return ['evidence' => 'array', 'occurred_at' => 'immutable_datetime', 'self_edit' => 'boolean'];
    }
}
