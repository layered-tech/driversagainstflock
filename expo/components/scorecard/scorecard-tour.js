import {
    SCORECARD_FIXED_MPG,
    SCORECARD_STATS_WINDOW_DAYS,
    SCORECARD_XP_PER_AVOIDED_CAMERA,
} from './scorecard-engine.js';

export const SCORECARD_TOUR = {
    id: 'scorecard',
    storageKey: 'driversagainstflock.scorecardTour.v1',
    label: 'Scorecard tour',
    steps: [
        {
            id: 'privacy-score',
            target: 'privacy-score',
            title: 'Your privacy score',
            description: `This summarizes your recorded trips from the last ${SCORECARD_STATS_WINDOW_DAYS} days. Score = 100 × avoided ÷ (avoided + 1.5 × crossings), rounded to a whole number. Both confirmed and possible crossings count. A dash means there are no avoided cameras or crossings yet. This is an estimate based on known cameras, not proof that a drive was unseen.`,
            scroll: true,
        },
        {
            id: 'level',
            target: 'level',
            title: 'Lifetime XP and levels',
            description: `Each camera credited as avoided on a completed drive earns ${SCORECARD_XP_PER_AVOIDED_CAMERA} XP. Your lifetime XP determines your level; the bar shows progress toward the next level. Crossings affect your privacy score but do not subtract XP. XP stays after the ${SCORECARD_STATS_WINDOW_DAYS}-day trip details expire.`,
            scroll: true,
        },
        {
            id: 'avoided',
            target: 'avoided',
            title: 'Cameras avoided',
            description:
                'The camera-count difference between the fastest route and the route you choose is locked when guidance starts. That avoidance award is added when the drive completes. This tile totals awards from the last 30 days; it is separate from camera crossings detected during the drive.',
            scroll: true,
        },
        {
            id: 'crossings',
            target: 'crossings',
            title: 'Camera crossings',
            description:
                'This totals confirmed and possible crossings on recorded trips in the last 30 days. A known camera-direction cone crossing is treated as confirmed; passing near a camera with unknown direction is possible. DAF does not receive a plate image or confirmation from the camera operator. Tap this tile to inspect the local events.',
            scroll: true,
        },
        {
            id: 'streak',
            target: 'streak',
            title: 'Your clean drive streak',
            description:
                'This counts consecutive completed drives with zero confirmed or possible crossings within the last 30 days. A drive with a crossing resets the streak. It counts drives, so several clean drives on one day each count; unfinished drives do not add to it.',
            scroll: true,
        },
        {
            id: 'weekly-crossings',
            target: 'weekly-crossings',
            title: 'Crossings over time',
            description:
                'The bars group your retained local exposure events into rolling seven-day buckets, with the newest bucket on the right. Both confirmed and possible events count, including events on a drive still in progress. Detailed events expire after 30 days, so this chart is not a lifetime total.',
            scroll: true,
        },
        {
            id: 'privacy-costs',
            target: 'privacy-costs',
            title: 'The estimated cost of a detour',
            description: `Extra miles estimate route distance beyond the fastest route. Extra gallons = extra miles ÷ MPG; fuel cost = gallons × gas price. The default is ${SCORECARD_FIXED_MPG} MPG with the recorded AAA state Regular rate. Tap this card to set your own MPG and price, which update retained estimates. Per camera divides extra fuel cost by avoided cameras. Missing prices stay unavailable.`,
            scroll: true,
        },
        {
            id: 'badges',
            target: 'badges',
            title: 'Badges you earn',
            description:
                'Each badge lists its requirement: a private detour, seven consecutive clean drives, 100 avoided cameras, Level 4, ten clean drives spanning 30 days, or ten newly published cameras. Dimmed badges are locked. Once earned, badge unlocks stay on this device even after the trip details expire.',
            scroll: true,
        },
        {
            id: 'timeline',
            target: 'timeline',
            title: 'Inspect your exposure timeline',
            description:
                'Open the timeline to see retained events grouped by drive, newest first. Event details show the camera, time, direction, and score impact. Reconstructed trails use those local crossing points and routing between them; they are not a continuous GPS log. The operator view is a simulation, not access to an agency or camera database.',
            scroll: true,
        },
        {
            id: 'recording',
            target: 'recording',
            title: 'You control drive recording',
            description:
                'Recording runs during guided drives, phone-started Free Drive, and moving trips while Android Auto or CarPlay is connected. Parked-only connections are not saved. Turn this switch off to stop scorecard tracking; it does not delete your existing history. Recording requires encrypted native storage on iOS or Android.',
            scroll: true,
        },
        {
            id: 'backup',
            target: 'backup',
            title: 'Back up or move your scorecard',
            description:
                'Export creates a backup you choose where to save or share. The exported file is not encrypted, and DAF does not upload it automatically. Import replaces the scorecard on this device after you confirm. Finish an active drive before exporting or importing; keep backup files somewhere you trust.',
            scroll: true,
        },
        {
            id: 'delete-history',
            target: 'delete-history',
            title: 'Delete your local history',
            description:
                'This button asks for confirmation before removing the scorecard stored on this device, including trips, exposure events, lifetime XP, and badge unlocks. It does not remove backup files you previously saved or shared. Finishing or skipping this tour leaves your scorecard unchanged.',
            scroll: true,
        },
        {
            id: 'data-handling',
            target: 'data-handling',
            title: 'How your information is handled',
            description:
                'Scorecard calculations run on this device and saved scorecard history uses encrypted local storage. Detailed trips and exposure events expire after 30 days; lifetime totals and earned badges remain until you delete or replace the scorecard. Map, routing, and gas-price requests still use their normal services. Exporting a backup is your choice.',
            scroll: true,
        },
    ],
};
