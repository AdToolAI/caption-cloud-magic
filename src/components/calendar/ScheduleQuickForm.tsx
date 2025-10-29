/**
 * Quick Schedule Form Component
 * Full-featured form for creating and scheduling posts with media
 */

import { useState } from 'react';
import { createEvent } from '@/data/calendar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { MediaUploader } from '@/components/composer/MediaUploader';
import { uploadMediaToSupabase } from '@/lib/mediaUpload';
import { useAuth } from '@/hooks/useAuth';

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
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [caption, setCaption] = useState('');
  const [when, setWhen] = useState(() => {
    // Default to 1 hour from now
    const date = new Date(Date.now() + 60 * 60 * 1000);
    return date.toISOString().slice(0, 16);
  });
  const [channels, setChannels] = useState<string[]>(['instagram']);
  const [selectedMedia, setSelectedMedia] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!workspaceId) {
      toast.error('Please select a workspace first');
      return;
    }

    if (!user) {
      toast.error('You must be logged in');
      return;
    }

    if (channels.length === 0) {
      toast.error('Please select at least one platform');
      return;
    }

    setBusy(true);
    try {
      // Upload media to Supabase if any
      let mediaUrls: any[] = [];
      if (selectedMedia.length > 0) {
        toast.info('Uploading media...');
        const uploaded = await uploadMediaToSupabase(selectedMedia, user.id);
        mediaUrls = uploaded.map(m => ({
          type: m.type,
          url: m.url,
          mime: m.mime,
          size: m.size,
        }));
      }

      // Create event with media
      const event = await createEvent({
        workspaceId,
        title,
        caption,
        channels,
        datetimeLocalISO: when,
        timezone: 'Europe/Berlin',
        media: mediaUrls,
      });

      toast.success(`Post scheduled for ${new Date(when).toLocaleString('de-DE')} on ${channels.length} platform(s)`);
      
      // Reset form
      setTitle('');
      setCaption('');
      setSelectedMedia([]);
      setWhen(new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16));
      
      onSuccess?.(event.id);
    } catch (error: any) {
      console.error('Schedule error:', error);
      toast.error(error.message || 'Failed to schedule post');
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

  const captionMaxLength = 2200; // Instagram max

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Quick Schedule Post</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title (optional)</Label>
            <Input
              id="title"
              placeholder="Internal title for this post"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={busy}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="caption">
              Caption / Post Text
              <span className="ml-2 text-xs text-muted-foreground">
                {caption.length} / {captionMaxLength}
              </span>
            </Label>
            <Textarea
              id="caption"
              placeholder="Write your post caption here..."
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              disabled={busy}
              maxLength={captionMaxLength}
              rows={4}
              className="resize-none"
            />
          </div>

          <div className="space-y-2">
            <Label>Media (optional)</Label>
            <MediaUploader
              selectedMedia={selectedMedia}
              onMediaChange={setSelectedMedia}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="when">Publish Date & Time</Label>
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

          <Button 
            type="submit" 
            disabled={busy || channels.length === 0} 
            className="w-full"
          >
            {busy ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {selectedMedia.length > 0 ? 'Uploading & Scheduling...' : 'Scheduling...'}
              </>
            ) : (
              'Schedule Post'
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
