<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;

class CurrentOsmNode extends OsmNode
{
    /**
     * @return Builder<self>
     */
    public static function readerQuery(): Builder
    {
        $model = new self;

        return $model
            ->setConnection($model->readerConnectionName())
            ->setTable($model->readerTableName())
            ->newQuery();
    }

    public function getConnectionName(): ?string
    {
        if (! config('osm.reader.enabled')) {
            return parent::getConnectionName();
        }

        return $this->readerConnectionName();
    }

    private function readerConnectionName(): string
    {
        return (string) config('osm.reader.connection', 'osm');
    }

    public function getTable(): string
    {
        if (! config('osm.reader.enabled')) {
            return parent::getTable();
        }

        return $this->readerTableName();
    }

    private function readerTableName(): string
    {
        return (string) config('osm.reader.table', 'osm_current.application_alpr_nodes');
    }
}
