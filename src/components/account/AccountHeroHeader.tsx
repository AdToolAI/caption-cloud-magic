import { motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { getProductInfo } from "@/config/pricing";
import { Settings, Shield, CheckCircle2, Crown } from "lucide-react";

export const AccountHeroHeader = () => {
  const { user, subscribed, productId } = useAuth();
  const planInfo = getProductInfo(productId);
  const isPro = subscribed && productId === 'prod_TDoYdYP1nOOWsN';

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-card/80 via-card/60 to-muted/40 backdrop-blur-xl p-8 mb-8">
      {/* Background Glow Orbs */}
      <motion.div
        className="absolute -top-20 -right-20 w-64 h-64 bg-primary/10 rounded-full blur-3xl"
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.3, 0.5, 0.3],
        }}
        transition={{ duration: 6, repeat: Infinity }}
      />
      <motion.div
        className="absolute -bottom-20 -left-20 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl"
        animate={{
          scale: [1.2, 1, 1.2],
          opacity: [0.3, 0.5, 0.3],
        }}
        transition={{ duration: 6, repeat: Infinity, delay: 2 }}
      />

      <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex items-center gap-6">
          {/* Avatar with Glow Ring */}
          <motion.div
            className="relative"
            whileHover={{ scale: 1.05 }}
            transition={{ type: "spring", stiffness: 300 }}
          >
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 to-cyan-500/20 flex items-center justify-center border border-white/10 text-3xl font-bold text-primary">
              {user?.email?.charAt(0).toUpperCase() || "U"}
            </div>
            <motion.div
              className="absolute inset-0 rounded-2xl"
              animate={{
                boxShadow: [
                  "0 0 0px hsla(43, 90%, 68%, 0)",
                  "0 0 20px hsla(43, 90%, 68%, 0.3)",
                  "0 0 0px hsla(43, 90%, 68%, 0)",
                ],
              }}
              transition={{ duration: 2, repeat: Infinity }}
            />
          </motion.div>

          <div className="space-y-2">
            {/* Mission Badge */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs font-medium text-primary"
            >
              <motion.div
                className="w-1.5 h-1.5 rounded-full bg-primary"
                animate={{ scale: [1, 1.2, 1], opacity: [1, 0.7, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
              Account Center
            </motion.div>

            {/* Headline */}
            <motion.h1
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-foreground via-foreground to-foreground/70 bg-clip-text"
            >
              Konto-Einstellungen
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-muted-foreground"
            >
              {user?.email}
            </motion.p>
          </div>
        </div>

        {/* Stats Badges */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
          className="flex flex-wrap gap-3"
        >
          {/* Plan Badge */}
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-muted/30 border border-white/10">
            {isPro ? (
              <Crown className="h-4 w-4 text-primary" />
            ) : (
              <Settings className="h-4 w-4 text-muted-foreground" />
            )}
            <span className="text-sm font-medium">{planInfo.name}</span>
          </div>

          {/* Security Badge */}
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-muted/30 border border-white/10">
            <Shield className="h-4 w-4 text-cyan-400" />
            <span className="text-sm font-medium">Geschützt</span>
          </div>

          {/* Verified Badge */}
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-500/10 border border-green-500/20">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <span className="text-sm font-medium text-green-500">Verifiziert</span>
          </div>
        </motion.div>
      </div>
    </div>
  );
};
