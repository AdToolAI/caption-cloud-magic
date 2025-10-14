import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, Zap } from "lucide-react";

export default function UpgradeEnterprise() {
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();

  const handleUpgrade = async () => {
    if (!user?.email) {
      toast.error("Nicht angemeldet");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('upgrade-to-enterprise', {
        body: { userEmail: user.email }
      });

      if (error) throw error;

      toast.success("🎉 Erfolgreich auf Enterprise upgegradet!");
      toast.success(`${data.credits.toLocaleString()} Credits verfügbar!`);
      
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (error: any) {
      console.error('Upgrade error:', error);
      toast.error(error.message || "Upgrade fehlgeschlagen");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Enterprise Upgrade
          </CardTitle>
          <CardDescription>
            Upgrade auf Enterprise Plan für unbegrenzte Features
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-2 text-sm">
              <p>✅ Unbegrenzte Credits</p>
              <p>✅ Team & Kalender Features</p>
              <p>✅ Priority Support</p>
              <p>✅ API Access</p>
              <p>✅ White Labeling</p>
            </div>
            <Button 
              onClick={handleUpgrade} 
              disabled={loading}
              className="w-full"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Upgrading...
                </>
              ) : (
                'Jetzt upgraden'
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
