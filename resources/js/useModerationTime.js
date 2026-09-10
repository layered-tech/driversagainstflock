import { onMounted, ref } from 'vue';
import { localTime } from './moderation.js';

export function useModerationTime() {
    const mounted = ref(false);
    onMounted(() => {
        mounted.value = true;
    });

    return {
        absoluteTime: (value) => (mounted.value ? localTime(value) : '—'),
        localTime: (value) => (mounted.value ? localTime(value) : '—'),
        localDate: (value) => (mounted.value ? localTime(value, true) : '—'),
    };
}
