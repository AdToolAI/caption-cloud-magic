import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { 
  Loader2, Upload, Trash2, Paintbrush, Download, 
  Sparkles, Copy, Check, Star, BarChart3, Settings, Pencil, Archive, ArchiveRestore, RefreshCw
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { isSubscribed } from "@/config/pricing";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { PlanLimitDialog } from "@/components/performance/PlanLimitDialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { OnboardingWizard } from "@/components/brand/OnboardingWizard";
import { BrandBoard } from "@/components/brand/BrandBoard";
import { ConsistencyScore } from "@/components/brand/ConsistencyScore";
import { ActiveBrandSelector } from "@/components/brand/ActiveBrandSelector";
import { BrandKitHeroHeader } from "@/components/brand/BrandKitHeroHeader";
import { BrandVault } from "@/components/brand/BrandVault";
import { BrandDnaExtractor } from "@/components/brand/BrandDnaExtractor";
import { BrandDnaRefreshDialog } from "@/components/brand/BrandDnaRefreshDialog";
import { BrandVoiceLibrary } from "@/components/brand/BrandVoiceLibrary";
import { BrandAssetFactory } from "@/components/brand/BrandAssetFactory";
import { BrandDriftDossier } from "@/components/brand/BrandDriftDossier";
import { BrandShareExport } from "@/components/brand/BrandShareExport";
import { BrandTrendsRadar } from "@/components/brand/BrandTrendsRadar";
import type { BrandDnaResult } from "@/hooks/useBrandDnaExtractor";
import { tx } from "@/lib/i18nText";
import { uiLocale } from '@/lib/uiLocale';

const BrandKit = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { subscribed, productId } = useAuth();

  const [showWizard, setShowWizard] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [showPlanLimit, setShowPlanLimit] = useState(false);
  const [activeTab, setActiveTab] = useState("create");
  const [copiedText, setCopiedText] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [renameTarget, setRenameTarget] = useState<any>(null);
  const [renameValue, setRenameValue] = useState("");
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [extractedDna, setExtractedDna] = useState<BrandDnaResult | null>(null);
  const [refreshTarget, setRefreshTarget] = useState<any>(null);

  const [formData, setFormData] = useState({
    brandName: "",
    targetAudience: "",
    brandDescription: "",
    brandValues: [] as string[],
    keywords: [] as string[],
    palette: [] as string[],
    tonePreference: "",
    stylePreference: "",
    moodPreference: "",
    fontHeadline: "",
    fontBody: "",
    websiteUrl: "",
    primaryColor: "#6366F1",
    secondaryColor: ""
  });

  const isPro = isSubscribed(subscribed, productId);

  // Fetch existing brand kits
  const { data: brandKits = [], isLoading } = useQuery({
    queryKey: ['brand-kits'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      
      const { data, error } = await supabase
        .from('brand_kits')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    }
  });

  const visibleBrandKits = showArchived ? brandKits : brandKits.filter((kit: any) => !kit.archived_at);
  const nonArchivedKits = brandKits.filter((kit: any) => !kit.archived_at);
  const activeBrandKit = nonArchivedKits.find((kit: any) => kit.is_active) || nonArchivedKits[0];

  // Show wizard for first-time users
  useEffect(() => {
    if (!isLoading && brandKits.length === 0) {
      setShowWizard(true);
    }
  }, [isLoading, brandKits.length]);

  const setActiveMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('brand_kits')
        .update({ is_active: true })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brand-kits'] });
      toast({
        title: tx({ de: "Aktives Marken-Set geändert", en: "Active Brand Kit Changed", es: "Kit de marca activo cambiado" }),
        description: tx({ de: "Das neue Marken-Set wird jetzt in allen Tools verwendet", en: "The new brand set is now used across all tools", es: "El nuevo set de marca ahora se usa en todas las herramientas" })
      });
    }
  });

  const REFERENCING_TABLES: { table: string; label: { de: string; en: string; es: string } }[] = [
    { table: 'carousel_projects', label: { de: 'Carousel-Projekte', en: 'carousel projects', es: 'proyectos de carrusel' } },
    { table: 'composer_projects', label: { de: 'Composer-Projekte', en: 'composer projects', es: 'proyectos de composer' } },
    { table: 'post_drafts', label: { de: 'Post-Entwürfe', en: 'post drafts', es: 'borradores de publicaciones' } },
    { table: 'calendar_events', label: { de: 'Kalender-Einträge', en: 'calendar events', es: 'eventos de calendario' } },
    { table: 'video_creations', label: { de: 'Video-Erstellungen', en: 'video creations', es: 'creaciones de video' } },
    { table: 'brand_characters', label: { de: 'Marken-Charaktere', en: 'brand characters', es: 'personajes de marca' } },
    { table: 'brand_locations', label: { de: 'Marken-Orte', en: 'brand locations', es: 'ubicaciones de marca' } },
  ];

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const counts = await Promise.all(
        REFERENCING_TABLES.map(async ({ table }) => {
          const { count, error } = await supabase
            .from(table as any)
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .eq('brand_kit_id', id);
          if (error) {
            // If a table doesn't have brand_kit_id or errors, don't block the delete on that table
            console.warn(`Reference check failed for ${table}:`, error);
            return { table, count: 0 };
          }
          return { table, count: count || 0 };
        })
      );

      const blocking = counts.filter((c) => c.count > 0);
      if (blocking.length > 0) {
        const names = blocking
          .map((b) => REFERENCING_TABLES.find((r) => r.table === b.table)?.label)
          .filter(Boolean) as { de: string; en: string; es: string }[];
        const namesEn = names.map((n) => n.en).join(', ');
        const namesDe = names.map((n) => n.de).join(', ');
        const namesEs = names.map((n) => n.es).join(', ');
        const err: any = new Error(
          tx({
            de: `Dieses Marken-Set wird noch verwendet von: ${namesDe}. Bitte archiviere es stattdessen.`,
            en: `This brand kit is still referenced by: ${namesEn}. Archive it instead.`,
            es: `Este kit de marca todavía es utilizado por: ${namesEs}. Archívalo en su lugar.`,
          })
        );
        err.isBlocked = true;
        throw err;
      }

      const { error } = await supabase
        .from('brand_kits')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brand-kits'] });
      toast({
        title: tx({ de: "Gelöscht", en: "Deleted", es: "Eliminado" }),
        description: tx({ de: "Brand Kit wurde erfolgreich gelöscht", en: "Brand kit deleted successfully", es: "Brand kit eliminado correctamente" })
      });
    },
    onError: (error: any) => {
      toast({
        title: error?.isBlocked
          ? tx({ de: "Löschen nicht möglich", en: "Cannot delete", es: "No se puede eliminar" })
          : tx({ de: "Fehler", en: "Mistake", es: "Error" }),
        description: error?.message || tx({ de: "Brand Kit konnte nicht gelöscht werden", en: "Brand kit could not be deleted", es: "No se pudo eliminar el brand kit" }),
        variant: "destructive",
        duration: 8000,
      });
    }
  });

  const archiveMutation = useMutation({
    mutationFn: async ({ id, archive }: { id: string; archive: boolean }) => {
      const updates: Record<string, any> = { archived_at: archive ? new Date().toISOString() : null };
      if (archive) updates.is_active = false;
      const { error } = await supabase
        .from('brand_kits')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['brand-kits'] });
      queryClient.invalidateQueries({ queryKey: ['active-brand-kit'] });
      toast({
        title: variables.archive
          ? tx({ de: "Archiviert", en: "Archived", es: "Archivado" })
          : tx({ de: "Wiederhergestellt", en: "Restored", es: "Restaurado" }),
        description: variables.archive
          ? tx({ de: "Brand Kit wurde archiviert", en: "Brand kit has been archived", es: "El kit de marca ha sido archivado" })
          : tx({ de: "Brand Kit wurde wiederhergestellt", en: "Brand kit has been restored", es: "El kit de marca ha sido restaurado" })
      });
    },
    onError: (error: any) => {
      toast({
        title: tx({ de: "Fehler", en: "Mistake", es: "Error" }),
        description: error?.message || tx({ de: "Aktion fehlgeschlagen", en: "Action failed", es: "La acción falló" }),
        variant: "destructive"
      });
    }
  });

  const renameMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase
        .from('brand_kits')
        .update({ brand_name: name })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brand-kits'] });
      queryClient.invalidateQueries({ queryKey: ['active-brand-kit'] });
      setRenameTarget(null);
      setRenameValue("");
      toast({
        title: tx({ de: "Umbenannt", en: "Renamed", es: "Renombrado" }),
        description: tx({ de: "Brand Kit wurde umbenannt", en: "Brand kit has been renamed", es: "El kit de marca ha sido renombrado" })
      });
    },
    onError: (error: any) => {
      toast({
        title: tx({ de: "Fehler", en: "Mistake", es: "Error" }),
        description: error?.message || tx({ de: "Umbenennen fehlgeschlagen", en: "Rename failed", es: "El cambio de nombre falló" }),
        variant: "destructive"
      });
    }
  });

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: tx({ de: "Fehler", en: "Mistake", es: "Error" }),
        description: tx({ de: "Datei muss kleiner als 5MB sein", en: "File must be smaller than 5MB", es: "El archivo debe ser menor de 5MB" }),
        variant: "destructive"
      });
      return;
    }

    setLogoFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setLogoPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleWizardComplete = async (wizardData: any) => {
    setFormData({
      ...formData,
      ...wizardData,
      brandValues: wizardData.brandValues
    });
    setShowWizard(false);
    
    // Auto-generate after wizard
    setTimeout(() => {
      handleGenerate(wizardData);
    }, 500);
  };

  const handleGenerate = async (dataOverride?: any) => {
    const data = dataOverride || formData;

    if (!data.brandDescription && !data.brandName) {
      toast({
        title: tx({ de: "Fehler", en: "Mistake", es: "Error" }),
        description: tx({ de: "Bitte gib mindestens einen Markennamen oder Beschreibung ein", en: "Please enter at least a brand name or description", es: "Introduce al menos un nombre de marca o una descripción" }),
        variant: "destructive"
      });
      return;
    }

    // Check plan limits
    if (!isPro && brandKits.length >= 1) {
      setShowPlanLimit(true);
      return;
    }

    setIsGenerating(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      let logoUrl = null;

      // Upload logo if provided
      if (logoFile) {
        const fileExt = logoFile.name.split('.').pop();
        const filePath = `${user.id}/${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('brand-logos')
          .upload(filePath, logoFile);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('brand-logos')
          .getPublicUrl(filePath);

        logoUrl = publicUrl;
      }

      // Call edge function
      // Every editable field is submitted explicitly — a field that is present
      // but empty means "the user cleared it" and must not be resurrected from
      // the extraction on the server.
      const { data: response, error } = await supabase.functions.invoke('generate-brand-kit', {
        body: {
          logoUrl,
          brandName: data.brandName ?? '',
          targetAudience: data.targetAudience ?? '',
          brandValues: Array.isArray(data.brandValues) ? data.brandValues : String(data.brandValues || '').split(',').map((v: string) => v.trim()).filter(Boolean),
          keywords: Array.isArray(data.keywords) ? data.keywords : [],
          palette: Array.isArray(data.palette) ? data.palette : [],
          fonts: { headline: data.fontHeadline ?? '', body: data.fontBody ?? '' },
          stylePreference: data.stylePreference ?? '',
          moodPreference: data.moodPreference ?? '',
          primaryColor: data.primaryColor,
          secondaryColor: data.secondaryColor || null,
          brandDescription: data.brandDescription,
          tonePreference: data.tonePreference ?? '',
          websiteUrl: data.websiteUrl ?? '',
          extractedDna: extractedDna || null,
          language: 'de'
        }
      });

      if (error) {
        console.error('Edge function error:', error);
        throw error;
      }

      queryClient.invalidateQueries({ queryKey: ['brand-kits'] });
      setActiveTab("brandboard");

      toast({
        title: tx({ de: "Erfolgreich erstellt!", en: "Successfully created!", es: "¡Creado con éxito!" }),
        description: tx({ de: "Dein Marken-Set wurde generiert und ist jetzt aktiv", en: "Your brand set was generated and is now active", es: "Tu set de marca se generó y ya está activo" }),
        duration: 5000
      });

      // Reset form
      setLogoFile(null);
      setLogoPreview("");
    } catch (error: any) {
      console.error('Error generating brand kit:', error);
      
      let errorMessage = tx({ de: "Brand Kit konnte nicht erstellt werden", en: "Brand kit could not be created", es: "No se pudo crear el brand kit" });
      let errorDetails = "";
      
      if (error.message) {
        errorMessage = error.message;
      }
      
      if (error.context) {
        const ctx = error.context;
        if (ctx.error) errorDetails += ctx.error;
        if (ctx.details) errorDetails += (errorDetails ? ' - ' : '') + ctx.details;
        if (ctx.message) errorDetails += (errorDetails ? ' - ' : '') + ctx.message;
        if (ctx.dbError) errorDetails += (errorDetails ? ' - ' : '') + ctx.dbError;
        if (ctx.hint) errorDetails += (errorDetails ? ' - ' : '') + ctx.hint;
        if (ctx.preview) errorDetails += (errorDetails ? ' - ' : '') + `Preview: ${ctx.preview}`;
      }
      
      toast({
        title: tx({ de: "Fehler", en: "Mistake", es: "Error" }),
        description: errorDetails || errorMessage,
        variant: "destructive",
        duration: 10000,
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExportPDF = async () => {
    if (!activeBrandKit) return;
    setIsExportingPdf(true);
    try {
      const { data, error } = await supabase.functions.invoke('export-brand-guidelines-pdf', {
        body: { brandKitId: activeBrandKit.id }
      });
      if (error) throw error;
      if (!data?.url) throw new Error('missing_url');
      window.open(data.url, '_blank', 'noopener,noreferrer');
      toast({
        title: tx({ de: "Export bereit", en: "Export ready", es: "Exportación lista" }),
        description: tx({ de: "Deine Brand Guidelines wurden als PDF exportiert", en: "Your brand guidelines were exported as a PDF", es: "Tus guías de marca se exportaron como PDF" })
      });
    } catch (error: any) {
      toast({
        title: tx({ de: "Fehler", en: "Mistake", es: "Error" }),
        description: error?.message || tx({ de: "PDF-Export fehlgeschlagen", en: "PDF export failed", es: "La exportación a PDF falló" }),
        variant: "destructive"
      });
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleApplyDna = (dna: BrandDnaResult) => {
    // Extraction only PREFILLS the form. From here on the form is the single
    // source of truth — anything the user edits afterwards wins at save time.
    setExtractedDna(dna);
    setFormData((prev) => ({
      ...prev,
      brandName: dna.brand_name ?? prev.brandName,
      brandDescription: dna.brand_description ?? prev.brandDescription,
      primaryColor: dna.primary_color ?? prev.primaryColor,
      secondaryColor: dna.secondary_color ?? prev.secondaryColor,
      tonePreference: dna.tone ?? prev.tonePreference,
      stylePreference: dna.mood ?? prev.stylePreference,
      moodPreference: dna.mood ?? prev.moodPreference,
      brandValues: dna.values?.length ? dna.values : prev.brandValues,
      keywords: dna.keywords?.length ? dna.keywords : prev.keywords,
      fontHeadline: dna.fonts?.headline ?? prev.fontHeadline,
      fontBody: dna.fonts?.body ?? prev.fontBody,
      palette: dna.palette?.length ? dna.palette : prev.palette,
      websiteUrl: dna.source === 'website' && dna.source_url ? dna.source_url : prev.websiteUrl,
    }));
    toast({
      title: tx({ de: 'Brand DNA übernommen', en: 'Brand DNA applied', es: 'Brand DNA aplicado' }),
      description: tx({ de: "Das Formular wurde vorausgefüllt — deine Änderungen daran gewinnen beim Speichern.", en: "The form was pre-filled — your edits to it win when saving.", es: "El formulario se rellenó — tus ediciones ganan al guardar." }),
    });
  };


  const handleDuplicate = async (kit: any) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('brand_kits')
        .insert({
          ...kit,
          id: undefined,
          user_id: user.id,
          brand_name: `${kit.brand_name} (Kopie)`,
          is_active: false,
          created_at: undefined
        });

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['brand-kits'] });
      toast({
        title: tx({ de: "Dupliziert", en: "Duplicated", es: "Duplicado" }),
        description: tx({ de: "Brand Kit wurde kopiert", en: "Brand Kit has been copied", es: "El kit de marca ha sido copiado." })
      });
    } catch (error) {
      toast({
        title: tx({ de: "Fehler", en: "Mistake", es: "Error" }),
        description: tx({ de: "Konnte nicht dupliziert werden", en: "Could not be duplicated", es: "No se pudo duplicar" }),
        variant: "destructive"
      });
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(""), 2000);
    toast({
      title: tx({ de: "Kopiert!", en: "Copied!", es: "¡Copiado!" }),
      description: `${label}: ${text}`
    });
  };

  if (showWizard) {
    return (
      <OnboardingWizard
        onComplete={handleWizardComplete}
        onSkip={() => setShowWizard(false)}
      />
    );
  }

  const tabVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -10 }
  };

  const staggerContainer = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const staggerItem = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 }
  };

  return (
    <div className="bg-background">
      <main className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Premium Hero Header */}
        <BrandKitHeroHeader 
          brandKitCount={brandKits.length}
          onCreateNew={() => setShowWizard(true)}
        />

        {/* Sticky Brand Vault - Bond 2028 */}
        <BrandVault brandKit={activeBrandKit} />

        {/* Active Brand Selector */}
        {nonArchivedKits.length > 0 && (
          <div className="mb-6">
            <ActiveBrandSelector
              brandKits={nonArchivedKits}
              activeKitId={activeBrandKit?.id}
              onSelect={(id) => setActiveMutation.mutate(id)}
            />
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          {/* Premium TabsList */}
          <TabsList className="grid w-full grid-cols-4 backdrop-blur-xl bg-card/60 border border-white/10 p-1.5 rounded-xl">
            <TabsTrigger 
              value="create"
              className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary data-[state=active]:shadow-[0_0_15px_hsla(43,90%,68%,0.2)] transition-all duration-300 flex items-center gap-2"
            >
              <Sparkles className="h-4 w-4" />
              {tx({ de: 'Erstellen', en: 'Create', es: 'Crear' })}
            </TabsTrigger>
            <TabsTrigger 
              value="brandboard" 
              disabled={!activeBrandKit}
              className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary data-[state=active]:shadow-[0_0_15px_hsla(43,90%,68%,0.2)] transition-all duration-300 flex items-center gap-2"
            >
              <Paintbrush className="h-4 w-4" />
              Brandboard
            </TabsTrigger>
            <TabsTrigger 
              value="consistency" 
              disabled={!activeBrandKit}
              className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary data-[state=active]:shadow-[0_0_15px_hsla(43,90%,68%,0.2)] transition-all duration-300 flex items-center gap-2"
            >
              <BarChart3 className="h-4 w-4" />
              Konsistenz
            </TabsTrigger>
            <TabsTrigger 
              value="manage" 
              disabled={brandKits.length === 0}
              className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary data-[state=active]:shadow-[0_0_15px_hsla(43,90%,68%,0.2)] transition-all duration-300 flex items-center gap-2"
            >
              <Settings className="h-4 w-4" />
              {tx({ de: 'Verwalten', en: 'Manage', es: 'Gestionar' })}
            </TabsTrigger>
          </TabsList>

          <AnimatePresence mode="wait">
            {/* Create Tab */}
            <TabsContent value="create" className="space-y-6">
              {/* Brand DNA Extractor — fills the form via URL/screenshot */}
              <BrandDnaExtractor onApply={handleApplyDna} />
              <motion.div
                key="create"
                variants={tabVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                transition={{ duration: 0.3 }}
                className="grid md:grid-cols-2 gap-6"
              >
                {/* Form Card - Premium Glassmorphism */}
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 }}
                  className="backdrop-blur-xl bg-card/60 border border-white/10 rounded-2xl overflow-hidden hover:shadow-[0_0_30px_hsla(43,90%,68%,0.08)] transition-all duration-300"
                >
                  <div className="p-6 border-b border-white/10">
                    <h3 className="text-xl font-semibold">{tx({ de: "Neues Marken-Set erstellen", en: "Create a new brand set", es: "Crear un nuevo conjunto de marcas" })}</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {tx({ de: 'Fülle die Informationen aus oder nutze den Wizard', en: 'Fill in the information or use the wizard', es: 'Completa la información o usa el asistente' })}
                    </p>
                  </div>
                  <div className="p-6 space-y-5">
                    <div>
                      <Label htmlFor="brandName" className="text-sm font-medium">{tx({ de: 'Markenname *', en: 'Brand name *', es: 'Nombre de la marca *' })}</Label>
                      <Input
                        id="brandName"
                        value={formData.brandName}
                        onChange={(e) => setFormData({ ...formData, brandName: e.target.value })}
                        placeholder={tx({ de: 'z.B. Fashion Studio Berlin', en: 'e.g. Fashion Studio Berlin', es: 'p. ej. Fashion Studio Berlin' })}
                        className="mt-2 bg-muted/20 border-white/10 focus:border-primary/60 focus:ring-2 focus:ring-primary/20 transition-all"
                      />
                    </div>

                    <div>
                      <Label htmlFor="logo">{tx({ de: 'Logo hochladen', en: 'Upload logo', es: 'Subir logo' })}</Label>
                      <div className="mt-2">
                        {logoPreview ? (
                          <div className="relative w-32 h-32 rounded-xl overflow-hidden border-2 border-primary/30 shadow-[0_0_15px_hsla(43,90%,68%,0.15)]">
                            <img src={logoPreview} alt="Logo preview" className="w-full h-full object-contain" />
                            <Button
                              variant="destructive"
                              size="sm"
                              className="absolute top-1 right-1"
                              onClick={() => {
                                setLogoFile(null);
                                setLogoPreview("");
                              }}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : (
                          <motion.label 
                            htmlFor="logo" 
                            whileHover={{ scale: 1.02 }}
                            className="flex flex-col items-center justify-center w-32 h-32 border-2 border-dashed border-white/20 rounded-xl cursor-pointer hover:border-primary/50 hover:bg-primary/5 hover:shadow-[0_0_20px_hsla(43,90%,68%,0.1)] transition-all duration-300 group"
                          >
                            <Upload className="h-8 w-8 text-muted-foreground group-hover:text-primary group-hover:scale-110 transition-all" />
                            <span className="text-xs text-muted-foreground mt-2 group-hover:text-primary transition-colors">Max. 5MB</span>
                            <input
                              id="logo"
                              type="file"
                              accept="image/png,image/jpeg,image/jpg,image/svg+xml"
                              onChange={handleLogoUpload}
                              className="hidden"
                            />
                          </motion.label>
                        )}
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="audience">{tx({ de: "Zielgruppe", en: "Target audience", es: "Público objetivo" })}</Label>
                      <Textarea
                        id="audience"
                        value={formData.targetAudience}
                        onChange={(e) => setFormData({ ...formData, targetAudience: e.target.value })}
                        placeholder="z.B. Junge Frauen 25-35, Mode-bewusst..."
                        rows={3}
                        className="mt-2 bg-muted/20 border-white/10 focus:border-primary/60 focus:ring-2 focus:ring-primary/20 transition-all"
                      />
                    </div>

                    <div>
                      <Label htmlFor="description">{tx({ de: "Markenbeschreibung *", en: "Brand description *", es: "Descripción de la marca *" })}</Label>
                      <Textarea
                        id="description"
                        value={formData.brandDescription}
                        onChange={(e) => setFormData({ ...formData, brandDescription: e.target.value })}
                        placeholder={tx({ de: "Beschreibe deine Marke, ihre Werte und Mission...", en: "Describe your brand, its values and mission...", es: "Describe tu marca, sus valores y su misión..." })}
                        rows={4}
                        className="mt-2 bg-muted/20 border-white/10 focus:border-primary/60 focus:ring-2 focus:ring-primary/20 transition-all"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="primary-color">{tx({ de: "Primärfarbe", en: "Primary Color", es: "Color primario" })}</Label>
                        <div className="flex gap-2 mt-2">
                          <div className="relative">
                            <Input
                              id="primary-color"
                              type="color"
                              value={formData.primaryColor}
                              onChange={(e) => setFormData({ ...formData, primaryColor: e.target.value })}
                              className="w-14 h-10 p-1 cursor-pointer border-white/10 rounded-lg"
                            />
                            <div 
                              className="absolute inset-0 rounded-lg pointer-events-none border-2 border-transparent"
                              style={{ boxShadow: `0 0 12px ${formData.primaryColor}40` }}
                            />
                          </div>
                          <Input
                            type="text"
                            value={formData.primaryColor}
                            onChange={(e) => setFormData({ ...formData, primaryColor: e.target.value })}
                            className="flex-1 font-mono text-sm bg-muted/20 border-white/10"
                          />
                        </div>
                      </div>

                      <div>
                        <Label htmlFor="secondary-color">{tx({ de: "Sekundärfarbe", en: "Secondary Color", es: "Color secundario" })}</Label>
                        <div className="flex gap-2 mt-2">
                          <Input
                            id="secondary-color"
                            type="color"
                            value={formData.secondaryColor || "#000000"}
                            onChange={(e) => setFormData({ ...formData, secondaryColor: e.target.value })}
                            className="w-14 h-10 p-1 cursor-pointer border-white/10 rounded-lg"
                          />
                          <Input
                            type="text"
                            value={formData.secondaryColor}
                            onChange={(e) => setFormData({ ...formData, secondaryColor: e.target.value })}
                            placeholder="#000000"
                            className="flex-1 font-mono text-sm bg-muted/20 border-white/10"
                          />
                        </div>
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="website-url">{tx({ de: "Website-Adresse", en: "Website address", es: "Dirección web" })}</Label>
                      <Input
                        id="website-url"
                        value={formData.websiteUrl}
                        onChange={(e) => setFormData({ ...formData, websiteUrl: e.target.value })}
                        placeholder="https://example.com"
                        className="mt-2 bg-muted/20 border-white/10"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="tone">{tx({ de: "Tonalität", en: "Tone", es: "Tono" })}</Label>
                        <Input
                          id="tone"
                          value={formData.tonePreference}
                          onChange={(e) => setFormData({ ...formData, tonePreference: e.target.value })}
                          placeholder={tx({ de: "z.B. inspirierend", en: "e.g. inspiring", es: "p. ej. inspirador" })}
                          className="mt-2 bg-muted/20 border-white/10"
                        />
                      </div>
                      <div>
                        <Label htmlFor="mood">{tx({ de: "Stimmung", en: "Mood", es: "Ambiente" })}</Label>
                        <Input
                          id="mood"
                          value={formData.moodPreference}
                          onChange={(e) => setFormData({ ...formData, moodPreference: e.target.value })}
                          placeholder={tx({ de: "z.B. elegant", en: "e.g. elegant", es: "p. ej. elegante" })}
                          className="mt-2 bg-muted/20 border-white/10"
                        />
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="style">{tx({ de: "Visuelle Ausrichtung", en: "Visual style direction", es: "Dirección visual" })}</Label>
                      <Input
                        id="style"
                        value={formData.stylePreference}
                        onChange={(e) => setFormData({ ...formData, stylePreference: e.target.value })}
                        placeholder={tx({ de: "z.B. minimalistisch", en: "e.g. minimalistic", es: "p. ej. minimalista" })}
                        className="mt-2 bg-muted/20 border-white/10"
                      />
                    </div>

                    <div>
                      <Label htmlFor="values">{tx({ de: "Markenwerte (mit Komma trennen)", en: "Brand values (comma separated)", es: "Valores de marca (separados por comas)" })}</Label>
                      <Input
                        id="values"
                        value={formData.brandValues.join(", ")}
                        onChange={(e) => setFormData({ ...formData, brandValues: e.target.value.split(",").map((v) => v.trim()).filter(Boolean) })}
                        className="mt-2 bg-muted/20 border-white/10"
                      />
                    </div>

                    <div>
                      <Label htmlFor="keywords">{tx({ de: "Keywords (mit Komma trennen)", en: "Keywords (comma separated)", es: "Palabras clave (separadas por comas)" })}</Label>
                      <Input
                        id="keywords"
                        value={formData.keywords.join(", ")}
                        onChange={(e) => setFormData({ ...formData, keywords: e.target.value.split(",").map((v) => v.trim()).filter(Boolean) })}
                        className="mt-2 bg-muted/20 border-white/10"
                      />
                      <p className="text-[11px] text-muted-foreground mt-1">
                        {tx({ de: "Was du hier löschst, bleibt gelöscht.", en: "Whatever you remove here stays removed.", es: "Lo que borres aquí permanece borrado." })}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="font-headline">{tx({ de: "Schrift Überschriften", en: "Headline font", es: "Fuente de titulares" })}</Label>
                        <Input
                          id="font-headline"
                          value={formData.fontHeadline}
                          onChange={(e) => setFormData({ ...formData, fontHeadline: e.target.value })}
                          placeholder="Montserrat"
                          className="mt-2 bg-muted/20 border-white/10"
                        />
                      </div>
                      <div>
                        <Label htmlFor="font-body">{tx({ de: "Schrift Fließtext", en: "Body font", es: "Fuente de texto" })}</Label>
                        <Input
                          id="font-body"
                          value={formData.fontBody}
                          onChange={(e) => setFormData({ ...formData, fontBody: e.target.value })}
                          placeholder="Open Sans"
                          className="mt-2 bg-muted/20 border-white/10"
                        />
                      </div>
                    </div>

                    <div className="flex gap-3 pt-4">
                      {/* Premium Generate Button */}
                      <Button
                        onClick={() => handleGenerate()}
                        disabled={isGenerating}
                        className="flex-1 relative group overflow-hidden bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90 text-primary-foreground shadow-[0_0_20px_hsla(43,90%,68%,0.25)] hover:shadow-[0_0_30px_hsla(43,90%,68%,0.4)] transition-all duration-300"
                        size="lg"
                      >
                        {/* Shimmer Effect */}
                        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                          <div className="absolute inset-0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                        </div>
                        
                        {isGenerating ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            {tx({ de: "Wird erstellt...", en: "Creating...", es: "Creando..." })}
                          </>
                        ) : (
                          <>
                            <Sparkles className="mr-2 h-4 w-4 group-hover:rotate-12 transition-transform" />
                            {tx({ de: "Mit KI erstellen", en: "Create with AI", es: "Crear con IA" })}
                          </>
                        )}
                      </Button>

                      <Button
                        onClick={() => setShowWizard(true)}
                        variant="outline"
                        size="lg"
                        className="border-white/10 hover:bg-primary/10 hover:border-primary/30 transition-all"
                      >
                        {tx({ de: 'Wizard nutzen', en: 'Use wizard', es: 'Usar asistente' })}
                      </Button>
                    </div>
                  </div>
                </motion.div>

                {/* Premium Feature Info Card */}
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 }}
                  className="backdrop-blur-xl bg-gradient-to-br from-primary/10 via-card/60 to-accent/10 border border-white/15 rounded-2xl overflow-hidden relative"
                >
                  {/* Animated Border Glow */}
                  <div className="absolute inset-0 rounded-2xl opacity-50">
                    <div className="absolute inset-0 bg-gradient-to-r from-primary/20 via-transparent to-accent/20 animate-pulse" />
                  </div>
                  
                  <div className="relative p-6 border-b border-white/10">
                    <div className="flex items-center gap-3">
                      <motion.div
                        animate={{ rotate: [0, 10, -10, 0] }}
                        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                      >
                        <Star className="h-6 w-6 text-primary" />
                      </motion.div>
                      <h3 className="text-xl font-semibold">{tx({ de: "Was macht dieses Feature besonders?", en: "What makes this feature special?", es: "¿Qué hace que esta característica sea especial?" })}</h3>
                    </div>
                  </div>
                  
                  <motion.div 
                    className="relative p-6 space-y-4"
                    variants={staggerContainer}
                    initial="hidden"
                    animate="visible"
                  >
                    {[
                      { emoji: "✨", title: "KI-Markenanalyse", desc: tx({ de: "Automatische Erkennung von Farben, Stilrichtung und Emotionen aus deinem Logo", en: "Automatic recognition of colors, style and emotions from your logo", es: "Reconocimiento automático de colores, estilo y emociones de tu logo." }) },
                      { emoji: "🎨", title: "Visuelles Brandboard", desc: tx({ de: "Sofortige Live-Vorschau mit Farbpalette, Schriften und Beispiel-Posts", en: "Instant live preview with color palette, fonts and sample posts", es: "Vista previa instantánea en vivo con paleta de colores, fuentes y publicaciones de muestra" }) },
                      { emoji: "🔗", title: "Auto-Integration", desc: tx({ de: "Alle Tools nutzen automatisch deine Markenfarben und Tonalität", en: "All tools automatically use your brand colors and tonality", es: "Todas las herramientas utilizan automáticamente los colores y la tonalidad de su marca." }) },
                      { emoji: "📊", title: "Consistency Score", desc: tx({ de: "Regelmäßige Analyse deiner Content-Konsistenz mit Verbesserungstipps", en: "Regular analysis of your content consistency with improvement tips", es: "Análisis periódico de la coherencia de su contenido con consejos de mejora." }) },
                      { emoji: "🚀", title: "Multi-Brand-Management", desc: tx({ de: "Verwalte mehrere Marken und wechsle mit einem Klick", en: "Manage multiple brands and switch with one click", es: "Administre múltiples marcas y cambie con un solo clic" }) },
                    ].map((feature, idx) => (
                      <motion.div 
                        key={idx}
                        variants={staggerItem}
                        className="flex items-start gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors group"
                      >
                        <div className="text-xl group-hover:scale-110 transition-transform">{feature.emoji}</div>
                        <div>
                          <strong className="text-foreground group-hover:text-primary transition-colors">{feature.title}:</strong>
                          <span className="text-muted-foreground ml-1">{feature.desc}</span>
                        </div>
                      </motion.div>
                    ))}
                  </motion.div>
                </motion.div>
              </motion.div>
            </TabsContent>

            {/* Brandboard Tab */}
            <TabsContent value="brandboard">
              <motion.div
                key="brandboard"
                variants={tabVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                transition={{ duration: 0.3 }}
              >
                {activeBrandKit ? (
                  <div className="space-y-6">
                    <div className="flex justify-between items-center">
                      <div>
                        <h2 className="text-2xl font-bold">{activeBrandKit.brand_name || tx({ de: 'Dein Marken-Set', en: 'Your brand set', es: 'Tu set de marca' })}</h2>
                        <p className="text-muted-foreground">
                          {tx({ de: 'Erstellt am', en: 'Created on', es: 'Creado el' })} {new Date(activeBrandKit.created_at).toLocaleDateString(uiLocale())}
                        </p>
                      </div>
                      <Button 
                        onClick={handleExportPDF} 
                        variant="outline"
                        disabled={isExportingPdf}
                        className="border-white/10 hover:bg-primary/10 hover:border-primary/30 group"
                      >
                        {isExportingPdf ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Download className="mr-2 h-4 w-4 group-hover:scale-110 transition-transform" />
                        )}
                        {isExportingPdf
                          ? tx({ de: "Exportiere...", en: "Exporting...", es: "Exportando..." })
                          : tx({ de: "Als PDF exportieren", en: "Export as PDF", es: "Exportar como PDF" })}
                      </Button>
                    </div>

                    <BrandBoard brandKit={activeBrandKit} />

                    {/* AI Comment Card - Premium */}
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 }}
                      className="backdrop-blur-xl bg-card/60 border border-white/10 rounded-2xl overflow-hidden"
                    >
                      <div className="p-6 border-b border-white/10">
                        <div className="flex items-center gap-2">
                          <motion.div
                            animate={{ rotate: [0, 360] }}
                            transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                          >
                            <Sparkles className="h-5 w-5 text-primary" />
                          </motion.div>
                          <h3 className="text-lg font-semibold">{tx({ de: "KI-Analyse & Empfehlung", en: "AI analysis & recommendation", es: "Análisis y recomendación con IA" })}</h3>
                        </div>
                      </div>
                      <div className="p-6">
                        <p className="text-sm leading-relaxed text-muted-foreground">{activeBrandKit.ai_comment}</p>
                      </div>
                    </motion.div>

                    {/* Sprint 2 — Brand Voice + Asset Factory */}
                    <BrandVoiceLibrary brandKitId={activeBrandKit.id} />
                    <BrandAssetFactory brandKitId={activeBrandKit.id} />
                  </div>
                ) : (
                  <Card className="backdrop-blur-xl bg-card/60 border border-white/10">
                    <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                      <Paintbrush className="h-16 w-16 text-muted-foreground mb-4" />
                      <h3 className="text-lg font-semibold mb-2">{tx({ de: "Kein Marken-Set vorhanden", en: "No brand set available", es: "Ningún conjunto de marca disponible" })}</h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        {tx({ de: "Erstelle dein erstes Marken-Set, um es hier zu sehen", en: "Create your first brand kit to see it here", es: "Crea tu primer kit de marca para verlo aquí" })}
                      </p>
                      <Button onClick={() => setActiveTab("create")}>
                        {tx({ de: "Jetzt erstellen", en: "Create now", es: "Crear ahora" })}
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </motion.div>
            </TabsContent>

            {/* Consistency Tab */}
            <TabsContent value="consistency">
              <motion.div
                key="consistency"
                variants={tabVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                transition={{ duration: 0.3 }}
              >
                {activeBrandKit ? (
                  <div className="grid md:grid-cols-2 gap-6">
                    <ConsistencyScore 
                      score={typeof activeBrandKit.consistency_score === 'number' ? activeBrandKit.consistency_score : null} 
                      brandKit={activeBrandKit}
                    />
                    <BrandDriftDossier brandKitId={activeBrandKit.id} />
                    <BrandTrendsRadar brandKitId={activeBrandKit.id} />
                    <BrandShareExport brandKit={activeBrandKit} />


                    {/* Premium Hashtags Card */}
                    <motion.div
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.2 }}
                      className="backdrop-blur-xl bg-card/60 border border-white/10 rounded-2xl overflow-hidden"
                    >
                      <div className="p-6 border-b border-white/10">
                        <h3 className="text-lg font-semibold">Empfohlene Hashtags</h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          {tx({ de: "Nutze diese Hashtags für maximale Reichweite", en: "Use these hashtags for maximum reach", es: "Usa estos hashtags para máximo alcance" })}
                        </p>
                      </div>
                      <div className="p-6">
                        <motion.div 
                          className="flex flex-wrap gap-2"
                          variants={staggerContainer}
                          initial="hidden"
                          animate="visible"
                        >
                          {(activeBrandKit.recommended_hashtags as string[] || []).map((tag: string, idx: number) => (
                            <motion.div key={idx} variants={staggerItem}>
                              <Badge
                                variant="secondary"
                                className="cursor-pointer backdrop-blur-xl bg-primary/10 border border-primary/20 hover:bg-primary/20 hover:shadow-[0_0_10px_hsla(43,90%,68%,0.2)] transition-all duration-300"
                                onClick={() => copyToClipboard(tag, "Hashtag")}
                              >
                                {tag}
                                {copiedText === "Hashtag" ? (
                                  <Check className="ml-1 h-3 w-3" />
                                ) : (
                                  <Copy className="ml-1 h-3 w-3" />
                                )}
                              </Badge>
                            </motion.div>
                          ))}
                        </motion.div>

                        <div className="mt-6">
                          <Label className="mb-2 block text-sm font-medium">{tx({ de: "Beispiel-Caption", en: "Example Caption", es: "Título de ejemplo" })}</Label>
                          <div className="p-4 backdrop-blur-xl bg-muted/20 border border-white/10 rounded-xl relative group">
                            <p className="text-sm text-muted-foreground">{activeBrandKit.example_caption}</p>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => copyToClipboard(activeBrandKit.example_caption, "Caption")}
                            >
                              {copiedText === "Caption" ? (
                                <Check className="h-4 w-4" />
                              ) : (
                                <Copy className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  </div>
                ) : null}
              </motion.div>
            </TabsContent>

            {/* Manage Tab */}
            <TabsContent value="manage">
              <motion.div
                key="manage"
                variants={tabVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                transition={{ duration: 0.3 }}
                className="space-y-6"
              >
                <div className="flex justify-between items-center flex-wrap gap-3">
                  <h2 className="text-2xl font-bold">{tx({ de: 'Meine Marken-Sets', en: 'My brand sets', es: 'Mis kits de marca' })}</h2>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
                      <Checkbox checked={showArchived} onCheckedChange={(v) => setShowArchived(!!v)} />
                      {tx({ de: 'Archivierte anzeigen', en: 'Show archived', es: 'Mostrar archivados' })}
                    </label>
                    <Badge 
                      variant="secondary"
                      className="backdrop-blur-xl bg-primary/10 border border-primary/20 text-primary font-medium"
                    >
                      {visibleBrandKits.length} {visibleBrandKits.length === 1 ? "Set" : "Sets"}
                    </Badge>
                  </div>
                </div>

                <motion.div 
                  className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4"
                  variants={staggerContainer}
                  initial="hidden"
                  animate="visible"
                >
                  {visibleBrandKits.map((kit: any) => (
                    <motion.div
                      key={kit.id}
                      variants={staggerItem}
                      whileHover={{ scale: 1.02, y: -5 }}
                      className={`relative backdrop-blur-xl bg-card/60 border rounded-2xl overflow-hidden transition-all duration-300 ${
                        kit.is_active 
                          ? "border-primary/50 shadow-[0_0_25px_hsla(43,90%,68%,0.15)]" 
                          : "border-white/10 hover:border-white/20 hover:shadow-[0_0_20px_rgba(0,0,0,0.2)]"
                      }`}
                    >
                      {kit.is_active && !kit.archived_at && (
                        <Badge className="absolute -top-2 -right-2 z-10 bg-primary text-primary-foreground shadow-[0_0_15px_hsla(43,90%,68%,0.4)]">
                          {tx({ de: "Aktiv", en: "Active", es: "Activo" })}
                        </Badge>
                      )}
                      {kit.archived_at && (
                        <Badge variant="outline" className="absolute -top-2 -right-2 z-10 bg-muted text-muted-foreground border-white/20">
                          {tx({ de: "Archiviert", en: "Archived", es: "Archivado" })}
                        </Badge>
                      )}
                      
                      <div className="p-5 space-y-4">
                        {kit.logo_url && (
                          <img 
                            src={kit.logo_url} 
                            alt="Logo" 
                            className="w-16 h-16 object-contain rounded-lg border border-white/10" 
                          />
                        )}
                        
                        <div>
                          <h3 className="font-semibold text-lg">{kit.brand_name || "Unnamed"}</h3>
                          <p className="text-xs text-muted-foreground">
                            {new Date(kit.created_at).toLocaleDateString(uiLocale())}
                          </p>
                        </div>

                        {/* Color Swatches with Glow */}
                        <div className="flex gap-2">
                          {[
                            kit.color_palette.primary,
                            kit.color_palette.secondary,
                            kit.color_palette.accent
                          ].map((color, idx) => (
                            <motion.div
                              key={idx}
                              whileHover={{ scale: 1.15 }}
                              className="w-8 h-8 rounded-lg border border-white/20 cursor-pointer transition-all"
                              style={{ 
                                backgroundColor: color,
                                boxShadow: `0 0 10px ${color}40`
                              }}
                            />
                          ))}
                        </div>

                        <Badge 
                          variant="outline" 
                          className="text-xs backdrop-blur-xl bg-muted/20 border-white/10"
                        >
                          {kit.mood}
                        </Badge>

                        <div className="flex flex-wrap gap-2 pt-2">
                          {!kit.is_active && !kit.archived_at && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1 border-white/10 hover:bg-primary/10 hover:border-primary/30"
                              onClick={() => setActiveMutation.mutate(kit.id)}
                            >
                              {tx({ de: "Aktivieren", en: "Enable", es: "Activar" })}
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="hover:bg-white/10"
                            title={tx({ de: "Umbenennen", en: "Rename", es: "Renombrar" })}
                            onClick={() => {
                              setRenameTarget(kit);
                              setRenameValue(kit.brand_name || "");
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="hover:bg-white/10"
                            title={tx({ de: "Website neu analysieren", en: "Re-analyze website", es: "Volver a analizar el sitio web" })}
                            onClick={() => setRefreshTarget(kit)}
                          >
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="hover:bg-white/10"
                            onClick={() => handleDuplicate(kit)}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="hover:bg-white/10"
                            title={kit.archived_at
                              ? tx({ de: "Wiederherstellen", en: "Unarchive", es: "Desarchivar" })
                              : tx({ de: "Archivieren", en: "Archive", es: "Archivar" })}
                            onClick={() => archiveMutation.mutate({ id: kit.id, archive: !kit.archived_at })}
                          >
                            {kit.archived_at ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="hover:bg-destructive/20 hover:text-destructive"
                            onClick={() => {
                              if (confirm(tx({ de: "Wirklich löschen?", en: "Really delete?", es: "¿Realmente eliminar?" }))) {
                                deleteMutation.mutate(kit.id);
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </motion.div>
              </motion.div>
            </TabsContent>
          </AnimatePresence>
        </Tabs>
      </main>

      <PlanLimitDialog
        open={showPlanLimit}
        onOpenChange={setShowPlanLimit}
        feature="brand_kit"
      />

      <BrandDnaRefreshDialog
        kit={refreshTarget}
        open={!!refreshTarget}
        onOpenChange={(open) => { if (!open) setRefreshTarget(null); }}
      />


      <Dialog open={!!renameTarget} onOpenChange={(open) => { if (!open) { setRenameTarget(null); setRenameValue(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tx({ de: "Marken-Set umbenennen", en: "Rename brand kit", es: "Renombrar kit de marca" })}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="rename-input">{tx({ de: "Name", en: "Name", es: "Nombre" })}</Label>
            <Input
              id="rename-input"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRenameTarget(null); setRenameValue(""); }}>
              {tx({ de: "Abbrechen", en: "Cancel", es: "Cancelar" })}
            </Button>
            <Button
              disabled={!renameValue.trim() || renameMutation.isPending}
              onClick={() => renameTarget && renameMutation.mutate({ id: renameTarget.id, name: renameValue.trim() })}
            >
              {renameMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {tx({ de: "Speichern", en: "Save", es: "Guardar" })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BrandKit;
