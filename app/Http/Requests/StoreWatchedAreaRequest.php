<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class StoreWatchedAreaRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return ['name' => ['required', 'string', 'max:120'], 'kind' => ['required', Rule::in(['zip', 'county', 'bbox', 'drawn'])],
            'definition' => ['required', 'string', 'max:255'],
            'geometry' => ['required', 'array:type,coordinates'], 'geometry.type' => ['required', Rule::in(['Polygon', 'MultiPolygon'])],
            'geometry.coordinates' => ['required', 'array', 'min:1'],
        ];
    }

    /** @return list<\Closure> */
    public function after(): array
    {
        return [function (Validator $validator): void {
            if ($validator->errors()->any()) {
                return;
            }
            $geometry = $this->input('geometry');
            $json = json_encode($geometry);
            if (strlen($json) > 500000) {
                $validator->errors()->add('geometry', 'Choose a smaller boundary.');

                return;
            }
            $polygons = $geometry['type'] === 'Polygon' ? [$geometry['coordinates']] : $geometry['coordinates'];
            foreach ($polygons as $polygon) {
                if (! is_array($polygon) || ! array_is_list($polygon) || count($polygon) === 0) {
                    $validator->errors()->add('geometry', 'A boundary must contain a polygon.');

                    return;
                }
                foreach ($polygon as $ring) {
                    if (! is_array($ring) || ! array_is_list($ring) || count($ring) < 4 || $ring[0] !== $ring[count($ring) - 1]) {
                        $validator->errors()->add('geometry', 'Close the boundary with at least three distinct points.');

                        return;
                    }
                    foreach ($ring as $point) {
                        if (! is_array($point) || ! array_is_list($point) || count($point) !== 2 || (! is_int($point[0]) && ! is_float($point[0])) || (! is_int($point[1]) && ! is_float($point[1])) || abs((float) $point[0]) > 180 || abs((float) $point[1]) > 90) {
                            $validator->errors()->add('geometry', 'Boundary coordinates must be valid longitude and latitude pairs.');

                            return;
                        }
                    }
                }
            }
            $valid = DB::selectOne('SELECT ST_IsValid(ST_SetSRID(ST_GeomFromGeoJSON(?),4326)) as valid', [$json]);
            if (! $valid->valid) {
                $validator->errors()->add('geometry', 'The boundary crosses itself or has no area. Adjust its points.');
            }
        }];
    }
}
