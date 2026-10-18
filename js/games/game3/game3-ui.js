import { game3Info } from "./game3-data.js";

export function renderGame3(container) {
  container.innerHTML = 
    '<div class="placeholder">' +
      '<h3>' + game3Info.name + '</h3>' +
      '<p>Coming Soon</p>' +
    '</div>';
}
