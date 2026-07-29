import { useCallback, useEffect, useState } from 'react';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  buildRenderSegments,
  countChars,
  parseChapters,
  type AudiobookCast,
  type AudiobookLanguage,
} from '@/lib/audiobook/manuscript';

export interface AudiobookChapter {
  id: string;
  project_id: string;
  chapter_index: number;
  title: string;
  body: string;
  char_count: number;
  audio_url: string | null;
  duration_seconds: number | null;
  render_status: string;
  render_progress: number;
  error_message: string | null;
}

export interface AudiobookProject {
  id: string;
  title: string;
  author: string | null;
  language: AudiobookLanguage;
  cast_config: AudiobookCast;
  paragraph_gap_ms: number;
  chapter_gap_ms: number;
  status: string;
}

const EMPTY_CAST: AudiobookCast = { narrator: null, characters: [] };

export function useAudiobookProject() {
  const [project, setProject] = useState<AudiobookProject | null>(null);
  const [chapters, setChapters] = useState<AudiobookChapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [renderingId, setRenderingId] = useState<string | null>(null);

  const loadChapters = useCallback(async (projectId: string) => {
    const { data, error } = await supabase
      .from('audiobook_chapters')
      .select('*')
      .eq('project_id', projectId)
      .order('chapter_index', { ascending: true });
    if (error) {
      console.error('[audiobook] load chapters failed:', error);
      return;
    }
    setChapters((data ?? []) as AudiobookChapter[]);
  }, []);

  /** Lädt das zuletzt bearbeitete Projekt oder legt eins an. */
  const init = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const { data: existing } = await supabase
        .from('audiobook_projects')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      let row = existing;
      if (!row) {
        const { data: created, error } = await supabase
          .from('audiobook_projects')
          .insert({ user_id: user.id, title: 'Neues Hörbuch', language: 'de' })
          .select('*')
          .single();
        if (error) throw error;
        row = created;
      }

      const p: AudiobookProject = {
        id: row.id,
        title: row.title,
        author: row.author,
        language: (row.language || 'de') as AudiobookLanguage,
        cast_config: ((row.cast_config as unknown) as AudiobookCast) ?? EMPTY_CAST,
        paragraph_gap_ms: row.paragraph_gap_ms ?? 400,
        chapter_gap_ms: row.chapter_gap_ms ?? 1200,
        status: row.status,
      };
      if (!p.cast_config.characters) p.cast_config.characters = [];
      setProject(p);
      await loadChapters(p.id);
    } catch (error) {
      console.error('[audiobook] init failed:', error);
      toast.error('Hörbuch-Projekt konnte nicht geladen werden');
    } finally {
      setLoading(false);
    }
  }, [loadChapters]);

  useEffect(() => { void init(); }, [init]);

  const updateProject = useCallback(async (patch: Partial<AudiobookProject>) => {
    if (!project) return;
    const next = { ...project, ...patch };
    setProject(next);
    const { error } = await supabase
      .from('audiobook_projects')
      .update({
        title: next.title,
        author: next.author,
        language: next.language,
        cast_config: JSON.parse(JSON.stringify(next.cast_config)),
        paragraph_gap_ms: next.paragraph_gap_ms,
        chapter_gap_ms: next.chapter_gap_ms,
      })
      .eq('id', project.id);
    if (error) console.error('[audiobook] update project failed:', error);
  }, [project]);

  const importManuscript = useCallback(async (raw: string) => {
    if (!project) return;
    const parsed = parseChapters(raw);
    if (parsed.length === 0) { toast.error('Kein Text erkannt'); return; }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from('audiobook_chapters').delete().eq('project_id', project.id);
    const rows = parsed.map((c, i) => ({
      project_id: project.id,
      user_id: user.id,
      chapter_index: i,
      title: c.title,
      body: c.body,
      char_count: countChars(c.body),
    }));
    const { error } = await supabase.from('audiobook_chapters').insert(rows);
    if (error) { toast.error('Import fehlgeschlagen'); return; }
    await loadChapters(project.id);
    toast.success(`${parsed.length} Kapitel importiert`);
  }, [project, loadChapters]);

  const addChapter = useCallback(async () => {
    if (!project) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from('audiobook_chapters').insert({
      project_id: project.id,
      user_id: user.id,
      chapter_index: chapters.length,
      title: `Kapitel ${chapters.length + 1}`,
      body: '',
    });
    if (error) { toast.error('Kapitel konnte nicht angelegt werden'); return; }
    await loadChapters(project.id);
  }, [project, chapters.length, loadChapters]);

  const updateChapter = useCallback(async (id: string, patch: Partial<AudiobookChapter>) => {
    setChapters((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    const payload: Record<string, unknown> = { ...patch };
    if (typeof patch.body === 'string') payload.char_count = countChars(patch.body);
    const { error } = await supabase.from('audiobook_chapters').update(payload).eq('id', id);
    if (error) console.error('[audiobook] update chapter failed:', error);
  }, []);

  const deleteChapter = useCallback(async (id: string) => {
    if (!project) return;
    const { error } = await supabase.from('audiobook_chapters').delete().eq('id', id);
    if (error) { toast.error('Kapitel konnte nicht gelöscht werden'); return; }
    const remaining = chapters.filter((c) => c.id !== id);
    await Promise.all(remaining.map((c, i) =>
      supabase.from('audiobook_chapters').update({ chapter_index: i }).eq('id', c.id)));
    await loadChapters(project.id);
  }, [project, chapters, loadChapters]);

  const moveChapter = useCallback(async (id: string, direction: -1 | 1) => {
    if (!project) return;
    const idx = chapters.findIndex((c) => c.id === id);
    const target = idx + direction;
    if (idx < 0 || target < 0 || target >= chapters.length) return;
    const reordered = [...chapters];
    [reordered[idx], reordered[target]] = [reordered[target], reordered[idx]];
    setChapters(reordered.map((c, i) => ({ ...c, chapter_index: i })));
    await Promise.all(reordered.map((c, i) =>
      supabase.from('audiobook_chapters').update({ chapter_index: i }).eq('id', c.id)));
    await loadChapters(project.id);
  }, [project, chapters, loadChapters]);

  const renderChapter = useCallback(async (chapter: AudiobookChapter) => {
    if (!project) return;
    const { segments, missingVoices } = buildRenderSegments(chapter.body, project.cast_config);
    if (missingVoices.length > 0) {
      toast.error('Stimme fehlt', { description: `Ohne Stimme: ${missingVoices.join(', ')}` });
      return;
    }
    if (segments.length === 0) { toast.error('Kapitel enthält keinen Text'); return; }

    setRenderingId(chapter.id);
    setChapters((prev) => prev.map((c) => (c.id === chapter.id
      ? { ...c, render_status: 'rendering', error_message: null } : c)));

    try {
      const { data, error } = await supabase.functions.invoke('render-audiobook', {
        body: { chapterId: chapter.id, segments },
      });
      if (error) {
        const details = error instanceof FunctionsHttpError
          ? await error.context.text().catch(() => '') : error.message;
        let message = details || 'Rendern fehlgeschlagen';
        try { message = JSON.parse(details).message ?? message; } catch { /* plain text */ }
        throw new Error(message);
      }
      toast.success(`„${chapter.title}" vertont`, {
        description: `${((data?.cost ?? 0) as number).toFixed(2)} € verbraucht`,
      });
      await loadChapters(project.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Rendern fehlgeschlagen';
      toast.error('Vertonung fehlgeschlagen', { description: message });
      setChapters((prev) => prev.map((c) => (c.id === chapter.id
        ? { ...c, render_status: 'failed', error_message: message } : c)));
    } finally {
      setRenderingId(null);
    }
  }, [project, loadChapters]);

  return {
    project, chapters, loading, renderingId,
    updateProject, importManuscript, addChapter, updateChapter,
    deleteChapter, moveChapter, renderChapter, reload: init,
  };
}
