/**
 * Pure payload builder for the poster dispatcher.
 *
 * Kept free of Deno APIs so it can be unit tested from Node/vitest.
 * The publish orchestrator posts as a specific user, so the owner is derived
 * deterministically from the linked calendar event — never guessed.
 */

export interface DispatchJob {
  id?: string;
  platform: string;
  calendar_event_id?: string | null;
  content_snapshot?: Record<string, unknown> | null;
  calendar_events?: { owner_id?: string | null } | Array<{ owner_id?: string | null }> | null;
}

export interface PublishPayload {
  user_id: string;
  text: string;
  media: unknown[];
  channels: string[];
  calendar_event_id: string;
}

export type BuildPayloadResult =
  | { ok: true; payload: PublishPayload }
  | { ok: false; code: 'MISSING_CALENDAR_EVENT' | 'MISSING_OWNER' | 'MISSING_PLATFORM'; message: string };

export function resolveCalendarEventOwner(job: DispatchJob): string | undefined {
  const event = Array.isArray(job.calendar_events) ? job.calendar_events[0] : job.calendar_events;
  return event?.owner_id ?? undefined;
}

export function buildPublishPayload(job: DispatchJob): BuildPayloadResult {
  if (!job.calendar_event_id) {
    return {
      ok: false,
      code: 'MISSING_CALENDAR_EVENT',
      message: 'Missing calendar event — refusing to publish without a verified user identity',
    };
  }

  const ownerId = resolveCalendarEventOwner(job);
  if (!ownerId) {
    return {
      ok: false,
      code: 'MISSING_OWNER',
      message:
        'Missing calendar event owner — refusing to publish without a verified user identity',
    };
  }

  if (!job.platform) {
    return { ok: false, code: 'MISSING_PLATFORM', message: 'Job has no target platform' };
  }

  const snapshot = (job.content_snapshot ?? {}) as Record<string, unknown>;
  const text =
    typeof snapshot.caption === 'string'
      ? snapshot.caption
      : typeof snapshot.text === 'string'
        ? snapshot.text
        : '';

  return {
    ok: true,
    payload: {
      user_id: ownerId,
      text,
      media: Array.isArray(snapshot.media) ? snapshot.media : [],
      channels: [job.platform],
      calendar_event_id: job.calendar_event_id,
    },
  };
}
