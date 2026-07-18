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
import { publishNodes } from '../../lib/osm/client';
import { updatePinLocationInList } from '../../lib/osm/node-location';
import {
    clearStoredDraft,
    readCoachMarkDismissed,
    readStoredDraft,
    writeCoachMarkDismissed,
    writeStoredDraft,
} from './contribute-draft-storage';
import { buildChangesetTags, buildNodeTags } from './osm-tags';

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
        mount: null,
        operator: '',
        type: 'alpr',
    };
}

function getStoredDraftSummary(storedDraft) {
    if (!storedDraft) {
        return null;
    }

    return {
        pinCount: storedDraft.pins.length,
        updatedAt: storedDraft.updatedAt,
    };
}

function contributeDraftShouldPersist(contributeStatus, pins) {
    return (
        contributeStatus !== 'idle' &&
        contributeStatus !== 'published' &&
        pins.length > 0
    );
}

export function ContributeProvider({ children }) {
    const { ensureWriteAccess, openStreetMapAccessToken } = useAuth();
    const [changeset, setChangeset] = useState(createDefaultChangeset);
    const [coachMarkIsDismissed, setCoachMarkIsDismissed] = useState(false);
    const [contributeStatus, setContributeStatus] = useState('idle');
    const [draftUpdatedAt, setDraftUpdatedAt] = useState(null);
    const [pins, setPins] = useState([]);
    const [publishError, setPublishError] = useState(null);
    const [publishResult, setPublishResult] = useState(null);
    const [publishStatus, setPublishStatus] = useState('idle');
    const [storedDraftSummary, setStoredDraftSummary] = useState(null);
    const draftStateRef = useRef({ changeset, contributeStatus, pins });
    const pinIdCounterRef = useRef(0);
    const publishIsInFlightRef = useRef(false);

    draftStateRef.current = { changeset, contributeStatus, pins };

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
        const { changeset: currentChangeset, pins: currentPins } =
            draftStateRef.current;

        if (currentPins.length === 0) {
            return;
        }

        const storedDraft = await writeStoredDraft({
            changeset: currentChangeset,
            pins: currentPins,
        });

        if (!storedDraft) {
            return;
        }

        setDraftUpdatedAt(storedDraft.updatedAt);
        setStoredDraftSummary(getStoredDraftSummary(storedDraft));
    }, []);

    useEffect(() => {
        if (!contributeDraftShouldPersist(contributeStatus, pins)) {
            // Removing the last pin mid-session must also remove the draft
            // this session already persisted, or deleted pins resurface
            // through the resume-draft card. draftUpdatedAt guards unrelated
            // stored drafts from a session that never persisted anything.
            if (
                contributeStatus !== 'idle' &&
                contributeStatus !== 'published' &&
                pins.length === 0 &&
                draftUpdatedAt
            ) {
                clearStoredDraft();
                setDraftUpdatedAt(null);
                setStoredDraftSummary(null);
            }

            return undefined;
        }

        const autosaveTimeoutId = setTimeout(() => {
            persistDraftNow();
        }, CONTRIBUTE_DRAFT_AUTOSAVE_DELAY_MS);

        return () => {
            clearTimeout(autosaveTimeoutId);
        };
    }, [changeset, contributeStatus, draftUpdatedAt, persistDraftNow, pins]);

    useEffect(() => {
        const appStateSubscription = AppState.addEventListener(
            'change',
            (appState) => {
                const {
                    contributeStatus: currentContributeStatus,
                    pins: currentPins,
                } = draftStateRef.current;

                if (
                    appState === 'background' &&
                    contributeDraftShouldPersist(
                        currentContributeStatus,
                        currentPins,
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
            details: createDefaultPinDetails(),
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
        setDraftUpdatedAt(storedDraft.updatedAt);
        setPins(
            storedDraft.pins.map((pin) => ({
                ...pin,
                details: { ...createDefaultPinDetails(), ...pin.details },
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

        const { changeset: currentChangeset, pins: currentPins } =
            draftStateRef.current;

        if (currentPins.length === 0) {
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
            const result = await publishNodes({
                accessToken,
                changesetTags: buildChangesetTags(currentChangeset),
                nodes: currentPins.map((pin) => ({
                    lat: pin.latitude,
                    lon: pin.longitude,
                    tags: buildNodeTags(pin.details),
                })),
            });

            setPublishResult({
                changesetId: result.changesetId,
                nodes: (result.nodes ?? []).map((node, nodeIndex) => ({
                    nodeId: node.newId,
                    pinId: currentPins[nodeIndex]?.id ?? null,
                })),
                publishedAt: new Date().toISOString(),
            });
            setPublishStatus('success');
            setContributeStatus('published');
            setDraftUpdatedAt(null);
            setStoredDraftSummary(null);
            await clearStoredDraft();
            router.replace('/contribute/published');
        } catch (error) {
            setPublishError(
                error?.message ?? 'Publishing to OpenStreetMap failed.',
            );
            setPublishStatus('error');
        } finally {
            publishIsInFlightRef.current = false;
        }
    }, [ensureWriteAccess, openStreetMapAccessToken]);

    const resetForMoreCameras = useCallback(() => {
        setContributeStatus('placing');
        setPins([]);
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
            resetForMoreCameras,
            resumeStoredDraft,
            saveDraft: persistDraftNow,
            startPlacing,
            storedDraftSummary,
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
            resetContributeSession,
            resetForMoreCameras,
            resumeStoredDraft,
            startPlacing,
            storedDraftSummary,
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
