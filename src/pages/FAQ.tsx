import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { SEO } from "@/components/SEO";
import { FAQ as FAQComponent } from "@/components/FAQ";
import { useTranslation } from "@/hooks/useTranslation";

const FAQ = () => {
  const { language } = useTranslation();

  const faqItems = {
    en: [
      {
        question: "What payment methods do you accept?",
        answer: "We accept all major credit cards (Visa, MasterCard, American Express) and PayPal through Stripe's secure payment processing."
      },
      {
        question: "Can I cancel my subscription anytime?",
        answer: "Yes, you can cancel your subscription at any time from your billing dashboard. Your access will continue until the end of your current billing period."
      },
      {
        question: "Is there a free trial?",
        answer: "Our Free plan is available permanently and doesn't require a credit card. You can upgrade to paid plans anytime when you need more features."
      },
      {
        question: "How do I access my invoices?",
        answer: "You can access and download all your invoices from the Billing page. Simply go to Account > Billing to view your invoice history."
      },
      {
        question: "What happens if I downgrade my plan?",
        answer: "Your account will be downgraded at the end of your current billing cycle. You'll retain access to premium features until then."
      },
      {
        question: "Is my payment information secure?",
        answer: "Yes, we use Stripe for payment processing, which is PCI-compliant and uses industry-standard encryption to protect your payment information."
      },
      {
        question: "Can I get a refund?",
        answer: "Refunds are available within 14 days of purchase if you're not satisfied with our service. Contact support@captiongenie.com for assistance."
      },
      {
        question: "How is my data protected?",
        answer: "We use enterprise-grade encryption and secure servers to protect your data. We never share your information with third parties without your consent."
      }
    ],
    de: [
      {
        question: "Welche Zahlungsmethoden werden akzeptiert?",
        answer: "Wir akzeptieren alle gängigen Kreditkarten (Visa, MasterCard, American Express) und PayPal über Stripes sichere Zahlungsabwicklung."
      },
      {
        question: "Kann ich jederzeit kündigen?",
        answer: "Ja, Sie können Ihr Abonnement jederzeit über Ihr Abrechnungs-Dashboard kündigen. Ihr Zugang bleibt bis zum Ende des aktuellen Abrechnungszeitraums bestehen."
      },
      {
        question: "Gibt es eine kostenlose Testversion?",
        answer: "Unser kostenloser Plan ist dauerhaft verfügbar und erfordert keine Kreditkarte. Sie können jederzeit auf kostenpflichtige Pläne upgraden."
      },
      {
        question: "Wie kann ich auf meine Rechnungen zugreifen?",
        answer: "Sie können alle Ihre Rechnungen über die Abrechnungsseite einsehen und herunterladen. Gehen Sie zu Konto > Abrechnung, um Ihren Rechnungsverlauf anzuzeigen."
      },
      {
        question: "Was passiert, wenn ich meinen Plan herabstufe?",
        answer: "Ihr Konto wird am Ende des aktuellen Abrechnungszeitraums herabgestuft. Sie behalten Premium-Funktionen bis dahin."
      },
      {
        question: "Sind meine Zahlungsdaten sicher?",
        answer: "Ja, wir nutzen Stripe für die Zahlungsabwicklung, das PCI-konform ist und Ihre Daten mit modernster Verschlüsselung schützt."
      },
      {
        question: "Kann ich eine Rückerstattung erhalten?",
        answer: "Rückerstattungen sind innerhalb von 14 Tagen nach dem Kauf möglich, wenn Sie mit unserem Service nicht zufrieden sind. Kontaktieren Sie support@captiongenie.com für Hilfe."
      },
      {
        question: "Wie werden meine Daten geschützt?",
        answer: "Wir verwenden Unternehmensstandard-Verschlüsselung und sichere Server zum Schutz Ihrer Daten. Wir geben Ihre Informationen niemals ohne Ihre Zustimmung an Dritte weiter."
      }
    ],
    es: [
      {
        question: "¿Qué métodos de pago aceptan?",
        answer: "Aceptamos todas las principales tarjetas de crédito (Visa, MasterCard, American Express) y PayPal a través del procesamiento seguro de Stripe."
      },
      {
        question: "¿Puedo cancelar en cualquier momento?",
        answer: "Sí, puedes cancelar tu suscripción en cualquier momento desde tu panel de facturación. Tu acceso continuará hasta el final del período de facturación actual."
      },
      {
        question: "¿Hay una prueba gratuita?",
        answer: "Nuestro plan gratuito está disponible permanentemente y no requiere tarjeta de crédito. Puedes actualizar a planes de pago en cualquier momento."
      },
      {
        question: "¿Cómo accedo a mis facturas?",
        answer: "Puedes acceder y descargar todas tus facturas desde la página de Facturación. Ve a Cuenta > Facturación para ver tu historial de facturas."
      },
      {
        question: "¿Qué pasa si cambio a un plan inferior?",
        answer: "Tu cuenta se degradará al final del período de facturación actual. Conservarás las funciones premium hasta entonces."
      },
      {
        question: "¿Es segura mi información de pago?",
        answer: "Sí, utilizamos Stripe para el procesamiento de pagos, que cumple con PCI y utiliza cifrado estándar de la industria para proteger tu información."
      },
      {
        question: "¿Puedo obtener un reembolso?",
        answer: "Los reembolsos están disponibles dentro de los 14 días posteriores a la compra si no estás satisfecho con nuestro servicio. Contacta a support@captiongenie.com para ayuda."
      },
      {
        question: "¿Cómo se protegen mis datos?",
        answer: "Utilizamos cifrado de nivel empresarial y servidores seguros para proteger tus datos. Nunca compartimos tu información con terceros sin tu consentimiento."
      }
    ]
  };

  const items = faqItems[language as keyof typeof faqItems] || faqItems.en;
  const title = {
    en: "Frequently Asked Questions",
    de: "Häufig gestellte Fragen",
    es: "Preguntas Frecuentes"
  }[language as keyof typeof faqItems] || "Frequently Asked Questions";

  // JSON-LD Strukturierte Daten für FAQPage
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": items.map(item => ({
      "@type": "Question",
      "name": item.question,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": item.answer
      }
    }))
  };

  return (
    <div className="min-h-screen flex flex-col">
      <SEO
        title={title}
        description="Finde Antworten auf häufig gestellte Fragen zu CaptionGenie - Preise, Abonnements, Zahlungsmethoden und mehr."
        canonical="/faq"
        lang={language}
        ogImage="/og-faq.jpg"
        structuredData={structuredData}
      />
      <Header />
      
      <main className="flex-1 py-20">
        <FAQComponent title={title} items={items} />
      </main>
      
      <Footer />
    </div>
  );
};

export default FAQ;