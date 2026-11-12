// ORBITAL WINGS のビルド。dist/ に公開物だけを作る（ルートの tools/build-game.js から呼ばれる）
// 環境変数: VARIANT = 2d | vr | all（既定 all）、THREE_DIR（既定 ../../node_modules/three）
// 公開するのは index.html・2d/・3d/・shared/（実行に要るもの）・vendor/three だけ。テスト・資料・音源マスターは含めない。
import { cpSync, rmSync, mkdirSync, existsSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const here = join(dirname(fileURLToPath(import.meta.url)), '..');
const variant = (process.env.VARIANT || 'all').trim();
const threeDir = process.env.THREE_DIR || join(here, '..', '..', 'node_modules', 'three');
const dist = join(here, 'dist');
if (!['2d', 'vr', 'all'].includes(variant)) { console.error(`[orbital-wings] VARIANT が不正: ${variant}`); process.exit(1); }
if (!existsSync(join(threeDir, 'build', 'three.module.js'))) { console.error(`[orbital-wings] three が見つかりません: ${threeDir}`); process.exit(1); }

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
const copy = (rel, filter) => cpSync(join(here, rel), join(dist, rel), { recursive: true, filter: filter || (() => true) });
copy('index.html');
// shared/ は実行時に読むものだけ（README などは除く）
copy('shared', (src) => !/\.md$/.test(src));
if (variant !== 'vr') copy('2d');
if (variant !== '2d' && existsSync(join(here, '3d'))) copy('3d');
const v = join(dist, 'vendor', 'three');
mkdirSync(v, { recursive: true });
for (const f of ['three.module.js', 'three.core.js']) cpSync(join(threeDir, 'build', f), join(v, f));
const threePkg = JSON.parse(readFileSync(join(threeDir, 'package.json'), 'utf8'));

// ビルド ID（公開物の中身のハッシュ）。公開版と手元のビルドの一致確認に使う
const files = [];
(function walk(d) { for (const f of readdirSync(d).sort()) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else files.push(p); } })(dist);
const h = createHash('sha256');
for (const p of files) { h.update(p.slice(dist.length)); h.update(readFileSync(p)); }
const build = h.digest('hex').slice(0, 12);
const info = { game: 'orbital-wings', project: 'GradiusInspired_Cloud', variant, build, three: threePkg.version, built: new Date().toISOString(), commit: (process.env.COMMIT_REF || '').slice(0, 7) };
writeFileSync(join(dist, 'build-info.json'), JSON.stringify(info, null, 2));

// Netlify のヘッダー。HTML は毎回確認、three は 1 日キャッシュ。.js は text/javascript を明示（worklet の読み込み用）
writeFileSync(join(dist, '_headers'), [
  '/*', '  X-Content-Type-Options: nosniff', '  Cache-Control: public, max-age=0, must-revalidate', '  Permissions-Policy: xr-spatial-tracking=(self), gamepad=(self)',
  '/*.js', '  Content-Type: text/javascript; charset=utf-8',
  '/vendor/*', '  Cache-Control: public, max-age=86400', '',
].join('\n'));
let bytes = 0; for (const p of files) bytes += statSync(p).size;
console.log(`[orbital-wings] VARIANT=${variant} three@${threePkg.version} build=${build} → dist/ ${files.length + 2} files, ${(bytes / 1048576).toFixed(2)}MB`);
