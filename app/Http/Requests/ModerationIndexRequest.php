<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ModerationIndexRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'view' => ['sometimes', Rule::in(['changesets', 'nodes', 'editors', 'profile', 'areas', 'audit'])],
            'page' => ['sometimes', 'integer', 'min:1', 'max:1000000'],
            'user' => ['nullable', 'string', 'max:255'], 'changeset' => ['nullable', 'integer', 'min:1'],
            'uid' => ['required_if:view,profile', 'nullable', 'integer', 'min:1'],
            'area' => ['nullable', 'integer', 'exists:watched_areas,id'],
            'search' => ['nullable', 'string', 'max:255'],
            'window' => ['nullable', Rule::in(['24h', '7d', '30d'])],
            'statuses' => ['sometimes', 'array', 'max:3'], 'statuses.*' => [Rule::in(['Needs review', 'Reviewed', 'Flagged'])],
            'kinds' => ['sometimes', 'array', 'max:3'], 'kinds.*' => [Rule::in(['added', 'modified', 'deleted'])],
            'operator' => ['nullable', 'string', 'max:255'],
            'direction_from' => ['nullable', 'integer', 'between:0,359'],
            'direction_to' => ['nullable', 'integer', 'between:0,359'],
            'missing_direction' => ['sometimes', 'boolean'],
            'sort' => ['nullable', Rule::in(['id', 'changed_at', 'osm_user', 'added', 'modified', 'deleted', 'total', 'status', 'direction', 'operator', 'name', 'changesets_count', 'last_active', 'created_at'])],
            'order' => ['nullable', Rule::in(['asc', 'desc'])],
        ];
    }
}
