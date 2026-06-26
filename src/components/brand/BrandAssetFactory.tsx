import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Wand2, Download, Trash2, Loader2, Package } from "lucide-react";
import { useBrandAssets } from "@/hooks/useBrandAssets";

const KIND_LABEL: Record<string, string> = {
  "logo-light": "Logo (Light)",
  "logo-dark": "Logo (Dark)",
  "logo-mono": "Logo (Mono)",
  "app-icon": "App Icon",
  "social-cover-instagram": "Instagram Cover",
  "social-cover-linkedin": "LinkedIn Banner",
  "pattern-subtle": "Pattern",
  "email-header": "Email Header",
};

export function BrandAssetFactory({ brandKitId }: { brandKitId: string | null }) {
  const { assets, loading, generating, generatePack, remove } = useBrandAssets(brandKitId);

  if (!brandKitId) {
    return (
      <Card className="p-6 bg-card/60 border-white/10">
        <p className="text-sm text-muted-foreground">Wähle zuerst ein aktives Brand-Set.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="p-5 bg-card/60 border-white/10 backdrop-blur-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <Package className="h-4 w-4 text-primary" />
              <h3 className="font-display text-lg">Brand Asset Factory</h3>
            </div>
            <p className="text-xs text-muted-foreground max-w-md">
              Generiert in einem Schritt Logo-Varianten, App-Icon, Social-Cover, Pattern und Email-Header — alles im Stil deiner Marke.
            </p>
          </div>
          <Button onClick={generatePack} disabled={generating} className="shrink-0">
            {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Wand2 className="h-4 w-4 mr-2" />}
            {generating ? "Erzeuge Pack …" : "Brand-Pack erzeugen"}
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground/70 mt-3">
          ~8 Assets pro Lauf · Nano Banana 2 · ca. 30–60 s
        </p>
      </Card>

      {loading ? (
        <p className="text-sm text-muted-foreground">Lade Assets …</p>
      ) : assets.length === 0 ? (
        <Card className="p-8 bg-card/40 border-dashed border-white/10 text-center">
          <Package className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">Noch keine Assets. Starte oben dein erstes Brand-Pack.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {assets.map((a) => (
            <Card key={a.id} className="group relative overflow-hidden bg-card/60 border-white/10">
              <div className="aspect-square bg-black/40">
                <img src={a.url} alt={a.kind} className="w-full h-full object-cover" loading="lazy" />
              </div>
              <div className="p-2.5 flex items-center justify-between">
                <Badge variant="outline" className="text-[10px] truncate">
                  {KIND_LABEL[a.kind] ?? a.kind}
                </Badge>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                  <a href={a.url} download target="_blank" rel="noreferrer">
                    <Button size="icon" variant="ghost" className="h-7 w-7">
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                  </a>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => remove.mutate(a.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
