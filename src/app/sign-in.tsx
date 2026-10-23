import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';

import { Button, Field, Icon } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { isCuhkEmail } from '@/lib/backend';
import { DEMO_CODE } from '@/lib/demo';
import { showAlert } from '@/lib/dialog';
import { needsOnboarding } from '@/lib/onboarding';
import { space, useColors } from '@/lib/theme';

/** Leave the sign-in sheet: first-timers go to the welcome screen, everyone else back to where they were. */
async function done() {
  if (await needsOnboarding().catch(() => false)) router.replace('/welcome');
  else if (router.canGoBack()) router.back();
  else router.replace('/discover');
}

export default function SignIn() {
  const c = useColors();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code' | 'password'>('email');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const sendCode = async () => {
    if (!isCuhkEmail(email)) {
      showAlert('Use your CUHK email', 'Sign in with your @link.cuhk.edu.hk (students) or @cuhk.edu.hk (staff) address.');
      return;
    }
    setBusy(true);
    try {
      await api.sendCode(email);
      setStep('code');
    } catch (e) {
      showAlert('Could not send code', errorMessage(e));
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
      showAlert('Could not sign in', errorMessage(e));
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
      showAlert('Could not sign in', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.lg }} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: 'center', gap: space.sm, marginVertical: space.lg }}>
          <Icon name={step === 'code' ? 'mail-open' : 'school'} size={48} color={c.tint} />
          <Text style={{ color: c.text, fontSize: 24, fontWeight: '800', textAlign: 'center' }}>
            {step === 'code' ? 'Check your inbox' : 'Sign in with your CUHK email'}
          </Text>
          <Text style={{ color: c.textSecondary, fontSize: 15, textAlign: 'center', lineHeight: 21 }}>
            {step !== 'code'
              ? "We'll email you a one-time code. No password needed, and only CUHK students and staff can join."
              : `We sent a code to ${email.trim()}. It may take a minute to arrive.`}
          </Text>
        </View>

        {step === 'email' ? (
          <>
            <Field
              label="CUHK email"
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
            <Button title="Send code" loading={busy} disabled={!email.includes('@')} onPress={sendCode} />
            <Button title="Sign in with a password instead" variant="plain" small onPress={() => setStep('password')} />
          </>
        ) : step === 'password' ? (
          // Only for accounts an admin created with a password, e.g. the App Store review account.
          <>
            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="username"
            />
            <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry textContentType="password" />
            <Button title="Sign in" loading={busy} disabled={!email.includes('@') || !password} onPress={passwordSignIn} />
            <Button title="Use an email code instead" variant="plain" onPress={() => setStep('email')} />
          </>
        ) : (
          <>
            <Field
              label="Code"
              placeholder="123456"
              value={code}
              onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 8))}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
              style={{ fontSize: 28, letterSpacing: 8, textAlign: 'center' }}
              hint={api.isDemo ? `Demo mode: use ${DEMO_CODE}` : undefined}
              autoFocus
            />
            <Button title="Sign in" loading={busy} disabled={code.length < 6} onPress={verify} />
            <Button title="Use a different email" variant="plain" onPress={() => setStep('email')} />
          </>
        )}

        <Text style={{ color: c.textSecondary, fontSize: 12, textAlign: 'center', lineHeight: 17 }}>
          By continuing you agree to the Terms of Use and Privacy Policy. Your email is only used to verify you are a CUHK member.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
