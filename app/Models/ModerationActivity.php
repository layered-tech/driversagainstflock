<?php

namespace App\Models;

use Database\Factories\ModerationActivityFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ModerationActivity extends Model
{
    /** @use HasFactory<ModerationActivityFactory> */
    use HasFactory;

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'details' => 'array',
        ];
    }
}
