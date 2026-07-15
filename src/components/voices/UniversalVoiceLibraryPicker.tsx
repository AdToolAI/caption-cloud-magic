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

interface UniversalVoiceLibraryPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (voice: VoiceMeta) => void;
  language?: 'de' | 'en' | 'es' | 'all';
  currentVoiceId?: string;
  title?: string;
  /** If false, native-only defaults off (useful for EN-only workflows like Kling Omni). */
  enforceNative?: boolean;
}

const TIER_LABEL: Record<string, { label: string; className: string }> = {
  cloned:    { label: 'Meine Stimme',      className: 'bg-[#F5C76A]/20 text-[#F5C76A] border-[#F5C76A]/40' },
  premium:   { label: 'Premium',            className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  standard:  { label: 'Workspace',          className: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30' },
  custom:    { label: 'Custom',             className: 'bg-purple-500/15 text-purple-300 border-purple-500/30' },
  community: { label: 'Community',          className: 'bg-white/5 text-white/60 border-white/10' },
};

export function UniversalVoiceLibraryPicker({
  open,
  onOpenChange,
  onSelect,
  language = 'all',
  currentVoiceId,
  title = 'Voice-Bibliothek',
  enforceNative = true,
}: UniversalVoiceLibraryPickerProps) {
  const [search, setSearch] = useState('');
  const [gender, setGender] = useState<'all' | 'male' | 'female' | 'neutral'>('all');
  const [age, setAge] = useState<'all' | 'young' | 'middle_aged' | 'old'>('all');
  const [useCase, setUseCase] = useState<'all' | 'narration' | 'conversational' | 'characters' | 'social_media' | 'news'>('all');
  const [nativeOnly, setNativeOnly] = useState<boolean>(enforceNative && (language === 'de' || language === 'es'));
  const [sort, setSort] = useState<'popularity' | 'name'>('popularity');

  useEffect(() => {
    setNativeOnly(enforceNative && (language === 'de' || language === 'es'));
  }, [language, enforceNative]);

  const filters: VoiceLibraryFilters = useMemo(() => ({
    language,
    gender: gender === 'all' ? null : gender,
    age: age === 'all' ? null : age,
    use_case: useCase === 'all' ? null : useCase,
    search: search.trim(),
    nativeOnly,
    sort,
    pageSize: 60,
  }), [language, gender, age, useCase, search, nativeOnly, sort]);

  const {
    data,
    isLoading,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
  } = useVoiceLibrary(filters);

  const voices = useMemo(() => data?.pages.flatMap((p) => p.voices) ?? [], [data]);
  const total = data?.pages[0]?.total ?? 0;
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col bg-[#050816] border-white/10 text-white">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl text-[#F5C76A]">{title}</DialogTitle>
          <DialogDescription className="text-white/50">
            {total.toLocaleString('de-DE')} Stimmen{language !== 'all' && ` in ${language.toUpperCase()}`}
            {(language === 'de' || language === 'es') && ` · ${nativeCount.toLocaleString('de-DE')} nativ`}
          </DialogDescription>
        </DialogHeader>

        {/* Filter bar */}
        <div className="space-y-3 border-b border-white/5 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
            <Input
              placeholder="Name, Beschreibung, Akzent…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-white/[0.03] border-white/10"
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <Select value={gender} onValueChange={(v) => setGender(v as typeof gender)}>
              <SelectTrigger className="bg-white/[0.03] border-white/10"><SelectValue placeholder="Geschlecht" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Geschlechter</SelectItem>
                <SelectItem value="female">Weiblich</SelectItem>
                <SelectItem value="male">Männlich</SelectItem>
                <SelectItem value="neutral">Neutral</SelectItem>
              </SelectContent>
            </Select>

            <Select value={age} onValueChange={(v) => setAge(v as typeof age)}>
              <SelectTrigger className="bg-white/[0.03] border-white/10"><SelectValue placeholder="Alter" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Alter</SelectItem>
                <SelectItem value="young">Jung</SelectItem>
                <SelectItem value="middle_aged">Mittel</SelectItem>
                <SelectItem value="old">Reif</SelectItem>
              </SelectContent>
            </Select>

            <Select value={useCase} onValueChange={(v) => setUseCase(v as typeof useCase)}>
              <SelectTrigger className="bg-white/[0.03] border-white/10"><SelectValue placeholder="Einsatz" /></SelectTrigger>
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
              <SelectTrigger className="bg-white/[0.03] border-white/10"><SelectValue placeholder="Sortierung" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="popularity">Beliebtheit</SelectItem>
                <SelectItem value="name">Name (A–Z)</SelectItem>
              </SelectContent>
            </Select>

            {(language === 'de' || language === 'es') && (
              <div className="flex items-center gap-2 px-3 rounded-md bg-white/[0.03] border border-white/10">
                <ShieldCheck className="h-4 w-4 text-[#F5C76A]" />
                <Label htmlFor="native-only" className="text-xs flex-1 cursor-pointer">Nur nativ</Label>
                <Switch id="native-only" checked={nativeOnly} onCheckedChange={setNativeOnly} />
              </div>
            )}
          </div>
        </div>

        {/* List */}
        <ScrollArea className="flex-1 -mx-6 px-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-white/50">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Lade Stimmen…
            </div>
          ) : voices.length === 0 ? (
            <div className="text-center py-16 text-white/50">Keine Stimmen gefunden. Filter anpassen.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pb-4">
              {voices.map((v) => {
                const tier = TIER_LABEL[v.tier || 'community'];
                const selected = v.id === currentVoiceId;
                return (
                  <button
                    key={v.id}
                    onClick={() => { onSelect(v); onOpenChange(false); }}
                    className={cn(
                      'text-left rounded-lg border p-3 transition-all group',
                      'bg-white/[0.02] hover:bg-white/[0.05]',
                      selected ? 'border-[#F5C76A] ring-1 ring-[#F5C76A]/40' : 'border-white/10',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          {v.tier === 'cloned' ? <Sparkles className="h-3.5 w-3.5 text-[#F5C76A] shrink-0" /> : <User className="h-3.5 w-3.5 text-white/40 shrink-0" />}
                          <span className="font-medium truncate">{v.name}</span>
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 h-4', tier.className)}>{tier.label}</Badge>
                          {v.gender && <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-white/10 text-white/60">{v.gender}</Badge>}
                          {v.age && <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-white/10 text-white/60">{v.age}</Badge>}
                          {v.accent && v.accent !== 'native' && <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-white/10 text-white/60">{v.accent}</Badge>}
                          {v.is_native && <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-emerald-500/10 text-emerald-300 border-emerald-500/30">nativ</Badge>}
                        </div>
                        {v.description && (
                          <p className="text-xs text-white/40 mt-1.5 line-clamp-2">{v.description}</p>
                        )}
                      </div>
                      <div onClick={(e) => e.stopPropagation()}>
                        <VoicePreviewButton voiceId={v.id} language={typeof v.language === 'string' ? v.language : 'de'} size="icon" />
                      </div>
                    </div>
                  </button>
                );
              })}
              {hasNextPage && (
                <div ref={sentinelRef} className="col-span-full flex items-center justify-center py-4 text-white/40 text-xs">
                  {isFetchingNextPage ? <><Loader2 className="h-3 w-3 animate-spin mr-2" />Lade weitere…</> : 'Scrolle für mehr'}
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        <div className="flex justify-end pt-2 border-t border-white/5">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Schließen</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
