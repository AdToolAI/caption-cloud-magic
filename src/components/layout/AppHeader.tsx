import { motion } from "framer-motion";
import { Menu, MessageSquare } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Brand } from "./Brand";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

import { UserMenu } from "./UserMenu";
import { CommandBar } from "@/components/ui/CommandBar";
import { useSidebar } from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/useAuth";
import { NotificationBell } from "@/components/NotificationBell";
import { SocialConnectionIcons } from "@/components/dashboard/SocialConnectionIcons";

export function AppHeader() {
  const { toggleSidebar } = useSidebar();
  const { user } = useAuth();

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="sticky top-0 z-50 border-b bg-background/70 dark:bg-background/30 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60 before:absolute before:inset-0 before:bg-gradient-to-r before:from-primary/5 before:via-transparent before:to-accent/5 before:pointer-events-none"
      role="banner"
    >
      <div className="relative container max-w-full h-14 px-4 flex items-center justify-between gap-4">
        {/* Left: Mobile Menu + Brand */}
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            className="lg:hidden rounded-xl"
            aria-label="Toggle sidebar"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="hidden lg:block">
            <Brand compact />
          </div>
          <div className="lg:hidden">
            <Brand compact showText={false} />
          </div>
        </div>

        {/* Center: Command Bar */}
        <div className="hidden md:flex flex-1 max-w-md mx-4">
          <CommandBar inline />
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {user && (
            <Button asChild variant="ghost" size="icon" className="rounded-xl" aria-label="Community">
              <Link to="/community">
                <MessageSquare className="h-5 w-5" />
              </Link>
            </Button>
          )}
          {user && <NotificationBell />}
          {user && (
            <div className="hidden md:flex">
              <SocialConnectionIcons />
            </div>
          )}
          <UserMenu />
        </div>
      </div>
    </motion.header>
  );
}
