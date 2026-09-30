<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ModerationEvaluation extends Model
{
    protected $guarded = [];

    protected function casts(): array
    {
        return ['evaluated_at' => 'immutable_datetime'];
    }
}
