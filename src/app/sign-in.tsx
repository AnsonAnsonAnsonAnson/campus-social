import { router, Stack } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Field, Icon } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { isCuhkEmail } from '@/lib/backend';
import { PRIVACY_URL, TERMS_URL } from '@/lib/constants';
import { DEMO_CODE } from '@/lib/demo';
import { showAlert } from '@/lib/dialog';
import { needsOnboarding } from '@/lib/onboarding';
import { space, textStyle, useColors } from '@/lib/theme';
import { t, useLang } from '@/lib/i18n';

const CODE_LENGTH = 6;
const RESEND_AFTER = 45;

/** Leave the sign-in sheet: first-timers go to the welcome screen, everyone else back to where they were. */
async function done() {
  if (await needsOnboarding().catch(() => false)) router.replace('/welcome');
  else if (router.canGoBack()) router.back();
  else router.replace('/discover');
}

const close = () => (router.canGoBack() ? router.back() : router.replace('/discover'));

export default function SignIn() {
  const c = useColors();
  const lang = useLang();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code' | 'password'>('email');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const sendCode = async () => {
    if (!isCuhkEmail(email)) {
      showAlert(t('Use your CUHK email'), t('Sign in with your @link.cuhk.edu.hk (students) or @cuhk.edu.hk (staff) address.'));
      return;
    }
    setBusy(true);
    try {
      await api.sendCode(email);
      setCode('');
      setStep('code');
      setResendIn(RESEND_AFTER);
    } catch (e) {
      showAlert(t('Could not send code'), errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const verify = async (value = code) => {
    setBusy(true);
    try {
      await api.verifyCode(email, value);
      await done();
    } catch (e) {
      showAlert(t('Could not sign in'), errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const passwordSignIn = async () => {
    setBusy(true);
    try {
      await api.signInWithPassword(email, password);
      await done();
    } catch (e) {
      showAlert(t('Could not sign in'), errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const missing = CODE_LENGTH - code.length;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.backgroundPlain }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.top, { paddingTop: Math.max(insets.top, space.md) }]}>
        <Pressable
          onPress={step === 'email' ? close : () => setStep('email')}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={step === 'email' ? t('Close') : t('Back')}
          style={styles.topButton}>
          <Icon name={step === 'email' ? 'close' : 'chevron-back'} size={22} color={c.text} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={{ gap: 22 }}>
          <View style={{ gap: space.sm }}>
            <Text style={[textStyle('title1', lang), { color: c.text, letterSpacing: -0.3 }]} accessibilityRole="header">
              {step === 'code' ? t('Enter the code') : t('Sign in with your CUHK email')}
            </Text>
            <Text style={{ color: c.textSecondary, fontSize: 16, lineHeight: 24 }}>
              {step === 'code' ? (
                <>
                  {t('We sent a 6-digit code to {email}.', { email: email.trim() })}{' '}
                  <Text style={{ color: c.tintText, fontWeight: '600' }} onPress={() => setStep('email')} accessibilityRole="link">
                    {t('Change')}
                  </Text>
                </>
              ) : (
                t('Sign in to sign up for events and follow societies. We’ll email you a 6-digit code, no password to remember.')
              )}
            </Text>
          </View>

          {step === 'email' ? (
            <>
              <Field
                label={t('CUHK email')}
                placeholder="1155xxxxxx@link.cuhk.edu.hk"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
                autoComplete="email"
                returnKeyType="send"
                onSubmitEditing={sendCode}
                autoFocus
              />
              <Button
                title={t('Send code')}
                loading={busy}
                disabled={!email.includes('@')}
                hint={t('Enter your @link.cuhk.edu.hk or @cuhk.edu.hk email')}
                onPress={sendCode}
              />
            </>
          ) : step === 'password' ? (
            // Only for accounts an admin created with a password, e.g. the App Store review account.
            <>
              <Field
                label={t('Email')}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="username"
              />
              <Field label={t('Password')} value={password} onChangeText={setPassword} secureTextEntry textContentType="password" />
              <Button title={t('Sign in')} loading={busy} disabled={!email.includes('@') || !password} onPress={passwordSignIn} />
            </>
          ) : (
            <>
              <CodeBoxes
                value={code}
                onChange={(v) => {
                  setCode(v);
                  if (v.length === CODE_LENGTH && !busy) verify(v);
                }}
              />
              <View style={styles.codeMeta}>
                <Text style={{ color: c.textSecondary, fontSize: 14, flexShrink: 1 }}>
                  {api.isDemo ? t('Demo mode: use {code}', { code: DEMO_CODE }) : t('No email? Check your junk folder')}
                </Text>
                {resendIn > 0 ? (
                  <Text style={{ color: c.textTertiary, fontSize: 14, fontVariant: ['tabular-nums'] }}>
                    {t('Resend in {n}s', { n: resendIn })}
                  </Text>
                ) : (
                  <Text style={{ color: c.tintText, fontSize: 14, fontWeight: '600' }} onPress={sendCode} accessibilityRole="button">
                    {t('Resend code')}
                  </Text>
                )}
              </View>
              <Button
                title={t('Sign in')}
                loading={busy}
                disabled={code.length < CODE_LENGTH}
                hint={missing === 1 ? t('1 more digit') : t('{n} more digits', { n: missing })}
                onPress={() => verify()}
              />
            </>
          )}
        </View>
      </ScrollView>

      {/* App Review (1.2) wants the terms, which ban abusive content, one tap away from sign-up. */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, space.lg) }]}>
        <Pressable
          onPress={() => setStep(step === 'password' ? 'email' : 'password')}
          accessibilityRole="button"
          style={{ minHeight: 44, justifyContent: 'center' }}>
          <Text style={{ color: c.textSecondary, fontSize: 15, fontWeight: '600' }}>
            {step === 'password' ? t('Use an email code instead') : t('Sign in with a password instead')}
          </Text>
        </Pressable>
        <Text style={[styles.legal, { color: c.textTertiary }]}>
          {t('By continuing you agree to the')}{' '}
          <Text style={styles.legalLink} onPress={() => WebBrowser.openBrowserAsync(TERMS_URL)} accessibilityRole="link">
            {t('Terms of use')}
          </Text>{' '}
          {t('and')}{' '}
          <Text style={styles.legalLink} onPress={() => WebBrowser.openBrowserAsync(PRIVACY_URL)} accessibilityRole="link">
            {t('Privacy policy')}
          </Text>
          {t('.')}
          {'\n'}
          {t('We only use your email to sign you in and send event notices.')}
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

/** Six boxes over one hidden field, so paste and iOS code autofill still work. */
function CodeBoxes({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const c = useColors();
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const [focused, setFocused] = useState(true);
  return (
    <Pressable onPress={() => input.current?.focus()} accessibilityLabel={t('6-digit code')} style={styles.boxes}>
      {Array.from({ length: CODE_LENGTH }, (_, i) => {
        const current = focused && i === Math.min(value.length, CODE_LENGTH - 1);
        const filled = i < value.length;
        return (
          <View
            key={i}
            style={[
              styles.box,
              {
                backgroundColor: c.card,
                borderColor: current ? c.tint : filled ? c.textTertiary : c.border,
                borderWidth: current ? 2 : 1,
                boxShadow: current ? `0 0 0 3px ${c.focusRing}` : undefined,
              },
            ]}>
            {filled ? (
              <Text style={[styles.digit, { color: c.text }]}>{value[i]}</Text>
            ) : (
              current && <View style={[styles.caret, { backgroundColor: c.tint }]} />
            )}
          </View>
        );
      })}
      <TextInput
        ref={input}
        value={value}
        onChangeText={(v) => onChange(v.replace(/\D/g, '').slice(0, CODE_LENGTH))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        autoFocus
        maxLength={CODE_LENGTH}
        accessibilityLabel={t('6-digit code')}
        style={styles.hiddenInput}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 },
  topButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: space.lg, paddingTop: 22, paddingBottom: space.xl },
  codeMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.sm },
  boxes: { flexDirection: 'row', gap: space.sm },
  box: { flex: 1, height: 58, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  digit: { fontSize: 26, fontWeight: '600', fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }) },
  caret: { width: 2, height: 26, borderRadius: 1 },
  hiddenInput: { position: 'absolute', width: 1, height: 1, opacity: 0 },
  footer: { alignItems: 'center', gap: 10, paddingHorizontal: space.lg },
  legal: { fontSize: 12, lineHeight: 18, textAlign: 'center' },
  legalLink: { textDecorationLine: 'underline' },
});
