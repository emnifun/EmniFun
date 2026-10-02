/**
 * Game 1 logic boundary.
 *
 * The actual guessing/scoring rules are deliberately NOT implemented in Phase 1.
 * This file exists so those rules can be added without putting them in the UI.
 */

export function createGame1State() {
  return {
    status: "placeholder",
    guesses: [],
    cluesUsed: 0
  };
}
