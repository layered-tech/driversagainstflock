const React = require("react");
const { findNodeHandle, Platform } = require("react-native");
const { EventEmitter, requireNativeModule } = require("expo-modules-core");
const createNavigationModule = require("./createNavigationModule");

module.exports = createNavigationModule({
    EventEmitter,
    findNodeHandle,
    Platform,
    React,
    requireNativeModule,
});
