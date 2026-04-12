import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { MessageSquare, Hash, Calendar, Handshake } from "lucide-react";
import { MessagesTab } from "@/components/community/MessagesTab";
import { CommunityTab } from "@/components/community/CommunityTab";
import { MentoringTab } from "@/components/community/MentoringTab";
import { CollaborationsTab } from "@/components/community/CollaborationsTab";
import { motion } from "framer-motion";
import { useMemo } from "react";
import { useTranslation } from "@/hooks/useTranslation";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0, 0, 0.2, 1] as const } },
};

function FloatingParticles() {
  const particles = useMemo(
    () =>
      Array.from({ length: 6 }, (_, i) => ({
        id: i,
        size: Math.random() * 3 + 1,
        x: Math.random() * 100,
        y: Math.random() * 100,
        duration: Math.random() * 4 + 6,
        delay: Math.random() * 3,
        color: i % 2 === 0 ? "hsla(43, 90%, 68%, 0.3)" : "hsla(187, 84%, 55%, 0.2)",
      })),
    []
  );

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full"
          style={{
            width: p.size,
            height: p.size,
            left: `${p.x}%`,
            top: `${p.y}%`,
            background: p.color,
          }}
          animate={{ y: [0, -30, 0], opacity: [0.2, 0.6, 0.2] }}
          transition={{ duration: p.duration, delay: p.delay, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

export default function Community() {
  const { t } = useTranslation();

  return (
    <motion.div
      className="container py-6 relative"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <FloatingParticles />

      {/* Hero Header */}
      <motion.div variants={itemVariants} className="flex items-center gap-4 mb-8 relative z-10">
        <div className="relative">
          <div className="absolute -inset-2 rounded-2xl bg-gradient-to-br from-[hsla(43,90%,68%,0.3)] to-[hsla(187,84%,55%,0.2)] blur-xl animate-pulse" />
          <div className="relative h-14 w-14 rounded-2xl bg-card/80 backdrop-blur-xl border border-white/10 flex items-center justify-center shadow-[0_0_30px_hsla(43,90%,68%,0.15)]">
            <MessageSquare className="h-7 w-7 text-[hsl(43,90%,68%)]" />
          </div>
        </div>
        <div>
          <h1
            className="text-3xl font-bold tracking-tight"
            style={{
              background: "linear-gradient(135deg, hsl(43 90% 68%), hsl(187 84% 55%))",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            {t('community.heroTitle')}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t('community.heroSubtitle')}
          </p>
        </div>
      </motion.div>

      {/* Animated divider */}
      <motion.div
        variants={itemVariants}
        className="h-px mb-6 relative z-10"
        style={{
          background: "linear-gradient(90deg, transparent, hsl(43 90% 68% / 0.4), hsl(187 84% 55% / 0.3), transparent)",
        }}
      />

      <motion.div variants={itemVariants} className="relative z-10">
        <Tabs defaultValue="messages" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4 backdrop-blur-xl bg-card/60 border border-white/10 rounded-xl p-1">
            <TabsTrigger value="messages" className="gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-[hsla(43,90%,68%,0.15)] data-[state=active]:to-[hsla(187,84%,55%,0.1)] data-[state=active]:border-[hsla(43,90%,68%,0.3)] data-[state=active]:shadow-[0_0_15px_hsla(43,90%,68%,0.1)] rounded-lg transition-all duration-300">
              <MessageSquare className="h-4 w-4" />
              <span className="hidden sm:inline">{t('community.tabMessages')}</span>
            </TabsTrigger>
            <TabsTrigger value="community" className="gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-[hsla(43,90%,68%,0.15)] data-[state=active]:to-[hsla(187,84%,55%,0.1)] data-[state=active]:border-[hsla(43,90%,68%,0.3)] data-[state=active]:shadow-[0_0_15px_hsla(43,90%,68%,0.1)] rounded-lg transition-all duration-300">
              <Hash className="h-4 w-4" />
              <span className="hidden sm:inline">{t('community.tabCommunity')}</span>
            </TabsTrigger>
            <TabsTrigger value="mentoring" className="gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-[hsla(43,90%,68%,0.15)] data-[state=active]:to-[hsla(187,84%,55%,0.1)] data-[state=active]:border-[hsla(43,90%,68%,0.3)] data-[state=active]:shadow-[0_0_15px_hsla(43,90%,68%,0.1)] rounded-lg transition-all duration-300">
              <Calendar className="h-4 w-4" />
              <span className="hidden sm:inline">{t('community.tabMentoring')}</span>
            </TabsTrigger>
            <TabsTrigger value="collaborations" className="gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-[hsla(43,90%,68%,0.15)] data-[state=active]:to-[hsla(187,84%,55%,0.1)] data-[state=active]:border-[hsla(43,90%,68%,0.3)] data-[state=active]:shadow-[0_0_15px_hsla(43,90%,68%,0.1)] rounded-lg transition-all duration-300">
              <Handshake className="h-4 w-4" />
              <span className="hidden sm:inline">{t('community.tabCollaborations')}</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="messages">
            <MessagesTab />
          </TabsContent>
          <TabsContent value="community">
            <CommunityTab />
          </TabsContent>
          <TabsContent value="mentoring">
            <MentoringTab />
          </TabsContent>
          <TabsContent value="collaborations">
            <CollaborationsTab />
          </TabsContent>
        </Tabs>
      </motion.div>
    </motion.div>
  );
}