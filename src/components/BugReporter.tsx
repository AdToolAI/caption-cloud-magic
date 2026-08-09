import { tx } from "@/lib/i18nText";
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
      toast.error(tx({ de: "Screenshot zu groß (max 5MB)", en: "Screenshot too large (max 5MB)", es: "Captura demasiado grande (máx. 5MB)" }));
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
      toast.error(tx({ de: 'Titel und Beschreibung sind Pflicht', en: 'Title and description are mandatory', es: 'El título y la descripción son obligatorios' }));
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

      toast.success(tx({ de: 'Bug-Report erfolgreich übermittelt — danke!', en: 'Bug report submitted successfully — thank you!', es: 'Informe de error enviado correctamente: ¡gracias!' }));
      reset();
      setOpen(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : tx({ de: 'Unbekannter Fehler', en: 'Unknown error', es: 'Error desconocido' });
      toast.error(tx({ de: `Fehler: ${msg}`, en: `Error: ${msg}`, es: `Error: ${msg}` }));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={tx({ de: "Bug melden", en: "Report bug", es: "Reportar error" })}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-destructive px-4 py-3 text-destructive-foreground shadow-lg hover:bg-destructive/90 hover:scale-105 transition-all duration-200"
      >
        <Bug className="h-4 w-4" />
        <span className="text-sm font-medium hidden sm:inline">{tx({ de: "Bug melden", en: "Report bug", es: "Reportar error" })}</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bug className="h-5 w-5 text-destructive" />
              {tx({ de: "Bug melden", en: "Report bug", es: "Reportar error" })}
            </DialogTitle>
            <DialogDescription>
              {tx({ de: <>Hilf uns, die App zu verbessern. Aktuelle Seite: <code className="text-xs">{location.pathname}</code></>, en: <>Help us improve the app. Current page: <code className="text-xs">{location.pathname}</code></>, es: <>Ayúdanos a mejorar la app. Página actual: <code className="text-xs">{location.pathname}</code></> })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="bug-title">{tx({ de: "Kurzer Titel *", en: "Short title *", es: "Título corto *" })}</Label>
              <Input
                id="bug-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={tx({ de: "z.B. Speichern-Button funktioniert nicht", en: "e.g. Save button doesn't work", es: "p.ej. El botón guardar no funciona" })}
                maxLength={150}
              />
            </div>

            <div>
              <Label htmlFor="bug-desc">{tx({ de: "Was ist passiert? *", en: "What happened? *", es: "¿Qué pasó? *" })}</Label>
              <Textarea
                id="bug-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={tx({ de: "Schritte, erwartetes Verhalten, was tatsächlich passiert ist...", en: "Steps, expected behavior, what actually happened...", es: "Pasos, comportamiento esperado, lo que realmente sucedió..." })}
                rows={5}
                maxLength={2000}
              />
            </div>

            <div>
              <Label htmlFor="bug-severity">{tx({ de: "Wie kritisch?", en: "How critical?", es: "¿Qué tan crítico?" })}</Label>
              <Select value={severity} onValueChange={(v) => setSeverity(v as typeof severity)}>
                <SelectTrigger id="bug-severity">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">{tx({ de: "🟢 Niedrig — kosmetisch", en: "🟢 Low — cosmetic", es: "🟢 Bajo — cosmético" })}</SelectItem>
                  <SelectItem value="medium">{tx({ de: "🟡 Mittel — unschön", en: "🟡 Medium — unpleasant", es: "🟡 Medio — molesto" })}</SelectItem>
                  <SelectItem value="high">{tx({ de: "🟠 Hoch — Funktion blockiert", en: "🟠 High — feature blocked", es: "🟠 Alto — función bloqueada" })}</SelectItem>
                  <SelectItem value="critical">{tx({ de: "🔴 Kritisch — App unbenutzbar", en: "🔴 Critical — app unusable", es: "🔴 Crítico — app inutilizable" })}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>{tx({ de: "Screenshot (optional)", en: "Screenshot (optional)", es: "Captura (opcional)" })}</Label>
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
                    aria-label={tx({ de: "Screenshot entfernen", en: "Remove screenshot", es: "Eliminar captura" })}
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
                  {tx({ de: "Screenshot anhängen", en: "Attach screenshot", es: "Adjuntar captura" })}
                </Button>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
              {tx({ de: "Abbrechen", en: "Cancel", es: "Cancelar" })}
            </Button>
            <Button onClick={submit} disabled={submitting || !title.trim() || !description.trim()}>
              {submitting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              {tx({ de: "Senden", en: "Send", es: "Enviar" })}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
