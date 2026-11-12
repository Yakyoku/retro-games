// NIGHT SHAFT のビルド。dist/ に公開物を作る（ルートの tools/build-game.js から呼ばれる）。
// VARIANT = 2d   → dist/ 直下が 2D 版（サイト elevator-mission 2D 用）
// VARIANT = vr   → dist/ 直下が Quest 3 WebXR 版、/probe/ に WebXR 最小検証シーン
// VARIANT = all  → 両方を experiments/ 以下に置き、入口に一覧（確認用）
// 各ページのモジュールは ../../shared/ を読む。サイト直下に置いても URL の解決が / で止まるので、そのまま /shared/ を指す。
import { cpSync, rmSync, mkdirSync, existsSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';

const here = join(dirname(fileURLToPath(import.meta.url)), '..');
const variant = (process.env.VARIANT || 'all').trim();
const threeDir = process.env.THREE_DIR || join(here, '..', '..', 'node_modules', 'three');
const dist = join(here, 'dist');
if (!['2d', 'vr', 'all'].includes(variant)) { console.error(`[night-shaft] VARIANT が不正: ${variant}`); process.exit(1); }

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
const cp = (from, to) => cpSync(join(here, from), join(dist, to), { recursive: true });
cp('shared', 'shared');
cp('icons', 'icons');

const needVr = variant !== '2d';
if (needVr) {
  if (!existsSync(join(threeDir, 'build', 'three.module.js'))) { console.error(`[night-shaft] three が見つかりません: ${threeDir}`); process.exit(1); }
  const v = join(dist, 'vendor', 'three');
  mkdirSync(join(v, 'addons', 'webxr'), { recursive: true });
  for (const f of ['three.module.js', 'three.core.js']) cpSync(join(threeDir, 'build', f), join(v, f));
  for (const f of ['XRControllerModelFactory.js', 'VRButton.js']) cpSync(join(threeDir, 'examples', 'jsm', 'webxr', f), join(v, 'addons', 'webxr', f));
  // コントローラーの形（ブラウザが返すプロファイルで選ばれる）。motion-controllers は jsm/libs にある
  const libs = join(threeDir, 'examples', 'jsm', 'libs');
  mkdirSync(join(v, 'addons', 'libs'), { recursive: true });
  cpSync(join(libs, 'motion-controllers.module.js'), join(v, 'addons', 'libs', 'motion-controllers.module.js'));
  mkdirSync(join(v, 'addons', 'loaders'), { recursive: true });
  cpSync(join(threeDir, 'examples', 'jsm', 'loaders', 'GLTFLoader.js'), join(v, 'addons', 'loaders', 'GLTFLoader.js'));
  mkdirSync(join(v, 'addons', 'utils'), { recursive: true });
  cpSync(join(threeDir, 'examples', 'jsm', 'utils', 'BufferGeometryUtils.js'), join(v, 'addons', 'utils', 'BufferGeometryUtils.js'));
}
if (variant === '2d') { cp('experiments/01-2d', '.'); }
else if (variant === 'vr') { cp('experiments/02-vr', '.'); cp('experiments/00-xr-probe', 'probe'); }
else {
  cp('experiments', 'experiments');
  writeFileSync(join(dist, 'index.html'), `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NIGHT SHAFT（確認用）</title>
<style>body{font:16px system-ui,sans-serif;background:#070912;color:#e9eef7;padding:24px}a{color:#7fe0ff}</style>
<h1>NIGHT SHAFT（確認用の一覧）</h1><p>このゲームは、Claude Codeのクラウドセッションで制作しました。</p>
<ul><li><a href="experiments/01-2d/">2D 版</a></li><li><a href="experiments/02-vr/">Quest 3 WebXR 版</a></li><li><a href="experiments/00-xr-probe/">WebXR 最小検証シーン</a></li></ul>`);
}
// importmap の three の場所（VR ページだけ）: VARIANT=all では experiments/02-vr/ から ../../vendor
for (const page of ['index.html', 'probe/index.html', 'experiments/02-vr/index.html', 'experiments/00-xr-probe/index.html']) {
  const p = join(dist, page);
  if (!existsSync(p)) continue;
  const html = readFileSync(p, 'utf8');
  if (!html.includes('__VENDOR__')) continue;
  const depth = page.split('/').length - 1;
  writeFileSync(p, html.replaceAll('__VENDOR__', (depth ? '../'.repeat(depth) : './') + 'vendor/three'));
}

// ビルド情報（版の表示・マニフェスト）
let commit = (process.env.COMMIT_REF || '').slice(0, 7);
if (!commit) { try { commit = execSync('git rev-parse --short HEAD', { cwd: here }).toString().trim(); } catch { commit = ''; } }
const files = [];
(function walk(d, rel = '') { for (const f of readdirSync(d)) { const p = join(d, f); const r = rel ? rel + '/' + f : f; if (statSync(p).isDirectory()) walk(p, r); else files.push(r); } })(dist);
const hash = createHash('sha256');
for (const f of files.sort()) hash.update(f).update(readFileSync(join(dist, f)));
const info = { game: 'night-shaft', variant, commit, contentHash: hash.digest('hex').slice(0, 16), built: new Date().toISOString(), files: files.length };
writeFileSync(join(dist, 'build-info.json'), JSON.stringify(info, null, 2));
writeFileSync(join(dist, '_headers'), [
  '/*', '  X-Content-Type-Options: nosniff', '  Cache-Control: public, max-age=0, must-revalidate', '  Permissions-Policy: xr-spatial-tracking=(self), gamepad=(self)',
  '/vendor/*', '  Cache-Control: public, max-age=86400', '',
].join('\n'));
let bytes = 0; for (const f of files) bytes += statSync(join(dist, f)).size;
console.log(`[night-shaft] VARIANT=${variant} → dist/ ${files.length} files, ${(bytes / 1048576).toFixed(2)}MB, hash ${info.contentHash}`);
