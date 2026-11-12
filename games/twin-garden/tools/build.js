// ツイン・ガーデンのビルド。dist/ に公開物を作る（ルートの tools/build-game.js から呼ばれる）。
// 環境変数: VARIANT = 2d | vr | all（既定 all）、THREE_DIR（既定 ../../node_modules/three）
//   2d  → dist/index.html は 2D 版（three は入れない。2D は three を使わない）
//   vr  → dist/index.html は 3D／VR 版（three を vendor/three に複製）
//   all → dist/index.html は 2 つの入口（手元の確認用）
import { cpSync, rmSync, mkdirSync, existsSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const here = join(dirname(fileURLToPath(import.meta.url)), '..');
const variant = (process.env.VARIANT || 'all').trim();
const threeDir = process.env.THREE_DIR || join(here, '..', '..', 'node_modules', 'three');
const dist = join(here, 'dist');
if (!['2d', 'vr', 'all'].includes(variant)) { console.error(`[twin-garden] VARIANT が不正: ${variant}`); process.exit(1); }

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
const copy = (rel, to = rel) => cpSync(join(here, rel), join(dist, to), { recursive: true });
copy('shared'); copy('icons');
const has = { d2: variant !== 'vr', vr: variant !== '2d' };
if (has.d2) copy('experiments/01-2d');
if (has.vr) {
  if (!existsSync(join(threeDir, 'build', 'three.module.js'))) { console.error(`[twin-garden] three が見つかりません: ${threeDir}`); process.exit(1); }
  copy('experiments/02-vr');
  const v = join(dist, 'vendor', 'three');
  mkdirSync(join(v, 'addons', 'webxr'), { recursive: true });
  for (const f of ['three.module.js', 'three.core.js']) cpSync(join(threeDir, 'build', f), join(v, f));
  const jsm = join(threeDir, 'examples', 'jsm');
  for (const f of ['XRControllerModelFactory.js', 'XRHandModelFactory.js']) if (existsSync(join(jsm, 'webxr', f))) cpSync(join(jsm, 'webxr', f), join(v, 'addons', 'webxr', f));
  for (const d of ['libs', 'loaders']) { /* 使わない（外部モデルは読み込まない） */ }
}
// 入口
if (variant === '2d') copy('experiments/01-2d/index.html', 'index.html');
else if (variant === 'vr') copy('experiments/02-vr/index.html', 'index.html');
else copy('index.html');

let commit = (process.env.COMMIT_REF || '').slice(0, 7);
if (!commit) { try { commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: here }).toString().trim(); } catch (_) { commit = 'local'; } }
const three = existsSync(join(threeDir, 'package.json')) ? JSON.parse(readFileSync(join(threeDir, 'package.json'), 'utf8')).version : null;
const info = { game: 'twin-garden', variant, three: has.vr ? three : null, built: new Date().toISOString(), commit, build: `${variant}-${commit}-${Date.now().toString(36)}` };
writeFileSync(join(dist, 'build-info.json'), JSON.stringify(info, null, 2));

// Netlify のヘッダー。圧縮は Netlify が Accept-Encoding に合わせて自動で行う（事前圧縮した .gz/.br は置かない＝Content-Encoding の食い違いが起きない）
writeFileSync(join(dist, '_headers'), [
  '/*',
  '  X-Content-Type-Options: nosniff',
  '  Cache-Control: public, max-age=0, must-revalidate',
  '  Permissions-Policy: xr-spatial-tracking=(self), gamepad=(self), fullscreen=(self)',
  '/vendor/*',
  '  Cache-Control: public, max-age=604800, immutable',
  '',
].join('\n'));

let n = 0, bytes = 0;
(function walk(d) { for (const f of readdirSync(d)) { const p = join(d, f); const st = statSync(p); if (st.isDirectory()) walk(p); else { n++; bytes += st.size; } } })(dist);
console.log(`[twin-garden] VARIANT=${variant} build=${info.build} → dist/ ${n} files, ${(bytes / 1048576).toFixed(2)}MB`);
