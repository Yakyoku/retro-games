// VOIDBLOOM のビルド。dist/ に公開物を作る（ルートの tools/build-game.js から呼ばれる）。
// 環境変数: VARIANT = 2d | vr | all（既定 all）、THREE_DIR（既定 ../../node_modules/three）
// 外部 CDN は使わない。three は vendor/three/ に複製し、各ページの importmap から参照する。
import { cpSync, rmSync, mkdirSync, existsSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = join(dirname(fileURLToPath(import.meta.url)), '..');
const variant = (process.env.VARIANT || 'all').trim();
const threeDir = process.env.THREE_DIR || join(here, '..', '..', 'node_modules', 'three');
const dist = join(here, 'dist');

if (!['2d', 'vr', 'all'].includes(variant)) { console.error(`[bio-hshooter] VARIANT が不正: ${variant}`); process.exit(1); }
if (!existsSync(join(threeDir, 'build', 'three.module.js'))) { console.error(`[bio-hshooter] three が見つかりません: ${threeDir}`); process.exit(1); }

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

const copy = (rel) => cpSync(join(here, rel), join(dist, rel), { recursive: true });
for (const f of readdirSync(here)) if (/\.(html|js|css)$/.test(f)) copy(f);
copy('shared');
const has = { bigscreen: variant !== 'vr', vr: variant !== '2d' };
mkdirSync(join(dist, 'experiments'), { recursive: true });
if (has.bigscreen) copy('experiments/01-bigscreen');
if (has.vr) copy('experiments/02-vr-quest3');

// three（本体と、使う addons だけ）
const v = join(dist, 'vendor', 'three');
mkdirSync(join(v, 'addons'), { recursive: true });
for (const f of ['three.module.js', 'three.core.js']) cpSync(join(threeDir, 'build', f), join(v, f));
const jsm = join(threeDir, 'examples', 'jsm');
for (const d of ['postprocessing', 'shaders']) cpSync(join(jsm, d), join(v, 'addons', d), { recursive: true });
mkdirSync(join(v, 'addons', 'utils'), { recursive: true });
mkdirSync(join(v, 'addons', 'environments'), { recursive: true });
cpSync(join(jsm, 'utils', 'BufferGeometryUtils.js'), join(v, 'addons', 'utils', 'BufferGeometryUtils.js'));
cpSync(join(jsm, 'environments', 'RoomEnvironment.js'), join(v, 'addons', 'environments', 'RoomEnvironment.js'));
const threePkg = JSON.parse(readFileSync(join(threeDir, 'package.json'), 'utf8'));

// ビルド情報（入口ページがどのカードを有効にするか・版の表示に使う）
const info = { variant, has, three: threePkg.version, built: new Date().toISOString(),
  commit: (process.env.COMMIT_REF || '').slice(0, 7) };
writeFileSync(join(dist, 'build-info.json'), JSON.stringify(info, null, 2));

// Netlify のヘッダー（dist/_headers）。worklet は同一オリジンなのでそのまま
writeFileSync(join(dist, '_headers'), [
  '/*', '  X-Content-Type-Options: nosniff', '  Cache-Control: public, max-age=0, must-revalidate',
  '/vendor/*', '  Cache-Control: public, max-age=86400', '',
].join('\n'));

let n = 0, bytes = 0;
(function walk(d) { for (const f of readdirSync(d)) { const p = join(d, f); const st = statSync(p); if (st.isDirectory()) walk(p); else { n++; bytes += st.size; } } })(dist);
console.log(`[bio-hshooter] VARIANT=${variant} three@${threePkg.version} → dist/ ${n} files, ${(bytes / 1048576).toFixed(1)}MB`);
