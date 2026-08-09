import { tx } from "@/lib/i18nText";
import { motion } from "framer-motion";
import { Loader2, Wand2, BookTemplate } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useContentStudio } from "@/contexts/ContentStudioContext";

export function BriefStep({ onOpenTemplates }: { onOpenTemplates: () => void }) {
  const s = useContentStudio();

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="space-y-2">
        <h2 className="font-display text-3xl tracking-tight">Ein Briefing. Ein fertiger Beitrag.</h2>
        <p className="text-sm text-muted-foreground">
          Thema einmal setzen — Copy, Motiv, Layout und Termin bauen darauf auf.
        </p>
      </div>

      <div className="space-y-5 rounded-2xl border border-border/60 bg-card/60 p-6 backdrop-blur">
        <div className="space-y-2">
          <Label>Briefing</Label>
          <Textarea
            rows={5}
            value={s.brief}
            onChange={(e) => s.setBrief(e.target.value)}
            placeholder={tx({ de: "z. B. Neues Winter-Menü in unserem Café: Zimt-Cappuccino, ab Montag, 20 % für Stammgäste.", en: "e.g. B. New winter menu in our café: cinnamon cappuccino, from Monday, 20% for regular guests.", es: "p.ej. B. Nuevo menú de invierno en nuestra cafetería: capuchino con canela, a partir del lunes, 20% para clientes habituales." })}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>Plattform</Label>
            <Select value={s.platform} onValueChange={s.setPlatform}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="instagram">Instagram</SelectItem>
                <SelectItem value="linkedin">LinkedIn</SelectItem>
                <SelectItem value="facebook">Facebook</SelectItem>
                <SelectItem value="tiktok">TikTok</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Sprache</Label>
            <Select value={s.language} onValueChange={s.setLanguage}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="de">Deutsch</SelectItem>
                <SelectItem value="en">Englisch</SelectItem>
                <SelectItem value="es">Spanisch</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Tonalität</Label>
            <Input value={s.tone} onChange={(e) => s.setTone(e.target.value)} />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="lg" className="flex-1" onClick={s.generateCopy} disabled={s.copyBusy}>
            {s.copyBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
            Copy erzeugen
          </Button>
          <Button size="lg" variant="outline" onClick={onOpenTemplates}>
            <BookTemplate className="mr-2 h-4 w-4" /> Vorlagen
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

export default BriefStep;
