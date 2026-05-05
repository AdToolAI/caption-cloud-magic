import { useState, useRef, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Brain, Send, Sparkles, Loader2, Lock, Trash2, GitBranch, Pin, PinOff } from "lucide-react";
import { usePinnedChat } from "@/contexts/PinnedChatContext";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  TEXT_MODEL_LIST,
  TEXT_MODELS,
  DEFAULT_TEXT_MODEL,
  REASONING_EFFORT_OPTIONS,
  type TextModelId,
  type ReasoningEffort,
} from "@/lib/text-studio/models";
import { estimateTokens, estimateCost, formatEUR } from "@/lib/text-studio/pricing";

type Msg = { role: "user" | "assistant"; content: string };

const LAST_CONV_KEY = "text-studio-last-conversation";
const readLastConv = () => {
  try { return localStorage.getItem(LAST_CONV_KEY); } catch { return null; }
};
const writeLastConv = (id: string | null) => {
  try {
    if (id) localStorage.setItem(LAST_CONV_KEY, id);
    else localStorage.removeItem(LAST_CONV_KEY);
  } catch {}
};

interface Persona {
  id: string;
  name: string;
  description: string | null;
  system_prompt: string;
  is_system_preset: boolean;
}

interface Conversation {
  id: string;
  title: string;
  model: string;
  updated_at: string;
  parent_conversation_id?: string | null;
  branch_label?: string | null;
}

