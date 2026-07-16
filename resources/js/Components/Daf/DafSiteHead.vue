<script setup>
import { Head, usePage } from '@inertiajs/vue3';
import { computed } from 'vue';

const defaults = {
    canonical: '/',
    description:
        'Drivers Against Flock helps drivers plan routes around license-plate readers and roadside cameras.',
    robots: 'noindex, nofollow',
    siteName: 'Drivers Against Flock',
    title: 'Drivers Against Flock',
};

const page = usePage();

const seo = computed(() => ({
    ...defaults,
    ...(page.props.seo ?? {}),
}));

const fullTitle = computed(() => `${seo.value.title} - ${seo.value.siteName}`);
</script>

<template>
    <Head :title="seo.title">
        <meta
            head-key="description"
            name="description"
            :content="seo.description"
        />
        <meta head-key="robots" name="robots" :content="seo.robots" />
        <link head-key="canonical" rel="canonical" :href="seo.canonical" />
        <meta head-key="og:title" property="og:title" :content="fullTitle" />
        <meta
            head-key="og:description"
            property="og:description"
            :content="seo.description"
        />
        <meta head-key="og:type" property="og:type" content="website" />
        <meta head-key="og:url" property="og:url" :content="seo.canonical" />
        <meta
            head-key="og:site_name"
            property="og:site_name"
            :content="seo.siteName"
        />
        <meta head-key="twitter:card" name="twitter:card" content="summary" />
        <meta
            head-key="twitter:title"
            name="twitter:title"
            :content="fullTitle"
        />
        <meta
            head-key="twitter:description"
            name="twitter:description"
            :content="seo.description"
        />
    </Head>
</template>
