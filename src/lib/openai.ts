import type { AIParsedItem } from '../types';
import type { EnergyType } from '../types';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

async function chat(
  apiKey: string,
  systemPrompt: string,
  userMessage: string,
  jsonMode = true
): Promise<string> {
  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      ...(jsonMode ? { 'OpenAI-Beta': 'response_format=json_object' } : {}),
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      response_format: jsonMode ? { type: 'json_object' } : undefined,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(res.status === 401 ? 'Invalid API key' : err || res.statusText);
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty response from OpenAI');
  return content;
}

/** Parse a brain-dump list into structured items (goals + tasks with times per day). */
export async function parseBrainDump(
  apiKey: string,
  brainDump: string,
  existingGoalNames: string[]
): Promise<{ items: AIParsedItem[] }> {
  const systemPrompt = `You are an ADHD-friendly planning assistant. The user has pasted a raw "laundry list" of things they need to do. Your job is to turn this into a structured list that can be scheduled.

Output a single JSON object with this exact shape:
{
  "items": [
    {
      "title": "short clear task title",
      "suggestedGoalName": "optional goal name if this belongs under a goal (e.g. Health, Work, Medication)",
      "timesPerDay": 0 or 1-10 if this must repeat each day (e.g. 3 for medication 3x/day),
      "suggestedTimeSlots": ["08:00", "13:00", "19:00"] only if timesPerDay > 1 — suggest sensible times,
      "estimatedMinutes": 5-120,
      "energyType": "Deep" | "Light" | "Admin",
      "taskType": "GoalTask" | "DeadlineTask" | "FixedEvent" | "MicroTask"
    }
  ]
}

Rules:
- Infer recurring daily tasks (medication, meals, stretch, etc.) and set timesPerDay and suggestedTimeSlots.
- Use GoalTask when it fits under a goal; suggest a short goal name. Use MicroTask for things under 15 min.
- estimatedMinutes: realistic (5–15 for micro, 15–60 for most, up to 120 for deep work).
- energyType: Deep for focus work, Light for routine, Admin for logistics.
- Existing goal names the user has: ${existingGoalNames.join(', ') || '(none)'}. Prefer matching these when relevant.`;

  const userMessage = `Parse this list into structured items. Return only the JSON object, no markdown.\n\n${brainDump}`;
  const raw = await chat(apiKey, systemPrompt, userMessage);
  const parsed = JSON.parse(raw) as { items?: unknown[] };
  const items = (parsed.items ?? []).map((x: unknown) => {
    const r = x as Record<string, unknown>;
    return {
    title: String(r.title ?? ''),
    suggestedGoalName: r.suggestedGoalName != null ? String(r.suggestedGoalName) : undefined,
    timesPerDay: typeof r.timesPerDay === 'number' ? r.timesPerDay : undefined,
    suggestedTimeSlots: Array.isArray(r.suggestedTimeSlots)
      ? (r.suggestedTimeSlots as string[])
      : undefined,
    estimatedMinutes: Number(r.estimatedMinutes) || 15,
    energyType: (['Deep', 'Light', 'Admin'].includes(String(r.energyType)) ? r.energyType : 'Light') as EnergyType,
    taskType: (['GoalTask', 'DeadlineTask', 'FixedEvent', 'MicroTask'].includes(String(r.taskType))
      ? r.taskType
      : 'GoalTask') as AIParsedItem['taskType'],
  };
  });
  return { items };
}

export interface ScheduleBlockSuggestion {
  taskId: string;
  date: string;
  startTime: string;
  endTime: string;
}

/** Payload we send to the AI so it can prioritize (goals with tier, tasks with deadline/priority/note). */
export interface SchedulePayload {
  goals: {
    id: string;
    name: string;
    priorityTier: 1 | 2 | 3;
    dailyRepetition?: number;
    weeklyQuotaSessions?: number;
  }[];
  tasks: {
    id: string;
    title: string;
    estimatedMinutes: number;
    energyType: string;
    taskType: string;
    timesPerDay?: number;
    suggestedTimeSlots?: string[];
    goalId?: string;
    goalName?: string;
    goalPriorityTier?: 1 | 2 | 3;
    deadline?: string;
    dueTime?: string;
    priority?: 'high' | 'medium' | 'low';
    note?: string;
  }[];
  capacity: { workStart: string; workEnd: string; maxDeepBlocksPerDay: number; maxPlannedHoursPerDay: number };
  weekStart: string;
  weekDates: string[];
}

/** The exact system prompt we use for scheduling — so the user can see how the AI prioritizes. */
export const SCHEDULE_SYSTEM_PROMPT = `You are an ADHD-friendly scheduling assistant. Given the user's goals, tasks, and capacity, suggest a concrete schedule: which task goes on which date and at what time.

PRIORITIZATION ORDER (apply strictly in this order):
1. FIXED EVENTS: Tasks with dueTime must be placed on the correct date at that exact time (or as close as possible). These are non-negotiable.
2. DEADLINE TASKS: Tasks with a deadline must be scheduled on or before that date. Prefer earlier in the week if the deadline is near the end.
3. DAILY REPEATS: Tasks with timesPerDay and suggestedTimeSlots must appear at those times on every day in weekDates (e.g. medication at 08:00, 13:00, 19:00).
4. GOAL PRIORITY: Then place tasks by their goal's priorityTier (1 = highest, 2 = medium, 3 = lowest). Fill Tier 1 goal quotas first, then Tier 2, then Tier 3.
5. TASK PRIORITY: Among tasks without a goal or with the same tier, prefer priority "high" over "medium" over "low".
6. RESPECT NOTES: If a task has a "note" (e.g. "morning only", "after lunch"), try to honor it when choosing time or day.
7. CAPACITY: Do not exceed maxDeepBlocksPerDay (Deep energy tasks per day) or maxPlannedHoursPerDay total per day. Use workStart and workEnd as the main window unless suggestedTimeSlots require outside it (e.g. morning medication before work).

Output a single JSON object only, no markdown:
{
  "blocks": [
    {
      "taskId": "the task id string",
      "date": "YYYY-MM-DD",
      "startTime": "HH:mm",
      "endTime": "HH:mm"
    }
  ]
}

- Each block duration should match the task's estimatedMinutes (add a few minutes buffer in endTime if needed).
- Return only the JSON object.`;

/** Ask AI to suggest a schedule for the week given goals, tasks, and capacity. */
export async function suggestSchedule(
  apiKey: string,
  payload: SchedulePayload
): Promise<{ blocks: ScheduleBlockSuggestion[] }> {
  const userMessage = `Suggest a schedule for this week. Return only the JSON object.

Goals (priorityTier 1 = highest): ${JSON.stringify(payload.goals, null, 0)}
Tasks (include deadline, dueTime, priority, note for prioritization): ${JSON.stringify(payload.tasks, null, 0)}
Capacity: ${JSON.stringify(payload.capacity)}
Week start: ${payload.weekStart}
Week dates (schedule only on these days): ${payload.weekDates.join(', ')}`;

  const raw = await chat(apiKey, SCHEDULE_SYSTEM_PROMPT, userMessage);
  const parsed = JSON.parse(raw) as { blocks?: ScheduleBlockSuggestion[] };
  const blocks = (parsed.blocks ?? []).map((b: ScheduleBlockSuggestion) => ({
    taskId: String(b.taskId),
    date: String(b.date),
    startTime: String(b.startTime),
    endTime: String(b.endTime),
  }));
  return { blocks };
}
