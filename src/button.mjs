// The button that opens the todo window: in the top bar next to the potion button, or in the
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

// Same wrapper, button and icon classes as the game's own top bar buttons, so it picks up their look.
function createHeaderButton(iconUrl, onClick) {
  const wrapper = document.createElement('div');
  wrapper.id = 'todo-mod-header';
  wrapper.className = 'dropdown d-inline-block ml-2';

  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'todo-mod-header-button';
  button.className = 'btn btn-sm btn-dual todo-mod-header-button';
  button.title = 'Todo';
  button.setAttribute('aria-label', 'Todo');
  button.addEventListener('click', () => {
    button.blur(); // otherwise the button keeps a focus ring after the window closes
    onClick();
  });

  const icon = document.createElement('img');
  icon.className = 'skill-icon-xxs todo-mod-header-icon';
  icon.src = iconUrl;
  icon.alt = '';

  button.append(icon);
  wrapper.append(button);
  return wrapper;
}
