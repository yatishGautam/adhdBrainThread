import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { BREAK_MS } from '@shared/constants.js';
import type { StageState } from '@shared/ipc/channels.js';
import { StageController } from './StageController.js';

const FOCUS_MS = 25 * 60 * 1000;

function build(): {
  stages: StageController;
  states: (StageState | null)[];
  ended: [string, string][];
  started: string[];
} {
  const states: (StageState | null)[] = [];
  const ended: [string, string][] = [];
  const started: string[] = [];
  const stages = new StageController(
    {
      onChanged: (state) => states.push(state),
      onTick: () => {},
      onStageEnded: (finished, next) => ended.push([finished, next]),
      onStartFocus: async (threadId) => {
        started.push(threadId);
      },
    },
    () => FOCUS_MS,
  );
  return { stages, states, ended, started };
}

describe('StageController', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('parks on the break, paused, when a focus block finishes', () => {
    const { stages, ended } = build();
    stages.awaitBreak('thread-1', 'Write the spec');

    expect(stages.current()).toMatchObject({
      kind: 'break',
      running: false,
      remainingMs: BREAK_MS,
      threadTitle: 'Write the spec',
    });
    expect(ended).toEqual([['focus', 'break']]);
  });

  it('never counts down until the user resumes', () => {
    const { stages } = build();
    stages.awaitBreak('thread-1', 'Write the spec');

    vi.advanceTimersByTime(60_000);

    expect(stages.current()?.remainingMs).toBe(BREAK_MS);
    expect(stages.current()?.running).toBe(false);
  });

  it('counts the break down once resumed, then parks on the next focus block', async () => {
    const { stages, ended } = build();
    stages.awaitBreak('thread-1', 'Write the spec');
    await stages.resume();

    vi.advanceTimersByTime(60_000);
    expect(stages.current()?.remainingMs).toBe(BREAK_MS - 60_000);

    vi.advanceTimersByTime(BREAK_MS);
    expect(stages.current()).toMatchObject({
      kind: 'focus',
      running: false,
      remainingMs: FOCUS_MS,
    });
    expect(ended).toEqual([
      ['focus', 'break'],
      ['break', 'focus'],
    ]);
  });

  it('starts a real session when the focus stage is resumed, and clears itself', async () => {
    const { stages, started } = build();
    stages.awaitBreak('thread-1', 'Write the spec');
    await stages.skip();

    expect(stages.current()?.kind).toBe('focus');

    await stages.resume();
    expect(started).toEqual(['thread-1']);
    expect(stages.current()).toBeNull();
  });

  it('adds parked time to a running break and never subtracts', async () => {
    const { stages } = build();
    stages.awaitBreak('thread-1', 'Write the spec');
    await stages.resume();
    vi.advanceTimersByTime(60_000);

    expect(stages.grant(120_000)).toBe(true);
    expect(stages.current()?.remainingMs).toBe(BREAK_MS - 60_000 + 120_000);
    expect(stages.current()?.plannedMs).toBe(BREAK_MS + 120_000);
  });

  it('has nothing to grant when the cycle is idle or waiting on a focus block', async () => {
    const { stages } = build();
    expect(stages.grant(120_000)).toBe(false);

    stages.awaitBreak('thread-1', 'Write the spec');
    await stages.skip();
    expect(stages.grant(120_000)).toBe(false);
  });

  it('stops cleanly and reports the cleared state once', () => {
    const { stages, states } = build();
    stages.awaitBreak('thread-1', 'Write the spec');
    stages.stop();
    stages.stop();

    expect(stages.current()).toBeNull();
    expect(states.filter((state) => state === null)).toHaveLength(1);
  });
});
