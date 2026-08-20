import { tx } from "@/lib/i18nText";
import { LegalSection } from "./LegalSection";
import { ContactBox } from "./ContactBox";

interface PrivacyContentProps {
  lang: "de" | "en";
}

export const PrivacyContent = ({ lang }: PrivacyContentProps) => {
  if (lang === "de") {
    return (
      <div className="space-y-4">
        <LegalSection title="1. Verantwortlicher" icon="users" defaultOpen={true} index={0}>
          <div className="space-y-2">
            <p className="font-semibold text-foreground">AdTool AI</p>
            <p>Samuel Dusatko</p>
            <p>Bahnhofstraße 15a</p>
            <p>85221 Dachau, Germany</p>
            <div className="mt-4 pt-4 border-t border-white/10">
              <p><strong className="text-foreground">E-Mail:</strong> support@useadtool.ai</p>
              <p><strong className="text-foreground">Datenschutz:</strong> privacy@useadtool.ai</p>
            </div>
          </div>
        </LegalSection>

        <LegalSection title={tx({ de: "2. Datenerhebung und Verarbeitung", en: "2. Data collection and processing", es: "2. Recopilación y procesamiento de datos" })} icon="database" index={1}>
          <div className="space-y-4">
            <div>
              <h4 className="font-semibold text-foreground mb-2">2.1 Registrierungsdaten</h4>
              <ul className="list-disc list-inside space-y-1">
                <li>E-Mail-Adresse (Pflichtfeld)</li>
                <li>Name (optional)</li>
                <li>{tx({ de: "Passwort (verschlüsselt gespeichert)", en: "Password (saved encrypted)", es: "Contraseña (guardada cifrada)" })}</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-foreground mb-2">{tx({ de: "2.2 Social Media Daten (mit Ihrer Einwilligung)", en: "2.2 Social media data (with your consent)", es: "2.2 Datos de redes sociales (con su consentimiento)" })}</h4>
              <ul className="list-disc list-inside space-y-1">
                <li><strong>Instagram:</strong> {tx({ de: "Posts, Bilder, Videos, Metriken, Follower-Daten", en: "Posts, images, videos, metrics, follower data", es: "Publicaciones, imágenes, videos, métricas, datos de seguidores." })}</li>
                <li><strong>Facebook:</strong> Seiten-Informationen, Post-Performance, Insights</li>
                <li><strong>TikTok:</strong> Videos, Metriken, Kommentare, Engagement-Daten</li>
                <li><strong>YouTube:</strong> Video-Metadaten, Kanal-Statistiken, Kommentare</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-foreground mb-2">2.3 Nutzungsdaten</h4>
              <ul className="list-disc list-inside space-y-1">
                <li>Verwendete Features (Caption Generator, Analytics, Calendar)</li>
                <li>IP-Adresse (anonymisiert nach 7 Tagen)</li>
                <li>{tx({ de: "Browser-Informationen und Gerätetyp", en: "Browser information and device type", es: "Información del navegador y tipo de dispositivo" })}</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-foreground mb-2">2.4 Zahlungsdaten</h4>
              <ul className="list-disc list-inside space-y-1">
                <li>Kreditkarteninformationen (verarbeitet durch Stripe)</li>
                <li>{tx({ de: "Rechnungsdaten und Transaktionshistorie", en: "Billing information and transaction history", es: "Información de facturación e historial de transacciones" })}</li>
              </ul>
            </div>
          </div>
        </LegalSection>

        <LegalSection title="3. Rechtsgrundlagen (DSGVO)" icon="scale" index={2}>
          <ul className="list-disc list-inside space-y-2">
            <li><strong className="text-foreground">Art. 6 Abs. 1 lit. a DSGVO:</strong> {tx({ de: "Einwilligung für Social Media API-Zugriff", en: "Consent for social media API access", es: "Consentimiento para el acceso a la API de redes sociales" })}</li>
            <li><strong className="text-foreground">Art. 6 Abs. 1 lit. b DSGVO:</strong> Vertragserfüllung (Bereitstellung unserer Services)</li>
            <li><strong className="text-foreground">Art. 6 Abs. 1 lit. f DSGVO:</strong> {tx({ de: "Berechtigtes Interesse für Analytics und Sicherheit", en: "Legitimate interest for analytics and security", es: "Interés legítimo para análisis y seguridad" })}</li>
          </ul>
        </LegalSection>

        <LegalSection title={tx({ de: "4. Zweck der Datenverarbeitung", en: "4. Purpose of data processing", es: "4. Finalidad del tratamiento de datos" })} icon="shield" index={3}>
          <ul className="list-disc list-inside space-y-2">
            <li><strong className="text-foreground">Service-Bereitstellung:</strong> Caption-Generierung, Analytics, Scheduling</li>
            <li><strong className="text-foreground">Personalisierung:</strong> {tx({ de: "Empfehlungen basierend auf Ihrer Nutzung", en: "Recommendations based on your usage", es: "Recomendaciones basadas en su uso" })}</li>
            <li><strong className="text-foreground">Analytics:</strong> {tx({ de: "Verbesserung unserer AI-Modelle und Features", en: "Improving our AI models and features", es: "Mejorando nuestros modelos y características de IA" })}</li>
            <li><strong className="text-foreground">Support:</strong> Beantwortung von Anfragen</li>
            <li><strong className="text-foreground">Zahlungsabwicklung:</strong> Über Stripe</li>
          </ul>
        </LegalSection>

        <LegalSection title={tx({ de: "5. Drittanbieter und Datenübermittlung", en: "5. Third Party Providers and Data Transfer", es: "5. Proveedores externos y transferencia de datos" })} icon="globe" index={4}>
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-muted/30 border border-white/5">
              <h4 className="font-semibold text-foreground mb-1">Meta (Facebook & Instagram)</h4>
              <p className="text-sm">Abruf von Post-Metriken, Insights, Publishing</p>
              <a href="https://www.facebook.com/privacy/policy" target="_blank" rel="noopener noreferrer" className="text-sm text-cyan-400 hover:text-cyan-300">→ Datenschutz</a>
            </div>
            <div className="p-3 rounded-lg bg-muted/30 border border-white/5">
              <h4 className="font-semibold text-foreground mb-1">TikTok For Business API</h4>
              <p className="text-sm">Video-Analytics, Kommentare, Engagement-Metriken</p>
              <a href="https://www.tiktok.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-sm text-cyan-400 hover:text-cyan-300">→ Datenschutz</a>
            </div>
            <div className="p-3 rounded-lg bg-muted/30 border border-white/5">
              <h4 className="font-semibold text-foreground mb-1">YouTube Data API v3</h4>
              <p className="text-sm">Kanal-Statistiken, Video-Performance</p>
              <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-sm text-cyan-400 hover:text-cyan-300">→ Datenschutz</a>
            </div>
            <div className="p-3 rounded-lg bg-muted/30 border border-white/5">
              <h4 className="font-semibold text-foreground mb-1">Supabase (EU Frankfurt)</h4>
              <p className="text-sm">Sichere Speicherung aller Daten • SOC 2 Type II, ISO 27001</p>
              <a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer" className="text-sm text-cyan-400 hover:text-cyan-300">→ Datenschutz</a>
            </div>
            <div className="p-3 rounded-lg bg-muted/30 border border-white/5">
              <h4 className="font-semibold text-foreground mb-1">Stripe (Zahlungen)</h4>
              <p className="text-sm">Kreditkartenzahlungen, Aboverwaltung • PCI-DSS Level 1</p>
              <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer" className="text-sm text-cyan-400 hover:text-cyan-300">→ Datenschutz</a>
            </div>
          </div>
        </LegalSection>

        <LegalSection title="6. Speicherdauer" icon="database" index={5}>
          <ul className="list-disc list-inside space-y-2">
            <li><strong className="text-foreground">Aktive Konten:</strong> Solange Ihr Account existiert</li>
            <li><strong className="text-foreground">Gelöschte Konten:</strong> {tx({ de: "30 Tage Backup, dann permanente Löschung", en: "30 days backup, then permanent deletion", es: "Copia de seguridad de 30 días, luego eliminación permanente" })}</li>
            <li><strong className="text-foreground">Rechnungsdaten:</strong> 10 Jahre (§ 147 AO)</li>
            <li><strong className="text-foreground">Social Media Token:</strong> {tx({ de: "Bis zum Widerruf", en: "Until revoked", es: "Hasta que sea revocado" })}</li>
          </ul>
        </LegalSection>

        <LegalSection title={tx({ de: "7. Ihre Rechte (Art. 15-22 DSGVO)", en: "7. Your Rights (Art. 15-22 GDPR)", es: "7. Sus derechos (Art. 15-22 RGPD)" })} icon="shield" index={6}>
          <div className="space-y-3">
            <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
              <h4 className="font-semibold text-foreground">Auskunftsrecht (Art. 15)</h4>
              <p className="text-sm">{tx({ de: "Jederzeit Auskunft über Ihre gespeicherten Daten", en: "Information about your stored data at any time", es: "Información sobre sus datos almacenados en cualquier momento" })}</p>
            </div>
            <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
              <h4 className="font-semibold text-foreground">Berichtigungsrecht (Art. 16)</h4>
              <p className="text-sm">{tx({ de: "Korrektur falscher Daten im Account-Bereich", en: "Correction of incorrect data in the account area", es: "Corrección de datos incorrectos en el área de la cuenta" })}</p>
            </div>
            <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
              <h4 className="font-semibold text-foreground">Löschungsrecht (Art. 17)</h4>
              <p className="text-sm">{tx({ de: "Konto jederzeit unter", en: "Account at any time under", es: "Cuenta en cualquier momento en" })} <a href="/delete-data" className="text-cyan-400 hover:text-cyan-300">/delete-data</a> löschen</p>
            </div>
            <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
              <h4 className="font-semibold text-foreground">Datenübertragbarkeit (Art. 20)</h4>
              <p className="text-sm">{tx({ de: "Export Ihrer Daten als JSON unter Account → Export", en: "Export your data as JSON under Account → Export", es: "Exporte sus datos como JSON en Cuenta → Exportar" })}</p>
            </div>
            <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
              <h4 className="font-semibold text-foreground">Widerspruchsrecht (Art. 21)</h4>
              <p className="text-sm">{tx({ de: "Jederzeit Widerspruch gegen die Verarbeitung", en: "Object to processing at any time", es: "Oponerse al tratamiento en cualquier momento" })}</p>
            </div>
          </div>
        </LegalSection>

        <LegalSection title={tx({ de: "8. Cookies und Tracking", en: "8. Cookies and Tracking", es: "8. Cookies y seguimiento" })} icon="cookie" index={7}>
          <div className="space-y-4">
            <div>
              <h4 className="font-semibold text-foreground mb-2">Essenzielle Cookies (immer aktiv)</h4>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>Authentifizierung: Supabase Auth Token</li>
                <li>Spracheinstellung: Browser-Locale</li>
                <li>{tx({ de: "Cookie-Consent: Ihre Cookie-Präferenzen", en: "Cookie consent: your cookie preferences", es: "Consentimiento de cookies: sus preferencias de cookies" })}</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-foreground mb-2">Analytics Cookies (Opt-In)</h4>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>{tx({ de: "Google Analytics (nur mit Zustimmung)", en: "Google Analytics (only with consent)", es: "Google Analytics (solo con consentimiento)" })}</li>
                <li>IP-Anonymisierung aktiviert</li>
                <li>{tx({ de: "Deaktivierung über Cookie-Banner", en: "Deactivation via cookie banner", es: "Desactivación mediante banner de cookies" })}</li>
              </ul>
            </div>
          </div>
        </LegalSection>

        <LegalSection title="9. Datensicherheit" icon="lock" index={8}>
          <ul className="list-disc list-inside space-y-2">
            <li><strong className="text-foreground">Verschlüsselung:</strong> {tx({ de: "TLS 1.3 für alle Übertragungen", en: "TLS 1.3 for all transmissions", es: "TLS 1.3 para todas las transmisiones" })}</li>
            <li><strong className="text-foreground">Passwörter:</strong> {tx({ de: "Bcrypt-Hash mit Salt", en: "Bcrypt hash with salt", es: "Hachís Bcrypt con sal" })}</li>
            <li><strong className="text-foreground">API-Token:</strong> Verschlüsselt in EU-Datenbank</li>
            <li><strong className="text-foreground">Zugriffskontrolle:</strong> Row Level Security (RLS)</li>
            <li><strong className="text-foreground">Backups:</strong> Tägliche verschlüsselte Backups</li>
            <li><strong className="text-foreground">Monitoring:</strong> 24/7 Security-Monitoring</li>
          </ul>
        </LegalSection>

        <LegalSection title="10. Internationale Datenübermittlung" icon="globe" index={9}>
          <p className="mb-3">{tx({ de: "Daten werden primär in der EU verarbeitet. Ausnahmen:", en: "Data is primarily processed in the EU. Exceptions:", es: "Los datos se procesan principalmente en la UE. Excepciones:" })}</p>
          <ul className="list-disc list-inside space-y-2">
            <li><strong className="text-foreground">Stripe (USA):</strong> EU-US Data Privacy Framework</li>
            <li><strong className="text-foreground">Meta/Google API:</strong> {tx({ de: "Daten nur auf Anfrage abgerufen", en: "Data only accessed upon request", es: "Sólo se accede a los datos previa solicitud" })}</li>
          </ul>
        </LegalSection>

        <LegalSection title={tx({ de: "11. Kinder unter 16 Jahren", en: "11. Children under 16 years old", es: "11. Niños menores de 16 años" })} icon="users" index={10}>
          <p>{tx({ de: "Unser Service richtet sich nicht an Personen unter 16 Jahren. Sollten wir feststellen, dass ein Minderjähriger ohne elterliche Zustimmung ein Konto erstellt hat, löschen wir dieses unverzüglich.", en: "Our service is not intended for persons under 16 years of age. Should we discover that a minor has created an account without parental consent, we will delete it immediately.", es: "Nuestro servicio no está dirigido a personas menores de 16 años. Si descubrimos que un menor ha creado una cuenta sin el consentimiento de sus padres, la eliminaremos de inmediato." })}</p>
        </LegalSection>

        <LegalSection title={tx({ de: "12. Änderungen der Datenschutzerklärung", en: "12. Changes to the privacy policy", es: "12. Cambios en la política de privacidad" })} icon="alert" index={11}>
          <p>{tx({ de: "Wir behalten uns vor, diese Datenschutzerklärung anzupassen. Wesentliche Änderungen werden Ihnen per E-Mail mitgeteilt.", en: "We reserve the right to amend this privacy policy. Significant changes will be communicated to you via email.", es: "Nos reservamos el derecho de modificar esta política de privacidad. Los cambios significativos se le comunicarán por correo electrónico." })}</p>
        </LegalSection>

        <ContactBox lang="de" />
      </div>
    );
  }

  // English version
  return (
    <div className="space-y-4">
      <LegalSection title="1. Controller" icon="users" defaultOpen={true} index={0}>
        <div className="space-y-2">
          <p className="font-semibold text-foreground">AdTool AI</p>
          <p>Samuel Dusatko</p>
          <p>Bahnhofstraße 15a</p>
          <p>85221 Dachau, Germany</p>
          <div className="mt-4 pt-4 border-t border-white/10">
            <p><strong className="text-foreground">Email:</strong> support@useadtool.ai</p>
            <p><strong className="text-foreground">Privacy:</strong> privacy@useadtool.ai</p>
          </div>
        </div>
      </LegalSection>

      <LegalSection title="2. Data Collection and Processing" icon="database" index={1}>
        <div className="space-y-4">
          <div>
            <h4 className="font-semibold text-foreground mb-2">2.1 Registration Data</h4>
            <ul className="list-disc list-inside space-y-1">
              <li>Email address (required)</li>
              <li>Name (optional)</li>
              <li>Password (encrypted)</li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-foreground mb-2">2.2 Social Media Data (with your consent)</h4>
            <ul className="list-disc list-inside space-y-1">
              <li><strong>Instagram:</strong> Posts, images, videos, metrics, follower data</li>
              <li><strong>Facebook:</strong> Page information, post performance, insights</li>
              <li><strong>TikTok:</strong> Videos, metrics, comments, engagement data</li>
              <li><strong>YouTube:</strong> Video metadata, channel statistics, comments</li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-foreground mb-2">2.3 Usage Data</h4>
            <ul className="list-disc list-inside space-y-1">
              <li>Features used (Caption Generator, Analytics, Calendar)</li>
              <li>IP address (anonymized after 7 days)</li>
              <li>Browser information and device type</li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-foreground mb-2">2.4 Payment Data</h4>
            <ul className="list-disc list-inside space-y-1">
              <li>Credit card information (processed by Stripe)</li>
              <li>Billing data and transaction history</li>
            </ul>
          </div>
        </div>
      </LegalSection>

      <LegalSection title="3. Legal Basis (GDPR)" icon="scale" index={2}>
        <ul className="list-disc list-inside space-y-2">
          <li><strong className="text-foreground">Art. 6(1)(a) GDPR:</strong> Consent for social media API access</li>
          <li><strong className="text-foreground">Art. 6(1)(b) GDPR:</strong> Contract fulfillment (service provision)</li>
          <li><strong className="text-foreground">Art. 6(1)(f) GDPR:</strong> Legitimate interest for analytics and security</li>
        </ul>
      </LegalSection>

      <LegalSection title="4. Purpose of Data Processing" icon="shield" index={3}>
        <ul className="list-disc list-inside space-y-2">
          <li><strong className="text-foreground">Service Provision:</strong> Caption generation, analytics, scheduling</li>
          <li><strong className="text-foreground">Personalization:</strong> Recommendations based on your usage</li>
          <li><strong className="text-foreground">Analytics:</strong> Improving our AI models and features</li>
          <li><strong className="text-foreground">Support:</strong> Answering inquiries</li>
          <li><strong className="text-foreground">Payment Processing:</strong> Via Stripe</li>
        </ul>
      </LegalSection>

      <LegalSection title="5. Third-Party Processors" icon="globe" index={4}>
        <div className="space-y-4">
          <div className="p-3 rounded-lg bg-muted/30 border border-white/5">
            <h4 className="font-semibold text-foreground mb-1">Meta (Facebook & Instagram)</h4>
            <p className="text-sm">Retrieving post metrics, insights, publishing</p>
            <a href="https://www.facebook.com/privacy/policy" target="_blank" rel="noopener noreferrer" className="text-sm text-cyan-400 hover:text-cyan-300">→ Privacy Policy</a>
          </div>
          <div className="p-3 rounded-lg bg-muted/30 border border-white/5">
            <h4 className="font-semibold text-foreground mb-1">TikTok For Business API</h4>
            <p className="text-sm">Video analytics, comments, engagement metrics</p>
            <a href="https://www.tiktok.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-sm text-cyan-400 hover:text-cyan-300">→ Privacy Policy</a>
          </div>
          <div className="p-3 rounded-lg bg-muted/30 border border-white/5">
            <h4 className="font-semibold text-foreground mb-1">YouTube Data API v3</h4>
            <p className="text-sm">Channel statistics, video performance</p>
            <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-sm text-cyan-400 hover:text-cyan-300">→ Privacy Policy</a>
          </div>
          <div className="p-3 rounded-lg bg-muted/30 border border-white/5">
            <h4 className="font-semibold text-foreground mb-1">Supabase (EU Frankfurt)</h4>
            <p className="text-sm">Secure data storage • SOC 2 Type II, ISO 27001</p>
            <a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer" className="text-sm text-cyan-400 hover:text-cyan-300">→ Privacy Policy</a>
          </div>
          <div className="p-3 rounded-lg bg-muted/30 border border-white/5">
            <h4 className="font-semibold text-foreground mb-1">Stripe (Payments)</h4>
            <p className="text-sm">Credit card payments, subscriptions • PCI-DSS Level 1</p>
            <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer" className="text-sm text-cyan-400 hover:text-cyan-300">→ Privacy Policy</a>
          </div>
        </div>
      </LegalSection>

      <LegalSection title="6. Retention Period" icon="database" index={5}>
        <ul className="list-disc list-inside space-y-2">
          <li><strong className="text-foreground">Active Accounts:</strong> As long as account exists</li>
          <li><strong className="text-foreground">Deleted Accounts:</strong> 30-day backup, then permanent deletion</li>
          <li><strong className="text-foreground">Invoice Data:</strong> 10 years (German tax law)</li>
          <li><strong className="text-foreground">Social Media Tokens:</strong> Until revoked</li>
        </ul>
      </LegalSection>

      <LegalSection title="7. Your Rights (Art. 15-22 GDPR)" icon="shield" index={6}>
        <div className="space-y-3">
          <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
            <h4 className="font-semibold text-foreground">Right of Access (Art. 15)</h4>
            <p className="text-sm">Request information about your stored data</p>
          </div>
          <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
            <h4 className="font-semibold text-foreground">Right to Rectification (Art. 16)</h4>
            <p className="text-sm">Correct incorrect data in your account settings</p>
          </div>
          <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
            <h4 className="font-semibold text-foreground">Right to Erasure (Art. 17)</h4>
            <p className="text-sm">Delete your account at <a href="/delete-data" className="text-cyan-400 hover:text-cyan-300">/delete-data</a></p>
          </div>
          <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
            <h4 className="font-semibold text-foreground">Right to Data Portability (Art. 20)</h4>
            <p className="text-sm">Export your data as JSON under Account → Export</p>
          </div>
          <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
            <h4 className="font-semibold text-foreground">Right to Object (Art. 21)</h4>
            <p className="text-sm">Object to processing at any time</p>
          </div>
        </div>
      </LegalSection>

      <LegalSection title="8. Cookies and Tracking" icon="cookie" index={7}>
        <div className="space-y-4">
          <div>
            <h4 className="font-semibold text-foreground mb-2">Essential Cookies (always active)</h4>
            <ul className="list-disc list-inside space-y-1 text-sm">
              <li>Authentication: Supabase Auth Token</li>
              <li>Language Setting: Browser Locale</li>
              <li>Cookie Consent: Your cookie preferences</li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-foreground mb-2">Analytics Cookies (Opt-In)</h4>
            <ul className="list-disc list-inside space-y-1 text-sm">
              <li>Google Analytics (only with consent)</li>
              <li>IP Anonymization enabled</li>
              <li>Disable via cookie banner</li>
            </ul>
          </div>
        </div>
      </LegalSection>

      <LegalSection title="9. Data Security" icon="lock" index={8}>
        <ul className="list-disc list-inside space-y-2">
          <li><strong className="text-foreground">Encryption:</strong> TLS 1.3 for all transmissions</li>
          <li><strong className="text-foreground">Passwords:</strong> Bcrypt hash with salt</li>
          <li><strong className="text-foreground">API Tokens:</strong> Encrypted in EU database</li>
          <li><strong className="text-foreground">Access Control:</strong> Row Level Security (RLS)</li>
          <li><strong className="text-foreground">Backups:</strong> Daily encrypted backups</li>
          <li><strong className="text-foreground">Monitoring:</strong> 24/7 security monitoring</li>
        </ul>
      </LegalSection>

      <LegalSection title="10. International Data Transfer" icon="globe" index={9}>
        <p className="mb-3">Data is primarily processed within the EU. Exceptions:</p>
        <ul className="list-disc list-inside space-y-2">
          <li><strong className="text-foreground">Stripe (USA):</strong> EU-US Data Privacy Framework</li>
          <li><strong className="text-foreground">Meta/Google API:</strong> Data retrieved on request only</li>
        </ul>
      </LegalSection>

      <LegalSection title="11. Children Under 16" icon="users" index={10}>
        <p>Our service is not intended for persons under 16. If we discover that a minor has created an account without parental consent, we will delete it immediately.</p>
      </LegalSection>

      <LegalSection title="12. Changes to Privacy Policy" icon="alert" index={11}>
        <p>We reserve the right to update this privacy policy. Significant changes will be communicated via email.</p>
      </LegalSection>

      <ContactBox lang="en" />
    </div>
  );
};
