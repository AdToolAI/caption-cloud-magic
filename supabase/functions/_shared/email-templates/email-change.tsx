/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Link, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import { brand, styles } from './_theme.ts'

interface Props {
  siteName: string
  oldEmail: string
  email: string
  newEmail: string
  confirmationUrl: string
}

export const EmailChangeEmail = ({ oldEmail, newEmail, confirmationUrl }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Confirm your new email for {brand.name}</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Section style={styles.brandRow}>
          <Text style={styles.brandText}>AdTool<span style={styles.brandAccent}> AI</span></Text>
        </Section>
        <Heading style={styles.h1}>Confirm your new email</Heading>
        <Text style={styles.text}>
          You requested to change your email from <strong>{oldEmail}</strong> to <strong>{newEmail}</strong>. Confirm the change to complete the update.
        </Text>
        <Button style={styles.button} href={confirmationUrl}>Confirm email change</Button>
        <Text style={styles.footer}>
          If you didn't request this change, please contact support immediately.<br />
          — The {brand.name} Team · <Link href="https://useadtool.ai" style={{ color: brand.muted }}>useadtool.ai</Link>
        </Text>
      </Container>
    </Body>
  </Html>
)

export default EmailChangeEmail
