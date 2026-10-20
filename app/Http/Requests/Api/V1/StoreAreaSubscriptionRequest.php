<?php

namespace App\Http\Requests\Api\V1;

use App\Http\Requests\StoreWatchedAreaRequest;
use Illuminate\Validation\Rule;

class StoreAreaSubscriptionRequest extends StoreWatchedAreaRequest
{
    public function rules(): array
    {
        return [...parent::rules(), 'kind' => ['required', Rule::in(['city', 'county', 'zip', 'radius', 'drawn'])]];
    }
}
