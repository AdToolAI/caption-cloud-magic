import { useState } from "react";
import { Footer } from "@/components/Footer";
import { useTranslation } from "@/hooks/useTranslation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Mail, MessageCircle, Send, Loader2, AlertCircle } from "lucide-react";
import { z } from "zod";

const supportSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(100),
  email: z.string().trim().email("Invalid email address").max(255),
  category: z.string().min(1, "Please select a category"),
  subject: z.string().trim().min(5, "Subject must be at least 5 characters").max(200),
  message: z.string().trim().min(10, "Message must be at least 10 characters").max(2000),
});

const Support = () => {
  const { language } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    category: "",
    subject: "",
    message: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Validate form data
      const validated = supportSchema.parse(formData);

      // Send ticket via edge function
      const { error } = await supabase.functions.invoke("send-support-ticket", {
        body: validated,
      });

      if (error) throw error;

      toast({
        title: text[language as keyof typeof text].successTitle,
        description: text[language as keyof typeof text].successDesc,
      });

      // Reset form
      setFormData({ name: "", email: "", category: "", subject: "", message: "" });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        toast({
          title: text[language as keyof typeof text].errorTitle,
          description: error.issues[0].message,
          variant: "destructive",
        });
      } else {
        toast({
          title: text[language as keyof typeof text].errorTitle,
          description: error.message || text[language as keyof typeof text].errorDesc,
          variant: "destructive",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleWhatsApp = () => {
    const phone = "491735802069";
    const categoryText = formData.category 
      ? text[language as keyof typeof text].categories[formData.category as keyof typeof text.en.categories]
      : text[language as keyof typeof text].categories.general;
    
    const message = encodeURIComponent(
      `${text[language as keyof typeof text].whatsapp.greeting}\n\n${text[language as keyof typeof text].category}: ${categoryText}\n${text[language as keyof typeof text].nameLabel}: ${formData.name || text[language as keyof typeof text].notProvided}\n${text[language as keyof typeof text].emailLabel}: ${formData.email || text[language as keyof typeof text].notProvided}\n\n${formData.message || text[language as keyof typeof text].whatsapp.defaultMessage}`
    );
    window.open(`https://wa.me/${phone}?text=${message}`, "_blank");
  };

  const text = {
    en: {
      title: "Customer Support",
      subtitle: "Get help with your account or features",
      ticketCard: "Email Support",
      ticketDesc: "Send us a detailed message (Recommended)",
      whatsappCard: "WhatsApp Support",
      whatsappDesc: "Urgent? Contact us directly",
      whatsappDisclaimer: "Note: You will be redirected to WhatsApp",
      category: "Category",
      categoryPlaceholder: "Select a category",
      categories: {
        account: "Account & Billing",
        technical: "Technical Issues",
        features: "Features & Usage",
        bug: "Bug Report",
        feature_request: "Feature Request",
        general: "General Question"
      },
      nameLabel: "Your Name",
      namePlaceholder: "John Doe",
      emailLabel: "Email Address",
      emailPlaceholder: "john@example.com",
      subjectLabel: "Subject",
      subjectPlaceholder: "Brief description of your issue",
      messageLabel: "Message",
      messagePlaceholder: "Describe your issue or question in detail...",
      submitBtn: "Send Message",
      whatsappBtn: "Open WhatsApp",
      successTitle: "Message Sent",
      successDesc: "We'll get back to you within 24 hours!",
      errorTitle: "Error",
      errorDesc: "Failed to send message. Please try again.",
      notProvided: "Not provided",
      whatsapp: {
        greeting: "Hi, I need help with CaptionGenie.",
        defaultMessage: "Please help me with my question."
      }
    },
    de: {
      title: "Kundensupport",
      subtitle: "Hilfe zu Ihrem Konto oder Features",
      ticketCard: "E-Mail Support",
      ticketDesc: "Sende uns eine detaillierte Nachricht (Empfohlen)",
      whatsappCard: "WhatsApp Support",
      whatsappDesc: "Dringend? Kontaktiere uns direkt",
      whatsappDisclaimer: "Hinweis: Du wirst zu WhatsApp weitergeleitet",
      category: "Kategorie",
      categoryPlaceholder: "Kategorie auswählen",
      categories: {
        account: "Account & Abrechnung",
        technical: "Technische Probleme",
        features: "Funktionen & Nutzung",
        bug: "Bug-Meldung",
        feature_request: "Feature-Wunsch",
        general: "Allgemeine Frage"
      },
      nameLabel: "Ihr Name",
      namePlaceholder: "Max Mustermann",
      emailLabel: "E-Mail-Adresse",
      emailPlaceholder: "max@beispiel.de",
      subjectLabel: "Betreff",
      subjectPlaceholder: "Kurze Beschreibung deines Anliegens",
      messageLabel: "Nachricht",
      messagePlaceholder: "Beschreibe dein Anliegen oder deine Frage ausführlich...",
      submitBtn: "Nachricht senden",
      whatsappBtn: "WhatsApp öffnen",
      successTitle: "Nachricht gesendet",
      successDesc: "Wir melden uns innerhalb von 24 Stunden!",
      errorTitle: "Fehler",
      errorDesc: "Nachricht konnte nicht gesendet werden. Bitte versuche es erneut.",
      notProvided: "Nicht angegeben",
      whatsapp: {
        greeting: "Hallo, ich benötige Hilfe mit CaptionGenie.",
        defaultMessage: "Bitte helft mir mit meiner Frage."
      }
    },
    es: {
      title: "Soporte al Cliente",
      subtitle: "Obtén ayuda con tu cuenta o funciones",
      ticketCard: "Soporte por Email",
      ticketDesc: "Envíanos un mensaje detallado (Recomendado)",
      whatsappCard: "Soporte por WhatsApp",
      whatsappDesc: "¿Urgente? Contáctanos directamente",
      whatsappDisclaimer: "Nota: Serás redirigido a WhatsApp",
      category: "Categoría",
      categoryPlaceholder: "Selecciona una categoría",
      categories: {
        account: "Cuenta y Facturación",
        technical: "Problemas Técnicos",
        features: "Funciones y Uso",
        bug: "Reporte de Error",
        feature_request: "Solicitud de Función",
        general: "Pregunta General"
      },
      nameLabel: "Tu Nombre",
      namePlaceholder: "Juan Pérez",
      emailLabel: "Correo Electrónico",
      emailPlaceholder: "juan@ejemplo.com",
      subjectLabel: "Asunto",
      subjectPlaceholder: "Descripción breve de tu problema",
      messageLabel: "Mensaje",
      messagePlaceholder: "Describe tu problema o pregunta en detalle...",
      submitBtn: "Enviar Mensaje",
      whatsappBtn: "Abrir WhatsApp",
      successTitle: "Mensaje Enviado",
      successDesc: "¡Te responderemos en 24 horas!",
      errorTitle: "Error",
      errorDesc: "No se pudo enviar el mensaje. Por favor, inténtalo de nuevo.",
      notProvided: "No proporcionado",
      whatsapp: {
        greeting: "Hola, necesito ayuda con CaptionGenie.",
        defaultMessage: "Por favor, ayúdame con mi pregunta."
      }
    },
  };

  const t = text[language as keyof typeof text] || text.en;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <main className="flex-1 container mx-auto px-4 py-12 max-w-6xl">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">{t.title}</h1>
          <p className="text-muted-foreground">{t.subtitle}</p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Email Ticket Form - Primary */}
          <Card className="border-2 border-primary">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                {t.ticketCard}
              </CardTitle>
              <CardDescription>{t.ticketDesc}</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">{t.nameLabel}</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder={t.namePlaceholder}
                    required
                    maxLength={100}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">{t.emailLabel}</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder={t.emailPlaceholder}
                    required
                    maxLength={255}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="category">{t.category} *</Label>
                  <Select
                    value={formData.category}
                    onValueChange={(value) => setFormData({ ...formData, category: value })}
                    required
                  >
                    <SelectTrigger id="category">
                      <SelectValue placeholder={t.categoryPlaceholder} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="account">{t.categories.account}</SelectItem>
                      <SelectItem value="technical">{t.categories.technical}</SelectItem>
                      <SelectItem value="features">{t.categories.features}</SelectItem>
                      <SelectItem value="bug">{t.categories.bug}</SelectItem>
                      <SelectItem value="feature_request">{t.categories.feature_request}</SelectItem>
                      <SelectItem value="general">{t.categories.general}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="subject">{t.subjectLabel}</Label>
                  <Input
                    id="subject"
                    value={formData.subject}
                    onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                    placeholder={t.subjectPlaceholder}
                    required
                    maxLength={200}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="message">{t.messageLabel}</Label>
                  <Textarea
                    id="message"
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    placeholder={t.messagePlaceholder}
                    required
                    rows={5}
                    maxLength={2000}
                    className="resize-none"
                  />
                </div>

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="mr-2 h-4 w-4" />
                      {t.submitBtn}
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Support;
