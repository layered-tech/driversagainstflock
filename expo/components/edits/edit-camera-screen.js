import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Platform, Text, useWindowDimensions, View } from 'react-native';
import { getCameraDetailsFromTags } from '../../lib/osm/camera-presets';
import { CameraForm } from '../contribute/camera-form';
import { useContribute } from '../contribute/contribute-state';
import { ContributePageHeader } from '../contribute/step-header';
import { DafButton } from '../design-system/primitives';
import { RemoveCameraSheet } from './remove-camera-sheet';
import { useDuoDevice } from '../root/duo-device-context';

export default function EditCameraScreen() {
    const duo = useDuoDevice();
    const { width } = useWindowDimensions();
    const wideTablet = Platform.isPad && width >= 768;
    const params = useLocalSearchParams();
    const { pins, stageNodeEdit, continueOnMap, getEditingNode } =
        useContribute();
    const pinsRef = useRef(pins);
    pinsRef.current = pins;
    const [node, setNode] = useState(null);
    const [details, setDetails] = useState(null);
    const [location, setLocation] = useState(null);
    const [error, setError] = useState(null);
    const [removeOpen, setRemoveOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const stagingRef = useRef(false);
    const deletionStagedRef = useRef(false);
    const nodeId = Number(
        Array.isArray(params.nodeId) ? params.nodeId[0] : params.nodeId,
    );
    const action = Array.isArray(params.action)
        ? params.action[0]
        : params.action;
    useFocusEffect(
        useCallback(() => {
            setError(null);
            setNode(null);
            setDetails(null);
            if (!Number.isInteger(nodeId) || nodeId <= 0) {
                setError('This camera link is invalid.');
                return;
            }
            const staged = pinsRef.current.find((pin) => pin.nodeId === nodeId);
            const next =
                getEditingNode(nodeId) ??
                (staged
                    ? {
                          id: staged.nodeId,
                          version: staged.version,
                          latitude: staged.latitude,
                          longitude: staged.longitude,
                      }
                    : null);
            if (!next || next.visible === false) {
                setError(
                    next?.visible === false
                        ? 'This camera has already been deleted.'
                        : 'Open this camera from the map or Your edits to edit it.',
                );
                return;
            }
            if (
                !Number.isFinite(next.latitude) ||
                !Number.isFinite(next.longitude)
            ) {
                setError('This camera has no valid location.');
                return;
            }
            setNode(next);
            setDetails(staged?.details ?? getCameraDetailsFromTags(next.tags));
            setLocation(staged ?? next);
            setRemoveOpen(action === 'remove');
            deletionStagedRef.current = false;
        }, [nodeId, action, getEditingNode]),
    );
    const backToMap = () => {
        continueOnMap();
        router.navigate('/');
    };
    const save = async () => {
        if (stagingRef.current || !node || !details) return;
        stagingRef.current = true;
        setSaving(true);
        try {
            await stageNodeEdit(node, details, location);
            backToMap();
        } catch (failure) {
            setError(failure.message);
        } finally {
            stagingRef.current = false;
            setSaving(false);
        }
    };
    if (!node || !details)
        return (
            <View
                className="flex-1 bg-daf-surface-page dark:bg-[#0B0E12]"
                testID="edit-camera-screen"
            >
                <ContributePageHeader
                    onBack={() => router.back()}
                    title="Edit camera"
                />
                <View className="gap-4 p-6">
                    <Text className="text-[13px] text-daf-text-secondary dark:text-neutral-300">
                        {error ?? 'Opening camera…'}
                    </Text>
                    <DafButton onPress={() => router.back()}>Go back</DafButton>
                </View>
            </View>
        );
    return (
        <View className="flex-1" testID="edit-camera-screen">
            {!(duo || wideTablet) || action !== 'remove' ? (
                <CameraForm
                    pin={{
                        ...location,
                        nodeId: node.id,
                        version: node.version,
                        details,
                    }}
                    onBack={() => router.back()}
                    onDetailsChange={(patch) =>
                        setDetails((value) => ({ ...value, ...patch }))
                    }
                    onLocationChange={setLocation}
                    onSave={save}
                    saving={saving}
                    error={error}
                />
            ) : null}
            <RemoveCameraSheet
                isOpen={removeOpen}
                node={node}
                onDismiss={() => {
                    setRemoveOpen(false);
                    if (action === 'remove' && !deletionStagedRef.current)
                        backToMap();
                }}
                onStaged={() => {
                    deletionStagedRef.current = true;
                    backToMap();
                }}
            />
        </View>
    );
}
