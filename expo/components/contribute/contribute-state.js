import { router } from 'expo-router';
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { AppState } from 'react-native';
import { useAuth } from '../../lib/auth';
import {
    publishNodes,
    syncPublishedNodesToBackend,
} from '../../lib/osm/client';
import { getMarkerOsmNode } from '../../lib/osm/marker-node';
import { updatePinLocationInList } from '../../lib/osm/node-location';
import {
    buildPublishedNodeSyncPayload,
    getUploadedNodeIndex,
} from '../../lib/osm/published-node-sync';
import { addCrashlyticsLog } from '../../lib/crashlytics';
import { useSharedMapState } from '../map/shared-map-state';
import { useScorecard } from '../scorecard/scorecard-context';
import {
    clearStoredDraft,
    readCoachMarkDismissed,
    readStoredDraft,
    writeCoachMarkDismissed,
    writeStoredDraft,
} from './contribute-draft-storage';
import { getChangesetSummary } from './changeset-summary';
import { buildChangesetTags, buildNodeTags } from './osm-tags';
import { useContributeTour } from './use-contribute-tour';

const CONTRIBUTE_DRAFT_AUTOSAVE_DELAY_MS = 1000;

const ContributeContext = createContext(null);

function createDefaultChangeset() {
    return {
        comment: '',
        hashtags: '#flock #alpr #surveillance',
        source: 'survey',
    };
}

function createDefaultPinDetails() {
    return {
        directions: [],
        manufacturer: 'flock',
        preset: 'flock',
        staged: true,
        rawTags: [],
        extraTags: [],
        mount: 'pole',
        operator: '',
        type: 'alpr',
    };
}

function getStoredDraftSummary(storedDraft) {
    if (!storedDraft) {
        return null;
    }

    return {
        ...getChangesetSummary(storedDraft.pins, storedDraft.removals),
        pinCount: storedDraft.pins.length + (storedDraft.removals ?? []).length,
        updatedAt: storedDraft.updatedAt,
    };
}

function contributeDraftShouldPersist(contributeStatus, pins, removals = []) {
    return (
        contributeStatus !== 'idle' &&
        contributeStatus !== 'published' &&
        pins.filter((pin) => pin.details?.staged !== false).length +
            removals.length >
            0
    );
}

