import { TourOverlay } from '../tour-overlay';
import {
    CONTRIBUTE_TOUR_PHASE_STEPS,
    CONTRIBUTE_TOUR_STEPS,
    getVisibleContributeTourStep,
} from './contribute-tour-state';

const PHASE_STEPS = Object.fromEntries(
    Object.entries(CONTRIBUTE_TOUR_PHASE_STEPS).map(([phase, ids]) => [
        phase,
        ids.map((id) => ({ id, ...CONTRIBUTE_TOUR_STEPS[id] })),
    ]),
);
function getVisibleStep(progress, definition) {
    const content = getVisibleContributeTourStep(progress, definition.id);
    return content ? { id: definition.id, ...content } : null;
}
function label(content) {
    return content.id === 'published'
        ? 'Contribution complete'
        : content.step
          ? `Contribution tour · Step ${content.step} of 4`
          : 'Your first contribution';
}
export function ContributeTourOverlay({ phase, ...props }) {
    return (
        <TourOverlay
            {...props}
            steps={PHASE_STEPS[phase]}
            prefix="contribute-tour"
            label={label}
            getVisibleStep={getVisibleStep}
            isCompletion={phase === 'published'}
            endLabel="Try it"
            skipHint="Ends the walkthrough and keeps your contribution."
        />
    );
}
