import { useCallback, useRef } from 'react';
import { View } from 'react-native';

export function ContributeTourTarget({
    children,
    className = '',
    id,
    targets,
}) {
    const currentNodeRef = useRef(null);
    const registerTarget = useCallback(
        (node) => {
            if (node) {
                targets.current[id] = node;
            } else if (targets.current[id] === currentNodeRef.current) {
                delete targets.current[id];
            }

            currentNodeRef.current = node;
        },
        [id, targets],
    );

    return (
        <View className={className} collapsable={false} ref={registerTarget}>
            {children}
        </View>
    );
}