export function ContributeProvider({ children }) {
    const { ensureWriteAccess, openStreetMapAccessToken } = useAuth();
    const { upsertMarkerPoints, markerPoints = [] } = useSharedMapState();
    const markerPointsRef = useRef(markerPoints);
    markerPointsRef.current = markerPoints;
    const editingNodesRef = useRef(new Map());
    const cacheEditingNode = useCallback((node) => {
        if (node?.id) editingNodesRef.current.set(Number(node.id), node);
    }, []);
    const getEditingNode = useCallback((nodeId) => {
        const cached = editingNodesRef.current.get(Number(nodeId));
        if (cached) return cached;
        const marker = markerPointsRef.current.find(
            (point) =>
                Number(
                    String(point.properties?.osm_id ?? '').replace(
                        /^node\//,
                        '',
                    ),
                ) === Number(nodeId),
        );
        return getMarkerOsmNode(marker);
    }, []);
    const { recordPublishedCameras } = useScorecard();
    const [changeset, setChangeset] = useState(createDefaultChangeset);
    const [coachMarkIsDismissed, setCoachMarkIsDismissed] = useState(false);
    const [contributeStatus, setContributeStatus] = useState('idle');
    const tour = useContributeTour(contributeStatus);
    const [draftUpdatedAt, setDraftUpdatedAt] = useState(null);
    const [pins, setPins] = useState([]);
    const [removals, setRemovals] = useState([]);
    const [publishError, setPublishError] = useState(null);
    const [publishResult, setPublishResult] = useState(null);
    const [publishStatus, setPublishStatus] = useState('idle');
    const [storedDraftSummary, setStoredDraftSummary] = useState(null);
    const draftStateRef = useRef({
        changeset,
        contributeStatus,
        pins,
        removals,
    });
    const pinIdCounterRef = useRef(0);
    const publishIsInFlightRef = useRef(false);

    draftStateRef.current = { changeset, contributeStatus, pins, removals };

    useEffect(() => {
        let isActive = true;

        async function loadStoredContributeState() {
            const [storedDraft, storedCoachMarkDismissed] = await Promise.all([
                readStoredDraft(),
                readCoachMarkDismissed(),
            ]);

            if (!isActive) {
                return;
            }

            setCoachMarkIsDismissed(storedCoachMarkDismissed === true);
            setStoredDraftSummary(getStoredDraftSummary(storedDraft));
        }

        loadStoredContributeState();

        return () => {
            isActive = false;
        };
    }, []);

    const persistDraftNow = useCallback(async () => {
        const {
            changeset: currentChangeset,
            pins: allPins,
            removals: currentRemovals,
        } = draftStateRef.current;
        const currentPins = allPins.filter(
            (pin) => pin.details?.staged !== false,
        );

        if (currentPins.length + currentRemovals.length === 0) {
            return false;
        }

        const storedDraft = await writeStoredDraft({
            changeset: currentChangeset,
            pins: currentPins,
            removals: currentRemovals,
        });

        if (!storedDraft) {
            return false;
        }

        setDraftUpdatedAt(storedDraft.updatedAt);
        setStoredDraftSummary(getStoredDraftSummary(storedDraft));

        return true;
    }, []);

    useEffect(() => {
        if (!contributeDraftShouldPersist(contributeStatus, pins, removals)) {
            return undefined;
        }

        const autosaveTimeoutId = setTimeout(() => {
            persistDraftNow();
        }, CONTRIBUTE_DRAFT_AUTOSAVE_DELAY_MS);

        return () => {
            clearTimeout(autosaveTimeoutId);
        };
    }, [changeset, contributeStatus, persistDraftNow, pins, removals]);

    useEffect(() => {
        // Removing the last change must also remove the persisted draft.
        if (
            contributeStatus !== 'idle' &&
            contributeStatus !== 'published' &&
            getChangesetSummary(pins, removals).total === 0 &&
            draftUpdatedAt
        ) {
            clearStoredDraft();
            setDraftUpdatedAt(null);
            setStoredDraftSummary(null);
        }
    }, [contributeStatus, draftUpdatedAt, pins.length, removals.length]);

    useEffect(() => {
        const appStateSubscription = AppState.addEventListener(
            'change',
            (appState) => {
                const {
                    contributeStatus: currentContributeStatus,
                    pins: currentPins,
                    removals: currentRemovals,
                } = draftStateRef.current;

                if (
                    appState === 'background' &&
                    contributeDraftShouldPersist(
                        currentContributeStatus,
                        currentPins,
                        currentRemovals,
                    )
                ) {
                    persistDraftNow();
                }
            },
        );

        return () => {
            appStateSubscription.remove();
        };
    }, [persistDraftNow]);

    const openStartSheet = useCallback(() => {
        setContributeStatus('start-sheet');
    }, []);

    const closeStartSheet = useCallback(() => {
        setContributeStatus((currentStatus) =>
            currentStatus === 'start-sheet' ? 'idle' : currentStatus,
        );
    }, []);

    const startPlacing = useCallback(() => {
        setContributeStatus('placing');
    }, []);

    const dismissCoachMark = useCallback(() => {
        setCoachMarkIsDismissed(true);
        writeCoachMarkDismissed();
    }, []);

    const resetContributeSession = useCallback(async () => {
        setChangeset(createDefaultChangeset());
        setContributeStatus('idle');
        setDraftUpdatedAt(null);
        setPins([]);
        setRemovals([]);
        setPublishError(null);
        setPublishResult(null);
        setPublishStatus('idle');

        const storedDraft = await readStoredDraft();

        setStoredDraftSummary(getStoredDraftSummary(storedDraft));
    }, []);

    const addPinAtCoordinate = useCallback(({ latitude, longitude }) => {
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            return null;
        }

        pinIdCounterRef.current += 1;

        const pin = {
            details: { ...createDefaultPinDetails(), staged: false },
            id: `pin-${Date.now()}-${pinIdCounterRef.current}`,
            latitude,
            longitude,
        };

        setPins((currentPins) => [...currentPins, pin]);

        return pin;
    }, []);

    const removePin = useCallback((pinId) => {
        setPins((currentPins) => currentPins.filter((pin) => pin.id !== pinId));
    }, []);

    const stageRemoval = useCallback(async (node, reason) => {
        const removal = {
            id: node.id,
            version: node.version,
            latitude: node.latitude,
            longitude: node.longitude,
            reason,
            ...(node.tags ? { tags: node.tags } : {}),
        };
        if (draftStateRef.current.contributeStatus === 'idle') {
            const storedDraft = await readStoredDraft();
            if (storedDraft) {
                setChangeset(storedDraft.changeset);
                setPins(
                    storedDraft.pins.filter((pin) => pin.nodeId !== node.id),
                );
                setRemovals([
                    ...(storedDraft.removals ?? []).filter(
                        (item) => item.id !== node.id,
                    ),
                    removal,
                ]);
            } else {
                setRemovals([removal]);
            }
        } else {
            setPins((current) =>
                current.filter((pin) => pin.nodeId !== node.id),
            );
            setRemovals((current) => [
                ...current.filter((item) => item.id !== node.id),
                removal,
            ]);
        }
        setContributeStatus('placing');
        setPublishError(null);
        setPublishResult(null);
        setPublishStatus('idle');
    }, []);

    const stageNodeEdit = useCallback(async (node, details, location) => {
        const pin = {
            id: `node-${node.id}`,
            nodeId: node.id,
            version: node.version,
            latitude: location.latitude,
            longitude: location.longitude,
            details: { ...details, staged: true },
        };
        if (draftStateRef.current.contributeStatus === 'idle') {
            const storedDraft = await readStoredDraft();
            if (storedDraft) {
                setChangeset(storedDraft.changeset);
                setPins([
                    ...storedDraft.pins.filter(
                        (item) => item.nodeId !== node.id,
                    ),
                    pin,
                ]);
                setRemovals(
                    (storedDraft.removals ?? []).filter(
                        (item) => item.id !== node.id,
                    ),
                );
            } else {
                setPins([pin]);
            }
        } else {
            setPins((current) => [
                ...current.filter((item) => item.nodeId !== node.id),
                pin,
            ]);
            setRemovals((current) =>
                current.filter((item) => item.id !== node.id),
            );
        }
        setContributeStatus('placing');
        setPublishError(null);
        setPublishResult(null);
        setPublishStatus('idle');
    }, []);

    const removeRemoval = useCallback((nodeId) => {
        setRemovals((current) => current.filter((node) => node.id !== nodeId));
    }, []);

    const continueOnMap = useCallback(() => {
        setContributeStatus('placing');
    }, []);

    const updatePinDetails = useCallback((pinId, detailsPatch) => {
        setPins((currentPins) =>
            currentPins.map((pin) =>
                pin.id === pinId
                    ? {
                          ...pin,
                          details: { ...pin.details, ...detailsPatch },
                      }
                    : pin,
            ),
        );
    }, []);

    const updatePinLocation = useCallback((pinId, location) => {
        setPins((currentPins) =>
            updatePinLocationInList(currentPins, pinId, location),
        );
    }, []);

    const updateChangeset = useCallback((changesetPatch) => {
        setChangeset((currentChangeset) => ({
            ...currentChangeset,
            ...changesetPatch,
        }));
    }, []);

    const resumeStoredDraft = useCallback(async () => {
        const storedDraft = await readStoredDraft();

        if (!storedDraft) {
            setStoredDraftSummary(null);
            return false;
        }

        setChangeset({ ...createDefaultChangeset(), ...storedDraft.changeset });
        setRemovals(storedDraft.removals ?? []);
        setDraftUpdatedAt(storedDraft.updatedAt);
        setPins(
            storedDraft.pins.map((pin) => ({
                ...pin,
                details: {
                    ...createDefaultPinDetails(),
                    ...pin.details,
                    preset: pin.details.preset ?? 'custom',
                    rawTags: pin.details.preset
                        ? (pin.details.rawTags ?? [])
                        : Object.entries(buildNodeTags(pin.details)).map(
                              ([key, value]) => ({ key, value: String(value) }),
                          ),
                },
            })),
        );
        setPublishError(null);
        setPublishResult(null);
        setPublishStatus('idle');
        setStoredDraftSummary(getStoredDraftSummary(storedDraft));
        setContributeStatus('placing');

        return true;
    }, []);

    const discardStoredDraft = useCallback(async () => {
        await clearStoredDraft();
        setDraftUpdatedAt(null);
        setStoredDraftSummary(null);
    }, []);

    const publish = useCallback(async () => {
        if (publishIsInFlightRef.current) {
            return;
        }

        const {
            changeset: currentChangeset,
            pins: allPins,
            removals: currentRemovals,
        } = draftStateRef.current;
        const currentPins = allPins.filter(
            (pin) => pin.details?.staged !== false,
        );

        if (currentPins.length + currentRemovals.length === 0) {
            return;
        }

        publishIsInFlightRef.current = true;
        setPublishError(null);
        setPublishStatus('publishing');

        try {
            const session = await ensureWriteAccess();

            if (!session) {
                setPublishStatus('idle');
                return;
            }

            const accessToken =
                session.token ??
                session.accessToken ??
                openStreetMapAccessToken;
            const createdPins = currentPins.filter((pin) => !pin.nodeId);
            const editedPins = currentPins.filter((pin) => pin.nodeId);
            const uploadedNodes = createdPins.map((pin) => ({
                lat: pin.latitude,
                lon: pin.longitude,
                tags: buildNodeTags(pin.details),
            }));
            const result = await publishNodes({
                accessToken,
                changesetTags: buildChangesetTags(currentChangeset),
                nodes: uploadedNodes,
                modifiedNodes: editedPins.map((pin) => ({
                    id: pin.nodeId,
                    version: pin.version,
                    latitude: pin.latitude,
                    longitude: pin.longitude,
                    tags: buildNodeTags(pin.details),
                })),
                deletedNodes: currentRemovals,
            });

            const syncPayload = buildPublishedNodeSyncPayload({
                changesetId: result.changesetId,
                diffNodes: result.nodes,
                sourceNodes: uploadedNodes,
            });
            for (const pin of editedPins) {
                const diff = (result.modifiedNodes ?? []).find(
                    (node) => node.oldId === pin.nodeId,
                );
                if (
                    diff?.newVersion &&
                    buildNodeTags(pin.details)['surveillance:type'] === 'ALPR'
                ) {
                    syncPayload.nodes.push({
                        id: pin.nodeId,
                        version: diff.newVersion,
                    });
                }
            }

            if (syncPayload.nodes.length > 0) {
                try {
                    const syncResult = await syncPublishedNodesToBackend({
                        changesetId: syncPayload.changeset_id,
                        nodes: syncPayload.nodes,
                    });

                    upsertMarkerPoints(syncResult.points);
                } catch (error) {
                    addCrashlyticsLog({
                        category: 'osm.publish',
                        data: {
                            changesetId: result.changesetId,
                            errorMessage: error?.message,
                            nodeCount: syncPayload.nodes.length,
                        },
                        level: 'warning',
                        message: 'Published nodes backend sync failed',
                    });
                }
            }

            setPublishResult({
                changesetId: result.changesetId,
                nodes: (result.nodes ?? []).map((node, nodeIndex) => ({
                    nodeId: node.newId,
                    pinId:
                        createdPins[getUploadedNodeIndex(node, nodeIndex)]
                            ?.id ?? null,
                    version: node.newVersion ?? 1,
                })),
                modifiedNodes: editedPins.map((pin) => ({
                    nodeId: pin.nodeId,
                    pinId: pin.id,
                    version:
                        (result.modifiedNodes ?? []).find(
                            (node) => node.oldId === pin.nodeId,
                        )?.newVersion ?? pin.version + 1,
                })),
                removedNodes: currentRemovals,
                publishedAt: new Date().toISOString(),
            });
            if (result.nodes?.length) {
                recordPublishedCameras(result.nodes.length);
            }
            setPublishStatus('success');
            setContributeStatus('published');
            setDraftUpdatedAt(null);
            setStoredDraftSummary(null);
            await clearStoredDraft();
            router.replace('/contribute/published');
        } catch (error) {
            addCrashlyticsLog({
                category: 'osm.publish',
                level: 'warning',
                message: 'Changeset upload failed',
                data: {
                    errorCode: error?.code,
                    errorStatus: error?.status,
                    errorDetail: error?.detail,
                    nodeCount: currentPins.length,
                    removalCount: currentRemovals.length,
                },
            });
            setPublishError(
                error?.message ?? 'Publishing to OpenStreetMap failed.',
            );
            setPublishStatus('error');
        } finally {
            publishIsInFlightRef.current = false;
        }
    }, [
        ensureWriteAccess,
        openStreetMapAccessToken,
        recordPublishedCameras,
        upsertMarkerPoints,
    ]);

    const resetForMoreCameras = useCallback(() => {
        setContributeStatus('placing');
        setPins([]);
        setRemovals([]);
        setPublishError(null);
        setPublishResult(null);
        setPublishStatus('idle');
    }, []);

    const contributePlacementIsActive = contributeStatus === 'placing';

    const value = useMemo(
        () => ({
            addPinAtCoordinate,
            changeset,
            closeStartSheet,
            coachMarkIsDismissed,
            contributePlacementIsActive,
            contributeStatus,
            discardStoredDraft,
            dismissCoachMark,
            draftUpdatedAt,
            exitContribute: resetContributeSession,
            finishContribute: resetContributeSession,
            openStartSheet,
            pins,
            publish,
            publishError,
            publishResult,
            publishStatus,
            removePin,
            removals,
            stageRemoval,
            stageNodeEdit,
            cacheEditingNode,
            getEditingNode,
            removeRemoval,
            continueOnMap,
            resetForMoreCameras,
            resumeStoredDraft,
            saveDraft: persistDraftNow,
            startPlacing,
            storedDraftSummary,
            tour,
            updateChangeset,
            updatePinDetails,
            updatePinLocation,
        }),
        [
            addPinAtCoordinate,
            changeset,
            closeStartSheet,
            coachMarkIsDismissed,
            contributePlacementIsActive,
            contributeStatus,
            discardStoredDraft,
            dismissCoachMark,
            draftUpdatedAt,
            openStartSheet,
            persistDraftNow,
            pins,
            publish,
            publishError,
            publishResult,
            publishStatus,
            removePin,
            removals,
            stageRemoval,
            stageNodeEdit,
            cacheEditingNode,
            getEditingNode,
            removeRemoval,
            continueOnMap,
            resetContributeSession,
            resetForMoreCameras,
            resumeStoredDraft,
            startPlacing,
            storedDraftSummary,
            tour,
            updateChangeset,
            updatePinDetails,
            updatePinLocation,
        ],
    );

    return (
        <ContributeContext.Provider value={value}>
            {children}
        </ContributeContext.Provider>
    );
}

export function useContribute() {
    const contributeState = useContext(ContributeContext);

    if (!contributeState) {
        throw new Error(
            'useContribute must be used inside ContributeProvider.',
        );
    }

    return contributeState;
}
