<?php

namespace App\Http\Requests;

use App\Models\ModerationEditorStatus;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ModerationEditorStatusRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return ['status' => ['present', 'nullable', Rule::in(ModerationEditorStatus::STATUSES)]];
    }
}
