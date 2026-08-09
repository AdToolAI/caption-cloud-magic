import { useMemo } from "react";
import { Sparkles, RefreshCw, Instagram, Music, Linkedin, Youtube, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useCrossPostMagic } from "@/hooks/useCrossPostMagic";
import { HookScoreBadge } from "./HookScoreBadge";
import {
  CROSS_POST_RULES,
  CHANNEL_ORDER,
  TONE_LABELS,
  type CrossPostChannel,
  type CrossPostTone,
} from "@/config/crossPostRules";
import type { Platform } from "@/hooks/useSocialPublishing";

interface Props {
  videoId?: string;
  videoUrl: string;
  briefingPlan?: unknown;
  briefingText?: string;
  language?: string;
  selectedChannels: Platform[];
  onPublishAll: (perChannel: Record<Platform, { caption: string; hashtags: string[]; title?: string; description?: string; tags?: string[] }>) => void;
  publishing?: boolean;
}

const CHANNEL_META: Record<CrossPostChannel, { name: string; icon: React.ElementType; tint: string }> = {
  instagram: { name: "Instagram", icon: Instagram, tint: "text-pink-400" },
  tiktok:    { name: "TikTok",    icon: Music,     tint: "text-cyan-300" },
  linkedin:  { name: "LinkedIn",  icon: Linkedin,  tint: "text-emerald-300" },
  youtube:   { name: "YouTube",   icon: Youtube,   tint: "text-red-400" },
};

