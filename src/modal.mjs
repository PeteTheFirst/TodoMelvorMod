// The todo window. It is one of the game's own popups (SweetAlert2), so it looks and behaves like
// the other ones, and it takes its turn in the game's popup queue when it opens on startup.

const TEMPLATE = '#todo-mod-template';
const QUEUE_CHECK_MS = 300;
const MAX_FAILED_NUDGES = 3;

// The game keeps these in plain script variables, which are not properties of `window`.
// Everything is looked up defensively so a game update that renames one cannot break the mod.
const gameQueue = () => (typeof modalQueue !== 'undefined' && Array.isArray(modalQueue) ? modalQueue : null);
const queuePaused = () => typeof modalQueuePaused !== 'undefined' && modalQueuePaused === true;
const popups = () => (typeof SwalLocale !== 'undefined' ? SwalLocale : Swal);

function takeFromQueue(options) {
  const queue = gameQueue();
  const index = queue ? queue.indexOf(options) : -1;
  if (index !== -1) queue.splice(index, 1);
}

/**
 * The game opens the next queued popup the moment one closes, but that check can come too early,
 * while the closing popup is still fading out, and then the next one is left waiting in the queue.
 * Opening it once nothing is on screen keeps the queue moving. Does nothing while the game has
 * paused the queue, which it does while it works out offline progress.
 */
function nudgeQueue() {
  if (queuePaused() || Swal.isVisible()) return;
  const queue = gameQueue();
  if (queue && queue.length && typeof openNextModal === 'function') openNextModal();
}

/**
 * `createSorter` comes from src/sort.mjs and makes the list reorderable. `showsOnStartup` tells
 * whether the "Show on startup" setting is on; it is asked each time, as the setting can change.
 */
export function createModal(store, createSorter, showsOnStartup) {
  // The list is rendered once into this element; every popup that shows it reuses the element.
  const host = document.createElement('div');
  const sorter = createSorter(host, store);
  let pendingStartup = null; // options of the startup window while it waits for its turn

  ui.create(
    {
      $template: TEMPLATE,
      store,
      close,
      startDrag: sorter.startDrag,
      moveWithKeys: sorter.moveWithKeys,
      scrollListToEnd() {
        // Wait for the new row to be rendered before scrolling to it.
        requestAnimationFrame(() => {
          const list = host.querySelector('.todo-mod-list');
          if (list) list.scrollTop = list.scrollHeight;
        });
      },
    },
    host,
  );
  // Mods that render straight into document.body make PetiteVue walk the whole page again, this
  // list included if its popup is open at that moment. v-pre tells that walk to skip the list,
  // so the other mod can neither attach handlers to it nor evaluate todo text as an expression.
  host.setAttribute('v-pre', '');

  function isOpen() {
    const popup = Swal.getPopup();
    return Swal.isVisible() && !!popup && popup.contains(host);
  }

  function close() {
    if (isOpen()) Swal.close();
  }

  function optionsFor(mode) {
    const classes = { popup: 'todo-mod-popup', htmlContainer: 'todo-mod-html' };
    const options = {
      title: 'Todo',
      html: host,
      showConfirmButton: false,
      showCloseButton: true,
      // Passing customClass replaces the classes the game puts on its own popups, so merge them.
      customClass: typeof createSwalCustomClass === 'function' ? createSwalCustomClass(classes) : classes,
      willOpen: () => {
        if (pendingStartup === options) pendingStartup = null;
        store.prepare(mode, showsOnStartup());
      },
      // Keep the keyboard focus on the popup itself rather than on a button or the text field,
      // so that the hotkey can close the window again and Escape keeps working.
      didOpen: (popup) => popup.focus(),
      // The hotkey can close the window in the middle of a drag; the dragged todo then stays put.
      willClose: sorter.cancel,
      didClose: nudgeQueue,
    };
    return options;
  }

  /** Opens the window, or closes it if it is open. Returns false if it had to leave things as they are. */
  function toggle() {
    if (isOpen()) {
      Swal.close();
      return true;
    }
    // Never replace another popup, and stay out of the way while offline progress is running.
    if (Swal.isVisible() || queuePaused()) return false;

    let mode = 'manual';
    if (pendingStartup) {
      // The startup window was still waiting for its turn; this open takes its place.
      takeFromQueue(pendingStartup);
      pendingStartup = null;
      mode = 'startup';
    }
    popups().fire(optionsFor(mode));
    return true;
  }

  /**
   * Shows the window after the game has loaded, if there is something left to do and it has not
   * been switched off, in the settings or for today. It queues up behind the "Welcome back" popup
   * and anything else the game wants to show first.
   */
  function openOnStartup() {
    if (!showsOnStartup() || store.openCount() === 0 || store.isSnoozed()) return;

    const options = optionsFor('startup');
    pendingStartup = options;
    if (typeof addModalToQueue === 'function') addModalToQueue(options); // opens at once if nothing else is showing

    let failedNudges = 0;
    const timer = setInterval(() => {
      if (pendingStartup !== options) {
        clearInterval(timer); // it opened, or toggle() took over
        return;
      }
      if (queuePaused() || Swal.isVisible()) return;

      const queue = gameQueue();
      const canNudge = queue && queue.includes(options) && typeof openNextModal === 'function';
      if (canNudge && failedNudges < MAX_FAILED_NUDGES) {
        openNextModal();
        failedNudges = Swal.isVisible() ? 0 : failedNudges + 1;
        return;
      }

      // The queue is unavailable or stuck: show the window directly.
      clearInterval(timer);
      takeFromQueue(options);
      popups().fire(options);
    }, QUEUE_CHECK_MS);
  }

  return { toggle, openOnStartup };
}
