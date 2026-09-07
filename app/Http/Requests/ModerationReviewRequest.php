<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ModerationReviewRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return ['revision' => ['required', 'string', 'size:32'], 'status' => ['required', Rule::in(['Reviewed', 'Flagged', 'Needs review', 'Dismissed'])]];
    }
}
