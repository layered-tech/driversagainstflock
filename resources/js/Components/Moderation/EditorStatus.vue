<script setup>
import { router } from '@inertiajs/vue3';
import { inject, ref } from 'vue';

const props = defineProps({
    uid: { type: Number, required: true },
    status: { type: String, default: null },
});
const route = inject('route');
const busy = ref(false);
function assign(event) {
    const status = event.target.value || null;
    if (busy.value || status === props.status) return;
    router.put(
        route('moderation.editors.status.update', props.uid),
        { status },
        {
            preserveScroll: true,
            onStart: () => (busy.value = true),
            onFinish: () => {
                busy.value = false;
                event.target.value = props.status || '';
            },
        },
    );
}
</script>
<template>
    <select
        :aria-label="`Status for editor ${uid}`"
        :disabled="busy"
        :value="status || ''"
        class="mod-input !h-7 !w-[112px] !px-2.5 !text-xs"
        title="Assigned by moderators"
        @change="assign"
    >
        <option value="">Unassigned</option>
        <option
            v-for="value in ['Trusted', 'Neutral', 'New', 'Watch']"
            :key="value"
            :value="value"
        >
            {{ value }}
        </option>
    </select>
</template>
