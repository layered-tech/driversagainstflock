<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ModerationRuleVersion extends Model
{
    protected $guarded = [];

    protected function casts(): array
    {
        return ['configuration' => 'array'];
    }
}
