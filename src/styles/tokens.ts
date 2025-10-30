/**
 * Design Token System - AdTool AI Production-Ready
 * Following Google/X/Meta-Niveau Design Standards
 */

export const designTokens = {
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
    xl: '32px',
    '2xl': '48px',
    '3xl': '64px',
    '4xl': '80px',
    '5xl': '96px'
  },
  
  radius: {
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '20px',
    '2xl': '24px'
  },
  
  shadows: {
    'soft-1': '0 2px 8px rgba(0, 0, 0, 0.04)',
    'soft-2': '0 4px 16px rgba(0, 0, 0, 0.08)',
    'soft-3': '0 8px 24px rgba(0, 0, 0, 0.12)',
    'elevation-1': '0 1px 3px rgba(0, 0, 0, 0.05)',
    'elevation-2': '0 4px 12px rgba(0, 0, 0, 0.08)',
    'elevation-3': '0 12px 28px rgba(0, 0, 0, 0.12)',
    'focus': '0 0 0 2px hsl(var(--primary) / 0.3)'
  },
  
  transitions: {
    fast: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
    normal: '200ms cubic-bezier(0.4, 0, 0.2, 1)',
    slow: '300ms cubic-bezier(0.4, 0, 0.2, 1)'
  },
  
  typography: {
    h1: {
      size: '48px',
      weight: '700',
      lineHeight: '1.2',
      letterSpacing: '-0.02em'
    },
    h2: {
      size: '36px',
      weight: '700',
      lineHeight: '1.3',
      letterSpacing: '-0.01em'
    },
    h3: {
      size: '28px',
      weight: '600',
      lineHeight: '1.4',
      letterSpacing: '0'
    },
    h4: {
      size: '24px',
      weight: '600',
      lineHeight: '1.4',
      letterSpacing: '0'
    },
    h5: {
      size: '20px',
      weight: '600',
      lineHeight: '1.5',
      letterSpacing: '0'
    },
    h6: {
      size: '18px',
      weight: '600',
      lineHeight: '1.5',
      letterSpacing: '0'
    },
    body: {
      size: '16px',
      weight: '400',
      lineHeight: '1.6',
      letterSpacing: '0'
    },
    bodyLarge: {
      size: '18px',
      weight: '400',
      lineHeight: '1.6',
      letterSpacing: '0'
    },
    bodySmall: {
      size: '14px',
      weight: '400',
      lineHeight: '1.5',
      letterSpacing: '0'
    },
    caption: {
      size: '14px',
      weight: '400',
      lineHeight: '1.5',
      letterSpacing: '0.01em'
    },
    overline: {
      size: '12px',
      weight: '600',
      lineHeight: '1.5',
      letterSpacing: '0.08em',
      textTransform: 'uppercase' as const
    }
  },
  
  container: {
    sm: '640px',
    md: '768px',
    lg: '1024px',
    xl: '1280px',
    '2xl': '1400px'
  },
  
  breakpoints: {
    sm: '640px',
    md: '768px',
    lg: '1024px',
    xl: '1280px',
    '2xl': '1536px'
  }
} as const;

export type DesignTokens = typeof designTokens;
