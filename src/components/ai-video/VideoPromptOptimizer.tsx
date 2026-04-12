import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Sparkles, Check, Copy } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/useTranslation';

interface VideoPromptOptimizerProps {
  open: boolean;
  onClose: () => void;
  onPromptGenerated: (prompt: string) => void;
}

export function VideoPromptOptimizer({ open, onClose, onPromptGenerated }: VideoPromptOptimizerProps) {
  const { t } = useTranslation();
  const [basicIdea, setBasicIdea] = useState('');
  const [style, setStyle] = useState<string>('');
  const [mood, setMood] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [optimizedPrompt, setOptimizedPrompt] = useState<string>('');
  const [tips, setTips] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const handleOptimize = async () => {
    if (!basicIdea.trim()) {
      toast({ title: t('aiVid.optimizerTitle'), description: t('aiVid.errorNoIdea'), variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('optimize-video-prompt', {
        body: { basicIdea: basicIdea.trim(), style: style || undefined, mood: mood || undefined },
      });
      if (error) throw error;
      setOptimizedPrompt(data.optimizedPrompt);
      setTips(data.tips);
      toast({ title: t('aiVid.promptOptimized'), description: t('aiVid.promptOptimizedDesc') });
    } catch (error: any) {
      console.error('Error optimizing prompt:', error);
      toast({ title: t('aiVid.optimizerTitle'), description: t('aiVid.optimizeError'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(optimizedPrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: t('aiVid.copied'), description: t('aiVid.copiedToClipboard') });
  };

  const handleApply = () => {
    onPromptGenerated(optimizedPrompt);
    handleReset();
  };

  const handleReset = () => {
    setBasicIdea(''); setStyle(''); setMood('');
    setOptimizedPrompt(''); setTips([]); setCopied(false);
  };

  const handleClose = () => { handleReset(); onClose(); };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            {t('aiVid.optimizerTitle')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">{t('aiVid.yourVideoIdea')}</label>
            <Textarea
              value={basicIdea}
              onChange={(e) => setBasicIdea(e.target.value)}
              placeholder={t('aiVid.ideaPlaceholder')}
              className="min-h-[100px]"
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground mt-1">{t('aiVid.ideaHint')}</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">{t('aiVid.styleOptional')}</label>
              <Select value={style} onValueChange={setStyle} disabled={loading}>
                <SelectTrigger><SelectValue placeholder={t('aiVid.selectStyle')} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cinematic">Cinematic</SelectItem>
                  <SelectItem value="realistic">Realistic</SelectItem>
                  <SelectItem value="artistic">Artistic</SelectItem>
                  <SelectItem value="documentary">Documentary</SelectItem>
                  <SelectItem value="dreamy">Dreamy</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">{t('aiVid.moodOptional')}</label>
              <Select value={mood} onValueChange={setMood} disabled={loading}>
                <SelectTrigger><SelectValue placeholder={t('aiVid.selectMood')} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="energetic">Energetic</SelectItem>
                  <SelectItem value="calm">Calm</SelectItem>
                  <SelectItem value="dramatic">Dramatic</SelectItem>
                  <SelectItem value="joyful">Joyful</SelectItem>
                  <SelectItem value="mysterious">Mysterious</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button onClick={handleOptimize} disabled={loading || !basicIdea.trim()} className="w-full">
            {loading ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t('aiVid.optimizing')}</>
            ) : (
              <><Sparkles className="w-4 h-4 mr-2" />{t('aiVid.optimizeBtn')}</>
            )}
          </Button>

          {optimizedPrompt && (
            <div className="space-y-4 pt-4 border-t">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium">{t('aiVid.optimizedPrompt')}</label>
                  <Button variant="ghost" size="sm" onClick={handleCopy} className="h-8">
                    {copied ? <Check className="w-4 h-4 mr-1" /> : <Copy className="w-4 h-4 mr-1" />}
                    {copied ? t('aiVid.copied') : t('aiVid.copy')}
                  </Button>
                </div>
                <div className="bg-muted p-4 rounded-lg">
                  <p className="text-sm">{optimizedPrompt}</p>
                </div>
              </div>

              {tips.length > 0 && (
                <div>
                  <label className="text-sm font-medium mb-2 block">{t('aiVid.helpfulTips')}</label>
                  <ul className="space-y-2">
                    {tips.map((tip, index) => (
                      <li key={index} className="text-sm flex items-start gap-2">
                        <span className="text-primary">•</span>
                        <span>{tip}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <Button onClick={handleApply} className="w-full" variant="default">
                <Check className="w-4 h-4 mr-2" />{t('aiVid.applyPrompt')}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
