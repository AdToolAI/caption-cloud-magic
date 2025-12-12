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

        <LegalSection title="2. Datenerhebung und Verarbeitung" icon="database" index={1}>
          <div className="space-y-4">
            <div>
              <h4 className="font-semibold text-foreground mb-2">2.1 Registrierungsdaten</h4>
              <ul className="list-disc list-inside space-y-1">
                <li>E-Mail-Adresse (Pflichtfeld)</li>
                <li>Name (optional)</li>
                <li>Passwort (verschlüsselt gespeichert)</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-foreground mb-2">2.2 Social Media Daten (mit Ihrer Einwilligung)</h4>
              <ul className="list-disc list-inside space-y-1">
                <li><strong>Instagram:</strong> Posts, Bilder, Videos, Metriken, Follower-Daten</li>
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
                <li>Browser-Informationen und Gerätetyp</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-foreground mb-2">2.4 Zahlungsdaten</h4>
              <ul className="list-disc list-inside space-y-1">
                <li>Kreditkarteninformationen (verarbeitet durch Stripe)</li>
                <li>Rechnungsdaten und Transaktionshistorie</li>
              </ul>
            </div>
          </div>
        </LegalSection>

        <LegalSection title="3. Rechtsgrundlagen (DSGVO)" icon="scale" index={2}>
          <ul className="list-disc list-inside space-y-2">
            <li><strong className="text-foreground">Art. 6 Abs. 1 lit. a DSGVO:</strong> Einwilligung für Social Media API-Zugriff</li>
            <li><strong className="text-foreground">Art. 6 Abs. 1 lit. b DSGVO:</strong> Vertragserfüllung (Bereitstellung unserer Services)</li>
            <li><strong className="text-foreground">Art. 6 Abs. 1 lit. f DSGVO:</strong> Berechtigtes Interesse für Analytics und Sicherheit</li>
          </ul>
        </LegalSection>

        <LegalSection title="4. Zweck der Datenverarbeitung" icon="shield" index={3}>
          <ul className="list-disc list-inside space-y-2">
            <li><strong className="text-foreground">Service-Bereitstellung:</strong> Caption-Generierung, Analytics, Scheduling</li>
            <li><strong className="text-foreground">Personalisierung:</strong> Empfehlungen basierend auf Ihrer Nutzung</li>
            <li><strong className="text-foreground">Analytics:</strong> Verbesserung unserer AI-Modelle und Features</li>
            <li><strong className="text-foreground">Support:</strong> Beantwortung von Anfragen</li>
            <li><strong className="text-foreground">Zahlungsabwicklung:</strong> Über Stripe</li>
          </ul>
        </LegalSection>

        <LegalSection title="5. Drittanbieter und Datenübermittlung" icon="globe" index={4}>
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
            <li><strong className="text-foreground">Gelöschte Konten:</strong> 30 Tage Backup, dann permanente Löschung</li>
            <li><strong className="text-foreground">Rechnungsdaten:</strong> 10 Jahre (§ 147 AO)</li>
            <li><strong className="text-foreground">Social Media Token:</strong> Bis zum Widerruf</li>
          </ul>
        </LegalSection>

        <LegalSection title="7. Ihre Rechte (Art. 15-22 DSGVO)" icon="shield" index={6}>
          <div className="space-y-3">
            <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
              <h4 className="font-semibold text-foreground">Auskunftsrecht (Art. 15)</h4>
              <p className="text-sm">Jederzeit Auskunft über Ihre gespeicherten Daten</p>
            </div>
            <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
              <h4 className="font-semibold text-foreground">Berichtigungsrecht (Art. 16)</h4>
              <p className="text-sm">Korrektur falscher Daten im Account-Bereich</p>
            </div>
            <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
              <h4 className="font-semibold text-foreground">Löschungsrecht (Art. 17)</h4>
              <p className="text-sm">Konto jederzeit unter <a href="/delete-data" className="text-cyan-400 hover:text-cyan-300">/delete-data</a> löschen</p>
            </div>
            <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
              <h4 className="font-semibold text-foreground">Datenübertragbarkeit (Art. 20)</h4>
              <p className="text-sm">Export Ihrer Daten als JSON unter Account → Export</p>
            </div>
            <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
              <h4 className="font-semibold text-foreground">Widerspruchsrecht (Art. 21)</h4>
              <p className="text-sm">Jederzeit Widerspruch gegen die Verarbeitung</p>
            </div>
          </div>
        </LegalSection>

        <LegalSection title="8. Cookies und Tracking" icon="cookie" index={7}>
          <div className="space-y-4">
            <div>
              <h4 className="font-semibold text-foreground mb-2">Essenzielle Cookies (immer aktiv)</h4>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>Authentifizierung: Supabase Auth Token</li>
                <li>Spracheinstellung: Browser-Locale</li>
                <li>Cookie-Consent: Ihre Cookie-Präferenzen</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-foreground mb-2">Analytics Cookies (Opt-In)</h4>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>Google Analytics (nur mit Zustimmung)</li>
                <li>IP-Anonymisierung aktiviert</li>
                <li>Deaktivierung über Cookie-Banner</li>
              </ul>
            </div>
          </div>
        </LegalSection>

        <LegalSection title="9. Datensicherheit" icon="lock" index={8}>
          <ul className="list-disc list-inside space-y-2">
            <li><strong className="text-foreground">Verschlüsselung:</strong> TLS 1.3 für alle Übertragungen</li>
            <li><strong className="text-foreground">Passwörter:</strong> Bcrypt-Hash mit Salt</li>
            <li><strong className="text-foreground">API-Token:</strong> Verschlüsselt in EU-Datenbank</li>
            <li><strong className="text-foreground">Zugriffskontrolle:</strong> Row Level Security (RLS)</li>
            <li><strong className="text-foreground">Backups:</strong> Tägliche verschlüsselte Backups</li>
            <li><strong className="text-foreground">Monitoring:</strong> 24/7 Security-Monitoring</li>
          </ul>
        </LegalSection>

        <LegalSection title="10. Internationale Datenübermittlung" icon="globe" index={9}>
          <p className="mb-3">Daten werden primär in der EU verarbeitet. Ausnahmen:</p>
          <ul className="list-disc list-inside space-y-2">
            <li><strong className="text-foreground">Stripe (USA):</strong> EU-US Data Privacy Framework</li>
            <li><strong className="text-foreground">Meta/Google API:</strong> Daten nur auf Anfrage abgerufen</li>
          </ul>
        </LegalSection>

        <LegalSection title="11. Kinder unter 16 Jahren" icon="users" index={10}>
          <p>Unser Service richtet sich nicht an Personen unter 16 Jahren. Sollten wir feststellen, dass ein Minderjähriger ohne elterliche Zustimmung ein Konto erstellt hat, löschen wir dieses unverzüglich.</p>
        </LegalSection>

        <LegalSection title="12. Änderungen der Datenschutzerklärung" icon="alert" index={11}>
          <p>Wir behalten uns vor, diese Datenschutzerklärung anzupassen. Wesentliche Änderungen werden Ihnen per E-Mail mitgeteilt.</p>
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
