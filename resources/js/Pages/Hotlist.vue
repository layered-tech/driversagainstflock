<template>
    <div
        class="flex min-h-full flex-col bg-daf-surface-page text-daf-text-primary"
    >
        <Head title="Hotlist" />

        <DafSiteHeader
            :links="headerLinks"
            cta-href="/map"
            cta-label="Open Full Map"
            home-href="/"
        />

        <main>
            <section class="border-b border-daf-border">
                <div
                    class="mx-auto flex max-w-[var(--width-wide)] flex-wrap items-end justify-between gap-7 px-6 py-14"
                >
                    <div class="min-w-0">
                        <div
                            class="mb-3 font-mono text-daf-label font-bold uppercase tracking-[var(--ls-label)] text-daf-text-brand"
                        >
                            Hotlist
                        </div>
                        <h1
                            class="m-0 text-balance font-display text-daf-h1 font-bold tracking-[var(--ls-display)] text-daf-text-primary"
                        >
                            Recently updated nodes
                        </h1>
                        <p
                            class="mt-2 max-w-[52ch] text-daf-body-lg text-daf-text-secondary"
                        >
                            Fresh OpenStreetMap edits, sorted by the latest node
                            update.
                        </p>
                    </div>

                    <div class="flex flex-wrap items-center gap-3">
                        <div
                            class="inline-flex items-center gap-2 rounded-dafPill border border-daf-border bg-daf-surface-card px-3.5 py-2"
                        >
                            <span
                                class="relative inline-flex size-[7px] items-center justify-center"
                            >
                                <span
                                    class="hotlist-live absolute inset-0 rounded-full bg-daf-brand"
                                />
                                <span
                                    class="relative size-[7px] rounded-full bg-daf-brand"
                                />
                            </span>
                            <span
                                class="text-daf-body-sm font-semibold text-daf-text-secondary"
                            >
                                {{ syncedLabel }}
                            </span>
                        </div>
                        <DafSegmentedControl
                            v-model="timeWindow"
                            :options="timeWindowOptions"
                        />
                    </div>
                </div>
            </section>

            <section class="border-b border-daf-border">
                <div class="mx-auto max-w-[var(--width-wide)] px-6 py-14">
                    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <article
                            v-for="stat in statTiles"
                            :key="stat.label"
                            class="rounded-dafLg border border-daf-border bg-daf-surface-card p-5 shadow-dafCard"
                        >
                            <div class="mb-4 flex items-center gap-2.5">
                                <span
                                    class="inline-flex size-[34px] items-center justify-center rounded-dafSm bg-[var(--brand-soft)] text-daf-text-brand"
                                >
                                    <DafIcon :name="stat.icon" size="18" />
                                </span>
                                <span
                                    class="font-mono text-daf-label font-bold uppercase leading-tight tracking-[var(--ls-label)] text-daf-text-tertiary"
                                >
                                    {{ stat.label }}
                                </span>
                            </div>
                            <div
                                class="mb-2 font-mono text-[38px] font-semibold tabular-nums leading-none text-daf-text-primary"
                            >
                                {{ stat.value }}
                            </div>
                            <div
                                :class="[
                                    'inline-flex items-center gap-1 text-daf-body-sm font-medium',
                                    stat.tone === 'up'
                                        ? 'text-daf-text-brand'
                                        : 'text-daf-text-tertiary',
                                ]"
                            >
                                <DafIcon
                                    v-if="stat.isUp"
                                    name="arrow-up"
                                    size="13"
                                    stroke="2.4"
                                />
                                {{ stat.sub }}
                            </div>
                        </article>
                    </div>
                </div>
            </section>

            <section>
                <div class="mx-auto max-w-[var(--width-wide)] px-6 py-14">
                    <div
                        class="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]"
                    >
                        <div class="min-w-0">
                            <div
                                class="mb-[18px] flex flex-wrap items-center justify-between gap-4"
                            >
                                <div class="flex flex-wrap items-center gap-2">
                                    <DafChip
                                        v-for="chip in filterChips"
                                        :key="chip.value"
                                        :selected="
                                            manufacturerFilter === chip.value
                                        "
                                        @click="
                                            setManufacturerFilter(chip.value)
                                        "
                                    >
                                        {{ chip.label }}
                                    </DafChip>
                                </div>
                            </div>

                            <div
                                class="overflow-hidden rounded-dafLg border border-daf-border bg-daf-surface-card shadow-dafCard"
                            >
                                <div class="overflow-x-auto">
                                    <div class="min-w-[820px]">
                                        <div
                                            class="hotlist-grid bg-daf-surface-alt px-[18px] py-3"
                                        >
                                            <span />
                                            <button
                                                :data-dir="
                                                    sortDirection('type')
                                                "
                                                class="hotlist-th"
                                                type="button"
                                                aria-label="Sort by node type"
                                                @click="sortBy('type', 'asc')"
                                            >
                                                Node
                                                <DafIcon
                                                    class="hotlist-arrow"
                                                    name="chevron-down"
                                                    size="13"
                                                    stroke="2.4"
                                                />
                                            </button>
                                            <button
                                                :data-dir="
                                                    sortDirection('city')
                                                "
                                                class="hotlist-th"
                                                type="button"
                                                aria-label="Sort by location"
                                                @click="sortBy('city', 'asc')"
                                            >
                                                Location
                                                <DafIcon
                                                    class="hotlist-arrow"
                                                    name="chevron-down"
                                                    size="13"
                                                    stroke="2.4"
                                                />
                                            </button>
                                            <span class="hotlist-th-static">
                                                Manufacturer
                                            </span>
                                            <button
                                                :data-dir="
                                                    sortDirection('updated')
                                                "
                                                class="hotlist-th"
                                                type="button"
                                                aria-label="Sort by OSM update date"
                                                @click="
                                                    sortBy('updated', 'desc')
                                                "
                                            >
                                                Updated
                                                <DafIcon
                                                    class="hotlist-arrow"
                                                    name="chevron-down"
                                                    size="13"
                                                    stroke="2.4"
                                                />
                                            </button>
                                            <span class="hotlist-th-static">
                                                By
                                            </span>
                                            <span />
                                        </div>

                                        <div role="list">
                                            <button
                                                v-for="row in visibleRows"
                                                :key="row.id"
                                                :aria-pressed="
                                                    row.id === selectedNodeId
                                                "
                                                :class="rowClasses(row)"
                                                type="button"
                                                role="listitem"
                                                @click="selectNode(row)"
                                            >
                                                <span
                                                    :class="
                                                        dotClasses(row.type)
                                                    "
                                                />
                                                <span class="min-w-0">
                                                    <span
                                                        class="block text-daf-body-sm font-semibold leading-tight text-daf-text-primary"
                                                    >
                                                        {{ row.typeLabel }}
                                                    </span>
                                                    <span
                                                        class="block font-mono text-daf-caption leading-[1.4] text-daf-text-tertiary"
                                                    >
                                                        {{ row.osm }}
                                                    </span>
                                                </span>
                                                <span class="min-w-0">
                                                    <span
                                                        class="block text-pretty text-daf-body-sm font-medium leading-tight text-daf-text-primary"
                                                    >
                                                        {{ row.street }}
                                                    </span>
                                                    <span
                                                        class="block text-daf-caption leading-[1.4] text-daf-text-tertiary"
                                                    >
                                                        {{ row.city }}
                                                    </span>
                                                </span>
                                                <span class="min-w-0">
                                                    <DafBadge
                                                        class="max-w-full overflow-hidden"
                                                        tone="neutral"
                                                        size="sm"
                                                        :title="
                                                            row.manufacturer
                                                        "
                                                    >
                                                        <span
                                                            class="min-w-0 truncate"
                                                        >
                                                            {{
                                                                row.manufacturer
                                                            }}
                                                        </span>
                                                    </DafBadge>
                                                </span>
                                                <span
                                                    class="whitespace-nowrap font-mono text-daf-body-sm text-daf-text-secondary"
                                                >
                                                    {{ row.updatedLabel }}
                                                </span>
                                                <span
                                                    class="truncate whitespace-nowrap font-mono text-daf-body-sm text-daf-text-tertiary"
                                                >
                                                    {{ row.contributor }}
                                                </span>
                                                <DafIcon
                                                    class="text-daf-text-tertiary"
                                                    name="chevron-right"
                                                    size="16"
                                                />
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div
                                    v-if="visibleRows.length === 0"
                                    class="border-t border-daf-border px-6 py-14 text-center"
                                >
                                    <span
                                        class="mb-3.5 inline-flex size-[46px] items-center justify-center rounded-dafMd bg-daf-surface-alt text-daf-text-tertiary"
                                    >
                                        <DafIcon name="search" size="22" />
                                    </span>
                                    <div
                                        class="mb-1.5 font-display text-daf-h3 font-semibold tracking-[var(--ls-heading)]"
                                    >
                                        Nothing on the list
                                    </div>
                                    <p
                                        class="m-0 mb-4 text-daf-body text-daf-text-secondary"
                                    >
                                        No nodes match these filters in this
                                        time window.
                                    </p>
                                    <DafButton
                                        variant="secondary"
                                        @click="resetFilters"
                                    >
                                        Clear filters
                                    </DafButton>
                                </div>
                            </div>

                            <div
                                class="mt-4 flex flex-wrap items-center justify-between gap-3"
                            >
                                <div
                                    class="flex min-w-0 flex-wrap items-center gap-x-3.5 gap-y-2"
                                >
                                    <span
                                        class="whitespace-nowrap text-daf-body-sm text-daf-text-tertiary"
                                    >
                                        {{ countLabel }}
                                    </span>
                                    <span
                                        class="inline-flex items-center gap-1.5 text-daf-caption text-daf-text-tertiary"
                                    >
                                        <DafIcon name="map-pin" size="14" />
                                        Data from OpenStreetMap contributors
                                    </span>
                                </div>

                                <div
                                    v-if="totalPages > 1"
                                    class="flex flex-wrap items-center gap-1.5"
                                >
                                    <button
                                        class="hotlist-page"
                                        type="button"
                                        :disabled="currentPage <= 1"
                                        aria-label="Previous page"
                                        @click="prevPage"
                                    >
                                        <DafIcon
                                            name="chevron-left"
                                            size="16"
                                        />
                                    </button>
                                    <button
                                        v-for="paginationLink in paginationLinks"
                                        :key="paginationLink.key"
                                        :data-sel="
                                            paginationLink.page === currentPage
                                                ? '1'
                                                : '0'
                                        "
                                        class="hotlist-page"
                                        type="button"
                                        :aria-label="
                                            paginationLink.ellipsis
                                                ? 'More pages'
                                                : `Go to page ${paginationLink.label}`
                                        "
                                        :disabled="paginationLink.ellipsis"
                                        @click="setPageFromLink(paginationLink)"
                                    >
                                        {{ paginationLink.label }}
                                    </button>
                                    <button
                                        class="hotlist-page"
                                        type="button"
                                        :disabled="currentPage >= totalPages"
                                        aria-label="Next page"
                                        @click="nextPage"
                                    >
                                        <DafIcon
                                            name="chevron-right"
                                            size="16"
                                        />
                                    </button>
                                </div>
                            </div>
                        </div>

                        <aside
                            class="overflow-hidden rounded-dafLg border border-daf-border bg-daf-surface-card shadow-dafCard lg:sticky lg:top-[88px]"
                        >
                            <div
                                class="flex items-center justify-between gap-2.5 border-b border-daf-border px-4 py-3.5"
                            >
                                <span
                                    class="font-display text-daf-body-lg font-bold tracking-[var(--ls-heading)]"
                                >
                                    Locator
                                </span>
                                <span
                                    class="text-daf-caption text-daf-text-tertiary"
                                >
                                    {{ mapCountLabel }}
                                </span>
                            </div>

                            <div class="relative h-80">
                                <div
                                    ref="mapContainer"
                                    class="hotlist-map absolute inset-0"
                                    aria-hidden="true"
                                />
                                <div
                                    v-if="mapStatus"
                                    class="absolute inset-0 z-10 flex items-center justify-center bg-daf-surface-alt px-5 text-center text-daf-body-sm font-semibold text-daf-text-secondary"
                                >
                                    {{ mapStatus }}
                                </div>
                            </div>

                            <div
                                v-if="selectedNode"
                                class="border-t border-daf-border p-4"
                            >
                                <div class="mb-3 flex items-start gap-2.5">
                                    <span
                                        :class="[
                                            dotClasses(selectedNode.type),
                                            'mt-1.5 shrink-0',
                                        ]"
                                    />
                                    <div class="min-w-0">
                                        <div
                                            class="text-daf-body font-semibold leading-tight text-daf-text-primary"
                                        >
                                            {{ selectedNode.typeLabel }}
                                        </div>
                                        <div
                                            class="mt-1 text-pretty text-daf-body-sm leading-snug text-daf-text-secondary"
                                        >
                                            {{ selectedNode.street }},
                                            {{ selectedNode.city }}
                                        </div>
                                        <div
                                            class="mt-1 font-mono text-daf-caption text-daf-text-tertiary"
                                        >
                                            {{ selectedNodeCoordinateLabel }}
                                        </div>
                                    </div>
                                </div>
                                <DafButton
                                    :href="selectedNodeMapHref"
                                    variant="secondary"
                                    size="sm"
                                    full-width
                                >
                                    Open on full map
                                </DafButton>
                            </div>

                            <div
                                v-else
                                class="flex flex-col gap-2.5 border-t border-daf-border p-4"
                            >
                                <div class="flex flex-wrap items-center gap-4">
                                    <span
                                        class="inline-flex items-center gap-1.5 text-daf-body-sm text-daf-text-secondary"
                                    >
                                        <span :class="dotClasses('alpr')" />
                                        ALPR
                                    </span>
                                    <span
                                        class="inline-flex items-center gap-1.5 text-daf-body-sm text-daf-text-secondary"
                                    >
                                        <span :class="dotClasses('camera')" />
                                        Camera
                                    </span>
                                </div>
                                <span
                                    class="text-daf-caption text-daf-text-tertiary"
                                >
                                    Select a row to locate it on the map.
                                </span>
                            </div>
                        </aside>
                    </div>
                </div>
            </section>
        </main>

        <DafSiteFooter :links="footerLinks" />
    </div>
