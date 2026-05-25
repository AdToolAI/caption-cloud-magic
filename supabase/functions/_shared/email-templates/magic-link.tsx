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

export const MagicLinkEmail = ({ confirmationUrl }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your {brand.name} login link</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Section style={styles.brandRow}>
          <Text style={styles.brandText}>AdTool<span style={styles.brandAccent}> AI</span></Text>
        </Section>
        <Heading style={styles.h1}>Sign in to {brand.name}</Heading>
        <Text style={styles.text}>Click the button below to sign in. This link will expire shortly.</Text>
        <Button style={styles.button} href={confirmationUrl}>Sign in</Button>
        <Text style={styles.footer}>
          If you didn't request this link, you can safely ignore this email.<br />
          — The {brand.name} Team · <Link href="https://useadtool.ai" style={{ color: brand.muted }}>useadtool.ai</Link>
        </Text>
      </Container>
    </Body>
  </Html>
)

export default MagicLinkEmail
