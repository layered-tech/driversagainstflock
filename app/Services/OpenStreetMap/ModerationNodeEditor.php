<?php

namespace App\Services\OpenStreetMap;

use App\Models\ModerationActivity;
use App\Models\ModerationFlag;
use Illuminate\Database\QueryException;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use Illuminate\Validation\ValidationException;
use Laravel\Telescope\Telescope;

class ModerationNodeEditor
{
    public function flag(int $node, int $id): ModerationFlag
    {
        return ModerationFlag::with('rule')->whereKey($id)->where('node_id', $node)->firstOrFail();
    }

    /** @param array<string, mixed> $input
     * @return array<string, mixed>
     */
    public function save(int $id, string $token, array $input, ModerationFlag $flag, int $userId, string $actor): array
    {
        $options = $this->options($flag);
        if (! in_array($input['action'], $options['actions'], true)) {
            throw ValidationException::withMessages(['action' => 'This action is not available for this report.']);
        }
        if ($input['action'] === 'tags' && array_diff(array_keys($input['tags']), $options['tag_keys']) !== []) {
            throw ValidationException::withMessages(['tags' => 'Only tags relevant to this rule can be changed from this report.']);
        }
        $this->validateTagUpdate($flag, $input);

        return Telescope::withoutRecording(function () use ($id, $token, $input, $flag, $userId, $actor): array {
            $node = $this->current($id, $token);
            if ($node['version'] !== (int) $input['version']) {
                throw ValidationException::withMessages(['edit' => 'This node changed on OpenStreetMap. Reload the editor and review the latest version before saving.']);
            }
            $updated = $node;
            if ($input['action'] === 'tags') {
                foreach ($input['tags'] as $key => $value) {
                    if ($value === null || $value === '') {
                        unset($updated['tags'][$key]);
                    } else {
                        $updated['tags'][$key] = $value;
                    }
                }
            } elseif ($input['action'] === 'location') {
                $updated['lat'] = (float) $input['latitude'];
                $updated['lon'] = (float) $input['longitude'];
            }
            if ($input['action'] !== 'remove' && ($updated['tags'] ?? []) === ($node['tags'] ?? [])
                && $updated['lat'] === $node['lat'] && $updated['lon'] === $node['lon']) {
                throw ValidationException::withMessages(['edit' => 'No node changes were entered.']);
            }
            $changesetXml = $this->xml('changeset', [], ['comment' => $input['comment'], 'created_by' => 'Drivers Against Flock moderation']);
            $created = $this->http($token)->withBody($changesetXml, 'text/xml')->put($this->url('/changeset/create'));
            $this->check($created);
            $changeset = trim($created->body());
            if (! ctype_digit($changeset) || (int) $changeset < 1) {
                throw ValidationException::withMessages(['edit' => 'OpenStreetMap did not return a changeset ID. Nothing was changed.']);
            }
            $closed = false;
            $recorded = false;
            $verifiedResult = false;
            try {
                $xml = $this->xml('node', ['id' => $id, 'version' => $node['version'], 'changeset' => $changeset, 'lat' => $updated['lat'], 'lon' => $updated['lon']], $updated['tags'] ?? []);
                $saved = $this->http($token)->withBody($xml, 'text/xml')->send($input['action'] === 'remove' ? 'DELETE' : 'PUT', $this->url('/node/'.$id));
                $this->check($saved);
                $version = trim($saved->body());
                if (! ctype_digit($version) || (int) $version <= $node['version']) {
                    throw ValidationException::withMessages(['edit' => 'The OpenStreetMap response could not be confirmed. Check node history before retrying.']);
                }
                $updated = [...$updated, 'version' => (int) $version, 'changeset' => (int) $changeset, 'visible' => $input['action'] !== 'remove'];
                unset($updated['timestamp'], $updated['user'], $updated['uid']);
                try {
                    $receipt = ModerationActivity::create([
                        'user_id' => $userId, 'actor' => $actor, 'action' => 'node.osm_'.$input['action'], 'subject_type' => 'node', 'subject_id' => $id,
                        'details' => ['flag_id' => $flag->id, 'changeset_id' => (int) $changeset, 'previous_version' => $node['version'], 'node' => $updated, 'verified' => false],
                    ]);
                    $recorded = true;
                    try {
                        $verified = $this->http($token)->get($this->url('/node/'.$id.'/'.$version.'.json'));
                        $snapshot = $verified->json('elements.0');
                        if ($verified->successful() && is_array($snapshot) && ($snapshot['id'] ?? null) === $id && ($snapshot['version'] ?? null) === (int) $version) {
                            $updated = $snapshot;
                            $verifiedResult = true;
                            $receipt->update(['details' => [...$receipt->details, 'node' => $snapshot, 'verified' => true]]);
                        }
                    } catch (ConnectionException) {
                        // The write receipt remains available when the follow-up read fails.
                    }
                    ModerationFlag::where('status', 'open')->where(fn ($query) => $query->where('node_id', $id)->orWhere('related_node_id', $id))->update(['stale' => true]);
                    app(ModerationSummaryCache::class)->invalidate();
                } catch (QueryException $exception) {
                    report($exception);
                }
            } finally {
                try {
                    $closed = $this->http($token)->put($this->url('/changeset/'.$changeset.'/close'))->successful();
                } catch (ConnectionException) {
                    $closed = false;
                }
            }

            return ['node' => $updated, 'changeset_id' => (int) $changeset, 'closed' => $closed, 'verified' => $verifiedResult, 'recorded' => $recorded];
        });
    }

