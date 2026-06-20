import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, FlaskConical, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface VariantResult {
  id: string;
  label: string;
  model: string;
  job_id?: string | null;
  status: string;
  output_url?: string | null;
  dispatch_error?: string | null;
  error?: string | null;
  // v145 forensic fields
  face_count?: number | null;
  faces?: Array<{ x_pct?: number; y_pct?: number; area_pct?: number; mouth_visible?: boolean }>;
  raw_snippet?: string;
}

interface RunRow {
  id: string;
  status: string;
  plate_url: string;
  audio_url: string;
  speaker_label: string | null;
  coords: [number, number] | null;
  bounding_boxes_url: string | null;
  variants: VariantResult[];
  error_message: string | null;
  notes: string | null;
  created_at: string;
}

export default function LipsyncDiagnostic() {
  const { toast } = useToast();
  const [plateUrl, setPlateUrl] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [speakerLabel, setSpeakerLabel] = useState("");
  const [coordsX, setCoordsX] = useState("");
  const [coordsY, setCoordsY] = useState("");
  const [bboxUrl, setBboxUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(false);

  // v145 forensic state
  const [forensicPlateUrl, setForensicPlateUrl] = useState("");
  const [forensicSpeakers, setForensicSpeakers] = useState("4");
  const [forensicDuration, setForensicDuration] = useState("5");
  const [forensicSceneId, setForensicSceneId] = useState("");
  const [forensicSubmitting, setForensicSubmitting] = useState(false);

  const loadRuns = async () => {
    setLoadingRuns(true);
    const { data, error } = await supabase
      .from("lipsync_diagnostic_runs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);
    if (!error && data) setRuns(data as unknown as RunRow[]);
    setLoadingRuns(false);
  };

  useEffect(() => {
    loadRuns();
    const ch = supabase
      .channel("lipsync-diag-runs")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lipsync_diagnostic_runs" },
        () => loadRuns(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  const submit = async () => {
    if (!plateUrl || !audioUrl) {
      toast({ title: "Plate-URL und Audio-URL sind Pflicht", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const coords =
        coordsX && coordsY
          ? [Number(coordsX), Number(coordsY)]
          : undefined;
      const { data, error } = await supabase.functions.invoke("lipsync-diagnostic", {
        body: {
          plate_url: plateUrl,
          audio_url: audioUrl,
          speaker_label: speakerLabel || undefined,
          coords,
          bounding_boxes_url: bboxUrl || undefined,
        },
      });
      if (error) throw error;
      toast({
        title: "Diagnostic gestartet",
        description: `Run ${data?.run_id?.slice(0, 8)} · ${data?.variants_count} Varianten — Polling läuft (~3–8 min)`,
      });
      loadRuns();
    } catch (e: any) {
      toast({ title: "Start fehlgeschlagen", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const submitForensic = async () => {
    if (!forensicPlateUrl) {
      toast({ title: "Plate-URL ist Pflicht", variant: "destructive" });
      return;
    }
    setForensicSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("lipsync-diagnostic", {
        body: {
          mode: "plate-face-forensic",
          plate_url: forensicPlateUrl,
          expected_speakers: Number(forensicSpeakers) || 2,
          duration_sec: Number(forensicDuration) || 5,
          source_scene_id: forensicSceneId || undefined,
        },
      });
      if (error) throw error;
      toast({
        title: "Forensik gestartet",
        description: `Run ${data?.run_id?.slice(0, 8)} · 3 Frames werden extrahiert + analysiert (~30–60s)`,
      });
      loadRuns();
    } catch (e: any) {
      toast({ title: "Forensik fehlgeschlagen", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setForensicSubmitting(false);
    }
  };

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <FlaskConical className="h-8 w-8 text-primary" />
            <h1 className="text-4xl font-bold">Lipsync Diagnostic</h1>
          </div>
          <p className="text-muted-foreground max-w-2xl">
            Dispatcht EINE Plate + EIN Audio gleichzeitig in 5 Sync.so-Varianten
            (auto_detect / flat coords / bounding_boxes_url / bounding_boxes inline /
            lipsync-2-pro). Damit sehen wir empirisch, welcher ASD-Modus für unsere
            Plates tatsächlich Lippen bewegt — bevor wir die Live-Pipeline patchen.
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Hard-Cap: 5 Runs / 24h / Admin · Kosten ~€0.45 pro Run
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadRuns} disabled={loadingRuns}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loadingRuns ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <Card className="p-6 space-y-4">
        <h2 className="text-lg font-semibold">Neuer Diagnose-Run</h2>
        <div className="grid grid-cols-1 gap-4">
          <div>
            <Label htmlFor="plate">Plate URL (mp4)</Label>
            <Input id="plate" value={plateUrl} onChange={(e) => setPlateUrl(e.target.value)}
              placeholder="https://...preclip-XXXX.mp4" />
          </div>
          <div>
            <Label htmlFor="audio">Audio URL (wav/mp3)</Label>
            <Input id="audio" value={audioUrl} onChange={(e) => setAudioUrl(e.target.value)}
              placeholder="https://...voiceover-audio/.../pass-N-tight-...wav" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="speaker">Speaker Label</Label>
              <Input id="speaker" value={speakerLabel} onChange={(e) => setSpeakerLabel(e.target.value)}
                placeholder="z.B. Matthew Dusatko" />
            </div>
            <div>
              <Label htmlFor="cx">Coord X</Label>
              <Input id="cx" type="number" value={coordsX} onChange={(e) => setCoordsX(e.target.value)}
                placeholder="586" />
            </div>
            <div>
              <Label htmlFor="cy">Coord Y</Label>
              <Input id="cy" type="number" value={coordsY} onChange={(e) => setCoordsY(e.target.value)}
                placeholder="460" />
            </div>
          </div>
          <div>
            <Label htmlFor="bbox">bounding_boxes_url (optional, JSON in S3)</Label>
            <Input id="bbox" value={bboxUrl} onChange={(e) => setBboxUrl(e.target.value)}
              placeholder="https://.../bounding-boxes.json" />
          </div>
        </div>
        <Button onClick={submit} disabled={submitting}>
          {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Run Diagnostic
        </Button>
      </Card>

      <Card className="p-6 space-y-4 border-amber-500/40 bg-amber-500/5">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            🔬 v145 · Plate-Face-Forensik
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Extrahiert 3 Frames (early/mid/late) aus der Plate und lässt Gemini Vision
            zählen, wie viele Gesichter mit erkennbarem Mund-Bereich tatsächlich
            sichtbar sind. Beweist, ob der Sync.so face_gate-Fehler am
            <strong> Plate-Inhalt</strong> liegt (Hailuo zeigt zu wenig Gesichter) oder an
            der Sync.so-Detection. Kein Sync.so-Burn, ~€0.05 / Run.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4">
          <div>
            <Label htmlFor="fp">Plate URL (mp4)</Label>
            <Input id="fp" value={forensicPlateUrl} onChange={(e) => setForensicPlateUrl(e.target.value)}
              placeholder="https://...lipsync-plates/.../p3-preclip-XXXX.mp4?token=..." />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="fs">Erwartete Sprecher</Label>
              <Input id="fs" type="number" min="1" max="8" value={forensicSpeakers}
                onChange={(e) => setForensicSpeakers(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="fd">Dauer (sek)</Label>
              <Input id="fd" type="number" min="1" max="60" value={forensicDuration}
                onChange={(e) => setForensicDuration(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="fsid">Scene ID (optional)</Label>
              <Input id="fsid" value={forensicSceneId}
                onChange={(e) => setForensicSceneId(e.target.value)}
                placeholder="8bd0d568-..." />
            </div>
          </div>
        </div>
        <Button onClick={submitForensic} disabled={forensicSubmitting} variant="default">
          {forensicSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          🔬 Forensik starten
        </Button>
      </Card>



      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Recent Runs</h2>
        {runs.length === 0 && (
          <p className="text-sm text-muted-foreground">Noch keine Runs.</p>
        )}
        {runs.map((r) => (
          <Card key={r.id} className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <code className="text-xs">{r.id.slice(0, 8)}</code>
                  <Badge variant={r.status === "completed" ? "default" : r.status === "failed" ? "destructive" : "secondary"}>
                    {r.status}
                  </Badge>
                  {r.speaker_label && <span className="text-sm">· {r.speaker_label}</span>}
                  <span className="text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleString()}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground truncate max-w-xl">
                  plate: {r.plate_url}
                </div>
                <div className="text-xs text-muted-foreground truncate max-w-xl">
                  audio: {r.audio_url}
                </div>
                {r.error_message && (
                  <div className="text-xs text-destructive">err: {r.error_message}</div>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {(r.variants ?? []).map((v) => {
                const isForensic = v.id?.startsWith("frame_");
                return (
                  <Card key={v.id} className="p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium">{v.label}</div>
                      <Badge variant={
                        v.status === "COMPLETED" ? "default" :
                        v.status === "PENDING" ? "secondary" :
                        "destructive"
                      }>
                        {isForensic && typeof v.face_count === "number"
                          ? `${v.face_count} face${v.face_count === 1 ? "" : "s"}`
                          : v.status}
                      </Badge>
                    </div>
                    {v.output_url ? (
                      isForensic ? (
                        <img src={v.output_url} className="w-full rounded" alt="frame" />
                      ) : (
                        <video src={v.output_url} controls className="w-full rounded" />
                      )
                    ) : (
                      <div className="text-xs text-muted-foreground italic h-32 flex items-center justify-center bg-muted rounded">
                        {v.dispatch_error || v.error || "waiting…"}
                      </div>
                    )}
                    {isForensic && v.faces && v.faces.length > 0 && (
                      <div className="text-[10px] text-muted-foreground space-y-0.5">
                        {v.faces.map((f, i) => (
                          <div key={i}>
                            face {i + 1}: x={f.x_pct}% y={f.y_pct}% area={f.area_pct}% mouth={f.mouth_visible ? "✓" : "✗"}
                          </div>
                        ))}
                      </div>
                    )}
                    {v.job_id && (
                      <code className="text-[10px] text-muted-foreground block truncate">job {v.job_id}</code>
                    )}
                  </Card>
                );
              })}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
