/// <reference types="node" />
import { afterEach, describe, expect, it } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import ts from 'typescript';

import zhHant from '../../i18n/zh-Hant';
import { COLLEGES, EVENT_CATEGORIES, SOCIETY_CATEGORIES } from '../constants';
import { availability, formatDay, formatTime } from '../format';
import { getLang, setLang, t } from '../i18n';

const root = path.join(__dirname, '../../..');

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) return d.name === '__tests__' ? [] : sourceFiles(p);
    return /\.tsx?$/.test(d.name) ? [p] : [];
  });
}

/** Every string literal passed as the first argument of t(...). */
function translationKeys() {
  const keys = new Set<string>();
  for (const file of sourceFiles(path.join(root, 'src'))) {
    const src = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = (n: ts.Node) => {
      if (ts.isCallExpression(n) && n.expression.getText(src) === 't') {
        const a = n.arguments[0];
        if (a && (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a))) keys.add(a.text);
      }
      ts.forEachChild(n, visit);
    };
    visit(src);
  }
  return keys;
}

/** Errors the server and the demo backend raise; errorMessage() shows them translated. */
function errorMessages() {
  const migrations = path.join(root, 'supabase/migrations');
  const sql = fs.readdirSync(migrations).map((f) => fs.readFileSync(path.join(migrations, f), 'utf8'));
  const demo = fs.readFileSync(path.join(root, 'src/lib/demo.ts'), 'utf8');
  return [
    ...sql.flatMap((s) => [...s.matchAll(/raise exception '([^']*)'/g)].map((m) => m[1])),
    ...[...demo.matchAll(/new Error\('([^']*)'\)/g)].map((m) => m[1]),
  ];
}

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('Traditional Chinese translations', () => {
  it('cover every string in the app', () => {
    const keys = [...translationKeys()];
    expect(keys.length).toBeGreaterThan(300);
    expect(keys.filter((k) => !(k in zhHant))).toEqual([]);
  });

  it('cover stored values shown in the app', () => {
    const values = [
      ...COLLEGES,
      ...SOCIETY_CATEGORIES,
      ...EVENT_CATEGORIES,
      ...['owner', 'admin', 'editor', 'draft', 'published', 'cancelled', 'pending', 'approved', 'rejected', 'event', 'society', 'banner'],
    ];
    expect(values.filter((v) => !(v in zhHant))).toEqual([]);
  });

  it('cover server and demo error messages', () => {
    expect(errorMessages().filter((m) => !(m in zhHant))).toEqual([]);
  });

  it('keep the same placeholders', () => {
    const wrong = Object.entries(zhHant).filter(([en, zh]) => placeholders(en).join() !== placeholders(zh).join());
    expect(wrong).toEqual([]);
  });
});

describe('t()', () => {
  afterEach(() => setLang('zh-Hant'));

  it('defaults to Traditional Chinese', () => {
    expect(getLang()).toBe('zh-Hant');
    expect(t('Sign in')).toBe('登入');
    expect(t('{n} spots left', { n: 3 })).toBe('尚餘 3 個名額');
  });

  it('falls back to the English text for unknown strings', () => {
    expect(t('Some server message')).toBe('Some server message');
  });

  it('switches to English', () => {
    setLang('en');
    expect(t('Sign in')).toBe('Sign in');
    expect(t('{n} spots left', { n: 3 })).toBe('3 spots left');
  });

  it('formats dates and availability in the current language', () => {
    expect(formatTime('2026-10-23T10:30:00Z')).toBe('下午6:30');
    expect(formatDay('2026-12-25T04:00:00Z')).toMatch(/12月25日/);
    setLang('en');
    expect(formatTime('2026-10-23T10:30:00Z')).toBe('6:30pm');
    expect(
      availability({
        status: 'published',
        registration_required: false,
        capacity: null,
        confirmed_count: 0,
        waitlist_enabled: false,
        registration_opens_at: null,
        registration_closes_at: null,
        starts_at: '2030-01-01T00:00:00Z',
      }).label,
    ).toBe('No sign-up needed');
  });
});
