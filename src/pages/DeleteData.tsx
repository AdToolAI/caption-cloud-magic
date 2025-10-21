import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslation } from "@/hooks/useTranslation";
import { SEO } from "@/components/SEO";
import { Mail, Trash2, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";

const DeleteData = () => {
  const { t, language } = useTranslation();

  const content = {
    en: {
      title: "Data Deletion",
      subtitle: "How to delete your AdTool AI data",
      intro: "If you want to delete your data stored with AdTool AI, you have two options:",
      option1Title: "Email Request",
      option1Desc: "Send an email to",
      option1Email: "support@useadtool.ai",
      option1Subject: "with the subject line \"Data Deletion\"",
      option2Title: "Delete in App",
      option2Desc: "You can delete your user account directly in your Account Settings",
      timeline: "We will remove all personal data within 30 days of receiving your request.",
      support: "For questions:",
      metaNote: "Data Deletion Instructions for Instagram Integration",
      metaDesc: "If you connected your Instagram account via our Meta App integration, this deletion process will also remove all data associated with that connection."
    },
    de: {
      title: "Datenlöschung",
      subtitle: "So löschst du deine AdTool AI-Daten",
      intro: "Wenn du deine bei AdTool AI gespeicherten Daten löschen möchtest, hast du zwei Möglichkeiten:",
      option1Title: "E-Mail senden",
      option1Desc: "Sende eine E-Mail an",
      option1Email: "support@useadtool.ai",
      option1Subject: "mit dem Betreff \"Datenlöschung\"",
      option2Title: "In der App löschen",
      option2Desc: "Du kannst dein Benutzerkonto direkt in deinen Account-Einstellungen löschen",
      timeline: "Wir werden alle personenbezogenen Daten innerhalb von 30 Tagen nach Eingang deiner Anfrage entfernen.",
      support: "Für Rückfragen:",
      metaNote: "Daten-Löschungsanweisungen für Instagram-Integration",
      metaDesc: "Wenn du dein Instagram-Konto über unsere Meta App-Integration verbunden hast, werden durch diesen Löschprozess auch alle Daten dieser Verbindung entfernt."
    },
    es: {
      title: "Eliminación de datos",
      subtitle: "Cómo eliminar tus datos de AdTool AI",
      intro: "Si deseas eliminar tus datos almacenados en AdTool AI, tienes dos opciones:",
      option1Title: "Solicitud por correo",
      option1Desc: "Envía un correo a",
      option1Email: "support@useadtool.ai",
      option1Subject: "con el asunto \"Eliminación de datos\"",
      option2Title: "Eliminar en la aplicación",
      option2Desc: "Puedes eliminar tu cuenta de usuario directamente en la configuración de tu cuenta",
      timeline: "Eliminaremos todos los datos personales dentro de los 30 días posteriores a la recepción de tu solicitud.",
      support: "Para preguntas:",
      metaNote: "Instrucciones de eliminación de datos para la integración de Instagram",
      metaDesc: "Si conectaste tu cuenta de Instagram a través de nuestra integración de Meta App, este proceso de eliminación también eliminará todos los datos asociados con esa conexión."
    }
  };

  const langContent = content[language as keyof typeof content] || content.en;

  return (
    <>
      <SEO
        title={`${langContent.title} | AdTool AI`}
        description={langContent.subtitle}
        canonical="/delete-data"
      />
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 container mx-auto px-4 py-12 max-w-4xl">
          <Card>
            <CardHeader>
              <CardTitle className="text-3xl flex items-center gap-3">
                <Shield className="h-8 w-8 text-primary" />
                {langContent.title}
              </CardTitle>
              <p className="text-muted-foreground mt-2">{langContent.subtitle}</p>
            </CardHeader>
            <CardContent className="space-y-8">
              <p className="text-base">{langContent.intro}</p>

              {/* Option 1: Email */}
              <div className="border rounded-lg p-6 space-y-3 bg-secondary/10">
                <div className="flex items-center gap-3">
                  <Mail className="h-6 w-6 text-primary" />
                  <h2 className="text-xl font-semibold">{langContent.option1Title}</h2>
                </div>
                <p className="text-muted-foreground">{langContent.option1Desc}</p>
                <Button
                  variant="outline"
                  onClick={() => window.location.href = `mailto:${langContent.option1Email}?subject=Data Deletion`}
                  className="w-full sm:w-auto"
                >
                  <Mail className="h-4 w-4 mr-2" />
                  {langContent.option1Email}
                </Button>
                <p className="text-sm text-muted-foreground">{langContent.option1Subject}</p>
              </div>

              {/* Option 2: In-App */}
              <div className="border rounded-lg p-6 space-y-3 bg-secondary/10">
                <div className="flex items-center gap-3">
                  <Trash2 className="h-6 w-6 text-primary" />
                  <h2 className="text-xl font-semibold">{langContent.option2Title}</h2>
                </div>
                <p className="text-muted-foreground">{langContent.option2Desc}</p>
                <Button
                  variant="outline"
                  onClick={() => window.location.href = '/account'}
                  className="w-full sm:w-auto"
                >
                  {language === 'de' ? 'Zu den Einstellungen' : language === 'es' ? 'Ir a configuración' : 'Go to Settings'}
                </Button>
              </div>

              {/* Timeline */}
              <div className="bg-primary/5 border-l-4 border-primary p-4 rounded">
                <p className="font-medium">{langContent.timeline}</p>
              </div>

              {/* Meta Integration Note */}
              <div className="pt-6 border-t">
                <h3 className="text-lg font-semibold mb-2">{langContent.metaNote}</h3>
                <p className="text-sm text-muted-foreground">{langContent.metaDesc}</p>
              </div>

              {/* Support */}
              <div className="text-center pt-6">
                <p className="text-sm text-muted-foreground">
                  {langContent.support}{" "}
                  <a
                    href={`mailto:${langContent.option1Email}`}
                    className="text-primary hover:underline font-medium"
                  >
                    {langContent.option1Email}
                  </a>
                </p>
              </div>
            </CardContent>
          </Card>
        </main>
        <Footer />
      </div>
    </>
  );
};

export default DeleteData;
