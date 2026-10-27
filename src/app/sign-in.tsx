import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';

import { Button, Field } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { isCuhkEmail } from '@/lib/backend';
import { PRIVACY_URL, TERMS_URL } from '@/lib/constants';
import { DEMO_CODE } from '@/lib/demo';
import { showAlert } from '@/lib/dialog';
import { needsOnboarding } from '@/lib/onboarding';
import { space, textStyle, useColors } from '@/lib/theme';
import { t, useLang } from '@/lib/i18n';

/** Leave the sign-in sheet: first-timers go to the welcome screen, everyone else back to where they were. */
async function done() {
  if (await needsOnboarding().catch(() => false)) router.replace('/welcome');
  else if (router.canGoBack()) router.back();
  else router.replace('/discover');
}

export default function SignIn() {
  const c = useColors();
  const lang = useLang();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code' | 'password'>('email');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const sendCode = async () => {
    if (!isCuhkEmail(email)) {
      showAlert(t('Use your CUHK email'), t('Sign in with your @link.cuhk.edu.hk (students) or @cuhk.edu.hk (staff) address.'));
      return;
    }
    setBusy(true);
    try {
      await api.sendCode(email);
      setStep('code');
    } catch (e) {
      showAlert(t('Could not send code'), errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    try {
      await api.verifyCode(email, code);
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

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.backgroundPlain }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.lg }} keyboardShouldPersistTaps="handled">
        <View style={{ gap: space.sm, marginTop: space.sm, marginBottom: space.sm }}>
          <Text style={[textStyle('title1', lang), { color: c.text }]} accessibilityRole="header">
            {step === 'code' ? t('Check your inbox') : t('Sign in with your CUHK email')}
          </Text>
          <Text style={{ color: c.textSecondary, fontSize: 16, lineHeight: 23 }}>
            {step !== 'code'
              ? t("We'll email you a one-time code. No password needed, and only CUHK students and staff can join.")
              : t('We sent a code to {email}. It may take a minute to arrive.', { email: email.trim() })}
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
            <Button title={t('Sign in with a password instead')} variant="plain" small onPress={() => setStep('password')} />
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
            <Button title={t('Use an email code instead')} variant="plain" onPress={() => setStep('email')} />
          </>
        ) : (
          <>
            <Field
              label={t('Code')}
              placeholder="123456"
              value={code}
              onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 8))}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
              style={{ fontSize: 28, letterSpacing: 8, textAlign: 'center' }}
              hint={api.isDemo ? t('Demo mode: use {code}', { code: DEMO_CODE }) : undefined}
              autoFocus
            />
            <Button title={t('Sign in')} loading={busy} disabled={code.length < 6} onPress={verify} />
            <Button title={t('Use a different email')} variant="plain" onPress={() => setStep('email')} />
          </>
        )}

        <Text style={{ color: c.textSecondary, fontSize: 12, textAlign: 'center', lineHeight: 17, marginTop: space.xl }}>
          {t('By continuing you agree to the Terms of Use and Privacy Policy. Your email is only used to verify you are a CUHK member.')}
        </Text>
        {/* App Review (1.2) wants the terms, which ban abusive content, one tap away from sign-up. */}
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: space.lg }}>
          <Button small variant="plain" title={t('Terms of use')} onPress={() => WebBrowser.openBrowserAsync(TERMS_URL)} />
          <Button small variant="plain" title={t('Privacy policy')} onPress={() => WebBrowser.openBrowserAsync(PRIVACY_URL)} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
