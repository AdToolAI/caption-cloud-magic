import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Sparkles, Target, Palette, Clock, Globe, Mic2, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { StylePreviewGrid } from '../StylePreviewGrid';
import { VoiceSelector } from '../VoiceSelector';
import { CharacterDefinitionCard } from '../CharacterDefinitionCard';
import type { 
  ExplainerBriefing, 
  ExplainerStyle, 
  ExplainerTone, 
  ExplainerDuration,
  ExplainerLanguage,
  CharacterDefinition
} from '@/types/explainer-studio';
import { TONE_OPTIONS, DURATION_OPTIONS, TARGET_AUDIENCE_OPTIONS } from '@/types/explainer-studio';

interface BriefingStepProps {
  initialBriefing: ExplainerBriefing | null;
  onComplete: (briefing: ExplainerBriefing) => void;
}

export function BriefingStep({ initialBriefing, onComplete }: BriefingStepProps) {
  const [productDescription, setProductDescription] = useState(initialBriefing?.productDescription || '');
  const [targetAudience, setTargetAudience] = useState<string[]>(initialBriefing?.targetAudience || []);
  const [style, setStyle] = useState<ExplainerStyle>(initialBriefing?.style || 'flat-design');
  const [tone, setTone] = useState<ExplainerTone>(initialBriefing?.tone || 'professional');
  const [duration, setDuration] = useState<ExplainerDuration>(initialBriefing?.duration || 60);
  const [language, setLanguage] = useState<ExplainerLanguage>(initialBriefing?.language || 'de');
  const [voiceId, setVoiceId] = useState(initialBriefing?.voiceId || 'EXAVITQu4vr4xnSDxMaL');
  const [voiceName, setVoiceName] = useState(initialBriefing?.voiceName || 'Sarah');
  const [customAudience, setCustomAudience] = useState('');
  const [character, setCharacter] = useState<CharacterDefinition>(
    initialBriefing?.character || { hasCharacter: false }
  );

  const toggleAudience = (audience: string) => {
    setTargetAudience(prev => 
      prev.includes(audience) 
        ? prev.filter(a => a !== audience)
        : [...prev, audience]
    );
  };

  const addCustomAudience = () => {
    if (customAudience.trim() && !targetAudience.includes(customAudience.trim())) {
      setTargetAudience(prev => [...prev, customAudience.trim()]);
      setCustomAudience('');
    }
  };

  const isValid = productDescription.length >= 20 && targetAudience.length > 0;

  const handleSubmit = () => {
    if (!isValid) return;
    
    onComplete({
      productDescription,
      targetAudience,
      style,
      tone,
      duration,
      language,
      voiceId,
      voiceName,
      character,
    });
  };

  return (
    <div className="space-y-8">
      {/* Section 1: Product Description */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card/60 backdrop-blur-xl border border-white/10 rounded-2xl p-6"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Was möchtest du erklären?</h3>
            <p className="text-sm text-muted-foreground">Beschreibe dein Produkt oder deine Dienstleistung</p>
          </div>
        </div>
        
        <Textarea
          value={productDescription}
          onChange={(e) => setProductDescription(e.target.value)}
          placeholder="Unser SaaS-Tool hilft Marketing-Teams ihre Social Media Posts automatisch zu planen und zu veröffentlichen. Nutzer können Kampagnen erstellen, Content im Voraus planen und Performance-Analysen einsehen..."
          className="min-h-[150px] bg-muted/20 border-white/10 focus:border-primary/60 resize-none"
        />
        <div className="flex justify-between mt-2">
          <span className={cn(
            "text-xs",
            productDescription.length < 20 ? "text-destructive" : "text-muted-foreground"
          )}>
            {productDescription.length}/20 Zeichen minimum
          </span>
          <span className="text-xs text-muted-foreground">
            ~{Math.ceil(productDescription.length / 15)} Wörter
          </span>
        </div>
      </motion.div>

      {/* Section 2: Target Audience */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-card/60 backdrop-blur-xl border border-white/10 rounded-2xl p-6"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center">
            <Target className="h-5 w-5 text-cyan-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Zielgruppe</h3>
            <p className="text-sm text-muted-foreground">Für wen ist das Erklärvideo?</p>
          </div>
        </div>
        
        <div className="flex flex-wrap gap-2 mb-4">
          {TARGET_AUDIENCE_OPTIONS.map((audience) => (
            <Badge
              key={audience}
              variant={targetAudience.includes(audience) ? "default" : "outline"}
              className={cn(
                "cursor-pointer transition-all duration-200 px-3 py-1.5",
                targetAudience.includes(audience) 
                  ? "bg-primary/20 text-primary border-primary/50 hover:bg-primary/30" 
                  : "bg-muted/20 border-white/10 hover:bg-muted/40 hover:border-white/20"
              )}
              onClick={() => toggleAudience(audience)}
            >
              {targetAudience.includes(audience) && <Check className="h-3 w-3 mr-1" />}
              {audience}
            </Badge>
          ))}
        </div>

        {/* Selected audiences */}
        {targetAudience.filter(a => !TARGET_AUDIENCE_OPTIONS.includes(a)).length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {targetAudience.filter(a => !TARGET_AUDIENCE_OPTIONS.includes(a)).map((audience) => (
              <Badge
                key={audience}
                className="bg-primary/20 text-primary border-primary/50 px-3 py-1.5"
              >
                {audience}
                <X 
                  className="h-3 w-3 ml-1 cursor-pointer hover:text-destructive" 
                  onClick={() => toggleAudience(audience)}
                />
              </Badge>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <input
            type="text"
            value={customAudience}
            onChange={(e) => setCustomAudience(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addCustomAudience()}
            placeholder="Eigene Zielgruppe hinzufügen..."
            className="flex-1 bg-muted/20 border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-primary/60 focus:outline-none"
          />
          <Button variant="outline" size="sm" onClick={addCustomAudience}>
            Hinzufügen
          </Button>
        </div>
      </motion.div>

      {/* Section 3: Style Selection */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-card/60 backdrop-blur-xl border border-white/10 rounded-2xl p-6"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
            <Palette className="h-5 w-5 text-purple-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Visueller Stil</h3>
            <p className="text-sm text-muted-foreground">Wähle den Look deines Erklärvideos</p>
          </div>
        </div>
        
        <StylePreviewGrid selectedStyle={style} onSelectStyle={setStyle} />
      </motion.div>

      {/* Section 3b: Character Definition */}
      <CharacterDefinitionCard
        character={character}
        style={style}
        onChange={setCharacter}
      />

      {/* Section 4: Tone & Duration */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="grid grid-cols-1 md:grid-cols-2 gap-6"
      >
        {/* Tone */}
        <div className="bg-card/60 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
          <Label className="text-base font-semibold mb-4 block">Tonalität</Label>
          <div className="grid grid-cols-2 gap-2">
            {TONE_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => setTone(option.value)}
                className={cn(
                  "flex items-center gap-2 p-3 rounded-xl border transition-all duration-200",
                  tone === option.value
                    ? "bg-primary/20 border-primary/50 text-primary"
                    : "bg-muted/20 border-white/10 hover:bg-muted/40"
                )}
              >
                <span className="text-xl">{option.emoji}</span>
                <span className="text-sm font-medium">{option.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Duration */}
        <div className="bg-card/60 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <Label className="text-base font-semibold">Video-Länge</Label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {DURATION_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => setDuration(option.value)}
                className={cn(
                  "flex flex-col items-center p-3 rounded-xl border transition-all duration-200",
                  duration === option.value
                    ? "bg-primary/20 border-primary/50 text-primary"
                    : "bg-muted/20 border-white/10 hover:bg-muted/40"
                )}
              >
                <span className="text-lg font-semibold">{option.label}</span>
                <span className="text-xs text-muted-foreground">{option.description}</span>
              </button>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Section 5: Voice Selection */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="bg-card/60 backdrop-blur-xl border border-white/10 rounded-2xl p-6"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center">
            <Mic2 className="h-5 w-5 text-green-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Sprache & Stimme</h3>
            <p className="text-sm text-muted-foreground">Wähle die Sprache und Sprecherstimme</p>
          </div>
        </div>
        
        <VoiceSelector
          selectedVoiceId={voiceId}
          selectedLanguage={language}
          onSelectVoice={(id, name) => {
            setVoiceId(id);
            setVoiceName(name);
          }}
          onSelectLanguage={setLanguage}
        />
      </motion.div>

      {/* Submit Button */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="flex justify-end"
      >
        <Button
          onClick={handleSubmit}
          disabled={!isValid}
          size="lg"
          className={cn(
            "relative overflow-hidden group px-8",
            "bg-gradient-to-r from-primary via-primary to-purple-500",
            "hover:shadow-[0_0_30px_rgba(245,199,106,0.4)]",
            "transition-all duration-300"
          )}
        >
          <span className="relative z-10 flex items-center gap-2">
            Weiter zum Drehbuch
            <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
          </span>
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
            initial={{ x: '-100%' }}
            animate={{ x: '100%' }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          />
        </Button>
      </motion.div>
    </div>
  );
}
