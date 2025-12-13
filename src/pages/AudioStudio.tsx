import { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Headphones, Upload, Wand2, Mic, Music, Volume2, Sparkles, FileAudio, Play, Pause } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AudioStudioHeroHeader } from '@/components/audio-studio/AudioStudioHeroHeader';
import { TranscriptWaveformEditor } from '@/components/audio-studio/TranscriptWaveformEditor';
import { AIEnhancementSidebar } from '@/components/audio-studio/AIEnhancementSidebar';
import { StudioSoundButton } from '@/components/audio-studio/StudioSoundButton';
import { BeatSyncTimeline } from '@/components/audio-studio/BeatSyncTimeline';
import { FillerWordPanel } from '@/components/audio-studio/FillerWordPanel';
import { AudioBeforeAfterComparison } from '@/components/audio-studio/AudioBeforeAfterComparison';
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
  const [activeTab, setActiveTab] = useState<'enhance' | 'transcript' | 'beat-sync' | 'filler' | 'compare'>('enhance');
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement>(null);

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
        toast.success('Audio erfolgreich geladen');
      } catch (error) {
        console.error('Upload error:', error);
        toast.error('Upload fehlgeschlagen');
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
          {!audioUrl ? (
            <motion.div
              key="upload"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="mt-8"
            >
              {/* Upload Zone */}
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
                    {isDragActive ? 'Datei hier ablegen' : 'Audio oder Video hochladen'}
                  </h3>
                  <p className="text-muted-foreground mb-6">
                    MP3, WAV, M4A, MP4, MOV • Max. 500MB
                  </p>

                  <Button 
                    size="lg"
                    className="relative overflow-hidden bg-gradient-to-r from-primary to-cyan-500 hover:from-primary/90 hover:to-cyan-500/90"
                  >
                    <FileAudio className="w-5 h-5 mr-2" />
                    Datei auswählen
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full animate-shimmer" />
                  </Button>
                </div>

                {/* Feature preview cards */}
                <div className="px-8 pb-8 grid grid-cols-1 md:grid-cols-4 gap-4">
                  {[
                    { icon: Wand2, label: 'Studio Sound', desc: 'Ein-Klick Optimierung' },
                    { icon: Mic, label: 'Transcript Editing', desc: 'Audio wie Text bearbeiten' },
                    { icon: Music, label: 'Beat-Sync', desc: 'Automatische Schnitte auf Beats' },
                    { icon: Volume2, label: 'Filler Removal', desc: '"Ähms" automatisch entfernen' }
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
                          audioUrl={storageAudioUrl || audioUrl} 
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
                          Neue Datei
                        </Button>
                      </div>
                    </div>
                  </Card>

                  {/* Tab Navigation */}
                  <div className="flex gap-2">
                    {[
                      { id: 'enhance', label: 'KI-Optimierung', icon: Wand2 },
                      { id: 'compare', label: 'Vergleich', icon: Volume2, disabled: !enhancedAudioUrl },
                      { id: 'transcript', label: 'Transcript', icon: Mic },
                      { id: 'beat-sync', label: 'Beat-Sync', icon: Music },
                      { id: 'filler', label: 'Filler-Wörter', icon: Volume2 }
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
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Right: AI Sidebar (only when not in enhance tab) */}
                {activeTab !== 'enhance' && activeTab !== 'compare' && (
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
    </div>
  );
}
