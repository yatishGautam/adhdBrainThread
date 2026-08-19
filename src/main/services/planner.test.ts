import { describe, expect, it } from 'vitest';
import type { Blocker, Goal, Thread, Todo } from '@shared/domain.js';
import { buildPlannerContext, type PlannerInput } from './plannerPrompt.js';
import { priceOf, toMinutes } from './PlannerService.js';

describe('priceOf', () => {
  it('prices a call from the model that actually answered', () => {
    // 1581 in / 1487 out on Opus 5 — the numbers from the first real call.
    const usage = priceOf('claude-opus-5', { input_tokens: 1581, output_tokens: 1487 });
    expect(usage.costUsd).toBeCloseTo(0.0451, 4);
  });

  it('prices the cheap model far below the expensive one', () => {
    const args = { input_tokens: 2000, output_tokens: 1500 };
    expect(priceOf('claude-haiku-4-5', args).costUsd).toBeLessThan(
      priceOf('claude-opus-5', args).costUsd / 4,
    );
  });

  it('handles a dated snapshot id by falling back to the base model price', () => {
    expect(priceOf('claude-opus-5-20260101', { input_tokens: 1000, output_tokens: 1000 }).costUsd)
      .toBeCloseTo(priceOf('claude-opus-5', { input_tokens: 1000, output_tokens: 1000 }).costUsd, 6);
  });

  /** A made-up number on a bill is worse than no number, so an unknown model reports zero. */
  it('reports zero rather than guessing for a model it has no price for', () => {
    const usage = priceOf('some-future-model', { input_tokens: 5000, output_tokens: 5000 });
    expect(usage.costUsd).toBe(0);
    expect(usage.inputTokens).toBe(5000);
  });

  it('survives a response with no usage at all', () => {
    expect(priceOf('claude-opus-5', null)).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
    });
  });
});

describe('toMinutes', () => {
  it('orders times across the day', () => {
    expect(toMinutes('09:00')).toBe(540);
    expect(toMinutes('00:00')).toBe(0);
    expect(toMinutes('23:59')).toBe(1439);
    expect(toMinutes('18:30')).toBeGreaterThan(toMinutes('09:15'));
  });
});

describe('buildPlannerContext', () => {
  it('carries every id the model is allowed to reference back', () => {
    const context = buildPlannerContext(input());
    expect(context).toContain('[goal-1]');
    expect(context).toContain('[thread-1]');
    expect(context).toContain('[todo-1]');
  });

  it('indents a goal’s context under it so it cannot read as another goal', () => {
    const context = buildPlannerContext(
      input({
        goals: [goal({ id: 'goal-1', title: 'Ship it', context: 'line one\nline two' })],
      }),
    );
    expect(context).toContain('- Ship it [goal-1]\n    line one\n    line two');
  });

  it('leaves finished goals and to-dos out, but says how many were done', () => {
    const context = buildPlannerContext(
      input({
        goals: [
          goal({ id: 'goal-1', title: 'Open one' }),
          goal({ id: 'goal-2', title: 'Finished one', done: true }),
        ],
      }),
    );
    expect(context).toContain('Open one');
    expect(context).not.toContain('Finished one');
    expect(context).toContain('(1 more already done this week)');
  });

  it('caps a runaway goal context instead of sending an essay', () => {
    const context = buildPlannerContext(
      input({ goals: [goal({ id: 'goal-1', context: 'x'.repeat(5000) })] }),
    );
    expect(context).toContain('…');
    expect(context.length).toBeLessThan(3000);
  });

  it('flattens a multi-line to-do so one item stays one line', () => {
    const context = buildPlannerContext(
      input({ todos: [todo({ id: 'todo-1', text: 'call\nthe\nbank' })] }),
    );
    expect(context).toContain('- call the bank [todo-1]');
  });

  it('says a thread is waiting and on what, so it is not scheduled', () => {
    const context = buildPlannerContext(
      input({
        threads: [
          thread({ id: 'thread-1', title: 'Invoice', status: 'waiting', waitingOn: 'accountant' }),
        ],
      }),
    );
    expect(context).toContain('status waiting · waiting on accountant');
  });

  it('surfaces the next unfinished step, not a finished one', () => {
    const context = buildPlannerContext(
      input({
        threads: [
          thread({
            id: 'thread-1',
            steps: [
              { id: 's1', text: 'already done', done: true, order: 1000 },
              { id: 's2', text: 'the real next thing', done: false, order: 2000 },
            ],
          }),
        ],
      }),
    );
    expect(context).toContain('next step: the real next thing');
    expect(context).not.toContain('already done');
  });

  it('states plainly when there is nothing to plan from', () => {
    const context = buildPlannerContext(input({ goals: [], threads: [], todos: [] }));
    expect(context).toContain('(none set');
    expect(context).toContain('OPEN THREADS:\n(none)');
    expect(context).toContain('(none outstanding)');
  });

  it('omits the optional sections entirely when they are empty', () => {
    const context = buildPlannerContext(input({ blockers: [] }));
    expect(context).not.toContain('BLOCKED ON:');
    expect(context).not.toContain('TODAY SPECIFICALLY:');
  });

  it('includes the times the day is being planned around', () => {
    const context = buildPlannerContext(
      input({ wakeTime: '09:15', startTime: '10:00', endTime: '18:30' }),
    );
    expect(context).toContain('WOKE: 09:15 · WORK FROM: 10:00 · DONE BY: 18:30');
  });
});

// ----------------------------------------------------------------- fixtures

function input(patch: Partial<PlannerInput> = {}): PlannerInput {
  return {
    localDate: '2026-08-19',
    dayName: 'Wednesday, 19 August 2026',
    weekKey: '2026-W34',
    weekRange: 'Aug 17 – 23',
    wakeTime: '07:30',
    startTime: '09:00',
    endTime: '18:00',
    standingContext: '',
    todayNote: '',
    goals: [goal({ id: 'goal-1' })],
    threads: [thread({ id: 'thread-1' })],
    todos: [todo({ id: 'todo-1' })],
    blockers: [blocker()],
    recentLog: [],
    now: undefined,
    ...patch,
  };
}

function goal(patch: Partial<Goal> = {}): Goal {
  return {
    id: 'goal-1',
    title: 'A goal',
    done: false,
    context: '',
    weekKey: '2026-W34',
    order: 1000,
    createdAt: '2026-08-17T09:00:00.000Z',
    updatedAt: '2026-08-17T09:00:00.000Z',
    ...patch,
  };
}

function thread(patch: Partial<Thread> = {}): Thread {
  return {
    id: 'thread-1',
    title: 'A thread',
    notes: '',
    status: 'in_progress',
    steps: [],
    createdAt: '2026-08-17T09:00:00.000Z',
    updatedAt: '2026-08-17T09:00:00.000Z',
    totalFocusMs: 0,
    sessionCount: 0,
    distractionCount: 0,
    archived: false,
    ...patch,
  };
}

function todo(patch: Partial<Todo> = {}): Todo {
  return {
    id: 'todo-1',
    text: 'A to-do',
    done: false,
    localDate: '2026-08-11',
    createdAt: '2026-08-11T09:00:00.000Z',
    order: 1000,
    ...patch,
  };
}

function blocker(patch: Partial<Blocker> = {}): Blocker {
  return {
    id: 'blocker-1',
    text: 'Waiting on the accountant',
    resolved: false,
    localDate: '2026-08-12',
    createdAt: '2026-08-12T09:00:00.000Z',
    ...patch,
  };
}
