<?php

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateAreaSubscriptionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => ['sometimes', 'required', 'string', 'max:120'],
            'alert_mode' => ['sometimes', 'required', Rule::in(['instant', 'daily', 'weekly', 'off'])],
            'notify_added' => ['sometimes', 'required', 'boolean'],
            'notify_removed' => ['sometimes', 'required', 'boolean'],
            'digest_time' => ['sometimes', 'required', 'date_format:H:i'],
        ];
    }
}
