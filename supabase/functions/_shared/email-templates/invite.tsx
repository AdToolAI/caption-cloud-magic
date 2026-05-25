/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Link, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import { brand, styles } from './_theme.ts'

interface Props {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

export const InviteEmail = ({ siteUrl, confirmationUrl }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>You've been invited to {brand.name}</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Section style={styles.brandRow}>
          <Text style={styles.brandText}>AdTool<span style={styles.brandAccent}> AI</span></Text>
        </Section>
        <Heading style={styles.h1}>You've been invited</Heading>
        <Text style={styles.text}>
          You've been invited to join <Link href={siteUrl} style={styles.link}><strong>{brand.name}</strong></Link>. Accept the invitation to get started.
        </Text>
        <Button style={styles.button} href={confirmationUrl}>Accept invitation</Button>
        <Text style={styles.footer}>
          If you weren't expecting this invitation, you can ignore this email.<br />
          — The {brand.name} Team · <Link href="https://useadtool.ai" style={{ color: brand.muted }}>useadtool.ai</Link>
        </Text>
      </Container>
    </Body>
  </Html>
)

export default InviteEmail
