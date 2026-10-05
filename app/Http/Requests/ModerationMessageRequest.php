<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class ModerationMessageRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'recipient_id' => ['required', 'integer', 'min:1'],
            'version' => ['required', 'integer', 'min:1'],
            'subject' => ['required', 'string', 'max:255'],
            'body' => ['required', 'string', 'max:10000'],
        ];
    }
}
