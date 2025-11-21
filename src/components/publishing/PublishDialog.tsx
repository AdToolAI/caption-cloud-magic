import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Send, Loader2 } from 'lucide-react';
import { useSocialPublishing, Platform } from '@/hooks/useSocialPublishing';

interface Props {
  videoUrl: string;
  defaultCaption?: string;
  defaultHashtags?: string[];
  trigger?: React.ReactNode;
}

export function PublishDialog({ videoUrl, defaultCaption = '', defaultHashtags = [], trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [caption, setCaption] = useState(defaultCaption);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [hashtags, setHashtags] = useState(defaultHashtags.join(' '));
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>([]);
  const [aspectRatio, setAspectRatio] = useState('9:16');
  const [privacyLevel, setPrivacyLevel] = useState('PUBLIC');

  const { publishing, publishToMultiplePlatforms } = useSocialPublishing();

  const platforms: { id: Platform; name: string; icon: string }[] = [
    { id: 'instagram', name: 'Instagram', icon: '📸' },
    { id: 'tiktok', name: 'TikTok', icon: '🎵' },
    { id: 'linkedin', name: 'LinkedIn', icon: '💼' },
    { id: 'youtube', name: 'YouTube', icon: '📺' }
  ];

  const togglePlatform = (platform: Platform) => {
    setSelectedPlatforms(prev =>
      prev.includes(platform)
        ? prev.filter(p => p !== platform)
        : [...prev, platform]
    );
  };

  const handlePublish = async () => {
    if (selectedPlatforms.length === 0) return;

    const hashtagsArray = hashtags
      .split(' ')
      .filter(tag => tag.trim())
      .map(tag => tag.trim());

    const results = await publishToMultiplePlatforms(
      {
        videoUrl,
        caption,
        title: title || caption.substring(0, 100),
        description: description || caption,
        hashtags: hashtagsArray,
        aspectRatio,
        privacyLevel: privacyLevel as any
      },
      selectedPlatforms
    );

    // Check if all successful
    const allSuccessful = Object.values(results).every(r => r.success);
    if (allSuccessful) {
      setOpen(false);
    }
  };

  const isPublishing = Object.values(publishing).some(p => p);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button>
            <Send className="h-4 w-4 mr-2" />
            Veröffentlichen
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>🚀 Auf Social Media veröffentlichen</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Platform Selection */}
          <div className="space-y-3">
            <Label>Plattformen auswählen</Label>
            <div className="grid grid-cols-2 gap-3">
              {platforms.map(platform => (
                <div
                  key={platform.id}
                  className={`flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                    selectedPlatforms.includes(platform.id)
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                  }`}
                  onClick={() => togglePlatform(platform.id)}
                >
                  <Checkbox
                    checked={selectedPlatforms.includes(platform.id)}
                    onCheckedChange={() => togglePlatform(platform.id)}
                  />
                  <span className="text-2xl">{platform.icon}</span>
                  <span className="font-medium">{platform.name}</span>
                  {publishing[platform.id] && (
                    <Loader2 className="h-4 w-4 ml-auto animate-spin" />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Video Preview */}
          <div>
            <Label className="mb-2 block">Video Vorschau</Label>
            <video
              src={videoUrl}
              controls
              className="w-full max-h-64 rounded-lg bg-black"
            />
          </div>

          {/* Content Fields */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Titel (YouTube)</Label>
              <Input
                id="title"
                placeholder="Video Titel..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={100}
              />
              <p className="text-xs text-muted-foreground">{title.length}/100</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="caption">Caption / Beschreibung</Label>
              <Textarea
                id="caption"
                placeholder="Deine Caption..."
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={4}
                maxLength={2200}
              />
              <p className="text-xs text-muted-foreground">{caption.length}/2200</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Erweiterte Beschreibung (YouTube)</Label>
              <Textarea
                id="description"
                placeholder="Detaillierte Beschreibung für YouTube..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="hashtags">Hashtags</Label>
              <Input
                id="hashtags"
                placeholder="#hashtag1 #hashtag2 #hashtag3"
                value={hashtags}
                onChange={(e) => setHashtags(e.target.value)}
              />
              <div className="flex flex-wrap gap-2 mt-2">
                {hashtags.split(' ').filter(tag => tag.trim()).map((tag, idx) => (
                  <Badge key={idx} variant="secondary">{tag}</Badge>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="aspect-ratio">Aspect Ratio (Instagram)</Label>
                <Select value={aspectRatio} onValueChange={setAspectRatio}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="9:16">9:16 (Reels/Stories)</SelectItem>
                    <SelectItem value="1:1">1:1 (Square)</SelectItem>
                    <SelectItem value="16:9">16:9 (Landscape)</SelectItem>
                    <SelectItem value="4:5">4:5 (Portrait)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="privacy">Sichtbarkeit</Label>
                <Select value={privacyLevel} onValueChange={setPrivacyLevel}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PUBLIC">Öffentlich</SelectItem>
                    <SelectItem value="PRIVATE">Privat</SelectItem>
                    <SelectItem value="FRIENDS">Freunde (TikTok)</SelectItem>
                    <SelectItem value="CONNECTIONS">Kontakte (LinkedIn)</SelectItem>
                    <SelectItem value="unlisted">Nicht gelistet (YouTube)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Publish Button */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Abbrechen
            </Button>
            <Button
              onClick={handlePublish}
              disabled={selectedPlatforms.length === 0 || isPublishing}
            >
              {isPublishing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Veröffentliche...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Auf {selectedPlatforms.length} {selectedPlatforms.length === 1 ? 'Plattform' : 'Plattformen'} veröffentlichen
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
