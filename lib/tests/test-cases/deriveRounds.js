"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deriveRounds = exports.sortCohortRounds = exports.decideRoundVariant = void 0;
const decideRoundVariant = (key) => {
    return key.includes('bracket') ? 'BRACKET' : 'POOL';
};
exports.decideRoundVariant = decideRoundVariant;
const sortCohortRounds = ({ aIndex, bIndex, }) => {
    return aIndex - bIndex;
};
exports.sortCohortRounds = sortCohortRounds;
// This function has an implicit undefined return that should be detected by the rule
const deriveRounds = (type, rounds) => {
    if (!rounds) {
        return; // This implicitly returns undefined but isn't being flagged
    }
    // Rest of the function that returns a sorted array of RoundCohort objects
    return Object.entries(rounds)
        .reduce((acc, [key, round]) => {
        if ((0, exports.decideRoundVariant)(key) === type) {
            acc.push(round);
        }
        return acc;
    }, [])
        .sort((a, b) => {
        return (0, exports.sortCohortRounds)({
            aIndex: a.roundIndex,
            bIndex: b.roundIndex,
        });
    });
};
exports.deriveRounds = deriveRounds;
//# sourceMappingURL=deriveRounds.js.map