    /** @return array{actions: list<string>, tag_keys: list<string>} */
    public function options(ModerationFlag $flag): array
    {
        if ($flag->status !== 'open' || ($flag->source === 'rule' && ! $flag->rule?->enabled)) {
            return ['actions' => [], 'tag_keys' => []];
        }

        return match ($flag->source === 'alpr_presence' ? 'alpr_presence' : $flag->rule?->type) {
            'missing_tags' => ['actions' => ['tags'], 'tag_keys' => $flag->rule->settings['keys']],
            'invalid_tag' => ['actions' => ['tags'], 'tag_keys' => [$flag->rule->settings['key']]],
            'road_distance' => ['actions' => ['location'], 'tag_keys' => []],
            'duplicate_nodes' => ['actions' => $flag->rule->settings['match_tags'] ? ['tags', 'location', 'remove'] : ['location', 'remove'], 'tag_keys' => $flag->rule->settings['match_tags']],
            'alpr_presence' => ['actions' => ['location', 'remove'], 'tag_keys' => []],
            default => ['actions' => [], 'tag_keys' => []],
        };
    }

    /** @param array<string, mixed> $input */
    private function validateTagUpdate(ModerationFlag $flag, array $input): void
    {
        if ($input['action'] !== 'tags') {
            return;
        }
        foreach ($input['tags'] as $key => $value) {
            if ($flag->rule?->type === 'missing_tags' && ($value === null || trim($value) === '')) {
                throw ValidationException::withMessages(['tags' => 'Enter a surveyed value for each required tag.']);
            }
            if ($flag->rule?->type === 'invalid_tag' && $value !== null && $value !== ''
                && ! app(ModerationRuleEvaluator::class)->validTagValue($value, $flag->rule->settings)) {
                throw ValidationException::withMessages(['tags' => 'The tag value does not meet this rule. Review the expected format and allowed values.']);
            }
        }
    }

    /** @return array<string, mixed> */
    public function current(int $id, string $token): array
    {
        return Telescope::withoutRecording(function () use ($id, $token): array {
            $response = $this->http($token)->get($this->url('/node/'.$id.'.json'));
            if ($response->status() === 410) {
                throw ValidationException::withMessages(['edit' => 'This node has already been removed from OpenStreetMap.']);
            }
            $this->check($response);
            $node = $response->json('elements.0');
            if (! is_array($node) || ($node['id'] ?? null) !== $id || ! is_int($node['version'] ?? null)) {
                throw ValidationException::withMessages(['edit' => 'OpenStreetMap returned incomplete node data. Please try again.']);
            }

            return $node;
        });
    }

