import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Search, ShieldCheck, Sparkles, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useVoiceLibrary, type VoiceLibraryFilters } from '@/hooks/useVoiceLibrary';
import { VoicePreviewButton } from './VoicePreviewButton';
import type { VoiceMeta } from '@/lib/elevenlabs-voices';
import {
  VOICE_LANGUAGES,
  NATIVE_SENSITIVE_LANGUAGES,
  normalizeVoiceLanguage,
  toPickerLanguage,
  voiceLanguageLabel,
} from '@/lib/voice-languages';
import {
  VOICE_CATEGORIES,
  getVoiceCategory,
  pushRecentVoice,
  readRecentVoices,
  type VoiceCategoryId,
} from '@/lib/voice-categories';
import { useCustomVoices } from '@/hooks/useCustomVoices';

interface UniversalVoiceLibraryPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (voice: VoiceMeta, language: string) => void;
  /** ISO-639-1 code (`de`, `en`, `es`, `fr`, …) or `all`. Pre-selects the language filter. */
  language?: string;
  currentVoiceId?: string;
  title?: string;
  /** If false, native-only defaults off (useful for EN-only workflows like Kling Omni). */
  enforceNative?: boolean;
  /** If false, the language dropdown is hidden and the prop language is locked. */
  allowLanguageChange?: boolean;
  /** Vorbelegte Kategorie („Empfohlen für diesen Kontext"). */
  category?: VoiceCategoryId;
}


