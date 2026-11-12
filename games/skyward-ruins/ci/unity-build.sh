#!/bin/bash
# Skyward Ruins：Unity のライセンス認証 → プロジェクト生成 → テスト → WebGL ビルド → ライセンス返却。
# GitHub Actions（GameCI の Unity イメージ）でも、Unity を展開したクラウドの作業環境でも同じ手順で動く。
#
# 必要な環境変数（どれか 1 組。値はリポジトリの Secrets 等に置き、コード・ログには書かない）
#   UNITY_EMAIL + UNITY_PASSWORD           … Unity ID（Personal でも可。2 段階認証が有効だと失敗することがある）
#   UNITY_SERIAL（+ EMAIL/PASSWORD）        … Pro/Plus のシリアル
#   UNITY_LICENSE                          … 既にある Unity_lic.ulf の中身
# 任意: UNITY_PATH（既定: unity-editor コマンド or /opt/unity/Editor/Unity）、OUT（既定: Builds/WebGL）
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
PROJECT=$(cd "$HERE/../unity/SkywardRuins" && pwd)
UNITY=${UNITY_PATH:-$(command -v unity-editor || echo /opt/unity/Editor/Unity)}
UDIR=$(dirname "$(readlink -f "$UNITY" 2>/dev/null || echo "$UNITY")")
LC=$(ls "$UDIR"/Data/Resources/Licensing/Client/Unity.Licensing.Client 2>/dev/null || find / -name Unity.Licensing.Client -type f 2>/dev/null | head -1)
OUT=${OUT:-$PROJECT/Builds/WebGL}
LOGS=${LOGS:-$PROJECT/Logs/ci}; mkdir -p "$LOGS"
echo "[ci] Unity: $UNITY"; "$UNITY" -version 2>/dev/null || true

activated=0
if [ -n "${UNITY_LICENSE:-}" ]; then
  mkdir -p "$HOME/.local/share/unity3d/Unity"; printf '%s' "$UNITY_LICENSE" > "$HOME/.local/share/unity3d/Unity/Unity_lic.ulf"; activated=1; echo "[ci] ULF を配置しました"
elif [ -n "${UNITY_SERIAL:-}" ]; then
  "$UNITY" -batchmode -nographics -quit -serial "$UNITY_SERIAL" -username "$UNITY_EMAIL" -password "$UNITY_PASSWORD" -logFile "$LOGS/activate.log" && activated=2
elif [ -n "${UNITY_EMAIL:-}" ] && [ -n "${UNITY_PASSWORD:-}" ]; then
  "$LC" --activate-all --include-personal --username "$UNITY_EMAIL" --password "$UNITY_PASSWORD" > "$LOGS/activate.log" 2>&1 && activated=3 || { echo "[ci] ライセンス認証に失敗（$LOGS/activate.log）"; grep -v -i password "$LOGS/activate.log" | tail -20; exit 10; }
else
  echo "[ci] ライセンスの環境変数がありません（UNITY_EMAIL/UNITY_PASSWORD など）"; exit 10
fi
echo "[ci] ライセンス: 方式 $activated"
cleanup() {
  if [ "$activated" = 3 ]; then "$LC" --deactivate-all --username "$UNITY_EMAIL" --password "$UNITY_PASSWORD" > "$LOGS/deactivate.log" 2>&1 || true; fi
  if [ "$activated" = 2 ]; then "$UNITY" -batchmode -nographics -quit -returnlicense -username "$UNITY_EMAIL" -password "$UNITY_PASSWORD" -logFile "$LOGS/return.log" || true; fi
}
trap cleanup EXIT

run() { # name, args...
  local name=$1; shift
  echo "[ci] === $name"
  set +e; "$UNITY" -batchmode -nographics -projectPath "$PROJECT" -logFile "$LOGS/$name.log" "$@"; local code=$?; set -e
  grep -E "\[ProjectBuilder\]|\[Validate\]|\[Build\]|error CS|Exception|Compilation failed" "$LOGS/$name.log" | tail -60 || true
  echo "[ci] $name の終了コード: $code"; return $code
}
# 1) 生成（初回はパッケージの取得と Input System 設定の反映のため 2 回に分ける）
run builder -quit -buildTarget WebGL -executeMethod SkywardRuins.EditorTools.ProjectBuilder.BuildAllBatch || run builder2 -quit -buildTarget WebGL -executeMethod SkywardRuins.EditorTools.ProjectBuilder.BuildAllBatch
# 2) EditMode テスト
run tests -runTests -testPlatform EditMode -testResults "$LOGS/editmode-results.xml" -buildTarget WebGL || { echo "[ci] テスト失敗"; exit 20; }
grep -o 'result="[A-Za-z]*" total="[0-9]*" passed="[0-9]*" failed="[0-9]*"' "$LOGS/editmode-results.xml" | head -1 || true
# 3) WebGL ビルド
SKYWARD_BUILD_OUT="$OUT" run build -quit -buildTarget WebGL -executeMethod SkywardRuins.EditorTools.BuildScript.BuildWebGL || { echo "[ci] ビルド失敗"; exit 30; }
test -f "$OUT/index.html" && ls -la "$OUT" "$OUT/Build"
echo "[ci] 完了: $OUT"
