import { useMemo, useRef, useState } from 'react';
import JSZip from 'jszip';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  BookOpen, ChevronDown, ChevronUp, Download, FileUp, Loader2, Plus, Sparkles, Trash2, Wand2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAudiobookProject } from '@/hooks/useAudiobookProject';
import { AudiobookCastPanel } from './AudiobookCastPanel';
import {
  AUDIOBOOK_LANGUAGES,
  countChars,
  estimateCostCredits,
  estimateCostEuros,
  estimateDurationSeconds,
  formatDuration,
  type AudiobookLanguage,
} from '@/lib/audiobook/manuscript';

export function AudiobookPanel() {
  const {
    project, chapters, loading, renderingId,
    updateProject, importManuscript, addChapter, updateChapter,
    deleteChapter, moveChapter, renderChapter,
  } = useAudiobookProject();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [importText, setImportText] = useState('');
  const [exporting, setExporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const active = chapters.find((c) => c.id === activeId) ?? chapters[0] ?? null;

  const totals = useMemo(() => {
    const chars = chapters.reduce((sum, c) => sum + countChars(c.body), 0);
    return {
      chars,
      credits: estimateCostCredits(chars),
      euros: estimateCostEuros(chars),
      duration: estimateDurationSeconds(chars),
      rendered: chapters.filter((c) => c.audio_url).length,
    };
  }, [chapters]);

  const handleFile = async (file: File) => {
    const text = await file.text();
    setImportText(text);
    await importManuscript(text);
  };

  const handleExportZip = async () => {
    const done = chapters.filter((c) => c.audio_url);
    if (done.length === 0) { toast.error('Noch keine vertonten Kapitel'); return; }
    setExporting(true);
    try {
      const zip = new JSZip();
      const folder = zip.folder(project?.title || 'Hoerbuch')!;
      await Promise.all(done.map(async (chapter, i) => {
        const res = await fetch(chapter.audio_url!);
        const blob = await res.blob();
        const num = String(i + 1).padStart(2, '0');
        const safe = chapter.title.replace(/[^\p{L}\p{N} -]/gu, '').trim() || 'Kapitel';
        folder.file(`${num} - ${safe}.mp3`, blob);
      }));
      folder.file('info.txt', [
        `Titel: ${project?.title ?? ''}`,
        `Autor: ${project?.author ?? ''}`,
        `Sprache: ${project?.language ?? ''}`,
        `Kapitel: ${done.length}`,
      ].join('\n'));

      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(project?.title || 'hoerbuch').replace(/\s+/g, '-').toLowerCase()}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${done.length} Kapitel exportiert`);
    } catch (error) {
      console.error('[audiobook] export failed:', error);
      toast.error('Export fehlgeschlagen');
    } finally {
      setExporting(false);
    }
  };

  if (loading || !project) {
    return (
      <Card className="p-10 flex items-center justify-center bg-card/60 backdrop-blur-xl">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {/* Kopf */}
      <Card className="p-5 bg-gradient-to-br from-primary/10 via-card/60 to-cyan-500/10 border-primary/30 backdrop-blur-xl">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-cyan-500 flex items-center justify-center shrink-0">
            <BookOpen className="w-6 h-6 text-primary-foreground" />
          </div>
          <div className="flex-1 min-w-[16rem] space-y-2">
            <Input
              value={project.title}
              onChange={(e) => updateProject({ title: e.target.value })}
              className="h-9 text-base font-semibold bg-background/40"
              placeholder="Titel des Hörbuchs"
            />
            <div className="flex gap-2 flex-wrap">
              <Input
                value={project.author ?? ''}
                onChange={(e) => updateProject({ author: e.target.value })}
                className="h-9 text-sm bg-background/40 max-w-[16rem]"
                placeholder="Autor / Sprecher-Label"
              />
              <Select
                value={project.language}
                onValueChange={(v) => updateProject({ language: v as AudiobookLanguage })}
              >
                <SelectTrigger className="h-9 w-[10rem] text-sm bg-background/40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[60]">
                  {AUDIOBOOK_LANGUAGES.map((l) => (
                    <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="text-right text-xs text-muted-foreground space-y-1">
            <div><span className="text-foreground font-semibold">{chapters.length}</span> Kapitel</div>
            <div>{totals.chars.toLocaleString('de-DE')} Zeichen</div>
            <div>≈ {formatDuration(totals.duration)}</div>
            <div className="text-primary font-semibold">
              {totals.credits.toLocaleString('de-DE')} Cr · {totals.euros.toFixed(2)} €
            </div>
          </div>
        </div>
      </Card>

      <AudiobookCastPanel
        cast={project.cast_config}
        language={project.language}
        onChange={(cast) => updateProject({ cast_config: cast })}
      />

      {/* Manuskript-Import */}
      {chapters.length === 0 && (
        <Card className="p-5 space-y-3 bg-card/60 backdrop-blur-xl border-primary/20">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <FileUp className="w-4 h-4 text-primary" /> Manuskript
          </h3>
          <Textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder={'Text einfügen…\n\nÜberschriften („Kapitel 1" oder „# Titel") werden automatisch als Kapitel erkannt.'}
            className="min-h-[180px] text-sm bg-background/40"
          />
          <div className="flex gap-2 flex-wrap">
            <Button onClick={() => importManuscript(importText)} disabled={!importText.trim()}>
              <Wand2 className="w-4 h-4 mr-2" /> Kapitel erkennen
            </Button>
            <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
              <FileUp className="w-4 h-4 mr-2" /> .txt / .md laden
            </Button>
            <Button variant="ghost" onClick={addChapter}>
              <Plus className="w-4 h-4 mr-2" /> Leeres Kapitel
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.md,text/plain,text/markdown"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }}
            />
          </div>
        </Card>
      )}

      {chapters.length > 0 && (
        <div className="grid lg:grid-cols-[18rem_1fr] gap-5">
          {/* Kapitelliste */}
          <Card className="p-3 space-y-2 bg-card/60 backdrop-blur-xl border-primary/20 h-fit">
            {chapters.map((chapter, i) => (
              <div
                key={chapter.id}
                onClick={() => setActiveId(chapter.id)}
                className={`rounded-lg border p-2.5 cursor-pointer transition-colors ${
                  active?.id === chapter.id
                    ? 'border-primary/50 bg-primary/10'
                    : 'border-border/50 hover:border-primary/30 bg-background/30'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground w-5">{String(i + 1).padStart(2, '0')}</span>
                  <span className="text-sm flex-1 truncate">{chapter.title}</span>
                  {chapter.audio_url && <Badge variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-400">MP3</Badge>}
                  {chapter.render_status === 'failed' && <Badge variant="destructive" className="text-[10px]">Fehler</Badge>}
                </div>
                <div className="flex items-center gap-1 mt-1.5">
                  <span className="text-[10px] text-muted-foreground flex-1">
                    {countChars(chapter.body).toLocaleString('de-DE')} Zeichen
                  </span>
                  <Button size="icon" variant="ghost" className="h-6 w-6"
                    onClick={(e) => { e.stopPropagation(); void moveChapter(chapter.id, -1); }}>
                    <ChevronUp className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-6 w-6"
                    onClick={(e) => { e.stopPropagation(); void moveChapter(chapter.id, 1); }}>
                    <ChevronDown className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-6 w-6 hover:text-destructive"
                    onClick={(e) => { e.stopPropagation(); void deleteChapter(chapter.id); }}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))}
            <Button variant="outline" size="sm" className="w-full" onClick={addChapter}>
              <Plus className="w-4 h-4 mr-1.5" /> Kapitel
            </Button>
          </Card>

          {/* Editor */}
          <div className="space-y-4">
            {active && (
              <Card className="p-5 space-y-4 bg-card/60 backdrop-blur-xl border-primary/20">
                <Input
                  value={active.title}
                  onChange={(e) => updateChapter(active.id, { title: e.target.value })}
                  className="h-9 text-sm font-semibold bg-background/40"
                />
                <Textarea
                  value={active.body}
                  onChange={(e) => updateChapter(active.id, { body: e.target.value })}
                  className="min-h-[320px] text-sm leading-relaxed bg-background/40"
                  placeholder={'Kapiteltext…\n\nEmma: Und dann leuchtete der Wald.'}
                />

                <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
                  <span>{countChars(active.body).toLocaleString('de-DE')} Zeichen</span>
                  <span>≈ {formatDuration(estimateDurationSeconds(countChars(active.body)))}</span>
                  <span className="text-primary font-semibold">
                    {estimateCostCredits(countChars(active.body)).toLocaleString('de-DE')} Cr ·{' '}
                    {estimateCostEuros(countChars(active.body)).toFixed(2)} €
                  </span>
                </div>

                {active.error_message && (
                  <p className="text-xs text-destructive">{active.error_message}</p>
                )}

                <div className="flex gap-2 flex-wrap items-center">
                  <Button
                    onClick={() => renderChapter(active)}
                    disabled={renderingId !== null || !active.body.trim()}
                    className="bg-gradient-to-r from-primary to-cyan-500"
                  >
                    {renderingId === active.id
                      ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      : <Sparkles className="w-4 h-4 mr-2" />}
                    Kapitel vertonen
                  </Button>
                  {active.audio_url && (
                    <audio controls src={active.audio_url} className="h-9 flex-1 min-w-[14rem]" />
                  )}
                </div>
              </Card>
            )}

            {/* Pausen + Export */}
            <Card className="p-5 space-y-4 bg-card/60 backdrop-blur-xl border-primary/20">
              <div className="grid sm:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">
                    Pause zwischen Absätzen: {(project.paragraph_gap_ms / 1000).toFixed(1)} s
                  </label>
                  <Slider
                    value={[project.paragraph_gap_ms]}
                    min={0} max={1500} step={100}
                    onValueChange={([v]) => updateProject({ paragraph_gap_ms: v })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">
                    Pause am Kapitelende: {(project.chapter_gap_ms / 1000).toFixed(1)} s
                  </label>
                  <Slider
                    value={[project.chapter_gap_ms]}
                    min={0} max={3000} step={100}
                    onValueChange={([v]) => updateProject({ chapter_gap_ms: v })}
                  />
                </div>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <Button variant="outline" onClick={handleExportZip} disabled={exporting || totals.rendered === 0}>
                  {exporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                  ZIP-Export ({totals.rendered} Kapitel)
                </Button>
                <span className="text-xs text-muted-foreground">
                  MP3 pro Kapitel, 44,1 kHz · Abrechnung über Media Credits
                </span>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
