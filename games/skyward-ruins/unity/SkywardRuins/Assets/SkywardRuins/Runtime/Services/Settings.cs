// 設定とハイスコアの保存（端末内。PlayerPrefs → Web では IndexedDB）。保存に失敗してもプレイは続けられる。
using System;
using System.Collections.Generic;
using SkywardRuins.Core;
using UnityEngine;

namespace SkywardRuins
{
    [Serializable]
    public class Settings
    {
        public float master = 0.8f, bgm = 0.7f, sfx = 0.8f;
        public bool mute;
        public bool autoAir, holdAutoBomb;          // 支援設定（初期 OFF）
        public float vibration = 0.6f;              // 0 で振動なし
        public bool leftHanded;                     // VR の左右入れ替え
        public bool reduceFlash = true;             // 強い点滅を抑える（初期 ON）
        public bool screenShake;                    // 画面振動（初期 OFF）
        public int view3D;                          // 0 斜め見下ろし / 1 コックピット
        public float vrScale = 1f;                  // VR の盤面の大きさ（倍率）
        public float vignette = 0.5f;               // VR 周辺減光の強さ
        public bool radar = true;                   // VR 補助レーダー
        public int difficulty;                      // 最後に選んだ難易度
        public int practiceArea;                    // 練習で選んだエリア
        public int lastMode;                        // 0=2D 1=3D
        public bool swapPadButtons;                 // ゲームパッドの対空/対地入れ替え
        public string[] keys = KeyDefaults();       // 再割当可能なキー（Input System の Key 名）

        public static string[] KeyDefaults() => new[] { "UpArrow", "DownArrow", "LeftArrow", "RightArrow", "Z", "X", "Escape", "W", "S", "A", "D" };
        public AssistSettings Assist => new AssistSettings { autoAir = autoAir, holdAutoBomb = holdAutoBomb };
    }

    [Serializable] class ScoreRow { public string key; public int score; }
    [Serializable] class ScoreTable { public List<ScoreRow> rows = new List<ScoreRow>(); }

    public static class SaveService
    {
        const string KSettings = "skyward.settings.v1", KScores = "skyward.scores.v1";
        static Settings settings; static ScoreTable scores;
        public static bool LastSaveFailed { get; private set; }

        public static Settings Settings
        {
            get
            {
                if (settings != null) return settings;
                try { var j = PlayerPrefs.GetString(KSettings, ""); settings = string.IsNullOrEmpty(j) ? new Settings() : JsonUtility.FromJson<Settings>(j); }
                catch (Exception e) { Debug.LogWarning("[Save] 設定を読めませんでした: " + e.Message); settings = new Settings(); }
                if (settings.keys == null || settings.keys.Length != Settings.KeyDefaults().Length) settings.keys = Settings.KeyDefaults();
                return settings;
            }
        }

        public static void SaveSettings()
        {
            try { PlayerPrefs.SetString(KSettings, JsonUtility.ToJson(Settings)); PlayerPrefs.Save(); LastSaveFailed = false; }
            catch (Exception e) { LastSaveFailed = true; Debug.LogWarning("[Save] 設定を保存できませんでした: " + e.Message); }
        }

        /// <summary>ハイスコアは 2D/3D・難易度・支援設定ごとに分ける。練習は通常の表に混ぜない。</summary>
        public static string ScoreKey(ViewMode mode, Difficulty d, AssistSettings a) => $"{(mode == ViewMode.Mode2D ? "2D" : "3D")}/{d}/{a.Key}";

        static ScoreTable Scores
        {
            get
            {
                if (scores != null) return scores;
                try { var j = PlayerPrefs.GetString(KScores, ""); scores = string.IsNullOrEmpty(j) ? new ScoreTable() : JsonUtility.FromJson<ScoreTable>(j); }
                catch (Exception e) { Debug.LogWarning("[Save] スコアを読めませんでした: " + e.Message); scores = new ScoreTable(); }
                if (scores.rows == null) scores.rows = new List<ScoreRow>();
                return scores;
            }
        }

        public static int HighScore(string key) { foreach (var r in Scores.rows) if (r.key == key) return r.score; return 0; }

        /// <summary>更新したら true。</summary>
        public static bool Submit(string key, int score)
        {
            var t = Scores; ScoreRow row = null;
            foreach (var r in t.rows) if (r.key == key) row = r;
            if (row != null && row.score >= score) return false;
            if (row == null) { row = new ScoreRow { key = key }; t.rows.Add(row); }
            row.score = score;
            try { PlayerPrefs.SetString(KScores, JsonUtility.ToJson(t)); PlayerPrefs.Save(); LastSaveFailed = false; }
            catch (Exception e) { LastSaveFailed = true; Debug.LogWarning("[Save] スコアを保存できませんでした: " + e.Message); }
            return true;
        }

        public static IEnumerable<(string key, int score)> AllScores() { foreach (var r in Scores.rows) yield return (r.key, r.score); }
    }
}
