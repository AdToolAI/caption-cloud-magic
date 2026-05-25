/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Link, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import { brand, styles } from './_theme.ts'

interface Props {
  token: string
}

export const ReauthenticationEmail = ({ token }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your {brand.name} verification code</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Section style={styles.brandRow}>
          <Text style={styles.brandText}>AdTool<span style={styles.brandAccent}> AI</span></Text>
        </Section>
        <Heading style={styles.h1}>Confirm it's you</Heading>
        <Text style={styles.text}>Use the verification code below to confirm your identity:</Text>
        <Text style={styles.code}>{token}</Text>
        <Text style={styles.footer}>
          This code expires shortly. If you didn't request it, you can safely ignore this email.<br />
          — The {brand.name} Team · <Link href="https://useadtool.ai" style={{ color: brand.muted }}>useadtool.ai</Link>
        </Text>
      </Container>
    </Body>
  </Html>
)

export default ReauthenticationEmail
