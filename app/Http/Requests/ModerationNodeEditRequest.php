<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ModerationNodeEditRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'flag_id' => ['required', 'integer', 'min:1'],
            'version' => ['required', 'integer', 'min:1'],
            'action' => ['required', Rule::in(['tags', 'location', 'remove', 'adjust'])],
            'confirmed' => ['required', 'accepted'],
            'comment' => ['required', 'string', 'min:5', 'max:255'],
            'tags' => ['required_if:action,tags,adjust', 'array', 'max:50'],
            'tags.*' => ['nullable', 'string', 'max:255'],
            'latitude' => ['required_if:action,location,adjust', 'numeric', 'between:-90,90'],
            'longitude' => ['required_if:action,location,adjust', 'numeric', 'between:-180,180'],
        ];
    }
}