    private function http(string $token): PendingRequest
    {
        return Http::withToken($token)->acceptJson()->connectTimeout(3)->timeout(15);
    }

    private function url(string $path): string
    {
        return rtrim(config('moderation.oauth.api_url'), '/').$path;
    }

    private function check(Response $response): void
    {
        if ($response->successful()) {
            return;
        }
        $message = match ($response->status()) {
            401, 403 => 'OpenStreetMap did not allow this edit. Authorize editing again and check your OpenStreetMap account.',
            409 => 'This node changed on OpenStreetMap. Reload the editor before saving.',
            412 => 'OpenStreetMap cannot remove this node because it is used by a way or relation. Review it in the OSM editor.',
            404, 410 => 'This node is no longer available on OpenStreetMap.',
            default => 'OpenStreetMap could not complete this request. Check node history before retrying.',
        };
        throw ValidationException::withMessages(['edit' => $message]);
    }

    /** @param array<string, int|float|string> $attributes
     * @param  array<string, string>  $tags
     */
    private function xml(string $element, array $attributes, array $tags): string
    {
        $xml = new \XMLWriter;
        $xml->openMemory();
        $xml->startDocument('1.0', 'UTF-8');
        $xml->startElement('osm');
        $xml->writeAttribute('version', '0.6');
        $xml->writeAttribute('generator', 'Drivers Against Flock');
        $xml->startElement($element);
        foreach ($attributes as $key => $value) {
            $xml->writeAttribute($key, (string) $value);
        }
        foreach ($tags as $key => $value) {
            $xml->startElement('tag');
            $xml->writeAttribute('k', $key);
            $xml->writeAttribute('v', $value);
            $xml->endElement();
        }
        $xml->endElement();
        $xml->endElement();
        $xml->endDocument();

        return $xml->outputMemory();
    }

    /** @param list<array<string, mixed>> $nodes
     * @return list<array<string, mixed>>
     */
    public function overlay(array $nodes): array
    {
        $receipts = ModerationActivity::where('subject_type', 'node')->whereIn('subject_id', array_column($nodes, 'id'))
            ->whereIn('action', ['node.osm_tags', 'node.osm_location', 'node.osm_remove'])->latest('id')->get()->unique('subject_id')->keyBy('subject_id');

        return array_map(function (array $node) use ($receipts): array {
            $receipt = $receipts->get($node['id']);
            $snapshot = $receipt?->details['node'] ?? null;
            if (! $snapshot || ($node['osm_version'] ?? 0) >= $snapshot['version']) {
                return $node;
            }

            return [...$node, 'osm_version' => $snapshot['version'], 'tags' => $snapshot['tags'] ?? [],
                'operator' => $snapshot['tags']['operator'] ?? null,
                'direction' => $this->direction($snapshot['tags'] ?? []),
                ...isset($snapshot['timestamp']) ? ['changed_at' => $snapshot['timestamp']] : [],
                'visible' => $snapshot['visible'] ?? true, 'latitude' => $snapshot['lat'] ?? $node['latitude'] ?? null, 'longitude' => $snapshot['lon'] ?? $node['longitude'] ?? null,
                'osm_changeset_id' => $snapshot['changeset'], 'osm_edit' => ['saved_at' => $receipt->created_at->toIso8601String(), 'verified' => $receipt->details['verified'], 'pending_sync' => true],
            ];
        }, $nodes);
    }

    /** @param array<string, string> $tags */
    private function direction(array $tags): ?int
    {
        $value = $tags['camera:direction'] ?? $tags['direction'] ?? '';
        if (preg_match('/^[0-9]+(\.[0-9]+)?$/D', trim($value)) === 1) {
            return (float) $value <= 360 ? (int) round((float) $value) % 360 : null;
        }

        return ['N' => 0, 'NE' => 45, 'E' => 90, 'SE' => 135, 'S' => 180, 'SW' => 225, 'W' => 270, 'NW' => 315][strtoupper($value)] ?? null;
    }
}
