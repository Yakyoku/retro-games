// Skyward Ruins の公開物を dist/ に作る（ルートの tools/build-game.js から呼ばれる）。
// Netlify のビルド環境では Unity は動かない（ライセンスとエディタが無い）。そのため:
//  - webgl/ に「クラウドの Unity でビルドに成功した WebGL 成果物」があれば、それを配信する（Brotli 用の _headers 付き）
//  - 無ければ、制作状況ページ（トップページの制作注記・素材の確認画像・音の試聴・検証結果）を配信する
// three は使わない（Unity 作品のため）。
import { cpSync, rmSync, mkdirSync, existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(here, 'dist');
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

const unityBuild = join(here, 'webgl');
const hasUnity = existsSync(join(unityBuild, 'index.html')) && existsSync(join(unityBuild, 'Build'));

// Unity WebGL（Brotli 圧縮）を正しく配信するためのヘッダー。データ取得に HTML を返さないよう、Build/ 配下はリダイレクトしない
const headers = `/Build/*.wasm.br
  Content-Type: application/wasm
  Content-Encoding: br
/Build/*.js.br
  Content-Type: application/javascript
  Content-Encoding: br
/Build/*.data.br
  Content-Type: application/octet-stream
  Content-Encoding: br
/Build/*.symbols.json.br
  Content-Type: application/json
  Content-Encoding: br
/Build/*
  Cache-Control: public, max-age=31536000, immutable
/index.html
  Cache-Control: no-cache
/
  Cache-Control: no-cache
/status/*
  Cache-Control: no-cache
`;

if (hasUnity) {
  cpSync(unityBuild, dist, { recursive: true });
  console.log('[skyward-ruins] Unity WebGL 成果物を配信します: webgl/');
}

// 制作状況ページ（Unity 版があっても /status/ に置く。無ければトップに置く）
const statusDir = hasUnity ? join(dist, 'status') : dist;
mkdirSync(statusDir, { recursive: true });
cpSync(join(here, 'web', 'status.html'), join(statusDir, 'index.html'));
cpSync(join(here, 'web', 'status.css'), join(statusDir, 'status.css'));
const prev = join(here, 'tools', 'preview');
const outPrev = join(statusDir, 'preview'); mkdirSync(outPrev, { recursive: true });
for (const f of ['sprites-sheet.png', 'models-gallery.png', 'spec-compare.png']) if (existsSync(join(prev, f))) cpSync(join(prev, f), join(outPrev, f));
for (const f of existsSync(join(prev, 'sim')) ? readdirSync(join(prev, 'sim')) : []) if (/^(frame-|areas-overview|scene3d-)/.test(f) || f === 'scene3d-3.png') cpSync(join(prev, 'sim', f), join(outPrev, f));
for (const f of readdirSync(prev)) if (/^scene3d-\d\.png$/.test(f)) cpSync(join(prev, f), join(outPrev, f));
const audioSrc = join(here, 'unity', 'SkywardRuins', 'Assets', 'SkywardRuins', 'Audio');
const outAudio = join(statusDir, 'audio'); mkdirSync(outAudio, { recursive: true });
for (const f of readdirSync(audioSrc)) if (f.endsWith('.wav')) cpSync(join(audioSrc, f), join(outAudio, f));
const audioMeta = JSON.parse(readFileSync(join(here, 'unity', 'SkywardRuins', 'Assets', 'SkywardRuins', 'Data', 'audio.json'), 'utf8'));
writeFileSync(join(statusDir, 'audio.json'), JSON.stringify(audioMeta));
writeFileSync(join(statusDir, 'build-info.json'), JSON.stringify({
  unityBuild: hasUnity,
  commit: process.env.COMMIT_REF || process.env.GIT_COMMIT || 'local',
  builtAt: new Date().toISOString(),
}, null, 1));
writeFileSync(join(dist, '_headers'), headers);
console.log(`[skyward-ruins] dist/ を作成（Unity WebGL: ${hasUnity ? 'あり' : 'なし → 制作状況ページをトップに配置'}）`);
