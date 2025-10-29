/**
 * Quick Schedule Form Component
 * Simplified form for quickly scheduling calendar events
 */

import { useState } from 'react';
import { createEvent } from '@/data/calendar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

interface ScheduleQuickFormProps {
  workspaceId: string;
  onSuccess?: (eventId: string) => void;
}

const PLATFORMS = [
  { id: 'instagram', label: 'Instagram' },
  { id: 'tiktok', label: 'TikTok' },
  { id: 'facebook', label: 'Facebook' },
  { id: 'x', label: 'X (Twitter)' },
  { id: 'linkedin', label: 'LinkedIn' },
  { id: 'youtube_shorts', label: 'YouTube Shorts' },
];

export function ScheduleQuickForm({ workspaceId, onSuccess }: ScheduleQuickFormProps) {
  const [title, setTitle] = useState('');
  const [when, setWhen] = useState(() => {
    // Default to 1 hour from now
    const date = new Date(Date.now() + 60 * 60 * 1000);
    return date.toISOString().slice(0, 16);
  });
  const [channels, setChannels] = useState<string[]>(['instagram']);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!workspaceId) {
      toast.error('Please select a workspace first');
      return;
    }

    if (channels.length === 0) {
      toast.error('Please select at least one platform');
      return;
    }

    setBusy(true);
    try {
      const event = await createEvent({
        workspaceId,
        title,
        caption: '',
        channels,
        datetimeLocalISO: when,
        timezone: 'Europe/Berlin',
        asDraft: false,
      });

      toast.success(`Event scheduled: ${event.title || 'Untitled'}`);
      setTitle('');
      setWhen(new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16));
      onSuccess?.(event.id);
    } catch (error: any) {
      console.error('Schedule error:', error);
      toast.error(error.message || 'Failed to schedule event');
    } finally {
      setBusy(false);
    }
  };

  const toggleChannel = (channelId: string) => {
    setChannels((prev) =>
      prev.includes(channelId)
        ? prev.filter((c) => c !== channelId)
        : [...prev, channelId]
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Quick Schedule</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              placeholder="Event title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={busy}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="when">Date & Time (Local)</Label>
            <Input
              id="when"
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              disabled={busy}
            />
          </div>

          <div className="space-y-2">
            <Label>Platforms</Label>
            <div className="grid grid-cols-2 gap-2">
              {PLATFORMS.map((platform) => (
                <div key={platform.id} className="flex items-center gap-2">
                  <Checkbox
                    id={`platform-${platform.id}`}
                    checked={channels.includes(platform.id)}
                    onCheckedChange={() => toggleChannel(platform.id)}
                    disabled={busy}
                  />
                  <Label
                    htmlFor={`platform-${platform.id}`}
                    className="text-sm font-normal cursor-pointer"
                  >
                    {platform.label}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          <Button type="submit" disabled={busy} className="w-full">
            {busy ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Scheduling...
              </>
            ) : (
              'Schedule Event'
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
