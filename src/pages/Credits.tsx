import { CreditBalance } from "@/components/credits/CreditBalance";
import { CreditHistory } from "@/components/credits/CreditHistory";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ShoppingCart } from "lucide-react";

const Credits = () => {
  const handleBuyCredits = () => {
    // TODO: Integrate with Stripe checkout
    console.log('Opening credit purchase dialog');
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Credits</h1>
          <p className="text-muted-foreground mt-1">
            Verwalten Sie Ihr Credit-Guthaben und sehen Sie Ihre Transaktionen
          </p>
        </div>
        <Button onClick={handleBuyCredits} size="lg">
          <ShoppingCart className="mr-2 h-4 w-4" />
          Credits kaufen
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <CreditBalance />
        
        <Card>
          <CardHeader>
            <CardTitle>Credit-Pakete</CardTitle>
            <CardDescription>Kaufen Sie zusätzliche Credits</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 border rounded-lg hover:border-primary transition-colors cursor-pointer">
              <div className="flex justify-between items-center">
                <div>
                  <p className="font-semibold">1.000 Credits</p>
                  <p className="text-sm text-muted-foreground">Extra Paket</p>
                </div>
                <p className="text-2xl font-bold">14,95€</p>
              </div>
            </div>
            
            <div className="p-4 border rounded-lg hover:border-primary transition-colors cursor-pointer">
              <div className="flex justify-between items-center">
                <div>
                  <p className="font-semibold">2.500 Credits</p>
                  <p className="text-sm text-muted-foreground">Business Paket</p>
                </div>
                <p className="text-2xl font-bold">29,95€</p>
              </div>
            </div>
            
            <div className="p-4 border rounded-lg hover:border-primary transition-colors cursor-pointer">
              <div className="flex justify-between items-center">
                <div>
                  <p className="font-semibold">5.000 Credits</p>
                  <p className="text-sm text-muted-foreground">Enterprise Paket</p>
                </div>
                <p className="text-2xl font-bold">44,95€</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <CreditHistory />
    </div>
  );
};

export default Credits;
