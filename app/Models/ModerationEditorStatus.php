<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ModerationEditorStatus extends Model
{
    use HasFactory;

    public const STATUSES = ['Trusted', 'Neutral', 'New', 'Watch'];

    protected $fillable = ['osm_uid', 'status', 'assigned_by'];
}
