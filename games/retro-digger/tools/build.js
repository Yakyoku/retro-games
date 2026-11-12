// 地底探検：ポンプ・パトロール のビルド。dist/ に公開物を作る（ルートの tools/build-game.js から呼ばれる）。
// 環境変数: VARIANT = 2d | vr | all（既定 all。vr は通常 3D と Quest 3 VR を含む）、THREE_DIR（既定 ../../node_modules/three）
// 外部 CDN は使わない。three は vendor/three/ に複製し、3D のページの importmap から参照する。
import { cpSync, rmSync, mkdirSync, existsSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const here = join(dirname(fileURLToPath(import.meta.url)), '..');
const variant = (process.env.VARIANT || 'all').trim();
const threeDir = process.env.THREE_DIR || join(here, '..', '..', 'node_modules', 'three');
const dist = join(here, 'dist');
const TAG = '[retro-digger]';

if (!['2d', 'vr', 'all'].includes(variant)) { console.error(`${TAG} VARIANT が不正: ${variant}`); process.exit(1); }
if (!existsSync(join(threeDir, 'build', 'three.module.js'))) { console.error(`${TAG} three が見つかりません: ${threeDir}`); process.exit(1); }

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
const copy = (rel) => cpSync(join(here, rel), join(dist, rel), { recursive: true });
for (const f of readdirSync(here)) if (/\.(html|js|css|webmanifest)$/.test(f)) copy(f);
copy('shared');
if (existsSync(join(here, 'icons'))) copy('icons');
const has = { arcade2d: variant !== 'vr', underground3d: variant !== '2d' };
mkdirSync(join(dist, 'experiments'), { recursive: true });
if (has.arcade2d) copy('experiments/01-arcade-2d');
if (has.underground3d) copy('experiments/02-underground-3d');

// three（本体と、使う addons だけ）
const v = join(dist, 'vendor', 'three');
mkdirSync(join(v, 'addons', 'utils'), { recursive: true });
for (const f of ['three.module.js', 'three.core.js']) cpSync(join(threeDir, 'build', f), join(v, f));
const jsm = join(threeDir, 'examples', 'jsm');
cpSync(join(jsm, 'utils', 'BufferGeometryUtils.js'), join(v, 'addons', 'utils', 'BufferGeometryUtils.js'));
const threePkg = JSON.parse(readFileSync(join(threeDir, 'package.json'), 'utf8'));

let commit = (process.env.COMMIT_REF || '').slice(0, 7);
if (!commit) { try { commit = execSync('git rev-parse --short HEAD', { cwd: here }).toString().trim(); } catch {} }
const info = { game: 'retro-digger', variant, has, three: threePkg.version, built: new Date().toISOString(), commit, buildId: process.env.BUILD_ID || null };
writeFileSync(join(dist, 'build-info.json'), JSON.stringify(info, null, 2));

// Netlify のヘッダー。HTML・JS は毎回確認（版の混在を防ぐ）。圧縮は Netlify に任せる（二重圧縮しない）
writeFileSync(join(dist, '_headers'), [
  '/*', '  X-Content-Type-Options: nosniff', '  Cache-Control: public, max-age=0, must-revalidate',
  '  Permissions-Policy: xr-spatial-tracking=(self), gamepad=(self)',
  '/vendor/*', '  Cache-Control: public, max-age=86400', '',
].join('\n'));
// 存在しないファイルを index.html に転送しない（素材の 404 を 404 のまま返す）
writeFileSync(join(dist, '404.html'), '<!doctype html><meta charset="utf-8"><meta name="generator" content="Claude Code"><title>404</title><script src="/shared/error-overlay.js"></script><p style="font-family:system-ui;padding:2em">ページが見つかりません。<a href="/">トップへ</a></p>');

let n = 0, bytes = 0;
(function walk(d) { for (const f of readdirSync(d)) { const p = join(d, f); const st = statSync(p); if (st.isDirectory()) walk(p); else { n++; bytes += st.size; } } })(dist);
console.log(`${TAG} VARIANT=${variant} three@${threePkg.version} commit=${commit} → dist/ ${n} files, ${(bytes / 1048576).toFixed(1)}MB`);
