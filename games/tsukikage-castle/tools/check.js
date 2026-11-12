// 静的点検: generator メタ・エラー表示・外部 URL/CDN の不使用・import 先の存在・制作注記の文言・文書の冒頭
// 使い方: node tools/check.js （失敗があれば終了コード 1）
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const bad = [], files = [];
(function walk(d) { for (const f of readdirSync(d)) { if (['node_modules', 'dist', '.git'].includes(f)) continue; const p = join(d, f); statSync(p).isDirectory() ? walk(p) : files.push(p); } })(root);
const rel = (p) => relative(root, p);
const CREDIT = '本作は、Claude Codeのクラウドセッションで制作しました。';
for (const f of files.filter((f) => f.endsWith('.html'))) {
  const s = readFileSync(f, 'utf8');
  if (!s.includes('<meta name="generator" content="Claude Code">')) bad.push(`${rel(f)}: generator メタがない`);
  if (!/error-overlay\.js/.test(s)) bad.push(`${rel(f)}: error-overlay.js を読んでいない`);
  if (/(src|href)\s*=\s*["']https?:/i.test(s)) bad.push(`${rel(f)}: 外部 URL を読み込んでいる`);
  if (/https?:\/\/(cdn|unpkg|fonts\.|esm\.)/i.test(s)) bad.push(`${rel(f)}: CDN を参照している`);
}
for (const f of files.filter((f) => f.endsWith('.js') && !rel(f).startsWith('tools') && !rel(f).startsWith('tests'))) {
  const s = readFileSync(f, 'utf8');
  if (/from\s+['"]https?:|import\(\s*['"]https?:/.test(s)) bad.push(`${rel(f)}: 外部 URL を import している`);
  for (const m of s.matchAll(/(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    const spec = m[1] || m[2];
    if (!spec.startsWith('.')) { if (!(spec === 'three' || spec.startsWith('three/addons/'))) bad.push(`${rel(f)}: 想定外の bare import "${spec}"`); continue; }
    if (!existsSync(resolve(dirname(f), spec))) bad.push(`${rel(f)}: import 先がない "${spec}"`);
  }
}
// 制作注記: トップページの雛形と、ゲーム内タイトルの両方
if (!readFileSync(join(root, 'index.template.html'), 'utf8').includes(CREDIT)) bad.push('index.template.html: 制作注記がない');
if (!readFileSync(join(root, 'shared', 'app.js'), 'utf8').includes(CREDIT)) bad.push('shared/app.js: 制作注記がない');
for (const f of ['play2d/index.html', 'play3d/index.html']) if (!readFileSync(join(root, f), 'utf8').includes(CREDIT)) bad.push(`${f}: 読み込み画面に制作注記がない`);
// 公式の制作・監修・公認と誤認させる表現がない
for (const f of files.filter((f) => /\.(html|js|md)$/.test(f) && !rel(f).startsWith('tools'))) {
  const s = readFileSync(f, 'utf8');
  if (/(カプコン|Capcom|Anthropic|Claude)[^。\n]{0,12}(公式|公認|監修)/.test(s) && !/(公式|公認|監修)[^。\n]{0,30}(ではない|ありません|受けていない|しない|ではありません)/.test(s)) bad.push(`${rel(f)}: 公式・公認と読める表現がある`);
}
for (const m of ['README.md', 'CLAUDE.md']) {
  if (!existsSync(join(root, m))) { bad.push(`${m}: ない`); continue; }
  if (!/Claude/.test(readFileSync(join(root, m), 'utf8').split('\n').slice(0, 4).join('\n'))) bad.push(`${m}: 冒頭に Claude で作った旨の一文がない`);
}
if (bad.length) { console.error('[check] NG\n  ' + bad.join('\n  ')); process.exit(1); }
console.log(`[check] OK（${files.length} ファイル）`);
