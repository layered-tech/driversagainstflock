<?php

namespace App\Models;

use Database\Factories\ModerationReviewFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ModerationReview extends Model
{
    /** @use HasFactory<ModerationReviewFactory> */
    use HasFactory;

    protected $guarded = [];
}
