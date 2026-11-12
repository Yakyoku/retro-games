// 月影の魔城のビルド。dist/ に公開物を作る（ルートの tools/build-game.js から呼ばれる）。
// 環境変数: VARIANT = 2d | vr | all（既定 all）、THREE_DIR（既定 ../../node_modules/three）
// 2d: トップページ＋ play/（2D 版）。vr: トップページ＋ play/（3D/VR 版）＋ vendor/three。all: 両方（play/ と play3d/）
// 外部 CDN は使わない。相互リンクの URL は netlify-sites.json から読む。
import { cpSync, rmSync, mkdirSync, existsSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const here = join(dirname(fileURLToPath(import.meta.url)), '..');
const variant = (process.env.VARIANT || 'all').trim();
const threeDir = process.env.THREE_DIR || join(here, '..', '..', 'node_modules', 'three');
const dist = join(here, 'dist');
if (!['2d', 'vr', 'all'].includes(variant)) { console.error(`[tsukikage] VARIANT が不正: ${variant}`); process.exit(1); }

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
const copy = (from, to = from) => cpSync(join(here, from), join(dist, to), { recursive: true });
copy('shared');
copy('icons');
const sites = existsSync(join(here, 'netlify-sites.json')) ? JSON.parse(readFileSync(join(here, 'netlify-sites.json'), 'utf8')).sites : [];
const urlOf = (v) => (sites.find((s) => s.variant === v) || {}).url || null;
const has2d = variant !== 'vr', has3d = variant !== '2d';
if (has2d) copy('play2d', 'play');
if (has3d) copy('play3d', variant === 'vr' ? 'play' : 'play3d');
if (has3d) {
  if (!existsSync(join(threeDir, 'build', 'three.module.js'))) { console.error(`[tsukikage] three が見つかりません: ${threeDir}`); process.exit(1); }
  const v = join(dist, 'vendor', 'three');
  mkdirSync(join(v, 'addons', 'webxr'), { recursive: true });
  for (const f of ['three.module.js', 'three.core.js']) cpSync(join(threeDir, 'build', f), join(v, f));
  const jsm = join(threeDir, 'examples', 'jsm');
  for (const f of ['webxr/XRControllerModelFactory.js', 'webxr/VRButton.js']) cpSync(join(jsm, f), join(v, 'addons', f));
  cpSync(join(jsm, 'libs', 'motion-controllers.module.js'), join(v, 'addons', 'libs', 'motion-controllers.module.js'));
  mkdirSync(join(v, 'addons', 'loaders'), { recursive: true });
  cpSync(join(jsm, 'loaders', 'GLTFLoader.js'), join(v, 'addons', 'loaders', 'GLTFLoader.js'));
  mkdirSync(join(v, 'addons', 'utils'), { recursive: true });
  cpSync(join(jsm, 'utils', 'BufferGeometryUtils.js'), join(v, 'addons', 'utils', 'BufferGeometryUtils.js'));
}
const threePkg = has3d ? JSON.parse(readFileSync(join(threeDir, 'package.json'), 'utf8')) : null;
let commit = (process.env.COMMIT_REF || '').slice(0, 7);
if (!commit) try { commit = execSync('git rev-parse --short HEAD', { cwd: here }).toString().trim(); } catch (e) { /* なし */ }
const me = variant === 'vr' ? 'vr' : '2d';
const other = variant === 'all' ? null : urlOf(me === '2d' ? 'vr' : '2d');
const info = { variant, three: threePkg && threePkg.version, built: new Date().toISOString(), commit, otherUrl: variant === 'all' ? (me === '2d' ? '../play3d/' : '../play/') : other, self: urlOf(me) };
writeFileSync(join(dist, 'build-info.json'), JSON.stringify(info, null, 2));

// トップページ（制作注記は HTML に直接書く。JS が動かなくても見える）
const tpl = readFileSync(join(here, 'index.template.html'), 'utf8');
const is3d = variant === 'vr';
const page = tpl
  .replaceAll('{{VARIANT_TITLE}}', is3d ? '3D / VR 版' : variant === 'all' ? '2D 版・3D / VR 版' : '2D 版')
  .replaceAll('{{PLAY_HREF}}', 'play/')
  .replaceAll('{{PLAY_LABEL}}', is3d ? '3D / VR 版で遊ぶ' : '2D 版で遊ぶ')
  .replaceAll('{{PLAY_DESC}}', is3d ? '通常のブラウザでは三人称の立体ジオラマ。Meta Quest 3 のブラウザでは「VR で遊ぶ」から立体視とコントローラー操作。'
    : 'デスクトップ・タブレット・スマートフォンのブラウザで遊ぶ横スクロール版。キーボード・コントローラー・タッチに対応。')
  .replaceAll('{{OTHER_HREF}}', variant === 'all' ? 'play3d/' : other || '#')
  .replaceAll('{{OTHER_LABEL}}', is3d ? '2D 版へ' : '3D / VR 版へ')
  .replaceAll('{{OTHER_HIDDEN}}', variant === 'all' || other ? '' : 'hidden')
  .replaceAll('{{BUILD}}', `${commit || 'local'} / ${info.built.slice(0, 10)}${threePkg ? ' / three.js r' + threePkg.version.split('.')[1] : ''}`);
writeFileSync(join(dist, 'index.html'), page);
writeFileSync(join(dist, '_headers'), [
  '/*', '  X-Content-Type-Options: nosniff', '  Cache-Control: public, max-age=0, must-revalidate', '  Permissions-Policy: xr-spatial-tracking=(self), gamepad=(self)',
  '/vendor/*', '  Cache-Control: public, max-age=604800', '',
].join('\n'));
let n = 0, bytes = 0;
(function walk(d) { for (const f of readdirSync(d)) { const p = join(d, f); const st = statSync(p); if (st.isDirectory()) walk(p); else { n++; bytes += st.size; } } })(dist);
console.log(`[tsukikage] VARIANT=${variant} → dist/ ${n} files, ${(bytes / 1048576).toFixed(2)}MB${threePkg ? ' three@' + threePkg.version : ''} other=${info.otherUrl}`);
