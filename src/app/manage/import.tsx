import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { toast } from '@/components/Toast';
import { Banner, Button, Field, Icon } from '@/components/ui';
import { api, errorMessage, invalidate } from '@/lib/api';
import { guessColumns, parseCsv, rowsToImport, type ImportColumn } from '@/lib/commerce';
import { confirmAsync, showAlert } from '@/lib/dialog';
import { radius, space, useColors } from '@/lib/theme';
import { t } from '@/lib/i18n';

const COLUMNS: ImportColumn[] = ['full_name', 'student_id', 'email', 'phone', 'college', 'major'];
const columnLabel = (col: ImportColumn | null) =>
  col == null
    ? t('Skip')
    : {
        full_name: t('Name'),
        student_id: t('Student ID'),
        email: t('Email'),
        phone: t('Phone'),
        college: t('College'),
        major: t('Major'),
      }[col];

export default function Import() {
  const { planId } = useLocalSearchParams<{ societyId: string; planId: string }>();
  const c = useColors();
  const [text, setText] = useState('');
  const [override, setOverride] = useState<Record<number, ImportColumn | null>>({});
  const [busy, setBusy] = useState(false);

  const parsed = useMemo(() => {
    const all = parseCsv(text);
    if (!all.length) return null;
    const header = all[0];
    const guessed = guessColumns(header);
    // No header we recognise: treat the first row as data, first column as the name.
    const hasHeader = guessed.some(Boolean);
    const columns = (hasHeader ? guessed : header.map((_, i) => (i === 0 ? 'full_name' : null))).map((col, i) =>
      i in override ? override[i] : col,
    ) as (ImportColumn | null)[];
    const body = hasHeader ? all.slice(1) : all;
    return { header: hasHeader ? header : header.map((_, i) => t('Column {n}', { n: i + 1 })), columns, body, rows: rowsToImport(body, columns) };
  }, [text, override]);

  const cycle = (i: number) => {
    if (!parsed) return;
    const order: (ImportColumn | null)[] = [...COLUMNS, null];
    const next = order[(order.indexOf(parsed.columns[i]) + 1) % order.length];
    setOverride((o) => ({ ...o, [i]: next }));
  };

  const hasName = parsed?.columns.includes('full_name');
  const hasContact = parsed?.columns.includes('email') || parsed?.columns.includes('student_id');
  const skipped = parsed ? parsed.body.length - parsed.rows.length : 0;

  const run = async () => {
    if (!parsed?.rows.length) return;
    const ok = await confirmAsync(
      t('Import {n} members?', { n: parsed.rows.length }),
      t('They become active members on this plan with a member number. People already on this plan are skipped.'),
      t('Import'),
    );
    if (!ok) return;
    setBusy(true);
    try {
      const n = await api.importMemberships(planId, parsed.rows);
      invalidate();
      router.back();
      toast(t('{n} members imported', { n }));
    } catch (e) {
      showAlert(t('Could not import'), errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <View style={{ gap: space.sm }}>
          <Step n={1} text={t('Open last year’s list in Excel or Google Sheets.')} />
          <Step n={2} text={t('Select the rows including the header, copy, and paste them below.')} />
          <Step n={3} text={t('Check each column is matched. Tap a column to change it.')} />
        </View>
        <Field
          label={t('Paste your member list')}
          value={text}
          onChangeText={(v) => {
            setText(v);
            setOverride({});
          }}
          multiline
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={'Name\tStudent ID\tEmail\nChan Tai Man\t1155123456\t…'}
          style={{ minHeight: 140, fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }), fontSize: 13 }}
        />

        {parsed && (
          <>
            <View style={{ gap: space.sm }}>
              <Text style={{ color: c.textSecondary, fontSize: 13, fontWeight: '600' }}>{t('Columns')}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                {parsed.header.map((h, i) => {
                  const col = parsed.columns[i];
                  return (
                    <Pressable
                      key={i}
                      onPress={() => cycle(i)}
                      accessibilityRole="button"
                      accessibilityHint={t('Tap to change what this column is')}
                      style={[styles.col, { backgroundColor: col ? c.tintSoft : c.fill }]}>
                      <Text style={{ color: c.textSecondary, fontSize: 12 }} numberOfLines={1}>
                        {h || t('Column {n}', { n: i + 1 })}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Text style={{ color: col ? c.tintText : c.textTertiary, fontSize: 15, fontWeight: '600' }}>{columnLabel(col)}</Text>
                        <Icon name="swap-vertical" size={13} color={col ? c.tintText : c.textTertiary} />
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {!hasName ? (
              <Banner tone="warning" icon="alert-circle-outline" text={t('Pick which column has each member’s name.')} />
            ) : !hasContact ? (
              <Banner tone="warning" icon="alert-circle-outline" text={t('Pick a student ID or email column, so members can be matched to their accounts.')} />
            ) : (
              <View style={[styles.preview, { backgroundColor: c.card }]}>
                {parsed.rows.slice(0, 5).map((r, i) => (
                  <View key={i} style={[styles.previewRow, i > 0 && { borderTopColor: c.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
                    <Text style={{ color: c.text, fontSize: 15, fontWeight: '600' }} numberOfLines={1}>
                      {r.full_name}
                    </Text>
                    <Text style={{ color: c.textSecondary, fontSize: 13 }} numberOfLines={1}>
                      {[r.student_id, r.email, r.college ? t(r.college) : null].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                ))}
                {parsed.rows.length > 5 && (
                  <Text style={[styles.previewRow, { color: c.textSecondary, fontSize: 13 }]}>
                    {t('and {n} more', { n: parsed.rows.length - 5 })}
                  </Text>
                )}
              </View>
            )}
            {skipped > 0 && hasName && hasContact && (
              <Text style={{ color: c.textSecondary, fontSize: 13 }}>
                {t('{n} rows without a name, student ID or email will be skipped.', { n: skipped })}
              </Text>
            )}
          </>
        )}

        <Button
          title={parsed?.rows.length ? t('Import {n} members', { n: parsed.rows.length }) : t('Import')}
          icon="cloud-upload-outline"
          loading={busy}
          disabled={!parsed?.rows.length || !hasName || !hasContact}
          onPress={run}
        />
        <Text style={{ color: c.textSecondary, fontSize: 13, lineHeight: 19 }}>
          {t('Imported members are linked to their account when they sign in with the same CUHK email, and their member card appears in Tickets.')}
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Step({ n, text }: { n: number; text: string }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'flex-start' }}>
      <View style={[styles.stepNo, { backgroundColor: c.ink }]}>
        <Text style={{ color: c.onInk, fontSize: 13, fontWeight: '700' }}>{n}</Text>
      </View>
      <Text style={{ color: c.text, fontSize: 15, lineHeight: 21, flex: 1 }}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  col: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.md, minWidth: 96, gap: 2 },
  preview: { borderRadius: radius.lg, overflow: 'hidden' },
  previewRow: { paddingHorizontal: space.lg, paddingVertical: 10, gap: 2 },
  stepNo: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginTop: 0 },
});
