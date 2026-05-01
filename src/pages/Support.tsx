import { useEffect, useState } from "react";
import { Footer } from "@/components/Footer";
import { useTranslation } from "@/hooks/useTranslation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { ShieldQuestion, ListChecks, LifeBuoy } from "lucide-react";
import { SupportWizard } from "@/components/support/SupportWizard";
import { MyTicketsList } from "@/components/support/MyTicketsList";
import { QuickHelpPanel } from "@/components/support/QuickHelpPanel";
import { Loader2 } from "lucide-react";

const TEXT = {
  en: {
    title: "Support Center",
    subtitle: "Report issues with full context — we typically reply within 24h, faster for blocking cases.",
    tNew: "New ticket",
    tMine: "My tickets",
    tHelp: "Quick help",
    loginRequired: "Please sign in to open a support ticket.",
  },
  de: {
    title: "Support-Center",
    subtitle: "Melde Probleme mit vollem Kontext — Antwort meist innerhalb von 24h, bei blockierenden Fällen schneller.",
    tNew: "Neuer Fall",
    tMine: "Meine Tickets",
    tHelp: "Schnelle Hilfe",
    loginRequired: "Bitte melde dich an, um ein Support-Ticket zu öffnen.",
  },
  es: {
    title: "Centro de Soporte",
    subtitle: "Reporta problemas con contexto completo — respondemos en 24h, más rápido en casos bloqueantes.",
    tNew: "Nuevo ticket",
    tMine: "Mis tickets",
    tHelp: "Ayuda rápida",
    loginRequired: "Inicia sesión para abrir un ticket.",
  },
} as const;

export default function Support() {
  const { language } = useTranslation();
  const t = TEXT[(language as keyof typeof TEXT)] || TEXT.en;
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("new");

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email) setUser({ id: user.id, email: user.email });
      setLoading(false);
    })();
  }, []);

  return (
    <div className="flex flex-col min-h-screen bg-[#050816]">
      <main className="flex-1 container mx-auto px-4 py-12 max-w-4xl">
        {/* Hero */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/30 bg-primary/5 text-xs font-mono uppercase tracking-wider text-primary mb-4">
            <LifeBuoy className="h-3 w-3" />
            AdTool AI
          </div>
          <h1 className="text-4xl sm:text-5xl font-serif text-foreground tracking-tight">
            {t.title}
          </h1>
          <p className="text-muted-foreground mt-3 max-w-2xl mx-auto">
            {t.subtitle}
          </p>
        </div>

        {/* Glassmorphism main card */}
        <div className="relative">
          {/* Gold glow */}
          <div className="absolute -inset-px rounded-2xl bg-gradient-to-br from-primary/20 via-transparent to-cyan-500/10 blur-xl opacity-40 pointer-events-none" />
          <div className="relative rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6 sm:p-8">
            {loading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
              </div>
            ) : !user ? (
              <div className="py-16 text-center text-muted-foreground">
                <ShieldQuestion className="h-12 w-12 mx-auto mb-3 opacity-40" />
                <p>{t.loginRequired}</p>
              </div>
            ) : (
              <Tabs value={tab} onValueChange={setTab}>
                <TabsList className="grid grid-cols-3 mb-6 bg-white/[0.04] border border-white/10">
                  <TabsTrigger value="new" className="data-[state=active]:bg-primary/15 data-[state=active]:text-primary">
                    {t.tNew}
                  </TabsTrigger>
                  <TabsTrigger value="mine" className="data-[state=active]:bg-primary/15 data-[state=active]:text-primary">
                    <ListChecks className="h-4 w-4 mr-1.5" />
                    {t.tMine}
                  </TabsTrigger>
                  <TabsTrigger value="help" className="data-[state=active]:bg-primary/15 data-[state=active]:text-primary">
                    {t.tHelp}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="new" className="mt-0">
                  <SupportWizard
                    userId={user.id}
                    userEmail={user.email}
                    onSubmitted={() => setTab("mine")}
                  />
                </TabsContent>

                <TabsContent value="mine" className="mt-0">
                  <MyTicketsList userId={user.id} />
                </TabsContent>

                <TabsContent value="help" className="mt-0">
                  <QuickHelpPanel />
                </TabsContent>
              </Tabs>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
