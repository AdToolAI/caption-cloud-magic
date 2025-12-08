import { useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sparkles, Upload, Link as LinkIcon, CheckCircle2, FileType, Loader2 } from 'lucide-react';
import { useTemplateGenerator } from '@/hooks/useTemplateGenerator';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { TemplateGeneratorHeroHeader } from '@/components/template-generator/TemplateGeneratorHeroHeader';
import { cn } from '@/lib/utils';

export default function TemplateGenerator() {
  const [templateName, setTemplateName] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const { loading, generatedTemplate, generateFromPost } = useTemplateGenerator();
  const { toast } = useToast();

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadedFile(file);
    setIsUploading(true);

    const fileName = `template-sources/${Date.now()}_${file.name}`;
    const { data, error } = await supabase.storage
      .from('media-assets')
      .upload(fileName, file);

    if (error) {
      toast({
        title: 'Fehler',
        description: 'Upload fehlgeschlagen',
        variant: 'destructive',
      });
      setIsUploading(false);
      return;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('media-assets')
      .getPublicUrl(fileName);

    setSourceUrl(publicUrl);
    setIsUploading(false);
  };

  const handleGenerate = async () => {
    if (!templateName) {
      toast({
        title: 'Fehler',
        description: 'Bitte gib einen Template-Namen ein',
        variant: 'destructive',
      });
      return;
    }

    if (!sourceUrl) {
      toast({
        title: 'Fehler',
        description: 'Bitte lade eine Datei hoch oder gib eine URL ein',
        variant: 'destructive',
      });
      return;
    }

    await generateFromPost({
      source_url: sourceUrl,
      template_name: templateName,
    });
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <TemplateGeneratorHeroHeader />

      <div className="grid gap-6">
        {/* Main Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="relative backdrop-blur-xl bg-card/60 border border-white/10 rounded-2xl p-6 
                     shadow-[0_0_40px_hsla(43,90%,68%,0.05)]"
        >
          {/* Card Glow */}
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 rounded-2xl pointer-events-none" />
          
          <div className="relative space-y-6">
            {/* Header */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center
                              shadow-[0_0_20px_hsla(43,90%,68%,0.2)]">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <h3 className="text-lg font-semibold">Quelle auswählen</h3>
            </div>

            {/* Template Name Input */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-muted-foreground">Template Name</Label>
              <Input
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="z.B. Produkt Showcase"
                className="h-12 bg-muted/20 border-white/10 focus:border-primary/60 
                           focus:ring-2 focus:ring-primary/20 transition-all"
              />
            </div>

            {/* Upload Zone */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-muted-foreground">Option 1: Video/Bild hochladen</Label>
              <motion.label
                whileHover={{ scale: 1.005 }}
                whileTap={{ scale: 0.995 }}
                className={cn(
                  "flex flex-col items-center justify-center gap-3 p-10",
                  "rounded-xl backdrop-blur-md bg-muted/10",
                  "border-2 border-dashed border-white/20",
                  "hover:border-primary/60 hover:bg-primary/5",
                  "hover:shadow-[0_0_30px_hsla(43,90%,68%,0.15)]",
                  "cursor-pointer transition-all duration-300",
                  uploadedFile && "border-primary/60 bg-primary/5"
                )}
              >
                <motion.div
                  animate={isUploading ? { rotate: 360 } : {}}
                  transition={{ duration: 1, repeat: isUploading ? Infinity : 0, ease: "linear" }}
                  className={cn(
                    "w-14 h-14 rounded-2xl flex items-center justify-center",
                    "bg-primary/10 border border-primary/30",
                    uploadedFile && "bg-green-500/10 border-green-500/30"
                  )}
                >
                  {isUploading ? (
                    <Loader2 className="h-6 w-6 text-primary" />
                  ) : uploadedFile ? (
                    <CheckCircle2 className="h-6 w-6 text-green-400" />
                  ) : (
                    <Upload className="h-6 w-6 text-primary" />
                  )}
                </motion.div>
                <div className="text-center">
                  <span className="font-medium">
                    {uploadedFile ? uploadedFile.name : 'Datei hochladen'}
                  </span>
                  {!uploadedFile && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Video oder Bild (max. 100MB)
                    </p>
                  )}
                </div>
                <input
                  type="file"
                  accept="image/*,video/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </motion.label>
            </div>

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-white/10" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card/60 px-4 text-muted-foreground font-medium">Oder</span>
              </div>
            </div>

            {/* URL Input */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-muted-foreground">Option 2: URL eingeben</Label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2">
                  <LinkIcon className="h-4 w-4 text-muted-foreground" />
                </div>
                <Input
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  placeholder="https://..."
                  disabled={!!uploadedFile}
                  className="h-12 pl-11 bg-muted/20 border-white/10 focus:border-primary/60 
                             focus:ring-2 focus:ring-primary/20 transition-all
                             disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
            </div>

            {/* Generate Button */}
            <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
              <Button
                onClick={handleGenerate}
                disabled={loading || !templateName || !sourceUrl}
                className="w-full h-14 text-base font-semibold relative overflow-hidden group
                           bg-gradient-to-r from-primary to-primary/80
                           hover:shadow-[0_0_30px_hsla(43,90%,68%,0.4)]
                           disabled:opacity-50 disabled:hover:shadow-none
                           transition-all duration-300"
              >
                {/* Shimmer Effect */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent 
                                translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                <span className="relative flex items-center gap-2">
                  {loading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Sparkles className="h-5 w-5" />
                  )}
                  {loading ? 'Generiere Template...' : 'Template generieren'}
                </span>
              </Button>
            </motion.div>
          </div>
        </motion.div>

        {/* Result Card */}
        {generatedTemplate && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.4 }}
            className="relative backdrop-blur-xl bg-card/60 border border-white/10 rounded-2xl p-6
                       shadow-[0_0_40px_hsla(120,60%,50%,0.1)]"
          >
            {/* Success Glow */}
            <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 via-transparent to-primary/5 rounded-2xl pointer-events-none" />
            
            <div className="relative space-y-5">
              {/* Success Header */}
              <div className="flex items-center gap-3">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
                  className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center
                              shadow-[0_0_20px_hsla(120,60%,50%,0.2)]"
                >
                  <CheckCircle2 className="h-5 w-5 text-green-400" />
                </motion.div>
                <h3 className="text-lg font-semibold">Template erstellt</h3>
              </div>

              {/* Template Name */}
              <div className="p-4 rounded-xl bg-muted/20 border border-white/5">
                <p className="text-xs text-muted-foreground mb-1">Name</p>
                <p className="font-medium">{generatedTemplate.template_name}</p>
              </div>

              {/* Customizable Fields */}
              {generatedTemplate.customizable_fields && generatedTemplate.customizable_fields.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Anpassbare Felder</p>
                  <div className="flex flex-wrap gap-2">
                    {generatedTemplate.customizable_fields.map((field: any, idx: number) => (
                      <motion.div
                        key={idx}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.3 + idx * 0.1 }}
                        className="px-3 py-1.5 rounded-full bg-primary/10 border border-primary/30 text-sm font-medium"
                      >
                        <FileType className="h-3 w-3 inline mr-1.5 text-primary" />
                        {field.label}
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}

              {/* Extracted Style */}
              {generatedTemplate.extracted_style && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Extrahierter Stil</p>
                  <div className="p-4 rounded-xl bg-muted/20 border border-white/5 overflow-auto">
                    <pre className="text-xs text-muted-foreground font-mono">
                      {JSON.stringify(generatedTemplate.extracted_style, null, 2)}
                    </pre>
                  </div>
                </div>
              )}

              {/* Action Button */}
              <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
                <Button
                  onClick={() => {
                    window.location.href = '/content-studio';
                  }}
                  variant="outline"
                  className="w-full h-12 border-white/20 hover:border-primary/60 
                             hover:bg-primary/10 transition-all duration-300"
                >
                  Template im Content Studio verwenden
                </Button>
              </motion.div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