</template>

<script setup>
import DafBadge from '@/Components/Daf/DafBadge.vue';
import DafButton from '@/Components/Daf/DafButton.vue';
import DafChip from '@/Components/Daf/DafChip.vue';
import DafIcon from '@/Components/Daf/DafIcon.vue';
import DafSegmentedControl from '@/Components/Daf/DafSegmentedControl.vue';
import DafSiteFooter from '@/Components/Daf/DafSiteFooter.vue';
import DafSiteHeader from '@/Components/Daf/DafSiteHeader.vue';
import { Head, router } from '@inertiajs/vue3';
import mapboxgl from 'mapbox-gl';
import {
    computed,
    nextTick,
    onBeforeUnmount,
    onMounted,
    ref,
    shallowRef,
    watch,
} from 'vue';

const props = defineProps({
    nodes: {
        type: Object,
        default: () => ({
            currentPage: 1,
            data: [],
            from: null,
            lastPage: 1,
            perPage: 25,
            to: null,
            total: 0,
        }),
    },
    filters: {
        type: Object,
        default: () => ({
            direction: 'desc',
            manufacturer: 'all',
            query: '',
            sort: 'updated',
            window: '7',
        }),
    },
    stats: {
        type: Array,
        default: () => [],
    },
    manufacturerCounts: {
        type: Object,
        default: () => ({
            all: 0,
            flock: 0,
            other: 0,
        }),
    },
    latestSyncedAt: {
        type: String,
        default: null,
    },
    canLogin: {
        type: Boolean,
        default: false,
    },
    canRegister: {
        type: Boolean,
        default: false,
    },
    user: {
        type: Object,
        default: () => null,
    },
});

