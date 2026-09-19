<?php

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreAlprPresenceReportRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'osm_node_id' => ['required', 'integer', 'min:1', 'max:9007199254740991'],
            'response' => ['required', Rule::in(['not_there'])],
            'platform' => ['required', Rule::in(['android_auto', 'carplay'])],
            'reporter_id' => ['required', 'string', 'min:32', 'max:128', 'regex:/\A[A-Za-z0-9_-]+\z/'],
            'event_key' => ['required', 'string', 'min:16', 'max:128', 'regex:/\A[A-Za-z0-9_-]+\z/'],
            'passed_at' => ['required', 'date', 'before_or_equal:occurred_at'],
            'occurred_at' => ['required', 'date', 'before_or_equal:submitted_at'],
            'submitted_at' => ['required', 'date', 'before_or_equal:'.now()->addMinutes(5)->toISOString()],
            'observed' => ['nullable', 'array:version,latitude,longitude,street'],
            'observed.version' => ['nullable', 'integer', 'min:1'],
            'observed.latitude' => ['nullable', 'numeric', 'between:-90,90'],
            'observed.longitude' => ['nullable', 'numeric', 'between:-180,180'],
            'observed.street' => ['nullable', 'string', 'max:200'],
            'user_id' => ['prohibited'], 'area_id' => ['prohibited'],
        ];
    }
}
