import { NavLink, NavLinkProps } from "react-router-dom";
import { trackEvent } from "@/lib/analytics";

interface AppNavLinkProps extends Omit<NavLinkProps, 'className'> {
  trackLabel?: string;
  trackLocation?: string;
  className?: string;
}

export default function AppNavLink({ 
  trackLabel, 
  trackLocation = "header",
  onClick,
  className = "",
  ...props 
}: AppNavLinkProps) {
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (trackLabel && props.to) {
      trackEvent("nav_click", {
        label: trackLabel,
        path: typeof props.to === 'string' ? props.to : props.to.pathname,
        location: trackLocation
      });
    }
    onClick?.(e);
  };

  return (
    <NavLink
      {...props}
      onClick={handleClick}
      className={({ isActive }) =>
        `px-3 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-ring ${
          isActive 
            ? "bg-muted text-foreground font-semibold" 
            : "text-muted-foreground"
        } ${className}`
      }
    />
  );
}
