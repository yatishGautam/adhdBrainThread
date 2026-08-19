/**
 * The system prompt, and the context bundle that goes with it.
 *
 * Kept in its own file because it is the part most likely to be edited by hand and least likely
 * to be edited safely inside a service. Two things shape everything here:
 *
 *  1. **Every token is money.** The bundle is built to be small — ids, one line each, no prose
 *     wrapping, no fields the model cannot act on. Sending the whole board and letting the model
 *     sort it out would roughly triple the input for no better plan.
 *  2. **The plan has to be arguable.** A schedule handed down without reasons gets followed once
 *     and ignored after. Hence `why` on a block and `deferred` at the end: the model has to say
 *     what it dropped, so the user can disagree with a decision instead of discovering a gap.
 */
import {
  BREAK_MS,
  DEFAULT_SESSION_MS,
  PLANNER_GOAL_CONTEXT_CHARS,
  PLANNER_MAX_BLOCKERS,
  PLANNER_MAX_GOALS,
  PLANNER_MAX_RECENT_LOG,
  PLANNER_MAX_THREADS,
  PLANNER_MAX_TODOS,
} from '@shared/constants.js';
import type { Blocker, Goal, LogEntry, Thread, Todo } from '@shared/domain.js';
import { nextAction } from '../storage/stepOrder.js';

const FOCUS_MINUTES = Math.round(DEFAULT_SESSION_MS / 60_000);
const BREAK_MINUTES = Math.round(BREAK_MS / 60_000);

/**
 * Written for someone with ADHD, which changes the advice in specific ways rather than in tone:
 * the expensive failure is not laziness, it is a day with six priorities and no first step. So
 * the rules push toward fewer commitments, concrete openings, explicit transitions, and slack —
 * and against the tidy, fully-packed schedule that looks responsible and collapses by 11am.
 */
export const PLANNER_SYSTEM_PROMPT = `You plan one day at a time for someone with ADHD, using their own weekly goals and current work as the raw material.

You are given: their goals for this week (each with optional context they wrote themselves), their open threads (bigger pieces of work, each with its next unfinished step), their loose to-dos, anything currently blocking them, and what they finished over the last couple of days. Every item carries an id.

How to plan:

- Pick ONE thing that matters most today and make it unmistakable in the headline. A day with five priorities has none.
- Put the hardest, most goal-advancing focus work in the first working blocks. Executive function is a budget that is spent, not a constant.
- Use ${FOCUS_MINUTES}-minute focus blocks with ${BREAK_MINUTES}-minute breaks — that is the rhythm this app's timer runs. Two or three focus blocks back to back, then something longer.
- Titles must name a concrete first action. "Draft the opening section of the proposal" is usable; "work on proposal" is not, and a vague title is the single most common reason a block gets skipped.
- Batch shallow work — email, admin, small errands — into one or two admin blocks. Sprinkling them between focus blocks destroys the focus blocks.
- Leave real slack. Plan roughly 60-70% of the available hours; transitions, overruns and life take the rest. A plan with no gaps is a plan that fails at the first overrun.
- Include meals and a wind_down. Someone who forgets to eat will forget to eat.
- Never schedule work that is blocked. If a blocker is cheap to clear, schedule clearing it instead.
- Respect the wake time: no work block before the day's start time, nothing after the end time.
- Do not try to fit everything in. Whatever does not fit goes in "deferred", said plainly. Dropping things silently is the one thing that makes a plan untrustworthy.

Ids:
- When a block works on a thread, to-do, or goal you were given, copy that id exactly into threadId / todoId / goalId. This is what lets the app start a real timer on that block.
- Never invent an id, and never reuse one for something it does not refer to. If a block is not one of the listed items — a meal, a break, a general admin block — simply leave the id fields out.

Tone: direct and warm, addressed to them as "you". No motivational filler, no praise for existing, no exclamation marks. You are a colleague who has read their notes and has an opinion about today.`;

export interface PlannerInput {
  localDate: string;
  /** Human-readable, e.g. `Wednesday, 19 August 2026`. Weekday changes a plan a lot. */
  dayName: string;
  weekKey: string;
  weekRange: string;
  wakeTime: string;
  startTime: string;
  endTime: string;
  /** The always-true context from settings: fixed meetings, medication, energy patterns. */
  standingContext: string;
  /** Anything about today specifically, typed into the generate bar. */
  todayNote: string;
  goals: Goal[];
  threads: Thread[];
  todos: Todo[];
  blockers: Blocker[];
  recentLog: LogEntry[];
  /** What they said they are in the middle of, from the daily page. */
  now: string | undefined;
}

