const { createRequire } = require("module");
const createNavigationModule = require("./createNavigationModule");

function requireFromProject(name) {
    try {
        return require(name);
    } catch {
        try {
            return createRequire(`${process.cwd()}/package.json`)(name);
        } catch {
            return null;
        }
    }
}

const React = requireFromProject("react") ?? {
    useCallback: (callback) => callback,
    useEffect: () => undefined,
    useState: (value) => [value, () => {}],
};

const ExpoModulesCore = requireFromProject("expo-modules-core") ?? {};

class NoopEventEmitter {
    addListener() {
        return {
            remove() {},
        };
    }
}

module.exports = createNavigationModule({
    EventEmitter: ExpoModulesCore.EventEmitter ?? NoopEventEmitter,
    findNodeHandle: null,
    Platform: { OS: "unknown" },
    React,
    requireNativeModule:
        ExpoModulesCore.requireNativeModule ??
        (() => {
            throw new Error("Native module unavailable outside React Native.");
        }),
});
