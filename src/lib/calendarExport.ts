import { supabase } from "@/integrations/supabase/client";

export interface ExportOptions {
  workspaceId: string;
  brandKitId?: string;
  month: number;
  year: number;
  format: 'csv' | 'pdf' | 'ics';
}

/**
 * Export calendar events as CSV
 */
export async function exportToCSV(events: any[]): Promise<void> {
  if (!events || events.length === 0) {
    throw new Error('NO_EVENTS_TO_EXPORT');
  }

  // CSV Headers
  const headers = [
    'Date',
    'Time',
    'Title',
    'Status',
    'Channels',
    'Assignees',
    'Brief',
    'Caption',
    'Hashtags',
    'ETA (min)'
  ];

  // Convert events to CSV rows
  const rows = events.map(event => [
    new Date(event.start_at).toLocaleDateString(),
    new Date(event.start_at).toLocaleTimeString(),
    event.title || '',
    event.status || '',
    (event.channels || []).join(', '),
    (event.assignees || []).length.toString(),
    (event.brief || '').replace(/"/g, '""'), // Escape quotes
    (event.caption || '').replace(/"/g, '""'),
    (event.hashtags || []).join(' '),
    event.eta_minutes || ''
  ]);

  // Build CSV content
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n');

  // Download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `calendar-export-${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
}

/**
 * Export calendar as PDF (via Edge Function)
 */
export async function exportToPDF(options: ExportOptions): Promise<void> {
  const { data, error } = await supabase.functions.invoke('calendar-export-pdf', {
    body: {
      workspace_id: options.workspaceId,
      brand_kit_id: options.brandKitId,
      month: options.month,
      year: options.year
    }
  });

  if (error) {
    console.error('PDF export error:', error);
    throw new Error('PDF_EXPORT_FAILED');
  }

  if (!data?.html) {
    throw new Error('NO_HTML_GENERATED');
  }

  // Open HTML in new window for printing/saving as PDF
  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(data.html);
    printWindow.document.close();
    
    // Auto-trigger print dialog
    setTimeout(() => {
      printWindow.print();
    }, 250);
  }
}

/**
 * Export calendar as ICS (iCalendar format)
 */
export async function exportToICS(events: any[]): Promise<void> {
  if (!events || events.length === 0) {
    throw new Error('NO_EVENTS_TO_EXPORT');
  }

  // Build ICS content
  const icsEvents = events.map(event => {
    const startDate = new Date(event.start_at);
    const endDate = event.end_at ? new Date(event.end_at) : new Date(startDate.getTime() + 60 * 60 * 1000);
    
    return [
      'BEGIN:VEVENT',
      `UID:${event.id}@useadtool.ai`,
      `DTSTAMP:${formatICSDate(new Date())}`,
      `DTSTART:${formatICSDate(startDate)}`,
      `DTEND:${formatICSDate(endDate)}`,
      `SUMMARY:${event.title || 'Untitled Event'}`,
      `DESCRIPTION:${(event.brief || '').replace(/\n/g, '\\n')}`,
      `STATUS:${event.status.toUpperCase()}`,
      event.channels?.length > 0 ? `CATEGORIES:${event.channels.join(',')}` : '',
      'END:VEVENT'
    ].filter(Boolean).join('\r\n');
  }).join('\r\n');

  const icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//AdTool AI//Calendar//EN',
    'CALSCALE:GREGORIAN',
    icsEvents,
    'END:VCALENDAR'
  ].join('\r\n');

  // Download
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `calendar-${new Date().toISOString().split('T')[0]}.ics`;
  link.click();
}

/**
 * Format date for ICS format (YYYYMMDDTHHMMSSZ)
 */
function formatICSDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

/**
 * Export metrics as CSV
 */
export async function exportMetricsToCSV(events: any[]): Promise<void> {
  if (!events || events.length === 0) {
    throw new Error('NO_EVENTS_TO_EXPORT');
  }

  // Group by status
  const statusCounts = events.reduce((acc, event) => {
    acc[event.status] = (acc[event.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Group by channel
  const channelCounts = events.reduce((acc, event) => {
    (event.channels || []).forEach((channel: string) => {
      acc[channel] = (acc[channel] || 0) + 1;
    });
    return acc;
  }, {} as Record<string, number>);

  // Build metrics CSV
  const csvContent = [
    '=== Event Summary ===',
    `Total Events,${events.length}`,
    '',
    '=== By Status ===',
    'Status,Count',
    ...Object.entries(statusCounts).map(([status, count]) => `${status},${count}`),
    '',
    '=== By Channel ===',
    'Channel,Count',
    ...Object.entries(channelCounts).map(([channel, count]) => `${channel},${count}`),
    '',
    '=== Timeline ===',
    'Week,Event Count',
    ...getWeeklyCounts(events).map(([week, count]) => `Week ${week},${count}`)
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `calendar-metrics-${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
}

/**
 * Get weekly event counts
 */
function getWeeklyCounts(events: any[]): [number, number][] {
  const weeks = new Map<number, number>();
  
  events.forEach(event => {
    if (!event.start_at) return;
    
    const date = new Date(event.start_at);
    const weekNum = Math.ceil(date.getDate() / 7);
    
    weeks.set(weekNum, (weeks.get(weekNum) || 0) + 1);
  });

  return Array.from(weeks.entries()).sort((a, b) => a[0] - b[0]);
}