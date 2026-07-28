import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { ShieldCheck, CheckCircle2, XCircle, RefreshCcw, LifeBuoy, ArrowLeft, AlertTriangle } from 'lucide-react';

export const AI_VIDEO_REFUND_POLICY_VERSION = 'v1.0-2026-07-28';

/**
 * Public AI Video Refund Policy — kundenfreundliche Zusammenfassung von
 * docs/policies/refund-policy-v263.md (Anchor-Preview-Gate).
 */
export default function AIVideoRefundPolicy() {
  return (
    <>
      <Helmet>
        <title>KI-Video Rückerstattung | AdTool AI</title>
        <meta
          name="description"
          content="Wann werden Credits für KI-Video-Renderings automatisch erstattet und wann nicht — transparente Refund-Regeln nach dem Preview-Gate-Prinzip."
        />
      </Helmet>

      <div className="min-h-screen bg-background">
        <div className="max-w-3xl mx-auto px-6 py-10">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6"
          >
            <ArrowLeft className="h-4 w-4" /> Zurück zur Startseite
          </Link>

          <div className="flex items-center gap-3 mb-2">
            <ShieldCheck className="h-7 w-7 text-primary" />
            <h1 className="font-serif text-3xl">KI-Video Refund Policy</h1>
          </div>
          <p className="text-sm text-muted-foreground mb-8">
            Version {AI_VIDEO_REFUND_POLICY_VERSION} · gültig für alle KI-Video-Renderings im
            Motion Studio, AI Video Studio und Universal Director's Cut.
          </p>

          <Card className="bg-primary/5 border-primary/30 p-5 mb-8">
            <p className="text-sm text-foreground/90">
              Wir arbeiten mit externen Modell-Providern (Hailuo, Kling, Seedance, Sync.so, HeyGen,
              Sora u. a.). Damit du fair behandelt wirst und wir gleichzeitig planbar arbeiten
              können, trennen wir <strong>technische Fehler</strong> (unser Risiko) klar von
              <strong> kreativen Ergebnissen</strong> (dein Risiko nach Bestätigung im Preview).
            </p>
          </Card>

          {/* 1. Automatischer Refund */}
          <section className="mb-10">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              <h2 className="font-serif text-2xl">1. Automatischer Refund</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              In folgenden Fällen werden die Credits für die betroffene Szene <strong>vollständig
              und automatisch</strong> auf dein Guthaben zurückgebucht — kein Support-Ticket
              nötig:
            </p>
            <ul className="list-disc pl-6 space-y-1.5 text-sm text-foreground/90">
              <li>Timeout eines Providers (Hailuo, Kling, Seedance, Sync.so, HeyGen …)</li>
              <li>HTTP 5xx / Server-Fehler eines Providers</li>
              <li>Sync.so Mux- oder Stitch-Fehler, Watchdog-Kill, Lambda-Crash</li>
              <li>Content-Filter des Providers, der <em>nach</em> deiner Bestätigung greift</li>
              <li>
                Jeder Fehler, der intern mit einem der folgenden Codes klassifiziert wird:
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
              erscheint in der Regel innerhalb weniger Minuten in deinem AI-Video-Wallet.
            </p>
          </section>

          {/* 2. Kein automatischer Refund */}
          <section className="mb-10">
            <div className="flex items-center gap-2 mb-3">
              <XCircle className="h-5 w-5 text-destructive" />
              <h2 className="font-serif text-2xl">2. Kein automatischer Refund</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              Sobald du im Anchor-Preview auf <strong>„Bestätigen &amp; rendern"</strong> geklickt
              hast, hast du das Vorschaubild abgenommen. Ab diesem Zeitpunkt werden folgende
              Punkte <strong>nicht</strong> automatisch erstattet — analog zur Praxis von Runway,
              Artlist und HeyGen:
            </p>
            <ul className="list-disc pl-6 space-y-1.5 text-sm text-foreground/90">
              <li>
                Identitäts-Abweichungen (Face-Drift, Clone, falsches Gesicht), die im Preview
                bereits sichtbar waren. Der Preview zeigt dazu ausdrücklich einen Audit-Hinweis.
              </li>
              <li>
                Ästhetische Re-Rolls: Licht, Framing, Interpretation der Aktion, Style,
                Farb-Grading.
              </li>
              <li>Erfolgreich gerenderte Clips, die dir subjektiv nicht gefallen.</li>
            </ul>
            <Card className="mt-4 p-4 bg-muted/30 border-border/50 flex gap-3">
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">
                Tipp: Nutze den Preview-Gate aktiv. Ein Preview-Re-Roll kostet nur die
                Anchor-Compose-Credits (~1 Credit) — <strong>keine</strong> Hailuo/Sync-Kosten.
                Erst nach deiner Bestätigung starten die teuren Render-Schritte.
              </p>
            </Card>
          </section>

          {/* 3. Preview-Gate */}
          <section className="mb-10">
            <div className="flex items-center gap-2 mb-3">
              <RefreshCcw className="h-5 w-5 text-primary" />
              <h2 className="font-serif text-2xl">3. Preview-Gate — was du siehst, bekommst du</h2>
            </div>
            <ul className="list-disc pl-6 space-y-1.5 text-sm text-foreground/90">
              <li>
                <strong>Preview erfolgreich + bestätigt:</strong> normales Rendering, normale
                Abbuchung. Kein Refund für Inhalte, die im Preview schon zu sehen waren.
              </li>
              <li>
                <strong>Preview zeigt Drift → du re-rollst:</strong> nur ~1 Credit pro Preview.
              </li>
              <li>
                <strong>Preview zeigt Drift → du brichst ab:</strong> keine Render-Kosten. Die
                Preview-Compose-Credits (~1) sind nicht erstattungsfähig — sie decken echte
                Provider-Kosten (Nano-Banana / Seedream + Face-Audit).
              </li>
              <li>
                <strong>Preview selbst schlägt fehl / Timeout:</strong> automatische Rückerstattung
                der Preview-Credits.
              </li>
              <li>
                <strong>Technischer Fehler nach Bestätigung:</strong> volle automatische
                Rückerstattung aller Render-Credits.
              </li>
            </ul>
          </section>

          {/* 4. Goodwill */}
          <section className="mb-10">
            <div className="flex items-center gap-2 mb-3">
              <LifeBuoy className="h-5 w-5 text-primary" />
              <h2 className="font-serif text-2xl">4. Kulanz-Refunds</h2>
            </div>
            <p className="text-sm text-foreground/90">
              In Härtefällen kann unser Support pro Nutzer <strong>eine Kulanz-Rückerstattung
              alle 30 Tage</strong> gewähren — z. B. wenn ein Rendering trotz bestätigtem
              Preview offensichtlich unbrauchbar geworden ist. Meldung bitte innerhalb von
              14 Tagen nach dem Rendering an{' '}
              <a href="mailto:support@useadtool.ai" className="text-primary underline">
                support@useadtool.ai
              </a>{' '}
              mit Szenen-ID und kurzer Beschreibung.
            </p>
          </section>

          {/* 5. Beta-Hinweis */}
          <section className="mb-10">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              <h2 className="font-serif text-2xl">5. Beta-Phase</h2>
            </div>
            <p className="text-sm text-foreground/90">
              Während unserer öffentlichen Beta (Launch: 26.07.2026, Dauer 3 Monate) gilt für
              Legacy-Direkt-Render-Flows, die den Preview-Gate noch nicht durchlaufen, eine
              erweiterte 60-Tage-Kulanz: einmalige Rückerstattung pro Szene auf Anfrage. Danach
              greift ausschließlich die reguläre Policy oben.
            </p>
          </section>

          {/* 6. Was NICHT abgedeckt ist */}
          <section className="mb-10">
            <h2 className="font-serif text-2xl mb-3">6. Was nicht abgedeckt ist</h2>
            <ul className="list-disc pl-6 space-y-1.5 text-sm text-foreground/90">
              <li>
                Verbrauchte Credits aus Preview-Compose-Schritten (~1 Credit) — repräsentieren
                echte Provider-Kosten.
              </li>
              <li>Abo-Gebühren des Beta-Basic-Plans (getrennt geregelt in den AGB §8).</li>
              <li>
                Downloads / Exports bereits gerenderter, akzeptierter Clips (auch bei späterer
                Unzufriedenheit).
              </li>
              <li>
                Änderungen an Provider-Preisen: wir gleichen kleine Schwankungen selbst aus,
                große Preissprünge werden mit 14 Tagen Vorlauf angekündigt.
              </li>
            </ul>
          </section>

          <div className="text-xs text-muted-foreground border-t border-border/50 pt-6">
            Diese Policy ergänzt die{' '}
            <Link to="/terms" className="text-primary underline">
              AGB
            </Link>{' '}
            und die{' '}
            <Link to="/privacy" className="text-primary underline">
              Datenschutzerklärung
            </Link>
            . Bei Widersprüchen gelten die AGB. Gerichtsstand: Berlin, deutsches Recht.
          </div>
        </div>
      </div>
    </>
  );
}
