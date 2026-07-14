import { useCallback, useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Mic,
  Square,
  Upload,
  Trash2,
  Play,
  Pause,
  Copy,
  Loader2,
  Sparkles,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCustomVoices } from "@/hooks/useCustomVoices";
import {
  VOICE_TRAINING_SCRIPTS,
  personalizeScript,
  type TrainingScriptLang,
} from "@/config/voiceTrainingScripts";
import { encodeWav } from "@/lib/audio/wavEncoder";

interface VoiceStudioDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Sample {
  id: string;
  blob: Blob;
  fileName: string;
  durationSec: number;
  source: "mic" | "upload";
  url: string; // object URL for preview
}

const MIN_TOTAL_SEC = 30;
const MAX_TOTAL_SEC = 600;
const MAX_SAMPLES = 5;
const MAX_FILE_BYTES = 20 * 1024 * 1024;

const ACCEPTED_MIME = [
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
  "audio/mp4",
  "audio/x-m4a",
  "audio/ogg",
  "audio/opus",
  "audio/webm",
  "audio/flac",
];

function formatSec(s: number): string {
  if (!isFinite(s) || s <= 0) return "0.0s";
  return `${s.toFixed(1)}s`;
}

async function probeDuration(blob: Blob): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio();
    const done = (v: number) => {
      URL.revokeObjectURL(url);
      resolve(v);
    };
    audio.preload = "metadata";
    audio.onloadedmetadata = () => done(audio.duration || 0);
    audio.onerror = () => done(0);
    audio.src = url;
  });
}

