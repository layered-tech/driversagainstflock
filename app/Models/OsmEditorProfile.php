<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class OsmEditorProfile extends Model
{
    protected $guarded = [];

    protected function casts(): array
    {
        return ['account_created_at' => 'immutable_datetime', 'fetched_at' => 'immutable_datetime', 'changesets_count' => 'integer'];
    }
}