const TIER_LABEL: Record<string, { label: string; className: string }> = {
  cloned:    { label: 'Meine Stimme',      className: 'bg-[#F5C76A]/20 text-[#F5C76A] border-[#F5C76A]/40' },
  premium:   { label: 'Premium',            className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  standard:  { label: 'Workspace',          className: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30' },
  custom:    { label: 'Custom',             className: 'bg-purple-500/15 text-purple-300 border-purple-500/30' },
  community: { label: 'Community',          className: 'bg-white/5 text-white/60 border-white/10' },
};

/** Glas-Pille für alle Filter-Dropdowns (Cinematic Glass Noir). */
const FILTER_TRIGGER =
  'h-9 text-xs font-medium bg-white/5 border-white/10 hover:border-gold/30 transition-colors';

export function UniversalVoiceLibraryPicker({
  open,
  onOpenChange,
  onSelect,
  language: languageProp = 'all',
  currentVoiceId,
  title = 'Voice-Bibliothek',
  enforceNative = true,
  allowLanguageChange = true,
  category: categoryProp = 'all',
}: UniversalVoiceLibraryPickerProps) {
  const [search, setSearch] = useState('');
  const [language, setLanguage] = useState<string>(toPickerLanguage(languageProp) || 'all');
  const [category, setCategory] = useState<VoiceCategoryId>(categoryProp);
  const [gender, setGender] = useState<'all' | 'male' | 'female' | 'neutral'>('all');
  const [age, setAge] = useState<'all' | 'young' | 'middle_aged' | 'old'>('all');
  const [useCase, setUseCase] = useState<'all' | 'narration' | 'conversational' | 'characters' | 'social_media' | 'news'>('all');
  const nativeSensitive = NATIVE_SENSITIVE_LANGUAGES.has(language);
  const [nativeOnly, setNativeOnly] = useState<boolean>(enforceNative && nativeSensitive);
  const [sort, setSort] = useState<'popularity' | 'name'>('popularity');
  const { voices: customVoices } = useCustomVoices();
  const [recent, setRecent] = useState(() => readRecentVoices());

  // Keep in sync when the caller changes the target language (e.g. project language switch).
  useEffect(() => {
    const next = languageProp === 'all' ? 'all' : (toPickerLanguage(languageProp) || 'all');
    setLanguage(next);
  }, [languageProp]);

  useEffect(() => {
    setNativeOnly(enforceNative && NATIVE_SENSITIVE_LANGUAGES.has(language));
  }, [language, enforceNative]);

  // Kategorie beim Öffnen auf die Kontext-Empfehlung zurücksetzen.
  useEffect(() => {
    if (open) {
      setCategory(categoryProp);
      setRecent(readRecentVoices());
    }
  }, [open, categoryProp]);

  const categoryFacets = useMemo(() => getVoiceCategory(category).facets, [category]);

  const filters: VoiceLibraryFilters = useMemo(() => ({
    language,
    gender: gender === 'all' ? (categoryFacets.gender ?? null) : gender,
    age: age === 'all' ? (categoryFacets.age ?? null) : age,
    use_case: useCase === 'all' ? (categoryFacets.use_case ?? null) : useCase,
    search: search.trim(),
    nativeOnly,
    sort,
    pageSize: 60,
  }), [language, gender, age, useCase, search, nativeOnly, sort, categoryFacets]);

  const {
    data,
    isLoading,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
  } = useVoiceLibrary({ ...filters, ...(category === 'mine' ? { pageSize: 10 } : {}) });

  const myVoices = useMemo<VoiceMeta[]>(
    () =>
      (customVoices ?? [])
        .filter((c) => c.is_active !== false && c.elevenlabs_voice_id)
        .filter((c) => language === 'all' || normalizeVoiceLanguage(c.language) === language)
        .filter((c) => !search.trim() || c.name?.toLowerCase().includes(search.trim().toLowerCase()))
        .map((c) => ({
          id: c.elevenlabs_voice_id!,
          name: c.name || 'Meine Stimme',
          language: c.language || language,
          tier: 'cloned',
          description: 'Eigener Voice-Clone',
        } as unknown as VoiceMeta)),
    [customVoices, search, language],
  );

  const libraryVoices = useMemo(
    () => (data?.pages.flatMap((p) => p.voices) ?? [])
      .filter((voice) => language === 'all' || normalizeVoiceLanguage(voice.language) === language),
    [data, language],
  );
  const visibleRecent = useMemo(
    () => recent.filter((voice) => language === 'all' || normalizeVoiceLanguage(voice.language) === language),
    [recent, language],
  );
  const voices = useMemo<VoiceMeta[]>(() => {
    if (category === 'mine') return myVoices;
    const ids = new Set(myVoices.map((v) => v.id));
    return [...myVoices.filter(() => search.trim().length > 0), ...libraryVoices.filter((v) => !ids.has(v.id))];
  }, [category, myVoices, libraryVoices, search]);
  const total = category === 'mine' ? myVoices.length : (data?.pages[0]?.total ?? 0);
  const nativeCount = data?.pages[0]?.nativeCount ?? 0;


  // Infinite scroll sentinel
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!sentinelRef.current || !hasNextPage) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !isFetchingNextPage) fetchNextPage();
    }, { rootMargin: '400px' });
    io.observe(sentinelRef.current);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const [titleMain, titleSub] = useMemo(() => {
    const parts = title.split(/\s+[–—-]\s+/);
    return parts.length > 1 ? [parts[0], parts.slice(1).join(' – ')] : [title, ''];
  }, [title]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[min(90vh,880px)] max-h-[90vh] flex flex-col overflow-hidden gap-4 bg-[#050816] border-white/10 text-white shadow-2xl shadow-black/60 rounded-2xl">
        <DialogHeader className="shrink-0 space-y-2">
          <DialogTitle className="font-display text-3xl font-bold tracking-tight text-gold">
            {titleMain}
            {titleSub && (
              <>
                <span className="mx-3 font-light text-white/25">|</span>
                <span className="italic font-medium">{titleSub}</span>
              </>
            )}
          </DialogTitle>
          <DialogDescription className="text-[11px] uppercase tracking-[0.15em] text-white/45">
            {total.toLocaleString('de-DE')} Stimmen
            {language !== 'all' && <> in <span className="text-cyan">{voiceLanguageLabel(language)}</span></>}
            {nativeSensitive && nativeOnly && ` · nur native Sprecher`}
          </DialogDescription>
        </DialogHeader>

        {/* Filter bar */}
        <div className="shrink-0 space-y-3 border-b border-white/10 pb-4">
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-white/25 transition-colors group-focus-within:text-gold" />
            <Input
              placeholder="Name, Beschreibung, Akzent…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-12 pl-11 rounded-lg bg-white/5 border-white/10 placeholder:text-white/25 focus-visible:ring-1 focus-visible:ring-gold/50 focus-visible:border-gold/50"
            />
          </div>


          <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
            {allowLanguageChange && (
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger className={FILTER_TRIGGER}><SelectValue placeholder="Sprache" /></SelectTrigger>
                <SelectContent className="max-h-[320px]">
                  <SelectItem value="all">🌍 Alle Sprachen</SelectItem>
                  {VOICE_LANGUAGES.map((l) => (
                    <SelectItem key={l.code} value={l.code}>{l.flag} {l.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Select value={gender} onValueChange={(v) => setGender(v as typeof gender)}>
              <SelectTrigger className={FILTER_TRIGGER}><SelectValue placeholder="Geschlecht" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Geschlechter</SelectItem>
                <SelectItem value="female">Weiblich</SelectItem>
                <SelectItem value="male">Männlich</SelectItem>
                <SelectItem value="neutral">Neutral</SelectItem>
              </SelectContent>
            </Select>

            <Select value={age} onValueChange={(v) => setAge(v as typeof age)}>
              <SelectTrigger className={FILTER_TRIGGER}><SelectValue placeholder="Alter" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Alter</SelectItem>
                <SelectItem value="young">Jung</SelectItem>
                <SelectItem value="middle_aged">Mittel</SelectItem>
                <SelectItem value="old">Reif</SelectItem>
              </SelectContent>
            </Select>

            <Select value={useCase} onValueChange={(v) => setUseCase(v as typeof useCase)}>
              <SelectTrigger className={FILTER_TRIGGER}><SelectValue placeholder="Einsatz" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Einsätze</SelectItem>
                <SelectItem value="narration">Narration</SelectItem>
                <SelectItem value="conversational">Konversation</SelectItem>
                <SelectItem value="characters">Charaktere</SelectItem>
                <SelectItem value="social_media">Social Media</SelectItem>
                <SelectItem value="news">News</SelectItem>
              </SelectContent>
            </Select>

            <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
              <SelectTrigger className={FILTER_TRIGGER}><SelectValue placeholder="Sortierung" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="popularity">Beliebtheit</SelectItem>
                <SelectItem value="name">Name (A–Z)</SelectItem>
              </SelectContent>
            </Select>

            {nativeSensitive && (
              <div className="flex items-center gap-2.5 px-3 rounded-md bg-white/5 border border-white/10">
                <ShieldCheck className="h-4 w-4 text-gold shrink-0" />
                <Label htmlFor="native-only" className="text-[10px] font-bold uppercase tracking-widest text-white/45 flex-1 cursor-pointer">Nur nativ</Label>
                <Switch id="native-only" checked={nativeOnly} onCheckedChange={setNativeOnly} />
              </div>
            )}
          </div>

          {/* Kategorien */}
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
            {VOICE_CATEGORIES.map((c) => {
              const active = c.id === category;
              return (
                <button
                  key={c.id}
                  type="button"
                  title={c.hint}
                  onClick={() => setCategory(c.id)}
                  className={cn(
                    'shrink-0 rounded-full px-4 py-2 text-xs transition-all',
                    active
                      ? 'bg-gold text-navy-900 font-semibold shadow-lg shadow-gold/10'
                      : 'bg-white/5 border border-white/10 font-medium text-white/60 hover:text-white hover:border-gold/30',
                  )}
                >
                  <span className="mr-1.5">{c.icon}</span>
                  {c.label}
                  {c.id === 'mine' && myVoices.length > 0 && (
                    <span className={cn('ml-1', active ? 'text-navy-900/60' : 'text-white/40')}>({myVoices.length})</span>
                  )}
                </button>
              );
            })}
          </div>


          {/* Zuletzt verwendet */}
          {visibleRecent.length > 0 && category !== 'mine' && !search.trim() && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
              <span className="shrink-0 text-[10px] uppercase tracking-wider text-white/35 pr-1">Zuletzt</span>
              {visibleRecent.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => {
                    pushRecentVoice(r);
                    onSelect({ id: r.id, name: r.name, language: r.language } as unknown as VoiceMeta, r.language);
                    onOpenChange(false);
                  }}
                  className="shrink-0 rounded-full border border-white/10 bg-white/[0.02] px-2.5 py-1 text-[11px] text-white/70 hover:bg-white/[0.06]"
                >
                  {r.name}
                </button>
              ))}
            </div>
          )}
        </div>


        {/* List */}
        <ScrollArea type="always" className="min-h-0 h-full flex-1 -mx-6 px-6 [&_[data-radix-scroll-area-thumb]]:bg-gold/40 [&_[data-radix-scroll-area-thumb]]:hover:bg-gold/70">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-white/50">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Lade Stimmen…
            </div>
          ) : voices.length === 0 ? (
            <div className="text-center py-16 text-white/50">Keine Stimmen gefunden. Filter anpassen.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-4">
              {voices.map((v) => {
                const tier = TIER_LABEL[v.tier || 'community'];
                const selected = v.id === currentVoiceId;
                return (
                  <button
                    key={v.id}
                    onClick={() => {
                      const resolved = language !== 'all'
                        ? language
                        : (typeof v.language === 'string' ? v.language : 'en');
                      pushRecentVoice({ id: v.id, name: v.name, language: resolved });
                      onSelect(v, resolved);
                      onOpenChange(false);
                    }}
                    className={cn(
                      'group relative text-left rounded-xl border p-5 transition-all duration-300',
                      selected
                        ? 'bg-gold/5 border-gold/60 shadow-lg shadow-gold/5'
                        : 'bg-white/[0.03] border-white/5 hover:border-gold/40 hover:-translate-y-1 hover:shadow-2xl hover:shadow-gold/5',
                    )}
                  >
                    {selected && (
                      <span className="absolute top-2.5 right-2.5 h-2 w-2 rounded-full bg-gold animate-pulse" />
                    )}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          {v.tier === 'cloned'
                            ? <Sparkles className="h-4 w-4 text-gold shrink-0" />
                            : <User className={cn('h-4 w-4 shrink-0', selected ? 'text-gold' : 'text-white/40')} />}
                          <span className={cn(
                            'text-lg font-bold truncate transition-colors',
                            selected ? 'text-gold' : 'group-hover:text-gold',
                          )}>{v.name}</span>
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge variant="outline" className={cn('text-[9px] font-bold uppercase tracking-wider px-2 py-0 h-[18px]', tier.className)}>{tier.label}</Badge>
                          {v.gender && <Badge variant="outline" className="text-[9px] font-medium uppercase tracking-wider px-2 py-0 h-[18px] border-white/5 bg-white/5 text-white/50">{v.gender}</Badge>}
                          {v.age && <Badge variant="outline" className="text-[9px] font-medium uppercase tracking-wider px-2 py-0 h-[18px] border-white/5 bg-white/5 text-white/50">{v.age}</Badge>}
                          {v.accent && v.accent !== 'native' && <Badge variant="outline" className="text-[9px] font-medium uppercase tracking-wider px-2 py-0 h-[18px] border-white/5 bg-white/5 text-white/50">{v.accent}</Badge>}
                          {v.is_native && <Badge variant="outline" className="text-[9px] font-bold uppercase tracking-wider px-2 py-0 h-[18px] bg-gold/10 text-gold border-gold/20">nativ</Badge>}
                        </div>
                        {v.description && (
                          <p className="text-xs italic leading-relaxed text-white/40 mt-3 line-clamp-2">{v.description}</p>
                        )}
                      </div>
                      <div onClick={(e) => e.stopPropagation()}>
                        <VoicePreviewButton
                          voiceId={v.id}
                          language={typeof v.language === 'string' ? v.language : 'de'}
                          size="icon"
                          className={cn(
                            'h-10 w-10 rounded-full transition-all',
                            selected
                              ? 'bg-gold text-navy-900 hover:bg-gold-light hover:text-navy-900'
                              : 'bg-white/5 text-white/70 group-hover:scale-110 hover:bg-gold hover:text-navy-900',
                          )}
                        />
                      </div>
                    </div>
                  </button>
                );
              })}
              <div ref={sentinelRef} className="col-span-full flex flex-col items-center justify-center gap-2 py-6 text-white/40 text-[11px] uppercase tracking-widest">
                <span>{voices.length.toLocaleString('de-DE')} von {total.toLocaleString('de-DE')} geladen</span>
                {hasNextPage && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isFetchingNextPage}
                    onClick={() => fetchNextPage()}
                    className="mt-1 rounded-lg bg-white/5 border-white/10 text-white hover:bg-white/10 hover:border-gold/30 normal-case tracking-normal"
                  >
                    {isFetchingNextPage ? <><Loader2 className="h-3 w-3 animate-spin mr-2" />Lade weitere…</> : 'Weitere Stimmen laden'}
                  </Button>
                )}
              </div>
            </div>
          )}
        </ScrollArea>

        <div className="shrink-0 flex justify-end -mx-6 -mb-6 px-6 py-4 border-t border-white/10 bg-black/40">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="px-8 rounded-lg border border-white/10 bg-white/5 text-sm font-bold text-white hover:bg-white/10"
          >
            Schließen
          </Button>
        </div>

      </DialogContent>
    </Dialog>
  );
}
