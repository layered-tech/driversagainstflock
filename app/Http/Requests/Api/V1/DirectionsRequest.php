<?php

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;

class DirectionsRequest extends FormRequest
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
            'start' => ['required', 'array'],
            'start.latitude' => ['required', 'numeric', 'between:-90,90'],
            'start.longitude' => ['required', 'numeric', 'between:-180,180'],
            'end' => ['required', 'array'],
            'end.latitude' => ['required', 'numeric', 'between:-90,90'],
            'end.longitude' => ['required', 'numeric', 'between:-180,180'],
            'waypoints' => ['nullable', 'array', 'max:10'],
            'waypoints.*' => ['required', 'array'],
            'waypoints.*.latitude' => ['required', 'numeric', 'between:-90,90'],
            'waypoints.*.longitude' => ['required', 'numeric', 'between:-180,180'],
            'profile' => ['nullable', 'array'],
            'profile.*' => ['array'],
            'profile.*.id' => ['nullable', 'string'],
            'profile.*.name' => ['nullable', 'string'],
            'profile.*.tags' => ['required_with:profile', 'array'],
            'profile.*.tags.*' => ['string'],
            'avoid_buffer' => ['nullable', 'integer', 'min:1', 'max:5000'],
            'allow_alpr_near_start_destination' => ['nullable', 'boolean'],
            'continue_straight' => ['nullable', 'boolean'],
            'show_zone' => ['nullable', 'boolean'],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function directionsPayload(): array
    {
        $validated = $this->validated();
        $validated['profile'] ??= [];
        $validated['waypoints'] ??= [];
        $validated['avoid_buffer'] ??= config('directions.avoid_buffer_meters');
        $validated['allow_alpr_near_start_destination'] = $this->nullableBoolean(
            $validated,
            'allow_alpr_near_start_destination',
            true,
        );
        $validated['continue_straight'] = $this->nullableBoolean($validated, 'continue_straight', true);
        $validated['show_zone'] = $this->nullableBoolean($validated, 'show_zone', false);

        return $validated;
    }

    /**
     * @param  array<string, mixed>  $validated
     */
    private function nullableBoolean(array $validated, string $key, bool $default): bool
    {
        if (! array_key_exists($key, $validated) || $validated[$key] === null) {
            return $default;
        }

        return $this->boolean($key);
    }
}
