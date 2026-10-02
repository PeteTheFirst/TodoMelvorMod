// The button that opens the todo window: in the top bar in front of the potion button, or in the
// sidebar if a game update has moved the top bar around.

const POTION_BUTTON_ID = 'page-header-potions-dropdown';

/** Adds the button and returns where it ended up: 'header' or 'sidebar'. */
export function placeButton({ iconUrl, onClick }) {
  // Each top bar button sits in a wrapper of its own; ours goes in front of the potion button's.
  const potionButton = document.getElementById(POTION_BUTTON_ID);
  const neighbour = potionButton && potionButton.parentElement;
  if (neighbour && neighbour.parentElement) {
    neighbour.insertAdjacentElement('beforebegin', createHeaderButton(iconUrl, onClick));
    return 'header';
  }

  sidebar.category('Modding').item('Todo', { icon: iconUrl, onClick });
  return 'sidebar';
}

// The button is nothing but the icon: a 32px square that the picture fills (see assets/styles.css),
// which is the size other mods use for a picture button in the top bar. `btn btn-sm` are the game's
// button classes; with them the game lines the button up like the ones around it.
function createHeaderButton(iconUrl, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'todo-mod-header-button';
  button.className = 'btn btn-sm todo-mod-header-button';
  button.title = 'Todo';
  button.setAttribute('aria-label', 'Todo');
  button.addEventListener('click', () => {
    button.blur(); // otherwise the button keeps a focus ring after the window closes
    onClick();
  });

  const icon = document.createElement('img');
  icon.className = 'todo-mod-header-icon';
  icon.src = iconUrl;
  icon.alt = '';
  icon.draggable = false;

  button.append(icon);
  return button;
}
