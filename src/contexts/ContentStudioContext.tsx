import { tx } from "@/lib/i18nText";
import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DESIGN_TEMPLATES, pickVariants } from "@/lib/post-design/templates";
import { detectIntent, isPostIntent, seedFromText, type PostIntent } from "@/lib/post-design/intent";
import { buildImagePrompt, negativeZoneForDesign, type NegativeZone } from "@/lib/post-design/imagePrompt";
import { detectImageText } from "@/lib/post-design/detectImageText";
import { MOODS, applyMood, type MoodId } from "@/lib/post-design/moods";
import { applyBrandKit, setSlideImage, type BrandKitLike } from "@/lib/post-design/brand";
import {
  cloneDesign, emptyDesign, uid,
  type Layer, type PostDesign, type TextLayer,
} from "@/lib/post-design/schema";

export const STUDIO_STEPS = ["brief", "copy", "motif", "layout", "deliver"] as const;
export type StudioStep = (typeof STUDIO_STEPS)[number];

export type ImageMode = "ai" | "own" | "none";

export interface CopyVariant {
  name: string;
  headline: string;
  subline: string;
}

export interface CopyPayload {
  headline: string;
  subline: string;
  cta: string;
  badge: string;
  caption: string;
  imagePrompt?: string;
  intent?: string;
  variants: CopyVariant[];
}

/** Literale "\n"-Sequenzen aus KI-Antworten in echte Umbrüche wandeln. */
export function nl(value: string | undefined | null): string {
  return (value ?? "").replace(/\\r\\n|\\n|\\r/g, "\n");
}

function fillCopy(
  design: PostDesign,
  copy: { headline: string; subline: string; cta: string; badge: string },
) {
  const next = cloneDesign(design);
  let headlineDone = false;
  let sublineDone = false;
  next.slides[0].layers = next.slides[0].layers.map((layer) => {
    if (layer.type === "badge" && copy.badge) return { ...layer, text: nl(copy.badge) };
    if (layer.type !== "text") return layer;
    const t = layer as TextLayer;
    if (!headlineDone && t.size >= 0.06) {
      headlineDone = true;
      return { ...t, text: nl(copy.headline) || t.text };
    }
    if (!sublineDone && t.size < 0.06 && t.size >= 0.028) {
      sublineDone = true;
      return { ...t, text: nl(copy.subline) || t.text };
    }
    if (t.size < 0.028 && copy.cta) return { ...t, text: nl(copy.cta) };
    return t;
  });
  return next;
}

interface ContentStudioValue {
  // Schritt-Steuerung
  step: StudioStep;
  goTo: (step: StudioStep) => void;
  reached: StudioStep[];

  // Briefing
  brief: string; setBrief: (v: string) => void;
  platform: string; setPlatform: (v: string) => void;
  language: string; setLanguage: (v: string) => void;
  tone: string; setTone: (v: string) => void;

  // Copy
  copy: CopyPayload | null;
  copyIndex: number;
  setCopyIndex: (i: number) => void;
  activeCopy: { headline: string; subline: string; cta: string; badge: string } | null;
  caption: string; setCaption: (v: string) => void;
  copyBusy: boolean;
  generateCopy: () => Promise<void>;

  // Motiv
  image: string | null;
  setUserImage: (url: string | null) => void;
  imageMode: ImageMode; setImageMode: (m: ImageMode) => void;
  imageBusy: boolean;
  imageError: string | null;
  generateMotif: (angle?: string) => Promise<void>;

  // Layout
  variants: PostDesign[];
  buildLayouts: () => void;
  moreVariants: () => void;
  shuffleVariant: (index: number) => void;
  moodId: MoodId; setMood: (m: MoodId) => void;
  design: PostDesign;
  setDesign: React.Dispatch<React.SetStateAction<PostDesign>>;
  openDesign: (design: PostDesign) => void;
  hasDesign: boolean;
  activeSlide: number; setActiveSlide: (i: number) => void;
  selectedId: string | null; setSelectedId: (id: string | null) => void;
  updateSlide: (index: number, updater: (s: PostDesign["slides"][number]) => PostDesign["slides"][number]) => void;
  changeLayer: (id: string, patch: Partial<Layer>) => void;

