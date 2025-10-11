import { useState, useEffect, createContext, useContext } from 'react';
import { Language, translations, detectBrowserLanguage } from '@/lib/translations';

interface TranslationContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

export const TranslationContext = createContext<TranslationContextType | undefined>(undefined);

export const useTranslation = () => {
  const context = useContext(TranslationContext);
  if (!context) {
    throw new Error('useTranslation must be used within TranslationProvider');
  }
  return context;
};

export const useTranslationState = () => {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem('caption-genie-lang');
    if (saved && (saved === 'en' || saved === 'de' || saved === 'es')) {
      return saved as Language;
    }
    const detected = detectBrowserLanguage();
    localStorage.setItem('caption-genie-lang', detected);
    return detected;
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('caption-genie-lang', lang);
  };

  const t = (key: string, params?: Record<string, string | number>): string => {
    const keys = key.split('.') as any;
    let value: any = translations[language];
    
    for (const k of keys) {
      value = value?.[k];
    }

    if (typeof value !== 'string') {
      return key;
    }

    if (params) {
      return Object.entries(params).reduce(
        (acc, [paramKey, paramValue]) => acc.replace(`{${paramKey}}`, String(paramValue)),
        value
      );
    }

    return value;
  };

  return { language, setLanguage, t };
};