export function CrossPostMagicPanel({
  videoId,
  videoUrl,
  briefingPlan,
  briefingText,
  language,
  selectedChannels,
  onPublishAll,
  publishing,
}: Props) {
  const { drafts, loading, tone, setTone, generate, updateDraft } = useCrossPostMagic(videoId);

  const activeChannels = useMemo(
    () => CHANNEL_ORDER.filter((c) => (selectedChannels as string[]).includes(c)) as CrossPostChannel[],
    [selectedChannels],
  );

  const hasAnyDraft = activeChannels.some((c) => drafts[c]);
  const allReady = activeChannels.every((c) => drafts[c]);

  const handleGenerate = () =>
    generate({
      videoId,
      videoUrl,
      channels: activeChannels,
      briefingPlan,
      briefingText,
      tone,
      language,
    });

  const handlePublish = () => {
    const payload: Record<string, { caption: string; hashtags: string[]; title?: string; description?: string; tags?: string[] }> = {};
    for (const c of activeChannels) {
      const d = drafts[c];
      if (!d) continue;
      payload[c] = {
        caption: d.caption,
        hashtags: d.hashtags ?? [],
        title: d.title,
        description: d.description,
        tags: d.tags,
      };
    }
    onPublishAll(payload as Record<Platform, typeof payload[string]>);
  };

  if (activeChannels.length === 0) {
    return (
      <Card className="p-6 bg-black/40 border-white/10 text-center text-sm text-muted-foreground">
        Wähle oben mindestens einen Kanal, um Cross-Post Magic zu starten.
      </Card>
    );
  }

  return (
    <Card className="relative overflow-hidden border-white/10 bg-gradient-to-br from-black/60 via-black/40 to-[#1a1208]/60 backdrop-blur">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#F5C76A]/60 to-transparent" />

      {/* Header */}
      <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-gradient-to-br from-[#F5C76A] to-[#b8862f] text-black shadow-[0_0_20px_hsla(40,80%,60%,0.35)]">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-[#F5C76A]/80">Cross-Post Magic</div>
            <div className="text-sm text-white/90">Plattform-optimierte Captions in einem Klick</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Select value={tone} onValueChange={(v) => setTone(v as CrossPostTone)}>
            <SelectTrigger className="h-9 w-[150px] border-white/15 bg-black/40 text-xs">
              <SelectValue placeholder="Tone" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(TONE_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            onClick={handleGenerate}
            disabled={loading}
            className="h-9 bg-gradient-to-r from-[#F5C76A] to-[#d9a44a] text-black hover:from-[#ffd57a] hover:to-[#f0b85a]"
          >
            {loading ? (
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            ) : hasAnyDraft ? (
              <RefreshCw className="mr-2 h-4 w-4" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            {hasAnyDraft ? "Regenerate" : "Generate"}
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="border-t border-white/5 p-5">
        {loading && !hasAnyDraft ? (
          <div className="space-y-3">
            <div className="text-xs text-[#F5C76A]/80">✨ Schreibt deine Captions…</div>
            {[1,2,3].map((i) => (
              <Skeleton key={i} className="h-4 w-full bg-white/5" />
            ))}
            <Skeleton className="h-24 w-full bg-white/5" />
          </div>
        ) : !hasAnyDraft ? (
          <div className="rounded-lg border border-dashed border-white/10 bg-black/20 p-8 text-center">
            <Sparkles className="mx-auto h-8 w-8 text-[#F5C76A]/70" />
            <p className="mt-3 text-sm text-white/80">
              Klicke <span className="font-semibold text-[#F5C76A]">Generate</span>, um für jede Plattform eine optimierte Caption zu erstellen.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {activeChannels.length} Kanäle ausgewählt · Sprache: {(language ?? "en").toUpperCase()}
            </p>
          </div>
        ) : (
          <Tabs defaultValue={activeChannels[0]}>
            <TabsList className="bg-black/40 border border-white/10">
              {activeChannels.map((c) => {
                const Meta = CHANNEL_META[c];
                const Icon = Meta.icon;
                return (
                  <TabsTrigger
                    key={c}
                    value={c}
                    className="data-[state=active]:bg-white/10 data-[state=active]:text-[#F5C76A]"
                  >
                    <Icon className={cn("mr-1.5 h-4 w-4", Meta.tint)} />
                    {Meta.name}
                  </TabsTrigger>
                );
              })}
            </TabsList>

            {activeChannels.map((c) => {
              const d = drafts[c];
              const rule = CROSS_POST_RULES[c];
              if (!d) {
                return (
                  <TabsContent key={c} value={c}>
                    <p className="text-sm text-muted-foreground">Noch kein Draft.</p>
                  </TabsContent>
                );
              }
              const len = d.caption?.length ?? 0;
              const over = len > rule.captionMax;
              return (
                <TabsContent key={c} value={c} className="mt-4 space-y-4">
                  {rule.needsTitle && (
                    <div>
                      <Label className="text-xs uppercase tracking-widest text-white/60">Title</Label>
                      <Input
                        value={d.title ?? ""}
                        onChange={(e) => updateDraft(c, { title: e.target.value }, videoId)}
                        maxLength={(rule.titleMax ?? 100) + 30}
                        className="bg-black/40 border-white/15"
                      />
                      <div className="mt-1 text-[10px] text-muted-foreground">
                        {(d.title?.length ?? 0)} / {rule.titleMax}
                      </div>
                    </div>
                  )}

                  <div>
                    <div className="flex items-center justify-between">
                      <Label className="text-xs uppercase tracking-widest text-white/60">Caption</Label>
                      <div className="flex items-center gap-2">
                        <HookScoreBadge score={d.hook_score} />
                        <span className={cn("text-[10px]", over ? "text-red-400" : "text-muted-foreground")}>
                          {len} / {rule.captionMax}
                        </span>
                      </div>
                    </div>
                    <Textarea
                      value={d.caption}
                      onChange={(e) => updateDraft(c, { caption: e.target.value }, videoId)}
                      rows={c === "linkedin" ? 8 : 5}
                      className={cn(
                        "mt-1 bg-black/40 border-white/15 font-mono text-sm leading-relaxed",
                        over && "border-red-500/60",
                      )}
                    />
                    {over && (
                      <div className="mt-1 flex items-center gap-1 text-[11px] text-red-400">
                        <AlertTriangle className="h-3 w-3" /> Zu lang für {CHANNEL_META[c].name} (max {rule.captionMax}).
                      </div>
                    )}
                  </div>

                  <div>
                    <Label className="text-xs uppercase tracking-widest text-white/60">
                      Hashtags ({d.hashtags?.length ?? 0}/{rule.hashtagMax})
                    </Label>
                    <Input
                      value={(d.hashtags ?? []).map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}
                      onChange={(e) =>
                        updateDraft(
                          c,
                          {
                            hashtags: e.target.value
                              .split(/\s+/)
                              .map((s) => s.replace(/^#/, "").trim())
                              .filter(Boolean),
                          },
                          videoId,
                        )
                      }
                      className="bg-black/40 border-white/15"
                    />
                  </div>

                  {rule.needsDescription && (
                    <div>
                      <Label className="text-xs uppercase tracking-widest text-white/60">Description</Label>
                      <Textarea
                        value={d.description ?? ""}
                        onChange={(e) => updateDraft(c, { description: e.target.value }, videoId)}
                        rows={3}
                        className="bg-black/40 border-white/15"
                      />
                      <div className="mt-1 text-[10px] text-muted-foreground">
                        {(d.description?.length ?? 0)} / {rule.descriptionMax}
                      </div>
                    </div>
                  )}
                </TabsContent>
              );
            })}
          </Tabs>
        )}
      </div>

      {/* Footer */}
      {hasAnyDraft && (
        <div className="flex items-center justify-between border-t border-white/5 bg-black/30 p-4">
          <div className="text-xs text-muted-foreground">
            {allReady ? "Alle Kanäle bereit" : `${activeChannels.filter((c) => drafts[c]).length}/${activeChannels.length} Drafts bereit`}
          </div>
          <Button
            onClick={handlePublish}
            disabled={!allReady || publishing}
            className="bg-gradient-to-r from-[#F5C76A] to-[#d9a44a] text-black hover:from-[#ffd57a]"
          >
            🚀 Publish All ({activeChannels.length})
          </Button>
        </div>
      )}
    </Card>
  );
}
