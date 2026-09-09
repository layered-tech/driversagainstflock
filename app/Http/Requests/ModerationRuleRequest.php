<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class ModerationRuleRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:120'], 'description' => ['nullable', 'string', 'max:2000'],
            'type' => ['required', Rule::in(['missing_tags', 'invalid_tag', 'road_distance', 'duplicate_nodes'])],
            'severity' => ['required', Rule::in(['Low', 'Medium', 'High'])],
            'enabled' => ['sometimes', 'boolean'], 'version' => ['sometimes', 'integer', 'min:1'],
            'area_ids' => ['present', 'array', 'max:100'], 'area_ids.*' => ['integer', 'distinct', 'exists:watched_areas,id'],
            'conditions' => ['present', 'array', 'max:20'], 'exceptions' => ['present', 'array', 'max:20'],
            'conditions.*' => ['array:key,operator,value'], 'exceptions.*' => ['array:key,operator,value'],
            'conditions.*.key' => ['required', 'string', 'max:255'], 'exceptions.*.key' => ['required', 'string', 'max:255'],
            'conditions.*.operator' => ['required', Rule::in(['exists', 'missing', 'equals', 'not_equals'])],
            'exceptions.*.operator' => ['required', Rule::in(['exists', 'missing', 'equals', 'not_equals'])],
            'conditions.*.value' => ['nullable', 'string', 'max:255'], 'exceptions.*.value' => ['nullable', 'string', 'max:255'],
            'settings' => ['required', 'array:keys,blank_is_missing,key,allowed_values,min,max,format,distance_meters,road_types,match_tags'],
            'settings.keys' => ['required_if:type,missing_tags', 'array', 'min:1', 'max:30'], 'settings.keys.*' => ['string', 'distinct', 'max:255'],
            'settings.blank_is_missing' => ['sometimes', 'boolean'],
            'settings.key' => ['required_if:type,invalid_tag', 'string', 'max:255'],
            'settings.allowed_values' => ['sometimes', 'array', 'max:100'], 'settings.allowed_values.*' => ['string', 'max:255'],
            'settings.min' => ['nullable', 'numeric'], 'settings.max' => ['nullable', 'numeric'],
            'settings.format' => ['nullable', Rule::in(['integer', 'decimal', 'direction', 'url'])],
            'settings.distance_meters' => ['required_if:type,road_distance,duplicate_nodes', 'numeric', 'gt:0', 'max:5000'],
            'settings.road_types' => ['required_if:type,road_distance', 'array', 'min:1', 'max:30'],
            'settings.road_types.*' => ['string', 'regex:/^[a-z_]+$/D', 'max:50', 'distinct'],
            'settings.match_tags' => ['present_if:type,duplicate_nodes', 'array', 'max:30'], 'settings.match_tags.*' => ['string', 'distinct', 'max:255'],
        ];
    }

    public function after(): array
    {
        return [function (Validator $validator): void {
            $settings = $this->input('settings', []);
            if (! is_array($settings)) {
                return;
            }
            if ($this->input('type') === 'invalid_tag' && empty($settings['allowed_values']) && empty($settings['format']) && ! isset($settings['min']) && ! isset($settings['max'])) {
                $validator->errors()->add('settings', 'Choose allowed values, a format, or a numeric range.');
            }
            if (isset($settings['min'], $settings['max']) && is_numeric($settings['min']) && is_numeric($settings['max']) && $settings['min'] > $settings['max']) {
                $validator->errors()->add('settings.max', 'The maximum must be at least the minimum.');
            }
            foreach (['conditions', 'exceptions'] as $group) {
                foreach (is_array($this->input($group)) ? $this->input($group) : [] as $index => $condition) {
                    if (is_array($condition) && in_array($condition['operator'] ?? '', ['equals', 'not_equals'], true) && ! isset($condition['value'])) {
                        $validator->errors()->add($group.'.'.$index.'.value', 'Enter a comparison value.');
                    }
                }
            }
        }];
    }
}
