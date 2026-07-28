<?php

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;

class RoadCorridorRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'latitude' => ['required', 'numeric', 'between:-90,90'],
            'longitude' => ['required', 'numeric', 'between:-180,180'],
            'radius_meters' => [
                'sometimes',
                'integer',
                'min:25',
                'max:'.(int) config('road-corridor.maximum_radius_meters'),
            ],
        ];
    }

    public function latitude(): float
    {
        return (float) $this->validated('latitude');
    }

    public function longitude(): float
    {
        return (float) $this->validated('longitude');
    }

    public function radiusMeters(): int
    {
        return (int) $this->validated('radius_meters', config('road-corridor.radius_meters'));
    }
}
