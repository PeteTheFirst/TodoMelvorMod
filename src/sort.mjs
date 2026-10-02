// Reordering the list: drag a todo by its handle, or press the up and down arrow keys while the
// handle has the keyboard focus.
//
// While a todo is being dragged nothing in the list really moves. The rows are only shifted with
// CSS transforms to show where the todo would land, and the store is changed once, on release.
// That leaves the order of the rows in the page to PetiteVue, which keeps track of it.

const LIST = '.todo-mod-list';
const ITEM = '.todo-mod-item';
const HANDLE = '.todo-mod-handle';
const SORTING_CLASS = 'todo-mod-list--sorting';
const DRAGGED_CLASS = 'todo-mod-item--dragged';
const BACKGROUND_PROPERTY = '--todo-mod-drag-background';

const DRAG_THRESHOLD = 4; // how far the pointer has to travel before a press on the handle becomes a drag
const SCROLL_ZONE = 32; // height of the strips at the top and bottom of the list that make it scroll
const SCROLL_SPEED = 14; // pixels per frame when the pointer is at the very edge

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/**
 * The colour behind the list. A dragged row is see-through like every other row, and would be
 * hard to read while it passes over its neighbours, so it is given this colour as a backdrop.
 */
function backgroundBehind(element) {
  for (let node = element; node instanceof Element; node = node.parentElement) {
    const color = getComputedStyle(node).backgroundColor;
    if (color && color !== 'transparent' && !/^rgba\(.*,\s*0\)$/.test(color)) return color;
  }
  return '';
}

/**
 * `host` is the element the list is rendered into, `store` is the todo store. `startDrag` and
 * `moveWithKeys` are called from the handle in assets/templates.html.
 */
