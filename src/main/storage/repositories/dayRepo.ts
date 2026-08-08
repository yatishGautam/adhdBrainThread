import path from 'node:path';
import type { Day, Thought, Todo } from '@shared/domain.js';
import type { ThoughtAction } from '@shared/ipc/channels.js';
import { ulid } from '@shared/ids.js';
import { COLLECTION } from '../collections.js';
import { atomicWriteFile, readFileIfExists } from '../atomicWrite.js';
import { serialise } from '../serialise.js';
import type { Clock } from '../clock.js';
import type { CollectionHandle, ShardedStore } from '../ShardedStore.js';
import { nextOrder, reorder, sortByOrder } from '../stepOrder.js';

/**
 * Days are created on first real interaction only — never by opening the app or navigating to a
 * date. A day that did not happen must not exist, because "nothing accumulates as debt" only
 * holds if the app cannot manufacture empty days to feel bad about.
 */
export class DayRepo {
  /** Sorted list of dates that exist, so the navigator never loads day shards to know. */
  private dates: string[] = [];

  constructor(
    private readonly store: ShardedStore,
    private readonly clock: Clock,
    private readonly root: string,
  ) {}

  private get days(): CollectionHandle<Day> {
    return this.store.collection<Day>(COLLECTION.days);
  }

  private get indexFile(): string {
    return path.join(this.root, 'days', 'index.json');
  }

  async load(): Promise<void> {
    const raw = await readFileIfExists(this.indexFile);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        this.dates = parsed.filter((value): value is string => typeof value === 'string').sort();
        return;
      }
    }
    await this.rebuildIndex();
  }

  /** Cheap to redo: the index is derived, the day shards are truth. */
  async rebuildIndex(): Promise<void> {
    const all = await this.days.all();
    this.dates = all.map((day) => day.localDate).sort();
    await this.persistIndex();
  }

  listDates(): string[] {
    return [...this.dates];
  }

  async get(localDate: string): Promise<Day | null> {
    if (!this.dates.includes(localDate)) return null;
    return this.days.get(localDate);
  }

  /** Read-only peek at today. Returns null when today has not happened yet. */
  async today(): Promise<Day | null> {
    return this.get(this.clock.today());
  }

  /** The only path that brings a day into existence. */
  async ensureToday(): Promise<Day> {
    const localDate = this.clock.today();
    const existing = await this.get(localDate);
    if (existing) return existing;
    const day: Day = {
      localDate,
      createdAt: this.clock.now(),
      intentThreadIds: [],
      todos: [],
      thoughts: [],
      loggedThreadIds: [],
    };
    await this.write(day);
    return day;
  }

  private async write(day: Day): Promise<Day> {
    await this.days.put(day);
    if (!this.dates.includes(day.localDate)) {
      this.dates = [...this.dates, day.localDate].sort();
      await this.persistIndex();
    }
    return day;
  }

  private async persistIndex(): Promise<void> {
    await atomicWriteFile(this.indexFile, serialise(this.dates));
  }

  private async mutateToday(change: (day: Day) => Day): Promise<Day> {
    return this.write(change(await this.ensureToday()));
  }

  private async mutate(localDate: string, change: (day: Day) => Day): Promise<Day> {
    const day = await this.get(localDate);
    if (!day) throw new Error(`day not found: ${localDate}`);
    return this.write(change(day));
  }

  // ------------------------------------------------------------------ todos

  async addTodo(text: string): Promise<Day> {
    return this.mutateToday((day) => {
      const todo: Todo = {
        id: ulid(),
        text: text.trim(),
        done: false,
        localDate: day.localDate,
        createdAt: this.clock.now(),
        order: nextOrder(day.todos),
      };
      return { ...day, todos: [...day.todos, todo] };
    });
  }

  async toggleTodo(localDate: string, todoId: string): Promise<Day> {
    return this.mutate(localDate, (day) => ({
      ...day,
      todos: day.todos.map((todo) => {
        if (todo.id !== todoId) return todo;
        if (todo.done) {
          const { completedAt: _done, ...rest } = todo;
          return { ...rest, done: false };
        }
        return { ...todo, done: true, completedAt: this.clock.now() };
      }),
    }));
  }

  async updateTodo(localDate: string, todoId: string, text: string): Promise<Day> {
    return this.mutate(localDate, (day) => ({
      ...day,
      todos: day.todos.map((todo) => (todo.id === todoId ? { ...todo, text } : todo)),
    }));
  }

  async removeTodo(localDate: string, todoId: string): Promise<Day> {
    return this.mutate(localDate, (day) => ({
      ...day,
      todos: day.todos.filter((todo) => todo.id !== todoId),
    }));
  }

  async reorderTodo(localDate: string, todoId: string, toIndex: number): Promise<Day> {
    return this.mutate(localDate, (day) => ({
      ...day,
      todos: reorder(day.todos, todoId, toIndex).items,
    }));
  }

  /** The todo is never deleted, only linked — the history stays honest. */
  async linkPromotedTodo(localDate: string, todoId: string, threadId: string): Promise<Day> {
    return this.mutate(localDate, (day) => ({
      ...day,
      todos: day.todos.map((todo) =>
        todo.id === todoId ? { ...todo, promotedToThreadId: threadId } : todo,
      ),
    }));
  }

  // --------------------------------------------------------------- thoughts

  async addThought(text: string): Promise<Day> {
    return this.mutateToday((day) => {
      const thought: Thought = {
        id: ulid(),
        text: text.trim(),
        createdAt: this.clock.now(),
        localDate: day.localDate,
        processed: false,
      };
      return { ...day, thoughts: [thought, ...day.thoughts] };
    });
  }

  async removeThought(localDate: string, thoughtId: string): Promise<Day> {
    return this.mutate(localDate, (day) => ({
      ...day,
      thoughts: day.thoughts.filter((thought) => thought.id !== thoughtId),
    }));
  }

  async markThoughtProcessed(localDate: string, thoughtId: string, action: ThoughtAction): Promise<Day> {
    if (action === 'dismiss') return this.removeThought(localDate, thoughtId);
    return this.mutate(localDate, (day) => ({
      ...day,
      thoughts: day.thoughts.map((thought) =>
        thought.id === thoughtId ? { ...thought, processed: true } : thought,
      ),
    }));
  }

  async findThought(localDate: string, thoughtId: string): Promise<Thought | null> {
    const day = await this.get(localDate);
    return day?.thoughts.find((thought) => thought.id === thoughtId) ?? null;
  }

  async findTodo(localDate: string, todoId: string): Promise<Todo | null> {
    const day = await this.get(localDate);
    return day?.todos.find((todo) => todo.id === todoId) ?? null;
  }

  // ------------------------------------------------------------ intent + log

  async setIntent(threadIds: string[]): Promise<Day> {
    return this.mutateToday((day) => ({ ...day, intentThreadIds: threadIds }));
  }

  async setNote(localDate: string, note: string): Promise<Day> {
    return this.mutate(localDate, (day) => ({ ...day, note }));
  }

  /** Auto-filled on completion — this panel is the day's evidence, not something to curate. */
  async logThread(threadId: string): Promise<Day> {
    return this.mutateToday((day) =>
      day.loggedThreadIds.includes(threadId)
        ? day
        : { ...day, loggedThreadIds: [...day.loggedThreadIds, threadId] },
    );
  }

  async sortedTodos(localDate: string): Promise<Todo[]> {
    const day = await this.get(localDate);
    return day ? sortByOrder(day.todos) : [];
  }
}
