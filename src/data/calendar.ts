/**
 * Calendar Data Access Layer
 * Centralized data operations for calendar events and logs
 */

import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { toUTCISOString } from '@/lib/time';

export type CalendarEvent = Database['public']['Tables']['calendar_events']['Row'];
export type CalendarEventInsert = Database['public']['Tables']['calendar_events']['Insert'];
export type CalendarEventUpdate = Database['public']['Tables']['calendar_events']['Update'];
export type PublishLog = Database['public']['Tables']['calendar_publish_logs']['Row'];
// Use the actual database enum for post_status
type DbPostStatus = Database['public']['Enums']['post_status'];
export type PostStatus = DbPostStatus;

export interface ListEventsParams {
  workspaceId?: string;
  from?: string;
  to?: string;
  status?: Array<Database['public']['Enums']['post_status']>;
  channels?: string[];
  clientId?: string;
  brandKitId?: string;
}

export interface CreateEventInput {
  workspaceId: string;
  title?: string;
  caption?: string;
  brief?: string;
  media?: any[];
  channels: string[];
  datetimeLocalISO: string;
  timezone?: string;
  asDraft?: boolean;
  clientId?: string;
  brandKitId?: string;
  campaignId?: string;
  assignees?: string[];
  tags?: string[];
  hashtags?: string[];
}

/**
 * List calendar events with optional filters
 */
export async function listEvents(params: ListEventsParams): Promise<CalendarEvent[]> {
  let query = supabase
    .from('calendar_events')
    .select('*')
    .order('start_at', { ascending: true });

  if (params.workspaceId) query = query.eq('workspace_id', params.workspaceId);
  if (params.clientId) query = query.eq('client_id', params.clientId);
  if (params.brandKitId) query = query.eq('brand_kit_id', params.brandKitId);
  if (params.from) query = query.gte('start_at', params.from);
  if (params.to) query = query.lte('start_at', params.to);
  if (params.status?.length) query = query.in('status', params.status as any);
  if (params.channels?.length) query = query.contains('channels', params.channels);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

/**
 * Create a new calendar event
 */
export async function createEvent(input: CreateEventInput): Promise<CalendarEvent> {
  const start_at = toUTCISOString(input.datetimeLocalISO, input.timezone ?? 'Europe/Berlin');
  
  const payload: CalendarEventInsert = {
    workspace_id: input.workspaceId,
    title: input.title ?? null,
    caption: input.caption ?? null,
    brief: input.brief ?? null,
    assets_json: input.media ?? [],
    channels: input.channels,
    status: 'scheduled', // Always scheduled, no draft status
    start_at,
    timezone: input.timezone ?? 'Europe/Berlin',
    client_id: input.clientId ?? null,
    brand_kit_id: input.brandKitId ?? null,
    campaign_id: input.campaignId ?? null,
    assignees: input.assignees ?? null,
    tags: input.tags ?? null,
    hashtags: input.hashtags ?? null,
  };

  const { data, error } = await supabase
    .from('calendar_events')
    .insert(payload)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Update an existing calendar event
 */
export async function updateEvent(
  id: string,
  patch: Partial<CalendarEventUpdate> & { datetimeLocalISO?: string; timezone?: string }
): Promise<CalendarEvent> {
  const update: CalendarEventUpdate = { ...patch };
  
  // Handle datetime conversion if provided
  if (patch.datetimeLocalISO) {
    update.start_at = toUTCISOString(
      patch.datetimeLocalISO,
      patch.timezone ?? 'Europe/Berlin'
    );
    delete (update as any).datetimeLocalISO;
  }

  const { data, error } = await supabase
    .from('calendar_events')
    .update(update)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Delete a calendar event
 */
export async function deleteEvent(id: string): Promise<void> {
  const { error } = await supabase
    .from('calendar_events')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

/**
 * List publish logs for events
 */
export async function listLogs(eventId?: string, limit = 50): Promise<PublishLog[]> {
  let query = supabase
    .from('calendar_publish_logs')
    .select('*')
    .order('at', { ascending: false })
    .limit(limit);

  if (eventId) query = query.eq('event_id', eventId);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

/**
 * Retry a failed event
 */
export async function retryEvent(id: string): Promise<CalendarEvent> {
  const { data, error } = await supabase
    .from('calendar_events')
    .update({
      status: 'scheduled',
      attempt_no: 0,
      next_retry_at: null,
      error: null,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get event by ID
 */
export async function getEvent(id: string): Promise<CalendarEvent | null> {
  const { data, error } = await supabase
    .from('calendar_events')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    throw error;
  }
  return data;
}

/**
 * Bulk update event status
 */
export async function bulkUpdateStatus(
  eventIds: string[],
  status: Database['public']['Enums']['post_status']
): Promise<void> {
  const { error } = await supabase
    .from('calendar_events')
    .update({ status: status as any })
    .in('id', eventIds);

  if (error) throw error;
}

/**
 * Bulk delete events
 */
export async function bulkDeleteEvents(eventIds: string[]): Promise<void> {
  const { error } = await supabase
    .from('calendar_events')
    .delete()
    .in('id', eventIds);

  if (error) throw error;
}
