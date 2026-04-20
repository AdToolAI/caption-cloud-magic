import { useState, useRef } from 'react';
import { Bug, X, Loader2, Camera, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useLocation } from 'react-router-dom';

export function BugReporter() {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<'low' | 'medium' | 'high' | 'critical'>('medium');
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const location = useLocation();

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Screenshot zu groß (max 5MB)');
      return;
    }
    setScreenshot(file);
    setScreenshotPreview(URL.createObjectURL(file));
  };

  const reset = () => {
    setTitle('');
    setDescription('');
    setSeverity('medium');
    setScreenshot(null);
    setScreenshotPreview(null);
  };

  const submit = async () => {
    if (!title.trim() || !description.trim()) {
      toast.error('Titel und Beschreibung sind Pflicht');
      return;
    }

    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      let screenshot_url: string | null = null;
      if (screenshot) {
        const ext = screenshot.name.split('.').pop() ?? 'png';
        const path = `${user?.id ?? 'anon'}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('bug-screenshots')
          .upload(path, screenshot, { upsert: false, contentType: screenshot.type });
        if (upErr) throw upErr;
        const { data: urlData } = supabase.storage.from('bug-screenshots').getPublicUrl(path);
        screenshot_url = urlData.publicUrl;
      }

      const { error } = await supabase.from('bug_reports').insert({
        user_id: user?.id ?? null,
        user_email: user?.email ?? null,
        title: title.trim(),
        description: description.trim(),
        severity,
        route: location.pathname,
        user_agent: navigator.userAgent,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        screenshot_url,
        metadata: {
          referrer: document.referrer || null,
          language: navigator.language,
          timestamp: new Date().toISOString(),
        },
      });

      if (error) throw error;

      toast.success('Bug-Report erfolgreich übermittelt — danke!');
      reset();
      setOpen(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unbekannter Fehler';
      toast.error(`Fehler: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Bug melden"
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-destructive px-4 py-3 text-destructive-foreground shadow-lg hover:bg-destructive/90 hover:scale-105 transition-all duration-200"
      >
        <Bug className="h-4 w-4" />
        <span className="text-sm font-medium hidden sm:inline">Bug melden</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bug className="h-5 w-5 text-destructive" />
              Bug melden
            </DialogTitle>
            <DialogDescription>
              Hilf uns, die App zu verbessern. Aktuelle Seite: <code className="text-xs">{location.pathname}</code>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="bug-title">Kurzer Titel *</Label>
              <Input
                id="bug-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="z.B. Speichern-Button funktioniert nicht"
                maxLength={150}
              />
            </div>

            <div>
              <Label htmlFor="bug-desc">Was ist passiert? *</Label>
              <Textarea
                id="bug-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Schritte, erwartetes Verhalten, was tatsächlich passiert ist..."
                rows={5}
                maxLength={2000}
              />
            </div>

            <div>
              <Label htmlFor="bug-severity">Wie kritisch?</Label>
              <Select value={severity} onValueChange={(v) => setSeverity(v as typeof severity)}>
                <SelectTrigger id="bug-severity">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">🟢 Niedrig — kosmetisch</SelectItem>
                  <SelectItem value="medium">🟡 Mittel — unschön</SelectItem>
                  <SelectItem value="high">🟠 Hoch — Funktion blockiert</SelectItem>
                  <SelectItem value="critical">🔴 Kritisch — App unbenutzbar</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Screenshot (optional)</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFile}
                className="hidden"
              />
              {screenshotPreview ? (
                <div className="relative mt-2">
                  <img src={screenshotPreview} alt="Preview" className="max-h-40 rounded border border-border" />
                  <button
                    onClick={() => {
                      setScreenshot(null);
                      setScreenshotPreview(null);
                    }}
                    className="absolute top-1 right-1 bg-background/80 rounded-full p-1 hover:bg-background"
                    aria-label="Screenshot entfernen"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2 w-full"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Camera className="h-4 w-4 mr-2" />
                  Screenshot anhängen
                </Button>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
              Abbrechen
            </Button>
            <Button onClick={submit} disabled={submitting || !title.trim() || !description.trim()}>
              {submitting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Senden
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