const accessToken = import.meta.env.VITE_MAPBOX_TOKEN;
const HOTLIST_SOURCE_ID = 'source-hotlist-nodes';
const HOTLIST_HALO_LAYER_ID = 'hotlist-node-halos';
const HOTLIST_DOT_LAYER_ID = 'hotlist-node-dots';
const HOTLIST_MAP_STYLE = 'mapbox://styles/mapbox/standard';
const MAP_LAYER_EMISSIVE_STRENGTH = 1;

const headerLinks = [
    { label: 'John Doe', href: '/#johndoe' },
    { label: 'How it works', href: '/#how' },
    { label: 'Android Auto', href: '/#android-auto' },
    { label: 'Apps', href: '/#apps' },
    { label: 'FAQ', href: '/#faq' },
    { label: 'Hotlist', href: '/hotlist' },
    { label: 'Contribute', href: '/help' },
];

const footerLinks = [
    { label: 'How it works', href: '/#how' },
    { label: 'Full map', href: '/map' },
    { label: 'Apps', href: '/#apps' },
    { label: 'FAQ', href: '/#faq' },
    { label: 'Help', href: '/help' },
];

const timeWindowOptions = [
    { value: '24', label: '24h' },
    { value: '7', label: '7 days' },
    { value: '30', label: '30 days' },
];

