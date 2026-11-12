// 静的点検: 全 HTML の generator メタ・エラー表示・外部 URL の不使用・import 先の存在・トップページの制作注釈。
// 使い方: node tools/check.js（失敗があれば終了コード 1）
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const bad = [], files = [];
(function walk(d) { for (const f of readdirSync(d)) { if (['node_modules', 'dist', '.git'].includes(f)) continue; const p = join(d, f); const st = statSync(p); if (st.isDirectory()) walk(p); else files.push(p); } })(root);
const rel = (p) => relative(root, p);
for (const f of files.filter((f) => f.endsWith('.html'))) {
  const s = readFileSync(f, 'utf8');
  if (!s.includes('<meta name="generator" content="Claude Code">')) bad.push(`${rel(f)}: generator メタがない`);
  if (!/error-overlay\.js/.test(s)) bad.push(`${rel(f)}: error-overlay.js を読んでいない`);
  if (/(src|href)\s*=\s*["']https?:/i.test(s)) bad.push(`${rel(f)}: 外部 URL を読み込んでいる`);
}
for (const f of files.filter((f) => f.endsWith('.js') && rel(f).startsWith('src'))) {
  const s = readFileSync(f, 'utf8');
  if (/from\s+['"]https?:|import\(\s*['"]https?:/.test(s)) bad.push(`${rel(f)}: 外部 URL を import している`);
  for (const m of s.matchAll(/(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    const spec = m[1] || m[2];
    if (!spec.startsWith('.')) { if (!(spec === 'three' || spec.startsWith('three/addons/'))) bad.push(`${rel(f)}: 想定外の bare import "${spec}"`); continue; }
    if (!existsSync(resolve(dirname(f), spec))) bad.push(`${rel(f)}: import 先がない "${spec}"`);
  }
}
const top = readFileSync(join(root, 'index.html'), 'utf8');
const NOTE = '本ゲームはClaude Codeのクラウドセッションで制作しました。';
if (!top.includes(`<span>${NOTE}</span>`)) bad.push('index.html: トップページ下部の制作注釈（テキスト）がない');
for (const m of ['README.md', 'CLAUDE.md']) { if (!existsSync(join(root, m))) { bad.push(`${m} がない`); continue; } const head = readFileSync(join(root, m), 'utf8').split('\n').slice(0, 4).join('\n'); if (!/Claude/.test(head)) bad.push(`${m}: 冒頭に Claude で作った旨の一文がない`); }
if (bad.length) { console.error('[check] NG\n  ' + bad.join('\n  ')); process.exit(1); }
console.log(`[check] OK（${files.length} ファイル）`);
