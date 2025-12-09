import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Text,
  Button,
  Section,
  Hr,
} from 'npm:@react-email/components@0.0.22'
import * as React from 'npm:react@18.3.1'

interface PasswordResetEmailProps {
  resetUrl: string
  userEmail: string
}

export const PasswordResetEmail = ({
  resetUrl,
  userEmail,
}: PasswordResetEmailProps) => (
  <Html>
    <Head />
    <Preview>Setze dein AdTool-Passwort zurück</Preview>
    <Body style={main}>
      <Container style={container}>
        {/* Header with Logo */}
        <Section style={header}>
          <div style={logoContainer}>
            <Text style={logoText}>AdTool</Text>
          </div>
        </Section>

        {/* Main Content */}
        <Section style={content}>
          <Heading style={h1}>Passwort zurücksetzen 🔐</Heading>
          
          <Text style={text}>
            Hallo,
          </Text>
          
          <Text style={text}>
            Du hast angefordert, dein Passwort für dein AdTool-Konto zurückzusetzen. Klicke auf den Button unten, um ein neues Passwort zu erstellen.
          </Text>

          <Section style={buttonContainer}>
            <Button style={button} href={resetUrl}>
              Passwort zurücksetzen
            </Button>
          </Section>

          <Text style={textMuted}>
            Oder kopiere diesen Link in deinen Browser:
          </Text>
          <Text style={linkText}>
            {resetUrl}
          </Text>

          <Section style={warningBox}>
            <Text style={warningText}>
              ⚠️ Dieser Link ist nur 1 Stunde gültig. Falls du keine Passwort-Zurücksetzung angefordert hast, ignoriere diese E-Mail.
            </Text>
          </Section>

          <Hr style={hr} />

          <Text style={textSmall}>
            Diese E-Mail wurde an <strong>{userEmail}</strong> gesendet. Dein Passwort wird nicht geändert, bis du auf den Link klickst und ein neues Passwort erstellst.
          </Text>
        </Section>

        {/* Footer */}
        <Section style={footer}>
          <Text style={footerText}>
            © 2024 AdTool. Alle Rechte vorbehalten.
          </Text>
          <Text style={footerText}>
            <Link href="https://useadtool.ai" style={footerLink}>Website</Link>
            {' • '}
            <Link href="https://useadtool.ai/support" style={footerLink}>Support</Link>
            {' • '}
            <Link href="https://useadtool.ai/privacy" style={footerLink}>Datenschutz</Link>
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export default PasswordResetEmail

// Styles
const main = {
  backgroundColor: '#0a0a0f',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
}

const container = {
  margin: '0 auto',
  padding: '40px 20px',
  maxWidth: '560px',
}

const header = {
  textAlign: 'center' as const,
  marginBottom: '32px',
}

const logoContainer = {
  display: 'inline-block',
  padding: '12px 24px',
  background: 'linear-gradient(135deg, #F5C76A 0%, #d4a853 100%)',
  borderRadius: '12px',
}

const logoText = {
  fontSize: '24px',
  fontWeight: 'bold' as const,
  color: '#0a0a0f',
  margin: '0',
}

const content = {
  backgroundColor: '#1a1a2e',
  borderRadius: '16px',
  padding: '40px 32px',
  border: '1px solid rgba(255, 255, 255, 0.1)',
}

const h1 = {
  color: '#F5C76A',
  fontSize: '28px',
  fontWeight: 'bold' as const,
  textAlign: 'center' as const,
  margin: '0 0 24px 0',
}

const text = {
  color: '#e0e0e0',
  fontSize: '16px',
  lineHeight: '1.6',
  margin: '0 0 16px 0',
}

const textMuted = {
  color: '#888888',
  fontSize: '14px',
  lineHeight: '1.5',
  margin: '24px 0 8px 0',
  textAlign: 'center' as const,
}

const textSmall = {
  color: '#666666',
  fontSize: '13px',
  lineHeight: '1.5',
  margin: '16px 0 0 0',
}

const linkText = {
  color: '#22d3ee',
  fontSize: '12px',
  wordBreak: 'break-all' as const,
  textAlign: 'center' as const,
  margin: '0 0 16px 0',
}

const buttonContainer = {
  textAlign: 'center' as const,
  margin: '32px 0',
}

const button = {
  backgroundColor: '#F5C76A',
  borderRadius: '8px',
  color: '#0a0a0f',
  fontSize: '16px',
  fontWeight: 'bold' as const,
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '14px 32px',
}

const warningBox = {
  backgroundColor: 'rgba(107, 15, 26, 0.2)',
  borderRadius: '8px',
  padding: '16px',
  border: '1px solid rgba(107, 15, 26, 0.4)',
  margin: '16px 0',
}

const warningText = {
  color: '#f87171',
  fontSize: '14px',
  margin: '0',
  textAlign: 'center' as const,
}

const hr = {
  borderColor: 'rgba(255, 255, 255, 0.1)',
  margin: '24px 0',
}

const footer = {
  textAlign: 'center' as const,
  marginTop: '32px',
}

const footerText = {
  color: '#666666',
  fontSize: '12px',
  margin: '0 0 8px 0',
}

const footerLink = {
  color: '#888888',
  textDecoration: 'underline',
}
