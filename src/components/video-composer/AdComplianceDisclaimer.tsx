import { tx } from "@/lib/i18nText";
import { ShieldAlert } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { getLang } from '@/lib/i18nText';

interface AdComplianceDisclaimerProps {
  acknowledged: boolean;
  onAcknowledge: (next: boolean) => void;
  language?: 'de' | 'en' | 'es';
  className?: string;
}

const COPY = {
  de: {
    title: tx({ de: 'Rechtlicher Hinweis — Markenrecht & EU AI Act', en: 'Legal Notice — Trademark Law & EU AI Act', es: 'Aviso legal: Ley de Marcas y Ley de IA de la UE' }),
    body: tx({ de: 'Du erstellst einen KI-generierten Werbespot. Bitte verwende keine geschützten Markennamen, Logos oder Tonalitäten Dritter (z. B. konkrete Wettbewerbermarken). Inhalte müssen nach EU AI Act Art. 50 als KI-generiert kennzeichenbar sein. Du allein bist für die Veröffentlichung und markenrechtliche Prüfung verantwortlich.', en: 'You are creating an AI-generated commercial. Please do not use protected brand names, logos, or third-party tonalities (e.g., specific competitor brands). Content must be identifiable as AI-generated according to EU AI Act Art. 50. You alone are responsible for publication and trademark review.', es: 'Estás creando un anuncio generado por IA. Por favor, no utilices nombres de marca protegidos, logotipos o tonalidades de terceros (por ejemplo, marcas de la competencia específicas). El contenido debe ser identificable como generado por IA según el Art. 50 de la Ley de IA de la UE. Tú eres el único responsable de la publicación y la revisión de marcas.' }),
    ack: tx({ de: 'Ich verstehe und übernehme die Verantwortung für die Veröffentlichung dieses Inhalts.', en: 'I understand and take responsibility for publishing this content.', es: 'Entiendo y asumo la responsabilidad de publicar este contenido.' }),
  },
  en: {
    title: 'Legal Notice — Trademark & EU AI Act',
    body: 'You are creating an AI-generated commercial. Do not use trademarked third-party brand names, logos or distinctive tonalities (e.g. specific competitor brands). Content must be disclosable as AI-generated under EU AI Act Art. 50. You are solely responsible for publishing and trademark clearance.',
    ack: 'I understand and accept responsibility for publishing this content.',
  },
  es: {
    title: 'Aviso legal — Marcas y EU AI Act',
    body: 'Estás creando un anuncio generado por IA. No uses nombres de marcas, logos o tonalidades protegidas de terceros (p. ej. marcas competidoras concretas). El contenido debe poder declararse como generado por IA según el art. 50 del EU AI Act. Eres el único responsable de su publicación y verificación de marcas.',
    ack: 'Entiendo y acepto la responsabilidad de publicar este contenido.',
  },
};

export default function AdComplianceDisclaimer({
  acknowledged,
  onAcknowledge,
  language = getLang(),
  className,
}: AdComplianceDisclaimerProps) {
  const copy = COPY[language] ?? COPY.en;
  return (
    <div
      className={cn(
        'rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-3',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <ShieldAlert className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
        <div className="flex-1 space-y-1">
          <p className="text-sm font-semibold text-amber-200">{copy.title}</p>
          <p className="text-xs text-muted-foreground leading-relaxed">{copy.body}</p>
        </div>
      </div>
      <div className="flex items-start gap-2 pl-8">
        <Checkbox
          id="ad-compliance-ack"
          checked={acknowledged}
          onCheckedChange={(v) => onAcknowledge(v === true)}
        />
        <Label
          htmlFor="ad-compliance-ack"
          className="text-xs text-foreground/90 leading-relaxed cursor-pointer"
        >
          {copy.ack}
        </Label>
      </div>
    </div>
  );
}
