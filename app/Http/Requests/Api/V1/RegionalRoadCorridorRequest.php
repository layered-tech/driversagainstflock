<?php

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;

class RegionalRoadCorridorRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return ['region' => ['required', 'string', 'regex:/\A-?\d{1,2}_-?\d{1,2}\z/']];
    }

    public function region(): string
    {
        return $this->validated('region');
    }
}
