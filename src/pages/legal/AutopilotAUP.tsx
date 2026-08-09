import { tx } from "@/lib/i18nText";
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
        <meta name="description" content={tx({ de: "Verbindliche Nutzungsregeln für den Autopilot-Modus. Anti-Deepfake, Anti-Copyright und Anti-Missbrauchs-Regeln mit Konsequenzen bis zur fristlosen Account-Löschung.", en: "Binding terms of use for Autopilot mode. Anti-deepfake, anti-copyright, and anti-abuse rules with consequences up to immediate account deletion.", es: "Términos de uso vinculantes para el modo Autopilot. Reglas anti-deepfake, anti-copyright y anti-abuso con consecuencias que pueden llegar hasta la eliminación inmediata de la cuenta." })} />
      </Helmet>

      <div className="min-h-screen bg-background">
        <div className="max-w-3xl mx-auto px-6 py-10">
          <Link to="/autopilot" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
            <ArrowLeft className="h-4 w-4" /> {tx({ de: "Zurück zum Cockpit", en: "Back to cockpit", es: "Volver al cockpit" })}
          </Link>

          <div className="flex items-center gap-3 mb-2">
            <ShieldCheck className="h-7 w-7 text-primary" />
            <h1 className="font-serif text-3xl">Autopilot — Acceptable Use Policy</h1>
          </div>
          <p className="text-sm text-muted-foreground mb-8">{tx({ de: `Version ${AUTOPILOT_AUP_VERSION} · gültig ab Aktivierung`, en: `Version ${AUTOPILOT_AUP_VERSION} · valid from activation`, es: `Versión ${AUTOPILOT_AUP_VERSION} · válida desde la activación` })}</p>

          <Card className="bg-destructive/10 border-destructive/40 p-5 mb-8">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold text-destructive mb-1">{tx({ de: "Wichtig — bitte vollständig lesen", en: "Important — please read in full", es: "Importante — por favor lee todo" })}</p>
                <p className="text-foreground/90">
                  {tx({ de: "Die Aktivierung des Autopilot-Modus bedeutet, dass eine KI in deinem Namen Inhalte generiert und (bei aktiviertem Auto-Publish) auf deinen verbundenen Plattformen veröffentlicht. Du bleibst rechtlich verantwortlich für jeden veröffentlichten Inhalt. Diese Policy regelt verbindlich, was zulässig ist und welche Konsequenzen Verstöße haben.", en: "Activating Autopilot mode means an AI generates content on your behalf and (with Auto-Publish enabled) publishes it on your connected platforms. You remain legally responsible for every published piece of content. This policy binds what is permitted and the consequences of violations.", es: "Activar el modo Autopilot significa que una IA genera contenido en tu nombre y (con Auto-Publish activado) lo publica en tus plataformas conectadas. Sigues siendo legalmente responsable de todo el contenido publicado. Esta política regula de forma vinculante lo que está permitido y las consecuencias de las infracciones." })}
                </p>
              </div>
            </div>
          </Card>

          <Section title={tx({ de: "§1 Geltungsbereich", en: "§1 Scope", es: "§1 Ámbito de aplicación" })}>
            {tx({ de: "Diese Acceptable Use Policy (AUP) gilt für alle Funktionen unter", en: "This Acceptable Use Policy (AUP) applies to all features under", es: "Esta Política de Uso Aceptable (AUP) se aplica a todas las funciones bajo" })} <code>/autopilot</code> {tx({ de: "sowie für sämtliche durch den Autopilot generierten und veröffentlichten Inhalte. Sie ist Bestandteil unserer AGB. Im Konflikt gelten die strengeren Regeln dieser AUP.", en: "as well as all content generated and published by Autopilot. It is part of our Terms & Conditions. In case of conflict, the stricter rules of this AUP apply.", es: "así como para todo el contenido generado y publicado por Autopilot. Forma parte de nuestros Términos y Condiciones. En caso de conflicto, se aplican las reglas más estrictas de esta AUP." })}
          </Section>

          <Section title={tx({ de: "§2 Striktes Deepfake-Verbot", en: "§2 Strict deepfake ban", es: "§2 Prohibición estricta de deepfakes" })}>
            {tx({ de: "Verboten ist insbesondere die Generierung, Speicherung oder Veröffentlichung von Inhalten, die:", en: "In particular, it is prohibited to generate, store, or publish content that:", es: "En particular, está prohibido generar, almacenar o publicar contenido que:" })}
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>{tx({ de: "reale, identifizierbare Personen ohne deren ausdrückliche schriftliche Einwilligung darstellen (Politiker, Prominente, Privatpersonen, Kollegen, Kunden, etc.);", en: "depict real, identifiable persons without their express written consent (politicians, celebrities, private individuals, colleagues, customers, etc.);", es: "representan a personas reales e identificables sin su consentimiento explícito por escrito (políticos, famosos, particulares, compañeros, clientes, etc.);" })}</li>
              <li>{tx({ de: "den Eindruck erwecken, eine reale Person habe etwas gesagt oder getan, was sie nicht gesagt oder getan hat;", en: "give the impression that a real person said or did something they did not say or do;", es: "dar la impresión de que una persona real dijo o hizo algo que no dijo o hizo;" })}</li>
              <li>{tx({ de: "Stimmen realer Personen ohne nachweisbare Lizenz klonen oder imitieren;", en: "clone or imitate voices of real persons without verifiable license;", es: "clonar o imitar voces de personas reales sin una licencia verificable;" })}</li>
              <li>{tx({ de: "Minderjährige darstellen oder darstellen könnten — ausnahmslos.", en: "depict or could depict minors — without exception.", es: "representan o podrían representar a menores — sin excepción." })}</li>
            </ul>
            <p className="mt-2">
              {tx({ de: "Erlaubt sind ausschließlich (a) vollständig KI-generierte fiktive Charaktere, (b) Selbstporträts des aktuellen Account-Inhabers, oder (c) Personen, für die ein gültiges Model Release als PDF im System hinterlegt und manuell verifiziert wurde.", en: "Only the following are permitted: (a) fully AI-generated fictional characters, (b) self-portraits of the current account holder, or (c) persons for whom a valid model release has been uploaded as a PDF and manually verified in the system.", es: "Solo se permiten: (a) personajes ficticios generados íntegramente por IA, (b) autorretratos del titular de la cuenta actual, o (c) personas para las que se ha subido una autorización de modelo válida en PDF y verificada manualmente en el sistema." })}
            </p>
          </Section>

          <Section title={tx({ de: "§3 Striktes Copyright-Verbot", en: "§3 Strict copyright ban", es: "§3 Prohibición estricta de derechos de autor" })}>
            {tx({ de: "Verboten ist die Generierung von Inhalten, die:", en: "It is prohibited to generate content that:", es: "Está prohibido generar contenido que:" })}
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>{tx({ de: "geschützte Marken, Logos, Maskottchen oder Brand-Assets fremder Unternehmen abbilden oder imitieren (z.B. Disney, Marvel, Nintendo, Apple, Nike, Coca-Cola etc.);", en: "depicts or imitates protected trademarks, logos, mascots, or brand assets of other companies (e.g. Disney, Marvel, Nintendo, Apple, Nike, Coca-Cola, etc.);", es: "representa o imita marcas registradas, logotipos, mascotas o activos de marca de otras empresas (por ejemplo, Disney, Marvel, Nintendo, Apple, Nike, Coca-Cola, etc.);" })}</li>
              <li>{tx({ de: "geschützte Charaktere, Comic-Figuren, Anime-/Game-Charaktere oder Filmfiguren darstellen;", en: "depicts protected characters, comic figures, anime/game characters, or film characters;", es: "representa personajes protegidos, figuras de cómic, personajes de anime/videojuegos o personajes de películas;" })}</li>
              <li>{tx({ de: "Musik, Soundtracks oder Tonaufnahmen Dritter ohne nachweisbare Lizenz enthalten;", en: "contain third-party music, soundtracks, or audio recordings without verifiable license;", es: "contener música, bandas sonoras o grabaciones de audio de terceros sin una licencia verificable;" })}</li>
              <li>{tx({ de: "fremden Stockfoto-Watermarks, Newsroom-Logos oder Wasserzeichen enthalten oder diese entfernen;", en: "contain or remove third-party stock photo watermarks, newsroom logos, or watermarks;", es: "contener o eliminar marcas de agua de fotos de stock de terceros, logotipos de salas de prensa o marcas de agua;" })}</li>
              <li>{tx({ de: "Texte oder Captions enthalten, die fremde Werke nicht-trivial reproduzieren.", en: "contain texts or captions that non-trivially reproduce third-party works.", es: "contener textos o subtítulos que reproduzcan obras de terceros de forma no trivial." })}</li>
            </ul>
          </Section>

          <Section title={tx({ de: "§4 Inhaltliche Verbote", en: "§4 Content prohibitions", es: "§4 Prohibiciones de contenido" })}>
            {tx({ de: "Generell verboten — unabhängig von Aufmachung — sind:", en: "Generally prohibited — regardless of format — are:", es: "Generalmente prohibido — independientemente del formato — está:" })}
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>{tx({ de: "Hassrede, Aufruf zur Gewalt, Diskriminierung jeglicher Art;", en: "Hate speech, incitement to violence, discrimination of any kind;", es: "Discurso de odio, incitación a la violencia, discriminación de cualquier tipo;" })}</li>
              <li>{tx({ de: "medizinische, juristische oder finanzielle Beratung mit Wirkungs-/Heilungsversprechen;", en: "medical, legal, or financial advice with promises of effect/cure;", es: "asesoramiento médico, legal o financiero con promesas de efecto/curación;" })}</li>
              <li>{tx({ de: "politische Wahlkampf- oder Propagandainhalte;", en: "Political campaign or propaganda content;", es: "Contenido de campaña política o propaganda;" })}</li>
              <li>{tx({ de: "Glücksspiel-, Krypto-Spam-, Pyramidenschema-, MLM-Inhalte;", en: "Gambling, crypto-spam, pyramid scheme, MLM content;", es: "Contenido de juegos de azar, spam de criptomonedas, esquemas piramidales, MLM;" })}</li>
              <li>{tx({ de: "sexuelle/pornografische Inhalte oder solche, die als jugendgefährdend einzustufen sind;", en: "sexual/pornographic content or content that is to be classified as harmful to minors;", es: "contenido sexual/pornográfico o contenido que deba clasificarse como perjudicial para menores;" })}</li>
              <li>{tx({ de: "Engagement-Bait, Spam-Hashtag-Cluster, künstliche Reichweiten-Manipulation;", en: "Engagement bait, spam hashtag clusters, artificial reach manipulation;", es: "Cebos de interacción, clústeres de hashtags de spam, manipulación artificial del alcance;" })}</li>
              <li>{tx({ de: "Identitätstäuschung in Captions („Ich bin Arzt/Anwalt/CEO von …\" ohne Wahrheit).", en: "Identity deception in captions (\"I am a doctor/lawyer/CEO of…\" without truth).", es: "Suplantación de identidad en subtítulos (\"Soy médico/abogado/CEO de…\" sin ser verdad)." })}</li>
            </ul>
          </Section>

          <Section title={tx({ de: "§5 Mehrstufige Schutzschicht (Hard Legal Shield)", en: "§5 Multi-layer protection (Hard Legal Shield)", es: "§5 Capa de protección de varios niveles (Hard Legal Shield)" })}>
            {tx({ de: "Jeder Slot durchläuft sieben technische Walls:", en: "Each slot passes through seven technical walls:", es: "Cada espacio pasa por siete muros técnicos:" })}
            <ol className="list-decimal pl-5 mt-2 space-y-1">
              <li><strong>Brief-Wall</strong> — {tx({ de: "Klassifikation der Strategie-Eingaben.", en: "Classification of strategy inputs.", es: "Clasificación de las entradas de estrategia." })}</li>
              <li><strong>Asset-Origin-Wall</strong> — {tx({ de: "nur freigegebene Avatare (AI/Self/Lizenz).", en: "only approved avatars (AI/self/license).", es: "solo avatares aprobados (IA/propio/licencia)." })}</li>
              <li><strong>Generation-Wall</strong> — {tx({ de: "Pre-Render-Klassifikation des Prompts.", en: "Pre-render classification of the prompt.", es: "Clasificación previa al renderizado del prompt." })}</li>
              <li><strong>Output-Wall</strong> — {tx({ de: "Vision-Check auf Gesichter, Logos, IP, NSFW.", en: "Vision check for faces, logos, IP, NSFW.", es: "Verificación visual de caras, logotipos, propiedad intelectual, NSFW." })}</li>
              <li><strong>Caption-Wall</strong> — {tx({ de: "Text-Filter inkl. Identitäts- und Verspechensprüfung.", en: "Text filter including identity and promise checks.", es: "Filtro de texto incluyendo verificación de identidad y promesas." })}</li>
              <li><strong>Publishing-Wall</strong> — {tx({ de: "Cooldowns, Rate-Limits, Token-Validierung.", en: "Cooldowns, rate limits, token validation.", es: "Tiempos de espera, límites de tasa, validación de tokens." })}</li>
              <li><strong>Watermark &amp; Disclosure</strong> — {tx({ de: "C2PA-Metadaten + AI-Disclosure-Suffix in Captions.", en: "C2PA metadata + AI disclosure suffix in captions.", es: "Metadatos C2PA + sufijo de divulgación de IA en los subtítulos." })}</li>
            </ol>
            {tx({ de: "Inhalte, die irgendeine dieser Walls nicht passieren, werden automatisch blockiert. Versuche, diese Walls zu umgehen, gelten als Critical-Strike (siehe §6).", en: "Content that fails to pass any of these walls is automatically blocked. Attempts to bypass these walls count as a Critical Strike (see §6).", es: "El contenido que no supera alguno de estos muros se bloquea automáticamente. Los intentos de eludir estos muros cuentan como una infracción crítica (ver §6)." })}
          </Section>

          <Section title={tx({ de: "§6 Strike-System & Sanktionen", en: "§6 Strike system & sanctions", es: "§6 Sistema de infracciones y sanciones" })}>
            <div className="space-y-2">
              <p><strong>Soft-Strike</strong> {tx({ de: "(Eingabe oder Caption blockiert) — Hinweis im Cockpit, keine weiteren Folgen.", en: "(Input or caption blocked) — Note in cockpit, no further consequences.", es: "(Entrada o subtítulo bloqueado) — Nota en el cockpit, sin más consecuencias." })}</p>
              <p><strong>Hard-Strike</strong> {tx({ de: "(Generierungs- oder Render-Block: Deepfake-Hint, Copyright-Hint, prominente Person, geschützte IP) — zählt im Strike-Counter.", en: "(Generation or render block: deepfake hint, copyright hint, prominent person, protected IP) — counts in the strike counter.", es: "(Bloqueo de generación o renderizado: indicio de deepfake, indicio de copyright, persona prominente, propiedad intelectual protegida) — cuenta en el contador de infracciones." })}</p>
              <p><strong>Critical-Strike</strong> {tx({ de: "(Manipulationsversuch: Watermark-Removal, Filter-Bypass, gefälschte Origin-Daten, modifizierte API-Payloads, mehrfacher Hard-Strike-Wiederholung) — zählt doppelt und kann zur sofortigen Termination führen (siehe §7).", en: "(Attempted manipulation: watermark removal, filter bypass, fake origin data, modified API payloads, multiple hard-strike repetitions) — counts double and may lead to immediate termination (see §7).", es: "(Intento de manipulación: eliminación de marca de agua, bypass de filtro, datos de origen falsos, cargas útiles de API modificadas, repetición múltiple de infracciones graves) — cuenta doble y puede llevar a la terminación inmediata (ver §7)." })}</p>
            </div>
            <div className="mt-3 rounded-lg border border-border/60 bg-muted/30 p-3 text-sm space-y-1">
              <p>{tx({ de: "Strike 1 → Schriftliche Warnung per Mail.", en: "Strike 1 → Written warning via email.", es: "Infracción 1 → Advertencia escrita por correo electrónico." })}</p>
              <p>{tx({ de: "Strike 2 → 7 Tage Autopilot-Sperre + verpflichtendes Re-Onboarding.", en: "Strike 2 → 7-day Autopilot suspension + mandatory re-onboarding.", es: "Infracción 2 → Suspensión de Autopilot de 7 días + reincorporación obligatoria." })}</p>
              <p>{tx({ de: "Strike 3 → Autopilot dauerhaft für diesen Account gesperrt + Admin-Review.", en: "Strike 3 → Autopilot permanently blocked for this account + admin review.", es: "Infracción 3 → Autopilot bloqueado permanentemente para esta cuenta + revisión por administrador." })}</p>
            </div>
          </Section>

          <Section title={tx({ de: "§7 Fristlose Account-Löschung ohne Rückerstattung", en: "§7 Immediate account deletion without refund", es: "§7 Eliminación inmediata de la cuenta sin reembolso" })}>
            <Card className="bg-destructive/10 border-destructive/50 p-4 my-2">
              <div className="flex items-start gap-2">
                <Ban className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div className="text-sm space-y-2">
                  <p className="font-semibold text-destructive">
                    {tx({ de: "Folgende Verstöße führen zur sofortigen, fristlosen Löschung des gesamten Accounts ohne Anspruch auf Rückerstattung von Credits, laufenden Abonnements oder anderen Guthaben:", en: "The following violations lead to immediate deletion of the entire account without any claim to a refund of credits, running subscriptions, or other balances:", es: "Las siguientes infracciones conllevan la eliminación inmediata de toda la cuenta sin derecho a reembolso de créditos, suscripciones activas u otros saldos:" })}
                  </p>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>{tx({ de: "Versuch, ein Deepfake einer realen Person zu generieren (auch erfolgloser Versuch);", en: "Attempt to generate a deepfake of a real person (even unsuccessful attempt);", es: "Intento de generar un deepfake de una persona real (incluso intento fallido);" })}</li>
                    <li>{tx({ de: "Mehrfacher Versuch, denselben blockierten Prompt nach Block zu wiederholen;", en: "Repeated attempts to resubmit the same blocked prompt after being blocked;", es: "Intentos repetidos de volver a enviar el mismo prompt bloqueado después de ser bloqueado;" })}</li>
                    <li>{tx({ de: "Manipulation an unseren Systemen oder unautorisierte direkte API-Aufrufe mit modifizierten Payloads;", en: "Manipulation of our systems or unauthorized direct API calls with modified payloads;", es: "Manipulación de nuestros sistemas o llamadas directas no autorizadas a la API con cargas útiles modificadas;" })}</li>
                    <li>{tx({ de: "Einreichung von Assets mit gefälschten Origin-Daten (z.B. fremde Person als „Self-Portrait\" deklariert);", en: "Submitting assets with falsified origin data (e.g. declaring another person as a \"self-portrait\");", es: "Envío de recursos con datos de origen falsificados (por ejemplo, declarar a otra persona como \"autorretrato\");" })}</li>
                    <li>{tx({ de: "Veröffentlichungen, die nachweislich auf Plattformen wegen Copyright-Verletzung oder Identitätstäuschung gesperrt werden (DMCA-Eingang);", en: "Publications that are demonstrably blocked on platforms due to copyright infringement or identity deception (DMCA receipt);", es: "Publicaciones que son demostrablemente bloqueadas en plataformas debido a infracción de derechos de autor o suplantación de identidad (recepción DMCA);" })}</li>
                    <li>{tx({ de: "Nutzung des Autopilots zur Verbreitung von Hass, illegalen Inhalten oder zur Schädigung Dritter.", en: "Use of Autopilot to spread hate, illegal content, or to harm third parties.", es: "Uso de Autopilot para difundir odio, contenido ilegal o para dañar a terceros." })}</li>
                  </ul>
                </div>
              </div>
            </Card>
            <p>{tx({ de: "Im Falle einer Termination werden Beweise (Prompts, Renderings, Strikes, Consent-Log) für 90 Tage zur rechtlichen Verteidigung archiviert und anschließend gemäß DSGVO Art. 17 endgültig gelöscht. Du erhältst eine schriftliche Begründung mit Beweis-Hash und kannst innerhalb von 14 Tagen schriftlich Widerspruch einlegen (", en: "In case of termination, evidence (prompts, renderings, strikes, consent log) is archived for 90 days for legal defense purposes and then permanently deleted in accordance with GDPR Art. 17. You will receive a written justification with an evidence hash and can lodge a written objection within 14 days (", es: "En caso de terminación, las pruebas (prompts, renderizados, infracciones, registro de consentimiento) se archivan durante 90 días con fines de defensa legal y luego se eliminan permanentemente de conformidad con el artículo 17 del RGPD. Recibirás una justificación por escrito con un hash de evidencia y podrás presentar una objeción por escrito en un plazo de 14 días (" })}<Link to="/legal/character-takedown" className="text-primary underline">{tx({ de: "Kontakt", en: "Contact", es: "Contacto" })}</Link>).</p>
          </Section>

          <Section title={tx({ de: "§8 EU-AI-Act-Konformität & Audit", en: "§8 EU AI Act compliance & audit", es: "§8 Cumplimiento y auditoría de la Ley de IA de la UE" })}>
            {tx({ de: "Jede KI-Entscheidung des Autopilots wird in einem unveränderlichen Activity-Log mit Prompt, Output, QA-Score und Zeitstempel gespeichert (für mindestens 12 Monate). Du hast jederzeit Zugriff auf dein eigenes Log im Cockpit. Du erfüllst damit deine Transparenzpflicht ggü. Plattformen und Behörden.", en: "Every AI decision made by Autopilot is recorded in an immutable activity log with prompt, output, QA score, and timestamp (for at least 12 months). You have access to your own log in the cockpit at any time. This fulfills your transparency obligations to platforms and authorities.", es: "Cada decisión de IA tomada por Autopilot se registra en un registro de actividad inmutable con prompt, salida, puntuación de control de calidad y marca de tiempo (durante al menos 12 meses). Tienes acceso a tu propio registro en el cockpit en cualquier momento. Esto cumple con tus obligaciones de transparencia frente a plataformas y autoridades." })}
          </Section>

          <Section title={tx({ de: "§9 Disclosure-Pflicht", en: "§9 Disclosure obligation", es: "§9 Obligación de divulgación" })}>
            {tx({ de: "Alle vom Autopilot generierten Posts werden automatisch mit dem Hinweis „Made with AI · @useadtool\" in der Caption versehen sowie mit einem unsichtbaren C2PA-Provenance-Manifest in den Asset-Metadaten. Diese Markierungen dürfen nicht entfernt werden — siehe §6 (Critical-Strike).", en: "All posts generated by Autopilot are automatically labeled with \"Made with AI · @useadtool\" in the caption as well as an invisible C2PA provenance manifest in the asset metadata. These markings must not be removed — see §6 (Critical Strike).", es: "Todas las publicaciones generadas por Autopilot se etiquetan automáticamente con \"Made with AI · @useadtool\" en el subtítulo, así como con un manifiesto de procedencia C2PA invisible en los metadatos del recurso. Estas marcas no deben eliminarse — ver §6 (infracción crítica)." })}
          </Section>

          <Section title={tx({ de: "§10 Plattform-Konformität", en: "§10 Platform compliance", es: "§10 Cumplimiento de la plataforma" })}>
            {tx({ de: "Du versicherst, dass deine verbundenen Social-Media-Konten den jeweiligen Plattform-Richtlinien (Meta Platform Terms, TikTok Community Guidelines, X Developer Agreement etc.) entsprechen. Die Nutzung des Autopilots entbindet dich nicht von eigener Verantwortung für Plattform-konformes Verhalten.", en: "You warrant that your connected social media accounts comply with the respective platform policies (Meta Platform Terms, TikTok Community Guidelines, X Developer Agreement, etc.). Using Autopilot does not release you from your own responsibility for platform-compliant behavior.", es: "Garantizas que tus cuentas de redes sociales conectadas cumplen con las políticas de la plataforma correspondiente (Meta Platform Terms, TikTok Community Guidelines, X Developer Agreement, etc.). El uso de Autopilot no te exime de tu propia responsabilidad de comportarte de acuerdo con la plataforma." })}
          </Section>

          <div className="mt-8 flex items-center gap-2 text-xs text-muted-foreground">
            <FileText className="h-3.5 w-3.5" />
            {tx({ de: "Hash dieses Dokuments wird beim Akzeptieren mit Zeitstempel und IP-Hash unveränderlich in deinem Consent-Log abgelegt.", en: "This document's hash is immutably recorded in your consent log with timestamp and IP hash upon acceptance.", es: "El hash de este documento se registra de forma inmutable en tu registro de consentimiento con marca de tiempo y hash de IP al aceptarlo." })}
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
