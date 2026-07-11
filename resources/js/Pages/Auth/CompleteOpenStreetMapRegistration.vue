<script setup>
import GuestLayout from '@/Layouts/GuestLayout.vue';
import InputError from '@/Components/InputError.vue';
import InputLabel from '@/Components/InputLabel.vue';
import PrimaryButton from '@/Components/PrimaryButton.vue';
import TextInput from '@/Components/TextInput.vue';
import { Head, useForm } from '@inertiajs/vue3';

const props = defineProps({
    openStreetMapUser: {
        type: Object,
        required: true,
    },
});

const form = useForm({
    name:
        props.openStreetMapUser.name || props.openStreetMapUser.nickname || '',
    email: '',
});

const submit = () => {
    form.post(route('auth.openstreetmap.register.store'));
};
</script>

<template>
    <GuestLayout>
        <Head title="Complete registration" />

        <div class="mb-6">
            <h1 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Complete registration
            </h1>
            <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
                Finish creating your Drivers Against Flock account linked to
                {{ openStreetMapUser.nickname || 'OpenStreetMap' }}.
            </p>
        </div>

        <form @submit.prevent="submit">
            <div>
                <InputLabel for="name" value="Name" />

                <TextInput
                    id="name"
                    type="text"
                    class="mt-1 block w-full"
                    v-model="form.name"
                    required
                    autofocus
                    autocomplete="name"
                />

                <InputError class="mt-2" :message="form.errors.name" />
            </div>

            <div class="mt-4">
                <InputLabel for="email" value="Email" />

                <TextInput
                    id="email"
                    type="email"
                    class="mt-1 block w-full"
                    v-model="form.email"
                    required
                    autocomplete="email"
                />

                <InputError class="mt-2" :message="form.errors.email" />
            </div>

            <div class="mt-6 flex justify-end">
                <PrimaryButton
                    :class="{ 'opacity-25': form.processing }"
                    :disabled="form.processing"
                >
                    Complete registration
                </PrimaryButton>
            </div>
        </form>
    </GuestLayout>
</template>
