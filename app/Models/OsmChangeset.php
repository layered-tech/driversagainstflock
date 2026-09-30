<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class OsmChangeset extends Model
{
    public $timestamps = false;

    protected $primaryKey = 'osm_changeset_id';

    protected $guarded = ['*'];

    public function getConnectionName(): ?string
    {
        return (string) config('osm.reader.connection', 'osm');
    }

    public function getTable(): string
    {
        return (string) config('osm.reader.changesets_table', 'osm_history.application_changesets');
    }

    protected function casts(): array
    {
        return ['tags' => 'array', 'visible' => 'boolean', 'open' => 'boolean', 'osm_uid' => 'integer'];
    }
}
