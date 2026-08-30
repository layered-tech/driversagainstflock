const EMPTY_AUTOPLAY_MAP_CONTROL_HANDLERS = {
    handleDrivingMapViewPress: () => {},
    handleLocationTrackingPress: () => {},
    handlePan: () => {},
    handlePanningInterfaceChanged: () => {},
    handleZoomGesture: () => {},
    handleZoomInPress: () => {},
    handleZoomOutPress: () => {},
};

export function createAutoPlayMapControlHandlerRegistry(emptyHandlers) {
    const registrations = [];

    return {
        get() {
            return (
                registrations[registrations.length - 1]?.handlers ??
                emptyHandlers
            );
        },
        register(handlers) {
            const registration = { handlers };
            let isRegistered = true;

            registrations.push(registration);

            return () => {
                if (!isRegistered) {
                    return;
                }

                isRegistered = false;

                const registrationIndex = registrations.indexOf(registration);

                if (registrationIndex >= 0) {
                    registrations.splice(registrationIndex, 1);
                }
            };
        },
    };
}

const autoPlayMapControlHandlerRegistry =
    createAutoPlayMapControlHandlerRegistry(
        EMPTY_AUTOPLAY_MAP_CONTROL_HANDLERS,
    );

export function getAutoPlayMapControlHandlers() {
    return autoPlayMapControlHandlerRegistry.get();
}

export function registerAutoPlayMapControlHandlers(handlers) {
    return autoPlayMapControlHandlerRegistry.register({
        ...EMPTY_AUTOPLAY_MAP_CONTROL_HANDLERS,
        ...handlers,
    });
}