  brandKit: BrandKitLike | null;
  reset: () => void;
  /** Einen Schritt zurück — nie unter „Briefing“. */
  back: () => void;

  /** Höchster Schritt, der mit dem aktuellen Stand sinnvoll erreichbar ist. */
  furthestAllowed: StudioStep;
  canEnter: (step: StudioStep) => boolean;
  /** True, wenn beim Öffnen ein gespeicherter Entwurf geladen wurde. */
  restored: boolean;
  dismissRestored: () => void;
  /** Serien-Modus (Quelle der Wahrheit: URL-Parameter `mode=series`). */
  series: boolean;
}



const Ctx = createContext<ContentStudioValue | null>(null);

const DRAFT_VERSION = 2;
const DRAFT_PREFIX = "content-studio:draft:";
/** Über dieser Größe wird nicht gesichert — der Entwurf bleibt dann nur im Speicher. */
const DRAFT_MAX_BYTES = 2_000_000;

interface StudioDraft {
  v: number;
  brief: string;
  platform: string;
  language: string;
  tone: string;
  copy: CopyPayload | null;
  copyIndex: number;
  caption: string;
  image: string | null;
  imageMode: ImageMode;
  moodId: MoodId;
  design: PostDesign | null;
  hasDesign: boolean;
  savedAt: number;
}



export function useContentStudio(): ContentStudioValue {
  const value = useContext(Ctx);
  if (!value) throw new Error(tx({ de: "useContentStudio muss innerhalb von ContentStudioProvider genutzt werden", en: "useContentStudio must be used within ContentStudioProvider", es: "useContentStudio debe usarse dentro de ContentStudioProvider" }));
  return value;
}