export default function AITextStudio() {
  const { user } = useAuth();
  const { pinned, pin, unpin } = usePinnedChat();
  const [tab, setTab] = useState("chat");

  // Chat state
  const [model, setModel] = useState<TextModelId>(DEFAULT_TEXT_MODEL);
  const [reasoning, setReasoning] = useState<ReasoningEffort>("medium");
  const [personaId, setPersonaId] = useState<string>("none");
  const [isPrivate, setIsPrivate] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [history, setHistory] = useState<Conversation[]>([]);

  // Compare state
  const [comparePrompt, setComparePrompt] = useState("");
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareResults, setCompareResults] = useState<Record<string, any> | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Branch confirmation dialog state
  const [branchPrompt, setBranchPrompt] = useState<{ targetModel: TextModelId } | null>(null);

  const [searchParams, setSearchParams] = useSearchParams();

  // Resume pinned/url/last conversation on mount
  useEffect(() => {
    const urlConv = searchParams.get("conversation");
    const target = urlConv || pinned?.conversationId || readLastConv();
    if (target && target !== conversationId) {
      void loadConversation(target);
      if (urlConv) {
        const next = new URLSearchParams(searchParams);
        next.delete("conversation");
        setSearchParams(next, { replace: true });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!user) return;
    void supabase
      .from("text_studio_personas")
      .select("*")
      .order("is_system_preset", { ascending: false })
      .then(({ data }) => setPersonas((data as Persona[]) || []));
    void supabase
      .from("text_studio_conversations")
      .select("id,title,model,updated_at,parent_conversation_id,branch_label")
      .order("updated_at", { ascending: false })
      .limit(100)
      .then(({ data }) => setHistory((data as Conversation[]) || []));
  }, [user, conversationId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const selectedModel = TEXT_MODELS[model];
  const selectedPersona = personas.find((p) => p.id === personaId);

  // Current chat root + sibling branches (same root)
  const currentConv = history.find((c) => c.id === conversationId);
  const rootId = currentConv?.parent_conversation_id || currentConv?.id || null;
  const branches = useMemo(() => {
    if (!rootId) return [] as Conversation[];
    return history.filter((c) => c.id === rootId || c.parent_conversation_id === rootId);
  }, [history, rootId]);

  const inputTokens = useMemo(
    () => estimateTokens(input + messages.map((m) => m.content).join("\n")),
    [input, messages],
  );
  const estCostEur = useMemo(() => estimateCost(model, inputTokens, 800), [model, inputTokens]);

  // Intercept model change: if active chat has messages, fork into a branch
  function handleModelChange(next: TextModelId) {
    if (next === model) return;
    if (messages.length === 0) {
      setModel(next);
      return;
    }
    setBranchPrompt({ targetModel: next });
  }

  async function createBranch(targetModel: TextModelId, withContext: boolean) {
    if (!user) return;
    const targetLabel = TEXT_MODELS[targetModel].label;

    // Ensure a root conversation exists. If the current chat has not been
    // persisted yet, create it now and copy in-memory messages into it.
    let parentRoot = rootId;
    if (!parentRoot) {
      const { data: rootConv, error: rootErr } = await supabase
        .from("text_studio_conversations")
        .insert({
          user_id: user.id,
          title: messages[0]?.content?.slice(0, 60) || "Konversation",
          model,
          persona_id: personaId && personaId !== "none" ? personaId : null,
          is_private: isPrivate,
        })
        .select("id,title,model,updated_at,parent_conversation_id,branch_label")
        .single();
      if (rootErr || !rootConv) {
        toast.error(rootErr?.message || "Wurzel-Chat konnte nicht angelegt werden");
        return;
      }
      if (messages.length > 0) {
        const rows = messages
          .filter((m) => m.content?.trim())
          .map((m) => ({
            conversation_id: rootConv.id,
            user_id: user.id,
            role: m.role,
            content: m.content,
          }));
        if (rows.length > 0) await supabase.from("text_studio_messages").insert(rows);
      }
      setHistory((h) => [rootConv as Conversation, ...h]);
      parentRoot = rootConv.id;
    }

    const parentTitle = currentConv?.title || messages[0]?.content?.slice(0, 60) || "Konversation";
    const { data: newConv, error } = await supabase
      .from("text_studio_conversations")
      .insert({
        user_id: user.id,
        title: parentTitle,
        model: targetModel,
        persona_id: personaId && personaId !== "none" ? personaId : null,
        is_private: isPrivate,
        parent_conversation_id: parentRoot,
        branch_label: `${targetLabel}-Branch`,
      })
      .select("id,title,model,updated_at,parent_conversation_id,branch_label")
      .single();
    if (error || !newConv) {
      toast.error(error?.message || "Branch konnte nicht erstellt werden");
      return;
    }

    if (withContext && messages.length > 0) {
      const rows = messages
        .filter((m) => m.content?.trim())
        .map((m) => ({
          conversation_id: newConv.id,
          user_id: user.id,
          role: m.role,
          content: m.content,
        }));
      if (rows.length > 0) {
        await supabase.from("text_studio_messages").insert(rows);
      }
    } else {
      setMessages([]);
    }

    setHistory((h) => [newConv as Conversation, ...h]);
    setConversationId(newConv.id);
    setModel(targetModel);
    setBranchPrompt(null);
    toast.success(`Neuer Branch: ${targetLabel}`);
  }

  async function send() {
    if (!input.trim() || streaming || !user) return;
    if (selectedModel.requiresExternalKey) {
      // Will be enforced server-side, but warn anyway
    }
    const userMsg: Msg = { role: "user", content: input };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setStreaming(true);
    let assistantText = "";
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/text-studio-chat`;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          conversationId,
          messages: next,
          model,
          reasoningEffort: selectedModel.supportsReasoningEffort ? reasoning : undefined,
          systemPrompt: selectedPersona?.system_prompt,
          personaId: personaId && personaId !== "none" ? personaId : undefined,
          isPrivate,
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        if (resp.status === 402) toast.error(err.error || "Wallet leer – bitte Credits aufladen.");
        else if (resp.status === 429) toast.error("Rate limit – kurz warten und erneut probieren.");
        else toast.error(err.error || "Fehler beim Senden");
        setMessages(next);
        setStreaming(false);
        return;
      }

      const newConvId = resp.headers.get("X-Conversation-Id");
      if (newConvId && !conversationId) {
        setConversationId(newConvId);
        if (!isPrivate) writeLastConv(newConvId);
      } else if (conversationId && !isPrivate) {
        writeLastConv(conversationId);
      }

      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, idx).replace(/\r$/, "");
          buffer = buffer.slice(idx + 1);
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") continue;
          try {
            const json = JSON.parse(payload);
            const delta = json.choices?.[0]?.delta?.content;
            if (delta) {
              assistantText += delta;
              setMessages((prev) => {
                const copy = [...prev];
                copy[copy.length - 1] = { role: "assistant", content: assistantText };
                return copy;
              });
            }
          } catch {
            buffer = line + "\n" + buffer;
            break;
          }
        }
      }
    } catch (e) {
      toast.error("Verbindungsfehler");
      console.error(e);
    } finally {
      setStreaming(false);
    }
  }

  function newConversation() {
    setConversationId(null);
    setMessages([]);
    setInput("");
    writeLastConv(null);
  }

  async function loadConversation(id: string) {
    setConversationId(id);
    let conv = history.find((c) => c.id === id);
    if (!conv) {
      const { data } = await supabase
        .from("text_studio_conversations")
        .select("id,title,model,updated_at,parent_conversation_id,branch_label")
        .eq("id", id)
        .maybeSingle();
      if (data) conv = data as Conversation;
    }
    if (!conv) {
      // Conversation no longer exists (deleted or not accessible) — clear stale pointer
      writeLastConv(null);
      setConversationId(null);
      return;
    }
    if (conv.model && (TEXT_MODELS as any)[conv.model]) {
      setModel(conv.model as TextModelId);
    }
    const { data } = await supabase
      .from("text_studio_messages")
      .select("role,content")
      .eq("conversation_id", id)
      .order("created_at");
    setMessages(((data as Msg[]) || []).filter((m) => m.role !== "system" as any));
    writeLastConv(id);
    setTab("chat");
  }

  async function deleteConversation(id: string) {
    await supabase.from("text_studio_conversations").delete().eq("id", id);
    setHistory((h) => h.filter((c) => c.id !== id));
    if (readLastConv() === id) writeLastConv(null);
    if (conversationId === id) newConversation();
  }

  async function runCompare() {
    if (!comparePrompt.trim() || compareLoading) return;
    setCompareLoading(true);
    setCompareResults(null);
    try {
      const { data, error } = await supabase.functions.invoke("text-studio-compare", {
        body: { prompt: comparePrompt, systemPrompt: selectedPersona?.system_prompt },
      });
      if (error) throw error;
      setCompareResults(data?.results || null);
    } catch (e: any) {
      toast.error(e?.message || "Compare fehlgeschlagen");
    } finally {
      setCompareLoading(false);
    }
  }

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="flex items-center gap-3 mb-6">
        <div className="h-12 w-12 rounded-xl bg-primary/15 flex items-center justify-center">
          <Brain className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-display font-bold">AI Text Studio</h1>
          <p className="text-sm text-muted-foreground">
            Premium Reasoning & Writing — GPT-5.5 Pro · Gemini 3.1 Pro · Claude 4.1 Opus
          </p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="chat">Chat</TabsTrigger>
          <TabsTrigger value="compare">Compare</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        {/* CHAT TAB */}
        <TabsContent value="chat" className="space-y-4">
          <Card className="p-4 grid gap-4 md:grid-cols-[1fr_1fr_1fr_auto] items-end">
            <div>
              <Label className="text-xs">Modell</Label>
              <Select value={model} onValueChange={(v) => handleModelChange(v as TextModelId)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TEXT_MODEL_LIST.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.label} {m.requiresExternalKey && <Lock className="inline h-3 w-3 ml-1" />}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Persona</Label>
              <Select value={personaId} onValueChange={setPersonaId}>
                <SelectTrigger><SelectValue placeholder="(keine)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Keine —</SelectItem>
                  {personas.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedModel.supportsReasoningEffort && (
              <div>
                <Label className="text-xs">Reasoning</Label>
                <Select value={reasoning} onValueChange={(v) => setReasoning(v as ReasoningEffort)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {REASONING_EFFORT_OPTIONS.map((r) => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Switch id="priv" checked={isPrivate} onCheckedChange={setIsPrivate} />
              <Label htmlFor="priv" className="text-xs">Privat</Label>
            </div>
          </Card>

          <div className="flex flex-wrap gap-2 text-xs">
            {selectedModel.strengths.map((s) => (
              <Badge key={s} variant="secondary">{s}</Badge>
            ))}
            <Badge variant="outline">~{formatEUR(estCostEur)} geschätzt</Badge>
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto h-7"
              disabled={!conversationId && messages.length === 0}
              title={!conversationId && messages.length === 0 ? "Erst eine Nachricht senden, dann anheften" : undefined}
              onClick={() => {
                if (!conversationId) return;
                if (pinned?.conversationId === conversationId) {
                  unpin();
                  toast.success("Chat losgelöst");
                } else {
                  pin({
                    conversationId,
                    model,
                    personaId,
                    systemPrompt: selectedPersona?.system_prompt || null,
                    reasoning,
                    isPrivate,
                    title: currentConv?.title,
                  });
                  toast.success("Chat angeheftet — sichtbar in allen Modulen");
                }
              }}
            >
              {pinned?.conversationId === conversationId ? (
                <><PinOff className="h-3 w-3 mr-1" /> Loslösen</>
              ) : (
                <><Pin className="h-3 w-3 mr-1" /> Anheften</>
              )}
            </Button>
            <Button size="sm" variant="ghost" onClick={newConversation} className="h-7">
              <Sparkles className="h-3 w-3 mr-1" /> Neue Konversation
            </Button>
          </div>

          {/* Branch switcher: visible when this chat has siblings */}
          {branches.length > 1 && (
            <Card className="p-2 flex flex-wrap items-center gap-2">
              <GitBranch className="h-3.5 w-3.5 text-muted-foreground ml-1" />
              <span className="text-xs text-muted-foreground mr-1">Branches:</span>
              {branches.map((b) => {
                const m = TEXT_MODELS[b.model as TextModelId];
                const active = b.id === conversationId;
                return (
                  <Button
                    key={b.id}
                    size="sm"
                    variant={active ? "default" : "outline"}
                    className="h-7 text-xs"
                    onClick={() => !active && loadConversation(b.id)}
                  >
                    {m?.label || b.model}
                  </Button>
                );
              })}
            </Card>
          )}

          <Card className="p-4 h-[480px] overflow-y-auto" ref={scrollRef as any}>
            {messages.length === 0 && (
              <div className="text-sm text-muted-foreground text-center py-12">
                Stelle eine Frage. {selectedModel.label} antwortet.
              </div>
            )}
            <div className="space-y-4">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={
                    m.role === "user"
                      ? "ml-12 bg-primary/10 rounded-lg p-3"
                      : "mr-12 bg-muted/40 rounded-lg p-3"
                  }
                >
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                    {m.role === "user" ? "Du" : selectedModel.label}
                  </div>
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content || (streaming ? "…" : "")}</ReactMarkdown>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <div className="flex gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Prompt eingeben… (⌘+Enter zum Senden)"
              className="min-h-[80px]"
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") send();
              }}
            />
            <Button onClick={send} disabled={streaming || !input.trim()} size="lg">
              {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </TabsContent>

        {/* COMPARE TAB */}
        <TabsContent value="compare" className="space-y-4">
          <Card className="p-4 space-y-3">
            <Label>Compare-Prompt</Label>
            <Textarea
              value={comparePrompt}
              onChange={(e) => setComparePrompt(e.target.value)}
              placeholder="Frage gleichzeitig an alle 3 Modelle senden…"
              className="min-h-[100px]"
            />
            <Button onClick={runCompare} disabled={compareLoading || !comparePrompt.trim()}>
              {compareLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Läuft…</> : "Run on all 3"}
            </Button>
          </Card>

          <div className="grid md:grid-cols-3 gap-4">
            {TEXT_MODEL_LIST.map((m) => {
              const r = compareResults?.[m.id];
              return (
                <Card key={m.id} className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">{m.label}</div>
                    {r?.ok && (
                      <Badge variant="outline" className="text-[10px]">
                        {r.latencyMs}ms · {formatEUR(r.cost)}
                      </Badge>
                    )}
                  </div>
                  <div className="prose prose-sm dark:prose-invert max-w-none min-h-[200px]">
                    {!r && compareLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                    {r?.ok && <ReactMarkdown remarkPlugins={[remarkGfm]}>{r.content}</ReactMarkdown>}
                    {r && !r.ok && <p className="text-xs text-destructive">{r.error}</p>}
                  </div>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* HISTORY TAB */}
        <TabsContent value="history" className="space-y-2">
          {history.length === 0 && (
            <p className="text-sm text-muted-foreground">Noch keine Konversationen.</p>
          )}
          {history.map((c) => {
            const isBranch = !!c.parent_conversation_id;
            return (
              <Card
                key={c.id}
                className={`p-3 flex items-center gap-3 ${isBranch ? "ml-8 border-l-2 border-primary/40" : ""}`}
              >
                {isBranch && <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />}
                <button
                  onClick={() => loadConversation(c.id)}
                  className="flex-1 text-left hover:opacity-80"
                >
                  <div className="text-sm font-medium truncate">
                    {c.title}
                    {c.branch_label && (
                      <Badge variant="outline" className="ml-2 text-[10px]">{c.branch_label}</Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {TEXT_MODELS[c.model as TextModelId]?.label || c.model} ·{" "}
                    {new Date(c.updated_at).toLocaleString()}
                  </div>
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => deleteConversation(c.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </Card>
            );
          })}
        </TabsContent>
      </Tabs>

      <AlertDialog open={!!branchPrompt} onOpenChange={(o) => !o && setBranchPrompt(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Mit {branchPrompt ? TEXT_MODELS[branchPrompt.targetModel].label : ""} fortfahren?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Beim Modellwechsel mitten im Chat können Provider-Fehler auftreten, weil jedes
              Modell ein eigenes Format erwartet. Stattdessen erstellen wir einen neuen
              <strong> Branch</strong> in dieser Konversation. Beide Verläufe bleiben sichtbar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <Button
              variant="outline"
              onClick={() => branchPrompt && createBranch(branchPrompt.targetModel, false)}
            >
              Sauberer Start
            </Button>
            <AlertDialogAction
              onClick={() => branchPrompt && createBranch(branchPrompt.targetModel, true)}
            >
              Mit Kontext übernehmen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