export function VoiceStudioDialog({ open, onOpenChange }: VoiceStudioDialogProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [scriptLang, setScriptLang] = useState<TrainingScriptLang>("de");
  const [speakerName, setSpeakerName] = useState("");


  // Recorder state
  const [isRecording, setIsRecording] = useState(false);
  const [recElapsed, setRecElapsed] = useState(0);
  const [micLevel, setMicLevel] = useState(0);
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const nodeRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);
  const startedAtRef = useRef<number>(0);
  const rafRef = useRef<number>(0);

  const [samples, setSamples] = useState<Sample[]>([]);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const playerRef = useRef<HTMLAudioElement | null>(null);

  // Clone form
  const [voiceName, setVoiceName] = useState("");
  const [voiceLang, setVoiceLang] = useState("de");
  const [voiceDesc, setVoiceDesc] = useState("");
  const [removeNoise, setRemoveNoise] = useState(true);
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { cloneVoice } = useCustomVoices();

  const totalSec = samples.reduce((acc, s) => acc + s.durationSec, 0);

  // Cleanup on close
  useEffect(() => {
    if (!open) {
      stopRecording(true);
      samples.forEach((s) => URL.revokeObjectURL(s.url));
      setSamples([]);
      setStep(1);
      setVoiceName("");
      setVoiceDesc("");
      setConsent(false);
      setPlayingId(null);
      setSpeakerName("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);


  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      streamRef.current = stream;
      const AC = (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext);
      const ctx = new AC();
      ctxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      sourceRef.current = source;
      const node = ctx.createScriptProcessor(4096, 1, 1);
      nodeRef.current = node;
      chunksRef.current = [];
      startedAtRef.current = performance.now();

      node.onaudioprocess = (e) => {
        const ch = e.inputBuffer.getChannelData(0);
        // clone — the buffer is reused by the audio thread
        chunksRef.current.push(new Float32Array(ch));
        // level meter
        let peak = 0;
        for (let i = 0; i < ch.length; i++) {
          const v = Math.abs(ch[i]);
          if (v > peak) peak = v;
        }
        setMicLevel(peak);
      };

      source.connect(node);
      node.connect(ctx.destination);

      setIsRecording(true);
      const tick = () => {
        setRecElapsed((performance.now() - startedAtRef.current) / 1000);
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (err) {
      console.error("[VoiceStudio] mic error:", err);
      toast.error("Mikrofonzugriff wurde abgelehnt oder ist nicht verfügbar.");
    }
  }, []);

  const stopRecording = useCallback(
    (silent = false) => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      setIsRecording(false);
      setMicLevel(0);

      try {
        nodeRef.current?.disconnect();
        sourceRef.current?.disconnect();
      } catch { /* noop */ }

      const stream = streamRef.current;
      const ctx = ctxRef.current;
      streamRef.current = null;
      ctxRef.current = null;
      nodeRef.current = null;
      sourceRef.current = null;

      const chunks = chunksRef.current;
      chunksRef.current = [];

      stream?.getTracks().forEach((t) => t.stop());
      const sourceRate = ctx?.sampleRate ?? 48000;
      ctx?.close().catch(() => { /* noop */ });

      if (silent) return;
      if (chunks.length === 0) {
        toast.error("Aufnahme war leer.");
        setRecElapsed(0);
        return;
      }

      const { blob, durationSec } = encodeWav(chunks, sourceRate, 16000);
      setRecElapsed(0);
      if (blob.size < 4096 || durationSec < 3) {
        toast.error("Aufnahme zu kurz. Sprich mindestens ein paar Sätze.");
        return;
      }
      if (samples.length >= MAX_SAMPLES) {
        toast.error(`Maximal ${MAX_SAMPLES} Samples.`);
        return;
      }
      const id = crypto.randomUUID();
      const url = URL.createObjectURL(blob);
      setSamples((prev) => [
        ...prev,
        {
          id,
          blob,
          fileName: `recording-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.wav`,
          durationSec,
          source: "mic",
          url,
        },
      ]);
      toast.success(`Aufnahme gespeichert (${formatSec(durationSec)})`);
    },
    [samples.length],
  );

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const accepted: Sample[] = [];
    for (const f of Array.from(files)) {
      if (samples.length + accepted.length >= MAX_SAMPLES) {
        toast.error(`Maximal ${MAX_SAMPLES} Samples.`);
        break;
      }
      const type = (f.type || "").toLowerCase();
      const okMime =
        ACCEPTED_MIME.includes(type) ||
        /\.(mp3|wav|m4a|ogg|opus|webm|flac|aac)$/i.test(f.name);
      if (!okMime) {
        toast.error(`Format nicht unterstützt: ${f.name}`);
        continue;
      }
      if (f.size > MAX_FILE_BYTES) {
        toast.error(`Zu groß (>20 MB): ${f.name}`);
        continue;
      }
      const durationSec = await probeDuration(f);
      accepted.push({
        id: crypto.randomUUID(),
        blob: f,
        fileName: f.name,
        durationSec,
        source: "upload",
        url: URL.createObjectURL(f),
      });
    }
    if (accepted.length) {
      setSamples((prev) => [...prev, ...accepted]);
      toast.success(`${accepted.length} Sample(s) hinzugefügt`);
    }
  };

  const removeSample = (id: string) => {
    setSamples((prev) => {
      const s = prev.find((x) => x.id === id);
      if (s) URL.revokeObjectURL(s.url);
      return prev.filter((x) => x.id !== id);
    });
    if (playingId === id) {
      playerRef.current?.pause();
      setPlayingId(null);
    }
  };

  const togglePlay = (s: Sample) => {
    if (playingId === s.id) {
      playerRef.current?.pause();
      setPlayingId(null);
      return;
    }
    if (playerRef.current) {
      playerRef.current.pause();
    }
    const audio = new Audio(s.url);
    playerRef.current = audio;
    audio.onended = () => setPlayingId(null);
    audio.play().catch(() => setPlayingId(null));
    setPlayingId(s.id);
  };

  const copyScript = async () => {
    try {
      await navigator.clipboard.writeText(personalizedText);
      toast.success("Skript kopiert");
    } catch {
      toast.error("Kopieren fehlgeschlagen");
    }
  };


  const canProceedTo3 =
    samples.length > 0 && totalSec >= MIN_TOTAL_SEC && totalSec <= MAX_TOTAL_SEC;

  const canSubmit = canProceedTo3 && voiceName.trim().length >= 2 && consent && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      // 1. Get user for path prefix
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) {
        toast.error("Nicht angemeldet.");
        return;
      }

      const draftId = crypto.randomUUID();
      const sampleUrls: string[] = [];

      // 2. Upload all samples to voiceover-audio bucket
      for (let i = 0; i < samples.length; i++) {
        const s = samples[i];
        const ext = s.fileName.split(".").pop() || "wav";
        const key = `${userId}/voice-samples/${draftId}/sample-${i}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("voiceover-audio")
          .upload(key, s.blob, { upsert: true, contentType: s.blob.type || undefined });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from("voiceover-audio").getPublicUrl(key);
        sampleUrls.push(pub.publicUrl);
      }

      // 3. Trigger clone via existing edge function (with denoise)
      const result = await cloneVoice(voiceName.trim(), sampleUrls, voiceLang, {
        description: voiceDesc.trim() || undefined,
        remove_background_noise: removeNoise,
      });

      if (result) {
        toast.success('Stimme erfolgreich geklont', {
          description: 'Du findest sie jetzt unter „Meine Stimmen".',
        });
        onOpenChange(false);
        // Sanft zur Sektion scrollen (falls im Audio Studio geöffnet)
        setTimeout(() => {
          document
            .getElementById('my-voices')
            ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 250);
      }
    } catch (err) {
      console.error("[VoiceStudio] submit error:", err);
      toast.error(err instanceof Error ? err.message : "Voice-Erstellung fehlgeschlagen");
    } finally {
      setSubmitting(false);
    }
  };

  const script = VOICE_TRAINING_SCRIPTS[scriptLang];
  const personalizedText = personalizeScript(script.text, speakerName, scriptLang);
  const personalizedHint = personalizeScript(script.hint, speakerName, scriptLang);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Voice Studio — Eigene Stimme klonen
          </DialogTitle>
          <DialogDescription>
            Nimm dich beim Vorlesen des Skripts auf oder lade eine WhatsApp-Sprachnachricht hoch.
            Wir säubern Hintergrundrauschen automatisch.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 mb-4 mt-2">
          {[1, 2, 3].map((n) => (
            <div key={n} className="flex-1 flex items-center gap-2">
              <div
                className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold border ${
                  step >= (n as 1 | 2 | 3)
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted text-muted-foreground border-border"
                }`}
              >
                {n}
              </div>
              <span className={`text-xs ${step === n ? "font-semibold" : "text-muted-foreground"}`}>
                {n === 1 ? "Skript" : n === 2 ? "Aufnehmen" : "Klonen"}
              </span>
              {n < 3 && <div className="flex-1 h-px bg-border" />}
            </div>
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Label className="text-sm">Sprache:</Label>
              <Select
                value={scriptLang}
                onValueChange={(v) => setScriptLang(v as TrainingScriptLang)}
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="de">Deutsch</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="es">Español</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={copyScript} className="ml-auto gap-2">
                <Copy className="h-3.5 w-3.5" /> Kopieren
              </Button>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="speaker-name" className="text-sm">
                Dein Name (wird ins Skript eingesetzt)
              </Label>
              <Input
                id="speaker-name"
                value={speakerName}
                onChange={(e) => setSpeakerName(e.target.value)}
                placeholder="z. B. Max"
                maxLength={40}
              />
              <p className="text-xs text-muted-foreground">
                Wir ersetzen den Platzhalter <code>{"{NAME}"}</code> im Skript automatisch —
                so klingt die Vorstellung natürlich.
              </p>
            </div>
            <Card className="p-4 bg-muted/30 max-h-72 overflow-y-auto">
              <p className="text-xs text-muted-foreground mb-2">{personalizedHint}</p>
              <p className="text-sm whitespace-pre-wrap leading-relaxed">{personalizedText}</p>
            </Card>
            <div className="flex justify-end">
              <Button
                onClick={() => {
                  setVoiceLang(scriptLang);
                  if (!voiceName && speakerName.trim()) {
                    setVoiceName(`${speakerName.trim()} Voice`);
                  }
                  setStep(2);
                }}
              >
                Weiter zur Aufnahme
              </Button>
            </div>
          </div>
        )}


        {step === 2 && (
          <div className="space-y-4">
            <Card className="p-3 bg-muted/40 border-primary/20">
              <div className="flex items-center justify-between mb-2 gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Sparkles className="h-4 w-4 text-primary shrink-0" />
                  <p className="text-sm font-medium truncate">
                    Dein Skript — beim Aufnehmen ablesen
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={copyScript}
                  className="gap-1.5 shrink-0"
                >
                  <Copy className="h-3.5 w-3.5" /> Kopieren
                </Button>
              </div>
              <div className="max-h-48 overflow-y-auto rounded bg-background/50 p-3 border border-border/50">
                <p className="text-sm whitespace-pre-wrap leading-relaxed">
                  {personalizedText}
                </p>
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">
                Tipp: Aufnahme starten, kurz durchatmen, dann natürlich vorlesen.
              </p>
            </Card>

            <Tabs defaultValue="mic">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="mic" className="gap-2">
                  <Mic className="h-4 w-4" /> Mikrofon
                </TabsTrigger>
                <TabsTrigger value="upload" className="gap-2">
                  <Upload className="h-4 w-4" /> Datei / WhatsApp
                </TabsTrigger>
              </TabsList>

              <TabsContent value="mic" className="space-y-3 pt-4">
                <Card className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">
                        {isRecording ? "Aufnahme läuft…" : "Bereit zum Aufnehmen"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Ziel: 60–90 Sekunden pro Aufnahme, in ruhiger Umgebung.
                      </p>
                    </div>
                    <div className="text-2xl font-mono tabular-nums">
                      {formatSec(recElapsed)}
                    </div>
                  </div>
                  <div className="h-2 rounded bg-muted overflow-hidden">
                    <div
                      className="h-full bg-primary transition-[width] duration-75"
                      style={{ width: `${Math.min(100, micLevel * 100 * 2)}%` }}
                    />
                  </div>
                  <div className="flex gap-2">
                    {!isRecording ? (
                      <Button onClick={startRecording} className="gap-2">
                        <Mic className="h-4 w-4" /> Aufnahme starten
                      </Button>
                    ) : (
                      <Button
                        onClick={() => stopRecording(false)}
                        variant="destructive"
                        className="gap-2"
                      >
                        <Square className="h-4 w-4" /> Stoppen & speichern
                      </Button>
                    )}
                  </div>
                </Card>
              </TabsContent>

              <TabsContent value="upload" className="space-y-3 pt-4">
                <Card className="p-4 space-y-3">
                  <p className="text-sm">
                    Unterstützt: MP3, WAV, M4A, OGG/Opus (WhatsApp), WebM, FLAC — max. 20 MB pro
                    Datei, bis zu {MAX_SAMPLES} Samples.
                  </p>
                  <Input
                    type="file"
                    accept="audio/*"
                    multiple
                    onChange={(e) => handleUpload(e.target.files)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Tipp: Sende dir deine WhatsApp-Sprachnachricht selbst → „Teilen" → Datei
                    speichern → hier hochladen.
                  </p>
                </Card>
              </TabsContent>
            </Tabs>

            {samples.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Deine Samples</Label>
                  <div className="text-xs text-muted-foreground">
                    Gesamt: <span className="font-mono">{formatSec(totalSec)}</span> /{" "}
                    min. {MIN_TOTAL_SEC}s
                  </div>
                </div>
                <Progress
                  value={Math.min(100, (totalSec / MIN_TOTAL_SEC) * 100)}
                  className="h-1.5"
                />
                <div className="space-y-2">
                  {samples.map((s) => (
                    <Card key={s.id} className="p-3 flex items-center gap-2">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => togglePlay(s)}
                        aria-label="Play"
                      >
                        {playingId === s.id ? (
                          <Pause className="h-4 w-4" />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                      </Button>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{s.fileName}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatSec(s.durationSec)} · {s.source === "mic" ? "Mikrofon" : "Upload"}
                        </p>
                      </div>
                      <Badge variant="secondary" className="text-[10px]">
                        {(s.blob.size / 1024).toFixed(0)} KB
                      </Badge>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => removeSample(s.id)}
                        aria-label="Löschen"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)}>
                Zurück
              </Button>
              <Button disabled={!canProceedTo3} onClick={() => setStep(3)}>
                Weiter
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="voice-name">Name der Stimme *</Label>
                <Input
                  id="voice-name"
                  value={voiceName}
                  onChange={(e) => setVoiceName(e.target.value)}
                  placeholder="z. B. Mein Voiceover"
                  maxLength={40}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label>Sprache</Label>
                  <Select value={voiceLang} onValueChange={setVoiceLang}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="de">Deutsch</SelectItem>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="es">Español</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label className="flex items-center gap-2">
                    Rauschen entfernen
                    <Switch checked={removeNoise} onCheckedChange={setRemoveNoise} />
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Empfohlen für WhatsApp-Aufnahmen.
                  </p>
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="voice-desc">Beschreibung (optional)</Label>
                <Textarea
                  id="voice-desc"
                  value={voiceDesc}
                  onChange={(e) => setVoiceDesc(e.target.value)}
                  placeholder="z. B. warm, ruhig, tiefe männliche Stimme"
                  maxLength={500}
                  rows={2}
                />
              </div>
            </div>

            <Card className="p-3 flex gap-2 items-start bg-muted/30">
              <AlertCircle className="h-4 w-4 mt-0.5 text-primary shrink-0" />
              <div className="text-xs space-y-2">
                <p>
                  Zusammenfassung: <strong>{samples.length}</strong> Sample(s),{" "}
                  <strong>{formatSec(totalSec)}</strong> gesamt.
                </p>
                <label className="flex items-start gap-2 cursor-pointer">
                  <Checkbox
                    checked={consent}
                    onCheckedChange={(v) => setConsent(v === true)}
                    className="mt-0.5"
                  />
                  <span>
                    Ich bestätige, dass ich die Stimme selbst bin oder die ausdrückliche
                    schriftliche Erlaubnis der Person habe, deren Stimme geklont wird.
                  </span>
                </label>
              </div>
            </Card>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(2)} disabled={submitting}>
                Zurück
              </Button>
              <Button onClick={handleSubmit} disabled={!canSubmit} className="gap-2">
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Klonen läuft…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" /> Stimme klonen
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
