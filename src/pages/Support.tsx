import { useState } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { useTranslation } from "@/hooks/useTranslation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Mail, MessageCircle, Send, Loader2 } from "lucide-react";
import { z } from "zod";

const supportSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(100),
  email: z.string().trim().email("Invalid email address").max(255),
  subject: z.string().trim().min(5, "Subject must be at least 5 characters").max(200),
  message: z.string().trim().min(10, "Message must be at least 10 characters").max(2000),
});

const Support = () => {
  const { language } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
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
      setFormData({ name: "", email: "", subject: "", message: "" });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        toast({
          title: text[language as keyof typeof text].errorTitle,
          description: error.errors[0].message,
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
    // Open WhatsApp with pre-filled message without exposing the number
    const message = encodeURIComponent(
      `Hello! I need support with CaptionGenie.\n\nName: ${formData.name}\nEmail: ${formData.email}\nIssue: ${formData.subject}`
    );
    window.open(`https://wa.me/491735802069?text=${message}`, "_blank");
  };

  const text = {
    en: {
      title: "Customer Support",
      subtitle: "Get help with your account or features",
      ticketCard: "Submit a Support Ticket",
      ticketDesc: "Send us a message and we'll respond via email",
      whatsappCard: "Chat on WhatsApp",
      whatsappDesc: "Get instant support via WhatsApp",
      nameLabel: "Your Name",
      namePlaceholder: "John Doe",
      emailLabel: "Email Address",
      emailPlaceholder: "john@example.com",
      subjectLabel: "Subject",
      subjectPlaceholder: "How can we help you?",
      messageLabel: "Message",
      messagePlaceholder: "Describe your issue or question...",
      submitBtn: "Send Ticket",
      whatsappBtn: "Open WhatsApp",
      successTitle: "Ticket Submitted",
      successDesc: "We've received your ticket and will respond shortly via email.",
      errorTitle: "Error",
      errorDesc: "Failed to submit ticket. Please try again.",
    },
    de: {
      title: "Kundensupport",
      subtitle: "Hilfe zu Ihrem Konto oder Features",
      ticketCard: "Support-Ticket einreichen",
      ticketDesc: "Senden Sie uns eine Nachricht und wir antworten per E-Mail",
      whatsappCard: "Chat über WhatsApp",
      whatsappDesc: "Sofortiger Support über WhatsApp",
      nameLabel: "Ihr Name",
      namePlaceholder: "Max Mustermann",
      emailLabel: "E-Mail-Adresse",
      emailPlaceholder: "max@beispiel.de",
      subjectLabel: "Betreff",
      subjectPlaceholder: "Wie können wir Ihnen helfen?",
      messageLabel: "Nachricht",
      messagePlaceholder: "Beschreiben Sie Ihr Anliegen...",
      submitBtn: "Ticket senden",
      whatsappBtn: "WhatsApp öffnen",
      successTitle: "Ticket gesendet",
      successDesc: "Wir haben Ihr Ticket erhalten und werden Ihnen in Kürze per E-Mail antworten.",
      errorTitle: "Fehler",
      errorDesc: "Ticket konnte nicht gesendet werden. Bitte versuchen Sie es erneut.",
    },
    es: {
      title: "Soporte al Cliente",
      subtitle: "Obtén ayuda con tu cuenta o funciones",
      ticketCard: "Enviar Ticket de Soporte",
      ticketDesc: "Envíanos un mensaje y responderemos por correo electrónico",
      whatsappCard: "Chat por WhatsApp",
      whatsappDesc: "Soporte instantáneo vía WhatsApp",
      nameLabel: "Tu Nombre",
      namePlaceholder: "Juan Pérez",
      emailLabel: "Correo Electrónico",
      emailPlaceholder: "juan@ejemplo.com",
      subjectLabel: "Asunto",
      subjectPlaceholder: "¿Cómo podemos ayudarte?",
      messageLabel: "Mensaje",
      messagePlaceholder: "Describe tu problema o pregunta...",
      submitBtn: "Enviar Ticket",
      whatsappBtn: "Abrir WhatsApp",
      successTitle: "Ticket Enviado",
      successDesc: "Hemos recibido tu ticket y responderemos pronto por correo electrónico.",
      errorTitle: "Error",
      errorDesc: "No se pudo enviar el ticket. Por favor, inténtalo de nuevo.",
    },
  };

  const t = text[language as keyof typeof text] || text.en;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <main className="flex-1 container mx-auto px-4 py-12 max-w-6xl">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">{t.title}</h1>
          <p className="text-muted-foreground">{t.subtitle}</p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Email Ticket Form */}
          <Card>
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
                    rows={6}
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

          {/* WhatsApp Support */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5" />
                {t.whatsappCard}
              </CardTitle>
              <CardDescription>{t.whatsappDesc}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <div className="bg-green-100 dark:bg-green-900/20 rounded-full p-6 mb-6">
                <MessageCircle className="h-12 w-12 text-green-600 dark:text-green-400" />
              </div>
              <p className="text-center text-muted-foreground mb-6 max-w-md">
                {language === "de"
                  ? "Erhalten Sie sofortige Hilfe über WhatsApp. Wir antworten normalerweise innerhalb weniger Minuten."
                  : language === "es"
                  ? "Obtén ayuda instantánea por WhatsApp. Normalmente respondemos en pocos minutos."
                  : "Get instant help via WhatsApp. We typically respond within minutes."}
              </p>
              <Button onClick={handleWhatsApp} size="lg" className="bg-green-600 hover:bg-green-700">
                <MessageCircle className="mr-2 h-5 w-5" />
                {t.whatsappBtn}
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Support;
