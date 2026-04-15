import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ChevronDown, ChevronUp, ArrowLeft, Rocket, Building2, Target, 
  BookOpen, Palette, User, Music, Settings, Sparkles 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/hooks/useTranslation';
import type { 
  UniversalConsultationResult, 
  UniversalVideoStyle, 
  StorytellingStructure 
} from '@/types/universal-video-creator';

interface ConceptReviewEditorProps {
  recommendation: UniversalConsultationResult;
  onConfirm: (edited: UniversalConsultationResult) => void;
  onBack: () => void;
}

const VISUAL_STYLES: { value: UniversalVideoStyle; label: string }[] = [
  { value: 'modern-3d', label: 'Modern 3D' },
  { value: 'cinematic', label: 'Cinematic' },
  { value: 'flat-design', label: 'Flat Design' },
  { value: 'isometric', label: 'Isometric' },
  { value: 'whiteboard', label: 'Whiteboard' },
  { value: 'comic', label: 'Comic' },
  { value: 'corporate', label: 'Corporate' },
  { value: 'documentary', label: 'Documentary' },
  { value: 'minimalist', label: 'Minimalist' },
  { value: 'bold-colorful', label: 'Bold & Colorful' },
  { value: 'vintage-retro', label: 'Vintage / Retro' },
  { value: 'hand-drawn', label: 'Hand-drawn' },
  { value: 'motion-graphics', label: 'Motion Graphics' },
  { value: 'photo-realistic', label: 'Photo-realistic' },
  { value: 'cartoon', label: 'Cartoon' },
  { value: 'watercolor', label: 'Watercolor' },
  { value: 'neon-cyberpunk', label: 'Neon / Cyberpunk' },
  { value: 'paper-cutout', label: 'Paper Cutout' },
  { value: 'clay-3d', label: 'Clay 3D' },
  { value: 'anime', label: 'Anime' },
  { value: 'custom', label: 'Custom' },
];

const STORYTELLING_STRUCTURES: { value: StorytellingStructure; label: string }[] = [
  { value: 'problem-solution', label: 'Problem → Solution' },
  { value: '3-act', label: '3-Act Structure' },
  { value: 'hero-journey', label: "Hero's Journey" },
  { value: 'aida', label: 'AIDA' },
  { value: 'feature-showcase', label: 'Feature Showcase' },
  { value: 'testimonial-arc', label: 'Testimonial Arc' },
  { value: 'before-after', label: 'Before / After' },
  { value: 'comparison', label: 'Comparison' },
  { value: 'list-format', label: 'List Format' },
  { value: 'hook-value-cta', label: 'Hook → Value → CTA' },
];

