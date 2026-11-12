// 公開前の確認：dist/ に制作注記（指定の文面そのまま）と必要なファイルがあるか。Unity 成果物があれば Build/ の中身も確認する。
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = process.argv[2] || join(here, 'dist');
const NOTICE = 'このゲームは Claude Code のクラウドセッションで制作しました。';
let fail = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fail++; };
const index = readFileSync(join(dist, 'index.html'), 'utf8');
ok(index.includes(NOTICE), 'トップページに制作注記（文面一致）');
ok(existsSync(join(dist, '_headers')), '_headers（Brotli 配信設定）');
const unity = existsSync(join(dist, 'Build'));
if (unity) {
  const files = readdirSync(join(dist, 'Build'));
  for (const ext of ['.loader.js', '.framework.js', '.wasm', '.data']) ok(files.some(f => f.includes(ext)), 'Build/ に ' + ext);
  ok(existsSync(join(dist, 'status', 'index.html')), '制作状況ページ /status/');
} else {
  ok(existsSync(join(dist, 'audio', 'bgm_play.wav')), '音の試聴ファイル');
  ok(existsSync(join(dist, 'preview', 'sprites-sheet.png')), '素材の確認画像');
}
const tpl = readFileSync(join(here, 'unity', 'SkywardRuins', 'Assets', 'WebGLTemplates', 'SkywardRuins', 'index.html'), 'utf8');
ok(tpl.includes(NOTICE), 'Unity の WebGL テンプレートに制作注記');
const svc = readFileSync(join(here, 'unity', 'SkywardRuins', 'Assets', 'SkywardRuins', 'Runtime', 'Services', 'Services.cs'), 'utf8');
ok(svc.includes(NOTICE), 'Unity のタイトル（画面・VR 共通）に制作注記');
process.exit(fail ? 1 : 0);
