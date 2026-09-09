<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class OsmNodeVersion extends Model
{
    public $timestamps = false;

    protected $primaryKey = 'id';

    protected $guarded = ['*'];

    public function getConnectionName(): ?string
    {
        return (string) config('osm.reader.connection', 'osm');
    }

    public function getTable(): string
    {
        return (string) config('osm.reader.versions_table', 'osm_history.alpr_node_versions');
    }

    protected function casts(): array
    {
        return ['tags' => 'array', 'visible' => 'boolean', 'open' => 'boolean', 'osm_uid' => 'integer'];
    }
}
