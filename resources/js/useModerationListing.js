import { router, useForm, usePage } from '@inertiajs/vue3';
import {
    computed,
    inject,
    onBeforeUnmount,
    onMounted,
    reactive,
    ref,
    toRefs,
    watch,
} from 'vue';
import { filterQuery, moderationPageRoute } from './moderation.js';
import { useModerationTime } from './useModerationTime.js';

export const moderationListingProps = {
    ruleOptions: { type: Array, default: () => [] },
    filters: Object,
    records: Object,
    profile: Object,
    weeks: Array,
    areas: Array,
    counts: Object,
    source: Object,
    osmUrl: String,
};
export function useModerationListing(props, view) {
    const { absoluteTime, localTime } = useModerationTime();
    const route = inject('route');

    const page = usePage();
    const isClient = ref(false);
    const state = reactive({});
    const loading = ref(false);
    const areaSearch = ref('');
    const matchingAreas = computed(() =>
        props.areas.filter((area) =>
            area.name.toLowerCase().includes(areaSearch.value.toLowerCase()),
        ),
    );
    const selectedArea = computed(() =>
        props.areas.find((area) => String(area.id) === String(state.area)),
    );
    function selectArea(id) {
        areaSearch.value = '';
        apply({ area: id, area_scope: '' });
    }

    const expanded = ref(null);
    const details = reactive({});
    const detailErrors = reactive({});
    const detailLoading = reactive({});
    const selectedNodes = reactive({});
    const areaDialog = ref(false);
    const removeArea = ref(null);
    const actionBusy = ref(false);
    const dismissingFlag = ref(null);
    const review = useForm({ revision: '', status: '' });
    let timer;
    const requests = new Map();
    onMounted(() => {
        isClient.value = true;
    });
    const title = computed(
        () =>
            ({
                changesets: 'Changesets',
                nodes: 'ALPR nodes',
                flagged: 'Flagged nodes',
                editors: 'Editors',
                areas: 'Areas',
                audit: 'Audit log',
                profile: props.profile?.name || 'Editor profile',
            })[view],
    );
    const descriptions = {
        changesets:
            'Every OpenStreetMap edit that touches a surveillance node, as it lands.',
        nodes: 'Every ALPR node on the map, as OpenStreetMap has it. Open a node for its full history.',
        flagged:
            'Rule flags and unverified driver reports, available for review.',
        editors:
            'The people editing the surveillance map, and the edits they leave behind.',
        areas: 'Shared boundaries. Subscribe to keep the places you care about close.',
        audit: 'A record of moderation decisions and changes to watched areas.',
    };
    const isChangesets = computed(() =>
        ['changesets', 'profile'].includes(view),
    );
    const isNodes = computed(() => ['nodes', 'flagged'].includes(view));
    const groups = computed(() =>
        ['nodes', 'flagged', 'editors'].includes(view)
            ? []
            : [
                  {
                      key: 'kinds',
                      label: 'Changes',
                      options: ['added', 'modified', 'deleted'],
                  },
              ],
    );
    const filtersActive = computed(() =>
        Object.keys(filterQuery(state)).some(
            (key) => !['view', 'uid', 'page', 'sort', 'order'].includes(key),
        ),
    );
    watch(
        () => [view, props.filters],
        () => {
            clearTimeout(timer);
            areaSearch.value = '';
            Object.keys(state).forEach((key) => delete state[key]);
            Object.assign(state, { area: '', window: '' }, props.filters);
            expanded.value = null;
            review.clearErrors();
            for (const request of requests.values()) request.abort();
            requests.clear();
            for (const cache of [
                details,
                detailErrors,
                detailLoading,
                selectedNodes,
            ])
                Object.keys(cache).forEach((key) => delete cache[key]);
        },
        { immediate: true },
    );
    function apply(extra = {}) {
        clearTimeout(timer);
        Object.assign(state, { page: 1 }, extra);
        const filters = filterQuery(state);
        if (view === 'profile') delete filters.uid;
        router.get(
            moderationPageRoute(
                route,
                view,
                view === 'profile' ? { uid: props.filters.uid } : {},
            ),
            filters,
            {
                preserveState: true,
                preserveScroll: true,
                replace: true,
                onStart: () => (loading.value = true),
                onFinish: () => (loading.value = false),
            },
        );
    }
    function debounce() {
        clearTimeout(timer);
        timer = setTimeout(() => apply(), 400);
    }
    function toggle(key, value) {
        const selected = state[key] || [];
        state[key] = selected.includes(value)
            ? selected.filter((item) => item !== value)
            : [...selected, value];
        apply();
    }
    function clear() {
        const uid = state.uid;
        Object.keys(state).forEach((key) => delete state[key]);
        Object.assign(state, {
            area: '',
            window: '',
            ...(uid ? { uid } : {}),
        });
        apply();
    }
    function sort(key) {
        apply({
            sort: key,
            order:
                state.sort === key && state.order === 'desc' ? 'asc' : 'desc',
        });
    }
    function query(view, extras = {}) {
        return moderationPageRoute(route, view, extras);
    }
    function osm(path) {
        return `${props.osmUrl}${path}`;
    }
    function rowKey(row) {
        return `${view}:${row.id}`;
    }
    async function loadDetails(row, url) {
        const key = rowKey(row);
        requests.get(key)?.abort();
        const request = new AbortController();
        requests.set(key, request);
        detailLoading[key] = true;
        delete detailErrors[key];
        try {
            const response = await fetch(
                url ||
                    (view === 'areas'
                        ? route('moderation.areas.show', row.id)
                        : isNodes.value
                          ? route('moderation.nodes.show', row.id)
                          : route('moderation.changesets.show', row.id)),
                {
                    headers: { Accept: 'application/json' },
                    signal: request.signal,
                },
            );
            const data = await response.json();
            if (!response.ok)
                throw new Error(
                    data.message ||
                        'Details could not be loaded. Please try again.',
                );
            details[key] = data;
        } catch (error) {
            if (error.name !== 'AbortError') detailErrors[key] = error.message;
        } finally {
            detailLoading[key] = false;
            requests.delete(key);
        }
    }
    function expand(row) {
        const key = rowKey(row);
        expanded.value = expanded.value === key ? null : key;
        if (
            expanded.value &&
            (isChangesets.value || isNodes.value || view === 'areas') &&
            !details[key]
        )
            loadDetails(row);
    }
    watch(
        () => [props.filters, props.records, isClient.value],
        () => {
            if (view !== 'changesets' || !props.filters?.changeset) return;
            const row = props.records?.data?.find(
                (row) => String(row.id) === String(props.filters.changeset),
            );
            if (!row) return;
            const key = rowKey(row);
            expanded.value = key;
            if (isClient.value && !details[key] && !detailLoading[key])
                loadDetails(row);
        },
        { immediate: true },
    );
    function saveReview(row, status) {
        if (review.processing) return;
        review.revision = row.revision;
        review.status = status;
        review.patch(
            route(
                isNodes.value
                    ? 'moderation.nodes.review'
                    : 'moderation.changesets.review',
                row.id,
            ),
            { preserveScroll: true },
        );
    }
    function dismissFlag(flag) {
        if (dismissingFlag.value !== null) return;
        dismissingFlag.value = flag.id;
        router.patch(
            route('moderation.flags.dismiss', flag.id),
            {
                evidence_hash: flag.evidence_hash,
            },
            {
                preserveScroll: true,
                onFinish: () => (dismissingFlag.value = null),
            },
        );
    }
    function subscribed(row) {
        return row.watchers?.some(
            (user) => user.id === page.props.auth.user.id,
        );
    }
    function areaAction(row, action) {
        if (actionBusy.value) return;
        const method = action === 'subscribe' ? 'post' : 'delete';
        router[method](
            route(`moderation.areas.${action}`, row.id),
            ...(method === 'post' ? [{}] : []),
            {
                preserveScroll: true,
                onStart: () => (actionBusy.value = true),
                onFinish: () => {
                    actionBusy.value = false;
                    removeArea.value = null;
                },
            },
        );
    }
    onBeforeUnmount(() => {
        clearTimeout(timer);
        for (const request of requests.values()) request.abort();
    });

    return {
        ...toRefs(props),
        view,
        title,
        descriptions,
        isChangesets,
        isNodes,
        groups,
        filtersActive,
        isClient,
        state,
        loading,
        areaSearch,
        matchingAreas,
        selectedArea,
        selectArea,
        expanded,
        details,
        detailErrors,
        detailLoading,
        selectedNodes,
        areaDialog,
        removeArea,
        actionBusy,
        dismissingFlag,
        review,
        apply,
        debounce,
        toggle,
        clear,
        sort,
        query,
        osm,
        rowKey,
        loadDetails,
        expand,
        saveReview,
        dismissFlag,
        subscribed,
        areaAction,
        page,
        route,
        absoluteTime,
        localTime,
    };
}
