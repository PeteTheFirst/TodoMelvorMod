// The hotkey that opens and closes the todo window. The key is chosen in the mod's settings.

const SECTION = 'General';
const SETTING = 'hotkey';
const DEFAULT_HOTKEY = 'T';

// Inputs of these types are not typed into, so the hotkey still works while one has focus.
const NON_TEXT_INPUTS = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file', 'image']);

/**
 * Returns the key in the form KeyboardEvent.key is compared against, '' if the hotkey is turned
 * off, or null if the value is not a usable hotkey.
 */
export function normalizeHotkey(value) {
  if (typeof value !== 'string') return null;
  const key = value.trim().toLowerCase();
  if (key === '') return '';
  if (key.length === 1 || /^f([1-9]|1[0-2])$/.test(key)) return key;
  return null;
}

export function addHotkeySetting(settings) {
  settings.section(SECTION).add({
    type: 'text',
    name: SETTING,
    label: 'Hotkey',
    hint: 'Key that opens and closes the todo list: a single character such as T, or F1 to F12. Leave empty to turn the hotkey off.',
    default: DEFAULT_HOTKEY,
    maxLength: 3,
    // Returning a string makes the game reject the value and show the string as the error.
    onChange: (value) => (normalizeHotkey(value) === null ? 'Use a single character, or F1 to F12.' : undefined),
  });
}

function isTypingInto(element) {
  if (!(element instanceof Element)) return false;
  const field = element.closest('input, textarea, select, [contenteditable]');
  if (!field) return false;
  if (field instanceof HTMLInputElement) return !NON_TEXT_INPUTS.has(field.type);
  return field.getAttribute('contenteditable') !== 'false';
}

/** Calls onPress whenever the configured hotkey is pressed outside of a text field. */
export function listenForHotkey(settings, onPress) {
  const currentHotkey = () => {
    try {
      return normalizeHotkey(settings.section(SECTION).get(SETTING)) || '';
    } catch (error) {
      return '';
    }
  };

  // Capture phase: an open popup stops key presses from travelling any further, and the hotkey
  // has to keep working then so that it can close the window again.
  document.addEventListener(
    'keydown',
    (event) => {
      if (event.repeat || event.isComposing || event.ctrlKey || event.altKey || event.metaKey) return;
      const target = event.composedPath ? event.composedPath()[0] : event.target;
      if (isTypingInto(target)) return;
      // The player is assigning one of the game's own key bindings in the settings.
      if (typeof game !== 'undefined' && game.keyboard && game.keyboard.isSettingKeyBind) return;

      const hotkey = currentHotkey();
      if (!hotkey || typeof event.key !== 'string' || event.key.toLowerCase() !== hotkey) return;
      if (onPress()) event.preventDefault();
    },
    true,
  );
}
