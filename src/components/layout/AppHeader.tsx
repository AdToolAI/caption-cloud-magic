import { motion } from "framer-motion";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Brand } from "./Brand";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { NotificationBell } from "@/components/NotificationBell";
import { UserMenu } from "./UserMenu";
import { CommandBar } from "@/components/ui/CommandBar";
import { useSidebar } from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/useAuth";

export function AppHeader() {
  const { toggleSidebar } = useSidebar();
  const { user } = useAuth();

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/60"
      role="banner"
    >
      <div className="container max-w-full h-14 px-4 flex items-center justify-between gap-4">
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
          {user && <NotificationBell />}
          <ThemeToggle />
          <UserMenu />
        </div>
      </div>
    </motion.header>
  );
}
