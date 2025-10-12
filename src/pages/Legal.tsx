import { useParams } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslation } from "@/hooks/useTranslation";

const Legal = () => {
  const { page } = useParams<{ page: string }>();
  const { language } = useTranslation();

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
CaptionGenie  
[Ihr Firmenname]  
[Ihre Adresse]  
[Stadt, PLZ]  
[Land]

## Kontakt
E-Mail: support@captiongenie.app  
Telefon: [Ihre Telefonnummer]

## Verantwortlich für den Inhalt
[Ihr Name]  
[Ihre Position]

## Streitschlichtung
Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS) bereit: https://ec.europa.eu/consumers/odr

## Haftung für Inhalte
Wir sind nicht verpflichtet, übermittelte oder gespeicherte fremde Informationen zu überwachen oder nach Umständen zu forschen, die auf eine rechtswidrige Tätigkeit hinweisen.
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
      en: {
        title: "Privacy Policy",
        content: `
# Privacy Policy

Last updated: ${new Date().toLocaleDateString('en-US')}

## Data Collection
We collect and process the following personal data:
- Account information (email, name)
- Usage data (features used, timestamps)
- Payment information (processed by Stripe)

## Data Usage
Your data is used to:
- Provide and improve our services
- Process payments
- Send service-related communications
- Analyze usage patterns

## Data Storage
Data is stored securely using Supabase infrastructure in the EU.

## Your Rights
You have the right to:
- Access your data
- Rectify incorrect data
- Delete your account and data
- Export your data

## Cookies
We use essential cookies for authentication and preferences.

## Contact
For privacy inquiries: privacy@captiongenie.app
        `
      },
      de: {
        title: "Datenschutzerklärung",
        content: `
# Datenschutzerklärung

Letzte Aktualisierung: ${new Date().toLocaleDateString('de-DE')}

## Datenerhebung
Wir erheben und verarbeiten folgende personenbezogene Daten:
- Kontoinformationen (E-Mail, Name)
- Nutzungsdaten (genutzte Funktionen, Zeitstempel)
- Zahlungsinformationen (verarbeitet durch Stripe)

## Datennutzung
Ihre Daten werden verwendet, um:
- Unsere Dienste bereitzustellen und zu verbessern
- Zahlungen zu verarbeiten
- Service-bezogene Mitteilungen zu versenden
- Nutzungsmuster zu analysieren

## Datenspeicherung
Daten werden sicher in der Supabase-Infrastruktur in der EU gespeichert.

## Ihre Rechte
Sie haben das Recht:
- Auf Ihre Daten zuzugreifen
- Falsche Daten zu berichtigen
- Ihr Konto und Ihre Daten zu löschen
- Ihre Daten zu exportieren

## Cookies
Wir verwenden essenzielle Cookies für Authentifizierung und Einstellungen.

## Kontakt
Für Datenschutzanfragen: privacy@captiongenie.app
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
      en: {
        title: "Terms of Service",
        content: `
# Terms of Service

Last updated: ${new Date().toLocaleDateString('en-US')}

## Acceptance of Terms
By accessing CaptionGenie, you agree to these terms.

## Service Description
CaptionGenie provides AI-powered social media caption generation and related tools.

## Account Responsibilities
- You must provide accurate information
- You are responsible for account security
- You must not share account credentials

## Acceptable Use
You may not:
- Use the service for illegal purposes
- Abuse or overload our systems
- Violate intellectual property rights
- Impersonate others

## Payment Terms
- Subscriptions are billed monthly
- Refunds are handled on a case-by-case basis
- Prices may change with 30 days notice

## Termination
We may suspend or terminate accounts that violate these terms.

## Limitation of Liability
The service is provided "as is" without warranties.

## Changes to Terms
We may update these terms. Continued use constitutes acceptance.

## Contact
For questions: support@captiongenie.app
        `
      },
      de: {
        title: "Nutzungsbedingungen",
        content: `
# Nutzungsbedingungen

Letzte Aktualisierung: ${new Date().toLocaleDateString('de-DE')}

## Annahme der Bedingungen
Durch den Zugriff auf CaptionGenie stimmen Sie diesen Bedingungen zu.

## Servicebeschreibung
CaptionGenie bietet KI-gestützte Social-Media-Caption-Generierung und verwandte Tools.

## Kontoverantwortlichkeiten
- Sie müssen genaue Informationen angeben
- Sie sind für die Kontosicherheit verantwortlich
- Sie dürfen Kontodaten nicht teilen

## Zulässige Nutzung
Sie dürfen nicht:
- Den Service für illegale Zwecke nutzen
- Unsere Systeme missbrauchen oder überlasten
- Geistige Eigentumsrechte verletzen
- Andere imitieren

## Zahlungsbedingungen
- Abonnements werden monatlich abgerechnet
- Rückerstattungen werden im Einzelfall behandelt
- Preise können sich mit 30 Tagen Vorankündigung ändern

## Kündigung
Wir können Konten, die diese Bedingungen verletzen, aussetzen oder kündigen.

## Haftungsbeschränkung
Der Service wird "wie besehen" ohne Garantien bereitgestellt.

## Änderungen der Bedingungen
Wir können diese Bedingungen aktualisieren. Fortgesetzte Nutzung gilt als Akzeptanz.

## Kontakt
Für Fragen: support@captiongenie.app
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

  const pageContent = page ? content[page as keyof typeof content] : null;
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

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-12 max-w-4xl">
        <Card>
          <CardHeader>
            <CardTitle className="text-3xl">{langContent.title}</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-slate dark:prose-invert max-w-none">
            <div className="whitespace-pre-wrap">{langContent.content}</div>
          </CardContent>
        </Card>
      </main>
      <Footer />
    </div>
  );
};

export default Legal;
