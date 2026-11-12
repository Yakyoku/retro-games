// 静的点検: 全 HTML の generator メタ・エラー表示・外部 URL の不使用・import 先の存在・MADE WITH CLAUDE の印・資料の有無。
// 使い方: node tools/check.js   （失敗があれば終了コード 1）
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const bad = [];
const files = [];
(function walk(d) {
  for (const f of readdirSync(d)) {
    if (['node_modules', 'dist', '.git', '.netlify'].includes(f)) continue;
    const p = join(d, f); const st = statSync(p);
    if (st.isDirectory()) walk(p); else files.push(p);
  }
})(root);
const rel = (p) => relative(root, p);
// 絶対パス（/shared/...）は作品フォルダを公開ルートとみなして解決する
const resolveSpec = (from, spec) => (spec.startsWith('/') ? join(root, spec) : resolve(dirname(from), spec));

for (const f of files.filter((f) => f.endsWith('.html'))) {
  const s = readFileSync(f, 'utf8');
  if (!s.includes('<meta name="generator" content="Claude Code">')) bad.push(`${rel(f)}: generator メタがない`);
  if (!/error-overlay\.js/.test(s)) bad.push(`${rel(f)}: error-overlay.js を読んでいない`);
  if (/(src|href)\s*=\s*["']https?:/i.test(s)) bad.push(`${rel(f)}: 外部 URL を読み込んでいる`);
  for (const m of s.matchAll(/(?:src|href)\s*=\s*["'](\/[^"']+)["']/g)) if (!m[1].startsWith('/vendor/') && !existsSync(resolveSpec(f, m[1].replace(/\/$/, '/index.html')))) bad.push(`${rel(f)}: 参照先がない ${m[1]}`);
  for (const m of s.matchAll(/import\(\s*['"](\/[^'"]+)['"]\s*\)/g)) if (!existsSync(resolveSpec(f, m[1]))) bad.push(`${rel(f)}: import 先がない ${m[1]}`);
}
for (const f of files.filter((f) => f.endsWith('.js') && !rel(f).startsWith('tools') && !rel(f).startsWith('tests'))) {
  const s = readFileSync(f, 'utf8');
  if (/from\s+['"]https?:|import\(\s*['"]https?:/.test(s)) bad.push(`${rel(f)}: 外部 URL を import している`);
  if (/fetch\(\s*['"]https?:/.test(s)) bad.push(`${rel(f)}: 外部 URL を fetch している`);
  for (const m of s.matchAll(/(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    const spec = m[1] || m[2];
    if (spec === 'three' || spec.startsWith('three/addons/')) { if (rel(f).includes('01-2d') || rel(f).startsWith('shared')) bad.push(`${rel(f)}: 2D・共通部分が three を読んでいる`); continue; }
    if (!spec.startsWith('.') && !spec.startsWith('/')) { bad.push(`${rel(f)}: 想定外の bare import "${spec}"`); continue; }
    if (!existsSync(resolveSpec(f, spec))) bad.push(`${rel(f)}: import 先がない "${spec}"`);
  }
}
// 共通コアは描画・機器に依存しない
for (const f of files.filter((f) => rel(f).startsWith('shared/core/'))) {
  const s = readFileSync(f, 'utf8');
  if (/\b(document|window|navigator|requestAnimationFrame|performance\.now|Math\.random|Date\.now)\b/.test(s.replace(/\/\/.*$/gm, ''))) bad.push(`${rel(f)}: 共通コアが描画・時計・非決定的な乱数に依存している`);
}
for (const m of ['index.html', 'experiments/01-2d/index.html', 'experiments/02-vr/index.html']) if (!readFileSync(join(root, m), 'utf8').includes('MADE WITH CLAUDE') && m === 'index.html') bad.push(`${m}: MADE WITH CLAUDE がない`);
if (!readFileSync(join(root, 'shared/ui/dom-ui.js'), 'utf8').includes('MADE WITH CLAUDE')) bad.push('タイトル画面に MADE WITH CLAUDE がない');
for (const m of ['README.md', 'CLAUDE.md']) {
  if (!existsSync(join(root, m))) { bad.push(`${m}: がない`); continue; }
  const head = readFileSync(join(root, m), 'utf8').split('\n').slice(0, 4).join('\n');
  if (!/Claude/.test(head)) bad.push(`${m}: 冒頭に Claude で作った旨の一文がない`);
}
for (const d of ['GAME_DESIGN', 'ENVIRONMENT', 'ASSET_LICENSES', 'AUDIO_REFERENCE', 'AUDIO_TEST_REPORT', 'GRAPHICS_QUALITY', 'MULTI_PROJECT_SETUP', 'TEST_REPORT', 'DEPLOYMENT']) if (!existsSync(join(root, 'docs', d + '.md'))) bad.push(`docs/${d}.md がない`);
if (bad.length) { console.error('[check] NG\n  ' + bad.join('\n  ')); process.exit(1); }
console.log(`[check] OK（${files.length} ファイル）`);
