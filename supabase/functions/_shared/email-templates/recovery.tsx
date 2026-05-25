/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Link, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import { brand, styles } from './_theme.ts'

interface Props {
  siteName: string
  confirmationUrl: string
}

export const RecoveryEmail = ({ confirmationUrl }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Reset your {brand.name} password</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Section style={styles.brandRow}>
          <Text style={styles.brandText}>AdTool<span style={styles.brandAccent}> AI</span></Text>
        </Section>
        <Heading style={styles.h1}>Reset your password</Heading>
        <Text style={styles.text}>
          We received a request to reset your password. Click the button below to choose a new one.
        </Text>
        <Button style={styles.button} href={confirmationUrl}>Reset password</Button>
        <Text style={styles.footer}>
          If you didn't request a password reset, you can safely ignore this email — your password won't change.<br />
          — The {brand.name} Team · <Link href="https://useadtool.ai" style={{ color: brand.muted }}>useadtool.ai</Link>
        </Text>
      </Container>
    </Body>
  </Html>
)

export default RecoveryEmail
