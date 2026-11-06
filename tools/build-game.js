// Netlify のビルドで実行される入口。
// 環境変数 GAME（games/ 配下のフォルダ名）と VARIANT（2d / vr / all）を読み、
// games/<GAME>/tools/build.js を実行して、できた games/<GAME>/dist をリポジトリ直下の dist/ に移す。
// 7 作品で 1 つのリポジトリを共有し、Netlify サイトごとに GAME と VARIANT を変えて使い分ける。
import { execFileSync } from 'node:child_process';
import { existsSync, rmSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const game = (process.env.GAME || '').trim();
const variant = (process.env.VARIANT || 'all').trim();

if (!/^[a-z0-9-]+$/.test(game)) {
  console.error(`[build-game] 環境変数 GAME が未設定または不正です: "${game}"`);
  process.exit(1);
}
const gameDir = join(root, 'games', game);
const gameBuild = join(gameDir, 'tools', 'build.js');
if (!existsSync(gameBuild)) {
  console.error(`[build-game] ${gameBuild} がありません（games/${game}/ の骨組みが未作成）`);
  process.exit(1);
}

// three の場所を作品の build.js に渡す（three は exports で package.json を公開していないため、
// 作品側で require.resolve('three/package.json') は使えない。THREE_DIR を使うこと）
const threeDir = join(root, 'node_modules', 'three');
if (!existsSync(join(threeDir, 'build', 'three.module.js'))) {
  console.error('[build-game] node_modules/three がありません。リポジトリのルートで npm install / npm ci を実行してください');
  process.exit(1);
}

console.log(`[build-game] GAME=${game} VARIANT=${variant} THREE_DIR=${threeDir}`);
execFileSync(process.execPath, [gameBuild], {
  cwd: gameDir,
  stdio: 'inherit',
  env: { ...process.env, VARIANT: variant, THREE_DIR: threeDir },
});

const gameDist = join(gameDir, 'dist');
if (!existsSync(join(gameDist, 'index.html'))) {
  console.error(`[build-game] ${gameDist}/index.html が生成されていません`);
  process.exit(1);
}
const outDist = join(root, 'dist');
rmSync(outDist, { recursive: true, force: true });
cpSync(gameDist, outDist, { recursive: true });
console.log(`[build-game] games/${game}/dist → dist/ に配置しました`);
