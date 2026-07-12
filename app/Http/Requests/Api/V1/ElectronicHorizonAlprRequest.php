<?php

namespace App\Http\Requests\Api\V1;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class ElectronicHorizonAlprRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'coordinates' => ['required', 'array', 'min:2', 'max:5000'],
            'coordinates.*' => ['required', 'array', 'size:2'],
            'coordinates.*.0' => ['required', 'numeric', 'between:-180,180'],
            'coordinates.*.1' => ['required', 'numeric', 'between:-90,90'],
        ];
    }

    /**
     * @return array<int, array{0: float, 1: float}>
     */
    public function coordinates(): array
    {
        return array_map(
            fn (array $coordinate): array => [
                (float) $coordinate[0],
                (float) $coordinate[1],
            ],
            $this->validated('coordinates'),
        );
    }
}
