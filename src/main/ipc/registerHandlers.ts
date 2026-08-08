/**
 * Every `ipcMain.handle` the app has, in one file, keyed by the channel names in
 * `@shared/ipc/channels.ts`. If a channel is missing here, `preload`'s typed `invoke` still
 * compiles — this is the one place a mismatch would only show up at runtime, so channel names
 * are typed against `Requests` to catch typos early.
 */
import { app, ipcMain, shell } from 'electron';
import path from 'node:path';
import type { Requests } from '@shared/ipc/channels.js';
import { WIP_IN_PROGRESS_CAP } from '@shared/constants.js';
import type { AppContext } from '../AppContext.js';

type Handler<K extends keyof Requests> = (
  ctx: AppContext,
  payload: Requests[K][0],
) => Promise<Requests[K][1]> | Requests[K][1];

function on<K extends keyof Requests>(channel: K, handler: Handler<K>, ctx: AppContext): void {
  ipcMain.handle(channel, (_event, payload: Requests[K][0]) => handler(ctx, payload));
}

export function registerHandlers(ctx: AppContext): void {
  const { db, sessions, analytics, celebrations } = ctx;

  // ------------------------------------------------------------------ threads

  on('threads:list', async () => db.threads.list(), ctx);
  on('threads:get', async (_c, { id }) => db.threads.get(id), ctx);
  on('threads:create', async (_c, { title, notes }) => {
    const thread = await db.threads.create(title, notes);
    ctx.broadcastThreads();
    return thread;
  }, ctx);
  on('threads:update', async (_c, { id, patch }) => {
    const thread = await ctx.db.threads.get(id);
    if (!thread) throw new Error('thread not found');
    const saved = await db.threads.save({ ...thread, ...patch });
    ctx.broadcastThreads();
    return saved;
  }, ctx);
  on('threads:setStatus', async (_c, { id, status, waitingOn }) => {
    if (status === 'in_progress') {
      const active = (await db.threads.list()).filter((t) => t.status === 'in_progress' && t.id !== id);
      if (active.length >= WIP_IN_PROGRESS_CAP) {
        throw new Error(`At most ${WIP_IN_PROGRESS_CAP} threads can be in progress at once.`);
      }
    }
    const thread = await db.threads.setStatus(id, status, waitingOn);
    if (status === 'done') {
      await onThreadCompleted(ctx, thread.id);
    } else if (sessions.currentThreadId() === id) {
      await sessions.end('ended_early');
    }
    ctx.broadcastThreads();
    return thread;
  }, ctx);
  on('threads:remove', async (_c, { id }) => {
    if (sessions.currentThreadId() === id) await sessions.end('ended_early');
    await db.threads.remove(id);
    ctx.broadcastThreads();
  }, ctx);
  on('threads:done', async (_c, query) => db.threads.donePage(query), ctx);

  // -------------------------------------------------------------------- steps

  on('steps:add', async (_c, { threadId, text, afterStepId }) => {
    const thread = await db.threads.addStep(threadId, text, afterStepId);
    ctx.broadcastThreads();
    return thread;
  }, ctx);
  on('steps:toggle', async (_c, { threadId, stepId }) => {
    const thread = await db.threads.toggleStep(threadId, stepId);
    await analytics.touchDays([db.clock.today()]);
    ctx.broadcastThreads();
    ctx.microTick();
    return thread;
  }, ctx);
  on('steps:update', async (_c, { threadId, stepId, text }) => {
    const thread = await db.threads.updateStep(threadId, stepId, text);
    ctx.broadcastThreads();
    return thread;
  }, ctx);
  on('steps:remove', async (_c, { threadId, stepId }) => {
    const thread = await db.threads.removeStep(threadId, stepId);
    ctx.broadcastThreads();
    return thread;
  }, ctx);
  on('steps:reorder', async (_c, { threadId, stepId, toIndex }) => {
    const thread = await db.threads.reorderStep(threadId, stepId, toIndex);
    ctx.broadcastThreads();
    return thread;
  }, ctx);

  // --------------------------------------------------------------------- day

  on('day:get', async (_c, { localDate }) => db.days.get(localDate), ctx);
  on('day:today', async () => db.days.today(), ctx);
  on('day:list', async () => db.days.listDates(), ctx);
  on('day:setIntent', async (_c, { threadIds }) => {
    const day = await db.days.setIntent(threadIds);
    ctx.broadcastDay(day);
    return day;
  }, ctx);
  on('day:setNote', async (_c, { localDate, note }) => {
    const day = await db.days.setNote(localDate, note);
    ctx.broadcastDay(day);
    return day;
  }, ctx);

  // -------------------------------------------------------------------- todo

  on('todo:add', async (_c, { text }) => {
    const day = await db.days.addTodo(text);
    ctx.broadcastDay(day);
    return day;
  }, ctx);
  on('todo:toggle', async (_c, { localDate, todoId }) => {
    const day = await db.days.toggleTodo(localDate, todoId);
    ctx.broadcastDay(day);
    ctx.microTick();
    return day;
  }, ctx);
  on('todo:update', async (_c, { localDate, todoId, text }) => {
    const day = await db.days.updateTodo(localDate, todoId, text);
    ctx.broadcastDay(day);
    return day;
  }, ctx);
  on('todo:remove', async (_c, { localDate, todoId }) => {
    const day = await db.days.removeTodo(localDate, todoId);
    ctx.broadcastDay(day);
    return day;
  }, ctx);
  on('todo:reorder', async (_c, { localDate, todoId, toIndex }) => {
    const day = await db.days.reorderTodo(localDate, todoId, toIndex);
    ctx.broadcastDay(day);
    return day;
  }, ctx);
  on('todo:promote', async (_c, { localDate, todoId }) => {
    const todo = await db.days.findTodo(localDate, todoId);
    if (!todo) throw new Error('todo not found');
    // The todo is never deleted — only linked — so the history stays honest.
    const thread = await db.threads.create(todo.text);
    const day = await db.days.linkPromotedTodo(localDate, todoId, thread.id);
    ctx.broadcastDay(day);
    ctx.broadcastThreads();
    return { day, thread };
  }, ctx);

  // ----------------------------------------------------------------- thought

  on('thought:add', async (_c, { text }) => {
    const day = await db.days.addThought(text);
    ctx.broadcastDay(day);
    return day;
  }, ctx);
  on('thought:remove', async (_c, { localDate, thoughtId }) => {
    const day = await db.days.removeThought(localDate, thoughtId);
    ctx.broadcastDay(day);
    return day;
  }, ctx);
  on('thought:process', async (_c, { localDate, thoughtId, action }) => {
    const thought = await db.days.findThought(localDate, thoughtId);
    if (!thought) throw new Error('thought not found');
    let thread = null;
    if (action === 'thread') thread = await db.threads.create(thought.text);
    else if (action === 'todo') await db.days.addTodo(thought.text);
    const day = await db.days.markThoughtProcessed(localDate, thoughtId, action);
    ctx.broadcastDay(day);
    if (thread) ctx.broadcastThreads();
    return { day, thread };
  }, ctx);

  // ----------------------------------------------------------------- session

  on('session:start', async (_c, { threadId, plannedMs }) => sessions.start(threadId, plannedMs), ctx);
  on('session:pause', async () => sessions.pause(), ctx);
  on('session:resume', async () => sessions.resume(), ctx);
  on('session:end', async (_c, { outcome }) => {
    await sessions.end(outcome);
    return null;
  }, ctx);
  on('session:switch', async (_c, { threadId }) => sessions.switchTo(threadId), ctx);
  on('session:distraction', async (_c, { kind, note }) => sessions.logDistraction(kind, note), ctx);
  on('session:state', async () => sessions.state(), ctx);
  on('session:forThread', async (_c, { threadId }) => db.sessions.forThread(threadId), ctx);
  on('session:resolveRecovery', async (_c, { sessionId, keep }) => {
    await sessions.resolveRecovery(sessionId, keep);
  }, ctx);

  // --------------------------------------------------------------- analytics

  on('analytics:scope', async (_c, { scope, anchor }) => analytics.summary(scope, anchor), ctx);
  on('analytics:rebuild', async () => {
    await analytics.rebuild();
  }, ctx);

  // ---------------------------------------------------------------- settings

  on('settings:get', async () => db.settings.get(), ctx);
  on('settings:update', async (_c, { patch }) => {
    const settings = await db.settings.update(patch);
    ctx.broadcastSettings(settings);
    return settings;
  }, ctx);

  // -------------------------------------------------------------------- data

  on('data:repair', async () => {
    const { quarantined, compacted } = await db.store.repair();
    await analytics.rebuild();
    return {
      manifestRebuilt: true,
      rollupsRebuilt: true,
      shardsScanned: db.store.shardCount,
      quarantined,
      compactedFrom: compacted.before,
      compactedTo: compacted.after,
    };
  }, ctx);
  on('data:export', async () => {
    const target = path.join(app.getPath('documents'), `thread-export-${Date.now()}.json`);
    await db.store.exportTo(target);
    return { path: target };
  }, ctx);
  on('data:reveal', async () => {
    shell.showItemInFolder(db.root);
  }, ctx);

  // ------------------------------------------------------------------ window

  on('window:mainReady', async () => {
    ctx.onMainReady();
  }, ctx);
  on('hud:show', async () => {
    ctx.openHud();
  }, ctx);
  on('hud:reset', async () => {
    ctx.resetHud();
  }, ctx);
  on('hud:hide', async () => {
    ctx.hud?.hide();
  }, ctx);
  on('celebration:done', async () => {
    celebrations.stop();
  }, ctx);
}

/**
 * Completion flow (§5.2): logs the thread to today, ends any running session on it, then
 * triggers the celebration. Order matters — the session must end before we compute the payload
 * so the totals it reads are final.
 */
async function onThreadCompleted(ctx: AppContext, threadId: string): Promise<void> {
  const { db, sessions, analytics, celebrations } = ctx;
  if (sessions.currentThreadId() === threadId) await sessions.end('completed');

  await db.days.logThread(threadId);
  await analytics.touchDays([db.clock.today()]);

  const thread = await db.threads.get(threadId);
  if (!thread) return;
  await celebrations.celebrate(thread);
}

export { onThreadCompleted };
