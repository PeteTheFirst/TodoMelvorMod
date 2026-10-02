// The setting that decides whether the todo window opens on its own once a character has loaded.

const SECTION = 'General';
const SETTING = 'showOnStartup';

export function addStartupSetting(settings) {
  settings.section(SECTION).add({
    type: 'switch',
    name: SETTING,
    label: 'Show on startup',
    hint: 'Open the todo list automatically when a character has loaded and still has unchecked todos.',
    default: true,
  });
}

/** Whether the setting is on. Anything but a clear "off" counts as on, which is the default. */
export function showsOnStartup(settings) {
  try {
    return settings.section(SECTION).get(SETTING) !== false;
  } catch (error) {
    return true;
  }
}
