import { tx } from "@/lib/i18nText";
import { useEffect, useRef, useState } from "react";
import { Loader2, MessageSquare, Send } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useContentStudio } from "@/contexts/ContentStudioContext";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Coach als Kontextpanel: kennt das aktuelle Briefing und die gewählte Copy,
 * statt auf einer eigenen Seite ohne Bezug zu beraten.
 */
export function CoachPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const s = useContentStudio();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  const draftContext = () =>
    [
      s.brief && `Briefing: ${s.brief}`,
      s.platform && `Plattform: ${s.platform}`,
      s.activeCopy?.headline && `Headline: ${s.activeCopy.headline}`,
      s.activeCopy?.subline && `Subline: ${s.activeCopy.subline}`,
      s.caption && `Caption: ${s.caption}`,
    ]
      .filter(Boolean)
      .join("\n");

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || busy) return;
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setInput("");
    setBusy(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/coach-chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionData.session?.access_token ?? ""}`,
          },
          body: JSON.stringify({
            message: `${question}\n\n--- Aktueller Entwurf ---\n${draftContext()}`,
            messages: messages.map((m) => ({ role: m.role, content: m.content })),
          }),
        },
      );
      if (!response.ok) throw new Error(tx({ de: "Coach nicht erreichbar", en: "Coach unreachable", es: "Coach no disponible" }));
      const payload = await response.json().catch(() => null);
      const answer: string =
        payload?.reply ?? payload?.message ?? payload?.content ?? tx({ de: "Dazu habe ich gerade keine Antwort.", en: "I don't have an answer for that right now.", es: "No tengo una respuesta para eso ahora mismo." });
      setMessages((prev) => [...prev, { role: "assistant", content: answer }]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: error instanceof Error ? error.message : tx({ de: "Coach nicht erreichbar", en: "Coach unreachable", es: "Coach no disponible" }) },
      ]);
    } finally {
      setBusy(false);
    }
  };

  const quick = [
    Ist die Headline stark genug?,
    Passt der Ton zur Plattform?,
    Wie mache ich den CTA konkreter?,
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 font-display">
            <MessageSquare className="h-4 w-4 text-primary" /> Coach
          </SheetTitle>
          <SheetDescription>Feedback zu genau dem Entwurf, der gerade offen ist.</SheetDescription>
        </SheetHeader>

        <ScrollArea className="mt-4 flex-1 pr-3">
          <div className="space-y-3">
            {!messages.length && (
              <div className="space-y-2">
                {quick.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => send(q)}
                    className="w-full rounded-xl border border-border/60 bg-card/50 px-3 py-2 text-left text-sm hover:border-primary/40"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={
                  "rounded-xl px-3 py-2 text-sm " +
                  (m.role === "user" ? "ml-6 bg-primary/10" : "mr-6 border border-border/60 bg-card/50")
                }
              >
                <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
              </div>
            ))}
            {busy && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> denkt nach …
              </div>
            )}
            <div ref={endRef} />
          </div>
        </ScrollArea>

        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder=Frag den Coach … />
          <Button type="submit" size="icon" disabled={busy}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

export default CoachPanel;
