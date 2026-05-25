// Shared AdTool AI brand theme for auth emails.
// Body background is white per Lovable email guidelines.
export const brand = {
  name: 'AdTool AI',
  gold: '#F5C76A',
  ink: '#0A0A0A',
  body: '#3F3F46',
  muted: '#71717A',
  border: '#E5E7EB',
  bg: '#ffffff',
}

export const styles = {
  main: {
    backgroundColor: brand.bg,
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Roboto, Helvetica, Arial, sans-serif",
    color: brand.body,
    margin: 0,
    padding: '32px 0',
  },
  container: {
    maxWidth: '560px',
    margin: '0 auto',
    padding: '32px',
    backgroundColor: brand.bg,
    border: `1px solid ${brand.border}`,
    borderRadius: '12px',
  },
  brandRow: {
    display: 'block',
    marginBottom: '24px',
    paddingBottom: '20px',
    borderBottom: `1px solid ${brand.border}`,
  },
  brandText: {
    fontSize: '20px',
    fontWeight: 700 as const,
    color: brand.ink,
    letterSpacing: '-0.01em',
    margin: 0,
  },
  brandAccent: { color: brand.gold },
  h1: {
    fontSize: '24px',
    fontWeight: 700 as const,
    color: brand.ink,
    margin: '0 0 16px',
    letterSpacing: '-0.01em',
  },
  text: {
    fontSize: '15px',
    color: brand.body,
    lineHeight: '1.6',
    margin: '0 0 20px',
  },
  link: { color: brand.ink, textDecoration: 'underline' },
  button: {
    backgroundColor: brand.ink,
    color: brand.gold,
    fontSize: '15px',
    fontWeight: 600 as const,
    borderRadius: '10px',
    padding: '14px 24px',
    textDecoration: 'none',
    display: 'inline-block',
  },
  code: {
    fontFamily: "'SFMono-Regular', Menlo, Monaco, Consolas, monospace",
    fontSize: '28px',
    fontWeight: 700 as const,
    letterSpacing: '0.3em',
    color: brand.ink,
    backgroundColor: '#FAFAF7',
    border: `1px solid ${brand.border}`,
    borderRadius: '10px',
    padding: '16px 20px',
    display: 'inline-block',
    margin: '8px 0 24px',
  },
  footer: {
    fontSize: '12px',
    color: brand.muted,
    margin: '32px 0 0',
    paddingTop: '20px',
    borderTop: `1px solid ${brand.border}`,
    lineHeight: '1.5',
  },
}
