import { game2Info } from "./game2-data.js";

export function renderGame2(container) {
  container.innerHTML = 
    '<div class="placeholder">' +
      '<h3>' + game2Info.name + '</h3>' +
      '<p>Coming Soon</p>' +
    '</div>';
}
