import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ShieldCheck } from "lucide-react";
import { BrandParticleField } from "@/components/brand/BrandParticleField";

export default function SharedBrandKit() {
  const { token } = useParams<{ token: string }>();

  const { data: kit, isLoading, error } = useQuery({
    queryKey: ["shared-brand-kit", token],
    enabled: !!token,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brand_kits")
        .select("*")
        .eq("share_token", token!)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("not_found");
      return data as any;
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#050816] text-white">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (error || !kit) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#050816] text-white">
        <div className="text-center">
          <p className="text-2xl font-semibold">Link nicht verfügbar</p>
          <p className="text-sm text-muted-foreground mt-2">Der Share-Token ist abgelaufen oder ungültig.</p>
        </div>
      </div>
    );
  }

  const palette = [kit.primary_color, kit.secondary_color, kit.accent_color, ...(Array.isArray(kit.color_palette) ? kit.color_palette : [])].filter(Boolean);

  return (
    <div className="min-h-screen bg-[#050816] text-white relative">
      <div className="absolute inset-0 opacity-40 pointer-events-none">
        <BrandParticleField />
      </div>

      <div className="relative max-w-5xl mx-auto px-6 py-16">
        <div className="flex items-center gap-2 text-xs text-amber-300/80 mb-3">
          <ShieldCheck className="h-3.5 w-3.5" />
          <span className="font-mono uppercase tracking-wider">Brand Dossier · Read Only</span>
        </div>
        <h1 className="text-5xl md:text-6xl font-serif font-bold tracking-tight">{kit.brand_name ?? "Brand"}</h1>
        {kit.brand_tone && (
          <p className="mt-3 text-lg text-amber-200/90">{kit.brand_tone}</p>
        )}

        <section className="mt-12">
          <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-4">Palette</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {palette.map((c: string, i: number) => (
              <div key={i} className="rounded-xl overflow-hidden border border-white/10">
                <div className="h-24" style={{ background: c }} />
                <div className="p-3 bg-card/60 backdrop-blur-xl">
                  <p className="text-xs font-mono">{c.toUpperCase()}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {kit.target_audience && (
          <section className="mt-10">
            <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-2">Audience</h2>
            <p className="text-lg">{kit.target_audience}</p>
          </section>
        )}

        {Array.isArray(kit.brand_values) && kit.brand_values.length > 0 && (
          <section className="mt-10">
            <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-2">Values</h2>
            <div className="flex flex-wrap gap-2">
              {kit.brand_values.map((v: string, i: number) => (
                <span key={i} className="rounded-full border border-amber-300/30 bg-amber-300/5 px-3 py-1 text-sm text-amber-200">{v}</span>
              ))}
            </div>
          </section>
        )}

        <footer className="mt-20 pt-6 border-t border-white/10 text-xs text-muted-foreground">
          Powered by AdTool · Bond 2028 Brand-OS
        </footer>
      </div>
    </div>
  );
}