export function createSorter(host, store) {
  let press = null; // a handle is held down, but the pointer has not moved far enough yet
  let drag = null; // a todo is being dragged

  function startDrag(event, id) {
    if (press || drag || !event.isPrimary || event.button !== 0) return;
    const item = event.currentTarget.closest(ITEM);
    const list = item && item.closest(LIST);
    if (!list) return;
    press = { id, item, list, pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    listen(true);
  }

  // The pointer leaves the handle as soon as it moves, so everything after the press is picked up
  // on the window. Capture phase, so that Escape reaches us before it reaches the popup.
  function listen(on) {
    const change = on ? 'addEventListener' : 'removeEventListener';
    window[change]('pointermove', onPointerMove, true);
    window[change]('pointerup', onPointerUp, true);
    window[change]('pointercancel', onPointerCancel, true);
    window[change]('keydown', onKeyDown, true);
    window[change]('blur', onWindowBlur);
  }

  function onPointerMove(event) {
    const current = press || drag;
    if (!current || event.pointerId !== current.pointerId) return;
    // The mouse button was let go somewhere we did not get to see it, outside the game's window.
    if (event.pointerType === 'mouse' && event.buttons === 0) return stop(false);

    if (press) {
      if (Math.hypot(event.clientX - press.x, event.clientY - press.y) < DRAG_THRESHOLD) return;
      if (!beginDrag()) return stop(false);
    }
    drag.pointerY = event.clientY;
    showDrag();
  }

  function onPointerUp(event) {
    const current = press || drag;
    if (current && event.pointerId === current.pointerId) stop(true);
  }

  function onPointerCancel(event) {
    const current = press || drag;
    if (current && event.pointerId === current.pointerId) stop(false);
  }

  function onKeyDown(event) {
    if (event.key !== 'Escape') return;
    // Escape puts a dragged todo back; it should not close the window on top of that.
    if (drag) {
      event.preventDefault();
      event.stopPropagation();
    }
    stop(false);
  }

  function onWindowBlur() {
    stop(false);
  }

  /** Turns the press into a drag. Returns false if the list is not in a state to be reordered. */
  function beginDrag() {
    const { id, item, list, pointerId, y } = press;
    press = null;

    const items = [...list.querySelectorAll(ITEM)];
    const from = items.indexOf(item);
    // Row n has to be todo n for a position among the rows to mean a position in the list.
    if (from === -1 || items.length < 2 || items.length !== store.todos.length || store.todos[from].id !== id) {
      return false;
    }

    // Positions are measured once and within the scrolled content of the list, so they stay
    // valid while the list scrolls and while the rows are shifted around.
    const listTop = list.getBoundingClientRect().top;
    const boxes = items.map((element) => {
      const box = element.getBoundingClientRect();
      return { top: box.top - listTop + list.scrollTop, height: box.height };
    });

    drag = {
      id,
      list,
      items,
      boxes,
      from,
      to: from,
      pointerId,
      pointerY: y,
      grabbedAt: y - listTop + list.scrollTop,
      frame: 0,
    };

    const background = backgroundBehind(list);
    if (background) item.style.setProperty(BACKGROUND_PROPERTY, background);
    item.classList.add(DRAGGED_CLASS);
    list.classList.add(SORTING_CLASS);
    list.addEventListener('scroll', showDrag);
    drag.frame = requestAnimationFrame(scrollNearEdges);
    return true;
  }

  /** Puts the dragged row under the pointer and moves the rows it has passed out of its way. */
  function showDrag() {
    if (!drag) return;
    const { list, items, boxes, from } = drag;
    const own = boxes[from];
    const last = boxes[boxes.length - 1];

    const pointer = drag.pointerY - list.getBoundingClientRect().top + list.scrollTop;
    const offset = clamp(pointer - drag.grabbedAt, boxes[0].top - own.top, last.top + last.height - own.top - own.height);
    const top = own.top + offset;
    const bottom = top + own.height;

    // A row makes way once the leading edge of the dragged row has crossed its middle.
    let to = from;
    items.forEach((element, index) => {
      const middle = boxes[index].top + boxes[index].height / 2;
      let shift = 0;
      if (index === from) {
        shift = offset;
      } else if (index < from && top < middle) {
        shift = own.height;
        to = Math.min(to, index);
      } else if (index > from && bottom > middle) {
        shift = -own.height;
        to = Math.max(to, index);
      }
      const transform = shift ? `translateY(${shift}px)` : '';
      if (element.style.transform !== transform) element.style.transform = transform;
    });
    drag.to = to;
  }

  /** Scrolls the list while the pointer is held near its top or bottom edge. */
  function scrollNearEdges() {
    if (!drag) return;
    const { list, pointerY } = drag;
    const box = list.getBoundingClientRect();
    const above = box.top + SCROLL_ZONE - pointerY;
    const below = pointerY - (box.bottom - SCROLL_ZONE);

    let step = 0;
    if (above > 0) step = -Math.ceil(Math.min(1, above / SCROLL_ZONE) * SCROLL_SPEED);
    else if (below > 0) step = Math.ceil(Math.min(1, below / SCROLL_ZONE) * SCROLL_SPEED);
    if (step) {
      const before = list.scrollTop;
      list.scrollTop = before + step;
      if (list.scrollTop !== before) showDrag();
    }
    drag.frame = requestAnimationFrame(scrollNearEdges);
  }

  /** Ends a press or a drag. With `drop`, a dragged todo stays where it was let go. */
  function stop(drop) {
    listen(false);
    const ended = drag;
    press = null;
    drag = null;
    if (!ended) return;

    cancelAnimationFrame(ended.frame);
    ended.list.removeEventListener('scroll', showDrag);
    // Removing the class first switches the animation off, so the rows snap back at once and
    // PetiteVue then puts them in their new order without anything sliding around.
    ended.list.classList.remove(SORTING_CLASS);
    for (const element of ended.items) {
      element.classList.remove(DRAGGED_CLASS);
      element.style.removeProperty(BACKGROUND_PROPERTY);
      element.style.transform = '';
      if (!element.getAttribute('style')) element.removeAttribute('style');
    }

    if (drop && ended.to !== ended.from) store.move(ended.id, ended.to);
  }

  /** Arrow up and arrow down on a handle move its todo by one place. */
  function moveWithKeys(event, id) {
    if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
    const step = { ArrowUp: -1, ArrowDown: 1 }[event.key];
    if (!step) return;
    event.preventDefault(); // the arrow keys would scroll the list
    event.stopPropagation(); // and the key is used up: nothing else that listens for keys should act on it

    const from = store.todos.findIndex((todo) => todo.id === id);
    const to = from + step;
    if (drag || from === -1 || to < 0 || to >= store.todos.length) return;
    if (!store.move(id, to)) return;

    // Moving the row in the page takes the focus off its handle. Give it back once the row has
    // been moved, so the key can be pressed again; that also scrolls the row into view.
    requestAnimationFrame(() => {
      const item = host.querySelectorAll(ITEM)[to];
      const handle = item && item.querySelector(HANDLE);
      if (handle) handle.focus();
    });
  }

  /** Lets go of a todo that is being dragged and leaves it where it was. */
  function cancel() {
    stop(false);
  }

  return { startDrag, moveWithKeys, cancel };
}
