// The todo list itself: what is stored, how stored data is validated, and when a change is refused.

export const MAX_TEXT_LENGTH = 200;

// The game gives each mod 8,192 bytes of storage per character. We stop well short of that, so
// the game never has to refuse a save, whatever overhead its own bookkeeping adds to our data.
export const STORAGE_BUDGET = 7400;
const WARN_AT = 0.85;

const KEY_TODOS = 'todos';
const KEY_SNOOZED_ON = 'snoozedOn';

const encoder = new TextEncoder();
let nextId = 1;

/** The local calendar day as YYYY-MM-DD. */
export function todayString(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Turns typed or pasted text into a single line of at most MAX_TEXT_LENGTH characters. */
export function cleanText(raw) {
  let text = (raw == null ? '' : String(raw)).replace(/\s+/g, ' ').trim();
  if (text.length > MAX_TEXT_LENGTH) {
    text = text.slice(0, MAX_TEXT_LENGTH);
    // The cut may have split an emoji in two; drop the dangling half.
    if (/[\uD800-\uDBFF]$/.test(text)) text = text.slice(0, -1);
    text = text.trimEnd();
  }
  return text;
}

// Todos are stored as [done, text] pairs (done is 0 or 1) to make the most of the small budget.
function toStored(todos) {
  return todos.map((todo) => [todo.done ? 1 : 0, todo.text]);
}

/** Rebuilds the list from stored data, skipping anything that is not a valid todo. */
function fromStored(raw) {
  if (!Array.isArray(raw)) return [];
  const todos = [];
  for (const entry of raw) {
    if (!Array.isArray(entry) || typeof entry[1] !== 'string') continue;
    const text = cleanText(entry[1]);
    if (text) todos.push({ id: nextId++, text, done: entry[0] === 1 || entry[0] === true });
  }
  return todos;
}

/** How many bytes the given state takes up in the game's storage. */
function storedBytes(todos, snoozedOn) {
  const entries = [[KEY_TODOS, toStored(todos)]];
  if (snoozedOn) entries.push([KEY_SNOOZED_ON, snoozedOn]);
  return encoder.encode(JSON.stringify(entries)).length;
}

/**
 * Creates the todo store.
 *
 * `storage` is the mod's characterStorage. `makeReactive` is ui.createStore; the window re-renders
 * whenever a property of the returned store changes, so every change has to go through the store's
 * methods. The store always matches what is saved: a change that cannot be saved is not applied.
 */
export function createStore(storage, makeReactive) {
  return makeReactive({
    todos: [], // { id, text, done }; id only exists at runtime
    snoozedOn: '', // the day the startup window was switched off for, as YYYY-MM-DD
    mode: 'manual', // 'startup' while the window is showing because the game was just loaded
    startupEnabled: true, // the "Show on startup" setting, as it was when the window last opened
    newText: '',
    editingId: null,
    editText: '',
    error: '',
    maxLength: MAX_TEXT_LENGTH,

    load() {
      let todos;
      let snoozedOn;
      try {
        todos = storage.getItem(KEY_TODOS);
        snoozedOn = storage.getItem(KEY_SNOOZED_ON);
      } catch (error) {
        console.error('[Todo] Could not read saved todos:', error);
      }
      this.todos = fromStored(todos);
      this.snoozedOn = typeof snoozedOn === 'string' ? snoozedOn : '';
    },

    /** Called each time the window opens: sets why it opened and clears leftovers from last time. */
    prepare(mode, startupEnabled = true) {
      this.mode = mode;
      this.startupEnabled = startupEnabled;
      this.error = '';
      this.cancelEdit();
    },

    openCount() {
      return this.todos.filter((todo) => !todo.done).length;
    },

    doneCount() {
      return this.todos.length - this.openCount();
    },

    usagePercent() {
      return Math.min(100, Math.round((storedBytes(this.todos, this.snoozedOn) / STORAGE_BUDGET) * 100));
    },

    isNearLimit() {
      return storedBytes(this.todos, this.snoozedOn) >= STORAGE_BUDGET * WARN_AT;
    },

    isSnoozed() {
      return this.snoozedOn === todayString();
    },

    add() {
      const text = cleanText(this.newText);
      if (!text) return false;
      const saved = this.save([...this.todos, { id: nextId++, text, done: false }]);
      if (saved) this.newText = '';
      return saved;
    },

    toggle(id) {
      return this.save(this.todos.map((todo) => (todo.id === id ? { ...todo, done: !todo.done } : todo)));
    },

    remove(id) {
      if (this.editingId === id) this.cancelEdit();
      return this.save(this.todos.filter((todo) => todo.id !== id));
    },

    removeCompleted() {
      return this.save(this.todos.filter((todo) => !todo.done));
    },

    /** Moves a todo to the given position in the list; the todos in between shift by one. */
    move(id, toIndex) {
      const from = this.todos.findIndex((todo) => todo.id === id);
      if (from === -1) return false;
      const to = Math.max(0, Math.min(this.todos.length - 1, toIndex));
      if (to === from) return true;
      const next = [...this.todos];
      next.splice(to, 0, next.splice(from, 1)[0]);
      return this.save(next);
    },

    startEdit(id) {
      const todo = this.todos.find((candidate) => candidate.id === id);
      if (!todo) return;
      this.editingId = id;
      this.editText = todo.text;
      this.error = '';
    },

    /** Saves the text being edited. An empty or unchanged text just ends the edit. */
    commitEdit() {
      if (this.editingId === null) return true;
      const id = this.editingId;
      const text = cleanText(this.editText);
      const current = this.todos.find((todo) => todo.id === id);
      if (!current || !text || text === current.text) {
        this.cancelEdit();
        return true;
      }
      const saved = this.save(this.todos.map((todo) => (todo.id === id ? { ...todo, text } : todo)));
      if (saved) this.cancelEdit();
      return saved;
    },

    cancelEdit() {
      this.editingId = null;
      this.editText = '';
    },

    /** Keeps the startup window from opening again today. */
    snooze() {
      const today = todayString();
      try {
        storage.setItem(KEY_SNOOZED_ON, today);
      } catch (error) {
        return this.saveFailed(error);
      }
      this.snoozedOn = today;
      return true;
    },

    unsnooze() {
      try {
        storage.removeItem(KEY_SNOOZED_ON);
      } catch (error) {
        return this.saveFailed(error);
      }
      this.snoozedOn = '';
      return true;
    },

    /** Saves `next` and makes it the current list. Returns false and changes nothing if that fails. */
    save(next) {
      const before = storedBytes(this.todos, this.snoozedOn);
      const after = storedBytes(next, this.snoozedOn);
      // Only growth is refused, so a list that is somehow over budget can still be trimmed down.
      if (after > STORAGE_BUDGET && after > before) {
        this.error = 'Storage is full. Remove some todos to make room.';
        return false;
      }
      try {
        storage.setItem(KEY_TODOS, toStored(next));
      } catch (error) {
        return this.saveFailed(error);
      }
      this.todos = next;
      this.error = '';
      return true;
    },

    saveFailed(error) {
      console.error('[Todo] Could not save:', error);
      this.error = 'Could not save this change. The game refused to store it.';
      return false;
    },
  });
}
