<?php

namespace App\Policies;

use App\Models\User;

class ConfirmationPolicy
{
    /**
     * Determine whether the user can create models.
     */
    public function create(User $user): bool
    {
        return true;
    }
}
