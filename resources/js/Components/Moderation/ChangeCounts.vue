<script setup>
defineProps({ row: { type: Object, required: true } });
</script>
<template>
    <div
        class="flex items-center gap-1.5 font-mono text-xs font-bold tabular-nums"
    >
        <span
            class="min-w-[38px] rounded-dafXs bg-[var(--brand-soft)] px-1.5 py-1 text-center text-daf-text-brand"
            >{{ Number(row.added) ? `+${row.added}` : '—' }}</span
        >
        <span
            class="min-w-[38px] rounded-dafXs bg-[var(--amber-100)] px-1.5 py-1 text-center text-[var(--amber-600)]"
            >{{ Number(row.modified) ? `~${row.modified}` : '—' }}</span
        >
        <span
            class="min-w-[38px] rounded-dafXs bg-[var(--alert-100)] px-1.5 py-1 text-center text-[var(--alert-600)]"
            >{{ Number(row.deleted) ? `−${row.deleted}` : '—' }}</span
        >
    </div>
</template>
