import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/hooks/useTranslation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Mail, Sparkles, Send, Trash2, Plus } from "lucide-react";
import { format } from "date-fns";

interface SubjectLine { text: string; angle: string; }
interface BodyVariant { label: string; plain: string; html: string; cta: string; }

interface EmailCampaign {
  id: string;
  title: string;
  briefing: string;
  goal: string | null;
  tonality: string | null;
  language: string;
  subjects: SubjectLine[];
  variants: BodyVariant[];
  status: string;
  created_at: string;
}

export default function EmailDirector() {
  const { user } = useAuth();
  const { t, language } = useTranslation();
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Wizard state
  const [title, setTitle] = useState("");
  const [briefing, setBriefing] = useState("");
  const [goal, setGoal] = useState("Drive sign-ups");
  const [tonality, setTonality] = useState("professional");

  // Send state
  const [sending, setSending] = useState(false);

  const active = campaigns.find((c) => c.id === activeId) || null;

  useEffect(() => {
    if (user) loadCampaigns();
  }, [user]);

  async function loadCampaigns() {
    setLoading(true);
    const { data, error } = await supabase
      .from("email_campaigns")
      .select("*")
      .order("created_at", { ascending: false });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setCampaigns((data || []) as any);
  }

  async function handleGenerate() {
    if (!briefing.trim() || briefing.trim().length < 10) {
      toast.error("Briefing zu kurz (min. 10 Zeichen)");
      return;
    }
    if (!title.trim()) {
      toast.error("Titel fehlt");
      return;
    }

    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-email-campaign", {
        body: { briefing, goal, tonality, language },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const { data: inserted, error: insErr } = await supabase
        .from("email_campaigns")
        .insert({
          user_id: user!.id,
          title: title.trim(),
          briefing,
          goal,
          tonality,
          language,
          subjects: data.subjects,
          variants: data.variants,
          status: "ready",
        })
        .select("*")
        .single();
      if (insErr) throw insErr;

      toast.success("Email Kampagne generiert");
      setCampaigns((prev) => [inserted as any, ...prev]);
      setActiveId(inserted!.id);
      setTitle(""); setBriefing("");
    } catch (e: any) {
      toast.error(e.message || "Generierung fehlgeschlagen");
    } finally {
      setGenerating(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Kampagne löschen?")) return;
    const { error } = await supabase.from("email_campaigns").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setCampaigns((prev) => prev.filter((c) => c.id !== id));
    if (activeId === id) setActiveId(null);
    toast.success("Gelöscht");
  }

  async function handleTestSend(subjectIndex: number, variantIndex: number) {
    if (!active) return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-email-campaign-test", {
        body: { campaignId: active.id, subjectIndex, variantIndex },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Test gesendet an ${data.recipient}`);
    } catch (e: any) {
      toast.error(e.message || "Versand fehlgeschlagen");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center">
              <Mail className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-serif tracking-tight">Email Campaign Director</h1>
              <p className="text-sm text-muted-foreground">
                Brief → A/B-Subjects → Body-Varianten → Test-Send via Resend
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-6">
          {/* Left: Wizard + List */}
          <aside className="col-span-12 lg:col-span-4 space-y-6">
            <Card className="p-5 border-primary/20">
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="w-4 h-4 text-primary" />
                <h2 className="font-medium">Neue Kampagne</h2>
              </div>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs">Titel</Label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="z. B. Spring Launch"
                  />
                </div>
                <div>
                  <Label className="text-xs">Briefing</Label>
                  <Textarea
                    value={briefing}
                    onChange={(e) => setBriefing(e.target.value)}
                    placeholder="Worum geht's? Zielgruppe, Angebot, Kontext…"
                    rows={5}
                  />
                </div>
                <div>
                  <Label className="text-xs">Ziel</Label>
                  <Input value={goal} onChange={(e) => setGoal(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Tonalität</Label>
                  <Select value={tonality} onValueChange={setTonality}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="professional">Professional</SelectItem>
                      <SelectItem value="friendly">Friendly</SelectItem>
                      <SelectItem value="bold">Bold / Direct</SelectItem>
                      <SelectItem value="storytelling">Storytelling</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleGenerate} disabled={generating} className="w-full">
                  {generating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                  Kampagne generieren
                </Button>
              </div>
            </Card>

            <Card className="p-5">
              <h3 className="font-medium mb-3 text-sm">Meine Kampagnen ({campaigns.length})</h3>
              {loading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {campaigns.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setActiveId(c.id)}
                    className={`w-full text-left p-3 rounded-md border transition-all ${
                      activeId === c.id
                        ? "border-primary/60 bg-primary/5"
                        : "border-border hover:border-primary/30"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{c.title}</div>
                        <div className="text-xs text-muted-foreground">
                          {format(new Date(c.created_at), "PP")} · {c.variants?.length || 0} Varianten
                        </div>
                      </div>
                      <Trash2
                        className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive shrink-0"
                        onClick={(e) => { e.stopPropagation(); handleDelete(c.id); }}
                      />
                    </div>
                  </button>
                ))}
                {!loading && campaigns.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-6">Noch keine Kampagnen</p>
                )}
              </div>
            </Card>
          </aside>

          {/* Right: Active campaign details */}
          <main className="col-span-12 lg:col-span-8">
            {!active ? (
              <Card className="p-12 text-center border-dashed">
                <Mail className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-muted-foreground">
                  Wähle eine Kampagne oder erstelle eine neue, um Subjects und Varianten zu sehen.
                </p>
              </Card>
            ) : (
              <Card className="p-6">
                <div className="mb-5">
                  <h2 className="text-2xl font-serif">{active.title}</h2>
                  <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{active.briefing}</p>
                  <div className="flex gap-2 mt-3">
                    <Badge variant="outline">{active.goal}</Badge>
                    <Badge variant="outline">{active.tonality}</Badge>
                    <Badge variant="outline">{active.language?.toUpperCase()}</Badge>
                  </div>
                </div>

                <Tabs defaultValue="subjects" className="w-full">
                  <TabsList>
                    <TabsTrigger value="subjects">Subjects ({active.subjects?.length || 0})</TabsTrigger>
                    <TabsTrigger value="variants">Body-Varianten ({active.variants?.length || 0})</TabsTrigger>
                  </TabsList>

                  <TabsContent value="subjects" className="space-y-2 mt-4">
                    {active.subjects?.map((s, i) => (
                      <div key={i} className="p-3 rounded-md border border-border flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate">{s.text}</div>
                          <div className="text-xs text-muted-foreground">{s.angle} · {s.text.length} Zeichen</div>
                        </div>
                        <Badge variant="secondary">A/B {String.fromCharCode(65 + i)}</Badge>
                      </div>
                    ))}
                  </TabsContent>

                  <TabsContent value="variants" className="space-y-4 mt-4">
                    {active.variants?.map((v, vi) => (
                      <Card key={vi} className="p-4 border-primary/10">
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <div className="font-medium">{v.label}</div>
                            <div className="text-xs text-muted-foreground">CTA: {v.cta}</div>
                          </div>
                          <Badge>Variant {vi + 1}</Badge>
                        </div>
                        <div className="border border-border rounded-md p-3 max-h-[280px] overflow-y-auto bg-background"
                             dangerouslySetInnerHTML={{ __html: v.html }} />
                        <div className="mt-3 pt-3 border-t border-border">
                          <Label className="text-xs mb-2 block">Test-Send mit Subject:</Label>
                          <div className="flex flex-wrap gap-2">
                            {active.subjects?.map((s, si) => (
                              <Button
                                key={si}
                                size="sm"
                                variant="outline"
                                disabled={sending}
                                onClick={() => handleTestSend(si, vi)}
                              >
                                <Send className="w-3 h-3 mr-1" />
                                {String.fromCharCode(65 + si)}: {s.text.slice(0, 30)}
                              </Button>
                            ))}
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-2">
                            Test wird an deine Account-Email ({user?.email}) gesendet.
                          </p>
                        </div>
                      </Card>
                    ))}
                  </TabsContent>
                </Tabs>
              </Card>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
