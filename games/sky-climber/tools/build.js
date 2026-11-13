// Sky Climber VR のビルド。dist/ に公開物を作る（ルートの tools/build-game.js から呼ばれる）。
// 環境変数: VARIANT = 2d | vr | all（この作品は 1 つの成果物に通常 3D と VR が同居するので、どれでも同じ）、THREE_DIR（既定 ../../node_modules/three）
// 外部 CDN は使わない。three は vendor/three/ に複製し、importmap から参照する。
import { cpSync, rmSync, mkdirSync, existsSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const here = join(dirname(fileURLToPath(import.meta.url)), '..');
const variant = (process.env.VARIANT || 'all').trim();
const threeDir = process.env.THREE_DIR || join(here, '..', '..', 'node_modules', 'three');
const dist = join(here, 'dist');
if (!existsSync(join(threeDir, 'build', 'three.module.js'))) { console.error(`[sky-climber] three が見つかりません: ${threeDir}`); process.exit(1); }

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
const copy = (rel) => cpSync(join(here, rel), join(dist, rel), { recursive: true });
for (const f of readdirSync(here)) if (/\.(html)$/.test(f)) copy(f);
for (const d of ['src', 'fonts', 'icons', 'experiments']) if (existsSync(join(here, d))) copy(d);
// three（本体と使う addons だけ）
const v = join(dist, 'vendor', 'three');
mkdirSync(join(v, 'addons', 'utils'), { recursive: true });
for (const f of ['three.module.js', 'three.core.js']) cpSync(join(threeDir, 'build', f), join(v, f));
cpSync(join(threeDir, 'examples', 'jsm', 'utils', 'BufferGeometryUtils.js'), join(v, 'addons', 'utils', 'BufferGeometryUtils.js'));
// 画面効果（ブルーム・色調整）に使う postprocessing と shaders
for (const d of ['postprocessing', 'shaders']) cpSync(join(threeDir, 'examples', 'jsm', d), join(v, 'addons', d), { recursive: true });
const threePkg = JSON.parse(readFileSync(join(threeDir, 'package.json'), 'utf8'));
// 版: 手元の git を優先（CLI からのアップロードでは Netlify の COMMIT_REF がリポジトリのコミットと一致しないため）
let commit = '';
try { commit = execSync('git rev-parse --short HEAD', { cwd: here, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch (e) { commit = (process.env.COMMIT_REF || '').slice(0, 7); }
const info = { game: 'sky-climber', variant, three: threePkg.version, built: new Date().toISOString(), commit };
writeFileSync(join(dist, 'build-info.json'), JSON.stringify(info, null, 2));
// Netlify のヘッダー: 版の整合のため本体は毎回確認、three とフォントは 1 日キャッシュ
writeFileSync(join(dist, '_headers'), [
  '/*', '  X-Content-Type-Options: nosniff', '  Cache-Control: public, max-age=0, must-revalidate', '  Permissions-Policy: xr-spatial-tracking=(self), gamepad=(self)',
  '/vendor/*', '  Cache-Control: public, max-age=86400',
  '/fonts/*', '  Cache-Control: public, max-age=86400', '  Access-Control-Allow-Origin: *',
  '/*.woff2', '  Content-Type: font/woff2', '',
].join('\n'));
let n = 0, bytes = 0;
(function walk(d) { for (const f of readdirSync(d)) { const p = join(d, f); const st = statSync(p); if (st.isDirectory()) walk(p); else { n++; bytes += st.size; } } })(dist);
console.log(`[sky-climber] three@${threePkg.version} commit=${commit} → dist/ ${n} files, ${(bytes / 1048576).toFixed(2)}MB`);
