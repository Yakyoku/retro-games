// AEGIS RELAY のビルド。dist/ に公開物を作る（ルートの tools/build-game.js から呼ばれる）
// 環境変数: VARIANT = 2d | vr | all（既定 all）、THREE_DIR（既定 ../../node_modules/three）
// 外部 CDN は使わない。three は vendor/three/ に複製し、3D のページの importmap から参照する。
import { cpSync, rmSync, mkdirSync, existsSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = join(dirname(fileURLToPath(import.meta.url)), '..');
const variant = (process.env.VARIANT || 'all').trim();
const threeDir = process.env.THREE_DIR || join(here, '..', '..', 'node_modules', 'three');
const dist = join(here, 'dist');
if (!['2d', 'vr', 'all'].includes(variant)) { console.error(`[aegis-relay] VARIANT が不正: ${variant}`); process.exit(1); }
const has = { p2: variant !== 'vr', p3: variant !== '2d' };
if (has.p3 && !existsSync(join(threeDir, 'build', 'three.module.js'))) { console.error(`[aegis-relay] three が見つかりません: ${threeDir}`); process.exit(1); }

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
const copy = (rel) => cpSync(join(here, rel), join(dist, rel), { recursive: true });
copy('shared'); copy('fonts');
if (has.p2) copy('play2d');
if (has.p3) copy('play3d');
let threeVer = null;
if (has.p3) {
  const v = join(dist, 'vendor', 'three'); mkdirSync(v, { recursive: true });
  for (const f of ['three.module.js', 'three.core.js']) cpSync(join(threeDir, 'build', f), join(v, f));
  mkdirSync(join(v, 'addons', 'utils'), { recursive: true });
  cpSync(join(threeDir, 'examples', 'jsm', 'utils', 'BufferGeometryUtils.js'), join(v, 'addons', 'utils', 'BufferGeometryUtils.js'));
  threeVer = JSON.parse(readFileSync(join(threeDir, 'package.json'), 'utf8')).version;
}
// 入口ページ（サイトごとに中身を変える）
const tpl = readFileSync(join(here, 'index.html'), 'utf8');
writeFileSync(join(dist, 'index.html'), tpl.replace('data-variant="all"', `data-variant="${variant}"`));
const info = { variant, has, three: threeVer, built: new Date().toISOString(), commit: (process.env.COMMIT_REF || '').slice(0, 7) };
writeFileSync(join(dist, 'build-info.json'), JSON.stringify(info, null, 2));
// Netlify のヘッダー。圧縮は Netlify 側に任せる（事前圧縮ファイルは置かない → 二重圧縮しない）
writeFileSync(join(dist, '_headers'), [
  '/*', '  X-Content-Type-Options: nosniff', '  Cache-Control: public, max-age=0, must-revalidate',
  '  Permissions-Policy: xr-spatial-tracking=(self), gamepad=(self)',
  '/fonts/*', '  Cache-Control: public, max-age=604800', '  Access-Control-Allow-Origin: *',
  '/vendor/*', '  Cache-Control: public, max-age=86400', '',
].join('\n'));
let n = 0, bytes = 0;
(function walk(d) { for (const f of readdirSync(d)) { const p = join(d, f); const st = statSync(p); if (st.isDirectory()) walk(p); else { n++; bytes += st.size; } } })(dist);
console.log(`[aegis-relay] VARIANT=${variant}${threeVer ? ' three@' + threeVer : ''} → dist/ ${n} files, ${(bytes / 1048576).toFixed(1)}MB`);
