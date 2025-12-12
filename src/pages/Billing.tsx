import { useState, useEffect } from "react";
import { Footer } from "@/components/Footer";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/hooks/useTranslation";
import { getProductInfo } from "@/config/pricing";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { ExternalLink, Download, CreditCard, FileText, Crown, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Invoice {
  id: string;
  number: string | null;
  date: number;
  amount: number;
  currency: string;
  status: string;
  hosted_invoice_url: string | null;
  pdf: string | null;
}

const Billing = () => {
  const { user, subscribed, productId, refreshSubscription } = useAuth();
  const { language } = useTranslation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [invoices, setInvoices] = useState<Invoice[]>([]);

  const planInfo = getProductInfo(productId);

  useEffect(() => {
    if (user && subscribed) {
      loadInvoices();
    }
  }, [user, subscribed]);

  const loadInvoices = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("get-invoices", {
        headers: {
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
        }
      });

      if (error) throw error;
      if (data?.invoices) {
        setInvoices(data.invoices);
      }
    } catch (error: any) {
      console.error("Error loading invoices:", error);
    }
  };

  const handleOpenPortal = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("customer-portal", {
        headers: {
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
        },
        body: { language }
      });

      if (error) throw error;
      
      if (data?.url) {
        window.open(data.url, "_blank");
        // Refresh after portal interaction
        await refreshSubscription();
        loadInvoices();
      }
    } catch (error: any) {
      toast({
        title: language === "de" ? "Fehler" : "Error",
        description: error.message || (language === "de" ? "Portal konnte nicht geöffnet werden" : "Failed to open portal"),
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const text = {
    en: {
      title: "Billing & Subscription",
      subtitle: "Manage your subscription and payment methods",
      manageCard: "Manage Subscription",
      manageDesc: "Update payment method, view invoices, cancel or change your subscription",
      openPortal: "Open Billing Portal",
      invoicesCard: "Invoices & Receipts",
      invoicesDesc: "Download your invoices and payment history",
      noInvoices: "No invoices yet",
      noCustomer: "No active subscription",
      upgradeMsg: "You don't have an active subscription yet. Choose a plan to get started!",
      upgradeCta: "View Plans",
      number: "Invoice",
      date: "Date",
      amount: "Amount",
      status: "Status",
      actions: "Actions",
      currentSubscription: "Current Subscription",
      plan: "Plan",
      active: "Active",
      price: "Price"
    },
    de: {
      title: "Abrechnung & Abo",
      subtitle: "Verwalten Sie Ihr Abonnement und Ihre Zahlungsmethoden",
      manageCard: "Abo verwalten",
      manageDesc: "Zahlungsmethode aktualisieren, Rechnungen anzeigen, Abo kündigen oder wechseln",
      openPortal: "Abrechnungsportal öffnen",
      invoicesCard: "Rechnungen",
      invoicesDesc: "Laden Sie Ihre Rechnungen und Zahlungshistorie herunter",
      noInvoices: "Keine Rechnungen",
      noCustomer: "Kein aktives Abo",
      upgradeMsg: "Sie haben noch kein aktives Abonnement. Wählen Sie einen Plan!",
      upgradeCta: "Pläne anzeigen",
      number: "Rechnung",
      date: "Datum",
      amount: "Betrag",
      status: "Status",
      actions: "Aktionen",
      currentSubscription: "Aktuelles Abo",
      plan: "Plan",
      active: "Aktiv",
      price: "Preis"
    },
    es: {
      title: "Facturación y suscripción",
      subtitle: "Gestiona tu suscripción y métodos de pago",
      manageCard: "Gestionar suscripción",
      manageDesc: "Actualiza el método de pago, ve facturas, cancela o cambia tu suscripción",
      openPortal: "Abrir portal de facturación",
      invoicesCard: "Facturas",
      invoicesDesc: "Descarga tus facturas e historial de pagos",
      noInvoices: "Sin facturas",
      noCustomer: "Sin suscripción activa",
      upgradeMsg: "Aún no tienes una suscripción activa. ¡Elige un plan para comenzar!",
      upgradeCta: "Ver planes",
      number: "Factura",
      date: "Fecha",
      amount: "Monto",
      status: "Estado",
      actions: "Acciones",
      currentSubscription: "Suscripción actual",
      plan: "Plan",
      active: "Activo",
      price: "Precio"
    }
  };

  const t = text[language as keyof typeof text] || text.en;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <main className="flex-1 container mx-auto px-4 py-12 max-w-6xl">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">{t.title}</h1>
          <p className="text-muted-foreground">{t.subtitle}</p>
        </div>

        {!subscribed ? (
          <Card className="border-2 border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <CreditCard className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold mb-2">{t.noCustomer}</h3>
              <p className="text-muted-foreground mb-6 max-w-md">{t.upgradeMsg}</p>
              <Button onClick={() => navigate("/pricing")} size="lg">
                {t.upgradeCta}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-8">
            {/* Current Subscription Status */}
            <Card className="border-2 border-primary/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Crown className="h-5 w-5 text-warning" />
                  {t.currentSubscription}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{t.plan}</p>
                    <p className="text-2xl font-bold">{planInfo.name}</p>
                  </div>
                  <Badge variant="default" className="text-sm">{t.active}</Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t.price}</p>
                  <p className="text-xl font-semibold">{planInfo.currency}{planInfo.price}/month</p>
                </div>
              </CardContent>
            </Card>

            {/* Manage Subscription Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  {t.manageCard}
                </CardTitle>
                <CardDescription>{t.manageDesc}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button 
                  onClick={handleOpenPortal}
                  disabled={loading}
                  size="lg"
                  className="w-full sm:w-auto"
                >
                  {loading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <ExternalLink className="mr-2 h-4 w-4" />
                  )}
                  {t.openPortal}
                </Button>
              </CardContent>
            </Card>

            {/* Invoices Table */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  {t.invoicesCard}
                </CardTitle>
                <CardDescription>{t.invoicesDesc}</CardDescription>
              </CardHeader>
              <CardContent>
                {invoices.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">{t.noInvoices}</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t.number}</TableHead>
                        <TableHead>{t.date}</TableHead>
                        <TableHead>{t.amount}</TableHead>
                        <TableHead>{t.status}</TableHead>
                        <TableHead>{t.actions}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoices.map((invoice) => (
                        <TableRow key={invoice.id}>
                          <TableCell className="font-medium">
                            {invoice.number || invoice.id.slice(0, 8)}
                          </TableCell>
                          <TableCell>
                            {new Date(invoice.date).toLocaleDateString(language === "de" ? "de-DE" : language === "es" ? "es-ES" : "en-US")}
                          </TableCell>
                          <TableCell>
                            {invoice.currency.toUpperCase()} {invoice.amount.toFixed(2)}
                          </TableCell>
                          <TableCell>
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              invoice.status === "paid" 
                                ? "bg-green-100 text-green-800" 
                                : "bg-yellow-100 text-yellow-800"
                            }`}>
                              {invoice.status}
                            </span>
                          </TableCell>
                          <TableCell>
                            {invoice.pdf && (
                              <Button 
                                variant="ghost" 
                                size="sm"
                                asChild
                              >
                                <a href={invoice.pdf} target="_blank" rel="noopener noreferrer">
                                  <Download className="h-4 w-4" />
                                </a>
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
};

export default Billing;
