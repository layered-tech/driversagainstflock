<?php

namespace App\Models;

use Database\Factories\ModerationRuleFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ModerationRule extends Model
{
    /** @use HasFactory<ModerationRuleFactory> */
    use HasFactory;

    protected $guarded = [];

    public function versions(): HasMany
    {
        return $this->hasMany(ModerationRuleVersion::class, 'rule_id');
    }

    protected function casts(): array
    {
        return ['settings' => 'array', 'conditions' => 'array', 'exceptions' => 'array', 'area_ids' => 'array', 'enabled' => 'boolean', 'version' => 'integer'];
    }
}
