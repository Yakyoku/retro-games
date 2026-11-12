// 鉄骨レスキュー のビルド。dist/ に公開物を作る（ルートの tools/build-game.js から呼ばれる）。
// 環境変数: VARIANT = 2d | vr | all（既定 all。この作品は 1 つのアプリで 2D と VR を切り替えるので中身は同じ）、
//           THREE_DIR（既定 ../../node_modules/three）
// 外部 CDN は使わない。three は vendor/three/ に複製し、importmap から参照する。
import { cpSync, rmSync, mkdirSync, existsSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = join(dirname(fileURLToPath(import.meta.url)), '..');
const variant = (process.env.VARIANT || 'all').trim();
const threeDir = process.env.THREE_DIR || join(here, '..', '..', 'node_modules', 'three');
const dist = join(here, 'dist');

if (!['2d', 'vr', 'all'].includes(variant)) { console.error(`[retro-climber] VARIANT が不正: ${variant}`); process.exit(1); }
if (!existsSync(join(threeDir, 'build', 'three.module.js'))) { console.error(`[retro-climber] three が見つかりません: ${threeDir}`); process.exit(1); }

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
const copy = (rel) => cpSync(join(here, rel), join(dist, rel), { recursive: true });
for (const f of readdirSync(here)) if (/\.(html|webmanifest)$/.test(f)) copy(f);
for (const d of ['app', 'shared', 'icons', 'experiments']) copy(d);

// three（本体と、使う addons だけ）
const v = join(dist, 'vendor', 'three');
mkdirSync(join(v, 'addons', 'utils'), { recursive: true });
for (const f of ['three.module.js', 'three.core.js']) cpSync(join(threeDir, 'build', f), join(v, f));
cpSync(join(threeDir, 'examples', 'jsm', 'utils', 'BufferGeometryUtils.js'), join(v, 'addons', 'utils', 'BufferGeometryUtils.js'));
const threePkg = JSON.parse(readFileSync(join(threeDir, 'package.json'), 'utf8'));

const info = { game: 'retro-climber', variant, three: threePkg.version, built: new Date().toISOString(), commit: (process.env.COMMIT_REF || '').slice(0, 7) };
writeFileSync(join(dist, 'build-info.json'), JSON.stringify(info, null, 2));

// Netlify のヘッダー。HTML・JS は毎回確認（更新がすぐ届く）、three は 1 日。
// 欠けたファイルに HTML を返すリダイレクトは置かない（読み込み失敗を隠さない）
writeFileSync(join(dist, '_headers'), [
  '/*', '  X-Content-Type-Options: nosniff', '  Cache-Control: public, max-age=0, must-revalidate',
  '  Permissions-Policy: xr-spatial-tracking=(self), gamepad=(self)',
  '/vendor/*', '  Cache-Control: public, max-age=86400',
  '/*.webmanifest', '  Content-Type: application/manifest+json', '',
].join('\n'));

let n = 0, bytes = 0;
(function walk(d) { for (const f of readdirSync(d)) { const p = join(d, f); const st = statSync(p); if (st.isDirectory()) walk(p); else { n++; bytes += st.size; } } })(dist);
console.log(`[retro-climber] VARIANT=${variant} three@${threePkg.version} → dist/ ${n} files, ${(bytes / 1048576).toFixed(1)}MB`);
