import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { ShieldCheck, AlertTriangle, Ban, FileText, ArrowLeft } from 'lucide-react';

/**
 * Public Acceptable Use Policy for Autopilot mode.
 * Version v1.0 (2026-04-29). Hash of this text is stored on consent.
 */
export const AUTOPILOT_AUP_VERSION = 'v1.0-2026-04-29';

export default function AutopilotAUP() {
  return (
    <>
      <Helmet>
        <title>Autopilot Acceptable Use Policy | useadtool</title>
        <meta name="description" content="Verbindliche Nutzungsregeln für den Autopilot-Modus. Anti-Deepfake, Anti-Copyright und Anti-Missbrauchs-Regeln mit Konsequenzen bis zur fristlosen Account-Löschung." />
      </Helmet>

      <div className="min-h-screen bg-background">
        <div className="max-w-3xl mx-auto px-6 py-10">
          <Link to="/autopilot" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
            <ArrowLeft className="h-4 w-4" /> Zurück zum Cockpit
          </Link>

          <div className="flex items-center gap-3 mb-2">
            <ShieldCheck className="h-7 w-7 text-primary" />
            <h1 className="font-serif text-3xl">Autopilot — Acceptable Use Policy</h1>
          </div>
          <p className="text-sm text-muted-foreground mb-8">Version {AUTOPILOT_AUP_VERSION} · gültig ab Aktivierung</p>

          <Card className="bg-destructive/10 border-destructive/40 p-5 mb-8">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold text-destructive mb-1">Wichtig — bitte vollständig lesen</p>
                <p className="text-foreground/90">
                  Die Aktivierung des Autopilot-Modus bedeutet, dass eine KI in deinem Namen Inhalte generiert und (bei aktiviertem Auto-Publish) auf deinen verbundenen Plattformen veröffentlicht.
                  Du bleibst rechtlich verantwortlich für jeden veröffentlichten Inhalt. Diese Policy regelt verbindlich, was zulässig ist und welche Konsequenzen Verstöße haben.
                </p>
              </div>
            </div>
          </Card>

          <Section title="§1 Geltungsbereich">
            Diese Acceptable Use Policy (AUP) gilt für alle Funktionen unter <code>/autopilot</code> sowie für sämtliche durch den Autopilot generierten und veröffentlichten Inhalte. Sie ist Bestandteil unserer AGB. Im Konflikt gelten die strengeren Regeln dieser AUP.
          </Section>

          <Section title="§2 Striktes Deepfake-Verbot">
            Verboten ist insbesondere die Generierung, Speicherung oder Veröffentlichung von Inhalten, die:
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>reale, identifizierbare Personen ohne deren ausdrückliche schriftliche Einwilligung darstellen (Politiker, Prominente, Privatpersonen, Kollegen, Kunden, etc.);</li>
              <li>den Eindruck erwecken, eine reale Person habe etwas gesagt oder getan, was sie nicht gesagt oder getan hat;</li>
              <li>Stimmen realer Personen ohne nachweisbare Lizenz klonen oder imitieren;</li>
              <li>Minderjährige darstellen oder darstellen könnten — ausnahmslos.</li>
            </ul>
            <p className="mt-2">
              Erlaubt sind ausschließlich (a) vollständig KI-generierte fiktive Charaktere, (b) Selbstporträts des aktuellen Account-Inhabers, oder (c) Personen, für die ein gültiges Model Release als PDF im System hinterlegt und manuell verifiziert wurde.
            </p>
          </Section>

          <Section title="§3 Striktes Copyright-Verbot">
            Verboten ist die Generierung von Inhalten, die:
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>geschützte Marken, Logos, Maskottchen oder Brand-Assets fremder Unternehmen abbilden oder imitieren (z.B. Disney, Marvel, Nintendo, Apple, Nike, Coca-Cola etc.);</li>
              <li>geschützte Charaktere, Comic-Figuren, Anime-/Game-Charaktere oder Filmfiguren darstellen;</li>
              <li>Musik, Soundtracks oder Tonaufnahmen Dritter ohne nachweisbare Lizenz enthalten;</li>
              <li>fremden Stockfoto-Watermarks, Newsroom-Logos oder Wasserzeichen enthalten oder diese entfernen;</li>
              <li>Texte oder Captions enthalten, die fremde Werke nicht-trivial reproduzieren.</li>
            </ul>
          </Section>

          <Section title="§4 Inhaltliche Verbote">
            Generell verboten — unabhängig von Aufmachung — sind:
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Hassrede, Aufruf zur Gewalt, Diskriminierung jeglicher Art;</li>
              <li>medizinische, juristische oder finanzielle Beratung mit Wirkungs-/Heilungsversprechen;</li>
              <li>politische Wahlkampf- oder Propagandainhalte;</li>
              <li>Glücksspiel-, Krypto-Spam-, Pyramidenschema-, MLM-Inhalte;</li>
              <li>sexuelle/pornografische Inhalte oder solche, die als jugendgefährdend einzustufen sind;</li>
              <li>Engagement-Bait, Spam-Hashtag-Cluster, künstliche Reichweiten-Manipulation;</li>
              <li>Identitätstäuschung in Captions („Ich bin Arzt/Anwalt/CEO von …" ohne Wahrheit).</li>
            </ul>
          </Section>

          <Section title="§5 Mehrstufige Schutzschicht (Hard Legal Shield)">
            Jeder Slot durchläuft sieben technische Walls:
            <ol className="list-decimal pl-5 mt-2 space-y-1">
              <li><strong>Brief-Wall</strong> — Klassifikation der Strategie-Eingaben.</li>
              <li><strong>Asset-Origin-Wall</strong> — nur freigegebene Avatare (AI/Self/Lizenz).</li>
              <li><strong>Generation-Wall</strong> — Pre-Render-Klassifikation des Prompts.</li>
              <li><strong>Output-Wall</strong> — Vision-Check auf Gesichter, Logos, IP, NSFW.</li>
              <li><strong>Caption-Wall</strong> — Text-Filter inkl. Identitäts- und Verspechensprüfung.</li>
              <li><strong>Publishing-Wall</strong> — Cooldowns, Rate-Limits, Token-Validierung.</li>
              <li><strong>Watermark &amp; Disclosure</strong> — C2PA-Metadaten + AI-Disclosure-Suffix in Captions.</li>
            </ol>
            Inhalte, die irgendeine dieser Walls nicht passieren, werden automatisch blockiert. Versuche, diese Walls zu umgehen, gelten als Critical-Strike (siehe §6).
          </Section>

          <Section title="§6 Strike-System &amp; Sanktionen">
            <div className="space-y-2">
              <p><strong>Soft-Strike</strong> (Eingabe oder Caption blockiert) — Hinweis im Cockpit, keine weiteren Folgen.</p>
              <p><strong>Hard-Strike</strong> (Generierungs- oder Render-Block: Deepfake-Hint, Copyright-Hint, prominente Person, geschützte IP) — zählt im Strike-Counter.</p>
              <p><strong>Critical-Strike</strong> (Manipulationsversuch: Watermark-Removal, Filter-Bypass, gefälschte Origin-Daten, modifizierte API-Payloads, mehrfacher Hard-Strike-Wiederholung) — zählt doppelt und kann zur sofortigen Termination führen (siehe §7).</p>
            </div>
            <div className="mt-3 rounded-lg border border-border/60 bg-muted/30 p-3 text-sm space-y-1">
              <p>Strike 1 → Schriftliche Warnung per Mail.</p>
              <p>Strike 2 → 7 Tage Autopilot-Sperre + verpflichtendes Re-Onboarding.</p>
              <p>Strike 3 → Autopilot dauerhaft für diesen Account gesperrt + Admin-Review.</p>
            </div>
          </Section>

          <Section title="§7 Fristlose Account-Löschung ohne Rückerstattung">
            <Card className="bg-destructive/10 border-destructive/50 p-4 my-2">
              <div className="flex items-start gap-2">
                <Ban className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div className="text-sm space-y-2">
                  <p className="font-semibold text-destructive">
                    Folgende Verstöße führen zur sofortigen, fristlosen Löschung des gesamten Accounts ohne Anspruch auf Rückerstattung von Credits, laufenden Abonnements oder anderen Guthaben:
                  </p>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>Versuch, ein Deepfake einer realen Person zu generieren (auch erfolgloser Versuch);</li>
                    <li>Mehrfacher Versuch, denselben blockierten Prompt nach Block zu wiederholen;</li>
                    <li>Manipulation an unseren Systemen oder unautorisierte direkte API-Aufrufe mit modifizierten Payloads;</li>
                    <li>Einreichung von Assets mit gefälschten Origin-Daten (z.B. fremde Person als „Self-Portrait" deklariert);</li>
                    <li>Veröffentlichungen, die nachweislich auf Plattformen wegen Copyright-Verletzung oder Identitätstäuschung gesperrt werden (DMCA-Eingang);</li>
                    <li>Nutzung des Autopilots zur Verbreitung von Hass, illegalen Inhalten oder zur Schädigung Dritter.</li>
                  </ul>
                </div>
              </div>
            </Card>
            <p>Im Falle einer Termination werden Beweise (Prompts, Renderings, Strikes, Consent-Log) für 90 Tage zur rechtlichen Verteidigung archiviert und anschließend gemäß DSGVO Art. 17 endgültig gelöscht. Du erhältst eine schriftliche Begründung mit Beweis-Hash und kannst innerhalb von 14 Tagen schriftlich Widerspruch einlegen (<Link to="/legal/character-takedown" className="text-primary underline">Kontakt</Link>).</p>
          </Section>

          <Section title="§8 EU-AI-Act-Konformität &amp; Audit">
            Jede KI-Entscheidung des Autopilots wird in einem unveränderlichen Activity-Log mit Prompt, Output, QA-Score und Zeitstempel gespeichert (für mindestens 12 Monate). Du hast jederzeit Zugriff auf dein eigenes Log im Cockpit. Du erfüllst damit deine Transparenzpflicht ggü. Plattformen und Behörden.
          </Section>

          <Section title="§9 Disclosure-Pflicht">
            Alle vom Autopilot generierten Posts werden automatisch mit dem Hinweis „Made with AI · @useadtool" in der Caption versehen sowie mit einem unsichtbaren C2PA-Provenance-Manifest in den Asset-Metadaten. Diese Markierungen dürfen nicht entfernt werden — siehe §6 (Critical-Strike).
          </Section>

          <Section title="§10 Plattform-Konformität">
            Du versicherst, dass deine verbundenen Social-Media-Konten den jeweiligen Plattform-Richtlinien (Meta Platform Terms, TikTok Community Guidelines, X Developer Agreement etc.) entsprechen. Die Nutzung des Autopilots entbindet dich nicht von eigener Verantwortung für Plattform-konformes Verhalten.
          </Section>

          <div className="mt-8 flex items-center gap-2 text-xs text-muted-foreground">
            <FileText className="h-3.5 w-3.5" />
            Hash dieses Dokuments wird beim Akzeptieren mit Zeitstempel und IP-Hash unveränderlich in deinem Consent-Log abgelegt.
          </div>
        </div>
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="font-serif text-xl text-foreground mb-2">{title}</h2>
      <div className="text-sm text-muted-foreground leading-relaxed space-y-2">{children}</div>
    </section>
  );
}
