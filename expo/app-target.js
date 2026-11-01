const APP_TARGETS = ['mobile', 'automotive'];

function resolveAppTarget(value = 'mobile') {
    if (!APP_TARGETS.includes(value)) {
        throw new Error(`Unsupported APP_TARGET: ${value}`);
    }
    return value;
}

module.exports = { resolveAppTarget };
