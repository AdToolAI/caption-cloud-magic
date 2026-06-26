import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus, MessageSquareQuote, Ban, Sparkles, ThumbsDown } from "lucide-react";
import { useBrandVoiceSamples, type VoiceSampleKind } from "@/hooks/useBrandVoiceSamples";

const KIND_META: Record<VoiceSampleKind, { label: string; icon: any; tone: string }> = {
  do: { label: "Do", icon: Sparkles, tone: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" },
  dont: { label: "Don't", icon: ThumbsDown, tone: "text-rose-400 border-rose-500/30 bg-rose-500/10" },
  tagline: { label: "Tagline", icon: MessageSquareQuote, tone: "text-primary border-primary/30 bg-primary/10" },
  banned: { label: "Banned", icon: Ban, tone: "text-amber-400 border-amber-500/30 bg-amber-500/10" },
};

export function BrandVoiceLibrary({ brandKitId }: { brandKitId: string | null }) {
  const { samples, add, remove, loading } = useBrandVoiceSamples(brandKitId);
  const [draftKind, setDraftKind] = useState<VoiceSampleKind>("do");
  const [draftText, setDraftText] = useState("");

  if (!brandKitId) {
    return (
      <Card className="p-6 bg-card/60 border-white/10">
        <p className="text-sm text-muted-foreground">Wähle zuerst ein aktives Brand-Set.</p>
      </Card>
    );
  }

  const submit = async () => {
    if (!draftText.trim()) return;
    await add.mutateAsync({ kind: draftKind, text: draftText });
    setDraftText("");
  };

  const grouped = (Object.keys(KIND_META) as VoiceSampleKind[]).map((k) => ({
    kind: k,
    items: samples.filter((s) => s.kind === k),
  }));

  return (
    <div className="space-y-6">
      <Card className="p-5 bg-card/60 border-white/10 backdrop-blur-xl">
        <div className="flex items-center gap-2 mb-3">
          <MessageSquareQuote className="h-4 w-4 text-primary" />
          <h3 className="font-display text-lg">Brand Voice Library</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Diese Regeln werden in Captions, E-Mails, Skripte und Dialoge automatisch injiziert.
        </p>
        <div className="flex flex-wrap gap-2 mb-3">
          {(Object.keys(KIND_META) as VoiceSampleKind[]).map((k) => {
            const Meta = KIND_META[k];
            const active = draftKind === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setDraftKind(k)}
                className={`px-3 py-1.5 rounded-full text-xs border transition ${
                  active ? Meta.tone : "border-white/10 text-muted-foreground hover:bg-white/5"
                }`}
              >
                <Meta.icon className="h-3 w-3 inline mr-1" />
                {Meta.label}
              </button>
            );
          })}
        </div>
        <div className="flex gap-2">
          <Input
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder={
              draftKind === "banned"
                ? "Wort (z.B. 'cheap')"
                : draftKind === "tagline"
                ? "Tagline-Beispiel"
                : "Satz oder Regel"
            }
            className="bg-background/60"
          />
          <Button onClick={submit} disabled={!draftText.trim() || add.isPending} size="sm">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </Card>

      {loading ? (
        <p className="text-sm text-muted-foreground">Lade …</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {grouped.map(({ kind, items }) => {
            const Meta = KIND_META[kind];
            return (
              <Card key={kind} className="p-4 bg-card/60 border-white/10">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Meta.icon className="h-4 w-4 text-primary" />
                    <span className="font-display text-sm">{Meta.label}</span>
                  </div>
                  <Badge variant="outline" className="text-[10px]">{items.length}</Badge>
                </div>
                {items.length === 0 ? (
                  <p className="text-xs text-muted-foreground/70 italic">Noch keine Einträge.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {items.map((s) => (
                      <li
                        key={s.id}
                        className={`flex items-start justify-between gap-2 text-xs px-2 py-1.5 rounded border ${Meta.tone}`}
                      >
                        <span className="flex-1">{s.text}</span>
                        <button
                          onClick={() => remove.mutate(s.id)}
                          className="opacity-60 hover:opacity-100 transition"
                          aria-label="Löschen"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
