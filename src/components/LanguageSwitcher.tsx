import { Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTranslation } from "@/hooks/useTranslation";
import { Language } from "@/lib/translations";

const languages = [
  { code: 'en' as Language, label: 'English', flag: '🇬🇧' },
  { code: 'de' as Language, label: 'Deutsch', flag: '🇩🇪' },
  { code: 'es' as Language, label: 'Español', flag: '🇪🇸' },
];

export const LanguageSwitcher = () => {
  const { language, setLanguage } = useTranslation();
  const currentLang = languages.find(l => l.code === language);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="ghost" 
          size="sm" 
          className="gap-2"
          aria-label={`Change language. Current: ${currentLang?.label}`}
        >
          <Globe className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">{currentLang?.flag} {currentLang?.code.toUpperCase()}</span>
          <span className="sm:hidden">{currentLang?.flag}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent 
        align="end" 
        className="bg-popover z-50"
        role="menu"
        aria-label="Language selection menu"
      >
        {languages.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => setLanguage(lang.code)}
            className={language === lang.code ? "bg-secondary" : ""}
            role="menuitemradio"
            aria-checked={language === lang.code}
            aria-label={`Switch to ${lang.label}`}
          >
            <span className="mr-2" aria-hidden="true">{lang.flag}</span>
            {lang.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