interface SectionProps {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function CollapsibleSection({ icon, title, children, defaultOpen = false }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div 
      className="rounded-xl overflow-hidden border border-white/8"
      style={{ background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(12px)' }}
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gold/10 border border-gold/20 flex items-center justify-center text-gold">
            {icon}
          </div>
          <span className="font-heading font-semibold text-foreground/90">{title}</span>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 grid gap-4">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-xs font-medium text-muted-foreground/70 uppercase tracking-wider">{children}</label>;
}

const fieldClass = "bg-background/30 border-white/10 focus:border-gold/40 focus:ring-gold/20 text-sm";

export function ConceptReviewEditor({ recommendation, onConfirm, onBack }: ConceptReviewEditorProps) {
  const { t } = useTranslation();
  const [data, setData] = useState<UniversalConsultationResult>({ ...recommendation });

  const update = <K extends keyof UniversalConsultationResult>(key: K, value: UniversalConsultationResult[K]) => {
    setData(prev => ({ ...prev, [key]: value }));
  };

  const handleConfirm = () => {
    onConfirm({ ...data, completedAt: new Date().toISOString() });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="max-w-3xl mx-auto"
    >
      {/* Header */}
      <div 
        className="mb-6 p-5 rounded-2xl flex items-center gap-4"
        style={{
          background: 'linear-gradient(135deg, rgba(5,8,22,0.95) 0%, rgba(15,23,42,0.9) 100%)',
          border: '1px solid rgba(245,199,106,0.2)',
          boxShadow: '0 0 40px rgba(245,199,106,0.08)'
        }}
      >
        <div className="w-10 h-10 rounded-xl bg-gold/10 border border-gold/30 flex items-center justify-center">
          <Sparkles className="h-5 w-5 text-gold" />
        </div>
        <div className="flex-1">
          <h3 className="font-heading text-lg font-bold bg-gradient-to-r from-gold to-amber-300 bg-clip-text text-transparent">
            {t('uvc.reviewTitle') !== 'uvc.reviewTitle' ? t('uvc.reviewTitle') : 'Konzept prüfen & anpassen'}
          </h3>
          <p className="text-xs text-muted-foreground/70">
            {t('uvc.reviewSubtitle') !== 'uvc.reviewSubtitle' ? t('uvc.reviewSubtitle') : 'Überprüfe die gesammelten Informationen und passe sie bei Bedarf an.'}
          </p>
        </div>
      </div>

      {/* Sections */}
      <div className="space-y-3 mb-6">
        {/* Basic Info */}
        <CollapsibleSection icon={<Building2 className="h-4 w-4" />} title={t('uvc.reviewBasicInfo') !== 'uvc.reviewBasicInfo' ? t('uvc.reviewBasicInfo') as string : 'Grundinformationen'} defaultOpen>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <FieldLabel>Projektname</FieldLabel>
              <Input value={data.projectName} onChange={e => update('projectName', e.target.value)} className={fieldClass} />
            </div>
            <div className="space-y-1.5">
              <FieldLabel>Firma</FieldLabel>
              <Input value={data.companyName} onChange={e => update('companyName', e.target.value)} className={fieldClass} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <FieldLabel>Produkt / Service</FieldLabel>
              <Input value={data.productName} onChange={e => update('productName', e.target.value)} className={fieldClass} />
            </div>
            <div className="space-y-1.5">
              <FieldLabel>CTA</FieldLabel>
              <Input value={data.ctaText} onChange={e => update('ctaText', e.target.value)} className={fieldClass} />
            </div>
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Produktbeschreibung</FieldLabel>
            <Textarea value={data.productDescription} onChange={e => update('productDescription', e.target.value)} className={cn(fieldClass, 'min-h-[60px]')} rows={2} />
          </div>
        </CollapsibleSection>

        {/* Target Audience */}
        <CollapsibleSection icon={<Target className="h-4 w-4" />} title={t('uvc.reviewTargetAudience') !== 'uvc.reviewTargetAudience' ? t('uvc.reviewTargetAudience') as string : 'Zielgruppe'}>
          <div className="space-y-1.5">
            <FieldLabel>Zielgruppe</FieldLabel>
            <Input value={data.targetAudience} onChange={e => update('targetAudience', e.target.value)} className={fieldClass} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <FieldLabel>Alter</FieldLabel>
              <Input value={data.targetAudienceAge || ''} onChange={e => update('targetAudienceAge', e.target.value)} className={fieldClass} placeholder="z.B. 25-45" />
            </div>
            <div className="space-y-1.5">
              <FieldLabel>Geschlecht</FieldLabel>
              <Input value={data.targetAudienceGender || ''} onChange={e => update('targetAudienceGender', e.target.value)} className={fieldClass} placeholder="z.B. Alle" />
            </div>
          </div>
        </CollapsibleSection>

        {/* Storytelling */}
        <CollapsibleSection icon={<BookOpen className="h-4 w-4" />} title={t('uvc.reviewStorytelling') !== 'uvc.reviewStorytelling' ? t('uvc.reviewStorytelling') as string : 'Storytelling'}>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <FieldLabel>Struktur</FieldLabel>
              <Select value={data.storytellingStructure} onValueChange={v => update('storytellingStructure', v as StorytellingStructure)}>
                <SelectTrigger className={fieldClass}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STORYTELLING_STRUCTURES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <FieldLabel>Emotionaler Ton</FieldLabel>
              <Input value={data.emotionalTone} onChange={e => update('emotionalTone', e.target.value)} className={fieldClass} />
            </div>
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Kernbotschaft</FieldLabel>
            <Input value={data.keyMessage} onChange={e => update('keyMessage', e.target.value)} className={fieldClass} />
          </div>
        </CollapsibleSection>

        {/* Visual Style */}
        <CollapsibleSection icon={<Palette className="h-4 w-4" />} title={t('uvc.reviewVisualStyle') !== 'uvc.reviewVisualStyle' ? t('uvc.reviewVisualStyle') as string : 'Visueller Stil'}>
          <div className="space-y-1.5">
            <FieldLabel>Stil</FieldLabel>
            <Select value={data.visualStyle} onValueChange={v => update('visualStyle', v as UniversalVideoStyle)}>
              <SelectTrigger className={fieldClass}><SelectValue /></SelectTrigger>
              <SelectContent>
                {VISUAL_STYLES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Markenfarben (kommagetrennt)</FieldLabel>
            <Input 
              value={(data.brandColors || []).join(', ')} 
              onChange={e => update('brandColors', e.target.value.split(',').map(c => c.trim()).filter(Boolean))} 
              className={fieldClass} 
              placeholder="#FF6600, #333333"
            />
          </div>
        </CollapsibleSection>

        {/* Character */}
        <CollapsibleSection icon={<User className="h-4 w-4" />} title={t('uvc.reviewCharacter') !== 'uvc.reviewCharacter' ? t('uvc.reviewCharacter') as string : 'Charakter'}>
          <div className="flex items-center gap-3">
            <FieldLabel>Charakter verwenden</FieldLabel>
            <button 
              onClick={() => update('hasCharacter', !data.hasCharacter)}
              className={cn(
                "w-10 h-6 rounded-full transition-colors relative",
                data.hasCharacter ? 'bg-gold/60' : 'bg-muted/30'
              )}
            >
              <div className={cn(
                "w-4 h-4 rounded-full bg-white absolute top-1 transition-all",
                data.hasCharacter ? 'left-5' : 'left-1'
              )} />
            </button>
          </div>
          {data.hasCharacter && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <FieldLabel>Name</FieldLabel>
                <Input value={data.characterName || ''} onChange={e => update('characterName', e.target.value)} className={fieldClass} />
              </div>
              <div className="space-y-1.5">
                <FieldLabel>Geschlecht</FieldLabel>
                <Select value={data.characterGender || 'neutral'} onValueChange={v => update('characterGender', v as any)}>
                  <SelectTrigger className={fieldClass}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Männlich</SelectItem>
                    <SelectItem value="female">Weiblich</SelectItem>
                    <SelectItem value="neutral">Neutral</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1.5">
                <FieldLabel>Beschreibung</FieldLabel>
                <Textarea value={data.characterDescription || ''} onChange={e => update('characterDescription', e.target.value)} className={cn(fieldClass, 'min-h-[50px]')} rows={2} />
              </div>
            </div>
          )}
        </CollapsibleSection>

        {/* Audio */}
        <CollapsibleSection icon={<Music className="h-4 w-4" />} title={t('uvc.reviewAudio') !== 'uvc.reviewAudio' ? t('uvc.reviewAudio') as string : 'Audio & Stimme'}>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <FieldLabel>Stimme</FieldLabel>
              <Select value={data.voiceGender} onValueChange={v => update('voiceGender', v as any)}>
                <SelectTrigger className={fieldClass}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Männlich</SelectItem>
                  <SelectItem value="female">Weiblich</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <FieldLabel>Sprache</FieldLabel>
              <Input value={data.voiceLanguage} onChange={e => update('voiceLanguage', e.target.value)} className={fieldClass} />
            </div>
            <div className="space-y-1.5">
              <FieldLabel>Ton</FieldLabel>
              <Input value={data.voiceTone} onChange={e => update('voiceTone', e.target.value)} className={fieldClass} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <FieldLabel>Musikstil</FieldLabel>
              <Input value={data.musicStyle} onChange={e => update('musicStyle', e.target.value)} className={fieldClass} />
            </div>
            <div className="space-y-1.5">
              <FieldLabel>Musik-Stimmung</FieldLabel>
              <Input value={data.musicMood} onChange={e => update('musicMood', e.target.value)} className={fieldClass} />
            </div>
          </div>
        </CollapsibleSection>

        {/* Technical */}
        <CollapsibleSection icon={<Settings className="h-4 w-4" />} title={t('uvc.reviewTechnical') !== 'uvc.reviewTechnical' ? t('uvc.reviewTechnical') as string : 'Technisch'}>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <FieldLabel>Dauer</FieldLabel>
                <span className="text-xs text-gold font-medium">{data.videoDuration}s</span>
              </div>
              <Slider 
                value={[data.videoDuration]} 
                onValueChange={([v]) => update('videoDuration', v)} 
                min={15} max={300} step={5} 
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <FieldLabel>Seitenverhältnis</FieldLabel>
              <Select value={data.aspectRatio} onValueChange={v => update('aspectRatio', v as any)}>
                <SelectTrigger className={fieldClass}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="16:9">16:9 (Landscape)</SelectItem>
                  <SelectItem value="9:16">9:16 (Portrait)</SelectItem>
                  <SelectItem value="1:1">1:1 (Square)</SelectItem>
                  <SelectItem value="4:5">4:5 (Social)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <FieldLabel>Ausgabeformate</FieldLabel>
              <div className="flex gap-2 flex-wrap">
                {(['16:9', '9:16', '1:1', '4:5'] as const).map(fmt => (
                  <button
                    key={fmt}
                    onClick={() => {
                      const cur = data.outputFormats || [];
                      update('outputFormats', cur.includes(fmt) ? cur.filter(f => f !== fmt) : [...cur, fmt]);
                    }}
                    className={cn(
                      "px-2.5 py-1 text-xs rounded-lg border transition-all",
                      (data.outputFormats || []).includes(fmt) 
                        ? 'bg-gold/20 border-gold/40 text-gold' 
                        : 'bg-white/5 border-white/10 text-muted-foreground hover:border-white/20'
                    )}
                  >
                    {fmt}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </CollapsibleSection>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <Button
          variant="outline"
          onClick={onBack}
          className="flex-1 border-white/10 hover:border-gold/30 hover:bg-gold/5"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          {t('uvc.reviewBackToInterview') !== 'uvc.reviewBackToInterview' ? t('uvc.reviewBackToInterview') : 'Zurück zum Interview'}
        </Button>
        <Button
          onClick={handleConfirm}
          className={cn(
            "flex-1 bg-gradient-to-r from-gold via-amber-400 to-gold text-black font-semibold",
            "hover:shadow-[0_0_30px_rgba(245,199,106,0.4)] transition-all duration-300 border-0"
          )}
        >
          <Rocket className="h-4 w-4 mr-2" />
          {t('uvc.reviewGenerateVideo') !== 'uvc.reviewGenerateVideo' ? t('uvc.reviewGenerateVideo') : 'Video generieren'}
        </Button>
      </div>
    </motion.div>
  );
}
