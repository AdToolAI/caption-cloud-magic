/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Link, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import { brand, styles } from './_theme.ts'

interface Props {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
}

export const SignupEmail = ({ siteName, siteUrl, recipient, confirmationUrl }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Confirm your email for {brand.name}</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Section style={styles.brandRow}>
          <Text style={styles.brandText}>
            {brand.name.split(' ')[0]}<span style={styles.brandAccent}> {brand.name.split(' ').slice(1).join(' ')}</span>
          </Text>
        </Section>
        <Heading style={styles.h1}>Confirm your email</Heading>
        <Text style={styles.text}>
          Welcome to <Link href={siteUrl} style={styles.link}><strong>{brand.name}</strong></Link>. Please confirm your email address ({recipient}) to activate your account.
        </Text>
        <Button style={styles.button} href={confirmationUrl}>Verify email</Button>
        <Text style={styles.footer}>
          If you didn't create an account, you can safely ignore this email.<br />
          — The {brand.name} Team · <Link href={siteUrl} style={{ color: brand.muted }}>useadtool.ai</Link>
        </Text>
      </Container>
    </Body>
  </Html>
)

export default SignupEmail
