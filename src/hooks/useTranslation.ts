import * as React from 'react';
import { Language, translations, detectBrowserLanguage } from '@/lib/translations';
import { translationsFill } from '@/lib/translationsFill';

const { useState, useEffect, createContext, useContext } = React;

interface TranslationContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, params?: Record<string, string | number>) => any;
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
    const saved = localStorage.getItem('adtool-ai-lang');
    if (saved && (saved === 'en' || saved === 'de' || saved === 'es')) {
      return saved as Language;
    }
    // Default to German
    const defaultLang = 'de';
    localStorage.setItem('adtool-ai-lang', defaultLang);
    return defaultLang;
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('adtool-ai-lang', lang);
  };

  const t = (key: string, params?: Record<string, string | number>): any => {
    const keys = key.split('.') as any;
    const lookup = (dict: any) => {
      let v: any = dict;
      for (const k of keys) v = v?.[k];
      return v;
    };

    // Preferred language -> generated fill -> English -> German -> key
    let value: any = lookup(translations[language]);
    if (value === undefined || value === null) {
      value = lookup((translationsFill as any)[language]);
    }
    if (value === undefined || value === null) {
      value = lookup(translations.en);
    }
    if (value === undefined || value === null) {
      value = lookup(translations.de);
    }

    // Return key if nothing was found at all
    if (value === undefined || value === null) {
      return key;
    }


    // Return objects directly (for featureGuides, etc.)
    if (typeof value === 'object') {
      return value;
    }

    // Handle string parameter replacement
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
