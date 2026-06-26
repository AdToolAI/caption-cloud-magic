import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Share2, Download, Copy, Check, FileText, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Props {
  brandKit: any;
  onTokenChange?: (token: string | null) => void;
}

export function BrandShareExport({ brandKit, onTokenChange }: Props) {
  const { toast } = useToast();
  const [token, setToken] = useState<string | null>(brandKit?.share_token ?? null);
  const [copied, setCopied] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [exporting, setExporting] = useState(false);

  const shareUrl = token ? `${window.location.origin}/brand/${token}` : "";

  async function handleShare() {
    setSharing(true);
    try {
      const { data, error } = await supabase.functions.invoke("share-brand-kit", {
        body: { brandKitId: brandKit.id, action: "create", expiresInDays: 30 },
      });
      if (error) throw error;
      setToken(data.token);
      onTokenChange?.(data.token);
      toast({ title: "Share-Link erstellt", description: "Gültig 30 Tage." });
    } catch (e: any) {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    } finally {
      setSharing(false);
    }
  }

  async function handleRevoke() {
    setSharing(true);
    try {
      await supabase.functions.invoke("share-brand-kit", {
        body: { brandKitId: brandKit.id, action: "revoke" },
      });
      setToken(null);
      onTokenChange?.(null);
      toast({ title: "Share-Link widerrufen" });
    } finally {
      setSharing(false);
    }
  }

  async function handleExportPdf() {
    setExporting(true);
    try {
      const { data, error } = await supabase.functions.invoke("export-brand-guidelines-pdf", {
        body: { brandKitId: brandKit.id },
      });
      if (error) throw error;
      window.open(data.url, "_blank");
      toast({ title: "PDF erstellt" });
    } catch (e: any) {
      toast({ title: "Export fehlgeschlagen", description: e.message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  }

  function copy() {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Card className="backdrop-blur-xl bg-card/60 border border-white/10">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Share2 className="h-4 w-4 text-primary" />
          Teilen & Export
        </CardTitle>
        <CardDescription>Read-only Link für Kunden, oder PDF-Guidelines.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {token ? (
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input readOnly value={shareUrl} className="text-xs" />
              <Button size="icon" variant="outline" onClick={copy}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <Button size="sm" variant="ghost" onClick={handleRevoke} disabled={sharing}>
              Link widerrufen
            </Button>
          </div>
        ) : (
          <Button onClick={handleShare} disabled={sharing} className="w-full">
            {sharing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Share2 className="h-4 w-4 mr-2" />}
            Share-Link erstellen (30 Tage)
          </Button>
        )}

        <div className="pt-3 border-t border-white/10">
          <Button onClick={handleExportPdf} disabled={exporting} variant="outline" className="w-full">
            {exporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
            Brand-Guidelines PDF exportieren
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
