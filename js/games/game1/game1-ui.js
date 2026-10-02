import { game1Info } from "./game1-data.js";
import { createGame1State } from "./game1-logic.js";

/** Build only the Phase 1 placeholder UI for Game 1. */
export function renderGame1(container) {
  const state = createGame1State();

  container.innerHTML = 
    '<div class="section-heading">' +
      '<h2>' + game1Info.name + '</h2>' +
      '<p>' + game1Info.description + '</p>' +
    '</div>' +
    '<div class="placeholder">' +
      '<h3>Game 1 foundation ready</h3>' +
      '<p>The game board and final rules will be built in a later phase.</p>' +
      '<p><strong>Phase 1 status:</strong> ' + state.status + '</p>' +
    '</div>';
}