/**
 * The user message: a compact, labelled digest rather than JSON.
 *
 * Prose-with-labels costs meaningfully fewer tokens than pretty-printed JSON for the same facts
 * (no braces, quotes or repeated keys), and the model reads it just as reliably. Ids are put in
 * brackets at the end of each line so they are unambiguous without a key name spent on every one.
 */
export function buildPlannerContext(input: PlannerInput): string {
  const sections: string[] = [];

  sections.push(
    [
      `DATE: ${input.dayName} (${input.localDate})`,
      `WEEK: ${input.weekKey}, ${input.weekRange}`,
      `WOKE: ${input.wakeTime} · WORK FROM: ${input.startTime} · DONE BY: ${input.endTime}`,
    ].join('\n'),
  );

  if (input.standingContext.trim()) {
    sections.push(`ALWAYS TRUE:\n${truncate(input.standingContext.trim(), 800)}`);
  }
  if (input.todayNote.trim()) {
    sections.push(`TODAY SPECIFICALLY:\n${truncate(input.todayNote.trim(), 600)}`);
  }
  if (input.now?.trim()) {
    sections.push(`MID-FLIGHT RIGHT NOW: ${truncate(input.now.trim(), 200)}`);
  }

  sections.push(goalsSection(input.goals));
  sections.push(threadsSection(input.threads));
  sections.push(todosSection(input.todos));

  if (input.blockers.length) {
    const lines = input.blockers
      .slice(0, PLANNER_MAX_BLOCKERS)
      .map((blocker) => `- ${oneLine(blocker.text)} (since ${blocker.localDate})`);
    sections.push(`BLOCKED ON:\n${lines.join('\n')}`);
  }

  if (input.recentLog.length) {
    const lines = input.recentLog
      .slice(-PLANNER_MAX_RECENT_LOG)
      .map((entry) => `- ${entry.localDate}: ${oneLine(entry.text)}`);
    sections.push(`FINISHED RECENTLY:\n${lines.join('\n')}`);
  }

  sections.push('Plan today.');
  return sections.join('\n\n');
}

function goalsSection(goals: Goal[]): string {
  const open = goals.filter((goal) => !goal.done).slice(0, PLANNER_MAX_GOALS);
  if (!open.length) {
    return 'GOALS THIS WEEK:\n(none set — plan from the threads and to-dos below, and say so in the headline)';
  }

  const lines = open.map((goal) => {
    const head = `- ${oneLine(goal.title)} [${goal.id}]`;
    const context = goal.context.trim();
    if (!context) return head;
    // Indented under its goal so a multi-line note cannot be mistaken for a second goal.
    const body = truncate(context, PLANNER_GOAL_CONTEXT_CHARS)
      .split('\n')
      .map((line) => `    ${line}`)
      .join('\n');
    return `${head}\n${body}`;
  });

  const done = goals.filter((goal) => goal.done).length;
  const tail = done ? `\n(${done} more already done this week)` : '';
  return `GOALS THIS WEEK:\n${lines.join('\n')}${tail}`;
}

function threadsSection(threads: Thread[]): string {
  if (!threads.length) return 'OPEN THREADS:\n(none)';

  const lines = threads.slice(0, PLANNER_MAX_THREADS).map((thread) => {
    const step = nextAction(thread.steps);
    const parts = [`- ${oneLine(thread.title)} [${thread.id}]`, `status ${thread.status}`];
    if (thread.status === 'waiting' && thread.waitingOn) {
      parts.push(`waiting on ${oneLine(thread.waitingOn)}`);
    }
    if (step) parts.push(`next step: ${oneLine(step.text)}`);
    return parts.join(' · ');
  });
  return `OPEN THREADS:\n${lines.join('\n')}`;
}

function todosSection(todos: Todo[]): string {
  const open = todos.filter((todo) => !todo.done);
  if (!open.length) return 'TO-DOS:\n(none outstanding)';

  const shown = open.slice(0, PLANNER_MAX_TODOS);
  const lines = shown.map(
    (todo) => `- ${oneLine(todo.text)} [${todo.id}] (since ${todo.localDate})`,
  );
  const hidden = open.length - shown.length;
  const tail = hidden > 0 ? `\n(and ${hidden} more not shown)` : '';
  return `TO-DOS:\n${lines.join('\n')}${tail}`;
}

/** Newlines inside a bullet would break the one-item-per-line contract the ids rely on. */
function oneLine(text: string): string {
  return truncate(text.replace(/\s+/g, ' ').trim(), 200);
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
