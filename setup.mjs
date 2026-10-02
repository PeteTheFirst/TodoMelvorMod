// Todo: a per-character todo list that opens when the character has loaded, from a button in the
// top bar, and with a hotkey.

export async function setup(ctx) {
  const [
    { createStore },
    { createSorter },
    { createModal },
    { placeButton },
    { addHotkeySetting, listenForHotkey },
  ] = await Promise.all([
    ctx.loadModule('src/store.mjs'),
    ctx.loadModule('src/sort.mjs'),
    ctx.loadModule('src/modal.mjs'),
    ctx.loadModule('src/button.mjs'),
    ctx.loadModule('src/hotkey.mjs'),
  ]);

  addHotkeySetting(ctx.settings);

  // The game calls this once the character is loaded and offline progress has been worked out.
  // By then character storage can be read, the top bar is in place and the list template is loaded.
  ctx.onInterfaceReady(() => {
    let modal;
    try {
      const store = createStore(ctx.characterStorage, ui.createStore);
      store.load();
      modal = createModal(store, createSorter);
    } catch (error) {
      console.error('[Todo] Could not set up the todo list:', error);
      return;
    }

    // Each way of opening the list is set up on its own, so that one failing leaves the others working.
    const steps = {
      button: () => placeButton({ iconUrl: ctx.getResourceUrl('assets/icon.png'), onClick: modal.toggle }),
      hotkey: () => listenForHotkey(ctx.settings, modal.toggle),
      'startup window': () => modal.openOnStartup(),
    };
    for (const [name, run] of Object.entries(steps)) {
      try {
        run();
      } catch (error) {
        console.error(`[Todo] Could not set up the ${name}:`, error);
      }
    }
  });
}
