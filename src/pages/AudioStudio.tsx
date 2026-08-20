import { tx } from "@/lib/i18nText";
import { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Headphones, Upload, Wand2, Mic, Music, Music2, Volume2, AudioLines, Sparkles, FileAudio, Play, Pause, Library, Film, Layers, MessageCircle, FileText, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AudioStudioHeroHeader } from '@/components/audio-studio/AudioStudioHeroHeader';
import { TranscriptWaveformEditor } from '@/components/audio-studio/TranscriptWaveformEditor';
import { AIEnhancementSidebar } from '@/components/audio-studio/AIEnhancementSidebar';
import { StudioSoundButton } from '@/components/audio-studio/StudioSoundButton';
import { BeatSyncTimeline } from '@/components/audio-studio/BeatSyncTimeline';
import { FillerWordPanel } from '@/components/audio-studio/FillerWordPanel';
import { AudioBeforeAfterComparison } from '@/components/audio-studio/AudioBeforeAfterComparison';
import { SoundLibrary } from '@/components/audio-studio/SoundLibrary';
import { VoiceLibraryPanel } from '@/components/audio-studio/VoiceLibraryPanel';
import { MyVoicesSection } from '@/components/audio-studio/MyVoicesSection';
import { MusicGeneratorPanel } from '@/components/audio-studio/MusicGeneratorPanel';
import { AutoMatchPanel } from '@/components/audio-studio/AutoMatchPanel';
import { AudioDuckingPanel } from '@/components/audio-studio/AudioDuckingPanel';
import { StemMixerPanel } from '@/components/audio-studio/StemMixerPanel';
import { FinalMixPanel } from '@/components/audio-studio/FinalMixPanel';
import { VoiceStudioDialog } from '@/components/voice/studio/VoiceStudioDialog';
import { AudiobookPanel } from '@/components/audio-studio/audiobook/AudiobookPanel';
import { useDropzone } from 'react-dropzone';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

