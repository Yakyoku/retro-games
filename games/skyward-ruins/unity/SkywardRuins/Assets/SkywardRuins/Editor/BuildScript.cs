// WebGL ビルドの入口（クラウド CI・コマンドラインから実行）。
//   Unity -batchmode -quit -projectPath unity/SkywardRuins -buildTarget WebGL -executeMethod SkywardRuins.EditorTools.BuildScript.BuildWebGL -logFile -
// 出力先は環境変数 SKYWARD_BUILD_OUT（既定: Builds/WebGL）。ビルド結果の要約と終了コードで成否を返す。
using System;
using System.Linq;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace SkywardRuins.EditorTools
{
    public static class BuildScript
    {
        [UnityEditor.MenuItem("Skyward Ruins/2. WebGL ビルド")]
        public static void BuildWebGLMenu() => Build(false);
        public static void BuildWebGL() => Build(true);

        static void Build(bool exit)
        {
            int code = 0;
            try
            {
                if (EditorUserBuildSettings.activeBuildTarget != BuildTarget.WebGL)
                    EditorUserBuildSettings.SwitchActiveBuildTarget(BuildTargetGroup.WebGL, BuildTarget.WebGL);
                ProjectBuilder.BuildAll();
                var errors = ProjectBuilder.Validate();
                if (errors.Count > 0) { foreach (var e in errors) Debug.LogError("[Validate] " + e); throw new Exception("検証エラー " + errors.Count + " 件"); }
                string outDir = Environment.GetEnvironmentVariable("SKYWARD_BUILD_OUT");
                if (string.IsNullOrEmpty(outDir)) outDir = "Builds/WebGL";
                var opts = new BuildPlayerOptions { scenes = ProjectBuilder.ScenePaths, locationPathName = outDir, target = BuildTarget.WebGL, options = BuildOptions.None };
                var report = BuildPipeline.BuildPlayer(opts);
                var s = report.summary;
                Debug.Log($"[Build] result={s.result} size={s.totalSize / 1024 / 1024}MB time={s.totalTime} errors={s.totalErrors} warnings={s.totalWarnings} out={outDir}");
                foreach (var step in report.steps) foreach (var m in step.messages.Where(m => m.type == LogType.Error || m.type == LogType.Exception)) Debug.LogError("[Build] " + m.content);
                if (s.result != BuildResult.Succeeded) code = 3;
            }
            catch (Exception e) { Debug.LogException(e); code = 1; }
            if (exit) EditorApplication.Exit(code);
        }
    }
}
