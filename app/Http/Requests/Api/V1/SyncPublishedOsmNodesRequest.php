<?php

namespace App\Http\Requests\Api\V1;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class SyncPublishedOsmNodesRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'changeset_id' => ['required', 'integer', 'min:1'],
            'nodes' => ['required', 'array', 'min:1', 'max:50'],
            'nodes.*' => ['required', 'array:id,version'],
            'nodes.*.id' => ['required', 'integer', 'min:1', 'distinct:strict'],
            'nodes.*.version' => ['required', 'integer', 'min:1'],
        ];
    }

    public function changesetId(): int
    {
        return (int) $this->validated('changeset_id');
    }

    /**
     * @return array<int, array{id: int, version: int}>
     */
    public function nodes(): array
    {
        return array_map(
            fn (array $node): array => [
                'id' => (int) $node['id'],
                'version' => (int) $node['version'],
            ],
            $this->validated('nodes'),
        );
    }
}
