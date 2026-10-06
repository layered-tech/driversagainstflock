<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ModerationRuleIndexRequest extends FormRequest
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
            'types' => ['sometimes', 'array', 'max:4'],
            'types.*' => [Rule::in(['duplicate_nodes', 'missing_tags', 'road_distance', 'invalid_tag'])],
            'severities' => ['sometimes', 'array', 'max:3'],
            'severities.*' => [Rule::in(['High', 'Medium', 'Low'])],
            'states' => ['sometimes', 'array', 'max:2'],
            'states.*' => [Rule::in(['Enabled', 'Paused'])],
        ];
    }
}
