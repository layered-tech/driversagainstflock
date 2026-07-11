<?php

namespace App\Support;

use App\Models\Confirmation;
use App\Models\User;

class UserPayload
{
    public function for(User $user): array
    {
        return [
            'user' => $user->toArray(),
            'permissions' => [
                'markers' => [
                    'can' => [
                        'add' => false, // $user->can('create', Marker::class),
                        'confirm' => $user->can('create', Confirmation::class),
                        'delete' => $user->can('delete', Marker::class),
                    ],
                ],
            ],
        ];
    }
}
