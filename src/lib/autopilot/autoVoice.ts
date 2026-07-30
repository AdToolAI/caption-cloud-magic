/**
 * Auto-Casting & Auto-Voice for the Autopilot.
 *
 * Rule: the customer never has to assign anything. If a speaker or a voice is
 * missing, the system decides — deterministically, and always from real data
 * (Cast & World characters, the ElevenLabs voice library). A missing voice must
 * never block a production again.
 */

import { supabase } from '@/integrations/supabase/client';
import { normalizeVoiceLanguage } from '@/lib/voice-languages';

export interface CastMember {
  id: string;
  name: string;
  voiceId: string | null;
  voiceName?: string | null;
  gender?: string | null;
  language?: string | null;
}

export interface ResolvedVoice {
  voiceId: string;
  voiceName: string;
  /** True when the system picked it instead of the user/character default. */
  auto: boolean;
}

/** Loads the cast rows the storyboard references (plus the user's full cast as a pool). */
export async function loadCast(ids: string[]): Promise<Record<string, CastMember>> {
  const map: Record<string, CastMember> = {};
  if (ids.length === 0) return map;
  const { data } = await supabase
    .from('brand_characters')
    .select('id, name, gender, default_voice_id, default_voice_name, default_voice_language')
    .in('id', ids);
  for (const row of data ?? []) {
    map[row.id] = {
      id: row.id,
      name: row.name ?? 'Charakter',
      voiceId: row.default_voice_id ?? null,
      voiceName: row.default_voice_name ?? null,
      gender: row.gender ?? null,
      language: row.default_voice_language ?? null,
    };
  }
  return map;
}

/** The user's own cast — used when the treatment has no characters at all. */
export async function loadUserCastPool(limit = 12): Promise<CastMember[]> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return [];
  const { data } = await supabase
    .from('brand_characters')
    .select('id, name, gender, default_voice_id, default_voice_name, default_voice_language')
    .eq('user_id', auth.user.id)
    .order('usage_count', { ascending: false })
    .limit(limit);
  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name ?? 'Charakter',
    voiceId: row.default_voice_id ?? null,
    voiceName: row.default_voice_name ?? null,
    gender: row.gender ?? null,
    language: row.default_voice_language ?? null,
  }));
}

interface LibraryVoice {
  voice_id: string;
  name: string;
  gender?: string | null;
}

const poolCache = new Map<string, LibraryVoice[]>();

/** Pulls a small, high-quality pool of voices for a language (cached per session). */
async function fetchVoicePool(language: string): Promise<LibraryVoice[]> {
  const lang = normalizeVoiceLanguage(language) || 'de';
  const cached = poolCache.get(lang);
  if (cached) return cached;
  try {
    const { data, error } = await supabase.functions.invoke('list-voices', {
      body: { language: lang, sort: 'popularity', page: 0, pageSize: 40 },
    });
    if (error) throw error;
    const voices = (data?.voices ?? []) as Array<Record<string, unknown>>;
    const pool = voices
      .map((v) => ({
        voice_id: String(v.voice_id ?? v.id ?? ''),
        name: String(v.name ?? 'Stimme'),
        gender: (v.gender as string) ?? null,
      }))
      .filter((v) => v.voice_id.length > 0);
    poolCache.set(lang, pool);
    return pool;
  } catch {
    return [];
  }
}

function genderMatches(character?: string | null, voice?: string | null): boolean {
  if (!character || !voice) return false;
  const c = character.toLowerCase();
  const v = voice.toLowerCase();
  if (c.startsWith('m') && v.startsWith('m')) return true;
  if ((c.startsWith('f') || c.startsWith('w')) && v.startsWith('f')) return true;
  return false;
}

/**
 * Resolves a voice for every character id.
 * Order: character default → gender-matching library voice → any library voice.
 * Voices are never reused inside the same production while alternatives exist.
 */
export async function resolveVoices(
  cast: CastMember[],
  language: string,
): Promise<Record<string, ResolvedVoice>> {
  const result: Record<string, ResolvedVoice> = {};
  const taken = new Set<string>();

  for (const member of cast) {
    if (member.voiceId) {
      result[member.id] = {
        voiceId: member.voiceId,
        voiceName: member.voiceName || 'Eigene Stimme',
        auto: false,
      };
      taken.add(member.voiceId);
    }
  }

  const missing = cast.filter((m) => !result[m.id]);
  if (missing.length === 0) return result;

  const pool = await fetchVoicePool(language);
  if (pool.length === 0) return result;

  for (const member of missing) {
    const preferred = pool.find(
      (v) => !taken.has(v.voice_id) && genderMatches(member.gender, v.gender),
    );
    const pick = preferred ?? pool.find((v) => !taken.has(v.voice_id)) ?? pool[0];
    if (!pick) continue;
    taken.add(pick.voice_id);
    result[member.id] = { voiceId: pick.voice_id, voiceName: pick.name, auto: true };
  }

  return result;
}

/** Narrator fallback when a production has no characters at all. */
export async function resolveNarratorVoice(language: string): Promise<ResolvedVoice | null> {
  const pool = await fetchVoicePool(language);
  if (pool.length === 0) return null;
  return { voiceId: pool[0].voice_id, voiceName: pool[0].name, auto: true };
}
