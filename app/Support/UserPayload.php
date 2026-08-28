<?php

namespace App\Support;

use App\Models\User;

class UserPayload
{
    public function for(User $user): array
    {
        return [
            'user' => $user->toArray(),
            'permissions' => [],
        ];
    }
}
