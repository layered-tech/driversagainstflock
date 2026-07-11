<template>
    <component
        :is="component"
        :href="href"
        :type="component === 'button' ? type : undefined"
        :disabled="component === 'button' ? disabled : undefined"
        :class="classes"
        v-bind="componentProps"
    >
        <DafIcon v-if="leadingIcon" :name="leadingIcon" :size="iconSize" />
        <slot />
        <DafIcon v-if="trailingIcon" :name="trailingIcon" :size="iconSize" />
    </component>
</template>

<script setup>
import { Link } from '@inertiajs/vue3';
import { computed } from 'vue';
import DafIcon from './DafIcon.vue';

const props = defineProps({
    href: {
        type: String,
        default: '',
    },
    variant: {
        type: String,
        default: 'primary',
    },
    size: {
        type: String,
        default: 'md',
    },
    type: {
        type: String,
        default: 'button',
    },
    fullWidth: {
        type: Boolean,
        default: false,
    },
    disabled: {
        type: Boolean,
        default: false,
    },
    leadingIcon: {
        type: String,
        default: '',
    },
    trailingIcon: {
        type: String,
        default: '',
    },
    external: {
        type: Boolean,
        default: false,
    },
});

const component = computed(() => {
    if (!props.href) {
        return 'button';
    }

    return props.external ? 'a' : Link;
});

const componentProps = computed(() => {
    if (!props.external) {
        return {};
    }

    return {
        rel: 'noreferrer',
        target: '_blank',
    };
});

const sizeClasses = computed(
    () =>
        ({
            sm: 'min-h-11 px-4 text-daf-body-sm',
            md: 'min-h-11 px-5 text-daf-body',
            lg: 'min-h-[52px] px-6 text-daf-body-lg',
        })[props.size] ?? 'min-h-11 px-5 text-daf-body',
);

const variantClasses = computed(
    () =>
        ({
            primary:
                'bg-daf-brand text-daf-brand-contrast shadow-dafFloat hover:bg-daf-brand-hover',
            secondary:
                'border border-daf-border bg-daf-surface-card text-daf-text-primary shadow-dafCard hover:border-daf-border-strong',
            ghost: 'text-daf-text-primary hover:bg-daf-surface-alt',
            glass: 'daf-glass text-daf-text-primary hover:border-daf-brand',
            danger: 'bg-daf-danger text-white shadow-dafFloat hover:bg-[#E5383B]',
        })[props.variant] ??
        'bg-daf-brand text-daf-brand-contrast shadow-dafFloat hover:bg-daf-brand-hover',
);

const iconSize = computed(() => (props.size === 'lg' ? 20 : 18));

const classes = computed(() => [
    'daf-pressable inline-flex items-center justify-center gap-2 rounded-dafPill font-semibold',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-daf-focus',
    'disabled:pointer-events-none disabled:opacity-50',
    props.fullWidth ? 'w-full' : '',
    sizeClasses.value,
    variantClasses.value,
]);
</script>
