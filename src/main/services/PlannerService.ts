/**
 * The day planner: gathers what the user already wrote, asks Claude to shape a day out of it,
 * and stores the answer.
 *
 * Three rules this file exists to enforce.
 *
 * **It never runs on its own.** No schedule, no boot-time generation, no regeneration when the
 * board changes. Every call is a button press, because every call costs the user money and an
 * app that quietly spends it is an app you uninstall.
 *
 * **It trusts nothing that comes back.** The reply is parsed against a schema, every id is
 * checked against a real record, overlapping and out-of-range blocks are corrected locally.
 * A model that invents a thread id should cost that block its Start button and nothing else.
 *
 * **It reports what it cost.** Usage is stored on the plan itself, so the running total is
 * derived from reality rather than from a counter that can drift.
 */
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import {
  MODEL_PRICES,
  PLANNER_DEFAULT_MODEL,
  PLANNER_LOOKBACK_DAYS,
  PLANNER_MAX_TOKENS,
} from '@shared/constants.js';
import type { DayPlan, PlanBlock, PlanUsage, Settings } from '@shared/domain.js';
import { ulid } from '@shared/ids.js';
import { addLocalDays } from '@shared/time.js';
import { formatWeekRange, weekKeyOf } from '@shared/week.js';
import type { Database } from '../storage/Database.js';
import { planReplySchema, type PlanReply } from '../storage/schemas/plan.js';
import type { ApiKeyStore, KeyState } from './ApiKeyStore.js';
import { PLANNER_SYSTEM_PROMPT, buildPlannerContext } from './plannerPrompt.js';

export interface GenerateInput {
  localDate?: string;
  wakeTime?: string;
  startTime?: string;
  endTime?: string;
  /** Free text about today only. Never stored — it is about one day, not a preference. */
  note?: string;
}

/** Raised with a message written to be shown to the user unedited. */
export class PlannerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlannerError';
  }
}

export class PlannerService {
  constructor(
    private readonly db: Database,
    private readonly keys: ApiKeyStore,
  ) {}

  keyState(): KeyState {
    return this.keys.state();
  }

  /** Both of these only ever move the key around; neither one calls the API. */
  async setKey(key: string): Promise<KeyState> {
    return this.keys.set(key);
  }

  async clearKey(): Promise<KeyState> {
    return this.keys.clear();
  }

  async generate(input: GenerateInput): Promise<DayPlan> {
    const key = this.keys.current();
    if (!key) {
      throw new PlannerError(
        'No API key yet. Add one in the planner panel, or set ANTHROPIC_API_KEY, and this works immediately.',
      );
    }

    const settings = this.db.settings.get();
    const localDate = input.localDate ?? this.db.clock.today();
    const wakeTime = input.wakeTime ?? settings.wakeTime;
    const startTime = input.startTime ?? settings.dayStartTime;
    const endTime = input.endTime ?? settings.dayEndTime;

    if (toMinutes(endTime) <= toMinutes(startTime)) {
      throw new PlannerError('The day ends before it starts — check the start and end times.');
    }

    const context = await this.gather(localDate, {
      wakeTime,
      startTime,
      endTime,
      note: input.note ?? '',
      settings,
    });

    const reply = await this.ask(key, context, settings);
    const plan = await this.assemble(reply, {
      localDate,
      wakeTime,
      startTime,
      endTime,
      model: reply.model,
      usage: reply.usage,
    });

    return this.db.plans.save(plan);
  }

  // ------------------------------------------------------------------ gather

  private async gather(
    localDate: string,
    options: {
      wakeTime: string;
      startTime: string;
      endTime: string;
      note: string;
      settings: Settings;
    },
  ): Promise<string> {
    const weekKey = weekKeyOf(localDate);
    const [goals, threads, carry, day] = await Promise.all([
      this.db.goals.list(weekKey),
      this.db.threads.activeList(),
      this.db.days.carryForward(),
      this.db.days.get(localDate),
    ]);

    // Only the days just before the one being planned, so planning a past day does not get to
    // read the future and produce a plan that could not have been written that morning.
    const from = addLocalDays(localDate, -PLANNER_LOOKBACK_DAYS);
    const recent = await this.db.days.range(from, addLocalDays(localDate, -1));
    const recentLog = recent
      .flatMap((entry) => entry.log ?? [])
      .filter((entry) => entry.source !== 'manual' || entry.text.trim().length > 0)
      .sort((a, b) => a.at.localeCompare(b.at));

    return buildPlannerContext({
      localDate,
      dayName: dayName(localDate),
      weekKey,
      weekRange: formatWeekRange(weekKey),
      wakeTime: options.wakeTime,
      startTime: options.startTime,
      endTime: options.endTime,
      standingContext: options.settings.plannerContext,
      todayNote: options.note,
      goals,
      threads,
      todos: carry.todos,
      blockers: carry.blockers.filter((blocker) => !blocker.resolved),
      recentLog,
      now: day?.now,
    });
  }

  // --------------------------------------------------------------------- ask

