import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { ShieldCheck, CheckCircle2, XCircle, RefreshCcw, LifeBuoy, ArrowLeft, AlertTriangle } from 'lucide-react';
import { tx } from "@/lib/i18nText";

export const AI_VIDEO_REFUND_POLICY_VERSION = 'v1.0-2026-07-28';

/**
 * Public AI Video Refund Policy — kundenfreundliche Zusammenfassung von
 * docs/policies/refund-policy-v263.md (Anchor-Preview-Gate).
 */
export default function AIVideoRefundPolicy() {
  return (
    <>
      <Helmet>
        <title>{tx({ de: "KI-Video Rückerstattung | AdTool AI", en: "AI Video Refund | AdTool AI", es: "Reembolso de video con IA | AdTool AI" })}</title>
        <meta
          name="description"
          content={tx({ de: "Wann werden Credits für KI-Video-Renderings automatisch erstattet und wann nicht — transparente Refund-Regeln nach dem Preview-Gate-Prinzip.", en: "When are credits for AI video renderings automatically refunded and when not — transparent refund rules based on the preview-gate principle.", es: "Cuándo se reembolsan automáticamente los créditos de renderizados de video con IA y cuándo no: reglas de reembolso transparentes según el principio de puerta de vista previa." })}
        />
      </Helmet>

      <div className="min-h-screen bg-background">
        <div className="max-w-3xl mx-auto px-6 py-10">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6"
          >
            <ArrowLeft className="h-4 w-4" /> {tx({ de: "Zurück zur Startseite", en: "Back to homepage", es: "Volver al inicio" })}
          </Link>

          <div className="flex items-center gap-3 mb-2">
            <ShieldCheck className="h-7 w-7 text-primary" />
            <h1 className="font-serif text-3xl">{tx({ de: "KI-Video Refund Policy", en: "AI Video Refund Policy", es: "Política de reembolso de video con IA" })}</h1>
          </div>
          <p className="text-sm text-muted-foreground mb-8">
            {tx({ de: `Version ${AI_VIDEO_REFUND_POLICY_VERSION} · gültig für alle KI-Video-Renderings im Motion Studio, AI Video Studio und Universal Director's Cut.`, en: `Version ${AI_VIDEO_REFUND_POLICY_VERSION} · applies to all AI video renderings in Motion Studio, AI Video Studio and Universal Director's Cut.`, es: `Versión ${AI_VIDEO_REFUND_POLICY_VERSION} · válido para todos los renderizados de video con IA en Motion Studio, AI Video Studio y Universal Director's Cut.` })}
          </p>

          <Card className="bg-primary/5 border-primary/30 p-5 mb-8">
            <p className="text-sm text-foreground/90">
              {tx({ de: "Wir arbeiten mit externen Modell-Providern (Hailuo, Kling, Seedance, Sync.so, HeyGen, Sora u. a.). Damit du fair behandelt wirst und wir gleichzeitig planbar arbeiten können, trennen wir", en: "We work with external model providers (Hailuo, Kling, Seedance, Sync.so, HeyGen, Sora and others). To treat you fairly while staying operationally predictable, we clearly separate", es: "Trabajamos con proveedores de modelos externos (Hailuo, Kling, Seedance, Sync.so, HeyGen, Sora y otros). Para tratarte de forma justa y a la vez trabajar de forma predecible, separamos claramente" })} <strong>{tx({ de: "technische Fehler", en: "technical errors", es: "errores técnicos" })}</strong> {tx({ de: "(unser Risiko) klar von", en: "(our risk) from", es: "(nuestro riesgo) de" })}
              <strong> {tx({ de: "kreativen Ergebnissen", en: "creative results", es: "resultados creativos" })}</strong> {tx({ de: "(dein Risiko nach Bestätigung im Preview).", en: "(your risk after confirming the preview).", es: "(tu riesgo tras confirmar la vista previa)." })}
            </p>
          </Card>

          {/* 1. Automatischer Refund */}
          <section className="mb-10">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              <h2 className="font-serif text-2xl">{tx({ de: "1. Automatischer Refund", en: "1. Automatic refund", es: "1. Reembolso automático" })}</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              {tx({ de: "In folgenden Fällen werden die Credits für die betroffene Szene", en: "In the following cases, the credits for the affected scene are", es: "En los siguientes casos, los créditos de la escena afectada se" })} <strong>{tx({ de: "vollständig und automatisch", en: "fully and automatically", es: "de forma completa y automática" })}</strong> {tx({ de: "auf dein Guthaben zurückgebucht — kein Support-Ticket nötig:", en: "credited back to your balance — no support ticket needed:", es: "reembolsan a tu saldo — no se necesita ticket de soporte:" })}
            </p>
            <ul className="list-disc pl-6 space-y-1.5 text-sm text-foreground/90">
              <li>{tx({ de: "Timeout eines Providers (Hailuo, Kling, Seedance, Sync.so, HeyGen …)", en: "Timeout of a provider (Hailuo, Kling, Seedance, Sync.so, HeyGen …)", es: "Tiempo de espera de un proveedor (Hailuo, Kling, Seedance, Sync.so, HeyGen …)" })}</li>
              <li>{tx({ de: "HTTP 5xx / Server-Fehler eines Providers", en: "HTTP 5xx / server error of a provider", es: "Error HTTP 5xx / de servidor de un proveedor" })}</li>
              <li>{tx({ de: "Sync.so Mux- oder Stitch-Fehler, Watchdog-Kill, Lambda-Crash", en: "Sync.so mux or stitch errors, watchdog kill, Lambda crash", es: "Errores de mux o stitch de Sync.so, watchdog kill, fallo de Lambda" })}</li>
              <li>{tx({ de: "Content-Filter des Providers, der", en: "Provider content filter that triggers", es: "Filtro de contenido del proveedor que actúa" })} <em>{tx({ de: "nach", en: "after", es: "después de" })}</em> {tx({ de: "deiner Bestätigung greift", en: "your confirmation", es: "tu confirmación" })}</li>
              <li>
                {tx({ de: "Jeder Fehler, der intern mit einem der folgenden Codes klassifiziert wird:", en: "Any error internally classified with one of the following codes:", es: "Cualquier error clasificado internamente con uno de los siguientes códigos:" })}
                <code className="text-xs ml-1">provider_timeout_*</code>,
                <code className="text-xs ml-1">provider_5xx_*</code>,
                <code className="text-xs ml-1">sync_watchdog_*</code>,
                <code className="text-xs ml-1">lambda_crash_*</code>,
                <code className="text-xs ml-1">mux_failed_*</code>,
                <code className="text-xs ml-1">content_filter_after_confirm_*</code>
              </li>
            </ul>
            <p className="text-xs text-muted-foreground mt-3">
              Abgewickelt durch unseren <code>credit-refund-automation</code>-Service. Gutschrift
              {tx({ de: "erscheint in der Regel innerhalb weniger Minuten in deinem AI-Video-Wallet.", en: "will usually appear in your AI video wallet within a few minutes.", es: "aparecerá generalmente en tu billetera de video de IA en pocos minutos." })}
            </p>
          </section>

          {/* 2. Kein automatischer Refund */}
          <section className="mb-10">
            <div className="flex items-center gap-2 mb-3">
              <XCircle className="h-5 w-5 text-destructive" />
              <h2 className="font-serif text-2xl">{tx({ de: "2. Kein automatischer Refund", en: "2. No automatic refund", es: "2. Sin reembolso automático" })}</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              {tx({ de: "Sobald du im Anchor-Preview auf", en: "Once you have clicked", es: "En cuanto hagas clic en" })} <strong>„{tx({ de: "Bestätigen & rendern", en: "Confirm & render", es: "Confirmar y renderizar" })}"</strong> {tx({ de: "geklickt hast, hast du das Vorschaubild abgenommen. Ab diesem Zeitpunkt werden folgende Punkte", en: "in the Anchor Preview, you have accepted the preview image. From that point on, the following are", es: "en la vista previa Anchor, has aceptado la imagen de vista previa. A partir de ese momento, lo siguiente" })} <strong>{tx({ de: "nicht", en: "not", es: "no" })}</strong> {tx({ de: "automatisch erstattet — analog zur Praxis von Runway, Artlist und HeyGen:", en: "automatically refunded — in line with the practice of Runway, Artlist and HeyGen:", es: "se reembolsa automáticamente, siguiendo la práctica de Runway, Artlist y HeyGen:" })}
            </p>
            <ul className="list-disc pl-6 space-y-1.5 text-sm text-foreground/90">
              <li>
                {tx({ de: "Identitäts-Abweichungen (Face-Drift, Clone, falsches Gesicht), die im Preview bereits sichtbar waren. Der Preview zeigt dazu ausdrücklich einen Audit-Hinweis.", en: "Identity deviations (face drift, cloning, wrong face) that were already visible in the preview. The preview explicitly shows an audit notice for this.", es: "Desviaciones de identidad (deriva facial, clonación, rostro incorrecto) ya visibles en la vista previa. La vista previa muestra explícitamente un aviso de auditoría al respecto." })}
              </li>
              <li>
                {tx({ de: "Ästhetische Re-Rolls: Licht, Framing, Interpretation der Aktion, Style, Farb-Grading.", en: "Aesthetic re-rolls: lighting, framing, interpretation of the action, style, color grading.", es: "Re-rolls estéticos: iluminación, encuadre, interpretación de la acción, estilo, corrección de color." })}
              </li>
              <li>{tx({ de: "Erfolgreich gerenderte Clips, die dir subjektiv nicht gefallen.", en: "Successfully rendered clips that you subjectively dislike.", es: "Clips renderizados con éxito que subjetivamente no te gustan." })}</li>
            </ul>
            <Card className="mt-4 p-4 bg-muted/30 border-border/50 flex gap-3">
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">
                {tx({ de: "Tipp: Nutze den Preview-Gate aktiv. Ein Preview-Re-Roll kostet nur die Anchor-Compose-Credits (~1 Credit) —", en: "Tip: Actively use the preview gate. A preview re-roll only costs the anchor compose credits (~1 credit) —", es: "Consejo: usa activamente la puerta de vista previa. Un re-roll de vista previa solo cuesta los créditos de composición del anchor (~1 crédito) —" })} <strong>{tx({ de: "keine", en: "no", es: "ningún" })}</strong> {tx({ de: "Hailuo/Sync-Kosten. Erst nach deiner Bestätigung starten die teuren Render-Schritte.", en: "Hailuo/Sync costs. The expensive render steps only start after your confirmation.", es: "costo de Hailuo/Sync. Los pasos de renderizado costosos solo comienzan tras tu confirmación." })}
              </p>
            </Card>
          </section>

          {/* 3. Preview-Gate */}
          <section className="mb-10">
            <div className="flex items-center gap-2 mb-3">
              <RefreshCcw className="h-5 w-5 text-primary" />
              <h2 className="font-serif text-2xl">{tx({ de: "3. Preview-Gate — was du siehst, bekommst du", en: "3. Preview gate — what you see is what you get", es: "3. Puerta de vista previa — lo que ves es lo que obtienes" })}</h2>
            </div>
            <ul className="list-disc pl-6 space-y-1.5 text-sm text-foreground/90">
              <li>
                <strong>{tx({ de: "Preview erfolgreich + bestätigt:", en: "Preview successful + confirmed:", es: "Vista previa exitosa + confirmada:" })}</strong> {tx({ de: "normales Rendering, normale Abbuchung. Kein Refund für Inhalte, die im Preview schon zu sehen waren.", en: "normal rendering, normal billing. No refund for content already visible in the preview.", es: "renderizado normal, cobro normal. Sin reembolso por contenido que ya era visible en la vista previa." })}
              </li>
              <li>
                <strong>{tx({ de: "Preview zeigt Drift → du re-rollst:", en: "Preview shows drift → you re-roll:", es: "La vista previa muestra deriva → repites:" })}</strong> {tx({ de: "nur ~1 Credit pro Preview.", en: "only ~1 credit per preview.", es: "solo ~1 crédito por vista previa." })}
              </li>
              <li>
                <strong>{tx({ de: "Preview zeigt Drift → du brichst ab:", en: "Preview shows drift → you cancel:", es: "La vista previa muestra deriva → cancelas:" })}</strong> {tx({ de: "keine Render-Kosten. Die Preview-Compose-Credits (~1) sind nicht erstattungsfähig — sie decken echte Provider-Kosten (Nano-Banana / Seedream + Face-Audit).", en: "no render costs. The preview compose credits (~1) are non-refundable — they cover real provider costs (Nano-Banana / Seedream + face audit).", es: "sin costos de renderizado. Los créditos de composición de vista previa (~1) no son reembolsables — cubren costos reales del proveedor (Nano-Banana / Seedream + auditoría facial)." })}
              </li>
              <li>
                <strong>{tx({ de: "Preview selbst schlägt fehl / Timeout:", en: "Preview itself fails / times out:", es: "La vista previa en sí falla / expira:" })}</strong> {tx({ de: "automatische Rückerstattung der Preview-Credits.", en: "automatic refund of the preview credits.", es: "reembolso automático de los créditos de vista previa." })}
              </li>
              <li>
                <strong>{tx({ de: "Technischer Fehler nach Bestätigung:", en: "Technical error after confirmation:", es: "Error técnico tras la confirmación:" })}</strong> {tx({ de: "volle automatische Rückerstattung aller Render-Credits.", en: "full automatic refund of all render credits.", es: "reembolso automático completo de todos los créditos de renderizado." })}
              </li>
            </ul>
          </section>

          {/* 4. Goodwill */}
          <section className="mb-10">
            <div className="flex items-center gap-2 mb-3">
              <LifeBuoy className="h-5 w-5 text-primary" />
              <h2 className="font-serif text-2xl">{tx({ de: "4. Kulanz-Refunds", en: "4. Goodwill refunds", es: "4. Reembolsos de cortesía" })}</h2>
            </div>
            <p className="text-sm text-foreground/90">
              {tx({ de: "In Härtefällen kann unser Support pro Nutzer", en: "In hardship cases, our support can grant", es: "En casos excepcionales, nuestro soporte puede conceder" })} <strong>{tx({ de: "eine Kulanz-Rückerstattung alle 30 Tage", en: "one goodwill refund every 30 days", es: "un reembolso de cortesía cada 30 días" })}</strong> {tx({ de: "gewähren — z. B. wenn ein Rendering trotz bestätigtem Preview offensichtlich unbrauchbar geworden ist. Meldung bitte innerhalb von 14 Tagen nach dem Rendering an", en: "per user — e.g. if a rendering has clearly become unusable despite a confirmed preview. Please report within 14 days of rendering to", es: "por usuario — p. ej. si un renderizado se ha vuelto claramente inutilizable a pesar de una vista previa confirmada. Por favor, informa dentro de los 14 días posteriores al renderizado a" })}{' '}
              <a href="mailto:support@useadtool.ai" className="text-primary underline">
                support@useadtool.ai
              </a>{' '}
              {tx({ de: "mit Szenen-ID und kurzer Beschreibung.", en: "with the scene ID and a short description.", es: "con el ID de la escena y una breve descripción." })}
            </p>
          </section>

          {/* 5. Beta-Hinweis */}
          <section className="mb-10">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              <h2 className="font-serif text-2xl">{tx({ de: "5. Beta-Phase", en: "5. Beta phase", es: "5. Fase beta" })}</h2>
            </div>
            <p className="text-sm text-foreground/90">
              {tx({ de: "Während unserer öffentlichen Beta (Launch: 26.07.2026, Dauer 3 Monate) gilt für Legacy-Direkt-Render-Flows, die den Preview-Gate noch nicht durchlaufen, eine erweiterte 60-Tage-Kulanz: einmalige Rückerstattung pro Szene auf Anfrage. Danach greift ausschließlich die reguläre Policy oben.", en: "During our public beta (launch: 26.07.2026, duration 3 months), legacy direct-render flows that don't go through the preview gate get an extended 60-day goodwill period: a one-time refund per scene upon request. After that, only the regular policy above applies.", es: "Durante nuestra beta pública (lanzamiento: 26.07.2026, duración 3 meses), los flujos de renderizado directo antiguos que aún no pasan por la puerta de vista previa tienen una cortesía extendida de 60 días: un reembolso único por escena bajo solicitud. Después de eso, solo se aplica la política regular anterior." })}
            </p>
          </section>

          {/* 6. Was NICHT abgedeckt ist */}
          <section className="mb-10">
            <h2 className="font-serif text-2xl mb-3">{tx({ de: "6. Was nicht abgedeckt ist", en: "6. What is not covered", es: "6. Lo que no está cubierto" })}</h2>
            <ul className="list-disc pl-6 space-y-1.5 text-sm text-foreground/90">
              <li>
                {tx({ de: "Verbrauchte Credits aus Preview-Compose-Schritten (~1 Credit) — repräsentieren echte Provider-Kosten.", en: "Credits consumed by preview compose steps (~1 credit) — represent real provider costs.", es: "Créditos consumidos en los pasos de composición de vista previa (~1 crédito) — representan costos reales del proveedor." })}
              </li>
              <li>{tx({ de: "Abo-Gebühren des Beta-Basic-Plans (getrennt geregelt in den AGB §8).", en: "Subscription fees of the Beta Basic plan (governed separately in the T&Cs §8).", es: "Tarifas de suscripción del plan Beta Basic (reguladas por separado en los TyC §8)." })}</li>
              <li>
                {tx({ de: "Downloads / Exports bereits gerenderter, akzeptierter Clips (auch bei späterer Unzufriedenheit).", en: "Downloads / exports of already rendered, accepted clips (even if you're dissatisfied later).", es: "Descargas / exportaciones de clips ya renderizados y aceptados (incluso si hay insatisfacción posterior)." })}
              </li>
              <li>
                {tx({ de: "Änderungen an Provider-Preisen: wir gleichen kleine Schwankungen selbst aus, große Preissprünge werden mit 14 Tagen Vorlauf angekündigt.", en: "Changes to provider pricing: we absorb small fluctuations ourselves, large price jumps are announced 14 days in advance.", es: "Cambios en los precios del proveedor: absorbemos pequeñas fluctuaciones nosotros mismos, los grandes saltos de precio se anuncian con 14 días de antelación." })}
              </li>
            </ul>
          </section>

          <div className="text-xs text-muted-foreground border-t border-border/50 pt-6">
            {tx({ de: "Diese Policy ergänzt die", en: "This policy supplements the", es: "Esta política complementa los" })}{' '}
            <Link to="/terms" className="text-primary underline">
              {tx({ de: "AGB", en: "T&Cs", es: "TyC" })}
            </Link>{' '}
            {tx({ de: "und die", en: "and the", es: "y la" })}{' '}
            <Link to="/privacy" className="text-primary underline">
              {tx({ de: "Datenschutzerklärung", en: "Privacy Policy", es: "Política de Privacidad" })}
            </Link>
            . {tx({ de: "Bei Widersprüchen gelten die AGB. Gerichtsstand: Berlin, deutsches Recht.", en: "In case of conflict, the T&Cs prevail. Jurisdiction: Berlin, German law.", es: "En caso de conflicto, prevalecen los TyC. Jurisdicción: Berlín, ley alemana." })}
          </div>
        </div>
      </div>
    </>
  );
}
