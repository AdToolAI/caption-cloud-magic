/**
 * CreatorLibrary — Unified asset-bundle hub.
 *
 * Counter to Artlist's €30/mo flat-rate: Photos · Videos · SFX · Music
 * in einem Tab-Set, gratis-inklusive in allen Paid-Plans (Plan-Gate
 * im QuotaBanner). Each tab streams results from a free/cheap third-
 * party API (Pexels, Pixabay, Jamendo, Freesound) and persists picks
 * into the user's RLS-scoped library tables with a Lizenz-Zertifikat
 * one click away.
 *
 * Marginal cost ≈ 0 € pro Download — sustainable to bundle for free.
 */
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { Library, Image as ImageIcon, Music2, Volume2, Film, ShieldCheck } from 'lucide-react';
import QuotaBanner from '@/components/creator-library/QuotaBanner';
import PhotoBrowser from '@/components/creator-library/PhotoBrowser';
import VideoBrowser from '@/components/creator-library/VideoBrowser';
import SfxBrowser from '@/components/creator-library/SfxBrowser';
import MusicBrowser from '@/components/creator-library/MusicBrowser';
import { useSearchParams } from 'react-router-dom';

const TABS = [
  { id: 'videos', label: 'Videos', icon: Film },
  { id: 'photos', label: 'Photos', icon: ImageIcon },
  { id: 'music', label: 'Music', icon: Music2 },
  { id: 'sfx', label: 'SFX', icon: Volume2 },
] as const;

export default function CreatorLibrary() {
  const [params, setParams] = useSearchParams();
  const active = TABS.find((t) => t.id === params.get('tab'))?.id ?? 'videos';

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">
        <header className="space-y-2">
          <div className="flex items-center gap-2">
            <Library className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-semibold tracking-tight">Creator Library</h1>
            <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
              Inklusive
            </span>
          </div>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Royalty-free Videos · Photos · Music · SFX — alles in einem Bundle, gratis
            inklusive in jedem Paid-Plan. Direkter Handoff in Composer & Director's Cut,
            Lizenz-Zertifikat mit einem Klick.
          </p>
        </header>

        <QuotaBanner />

        <Card className="p-2 border-primary/20 bg-primary/5 flex items-center gap-2 text-[11px] text-primary-foreground/80">
          <ShieldCheck className="h-3.5 w-3.5 text-primary" />
          <span className="text-muted-foreground">
            Alle Treffer aus Pexels · Pixabay · Jamendo · Freesound (royalty-free, kommerziell nutzbar).
            Auto-Lizenz-PDF mit Verify-URL bei jedem Download.
          </span>
        </Card>

        <Tabs value={active} onValueChange={(v) => setParams({ tab: v })}>
          <TabsList className="grid grid-cols-4 w-full sm:w-auto">
            {TABS.map(({ id, label, icon: Icon }) => (
              <TabsTrigger key={id} value={id} className="gap-1.5">
                <Icon className="h-3.5 w-3.5" />
                <span>{label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="videos" className="mt-4"><VideoBrowser /></TabsContent>
          <TabsContent value="photos" className="mt-4"><PhotoBrowser /></TabsContent>
          <TabsContent value="music" className="mt-4"><MusicBrowser /></TabsContent>
          <TabsContent value="sfx" className="mt-4"><SfxBrowser /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
