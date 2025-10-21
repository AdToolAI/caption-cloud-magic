import { useParams } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslation } from "@/hooks/useTranslation";
import { SEO } from "@/components/SEO";
import { getCanonicalUrl } from "@/config/seo";
import { Separator } from "@/components/ui/separator";

const Legal = () => {
  const { page } = useParams<{ page: string }>();
  const { language } = useTranslation();
  
  // Support direct routes /privacy and /terms (for TikTok OAuth)
  const location = window.location.pathname;
  const actualPage = page || (location === '/privacy' ? 'privacy' : location === '/terms' ? 'terms' : null);

  const content = {
    imprint: {
      en: {
        title: "Imprint",
        content: `
# Legal Information

## Company Details
CaptionGenie  
[Your Company Name]  
[Your Address]  
[City, Postal Code]  
[Country]

## Contact
Email: support@captiongenie.app  
Phone: [Your Phone]

## Responsible for content
[Your Name]  
[Your Position]

## Dispute Resolution
The European Commission provides a platform for online dispute resolution (ODR): https://ec.europa.eu/consumers/odr

## Liability for Content
We are not obligated to monitor transmitted or stored third-party information or to investigate circumstances that indicate illegal activity.
        `
      },
      de: {
        title: "Impressum",
        content: `
# Impressum

## Angaben gemäß § 5 TMG
AdTool AI  
Samuel Dusatko  
Bahnhofstraße 15a  
85221 Dachau  
Germany

## Kontakt
E-Mail: support@useadtool.ai  
Datenschutz: privacy@useadtool.ai

## Verantwortlich für den Inhalt
Samuel Dusatko  
Geschäftsführer

## Streitschlichtung
Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS) bereit: https://ec.europa.eu/consumers/odr

Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.

## Haftung für Inhalte
Als Diensteanbieter sind wir gemäß § 7 Abs.1 TMG für eigene Inhalte auf diesen Seiten nach den allgemeinen Gesetzen verantwortlich. Nach §§ 8 bis 10 TMG sind wir als Diensteanbieter jedoch nicht verpflichtet, übermittelte oder gespeicherte fremde Informationen zu überwachen oder nach Umständen zu forschen, die auf eine rechtswidrige Tätigkeit hinweisen.
        `
      },
      es: {
        title: "Información legal",
        content: `
# Información Legal

## Detalles de la empresa
CaptionGenie  
[Nombre de su empresa]  
[Su dirección]  
[Ciudad, Código postal]  
[País]

## Contacto
Correo: support@captiongenie.app  
Teléfono: [Su teléfono]

## Responsable del contenido
[Su nombre]  
[Su cargo]

## Resolución de disputas
La Comisión Europea proporciona una plataforma para la resolución de disputas en línea (RDL): https://ec.europa.eu/consumers/odr

## Responsabilidad por el contenido
No estamos obligados a supervisar la información de terceros transmitida o almacenada ni a investigar circunstancias que indiquen actividad ilegal.
        `
      }
    },
    privacy: {
      bilingual: true,
      en: {
        title: "Privacy Policy | Datenschutzerklärung",
        content: ""
      },
      de: {
        title: "Privacy Policy | Datenschutzerklärung",
        content: `
**Letzte Aktualisierung: 18. Oktober 2025**

---

## 🇩🇪 DEUTSCHE VERSION

### 1. Verantwortlicher
AdTool AI  
Samuel Dusatko  
Bahnhofstraße 15a  
85221 Dachau  
Germany

**Kontakt:**  
E-Mail: support@useadtool.ai  
Datenschutz: privacy@useadtool.ai

### 2. Datenerhebung und Verarbeitung

Wir erheben und verarbeiten folgende personenbezogene Daten gemäß DSGVO:

#### 2.1 Registrierungsdaten
- E-Mail-Adresse (Pflichtfeld)
- Name (optional)
- Passwort (verschlüsselt gespeichert)

#### 2.2 Social Media Daten (mit Ihrer Einwilligung)
- **Instagram**: Posts, Bilder, Videos, Metriken (Likes, Kommentare, Reichweite), Follower-Daten
- **Facebook**: Seiten-Informationen, Post-Performance, Insights, Page Access Token
- **TikTok**: Videos, Metriken, Kommentare, Engagement-Daten über TikTok For Business API
- **YouTube**: Video-Metadaten, Kanal-Statistiken, Kommentare über YouTube Data API v3

#### 2.3 Nutzungsdaten
- Verwendete Features (Caption Generator, Analytics, Calendar)
- Zeitstempel der Nutzung
- IP-Adresse (anonymisiert nach 7 Tagen)
- Browser-Informationen (User-Agent)
- Gerätetyp (Desktop, Mobile)

#### 2.4 Zahlungsdaten
- Kreditkarteninformationen (verarbeitet ausschließlich durch Stripe, nicht bei uns gespeichert)
- Rechnungsdaten (Name, Adresse)
- Transaktionshistorie

#### 2.5 KI-generierte Inhalte
- Von Ihnen eingegebene Prompts
- Generierte Captions, Hooks, Scripts
- Hochgeladene Bilder für AI-Analyse

### 3. Rechtsgrundlagen (DSGVO)

Die Verarbeitung Ihrer Daten erfolgt auf Basis folgender Rechtsgrundlagen:

- **Art. 6 Abs. 1 lit. a DSGVO**: Einwilligung für Social Media API-Zugriff
- **Art. 6 Abs. 1 lit. b DSGVO**: Vertragserfüllung (Bereitstellung unserer Services)
- **Art. 6 Abs. 1 lit. f DSGVO**: Berechtigtes Interesse für Analytics und Sicherheit

### 4. Zweck der Datenverarbeitung

Ihre Daten werden verwendet für:

- **Service-Bereitstellung**: Caption-Generierung, Analytics, Scheduling
- **Personalisierung**: Empfehlungen basierend auf Ihrer Nutzung
- **Analytics**: Verbesserung unserer AI-Modelle und Features
- **Support**: Beantwortung von Anfragen
- **Zahlungsabwicklung**: Über Stripe
- **Rechtliche Verpflichtungen**: Aufbewahrung von Rechnungen gemäß § 147 AO

### 5. Drittanbieter und Datenübermittlung

#### 5.1 Meta (Facebook & Instagram)
- **Zweck**: Abruf von Post-Metriken, Insights, Publishing
- **Datenschutz**: https://www.facebook.com/privacy/policy
- **Rechtsgrundlage**: Einwilligung (Art. 6 Abs. 1 lit. a DSGVO)

#### 5.2 TikTok
- **API**: TikTok For Business API
- **Zweck**: Video-Analytics, Kommentare, Engagement-Metriken
- **Datenschutz**: https://www.tiktok.com/legal/privacy-policy
- **Rechtsgrundlage**: Einwilligung (Art. 6 Abs. 1 lit. a DSGVO)

#### 5.3 Google (YouTube)
- **API**: YouTube Data API v3
- **Zweck**: Kanal-Statistiken, Video-Performance
- **Datenschutz**: https://policies.google.com/privacy
- **Rechtsgrundlage**: Einwilligung (Art. 6 Abs. 1 lit. a DSGVO)

#### 5.4 Supabase (Datenspeicherung)
- **Standort**: EU (Frankfurt, Deutschland)
- **Zweck**: Sichere Speicherung aller Daten
- **Zertifizierung**: SOC 2 Type II, ISO 27001
- **Datenschutz**: https://supabase.com/privacy

#### 5.5 Stripe (Zahlungsabwicklung)
- **Zweck**: Kreditkartenzahlungen, Aboverwaltung
- **Datenschutz**: https://stripe.com/privacy
- **PCI-DSS**: Level 1 zertifiziert

#### 5.6 Google Analytics (optional, mit Consent Mode v2)
- **Zweck**: Website-Analytics
- **Cookie-Opt-In**: Erforderlich vor Tracking
- **IP-Anonymisierung**: Aktiviert

### 6. Speicherdauer

- **Aktive Konten**: Daten werden gespeichert, solange Ihr Account existiert
- **Gelöschte Konten**: 30 Tage Backup-Aufbewahrung, dann permanente Löschung
- **Rechnungsdaten**: 10 Jahre (gesetzliche Aufbewahrungspflicht gem. § 147 AO)
- **Social Media Token**: Bis zum Widerruf der Verbindung

### 7. Ihre Rechte (Art. 15-22 DSGVO)

Sie haben folgende Rechte:

#### 7.1 Auskunftsrecht (Art. 15 DSGVO)
Sie können jederzeit Auskunft über Ihre gespeicherten Daten verlangen.

#### 7.2 Berichtigungsrecht (Art. 16 DSGVO)
Falsche Daten können Sie in Ihrem Account-Bereich korrigieren.

#### 7.3 Löschungsrecht (Art. 17 DSGVO)
Sie können Ihr Konto jederzeit unter [/delete-data](/delete-data) löschen.

#### 7.4 Einschränkung der Verarbeitung (Art. 18 DSGVO)
Sie können die Verarbeitung temporär einschränken lassen.

#### 7.5 Datenübertragbarkeit (Art. 20 DSGVO)
Exportieren Sie Ihre Daten als JSON unter Account → Export.

#### 7.6 Widerspruchsrecht (Art. 21 DSGVO)
Sie können der Verarbeitung jederzeit widersprechen.

#### 7.7 Beschwerderecht
Zuständige Aufsichtsbehörde:  
Bayerisches Landesamt für Datenschutzaufsicht (BayLDA)  
https://www.lda.bayern.de

### 8. Cookies und Tracking

#### 8.1 Essenzielle Cookies (immer aktiv)
- **Authentifizierung**: Supabase Auth Token
- **Spracheinstellung**: Browser-Locale
- **Cookie-Consent**: Speichert Ihre Cookie-Präferenzen

#### 8.2 Analytics Cookies (Opt-In erforderlich)
- Google Analytics (nur mit Ihrer Zustimmung)
- Deaktivierung möglich über Cookie-Banner

### 9. Datensicherheit

Wir verwenden folgende Sicherheitsmaßnahmen:

- **Verschlüsselung**: TLS 1.3 für alle Übertragungen
- **Passwörter**: Bcrypt-Hash mit Salt
- **API-Token**: Verschlüsselt in EU-Datenbank
- **Zugriffskontrolle**: Row Level Security (RLS) in Supabase
- **Backups**: Tägliche verschlüsselte Backups
- **Monitoring**: 24/7 Security-Monitoring

### 10. Internationale Datenübermittlung

Daten werden nur in die EU übermittelt. Ausnahmen:

- **Stripe**: USA (angemessenes Datenschutzniveau gem. EU-US Data Privacy Framework)
- **Meta/Google API**: Daten werden nur auf Anfrage abgerufen, nicht übertragen

### 11. Kinder unter 16 Jahren

Unser Service richtet sich nicht an Personen unter 16 Jahren. Sollten wir feststellen, dass ein Minderjähriger ohne elterliche Zustimmung ein Konto erstellt hat, löschen wir dieses unverzüglich.

### 12. Änderungen der Datenschutzerklärung

Wir behalten uns vor, diese Datenschutzerklärung anzupassen. Wesentliche Änderungen werden Ihnen per E-Mail mitgeteilt.

### 13. Kontakt

Für Datenschutzanfragen:  
**E-Mail**: privacy@useadtool.ai  
**Post**: Samuel Dusatko, Bahnhofstraße 15a, 85221 Dachau, Germany

---

## 🇬🇧 ENGLISH VERSION

### 1. Controller
AdTool AI  
Samuel Dusatko  
Bahnhofstraße 15a  
85221 Dachau  
Germany

**Contact:**  
Email: support@useadtool.ai  
Privacy: privacy@useadtool.ai

### 2. Data Collection and Processing

We collect and process the following personal data in accordance with GDPR:

#### 2.1 Registration Data
- Email address (required)
- Name (optional)
- Password (encrypted)

#### 2.2 Social Media Data (with your consent)
- **Instagram**: Posts, images, videos, metrics (likes, comments, reach), follower data
- **Facebook**: Page information, post performance, insights, page access token
- **TikTok**: Videos, metrics, comments, engagement data via TikTok For Business API
- **YouTube**: Video metadata, channel statistics, comments via YouTube Data API v3

#### 2.3 Usage Data
- Features used (Caption Generator, Analytics, Calendar)
- Usage timestamps
- IP address (anonymized after 7 days)
- Browser information (User-Agent)
- Device type (Desktop, Mobile)

#### 2.4 Payment Data
- Credit card information (processed exclusively by Stripe, not stored by us)
- Billing data (name, address)
- Transaction history

#### 2.5 AI-Generated Content
- Prompts you entered
- Generated captions, hooks, scripts
- Uploaded images for AI analysis

### 3. Legal Basis (GDPR)

Data processing is based on:

- **Art. 6(1)(a) GDPR**: Consent for social media API access
- **Art. 6(1)(b) GDPR**: Contract fulfillment (service provision)
- **Art. 6(1)(f) GDPR**: Legitimate interest for analytics and security

### 4. Purpose of Data Processing

Your data is used for:

- **Service Provision**: Caption generation, analytics, scheduling
- **Personalization**: Recommendations based on your usage
- **Analytics**: Improving our AI models and features
- **Support**: Answering inquiries
- **Payment Processing**: Via Stripe
- **Legal Obligations**: Invoice retention per German tax law

### 5. Third-Party Processors and Data Transfer

#### 5.1 Meta (Facebook & Instagram)
- **Purpose**: Retrieving post metrics, insights, publishing
- **Privacy**: https://www.facebook.com/privacy/policy
- **Legal basis**: Consent (Art. 6(1)(a) GDPR)

#### 5.2 TikTok
- **API**: TikTok For Business API
- **Purpose**: Video analytics, comments, engagement metrics
- **Privacy**: https://www.tiktok.com/legal/privacy-policy
- **Legal basis**: Consent (Art. 6(1)(a) GDPR)

#### 5.3 Google (YouTube)
- **API**: YouTube Data API v3
- **Purpose**: Channel statistics, video performance
- **Privacy**: https://policies.google.com/privacy
- **Legal basis**: Consent (Art. 6(1)(a) GDPR)

#### 5.4 Supabase (Data Storage)
- **Location**: EU (Frankfurt, Germany)
- **Purpose**: Secure storage of all data
- **Certification**: SOC 2 Type II, ISO 27001
- **Privacy**: https://supabase.com/privacy

#### 5.5 Stripe (Payment Processing)
- **Purpose**: Credit card payments, subscription management
- **Privacy**: https://stripe.com/privacy
- **PCI-DSS**: Level 1 certified

#### 5.6 Google Analytics (optional, with Consent Mode v2)
- **Purpose**: Website analytics
- **Cookie Opt-In**: Required before tracking
- **IP Anonymization**: Enabled

### 6. Retention Period

- **Active Accounts**: Data stored as long as account exists
- **Deleted Accounts**: 30-day backup retention, then permanent deletion
- **Invoice Data**: 10 years (legal requirement per German tax law)
- **Social Media Tokens**: Until connection revoked

### 7. Your Rights (Art. 15-22 GDPR)

You have the following rights:

#### 7.1 Right of Access (Art. 15 GDPR)
Request information about your stored data at any time.

#### 7.2 Right to Rectification (Art. 16 GDPR)
Correct incorrect data in your account settings.

#### 7.3 Right to Erasure (Art. 17 GDPR)
Delete your account anytime at [/delete-data](/delete-data).

#### 7.4 Right to Restriction (Art. 18 GDPR)
Temporarily restrict processing.

#### 7.5 Right to Data Portability (Art. 20 GDPR)
Export your data as JSON under Account → Export.

#### 7.6 Right to Object (Art. 21 GDPR)
Object to processing at any time.

#### 7.7 Right to Lodge a Complaint
Supervisory Authority:  
Bayerisches Landesamt für Datenschutzaufsicht (BayLDA)  
https://www.lda.bayern.de

### 8. Cookies and Tracking

#### 8.1 Essential Cookies (always active)
- **Authentication**: Supabase Auth Token
- **Language Setting**: Browser Locale
- **Cookie Consent**: Stores your cookie preferences

#### 8.2 Analytics Cookies (Opt-In required)
- Google Analytics (only with your consent)
- Can be disabled via cookie banner

### 9. Data Security

We employ the following security measures:

- **Encryption**: TLS 1.3 for all transmissions
- **Passwords**: Bcrypt hash with salt
- **API Tokens**: Encrypted in EU database
- **Access Control**: Row Level Security (RLS) in Supabase
- **Backups**: Daily encrypted backups
- **Monitoring**: 24/7 security monitoring

### 10. International Data Transfer

Data is only transferred within the EU. Exceptions:

- **Stripe**: USA (adequate level of protection under EU-US Data Privacy Framework)
- **Meta/Google API**: Data retrieved on request, not transferred

### 11. Children Under 16

Our service is not intended for persons under 16. If we discover that a minor has created an account without parental consent, we will delete it immediately.

### 12. Changes to Privacy Policy

We reserve the right to update this privacy policy. Significant changes will be communicated via email.

### 13. Contact

For privacy inquiries:  
**Email**: privacy@useadtool.ai  
**Mail**: Samuel Dusatko, Bahnhofstraße 15a, 85221 Dachau, Germany

---

© 2025 AdTool AI – All rights reserved. Last updated: October 18, 2025
        `
      },
      es: {
        title: "Política de privacidad",
        content: `
# Política de Privacidad

Última actualización: ${new Date().toLocaleDateString('es-ES')}

## Recopilación de datos
Recopilamos y procesamos los siguientes datos personales:
- Información de cuenta (correo, nombre)
- Datos de uso (funciones utilizadas, marcas de tiempo)
- Información de pago (procesada por Stripe)

## Uso de datos
Sus datos se utilizan para:
- Proporcionar y mejorar nuestros servicios
- Procesar pagos
- Enviar comunicaciones relacionadas con el servicio
- Analizar patrones de uso

## Almacenamiento de datos
Los datos se almacenan de forma segura en la infraestructura de Supabase en la UE.

## Sus derechos
Tiene derecho a:
- Acceder a sus datos
- Rectificar datos incorrectos
- Eliminar su cuenta y datos
- Exportar sus datos

## Cookies
Utilizamos cookies esenciales para autenticación y preferencias.

## Contacto
Para consultas de privacidad: privacy@captiongenie.app
        `
      }
    },
    terms: {
      bilingual: true,
      en: {
        title: "Terms of Service | Nutzungsbedingungen",
        content: ""
      },
      de: {
        title: "Terms of Service | Nutzungsbedingungen",
        content: `
**Letzte Aktualisierung: 18. Oktober 2025**

---

## 🇩🇪 DEUTSCHE VERSION

### 1. Vertragspartner und Geltungsbereich

Diese Nutzungsbedingungen regeln die Nutzung von CaptionGenie, bereitgestellt durch:

**CaptionGenie**  
Samuel Dusatko  
Bahnhofstraße 15a  
85221 Dachau  
Germany

**Kontakt:**  
E-Mail: support@captiongenie.app

**Geltungsbereich**: Diese Bedingungen gelten für alle Nutzer weltweit.

### 2. Vertragsschluss

Ein Nutzungsvertrag kommt zustande durch:
- Registrierung mit E-Mail und Passwort
- Annahme dieser Nutzungsbedingungen durch Klick auf "Akzeptieren"
- Erste Nutzung des Services nach Registrierung

Mit der Registrierung bestätigen Sie:
- Dass Sie mindestens 16 Jahre alt sind (DSGVO-Konformität)
- Dass alle angegebenen Daten wahrheitsgemäß sind
- Dass Sie diese Nutzungsbedingungen gelesen und akzeptiert haben

### 3. Leistungsumfang

CaptionGenie bietet folgende Services:

#### 3.1 KI-gestützte Caption-Generierung
- Social Media Captions für Instagram, Facebook, TikTok, YouTube
- Hashtag-Vorschläge
- Hook-Generierung
- Reel-Script-Generierung

#### 3.2 Social Media Analytics
- Performance-Tracking über offizielle APIs:
  - Instagram Graph API
  - Facebook Graph API
  - TikTok For Business API
  - YouTube Data API v3
- Engagement-Metriken (Likes, Kommentare, Shares, Reichweite)
- Best-Time-to-Post Analysen

#### 3.3 Content Management
- Content-Calendar
- Post-Scheduler (mit Auto-Scheduling)
- Campaign-Management
- Template-Bibliothek

#### 3.4 Brand Kit
- Logo-Analyse
- Brand Voice Analyzer
- Farbpaletten-Management
- Multi-Brand-Verwaltung

#### 3.5 Publishing
- Instagram Publishing (Carousels, Reels, Stories)
- Facebook Page Publishing
- Cross-Platform-Scheduling

### 4. Registrierung und Account-Verantwortung

#### 4.1 Account-Sicherheit
- Sie sind verpflichtet, Ihre Zugangsdaten geheim zu halten
- Teilen Sie Ihr Passwort niemals mit Dritten
- Informieren Sie uns unverzüglich bei Verdacht auf unbefugten Zugriff

#### 4.2 Verbotene Aktivitäten
Sie dürfen Ihren Account nicht:
- An Dritte verkaufen oder übertragen
- Für automatisierte Massenaktionen nutzen (Spam)
- Zur Verbreitung illegaler Inhalte verwenden

#### 4.3 Wahrheitsgemäße Angaben
- Alle Registrierungsdaten müssen korrekt sein
- Bei Änderungen müssen Sie diese unverzüglich in Ihrem Profil aktualisieren

### 5. Zahlungsbedingungen

#### 5.1 Abonnement-Modelle
- **Free Plan**: Begrenzte Features, keine Zahlungsdaten erforderlich
- **Pro Plan**: Monatliche Abrechnung via Stripe
- **Enterprise Plan**: Individuelle Vertragsgestaltung

#### 5.2 Zahlungsabwicklung
- Alle Zahlungen erfolgen über Stripe (PCI-DSS Level 1 zertifiziert)
- Akzeptierte Zahlungsmittel: Kreditkarte, Debitkarte, SEPA-Lastschrift (regional)
- Rechnungen werden per E-Mail zugestellt

#### 5.3 Abonnement-Verlängerung
- Abos verlängern sich automatisch monatlich
- Kündigung jederzeit mit Wirkung zum Ende der aktuellen Abrechnungsperiode möglich
- Keine Rückerstattung für nicht genutzte Tage

#### 5.4 Preisänderungen
- Preisanpassungen erfolgen mit 30 Tagen Vorankündigung per E-Mail
- Bei Ablehnung können Sie vor Inkrafttreten kündigen
- Bestandskunden erhalten 60 Tage Bestandsschutz

#### 5.5 Rückerstattungen
- Rückerstattungen erfolgen nur in Ausnahmefällen (z.B. technische Ausfälle > 48h)
- Entscheidung liegt im Ermessen von CaptionGenie
- Anfragen an: billing@captiongenie.app

### 6. Geistiges Eigentum und Content-Rechte

#### 6.1 Ihre Inhalte
- Sie behalten alle Rechte an Ihren hochgeladenen Inhalten (Bilder, Texte, Videos)
- Sie gewähren CaptionGenie eine nicht-exklusive Lizenz zur Service-Bereitstellung
- Diese Lizenz endet mit Löschung Ihres Accounts

#### 6.2 KI-generierte Inhalte
- Von der AI generierte Captions gehören Ihnen
- Sie erhalten ein vollständiges, weltweites Nutzungsrecht
- CaptionGenie darf generierte Inhalte nicht für Marketing verwenden (ohne Ihre Zustimmung)

#### 6.3 CaptionGenie-Plattform
- Alle Rechte an Software, Design, Algorithmen verbleiben bei CaptionGenie
- Reverse Engineering ist verboten
- Marken und Logos sind geschützt

### 7. Akzeptable Nutzung

#### 7.1 Verbotene Inhalte
Sie dürfen CaptionGenie nicht nutzen für:
- Illegale, bedrohende, hasserfüllte oder beleidigende Inhalte
- Verletzung von Urheberrechten, Marken oder Patenten
- Verbreitung von Malware oder Phishing
- Nacktdarstellungen oder sexuell explizite Inhalte (außer künstlerisch/pädagogisch)
- Falschinformationen oder Deep Fakes

#### 7.2 Einhaltung von Plattform-Richtlinien
Sie verpflichten sich zur Einhaltung der Nutzungsbedingungen von:
- Instagram Community Guidelines
- Facebook Community Standards
- TikTok Community Guidelines
- YouTube Terms of Service

#### 7.3 Rate Limiting
- API-Anfragen sind auf 1000/Tag pro Account begrenzt (Pro Plan)
- Überschreitungen können zur temporären Sperrung führen
- Fair-Use-Prinzip: Kein Missbrauch für Data Scraping

### 8. Haftungsausschluss und -beschränkung

#### 8.1 Service-Verfügbarkeit
- CaptionGenie wird "as is" bereitgestellt
- Wir garantieren keine 100%ige Uptime
- Geplante Wartungen werden 24h im Voraus angekündigt

#### 8.2 Haftungsbeschränkung
Unsere Haftung ist beschränkt auf:
- Vorsatz und grobe Fahrlässigkeit: Unbegrenzte Haftung
- Leichte Fahrlässigkeit bei Verletzung wesentlicher Vertragspflichten: Begrenzt auf vorhersehbaren, vertragstypischen Schaden (max. Höhe der letzten 3 Monatsgebühren)
- Leichte Fahrlässigkeit sonst: Keine Haftung

Ausgenommen von der Haftungsbeschränkung:
- Personenschäden (Leben, Körper, Gesundheit)
- Produkthaftungsgesetz
- Arglistige Täuschung

#### 8.3 API-Ausfälle Dritter
- Wir haften nicht für Ausfälle von Meta, TikTok, Google APIs
- Bei API-Änderungen bemühen wir uns um zeitnahe Anpassungen
- Keine Garantie für Verfügbarkeit externer Services

#### 8.4 AI-generierte Inhalte
- KI kann faktisch falsche oder unangemessene Inhalte generieren
- Sie sind verpflichtet, generierte Inhalte vor Veröffentlichung zu prüfen
- CaptionGenie haftet nicht für Inhalte, die Sie ungeprüft veröffentlichen

### 9. Kündigung und Account-Löschung

#### 9.1 Ordentliche Kündigung durch Sie
- Jederzeit über Account-Einstellungen möglich
- Zugriff bis zum Ende der bezahlten Periode
- Daten werden nach 30 Tagen permanent gelöscht

#### 9.2 Außerordentliche Kündigung durch CaptionGenie
Wir können Ihren Account sofort sperren bei:
- Verstoß gegen diese Nutzungsbedingungen
- Illegalen Aktivitäten
- Zahlungsverzug > 30 Tage
- Missbrauch (Spam, Overload)

Vor Sperrung erfolgt in der Regel eine Abmahnung (außer bei schweren Verstößen).

#### 9.3 Datenexport vor Löschung
- Sie können Ihre Daten jederzeit als JSON exportieren
- Nach Löschung: 30 Tage Backup-Aufbewahrung, dann permanent gelöscht

### 10. Gerichtsstand und anwendbares Recht

#### 10.1 Anwendbares Recht
Es gilt deutsches Recht unter Ausschluss des UN-Kaufrechts.

#### 10.2 Gerichtsstand
Für Streitigkeiten ist der Sitz von CaptionGenie zuständig:
**München, Deutschland**

#### 10.3 Verbraucher-Ausnahme
Verbraucher können auch an ihrem Wohnsitz klagen.

### 11. Änderungen der Nutzungsbedingungen

- Änderungen werden 30 Tage im Voraus per E-Mail angekündigt
- Bei Ablehnung können Sie bis zum Inkrafttreten kündigen
- Fortgesetzte Nutzung nach Inkrafttreten gilt als Zustimmung

### 12. Salvatorische Klausel

Sollten einzelne Bestimmungen unwirksam sein, bleibt die Gültigkeit der übrigen Bedingungen unberührt.

### 13. Kontakt

Für Fragen zu diesen Nutzungsbedingungen:  
**E-Mail**: support@captiongenie.app  
**Post**: Samuel Dusatko, Bahnhofstraße 15a, 85221 Dachau, Germany

---

## 🇬🇧 ENGLISH VERSION

### 1. Contracting Party and Scope

These Terms of Service govern the use of CaptionGenie, provided by:

**CaptionGenie**  
Samuel Dusatko  
Bahnhofstraße 15a  
85221 Dachau  
Germany

**Contact:**  
Email: support@captiongenie.app

**Scope**: These terms apply to all users worldwide.

### 2. Contract Formation

A usage contract is formed through:
- Registration with email and password
- Acceptance of these Terms of Service by clicking "Accept"
- First use of the service after registration

By registering, you confirm that:
- You are at least 16 years old (GDPR compliance)
- All provided information is truthful
- You have read and accepted these Terms of Service

### 3. Scope of Services

CaptionGenie offers the following services:

#### 3.1 AI-Powered Caption Generation
- Social media captions for Instagram, Facebook, TikTok, YouTube
- Hashtag suggestions
- Hook generation
- Reel script generation

#### 3.2 Social Media Analytics
- Performance tracking via official APIs:
  - Instagram Graph API
  - Facebook Graph API
  - TikTok For Business API
  - YouTube Data API v3
- Engagement metrics (likes, comments, shares, reach)
- Best-time-to-post analysis

#### 3.3 Content Management
- Content calendar
- Post scheduler (with auto-scheduling)
- Campaign management
- Template library

#### 3.4 Brand Kit
- Logo analysis
- Brand voice analyzer
- Color palette management
- Multi-brand management

#### 3.5 Publishing
- Instagram publishing (carousels, reels, stories)
- Facebook page publishing
- Cross-platform scheduling

### 4. Registration and Account Responsibility

#### 4.1 Account Security
- You are obligated to keep your credentials secret
- Never share your password with third parties
- Inform us immediately if you suspect unauthorized access

#### 4.2 Prohibited Activities
You may not:
- Sell or transfer your account to third parties
- Use it for automated mass actions (spam)
- Use it to distribute illegal content

#### 4.3 Truthful Information
- All registration data must be correct
- You must update changes immediately in your profile

### 5. Payment Terms

#### 5.1 Subscription Models
- **Free Plan**: Limited features, no payment data required
- **Pro Plan**: Monthly billing via Stripe
- **Enterprise Plan**: Individual contract design

#### 5.2 Payment Processing
- All payments are processed via Stripe (PCI-DSS Level 1 certified)
- Accepted payment methods: Credit card, debit card, SEPA direct debit (regional)
- Invoices are sent via email

#### 5.3 Subscription Renewal
- Subscriptions renew automatically monthly
- Cancellation possible at any time, effective at the end of the current billing period
- No refunds for unused days

#### 5.4 Price Changes
- Price adjustments are announced 30 days in advance via email
- If you reject, you can cancel before the change takes effect
- Existing customers receive 60 days of price protection

#### 5.5 Refunds
- Refunds only in exceptional cases (e.g., technical outages > 48h)
- Decision at CaptionGenie's discretion
- Requests to: billing@captiongenie.app

### 6. Intellectual Property and Content Rights

#### 6.1 Your Content
- You retain all rights to your uploaded content (images, text, videos)
- You grant CaptionGenie a non-exclusive license for service provision
- This license ends upon account deletion

#### 6.2 AI-Generated Content
- AI-generated captions belong to you
- You receive full, worldwide usage rights
- CaptionGenie may not use generated content for marketing (without your consent)

#### 6.3 CaptionGenie Platform
- All rights to software, design, algorithms remain with CaptionGenie
- Reverse engineering is prohibited
- Trademarks and logos are protected

### 7. Acceptable Use

#### 7.1 Prohibited Content
You may not use CaptionGenie for:
- Illegal, threatening, hateful, or offensive content
- Violation of copyrights, trademarks, or patents
- Distribution of malware or phishing
- Nudity or sexually explicit content (except artistic/educational)
- Misinformation or deep fakes

#### 7.2 Compliance with Platform Guidelines
You agree to comply with the Terms of Service of:
- Instagram Community Guidelines
- Facebook Community Standards
- TikTok Community Guidelines
- YouTube Terms of Service

#### 7.3 Rate Limiting
- API requests are limited to 1000/day per account (Pro Plan)
- Exceeding limits may result in temporary suspension
- Fair-use principle: No abuse for data scraping

### 8. Disclaimer and Limitation of Liability

#### 8.1 Service Availability
- CaptionGenie is provided "as is"
- We do not guarantee 100% uptime
- Planned maintenance is announced 24h in advance

#### 8.2 Limitation of Liability
Our liability is limited to:
- Intent and gross negligence: Unlimited liability
- Slight negligence with breach of essential contractual obligations: Limited to foreseeable, contract-typical damage (max. last 3 monthly fees)
- Slight negligence otherwise: No liability

Exceptions to liability limitation:
- Personal injury (life, body, health)
- Product Liability Act
- Fraudulent misrepresentation

#### 8.3 Third-Party API Outages
- We are not liable for outages of Meta, TikTok, Google APIs
- In case of API changes, we strive for timely adjustments
- No guarantee for availability of external services

#### 8.4 AI-Generated Content
- AI can generate factually incorrect or inappropriate content
- You are obligated to review generated content before publishing
- CaptionGenie is not liable for content you publish without review

### 9. Termination and Account Deletion

#### 9.1 Ordinary Termination by You
- Possible at any time via account settings
- Access until the end of the paid period
- Data permanently deleted after 30 days

#### 9.2 Extraordinary Termination by CaptionGenie
We may immediately suspend your account in case of:
- Violation of these Terms of Service
- Illegal activities
- Payment default > 30 days
- Abuse (spam, overload)

Before suspension, a warning is usually issued (except for serious violations).

#### 9.3 Data Export Before Deletion
- You can export your data as JSON at any time
- After deletion: 30-day backup retention, then permanently deleted

### 10. Jurisdiction and Applicable Law

#### 10.1 Applicable Law
German law applies, excluding the UN Convention on Contracts for the International Sale of Goods.

#### 10.2 Jurisdiction
For disputes, the seat of CaptionGenie is competent:
**Munich, Germany**

#### 10.3 Consumer Exception
Consumers may also sue at their place of residence.

### 11. Changes to Terms of Service

- Changes are announced 30 days in advance via email
- If you reject, you can cancel before the changes take effect
- Continued use after the changes take effect is considered acceptance

### 12. Severability Clause

Should individual provisions be invalid, the validity of the remaining terms remains unaffected.

### 13. Contact

For questions about these Terms of Service:  
**Email**: support@captiongenie.app  
**Mail**: Samuel Dusatko, Bahnhofstraße 15a, 85221 Dachau, Germany

---

© 2025 CaptionGenie – All rights reserved. Last updated: October 18, 2025
        `
      },
      es: {
        title: "Términos de servicio",
        content: `
# Términos de Servicio

Última actualización: ${new Date().toLocaleDateString('es-ES')}

## Aceptación de los términos
Al acceder a CaptionGenie, aceptas estos términos.

## Descripción del servicio
CaptionGenie proporciona generación de subtítulos para redes sociales con IA y herramientas relacionadas.

## Responsabilidades de la cuenta
- Debes proporcionar información precisa
- Eres responsable de la seguridad de la cuenta
- No debes compartir credenciales de cuenta

## Uso aceptable
No puedes:
- Usar el servicio con fines ilegales
- Abusar o sobrecargar nuestros sistemas
- Violar derechos de propiedad intelectual
- Hacerse pasar por otros

## Términos de pago
- Las suscripciones se facturan mensualmente
- Los reembolsos se manejan caso por caso
- Los precios pueden cambiar con 30 días de aviso

## Terminación
Podemos suspender o terminar cuentas que violen estos términos.

## Limitación de responsabilidad
El servicio se proporciona "tal cual" sin garantías.

## Cambios en los términos
Podemos actualizar estos términos. El uso continuado constituye aceptación.

## Contacto
Para preguntas: support@captiongenie.app
        `
      }
    }
  };

  const pageContent = actualPage ? content[actualPage as keyof typeof content] : null;
  const langContent = pageContent?.[language as keyof typeof pageContent] || pageContent?.en;

  if (!langContent) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 container mx-auto px-4 py-12">
          <Card>
            <CardContent className="py-12 text-center">
              <h1 className="text-2xl font-bold mb-2">Page not found</h1>
              <p className="text-muted-foreground">The requested legal page does not exist.</p>
            </CardContent>
          </Card>
        </main>
        <Footer />
      </div>
    );
  }

  // Check if this is a bilingual page (privacy or terms)
  const isBilingual = pageContent && 'bilingual' in pageContent && pageContent.bilingual;

  // SEO metadata based on page
  const getSEOProps = () => {
    switch (actualPage) {
      case 'privacy':
        return {
          title: 'Privacy Policy | Datenschutzerklärung',
          description: 'GDPR-compliant privacy policy explaining how CaptionGenie collects, uses, and protects your data. Includes information about Instagram, Facebook, TikTok, and YouTube API integrations.',
          canonical: getCanonicalUrl('/privacy'),
        };
      case 'terms':
        return {
          title: 'Terms of Service | Nutzungsbedingungen',
          description: 'Terms of Service for CaptionGenie. Learn about account responsibilities, acceptable use, payment terms, and intellectual property rights for our AI-powered social media tools.',
          canonical: getCanonicalUrl('/terms'),
        };
      case 'imprint':
        return {
          title: 'Imprint | Impressum',
          description: 'Legal information and contact details for CaptionGenie - Samuel Dusatko, Bahnhofstraße 15a, 85221 Dachau, Germany.',
          canonical: getCanonicalUrl('/legal/imprint'),
        };
      default:
        return null;
    }
  };

  const seoProps = getSEOProps();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {seoProps && (
        <SEO 
          {...seoProps}
          noindex={false}
          lang={language}
        />
      )}
      <Header />
      <main className="flex-1 container mx-auto px-4 py-12 max-w-5xl">
        <Card className="shadow-lg">
          <CardHeader className="border-b">
            <CardTitle className="text-3xl font-bold text-center">
              {langContent.title}
            </CardTitle>
          </CardHeader>
          <CardContent className="py-8">
            {isBilingual ? (
              // For privacy and terms: show bilingual content (German version contains both)
              <div className="prose prose-slate dark:prose-invert max-w-none prose-headings:scroll-mt-20">
                <div className="whitespace-pre-wrap text-foreground leading-relaxed">
                  {pageContent.de.content}
                </div>
              </div>
            ) : (
              // For other pages: show language-specific content
              <div className="prose prose-slate dark:prose-invert max-w-none">
                <div className="whitespace-pre-wrap">{langContent.content}</div>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
      <Footer />
    </div>
  );
};

export default Legal;