export function ContentStudioProvider({
  step,
  goTo,
  series = false,
  clearParams,
  children,
}: {
  step: StudioStep;
  goTo: (step: StudioStep) => void;
  /** Serien-Modus aus der URL (`mode=series`). */
  series?: boolean;
  /** Räumt die Studio-Parameter aus der URL — wird beim Zurücksetzen genutzt. */
  clearParams?: () => void;
  children: React.ReactNode;
}) {
  const { user } = useAuth();

  const [brief, setBrief] = useState("");
  const [platform, setPlatform] = useState("instagram");
  const [language, setLanguage] = useState("de");
  const [tone, setTone] = useState("selbstbewusst, klar");

  const [copy, setCopy] = useState<CopyPayload | null>(null);
  const [copyIndex, setCopyIndex] = useState(0);
  const [caption, setCaption] = useState("");
  const [copyBusy, setCopyBusy] = useState(false);

  const [imageMode, setImageMode] = useState<ImageMode>("ai");
  const [image, setImage] = useState<string | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const userImageRef = useRef(false);

  const [variants, setVariants] = useState<PostDesign[]>([]);
  const [variantOffset, setVariantOffset] = useState(0);
  const [moodId, setMoodId] = useState<MoodId>("brand");
  const [design, setDesign] = useState<PostDesign>(() => emptyDesign());
  const [hasDesign, setHasDesign] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [brandKit, setBrandKit] = useState<BrandKitLike | null>(null);

  const [restored, setRestored] = useState(false);
  const [reached, setReached] = useState<StudioStep[]>(["brief"]);
  const hydratedRef = useRef(false);
  const draftKey = user ? `${DRAFT_PREFIX}${user.id}` : null;

  /** Gespeicherten Entwurf laden — genau einmal pro Sitzung. */
  useEffect(() => {
    if (!draftKey || hydratedRef.current) return;
    hydratedRef.current = true;
    try {
      const raw = window.localStorage.getItem(draftKey);
      if (!raw) return;
      const draft = JSON.parse(raw) as StudioDraft;
      if (draft?.v !== DRAFT_VERSION) {
        window.localStorage.removeItem(draftKey);
        return;
      }
      if (!draft.brief && !draft.copy && !draft.hasDesign) return;
      setBrief(draft.brief ?? "");
      setPlatform(draft.platform ?? "instagram");
      setLanguage(draft.language ?? "de");
      setTone(draft.tone ?? "selbstbewusst, klar");
      setCopy(draft.copy ?? null);
      setCopyIndex(draft.copyIndex ?? 0);
      setCaption(draft.caption ?? "");
      setImage(draft.image ?? null);
      setImageMode(draft.imageMode ?? "ai");
      setMoodId(draft.moodId ?? "brand");
      if (draft.design) setDesign(draft.design);
      setHasDesign(!!draft.hasDesign);
      // Schritt-Historie aus dem tatsächlichen Stand ableiten, damit die
      // Leiste nach einem Reload nicht künstlich gesperrt ist.
      setReached(
        draft.hasDesign
          ? [...STUDIO_STEPS]
          : draft.copy
            ? ["brief", "copy", "motif"]
            : ["brief"],
      );
      setRestored(true);
    } catch {
      window.localStorage.removeItem(draftKey);
    }
  }, [draftKey]);

  /** Entwurf entprellt sichern, sobald sich etwas Relevantes ändert. */
  useEffect(() => {
    if (!draftKey || !hydratedRef.current) return;
    const timer = window.setTimeout(() => {
      const draft: StudioDraft = {
        v: DRAFT_VERSION,
        brief, platform, language, tone,
        copy, copyIndex, caption,
        // Data-URLs sprengen den lokalen Speicher — nur echte Links sichern.
        image: image && image.startsWith("data:") ? null : image,
        imageMode,
        moodId,
        design: hasDesign ? design : null,
        hasDesign,
        savedAt: Date.now(),
      };
      try {
        const payload = JSON.stringify(draft);
        if (payload.length > DRAFT_MAX_BYTES) return;
        window.localStorage.setItem(draftKey, payload);
      } catch {
        /* Speicher voll oder blockiert — Entwurf bleibt in-memory. */
      }
    }, 600);
    return () => window.clearTimeout(timer);
  }, [
    draftKey, brief, platform, language, tone, copy, copyIndex, caption,
    image, imageMode, moodId, design, hasDesign,
  ]);

  useEffect(() => {
    setReached((prev) => (prev.includes(step) ? prev : [...prev, step]));
  }, [step]);


  const intentRef = useRef<PostIntent>("statement");
  const zoneRef = useRef<NegativeZone>("bottom");
  const templatesRef = useRef<typeof DESIGN_TEMPLATES>([]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("brand_kits")
      .select("*")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setBrandKit((data as BrandKitLike) ?? null));
  }, [user]);

  const activeCopy = useMemo(() => {
    if (!copy) return null;
    const v = copy.variants?.[copyIndex % Math.max(1, copy.variants?.length ?? 1)];
    return {
      headline: v?.headline || copy.headline,
      subline: v?.subline || copy.subline,
      cta: copy.cta,
      badge: copy.badge,
    };
  }, [copy, copyIndex]);

  const buildVariants = useCallback(
    (
      source: CopyPayload,
      templates: typeof DESIGN_TEMPLATES,
      img: string | null,
      mood: MoodId,
      copyOffset = 0,
    ): PostDesign[] => {
      const active = MOODS.find((m) => m.id === mood) ?? MOODS[0];
      return templates.map((template, i) => {
        const v = source.variants?.[(i + copyOffset) % Math.max(1, source.variants?.length ?? 1)];
        const base = template.build({ image: img });
        const filled = fillCopy(base, {
          headline: v?.headline || source.headline,
          subline: v?.subline || source.subline,
          cta: source.cta,
          badge: source.badge,
        });
        const branded = applyBrandKit(
          {
            ...filled,
            variantName: v?.name || template.name,
            title: source.headline?.slice(0, 60) || "Neuer Post",
          },
          brandKit,
        );
        return applyMood(branded, active);
      });
    },
    [brandKit],
  );

  const generateCopy = useCallback(async () => {
    if (!brief.trim()) {
      toast.error(tx({ de: "Bitte kurz beschreiben, worum es geht", en: "Please briefly describe what it is about", es: "Por favor describe brevemente de qué se trata." }));
      return;
    }
    setCopyBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-post-design", {
        body: { brief, platform, language, tone, brandName: brandKit?.name ?? "" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const next = data.copy as CopyPayload;
      setCopy(next);
      setCopyIndex(0);
      setCaption(nl(next.caption ?? ""));
      intentRef.current = isPostIntent(next.intent) ? next.intent : detectIntent(brief);
      goTo("copy");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tx({ de: "Generierung fehlgeschlagen", en: "Generation failed", es: "Error de generación" }));
    } finally {
      setCopyBusy(false);
    }
  }, [brief, platform, language, tone, brandKit, goTo]);

  const requestImage = useCallback(async (prompt: string): Promise<string> => {
    const { data, error } = await supabase.functions.invoke("generate-studio-image", {
      body: { prompt: prompt.trim(), style: "realistic", aspectRatio: "1:1", quality: "fast", textFree: true },
    });
    if (error) throw error;
    if (data?.ok === false || data?.error) throw new Error(data.error || tx({ de: "Bildgenerierung fehlgeschlagen", en: "Image generation failed", es: "Error al generar la imagen" }));
    const url: string | undefined = data?.image?.url ?? data?.image;
    if (!url) throw new Error(tx({ de: "Kein Bild erhalten", en: "No picture received", es: "No se recibió ninguna foto" }));
    return url;
  }, []);

  const applyImageEverywhere = useCallback((url: string) => {
    setImage(url);
    setVariants((prev) => prev.map((v) => ({ ...v, slides: v.slides.map((s) => setSlideImage(s, url)) })));
    setDesign((prev) => ({ ...prev, slides: prev.slides.map((s) => setSlideImage(s, url)) }));
  }, []);

  const generateMotif = useCallback(
    async (angle?: string) => {
      setImageBusy(true);
      setImageError(null);
      try {
        const zone = hasDesign ? negativeZoneForDesign(design) : zoneRef.current;
        const base = {
          imagePrompt: copy?.imagePrompt,
          brief,
          zone,
          angle,
          brandName: brandKit?.name ?? "",
        };
        const url = await requestImage(buildImagePrompt(base));
        let final = url;
        if (await detectImageText(url)) {
          try {
            final = await requestImage(buildImagePrompt({ ...base, strict: true }));
          } catch {
            final = url;
          }
        }
        userImageRef.current = false;
        applyImageEverywhere(final);
      } catch (err) {
        const message = err instanceof Error ? err.message : tx({ de: "Bildgenerierung fehlgeschlagen", en: "Image generation failed", es: "Error al generar la imagen" });
        setImageError(message);
        toast.error(message);
      } finally {
        setImageBusy(false);
      }
    },
    [applyImageEverywhere, brandKit, brief, copy, design, hasDesign, requestImage],
  );

  const setUserImage = useCallback(
    (url: string | null) => {
      userImageRef.current = !!url;
      if (!url) {
        setImage(null);
        return;
      }
      applyImageEverywhere(url);
    },
    [applyImageEverywhere],
  );

  const buildLayouts = useCallback(() => {
    if (!copy) return;
    const templates = pickVariants(platform, tone, 8, 0, {
      intent: intentRef.current,
      seed: seedFromText(`${brief}|${platform}`),
      headlineLength: (activeCopy?.headline ?? copy.headline ?? "").length,
    });
    templatesRef.current = templates;
    const built = buildVariants(
      { ...copy, headline: activeCopy?.headline ?? copy.headline, subline: activeCopy?.subline ?? copy.subline },
      templates,
      imageMode === "none" ? null : image,
      moodId,
      copyIndex,
    );
    setVariants(built);
    setVariantOffset(0);
    zoneRef.current = built[0] ? negativeZoneForDesign(built[0]) : "bottom";
  }, [activeCopy, brief, buildVariants, copy, copyIndex, image, imageMode, moodId, platform, tone]);

  const moreVariants = useCallback(() => {
    if (!copy) return;
    const next = variantOffset + 4;
    const templates = pickVariants(platform, tone, 4, next + 4, {
      intent: intentRef.current,
      seed: seedFromText(`${brief}|${platform}|${next}`),
      headlineLength: (copy.headline ?? "").length,
    });
    templatesRef.current = [...templatesRef.current, ...templates];
    setVariants((prev) => [...prev, ...buildVariants(copy, templates, image, moodId, next)]);
    setVariantOffset(next);
  }, [brief, buildVariants, copy, image, moodId, platform, tone, variantOffset]);

  const shuffleVariant = useCallback(
    (index: number) => {
      const template = templatesRef.current[index];
      if (!copy || !template) return;
      const shift = 1 + Math.floor(Math.random() * Math.max(1, (copy.variants?.length ?? 1) - 1));
      const [rebuilt] = buildVariants(copy, [template], image, moodId, index + shift);
      setVariants((prev) => prev.map((v, i) => (i === index ? rebuilt : v)));
    },
    [buildVariants, copy, image, moodId],
  );

  const setMood = useCallback(
    (next: MoodId) => {
      setMoodId(next);
      if (!copy || !templatesRef.current.length) return;
      setVariants(buildVariants(copy, templatesRef.current, image, next));
    },
    [buildVariants, copy, image],
  );

  const openDesign = useCallback((next: PostDesign) => {
    setDesign(next);
    setHasDesign(true);
    setActiveSlide(0);
    setSelectedId(null);
  }, []);

  const updateSlide = useCallback(
    (index: number, updater: (s: PostDesign["slides"][number]) => PostDesign["slides"][number]) => {
      setDesign((prev) => ({ ...prev, slides: prev.slides.map((s, i) => (i === index ? updater(s) : s)) }));
    },
    [],
  );

  const changeLayer = useCallback(
    (id: string, patch: Partial<Layer>) => {
      updateSlide(activeSlide, (s) => ({
        ...s,
        layers: s.layers.map((l) => (l.id === id ? ({ ...l, ...patch } as Layer) : l)),
      }));
    },
    [activeSlide, updateSlide],
  );

  const reset = useCallback(() => {
    setBrief("");
    setCopy(null);
    setCopyIndex(0);
    setCaption("");
    setImage(null);
    setImageError(null);
    setVariants([]);
    setDesign(emptyDesign());
    setHasDesign(false);
    setActiveSlide(0);
    setSelectedId(null);
    setReached(["brief"]);
    setRestored(false);
    templatesRef.current = [];
    userImageRef.current = false;
    if (draftKey) {
      try { window.localStorage.removeItem(draftKey); } catch { /* ignoriert */ }
    }
    clearParams?.();
    goTo("brief");
  }, [clearParams, draftKey, goTo]);

  const furthestAllowed: StudioStep = useMemo(() => {
    if (hasDesign) return "deliver";
    // Eine Serie braucht nur ein Briefing — kein Layout.
    if (series && brief.trim()) return "deliver";
    if (copy) return "layout";
    return "brief";
  }, [brief, copy, hasDesign, series]);

  const canEnter = useCallback(
    (target: StudioStep) => STUDIO_STEPS.indexOf(target) <= STUDIO_STEPS.indexOf(furthestAllowed),
    [furthestAllowed],
  );

  const back = useCallback(() => {
    const index = STUDIO_STEPS.indexOf(step);
    if (index > 0) goTo(STUDIO_STEPS[index - 1]);
  }, [goTo, step]);

  const dismissRestored = useCallback(() => setRestored(false), []);



  const value: ContentStudioValue = {
    step, goTo, reached,
    brief, setBrief, platform, setPlatform, language, setLanguage, tone, setTone,
    copy, copyIndex, setCopyIndex, activeCopy, caption, setCaption, copyBusy, generateCopy,
    image, setUserImage, imageMode, setImageMode, imageBusy, imageError, generateMotif,
    variants, buildLayouts, moreVariants, shuffleVariant, moodId, setMood,
    design, setDesign, openDesign, hasDesign, activeSlide, setActiveSlide,
    selectedId, setSelectedId, updateSlide, changeLayer,
    brandKit, reset, back,
    furthestAllowed, canEnter, restored, dismissRestored, series,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export { uid };