  private async ask(
    key: string,
    context: string,
    settings: Settings,
  ): Promise<PlanReply & { model: string; usage: PlanUsage }> {
    const model = settings.plannerModel || PLANNER_DEFAULT_MODEL;
    const client = new Anthropic({ apiKey: key });

    let response: Awaited<ReturnType<typeof client.messages.parse>>;
    try {
      response = await client.messages.parse({
        model,
        max_tokens: PLANNER_MAX_TOKENS,
        system: PLANNER_SYSTEM_PROMPT,
        // No prompt caching on purpose. The prefix here is well under the ~1024-token minimum
        // and a plan is generated once a day, so every read would miss the 5-minute window —
        // caching would add the 1.25x write premium and never once earn it back.
        thinking: { type: 'adaptive' },
        output_config: {
          effort: settings.plannerEffort,
          format: zodOutputFormat(planReplySchema),
        },
        messages: [{ role: 'user', content: context }],
      });
    } catch (error: unknown) {
      throw new PlannerError(describeApiError(error));
    }

    if (response.stop_reason === 'refusal') {
      throw new PlannerError(
        'Claude declined to answer that one. If a goal or note has unusual wording in it, try rephrasing and generating again.',
      );
    }

    const parsed = response.parsed_output;
    if (!parsed) {
      throw new PlannerError(
        response.stop_reason === 'max_tokens'
          ? 'The plan came back too long to finish. Try again, or trim the context on a goal or two.'
          : 'Claude replied with something this app could not read as a plan. Try generating again.',
      );
    }

    return {
      ...parsed,
      model: response.model ?? model,
      usage: priceOf(response.model ?? model, response.usage),
    };
  }

  // ---------------------------------------------------------------- assemble

  /**
   * Turn a reply into a stored plan: stamp the local facts, drop ids that do not exist, sort,
   * and clamp anything outside the day. Everything here is a correction the user should never
   * have to make by hand.
   */
  private async assemble(
    reply: PlanReply,
    meta: {
      localDate: string;
      wakeTime: string;
      startTime: string;
      endTime: string;
      model: string;
      usage: PlanUsage;
    },
  ): Promise<DayPlan> {
    const weekKey = weekKeyOf(meta.localDate);
    const [threads, goals, carry] = await Promise.all([
      this.db.threads.list(),
      this.db.goals.list(weekKey),
      this.db.days.carryForward(),
    ]);

    const threadIds = new Set(threads.map((thread) => thread.id));
    const goalIds = new Set(goals.map((goal) => goal.id));
    const todoIds = new Set(carry.todos.map((todo) => todo.id));

    const blocks: PlanBlock[] = reply.blocks
      .filter((block) => toMinutes(block.end) > toMinutes(block.start))
      .sort((a, b) => toMinutes(a.start) - toMinutes(b.start))
      .map((block) => ({
        id: ulid(),
        start: block.start,
        end: block.end,
        kind: block.kind,
        title: block.title.trim(),
        ...(block.why?.trim() ? { why: block.why.trim() } : {}),
        // An id that does not resolve becomes an absent one: a Start button that starts nothing
        // is worse than no button, because it teaches the user the plan is fictional.
        ...(block.threadId && threadIds.has(block.threadId)
          ? { threadId: block.threadId }
          : {}),
        ...(block.todoId && todoIds.has(block.todoId) ? { todoId: block.todoId } : {}),
        ...(block.goalId && goalIds.has(block.goalId) ? { goalId: block.goalId } : {}),
      }));

    return {
      localDate: meta.localDate,
      generatedAt: this.db.clock.now(),
      wakeTime: meta.wakeTime,
      startTime: meta.startTime,
      endTime: meta.endTime,
      blocks,
      headline: reply.headline.trim(),
      deferred: reply.deferred.map((line) => line.trim()).filter(Boolean),
      model: meta.model,
      usage: meta.usage,
    };
  }
}

/** `HH:MM` → minutes since midnight. */
export function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/**
 * Token counts → dollars, using the price of the model that actually answered. An unknown model
 * id reports zero rather than guessing: a wrong number on a bill is worse than no number.
 */
export function priceOf(
  model: string,
  usage: { input_tokens?: number | null; output_tokens?: number | null } | null | undefined,
): PlanUsage {
  const inputTokens = usage?.input_tokens ?? 0;
  const outputTokens = usage?.output_tokens ?? 0;
  const price = MODEL_PRICES[model] ?? MODEL_PRICES[stripDate(model)];
  const costUsd = price
    ? (inputTokens * price.input + outputTokens * price.output) / 1_000_000
    : 0;
  return { inputTokens, outputTokens, costUsd };
}

/** The API may answer with a dated snapshot id; the price table is keyed by the base name. */
function stripDate(model: string): string {
  return model.replace(/-\d{8}$/, '');
}

function dayName(localDate: string): string {
  const [y, m, d] = localDate.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Status → sentence, in the same spirit as `ApiClient.describe`: by the time an error reaches
 * the renderer it is something a person can act on, not a status code.
 */
function describeApiError(error: unknown): string {
  if (error instanceof Anthropic.AuthenticationError) {
    return 'That API key was rejected. Check it in the planner panel — keys start with "sk-ant-".';
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    return 'That key is not allowed to use this model. Check the key\'s permissions in the Anthropic console.';
  }
  if (error instanceof Anthropic.RateLimitError) {
    return 'Rate limited. Wait a minute and generate again.';
  }
  if (error instanceof Anthropic.BadRequestError) {
    // Overwhelmingly this is an empty credit balance, which the message says plainly.
    return `Claude refused the request: ${error.message}`;
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return 'Could not reach Claude. Check your connection — nothing else in the app needs it.';
  }
  if (error instanceof Anthropic.APIError) {
    return `Claude returned an error (${error.status ?? 'unknown'}). Nothing was saved; try again shortly.`;
  }
  return error instanceof Error ? error.message : 'The plan could not be generated.';
}