const numberFormatter = new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 0,
});
const mapContainer = ref(null);
const miniMap = shallowRef(null);
const mapIsLoaded = ref(false);
const mapStatus = ref('Loading map');
const timeWindow = ref(props.filters.window);
const manufacturerFilter = ref(props.filters.manufacturer);
const sortKey = ref(props.filters.sort);
const sortDir = ref(props.filters.direction);
const selectedNodeId = ref(null);

let filtersAreSyncing = false;

const hotlistNodes = computed(() =>
    (props.nodes.data ?? []).map(normalizeNode).filter((node) => node !== null),
);

const manufacturerCounts = computed(() => ({
    all: Number(props.manufacturerCounts.all ?? 0),
    flock: Number(props.manufacturerCounts.flock ?? 0),
    other: Number(props.manufacturerCounts.other ?? 0),
}));

const filterChips = computed(() =>
    [
        {
            value: 'all',
            label: `All · ${formatNumber(manufacturerCounts.value.all)}`,
            count: manufacturerCounts.value.all,
        },
        {
            value: 'flock',
            label: `Flock · ${formatNumber(manufacturerCounts.value.flock)}`,
            count: manufacturerCounts.value.flock,
        },
        {
            value: 'other',
            label: `Other vendors · ${formatNumber(manufacturerCounts.value.other)}`,
            count: manufacturerCounts.value.other,
        },
    ].filter((chip) => chip.count > 0),
);

