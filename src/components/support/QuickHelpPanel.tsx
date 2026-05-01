import { Link } from "react-router-dom";
import { ArrowRight, Activity, BookOpen, MessageCircle } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

const TEXT = {
  en: {
    title: "Quick help",
    sub: "Common solutions before you open a ticket.",
    items: [
      { q: "My render is stuck or fails", a: "Renders typically resolve within 10 minutes. Check the Status page for any active provider issues." },
      { q: "Credits weren't refunded after a failure", a: "Refunds are automatic and idempotent — they usually appear within 60 seconds. If not, open a ticket with the failed render's ID." },
      { q: "Social posting failed", a: "Reconnect the affected platform under Integrations. Meta/X often need re-auth after a token expires." },
      { q: "I can't find my exported video", a: "Exports land in your Media Library under Videos. Recently rendered files may take up to 1 minute to appear." },
      { q: "How do I change or cancel my plan?", a: "Open Account → Billing and use the Customer Portal. All invoices are emailed automatically after each payment." },
    ],
    statusBtn: "View live system status",
    faqBtn: "Browse the full FAQ",
    whatsapp: "Urgent? Message us on WhatsApp",
  },
  de: {
    title: "Schnelle Hilfe",
    sub: "Häufige Lösungen, bevor du ein Ticket öffnest.",
    items: [
      { q: "Mein Render hängt oder schlägt fehl", a: "Renders sind meist innerhalb von 10 Min. fertig. Prüfe die Status-Seite auf aktive Provider-Probleme." },
      { q: "Credits wurden nach einem Fehler nicht erstattet", a: "Erstattungen sind automatisch und idempotent — meist innerhalb von 60 Sek. sichtbar. Falls nicht, öffne ein Ticket mit der Render-ID." },
      { q: "Social-Posting fehlgeschlagen", a: "Verbinde die Plattform unter Integrations neu. Meta/X brauchen oft Re-Auth nach Token-Ablauf." },
      { q: "Ich finde mein exportiertes Video nicht", a: "Exporte landen in deiner Mediathek unter Videos. Frische Renders brauchen bis zu 1 Min., um zu erscheinen." },
      { q: "Wie ändere oder kündige ich meinen Plan?", a: "Öffne Account → Abrechnung und nutze das Kundenportal. Rechnungen werden nach jeder Zahlung automatisch per E-Mail verschickt." },
    ],
    statusBtn: "Live-Systemstatus ansehen",
    faqBtn: "Vollständige FAQ durchsuchen",
    whatsapp: "Dringend? Schreib uns auf WhatsApp",
  },
  es: {
    title: "Ayuda rápida",
    sub: "Soluciones comunes antes de abrir un ticket.",
    items: [
      { q: "Mi render está atascado o falla", a: "Los renders suelen completarse en 10 min. Revisa la página de Estado por incidencias de proveedor." },
      { q: "Los créditos no se reembolsaron tras un fallo", a: "Los reembolsos son automáticos e idempotentes — suelen aparecer en 60s. Si no, abre un ticket con el ID del render." },
      { q: "Falló la publicación en redes", a: "Reconecta la plataforma en Integraciones. Meta/X requieren re-auth tras la expiración del token." },
      { q: "No encuentro mi vídeo exportado", a: "Los exports van a tu Mediateca → Vídeos. Pueden tardar hasta 1 min en aparecer." },
      { q: "¿Cómo cambio o cancelo mi plan?", a: "Cuenta → Facturación y usa el Portal del Cliente. Las facturas se envían por email tras cada pago." },
    ],
    statusBtn: "Ver estado del sistema",
    faqBtn: "Explorar FAQ completa",
    whatsapp: "¿Urgente? Escríbenos por WhatsApp",
  },
} as const;

export function QuickHelpPanel() {
  const { language } = useTranslation();
  const t = TEXT[(language as keyof typeof TEXT)] || TEXT.en;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-serif text-foreground">{t.title}</h2>
        <p className="text-sm text-muted-foreground mt-1">{t.sub}</p>
      </div>

      <div className="space-y-2">
        {t.items.map((it, i) => (
          <details
            key={i}
            className="group rounded-lg border border-white/10 bg-white/[0.02] p-4 hover:bg-white/[0.04] transition-colors"
          >
            <summary className="cursor-pointer text-sm font-medium text-foreground flex items-center justify-between">
              {it.q}
              <ArrowRight className="h-4 w-4 text-muted-foreground group-open:rotate-90 transition-transform" />
            </summary>
            <p className="text-sm text-muted-foreground mt-2">{it.a}</p>
          </details>
        ))}
      </div>

      <div className="grid sm:grid-cols-2 gap-3 pt-2">
        <Link
          to="/status"
          className="flex items-center gap-3 p-4 rounded-lg border border-white/10 bg-white/[0.02] hover:border-primary/40 hover:bg-primary/5 transition-all"
        >
          <Activity className="h-5 w-5 text-primary" />
          <div>
            <div className="text-sm font-medium text-foreground">{t.statusBtn}</div>
            <div className="text-xs text-muted-foreground">/status</div>
          </div>
        </Link>
        <Link
          to="/faq"
          className="flex items-center gap-3 p-4 rounded-lg border border-white/10 bg-white/[0.02] hover:border-primary/40 hover:bg-primary/5 transition-all"
        >
          <BookOpen className="h-5 w-5 text-primary" />
          <div>
            <div className="text-sm font-medium text-foreground">{t.faqBtn}</div>
            <div className="text-xs text-muted-foreground">/faq</div>
          </div>
        </Link>
      </div>

      <a
        href="https://wa.me/491735802069?text=Hi%20-%20I%20need%20urgent%20help%20with%20AdTool%20AI"
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-3 p-4 rounded-lg border border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10 transition-all"
      >
        <MessageCircle className="h-5 w-5 text-emerald-400" />
        <div>
          <div className="text-sm font-medium text-foreground">{t.whatsapp}</div>
          <div className="text-xs text-muted-foreground">+49 173 5802069</div>
        </div>
      </a>
    </div>
  );
}
