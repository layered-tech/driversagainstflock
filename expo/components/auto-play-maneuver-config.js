import { getRoundaboutExitNumber } from './map/roundabout-guidance.js';

export const AUTO_PLAY_MANEUVER_TYPE = {
    Arrive: 10,
    Depart: 0,
    Keep: 90,
    Roundabout: 40,
    Straight: 20,
    Turn: 30,
};

const AUTO_PLAY_TURN_TYPE = {
    NoTurn: 0,
    SlightLeft: 1,
    SlightRight: 2,
    NormalLeft: 3,
    NormalRight: 4,
    SharpLeft: 5,
    SharpRight: 6,
    UTurnLeft: 7,
};

const AUTO_PLAY_KEEP_TYPE = {
    Left: 0,
    Right: 1,
};

function getManeuverNumber(value) {
    const number = Number(value);

    return Number.isFinite(number) ? number : null;
}

function getRoundaboutManeuverConfig(maneuver) {
    const exitNumber = getRoundaboutExitNumber(maneuver);

    return {
        ...(exitNumber === null ? {} : { exitNumber }),
        glyph: 'rotate',
        maneuverType: AUTO_PLAY_MANEUVER_TYPE.Roundabout,
    };
}

export function getAutoPlayManeuverConfig(maneuver) {
    switch (getManeuverNumber(maneuver?.type)) {
        case 0:
            return {
                glyph: 'arrow-left',
                maneuverType: AUTO_PLAY_MANEUVER_TYPE.Turn,
                turnType: AUTO_PLAY_TURN_TYPE.NormalLeft,
            };
        case 1:
            return {
                glyph: 'arrow-right',
                maneuverType: AUTO_PLAY_MANEUVER_TYPE.Turn,
                turnType: AUTO_PLAY_TURN_TYPE.NormalRight,
            };
        case 2:
            return {
                glyph: 'arrow-left',
                maneuverType: AUTO_PLAY_MANEUVER_TYPE.Turn,
                turnType: AUTO_PLAY_TURN_TYPE.SharpLeft,
            };
        case 3:
            return {
                glyph: 'arrow-right',
                maneuverType: AUTO_PLAY_MANEUVER_TYPE.Turn,
                turnType: AUTO_PLAY_TURN_TYPE.SharpRight,
            };
        case 4:
            return {
                glyph: 'arrow-left',
                maneuverType: AUTO_PLAY_MANEUVER_TYPE.Turn,
                turnType: AUTO_PLAY_TURN_TYPE.SlightLeft,
            };
        case 5:
            return {
                glyph: 'arrow-right',
                maneuverType: AUTO_PLAY_MANEUVER_TYPE.Turn,
                turnType: AUTO_PLAY_TURN_TYPE.SlightRight,
            };
        case 7:
        case 8:
            return getRoundaboutManeuverConfig(maneuver);
        case 9:
            return {
                glyph: 'level-up-alt',
                maneuverType: AUTO_PLAY_MANEUVER_TYPE.Turn,
                turnType: AUTO_PLAY_TURN_TYPE.UTurnLeft,
            };
        case 10:
            return {
                glyph: 'flag-checkered',
                maneuverType: AUTO_PLAY_MANEUVER_TYPE.Arrive,
            };
        case 11:
            return {
                glyph: 'arrow-up',
                maneuverType: AUTO_PLAY_MANEUVER_TYPE.Depart,
            };
        case 12:
            return {
                glyph: 'arrow-left',
                keepType: AUTO_PLAY_KEEP_TYPE.Left,
                maneuverType: AUTO_PLAY_MANEUVER_TYPE.Keep,
            };
        case 13:
            return {
                glyph: 'arrow-right',
                keepType: AUTO_PLAY_KEEP_TYPE.Right,
                maneuverType: AUTO_PLAY_MANEUVER_TYPE.Keep,
            };
        case 6:
        default:
            return {
                glyph: 'arrow-up',
                maneuverType: AUTO_PLAY_MANEUVER_TYPE.Straight,
                turnType: AUTO_PLAY_TURN_TYPE.NoTurn,
            };
    }
}