const totalPages = computed(() =>
    Math.max(1, Number(props.nodes.lastPage ?? 1)),
);

const currentPage = computed(() =>
    Math.min(
        Math.max(1, Number(props.nodes.currentPage ?? 1)),
        totalPages.value,
    ),
);

const visibleRows = computed(() =>
    hotlistNodes.value.map((node) => ({
        ...node,
        updatedLabel: relativeTime(node.updatedTimestamp),
    })),
);

const paginationLinks = computed(() =>
    lengthAwarePaginationLinks(currentPage.value, totalPages.value),
);

const selectedNode = computed(
    () =>
        visibleRows.value.find((row) => row.id === selectedNodeId.value) ??
        null,
);

const selectedNodeCoordinateLabel = computed(() => {
    if (!selectedNode.value) {
        return '';
    }

    const [longitude, latitude] = selectedNode.value.coordinates;

    return `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
});

const selectedNodeMapHref = computed(() => {
    if (!selectedNode.value) {
        return '/map';
    }

    const [longitude, latitude] = selectedNode.value.coordinates;
    const params = new URLSearchParams();

    params.set('marker', selectedNode.value.mapMarkerId);
    params.set('lat', String(latitude));
    params.set('lng', String(longitude));

    if (selectedNode.value.osmId) {
        params.set('osm_id', selectedNode.value.osmId);
    }

    return `/map?${params.toString()}`;
});

const countLabel = computed(() => {
    const total = Number(props.nodes.total ?? 0);

    if (total === 0) {
        return '0 nodes';
    }

    const start = props.nodes.from ?? 0;
    const end = props.nodes.to ?? 0;

    return `Showing ${start}-${end} of ${total} ${total === 1 ? 'node' : 'nodes'}`;
});

const mapCountLabel = computed(() => {
    const count = visibleRows.value.length;

    return count === 1 ? '1 pin' : `${count} pins`;
});

const syncedLabel = computed(() => {
    const timestamp = timestampFor(props.latestSyncedAt);

    if (!timestamp) {
        return 'Awaiting sync';
    }

    return `Synced ${relativeTime(timestamp)}`;
});

const statTiles = computed(() =>
    props.stats.map((stat) => ({
        ...stat,
        value: formatNumber(stat.value),
    })),
);

onMounted(() => {
    initializeHotlistMap();
});

onBeforeUnmount(() => {
    miniMap.value?.remove();
    miniMap.value = null;
});

watch(timeWindow, () => {
    if (filtersAreSyncing) {
        return;
    }

    visitHotlist({ page: 1, window: timeWindow.value });
});

watch(
    () => props.filters,
    (filters) => {
        filtersAreSyncing = true;
        timeWindow.value = filters.window;
        manufacturerFilter.value = filters.manufacturer;
        sortKey.value = filters.sort;
        sortDir.value = filters.direction;

        nextTick(() => {
            filtersAreSyncing = false;
        });
    },
    { deep: true },
);

watch(
    () => props.nodes.data,
    () => {
        selectedNodeId.value = null;
    },
);

watch([visibleRows, selectedNodeId], () => {
    refreshHotlistMap();
});

function initializeHotlistMap() {
    if (!mapContainer.value) {
        return;
    }

    if (!accessToken) {
        mapStatus.value = 'Map preview unavailable';

        return;
    }

    mapboxgl.accessToken = accessToken;

    const instance = new mapboxgl.Map({
        attributionControl: false,
        bearing: 0,
        boxZoom: false,
        center: initialMapCenter(),
        container: mapContainer.value,
        cooperativeGestures: false,
        doubleClickZoom: false,
        dragPan: false,
        dragRotate: false,
        interactive: false,
        keyboard: false,
        maxPitch: 0,
        minPitch: 0,
        pitch: 0,
        pitchWithRotate: false,
        scrollZoom: false,
        style: HOTLIST_MAP_STYLE,
        touchZoomRotate: false,
        zoom: 11,
    });

    instance.scrollZoom.disable();
    instance.boxZoom.disable();
    instance.dragRotate.disable();
    instance.dragPan.disable();
    instance.keyboard.disable();
    instance.doubleClickZoom.disable();
    instance.touchZoomRotate.disable();
    instance.touchPitch?.disable();

    instance.addControl(
        new mapboxgl.AttributionControl({
            compact: true,
        }),
        'bottom-right',
    );

    miniMap.value = instance;

    instance.on('load', () => {
        mapIsLoaded.value = true;
        mapStatus.value = '';
        addHotlistMapLayers(instance);
        refreshHotlistMap();
    });

    instance.on('error', () => {
        if (!mapIsLoaded.value) {
            mapStatus.value = 'Map preview unavailable';
        }
    });
}

function addHotlistMapLayers(instance) {
    if (instance.getSource(HOTLIST_SOURCE_ID)) {
        return;
    }

    const colors = hotlistMapColors();

    instance.addSource(HOTLIST_SOURCE_ID, {
        type: 'geojson',
        data: hotlistFeatureCollection(),
    });

    instance.addLayer({
        id: HOTLIST_HALO_LAYER_ID,
        type: 'circle',
        source: HOTLIST_SOURCE_ID,
        paint: {
            'circle-color': [
                'case',
                ['==', ['get', 'type'], 'alpr'],
                colors.alpr,
                colors.camera,
            ],
            'circle-emissive-strength': MAP_LAYER_EMISSIVE_STRENGTH,
            'circle-opacity': [
                'case',
                ['boolean', ['get', 'selected'], false],
                0.22,
                0.1,
            ],
            'circle-radius': [
                'case',
                ['boolean', ['get', 'selected'], false],
                18,
                8,
            ],
        },
    });

    instance.addLayer({
        id: HOTLIST_DOT_LAYER_ID,
        type: 'circle',
        source: HOTLIST_SOURCE_ID,
        paint: {
            'circle-color': [
                'case',
                ['==', ['get', 'type'], 'alpr'],
                colors.alpr,
                colors.camera,
            ],
            'circle-emissive-strength': MAP_LAYER_EMISSIVE_STRENGTH,
            'circle-radius': [
                'case',
                ['boolean', ['get', 'selected'], false],
                7,
                5,
            ],
            'circle-stroke-color': colors.surface,
            'circle-stroke-width': [
                'case',
                ['boolean', ['get', 'selected'], false],
                3,
                2,
            ],
        },
    });
}

function refreshHotlistMap() {
    if (!mapIsLoaded.value || !miniMap.value) {
        return;
    }

    const source = miniMap.value.getSource(HOTLIST_SOURCE_ID);

    source?.setData(hotlistFeatureCollection());

    nextTick(() => {
        focusHotlistMap();
    });
}

function focusHotlistMap() {
    const instance = miniMap.value;

    if (!instance || visibleRows.value.length === 0) {
        return;
    }

    const duration = prefersReducedMotion() ? 0 : 350;

    if (selectedNode.value) {
        instance.easeTo({
            center: selectedNode.value.coordinates,
            duration,
            essential: true,
            zoom: Math.max(instance.getZoom(), 13.4),
        });

        return;
    }

    if (visibleRows.value.length === 1) {
        instance.easeTo({
            center: visibleRows.value[0].coordinates,
            duration,
            essential: true,
            zoom: 12.4,
        });

        return;
    }

    const bounds = new mapboxgl.LngLatBounds();

    visibleRows.value.forEach((row) => bounds.extend(row.coordinates));

    instance.fitBounds(bounds, {
        duration,
        maxZoom: 12.8,
        padding: {
            bottom: 52,
            left: 44,
            right: 44,
            top: 52,
        },
    });
}

function hotlistFeatureCollection() {
    return {
        type: 'FeatureCollection',
        features: visibleRows.value.map((row) => ({
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: row.coordinates,
            },
            properties: {
                id: row.id,
                selected: row.id === selectedNodeId.value,
                type: row.type,
            },
        })),
    };
}

function initialMapCenter() {
    return visibleRows.value[0]?.coordinates ?? [-98.5795, 39.8283];
}

function selectNode(row) {
    selectedNodeId.value = row.id;
}

function setManufacturerFilter(manufacturer) {
    if (manufacturerFilter.value === manufacturer) {
        return;
    }

    manufacturerFilter.value = manufacturer;
    visitHotlist({ manufacturer, page: 1 });
}

function resetFilters() {
    timeWindow.value = '30';
    manufacturerFilter.value = 'all';
    sortKey.value = 'updated';
    sortDir.value = 'desc';
    visitHotlist({
        direction: 'desc',
        manufacturer: 'all',
        page: 1,
        sort: 'updated',
        window: '30',
    });
}

function setPage(pageNumber) {
    visitHotlist({ page: pageNumber });
}

function setPageFromLink(paginationLink) {
    if (paginationLink.ellipsis) {
        return;
    }

    setPage(paginationLink.page);
}

function prevPage() {
    setPage(Math.max(1, currentPage.value - 1));
}

function nextPage() {
    setPage(Math.min(totalPages.value, currentPage.value + 1));
}

function sortBy(key, defaultDirection) {
    let nextDirection = defaultDirection;

    if (sortKey.value === key) {
        nextDirection = sortDir.value === 'asc' ? 'desc' : 'asc';
    }

    sortKey.value = key;
    sortDir.value = nextDirection;
    visitHotlist({ direction: nextDirection, page: 1, sort: key });
}

function sortDirection(key) {
    return sortKey.value === key ? sortDir.value : 'none';
}

function visitHotlist(overrides = {}) {
    selectedNodeId.value = null;

    const params = {
        direction: overrides.direction ?? sortDir.value,
        manufacturer: overrides.manufacturer ?? manufacturerFilter.value,
        page: overrides.page ?? currentPage.value,
        sort: overrides.sort ?? sortKey.value,
        window: overrides.window ?? timeWindow.value,
    };

    router.get('/hotlist', params, {
        preserveScroll: true,
        preserveState: true,
        replace: true,
    });
}

function lengthAwarePaginationLinks(current, total) {
    if (total <= 7) {
        return Array.from({ length: total }, (_, index) => pageLink(index + 1));
    }

    const numbers = new Set([1, total, current - 1, current, current + 1]);

    if (current <= 4) {
        [2, 3, 4, 5].forEach((pageNumber) => numbers.add(pageNumber));
    }

    if (current >= total - 3) {
        [total - 4, total - 3, total - 2, total - 1].forEach((pageNumber) =>
            numbers.add(pageNumber),
        );
    }

    const sortedNumbers = [...numbers]
        .filter((pageNumber) => pageNumber >= 1 && pageNumber <= total)
        .sort((first, second) => first - second);

    return sortedNumbers.flatMap((pageNumber, index) => {
        const previousPage = sortedNumbers[index - 1] ?? null;
        const link = pageLink(pageNumber);

        if (previousPage !== null && pageNumber - previousPage > 1) {
            return [ellipsisLink(previousPage, pageNumber), link];
        }

        return [link];
    });
}

function pageLink(pageNumber) {
    return {
        key: `page-${pageNumber}`,
        label: formatNumber(pageNumber),
        page: pageNumber,
        ellipsis: false,
    };
}

function ellipsisLink(previousPage, nextPage) {
    return {
        key: `ellipsis-${previousPage}-${nextPage}`,
        label: '...',
        page: null,
        ellipsis: true,
    };
}

function formatNumber(value) {
    const normalizedValue =
        typeof value === 'string' ? value.replaceAll(',', '') : value;
    const number = Number(normalizedValue ?? 0);

    return numberFormatter.format(Number.isFinite(number) ? number : 0);
}

function rowClasses(row) {
    return [
        'hotlist-grid w-full border-0 border-t border-daf-border px-[18px] py-3.5 text-left font-ui text-daf-text-primary transition-colors',
        row.id === selectedNodeId.value
            ? 'bg-[var(--brand-soft)]'
            : 'bg-transparent hover:bg-daf-surface-alt',
    ];
}

function dotClasses(type) {
    return [
        'block size-[9px] rounded-full',
        type === 'alpr'
            ? 'bg-daf-alert shadow-[0_0_0_4px_rgba(255,77,79,0.14)]'
            : 'bg-daf-warning shadow-[0_0_0_4px_rgba(255,176,46,0.16)]',
    ];
}

function normalizeNode(node) {
    const coordinates = Array.isArray(node.coordinates)
        ? node.coordinates.map((coordinate) => Number(coordinate))
        : [];

    if (
        coordinates.length < 2 ||
        !Number.isFinite(coordinates[0]) ||
        !Number.isFinite(coordinates[1])
    ) {
        return null;
    }

    const updatedTimestamp = timestampFor(
        node.updatedAt ?? node.osmUpdatedAt ?? node.addedAt,
    );
    const syncedTimestamp = timestampFor(node.syncedAt);
    const id = String(node.id);
    const osmId = String(node.osmId ?? '');
    const type = node.type === 'alpr' ? 'alpr' : 'camera';

    return {
        id,
        mapMarkerId: `osm-node-${id}`,
        osm: String(node.osm ?? (osmId ? `node/${osmId}` : 'node/unknown')),
        osmId,
        type,
        typeLabel:
            node.typeLabel ??
            (type === 'alpr' ? 'ALPR reader' : 'Traffic camera'),
        manufacturer: String(node.manufacturer ?? node.operator ?? 'Unknown'),
        street: String(node.street ?? 'Unlabeled node'),
        city: String(node.city ?? 'OpenStreetMap node'),
        contributor: String(node.contributor ?? 'OSM'),
        coordinates,
        updatedTimestamp,
        syncedTimestamp,
    };
}

function timestampFor(value) {
    if (!value) {
        return null;
    }

    const timestamp = Date.parse(value);

    return Number.isFinite(timestamp) ? timestamp : null;
}

function relativeTime(timestamp) {
    if (timestamp === null) {
        return 'unknown';
    }

    const hours = Math.max(0, Math.round((Date.now() - timestamp) / 3600000));

    if (hours < 1) {
        return 'just now';
    }

    if (hours < 24) {
        return `${hours}h ago`;
    }

    if (hours < 48) {
        return 'yesterday';
    }

    return `${Math.floor(hours / 24)}d ago`;
}

function hotlistMapColors() {
    return {
        alpr: cssVar('--marker-alpr', '#FF4D4F'),
        camera: cssVar('--node-monitored', '#FFB02E'),
        surface: cssVar('--surface-marker', '#FFFFFF'),
    };
}

function cssVar(name, fallback) {
    if (typeof window === 'undefined') {
        return fallback;
    }

    const value = window
        .getComputedStyle(document.documentElement)
        .getPropertyValue(name)
        .trim();

    return value || fallback;
}

function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
</script>

<style scoped>
.hotlist-grid {
    align-items: center;
    column-gap: 14px;
    display: grid;
    grid-template-columns:
        22px minmax(140px, 1.35fr) minmax(170px, 1.6fr)
        minmax(110px, 0.9fr) 90px minmax(96px, 0.9fr) 16px;
}

.hotlist-th {
    align-items: center;
    background: transparent;
    border: 0;
    color: var(--text-tertiary);
    cursor: pointer;
    display: inline-flex;
    font-family: var(--font-ui);
    font-size: var(--fs-label);
    font-weight: var(--fw-bold);
    gap: 5px;
    letter-spacing: var(--ls-label);
    padding: 0;
    text-transform: uppercase;
    transition: color var(--dur-base) var(--ease-standard);
    white-space: nowrap;
}

.hotlist-th:hover,
.hotlist-th[data-dir='asc'],
.hotlist-th[data-dir='desc'] {
    color: var(--text-secondary);
}

.hotlist-arrow {
    opacity: 0;
    transition:
        opacity var(--dur-base) var(--ease-standard),
        transform var(--dur-base) var(--ease-standard);
}

.hotlist-th[data-dir='asc'] .hotlist-arrow,
.hotlist-th[data-dir='desc'] .hotlist-arrow {
    color: var(--text-brand);
    opacity: 1;
}

.hotlist-th[data-dir='asc'] .hotlist-arrow {
    transform: rotate(180deg);
}

.hotlist-th-static {
    color: var(--text-tertiary);
    font-family: var(--font-ui);
    font-size: var(--fs-label);
    font-weight: var(--fw-bold);
    letter-spacing: var(--ls-label);
    text-transform: uppercase;
    white-space: nowrap;
}

.hotlist-page {
    align-items: center;
    background: var(--surface-card);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text-secondary);
    cursor: pointer;
    display: inline-flex;
    font-family: var(--font-ui);
    font-size: var(--fs-body-sm);
    font-variant-numeric: tabular-nums;
    font-weight: var(--fw-semibold);
    height: 34px;
    justify-content: center;
    min-width: 34px;
    padding: 0 9px;
    transition:
        background var(--dur-base) var(--ease-standard),
        border-color var(--dur-base) var(--ease-standard),
        color var(--dur-base) var(--ease-standard);
}

.hotlist-page:hover:not(:disabled) {
    border-color: var(--text-brand);
    color: var(--text-brand);
}

.hotlist-page:disabled {
    cursor: default;
    opacity: 0.4;
}

.hotlist-page[data-sel='1'] {
    background: var(--brand-soft);
    border-color: var(--text-brand);
    color: var(--text-brand);
}

.hotlist-map {
    min-height: 100%;
}

.hotlist-map :deep(.mapboxgl-canvas-container),
.hotlist-map :deep(.mapboxgl-canvas) {
    cursor: default !important;
}

.hotlist-map :deep(.mapboxgl-ctrl-logo),
.hotlist-map :deep(.mapboxgl-ctrl-attrib) {
    opacity: 0.62;
}

@keyframes hotlist-pulse {
    0% {
        opacity: 0.5;
        transform: scale(1);
    }

    70%,
    100% {
        opacity: 0;
        transform: scale(2.6);
    }
}

@media (prefers-reduced-motion: no-preference) {
    .hotlist-live {
        animation: hotlist-pulse 2.4s var(--ease-standard) infinite;
    }
}
</style>