export default function AudioStudio() {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [originalAudioUrl, setOriginalAudioUrl] = useState<string | null>(null);
  const [enhancedAudioUrl, setEnhancedAudioUrl] = useState<string | null>(null);
  const [storageAudioUrl, setStorageAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [transcript, setTranscript] = useState<Array<{ word: string; start: number; end: number; type: 'normal' | 'filler' | 'pause' }>>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState<'enhance' | 'transcript' | 'beat-sync' | 'ducking' | 'filler' | 'compare' | 'library' | 'voices' | 'audiobook' | 'music' | 'auto-match' | 'stems' | 'final-mix'>('enhance');
  const [stemSet, setStemSet] = useState<{ sourceTitle: string; stems: Array<{ type: 'vocals' | 'drums' | 'bass' | 'other'; url: string; assetId?: string }> } | null>(null);
  const [showMusicGen, setShowMusicGen] = useState(false);
  const [showAutoMatch, setShowAutoMatch] = useState(false);
  const [showVoiceStudio, setShowVoiceStudio] = useState(false);
  const [showAudiobook, setShowAudiobook] = useState(false);
  const [musicGenPrefill, setMusicGenPrefill] = useState<{
    prompt: string; genre: string; mood: string; bpm: number; duration: number;
  } | null>(null);
  const [libraryRefreshKey, setLibraryRefreshKey] = useState(0);
  const [musicUrl, setMusicUrl] = useState<string | null>(null);
  const [detectedVideoBpm, setDetectedVideoBpm] = useState<number | undefined>(undefined);
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement>(null);

  const handleCustomizeFromAutoMatch = useCallback((prefill: {
    prompt: string; genre: string; mood: string; bpm: number; duration: number;
  }) => {
    setMusicGenPrefill(prefill);
    setShowAutoMatch(false);
    setShowMusicGen(true);
  }, []);

  const handleSendToBeatSync = useCallback((track: { url: string; title?: string }) => {
    setMusicUrl(track.url);
    setActiveTab('beat-sync');
    toast.success(tx({ de: "Track in Beat-Sync geladen", en: "Track loaded into beat sync", es: "Pista cargada en sincronización de ritmo" }), {
      description: track.title ? tx({ de: `"${track.title}" bereit für Beat-Matching`, en: `"${track.title}" ready for beat matching`, es: `"${track.title}" listo para coincidir con el ritmo` }) : undefined,
    });
  }, []);

  const handleLoadedMetadata = () => {
    if (mediaRef.current) {
      setDuration(mediaRef.current.duration);
    }
  };

  const handleTimeUpdate = () => {
    if (mediaRef.current) {
      setCurrentTime(mediaRef.current.currentTime);
    }
  };

  const handlePlayPause = () => {
    if (mediaRef.current) {
      if (isPlaying) {
        mediaRef.current.pause();
      } else {
        mediaRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleSeek = (time: number) => {
    if (mediaRef.current) {
      mediaRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      setIsProcessing(true);
      setAudioFile(file);
      
      // Create local URL for preview
      const localUrl = URL.createObjectURL(file);
      setAudioUrl(localUrl);
      setOriginalAudioUrl(localUrl);
      setEnhancedAudioUrl(null);
      
      try {
        // Upload to Supabase Storage for AI processing
        const fileName = `original/${Date.now()}_${Math.random().toString(36).substring(7)}.${file.name.split('.').pop()}`;
        const { data, error } = await supabase.storage
          .from('audio-studio')
          .upload(fileName, file);
        
        if (error) throw error;
        
        // Get public URL for Edge Function
        const { data: publicUrlData } = supabase.storage
          .from('audio-studio')
          .getPublicUrl(fileName);
        
        setStorageAudioUrl(publicUrlData.publicUrl);
        toast.success(tx({ de: "Audio erfolgreich geladen", en: "Audio loaded successfully", es: "Audio cargado exitosamente" }));
      } catch (error) {
        console.error('Upload error:', error);
        toast.error(tx({ de: "Upload fehlgeschlagen", en: "Upload failed", es: "Error al subir" }));
      } finally {
        setIsProcessing(false);
      }
    }
  }, []);

  const handleEnhanced = useCallback((url: string) => {
    setEnhancedAudioUrl(url);
    setAudioUrl(url);
    setActiveTab('compare');
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'audio/*': ['.mp3', '.wav', '.m4a', '.aac', '.ogg'],
      'video/*': ['.mp4', '.mov', '.webm']
    },
    maxFiles: 1
  });

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] bg-primary/5 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-cyan-500/5 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '1s' }} />
        
        {/* Audio wave pattern */}
        <svg className="absolute inset-0 w-full h-full opacity-[0.03]" xmlns="http://www.w3.org/2000/svg">
          <pattern id="audio-waves" x="0" y="0" width="100" height="100" patternUnits="userSpaceOnUse">
            <path d="M0 50 Q25 30 50 50 T100 50" stroke="currentColor" strokeWidth="1" fill="none" className="text-primary" />
            <path d="M0 60 Q25 40 50 60 T100 60" stroke="currentColor" strokeWidth="0.5" fill="none" className="text-cyan-500" />
          </pattern>
          <rect width="100%" height="100%" fill="url(#audio-waves)" />
        </svg>
      </div>

      <div className="relative z-10 container mx-auto px-4 py-8">
        <AudioStudioHeroHeader />

        <AnimatePresence mode="wait">
          {showAutoMatch ? (
            <motion.div
              key="auto-match-standalone"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="mt-8 space-y-4"
            >
              <Button
                variant="ghost"
                onClick={() => setShowAutoMatch(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                ← {tx({ de: 'Zurück zum Audio Studio', en: 'Back to Audio Studio', es: 'Volver al estudio de audio' })}
              </Button>
              <AutoMatchPanel
                onTrackGenerated={(track) => {
                  setLibraryRefreshKey(k => k + 1);
                  handleSendToBeatSync({ url: track.url, title: track.title });
                }}
                onCustomize={handleCustomizeFromAutoMatch}
                onSendToBeatSync={handleSendToBeatSync}
              />
            </motion.div>
          ) : showAudiobook ? (
            <motion.div
              key="audiobook-standalone"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="mt-8 space-y-4"
            >
              <Button
                variant="ghost"
                onClick={() => setShowAudiobook(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                ← {tx({ de: 'Zurück zum Audio Studio', en: 'Back to Audio Studio', es: 'Volver al estudio de audio' })}
              </Button>
              <AudiobookPanel />
            </motion.div>
          ) : showMusicGen ? (
            <motion.div
              key="music-gen-standalone"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="mt-8 space-y-4"
            >
              <Button
                variant="ghost"
                onClick={() => { setShowMusicGen(false); setMusicGenPrefill(null); }}
                className="text-muted-foreground hover:text-foreground"
              >
                ← {tx({ de: 'Zurück zum Audio Studio', en: 'Back to Audio Studio', es: 'Volver al estudio de audio' })}
              </Button>
              <MusicGeneratorPanel
                onTrackGenerated={() => setLibraryRefreshKey(k => k + 1)}
                onSendToBeatSync={handleSendToBeatSync}
                defaultBpm={detectedVideoBpm}
                prefillPrompt={musicGenPrefill?.prompt}
                prefillGenre={musicGenPrefill?.genre}
                prefillMood={musicGenPrefill?.mood}
                prefillBpm={musicGenPrefill?.bpm}
                prefillDuration={musicGenPrefill?.duration}
              />
            </motion.div>
          ) : !audioUrl ? (
            <motion.div
              key="upload"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="mt-8 space-y-6"
            >
              {/* Auto-Match Teaser (TOP) */}
              <Card
                onClick={() => setShowAutoMatch(true)}
                className="relative overflow-hidden cursor-pointer backdrop-blur-xl bg-gradient-to-br from-cyan-500/10 via-card/60 to-primary/10 border-cyan-500/30 hover:border-cyan-500/60 hover:shadow-[0_0_40px_rgba(34,211,238,0.25)] transition-all p-5 group"
              >
                <div className="absolute top-0 right-0 w-48 h-48 bg-cyan-500/15 rounded-full blur-[60px] pointer-events-none" />
                <div className="relative flex items-center gap-4">
                  <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-cyan-500 to-primary flex items-center justify-center shrink-0">
                    <Film className="w-7 h-7 text-primary-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-xs font-bold tracking-wider text-cyan-400">{tx({ de: 'NEU · KOSTENLOS', en: 'NEW · FREE', es: 'NUEVO · GRATIS' })}</span>
                      <h3 className="text-lg font-bold">{tx({ de: 'Music-to-Video Auto-Match', en: 'Music-to-Video Auto-Match', es: 'Sincronización automática de música y video' })}</h3>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-cyan-400">1-Click</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {tx({ de: 'Video hochladen → KI analysiert Mood, BPM & Länge → automatisch passender AI-Soundtrack.', en: 'Upload video → AI analyzes mood, BPM & length → automatic matching AI soundtrack.', es: 'Sube el video → La IA analiza el estado de ánimo, los BPM y la duración → Banda sonora de IA que coincide automáticamente.' })}
                    </p>
                  </div>
                  <Button className="bg-gradient-to-r from-cyan-500 to-primary hover:opacity-90 shrink-0 hidden sm:flex">
                    <Sparkles className="w-4 h-4 mr-2" />
                    {tx({ de: 'Auto-Match starten', en: 'Start Auto-Match', es: 'Iniciar sincronización automática' })}
                  </Button>
                </div>
              </Card>

              {/* Hörbuch Teaser */}
              <Card
                onClick={() => setShowAudiobook(true)}
                className="relative overflow-hidden cursor-pointer backdrop-blur-xl bg-gradient-to-br from-primary/10 via-card/60 to-amber-500/10 border-primary/30 hover:border-primary/60 hover:shadow-[0_0_40px_rgba(245,199,106,0.25)] transition-all p-5 group"
              >
                <div className="absolute top-0 right-0 w-48 h-48 bg-primary/15 rounded-full blur-[60px] pointer-events-none" />
                <div className="relative flex items-center gap-4">
                  <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary to-amber-500 flex items-center justify-center shrink-0">
                    <BookOpen className="w-7 h-7 text-primary-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-xs font-bold tracking-wider text-primary">{tx({ de: 'NEU', en: 'NEW', es: 'NUEVO' })}</span>
                      <h3 className="text-lg font-bold">{tx({ de: 'Hörbuch-Modus', en: 'Audiobook Mode', es: 'Modo audiolibro' })}</h3>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-primary/15 border border-primary/30 text-primary">{tx({ de: '9 Sprachen', en: '9 languages', es: '9 idiomas' })}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {tx({ de: 'Manuskript einfügen → Kapitel & Figuren erkennen → Erzähler- und Charakterstimmen aus der Bibliothek → MP3-Export.', en: 'Insert manuscript → recognize chapters & characters → narrator and character voices from library → MP3 export.', es: 'Insertar manuscrito → reconocer capítulos y personajes → voces de narrador y personajes de la biblioteca → exportación a MP3.' })}
                    </p>
                  </div>
                  <Button className="bg-gradient-to-r from-primary to-amber-500 hover:opacity-90 shrink-0 hidden sm:flex">
                    <Sparkles className="w-4 h-4 mr-2" />
                    {tx({ de: 'Hörbuch starten', en: 'Start Audiobook', es: 'Iniciar audiolibro' })}
                  </Button>
                </div>
              </Card>

              {/* {tx({ de: 'Voice Studio', en: 'Voice Studio', es: 'Estudio de voz' })} Teaser */}
              <Card
                onClick={() => setShowVoiceStudio(true)}
                className="relative overflow-hidden cursor-pointer backdrop-blur-xl bg-gradient-to-br from-primary/10 via-card/60 to-cyan-500/10 border-primary/30 hover:border-primary/60 hover:shadow-[0_0_40px_rgba(var(--primary),0.25)] transition-all p-5 group"
              >
                <div className="absolute top-0 right-0 w-48 h-48 bg-primary/15 rounded-full blur-[60px] pointer-events-none" />
                <div className="relative flex items-center gap-4">
                  <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary to-cyan-500 flex items-center justify-center shrink-0">
                    <Mic className="w-7 h-7 text-primary-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-xs font-bold tracking-wider text-primary">{tx({ de: 'NEU', en: 'NEW', es: 'NUEVO' })}</span>
                      <h3 className="text-lg font-bold">{tx({ de: "Eigene Stimme erstellen", en: "Create your own voice", es: "Crea tu propia voz" })}</h3>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-primary/15 border border-primary/30 text-primary">{tx({ de: 'Voice Studio', en: 'Voice Studio', es: 'Estudio de voz' })}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {tx({ de: 'Skript vorlesen, per Mikrofon aufnehmen oder WhatsApp-Sprachnachricht hochladen — danach für Voiceovers nutzen.', en: 'Read script aloud, record via microphone or upload WhatsApp voice message — then use for voiceovers.', es: 'Lee el guión en voz alta, graba a través del micrófono o sube un mensaje de voz de WhatsApp; luego úsalo para las voces en off.' })}
                    </p>
                  </div>
                  <Button className="bg-gradient-to-r from-primary to-cyan-500 hover:from-primary/90 hover:to-cyan-500/90 shrink-0 hidden sm:flex">
                    <Sparkles className="w-4 h-4 mr-2" />
                    {tx({ de: 'Voice erstellen', en: 'Create Voice', es: 'Crear voz' })}
                  </Button>
                </div>
              </Card>

              {/* Meine Stimmen — geklonte Voices */}
              <MyVoicesSection onCreate={() => setShowVoiceStudio(true)} />

              {/* AI Music Generator Teaser */}
              <Card 
                onClick={() => setShowMusicGen(true)}
                className="relative overflow-hidden cursor-pointer backdrop-blur-xl bg-gradient-to-br from-primary/10 via-card/60 to-cyan-500/10 border-primary/30 hover:border-primary/60 hover:shadow-[0_0_40px_rgba(var(--primary),0.25)] transition-all p-5 group"
              >
                <div className="absolute top-0 right-0 w-48 h-48 bg-primary/15 rounded-full blur-[60px] pointer-events-none" />
                <div className="relative flex items-center gap-4">
                  <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary to-cyan-500 flex items-center justify-center shrink-0">
                    <Music2 className="w-7 h-7 text-primary-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-xs font-bold tracking-wider text-primary">{tx({ de: 'NEU', en: 'NEW', es: 'NUEVO' })}</span>
                      <h3 className="text-lg font-bold">AI Music Generator</h3>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-primary/15 border border-primary/30 text-primary">{tx({ de: "Studio-Qualität", en: "Studio Quality", es: "Calidad de estudio" })}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {tx({ de: "Generiere kommerziell nutzbare Musik aus Text — ab €0.10. Cinematic, Lo-Fi, Corporate, Electronic & mehr.", en: "Generate commercially usable music from text — from €0.10. Cinematic, Lo-Fi, Corporate, Electronic & more.", es: "Genera música de uso comercial a partir de texto — desde 0,10 €. Cinemática, Lo-Fi, Corporativa, Electrónica y más." })}
                    </p>
                  </div>
                  <Button className="bg-gradient-to-r from-primary to-cyan-500 hover:from-primary/90 hover:to-cyan-500/90 shrink-0 hidden sm:flex">
                    <Sparkles className="w-4 h-4 mr-2" />
                    {tx({ de: "Track erstellen", en: "Create track", es: "Crear pista" })}
                  </Button>
                </div>
              </Card>

              <Card
                {...getRootProps()}
                className={`
                  relative overflow-hidden cursor-pointer
                  backdrop-blur-xl bg-card/60 border-border/50
                  transition-all duration-300
                  ${isDragActive ? 'border-primary/60 shadow-[0_0_40px_rgba(var(--primary),0.3)]' : 'hover:border-primary/40 hover:shadow-[0_0_30px_rgba(var(--primary),0.15)]'}
                `}
              >
                <input {...getInputProps()} />
                
                <div className="p-16 flex flex-col items-center justify-center text-center">
                  <motion.div
                    animate={{ 
                      scale: isDragActive ? 1.1 : 1,
                      rotate: isDragActive ? 5 : 0
                    }}
                    className="relative mb-6"
                  >
                    <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl animate-pulse" />
                    <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-primary/20 to-cyan-500/20 flex items-center justify-center border border-primary/30">
                      <Upload className="w-10 h-10 text-primary" />
                    </div>
                  </motion.div>

                  <h3 className="text-2xl font-semibold mb-2">
                    {isDragActive ? tx({ de: tx({ de: "Datei hier ablegen", en: "Drop file here", es: "Suelta el archivo aquí" }), en: 'Drop file here', es: 'Arrastra el archivo aquí' }) : tx({ de: 'Audio oder Video hochladen', en: 'Upload audio or video', es: 'Subir audio o video' })}
                  </h3>
                  <p className="text-muted-foreground mb-6">
                    MP3, WAV, M4A, MP4, MOV • Max. 500MB
                  </p>

                  <Button 
                    size="lg"
                    className="relative overflow-hidden bg-gradient-to-r from-primary to-cyan-500 hover:from-primary/90 hover:to-cyan-500/90"
                  >
                    <FileAudio className="w-5 h-5 mr-2" />
                    {tx({ de: 'Datei auswählen', en: 'Choose file', es: 'Elegir archivo' })}
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full animate-shimmer" />
                  </Button>
                </div>

                {/* Feature preview cards */}
                <div className="px-8 pb-8 grid grid-cols-1 md:grid-cols-4 gap-4">
                  {[
                    { icon: Mic, label: 'Custom Voice', desc: tx({ de: 'Eigene Stimme klonen', en: 'Clone your own voice', es: 'Clona tu propia voz' }) },
                    { icon: FileText, label: tx({ de: 'Skript vorlesen', en: 'Read a script', es: 'Leer un guion' }), desc: tx({ de: 'Geführter Aufnahme-Text', en: 'Guided recording text', es: 'Texto de grabación guiado' }) },
                    { icon: MessageCircle, label: tx({ de: 'WhatsApp Upload', en: 'WhatsApp upload', es: 'subir WhatsApp' }), desc: tx({ de: 'Sprachnachricht nutzen', en: 'Use a voice message', es: 'Usar un mensaje de voz' }) },
                    { icon: Wand2, label: tx({ de: 'Rauschoptimierung', en: 'Noise cleanup', es: 'Reducción de ruido' }), desc: tx({ de: 'Samples automatisch säubern', en: 'Clean samples automatically', es: 'Limpia las muestras automáticamente' }) }
                  ].map((feature, i) => (
                    <motion.div
                      key={feature.label}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 + i * 0.1 }}
                      className="p-4 rounded-xl bg-muted/30 border border-border/50 backdrop-blur-sm"
                    >
                      <feature.icon className="w-6 h-6 text-primary mb-2" />
                      <h4 className="font-medium text-sm">{feature.label}</h4>
                      <p className="text-xs text-muted-foreground">{feature.desc}</p>
                    </motion.div>
                  ))}
                </div>
              </Card>
            </motion.div>
          ) : (
            <motion.div
              key="editor"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="mt-8"
            >
              {/* Main Editor Layout */}
              <div className="grid grid-cols-1 lg:grid-cols-[1fr,320px] gap-6">
                {/* Left: Waveform + Transcript */}
                <div className="space-y-6">
                  {/* Toolbar */}
                  <Card className="backdrop-blur-xl bg-card/60 border-border/50 p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={handlePlayPause}
                          className="w-12 h-12 rounded-full bg-primary/10 hover:bg-primary/20"
                        >
                          {isPlaying ? (
                            <Pause className="w-6 h-6 text-primary" />
                          ) : (
                            <Play className="w-6 h-6 text-primary ml-0.5" />
                          )}
                        </Button>
                        <div className="ml-4">
                          <p className="font-medium truncate max-w-[300px]">{audioFile?.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {Math.floor(currentTime / 60)}:{String(Math.floor(currentTime % 60)).padStart(2, '0')} / {Math.floor(duration / 60)}:{String(Math.floor(duration % 60)).padStart(2, '0')}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <StudioSoundButton 
                          audioUrl={originalAudioUrl || audioUrl || storageAudioUrl || ''}
                          onEnhanced={handleEnhanced}
                        />
                        <Button
                          variant="outline"
                          onClick={() => {
                            setAudioFile(null);
                            setAudioUrl(null);
                          }}
                          className="border-border/50"
                        >
                          {tx({ de: "Neue Datei", en: "New file", es: "Nuevo archivo" })}
                        </Button>
                      </div>
                    </div>
                  </Card>

                  {/* Tab Navigation */}
                  <div className="flex gap-2 flex-wrap">
                    {[
                      { id: 'enhance', label: tx({ de: 'KI-Optimierung', en: 'AI Enhance', es: 'Mejora IA' }), icon: Wand2 },
                      { id: 'auto-match', label: 'Auto-Match', icon: Film, badge: tx({ de: 'NEU', en: 'NEW', es: 'NUEVO' }) },
                      { id: 'music', label: 'AI Music', icon: Music2 },
                      { id: 'ducking', label: 'Ducking', icon: AudioLines, badge: musicUrl ? tx({ de: 'NEU', en: 'NEW', es: 'NUEVO' }) : undefined, disabled: !musicUrl },
                      { id: 'stems', label: 'Stem-Mixer', icon: AudioLines, badge: stemSet ? `${stemSet.stems.length}` : tx({ de: 'NEU', en: 'NEW', es: 'NUEVO' }), disabled: !stemSet },
                      { id: 'final-mix', label: 'Final Mix', icon: Layers, badge: tx({ de: 'NEU', en: 'NEW', es: 'NUEVO' }) },
                      { id: 'compare', label: tx({ de: 'Vergleich', en: 'Compare', es: 'Comparar' }), icon: Volume2, disabled: !enhancedAudioUrl },
                      { id: 'transcript', label: 'Transcript', icon: Mic },
                      { id: 'beat-sync', label: 'Beat-Sync', icon: Music },
                      { id: 'filler', label: tx({ de: 'Filler-Wörter', en: 'Filler words', es: 'Muletillas' }), icon: Volume2 },
                      { id: 'library', label: tx({ de: 'Bibliothek', en: 'Library', es: 'Biblioteca' }), icon: Library },
                      { id: 'voices', label: 'Custom Voices', icon: Mic, badge: tx({ de: 'NEU', en: 'NEW', es: 'NUEVO' }) },
                      { id: 'audiobook', label: tx({ de: 'Hörbuch', en: 'Audiobook', es: 'Audiolibro' }), icon: BookOpen, badge: tx({ de: 'NEU', en: 'NEW', es: 'NUEVO' }) }
                    ].map((tab) => (
                      <Button
                        key={tab.id}
                        variant={activeTab === tab.id ? 'default' : 'outline'}
                        onClick={() => setActiveTab(tab.id as typeof activeTab)}
                        disabled={'disabled' in tab && tab.disabled}
                        className={`
                          relative overflow-hidden
                          ${activeTab === tab.id 
                            ? 'bg-gradient-to-r from-primary to-cyan-500 border-0' 
                            : 'border-border/50 hover:border-primary/40'
                          }
                          ${'disabled' in tab && tab.disabled ? 'opacity-50 cursor-not-allowed' : ''}
                        `}
                      >
                        <tab.icon className="w-4 h-4 mr-2" />
                        {tab.label}
                        {'badge' in tab && tab.badge && (
                          <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary/20 text-primary border border-primary/40">
                            {tab.badge}
                          </span>
                        )}
                        {activeTab === tab.id && (
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full animate-shimmer" />
                        )}
                      </Button>
                    ))}
                  </div>

                  {/* Content Area */}
                  <AnimatePresence mode="wait">
                    {activeTab === 'transcript' && (
                      <motion.div
                        key="transcript"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                      >
                        <TranscriptWaveformEditor
                          audioUrl={audioUrl}
                          transcript={transcript}
                          currentTime={currentTime}
                          duration={duration}
                          onTimeChange={handleSeek}
                          onTranscriptChange={setTranscript}
                        />
                      </motion.div>
                    )}

                    {activeTab === 'beat-sync' && (
                      <motion.div
                        key="beat-sync"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                      >
                        <BeatSyncTimeline
                          audioUrl={audioUrl}
                          duration={duration}
                          currentTime={currentTime}
                          onTimeChange={handleSeek}
                          initialMusicUrl={musicUrl}
                          onBpmDetected={setDetectedVideoBpm}
                        />
                      </motion.div>
                    )}

                    {activeTab === 'filler' && (
                      <motion.div
                        key="filler"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                      >
                        <FillerWordPanel
                          audioUrl={audioUrl}
                          transcript={transcript}
                          onTranscriptChange={setTranscript}
                        />
                      </motion.div>
                    )}

                    {activeTab === 'enhance' && (
                      <motion.div
                        key="enhance"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                      >
                        <AIEnhancementSidebar
                          audioUrl={storageAudioUrl || audioUrl}
                          onEnhanced={handleEnhanced}
                          isFullWidth
                        />
                      </motion.div>
                    )}

                    {activeTab === 'compare' && originalAudioUrl && enhancedAudioUrl && (
                      <motion.div
                        key="compare"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                      >
                        <AudioBeforeAfterComparison
                          originalUrl={originalAudioUrl}
                          enhancedUrl={enhancedAudioUrl}
                          originalFileName={audioFile?.name}
                          onSaved={() => setLibraryRefreshKey(k => k + 1)}
                        />
                      </motion.div>
                    )}

                    {activeTab === 'library' && (
                      <motion.div
                        key="library"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                      >
                        <SoundLibrary 
                          key={libraryRefreshKey}
                          onLoadAudio={(url, origUrl) => {
                            setEnhancedAudioUrl(url);
                            if (origUrl) setOriginalAudioUrl(origUrl);
                            setAudioUrl(url);
                            setActiveTab('compare');
                          }}
                          onSendToBeatSync={(url, title) => handleSendToBeatSync({ url, title })}
                          onStemsExtracted={(set) => {
                            setStemSet(set);
                            setActiveTab('stems');
                            toast.success(tx({ de: "Stems bereit zum Mixen", en: "Stems ready for mixing", es: "Tallos listos para mezclar" }), {
                              description: tx({ de: `${set.stems.length} Spuren in den Stem-Mixer geladen`, en: `${set.stems.length} tracks loaded into the stem mixer`, es: `${set.stems.length} pistas cargadas en el mezclador principal` }),
                            });
                          }}
                        />
                      </motion.div>
                    )}

                    {activeTab === 'stems' && stemSet && (
                      <motion.div
                        key="stems"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                      >
                        <StemMixerPanel
                          stems={stemSet.stems}
                          sourceTitle={stemSet.sourceTitle}
                          onMixSaved={() => setLibraryRefreshKey(k => k + 1)}
                        />
                      </motion.div>
                    )}

                    {activeTab === 'final-mix' && (
                      <motion.div
                        key="final-mix"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                      >
                        <FinalMixPanel
                          initialSources={[
                            ...(originalAudioUrl || enhancedAudioUrl || audioUrl ? [{
                              id: 'voice-current',
                              label: audioFile?.name || 'Voiceover',
                              url: enhancedAudioUrl || originalAudioUrl || audioUrl!,
                              kind: 'voice' as const,
                            }] : []),
                            ...(musicUrl ? [{
                              id: 'music-current',
                              label: 'Music Track',
                              url: musicUrl,
                              kind: 'music' as const,
                            }] : []),
                          ]}
                          onMixSaved={() => {
                            setLibraryRefreshKey(k => k + 1);
                            toast.success(tx({ de: "Final Mix gespeichert", en: "Final mix saved", es: "Mezcla final guardada" }), { description: tx({ de: 'In Bibliothek verfügbar', en: 'Available in library', es: 'Disponible en la biblioteca' }) });
                          }}
                        />
                      </motion.div>
                    )}

                    {activeTab === 'voices' && (
                      <motion.div
                        key="voices"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                      >
                        <VoiceLibraryPanel />
                      </motion.div>
                    )}

                    {activeTab === 'audiobook' && (
                      <motion.div
                        key="audiobook"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                      >
                        <AudiobookPanel />
                      </motion.div>
                    )}

                    {activeTab === 'music' && (
                      <motion.div
                        key="music"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                      >
                        <MusicGeneratorPanel
                          onTrackGenerated={() => setLibraryRefreshKey(k => k + 1)}
                          onOpenLibrary={() => setActiveTab('library')}
                          onSendToBeatSync={handleSendToBeatSync}
                          defaultBpm={detectedVideoBpm}
                          prefillPrompt={musicGenPrefill?.prompt}
                          prefillGenre={musicGenPrefill?.genre}
                          prefillMood={musicGenPrefill?.mood}
                          prefillBpm={musicGenPrefill?.bpm}
                          prefillDuration={musicGenPrefill?.duration}
                        />
                      </motion.div>
                    )}

                    {activeTab === 'auto-match' && (
                      <motion.div
                        key="auto-match"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                      >
                        <AutoMatchPanel
                          onTrackGenerated={(track) => {
                            setLibraryRefreshKey(k => k + 1);
                            handleSendToBeatSync({ url: track.url, title: track.title });
                          }}
                          onCustomize={(prefill) => {
                            setMusicGenPrefill(prefill);
                            setActiveTab('music');
                          }}
                          onSendToBeatSync={handleSendToBeatSync}
                        />
                      </motion.div>
                    )}

                    {activeTab === 'ducking' && (
                      <motion.div
                        key="ducking"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                      >
                        <AudioDuckingPanel
                          speechUrl={storageAudioUrl || audioUrl}
                          musicUrl={musicUrl}
                          transcript={transcript}
                          speechLabel={audioFile?.name || 'Voiceover'}
                          musicLabel="AI / Beat-Sync Track"
                          onMixExported={() => {
                            setLibraryRefreshKey(k => k + 1);
                            setActiveTab('library');
                          }}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Right: AI Sidebar (only when not in enhance/compare/library/voices/music/ducking/auto-match tab) */}
                {activeTab !== 'enhance' && activeTab !== 'compare' && activeTab !== 'library' && activeTab !== 'voices' && activeTab !== 'audiobook' && activeTab !== 'music' && activeTab !== 'ducking' && activeTab !== 'auto-match' && activeTab !== 'final-mix' && activeTab !== 'stems' && (
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="hidden lg:block"
                  >
                    <AIEnhancementSidebar
                      audioUrl={storageAudioUrl || audioUrl}
                      onEnhanced={handleEnhanced}
                    />
                  </motion.div>
                )}
              </div>

              {/* Hidden Media Element for Playback */}
              {audioFile?.type.startsWith('video/') ? (
                <video
                  ref={mediaRef as React.RefObject<HTMLVideoElement>}
                  src={audioUrl}
                  onLoadedMetadata={handleLoadedMetadata}
                  onTimeUpdate={handleTimeUpdate}
                  onEnded={() => setIsPlaying(false)}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  className="hidden"
                  preload="metadata"
                />
              ) : (
                <audio
                  ref={mediaRef as React.RefObject<HTMLAudioElement>}
                  src={audioUrl}
                  onLoadedMetadata={handleLoadedMetadata}
                  onTimeUpdate={handleTimeUpdate}
                  onEnded={() => setIsPlaying(false)}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  className="hidden"
                  preload="metadata"
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <VoiceStudioDialog open={showVoiceStudio} onOpenChange={setShowVoiceStudio} />
    </div>
  );
}
