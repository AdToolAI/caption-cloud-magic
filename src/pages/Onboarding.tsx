import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Check, Sparkles, Clapperboard, ArrowRight } from "lucide-react";
import { trackEvent, ANALYTICS_EVENTS } from "@/lib/analytics";
import { NicheStep } from "@/components/onboarding/NicheStep";
import { PlatformStep } from "@/components/onboarding/PlatformStep";
import { tx } from "@/lib/i18nText";

/**
 * Studio-Einzug — „Ein Creator. Ein ganzes Studio."
 *
 * Genau EIN Onboarding-Pfad. Drei Fragen, die ausschließlich die erste
 * Produktion füttern (Nische, Format/Plattform, Look/Marke), danach die
 * direkte Übergabe in die First Production. Es wird hier nicht verkauft.
 */
const STEPS = ["language", "niche", "platforms", "brand", "launch"] as const;
type Step = typeof STEPS[number];

export default function Onboarding() {
  const [currentStep, setCurrentStep] = useState<Step>("language");
  const [selectedLang, setSelectedLang] = useState<string>("en");
  const [brandName, setBrandName] = useState("");
  const [brandColor, setBrandColor] = useState("#F5C76A");
  const [loading, setLoading] = useState(false);

  const [businessType, setBusinessType] = useState("creator");
  const [niche, setNiche] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);

  // Feste Defaults — die frühere Ziele-Abfrage entfällt, die Werte bleiben
  // erhalten, damit Wochenplan und Kalender weiterhin befüllt werden.
  const postingGoal = "grow_audience";
  const postsPerWeek = 3;
  const experienceLevel = "beginner";

  const { setLanguage } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [checkingStatus, setCheckingStatus] = useState(true);

  // Guard: if onboarding already done, redirect to /home
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const [profileRes, onboardingRes] = await Promise.all([
        supabase.from("profiles").select("onboarding_completed").eq("id", user.id).maybeSingle(),
        supabase.from("onboarding_profiles" as any).select("user_id").eq("user_id", user.id).maybeSingle(),
      ]);
      if (cancelled) return;
      const alreadyDone = (profileRes.data as any)?.onboarding_completed === true || !!onboardingRes.data;
      if (alreadyDone) {
        navigate("/home", { replace: true });
      } else {
        setCheckingStatus(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user, navigate]);

  const languages = [
    { code: "en", name: "English", flag: "🇬🇧" },
    { code: "de", name: "Deutsch", flag: "🇩🇪" },
    { code: "es", name: "Español", flag: "🇪🇸" },
  ];

  const stepIndex = STEPS.indexOf(currentStep);

  const handleLanguageNext = () => {
    setLanguage(selectedLang as any);
    localStorage.setItem("cg_lang", selectedLang);
    trackEvent(ANALYTICS_EVENTS.ONBOARDING_STEP_COMPLETED, { step: 1, step_name: "language", language: selectedLang });
    setCurrentStep("niche");
  };

  const handlePlatformToggle = (platform: string) => {
    setSelectedPlatforms((prev) =>
      prev.includes(platform) ? prev.filter((p) => p !== platform) : [...prev, platform]
    );
  };

  /**
   * Abschluss des Studio-Setups: schreibt Profil + Flags atomar,
   * stößt Wochenplan und erste Video-Prompts im Hintergrund an
   * (Fehler dort blockieren den Nutzer nie) und übergibt an die
   * First Production.
   */
  const handleFinishSetup = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { error: profileError } = await supabase.from("onboarding_profiles").upsert({
        user_id: user.id,
        niche,
        business_type: businessType,
        platforms: selectedPlatforms,
        posting_goal: postingGoal,
        posts_per_week: postsPerWeek,
        experience_level: experienceLevel,
      }, { onConflict: "user_id" });
      if (profileError) throw profileError;

      const { error: brandError } = await supabase.from("profiles").update({
        brand_name: brandName || "My Studio",
        brand_color: brandColor,
        onboarding_completed: true,
      }).eq("id", user.id);
      if (brandError) throw brandError;

      trackEvent(ANALYTICS_EVENTS.ONBOARDING_FINISHED, {
        brand_name: brandName,
        niche,
        business_type: businessType,
        platforms: selectedPlatforms,
        user_id: user.id,
      });

      // Hintergrund-Setup — darf den Nutzer nicht aufhalten.
      void supabase.functions
        .invoke("generate-starter-plan", {
          body: {
            niche,
            business_type: businessType,
            platforms: selectedPlatforms,
            posting_goal: postingGoal,
            posts_per_week: postsPerWeek,
            experience_level: experienceLevel,
          },
        })
        .catch((e) => console.warn("starter-plan generation failed:", e));

      void supabase.functions
        .invoke("generate-first-video-prompts", {
          body: {
            language: typeof navigator !== "undefined" ? (navigator.language?.slice(0, 2) || "en") : "en",
          },
        })
        .catch((e) => console.warn("first-video-prompts generation failed:", e));

      setCurrentStep("launch");
    } catch (err) {
      console.error("Setup error:", err);
      toast.error(tx({ de: "Dein Studio konnte nicht eingerichtet werden. Bitte versuche es erneut.", en: "Your studio could not be set up. Please try again.", es: "No se pudo configurar tu estudio. Inténtalo de nuevo." }));
    } finally {
      setLoading(false);
    }
  };

  const startFirstProduction = () => {
    trackEvent(ANALYTICS_EVENTS.ONBOARDING_STEP_COMPLETED, { step: 5, step_name: "first_production" });
    const params = new URLSearchParams({ firstProduction: "1" });
    if (niche) params.set("niche", niche);
    if (selectedPlatforms[0]) params.set("platform", selectedPlatforms[0]);
    navigate(`/autopilot?${params.toString()}`);
  };

  if (checkingStatus) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Sparkles className="h-8 w-8 text-primary animate-pulse" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-primary/10 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Sparkles className="h-8 w-8 text-primary" />
            <span className="text-2xl font-bold">AdTool AI</span>
          </div>
          <CardTitle className="text-3xl">
            {currentStep === "launch" ? tx({ de: tx({ de: "Dein Studio ist offen", en: "Your studio is open", es: "Tu estudio está abierto" }), en: "Your studio is open", es: "Tu estudio está abierto" }) : tx({ de: "Ein Creator. Ein ganzes Studio.", en: "One creator. A whole studio.", es: "Un creador. Todo un estudio." })}
          </CardTitle>
          <CardDescription>
            {currentStep === "launch"
              ? tx({ de: tx({ de: "Deine erste Produktion steht bereit", en: "Your first production is ready", es: "Tu primera producción está lista" }), en: "Your first production is ready", es: "Tu primera producción está lista" })
              : tx({ de: `Studio-Setup — Schritt ${stepIndex + 1} von ${STEPS.length - 1}`, en: `Studio setup — step ${stepIndex + 1} of ${STEPS.length - 1}`, es: `Configuración del estudio — paso ${stepIndex + 1} de ${STEPS.length - 1}` })}
          </CardDescription>

          {currentStep !== "launch" && (
            <div className="flex justify-center gap-1.5 mt-6">
              {STEPS.slice(0, -1).map((_, idx) => (
                <div
                  key={idx}
                  className={`h-2 w-12 rounded-full transition-all ${
                    stepIndex >= idx ? "bg-primary" : "bg-muted"
                  }`}
                />
              ))}
            </div>
          )}
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Schritt 1: Sprache */}
          {currentStep === "language" && (
            <div className="space-y-4">
              <h3 className="text-xl font-semibold text-center">{tx({ de: "Wähle deine Sprache", en: "Choose your language", es: "Elige tu idioma" })}</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {languages.map((lang) => (
                  <Card
                    key={lang.code}
                    className={`cursor-pointer transition-all hover:shadow-lg ${
                      selectedLang === lang.code ? "ring-2 ring-primary" : ""
                    }`}
                    onClick={() => setSelectedLang(lang.code)}
                  >
                    <CardContent className="flex flex-col items-center justify-center p-6">
                      <span className="text-4xl mb-2">{lang.flag}</span>
                      <span className="font-medium">{lang.name}</span>
                      {selectedLang === lang.code && <Check className="h-5 w-5 text-primary mt-2" />}
                    </CardContent>
                  </Card>
                ))}
              </div>
              <Button onClick={handleLanguageNext} className="w-full" size="lg">{tx({ de: "Weiter", en: "Next", es: "Siguiente" })}</Button>
            </div>
          )}

          {/* Schritt 2: Nische */}
          {currentStep === "niche" && (
            <NicheStep
              businessType={businessType}
              niche={niche}
              onBusinessTypeChange={setBusinessType}
              onNicheChange={setNiche}
              onNext={() => {
                trackEvent(ANALYTICS_EVENTS.ONBOARDING_STEP_COMPLETED, { step: 2, step_name: "niche", niche, business_type: businessType });
                setCurrentStep("platforms");
              }}
              onBack={() => setCurrentStep("language")}
            />
          )}

          {/* Schritt 3: Format & Plattform */}
          {currentStep === "platforms" && (
            <PlatformStep
              selectedPlatforms={selectedPlatforms}
              onToggle={handlePlatformToggle}
              onNext={() => {
                trackEvent(ANALYTICS_EVENTS.ONBOARDING_STEP_COMPLETED, { step: 3, step_name: "platforms", platforms: selectedPlatforms });
                setCurrentStep("brand");
              }}
              onBack={() => setCurrentStep("niche")}
            />
          )}

          {/* Step 4: Look & brand */}
          {currentStep === "brand" && (
            <div className="space-y-4">
              <h3 className="text-xl font-semibold text-center">{tx({ de: "Gib deinem Studio einen Namen", en: "Give your studio a name", es: "Ponle un nombre a tu estudio" })}</h3>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="brandName">{tx({ de: "Studio- bzw. Markenname", en: "Studio or brand name", es: "Nombre del estudio o marca" })}</Label>
                  <Input
                    id="brandName"
                    placeholder={tx({ de: "Mein Studio", en: "My Studio", es: "Mi Estudio" })}
                    value={brandName}
                    onChange={(e) => setBrandName(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="brandColor">{tx({ de: "Signaturfarbe", en: "Signature color", es: "Color distintivo" })}</Label>
                  <div className="flex gap-4 items-center">
                    <Input
                      id="brandColor"
                      type="color"
                      value={brandColor}
                      onChange={(e) => setBrandColor(e.target.value)}
                      className="h-12 w-24"
                    />
                    <Input
                      value={brandColor}
                      onChange={(e) => setBrandColor(e.target.value)}
                      placeholder="#F5C76A"
                    />
                  </div>
                </div>
              </div>
              <div className="flex gap-4">
                <Button onClick={() => setCurrentStep("platforms")} variant="outline" size="lg" className="w-full">
                  {tx({ de: "Zurück", en: "Back", es: "Atrás" })}
                </Button>
                <Button onClick={handleFinishSetup} size="lg" className="w-full" disabled={loading || !brandName}>
                  {loading ? tx({ de: tx({ de: "Studio wird eingerichtet...", en: "Setting up your studio...", es: "Preparando tu estudio..." }), en: "Setting up studio...", es: "Configurando estudio..." }) : tx({ de: "Studio öffnen", en: "Open studio", es: "Abrir estudio" })}
                </Button>
              </div>
            </div>
          )}

          {/* Schritt 5: Übergabe in die First Production */}
          {currentStep === "launch" && (
            <div className="space-y-6 text-center">
              <div className="flex justify-center">
                <div className="rounded-full bg-primary/10 p-5">
                  <Clapperboard className="h-10 w-10 text-primary" />
                </div>
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-semibold">
                  {brandName || tx({ de: "Dein Studio", en: "Your studio", es: "Tu estudio" })} {tx({ de: "ist bereit", en: "is ready", es: "está listo" })}
                </h3>
                <p className="text-muted-foreground">
                  {tx({ de: "Wir haben eine erste Produktion für " + (niche || "deine Nische") + " vorbereitet. Du musst sie nur noch starten — den Rest übernimmt dein Studio.", en: "We have prepared a first production for " + (niche || "your niche") + ". Just start it — your studio takes care of the rest.", es: "Hemos preparado una primera producción para " + (niche || "tu nicho") + ". Solo tienes que iniciarla — el resto lo hace tu estudio." })}
                </p>
              </div>
              <Button onClick={startFirstProduction} size="lg" className="w-full">
                {tx({ de: "Erste Produktion starten", en: "Start first production", es: "Iniciar primera producción" })}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button variant="ghost" className="w-full" onClick={() => navigate("/home")}>
                {tx({ de: "Später — zuerst umsehen", en: "Later — look around first", es: "Más tarde — primero echar un vistazo" })}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
