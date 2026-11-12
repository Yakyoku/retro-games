// 調整データ。値の出典区分（指示書の推奨初期値／独自推定）は SPEC.md の表に対応する。
// Unity 側では TuningAsset（ScriptableObject）がこのクラスを保持し、インスペクタで調整できる。
using System;

namespace SkywardRuins.Core
{
    public enum Difficulty { Standard = 0, Easy = 1, Practice = 2 }
    public enum ViewMode { Mode2D = 0, Mode3D = 1 }

    [Serializable]
    public class Tuning
    {
        // ---- 時間 ----
        public float fixedHz = 60f;                // 固定ステップ（指示書推奨）
        public int maxStepsPerFrame = 5;           // 停止復帰時の大量更新を制限

        // ---- 論理画面（224×288 は指示書の推奨初期値。原作解像度の断定ではない） ----
        public float fieldW = 224f, fieldH = 288f;
        public float playerMinY = 18f, playerMaxY = 196f, playerMarginX = 10f;

        // ---- 自機 ----
        public float playerSpeed = 120f;           // 論理単位/秒（独自推定）
        public float playerHitRadius = 3.5f;       // 見た目（翼幅 15）より小さい核のみ
        public int livesStandard = 3, livesEasy = 5, livesPractice = 3;
        public float respawnInvuln = 2.0f;         // 指示書推奨
        public float deathFreeze = 2.0f;           // 戦闘停止 → 復帰までの時間（独自推定）

        // ---- 対空（ザッパー相当の前方射撃。名称はオリジナル「ランス」） ----
        public float airInterval = 0.12f;          // 指示書推奨
        public float airShotSpeed = 600f;
        public float airShotRadius = 2.5f;
        public int airShotMaxAlive = 6;

        // ---- 対地（爆撃。名称はオリジナル「ドロップ」） ----
        public float groundCooldown = 0.35f;       // 指示書推奨
        public float bombFlight = 0.30f;           // 指示書推奨（着弾まで）
        public float sightDistance = 76f;          // 自機前方の照準距離（独自推定）
        public float bombRadius = 11f;             // 着弾判定半径＝爆風表示半径
        public float hintRadius = 12f;             // 隠し対象の照準反応半径

        // ---- 敵弾 ----
        public float enemyBulletSpeed = 96f;       // 標準の基準値（独自推定）
        public float easyBulletMul = 0.70f;        // 指示書推奨
        public float loopBulletStep = 0.10f, loopBulletMax = 1.50f; // 指示書推奨
        public float enemyBulletRadius = 2.2f;
        public float telegraph = 0.40f;            // 発射前の予兆（点滅）時間
        public float noFireNearPlayer = 36f;       // 近距離での不可避射撃を禁止

        // ---- スクロール・エリア ----
        public float scrollSpeed = 36f;            // 論理単位/秒（独自推定）
        public float areaLength = 3240f;           // 約 90 秒/エリア（独自推定）
        public int areaCount = 16;

        // ---- 得点（指示書推奨） ----
        public int ptSmallAir = 100, ptHeavyAir = 200, ptTurret = 200, ptHardGround = 500;
        public int ptFortTurret = 200, ptCore = 3000, ptObeliskReveal = 100, ptObeliskBreak = 500;
        public int ptTank = 300, ptRadar = 300;    // 独自推定（指示書に無い種別）
        public int extendFirst = 20000, extendEvery = 60000;

        public int StartLives(Difficulty d) => d == Difficulty.Easy ? livesEasy : d == Difficulty.Practice ? livesPractice : livesStandard;

        public float BulletSpeedMul(Difficulty d, int loop)
        {
            float baseMul = d == Difficulty.Easy ? easyBulletMul : 1f;
            float m = baseMul + loopBulletStep * loop;
            return Math.Min(m, loopBulletMax);
        }
    }

    [Serializable]
    public class AssistSettings
    {
        public bool autoAir = false;        // 対空自動連射（初期 OFF）
        public bool holdAutoBomb = false;   // 長押し自動爆撃（初期 OFF）
        public string Key => (autoAir ? "A" : "-") + (holdAutoBomb ? "B" : "-");
    }
}
