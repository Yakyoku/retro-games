// ゲームの進行：固定 60Hz のステップ、イベント → 音・演出・HUD、一時停止・中断・結果・リトライ・操作練習。
// Game2D / Game3D シーンに 1 つ置く（ProjectBuilder が配置）。リトライはシーンを読み直さず、描画と音を片付けてから作り直す。
using System.Collections.Generic;
using SkywardRuins.Core;
using UnityEngine;

namespace SkywardRuins
{
    public class GameRunner : MonoBehaviour
    {
        public ViewMode mode;
        GameDatabase db; GameViewBase view; Hud hud; Sim sim;
        enum Flow { Playing, Paused, Result }
        Flow flow; float acc, resultAt = -1; string scoreKey; bool newRecord;
        int tutorialStep; float tutorialT; readonly HashSet<EvType> tutorialSeen = new HashSet<EvType>();
        bool firstStepDone;

        void Start()
        {
            Services.EnsureBooted();
            db = GameDatabase.Instance;
            view = mode == ViewMode.Mode2D ? (GameViewBase)GetComponent<View2D>() : GetComponent<View3D>();
            hud = Hud.Create(UIRoot.Instance.Layer, mode == ViewMode.Mode2D);
            view.Setup(db, hud);
            if (AudioDirector.Instance != null) AudioDirector.Instance.Spatial3D = mode == ViewMode.Mode3D;
            if (InputRouter.Instance != null) InputRouter.Instance.PauseRequested += OnPauseRequested;
            if (XRBridge.Instance != null) { XRBridge.Instance.OnInterrupted += OnXRInterrupted; XRBridge.Instance.OnVRChanged += OnVRChanged; }
            NewGame();
        }

        void OnDestroy()
        {
            if (InputRouter.Instance != null) InputRouter.Instance.PauseRequested -= OnPauseRequested;
            if (XRBridge.Instance != null) { XRBridge.Instance.OnInterrupted -= OnXRInterrupted; XRBridge.Instance.OnVRChanged -= OnVRChanged; }
            if (hud != null) Destroy(hud.gameObject);
            if (UIRoot.Instance != null) UIRoot.Instance.menu.Hide();
        }

        void NewGame()
        {
            view.Clear();
            if (AudioDirector.Instance != null) AudioDirector.Instance.StopAllSfx();
            var s = SaveService.Settings;
            var diff = Session.tutorial ? Difficulty.Practice : Session.difficulty;
            int start = diff == Difficulty.Practice && !Session.tutorial ? Session.startArea : 0;
            sim = new Sim(db.tuning, db.AreaList(), diff, s.Assist, start, (uint)(20260 + start));
            view.Begin(sim);
            scoreKey = SaveService.ScoreKey(mode, diff, s.Assist);
            hud.SetHigh(diff == Difficulty.Practice ? 0 : SaveService.HighScore(scoreKey));
            acc = 0; resultAt = -1; flow = Flow.Playing; newRecord = false; firstStepDone = false;
            tutorialStep = 0; tutorialT = 0; tutorialSeen.Clear();
            UIRoot.Instance.menu.Hide();
            if (InputRouter.Instance != null) InputRouter.Instance.ReleaseAll();
            if (AudioDirector.Instance != null) AudioDirector.Instance.PlayJingleThenBgm("jingle_start", "bgm_play");
            hud.Message($"AREA {sim.AreaIndex + 1}", sim.Area.profile.nameJa + (Session.tutorial ? "\n操作練習：移動 → 対空 → 対地 の順にためしてください" : ""), 3f);
        }

        bool VR => XRBridge.Instance != null && XRBridge.Instance.IsVR;

        void Update()
        {
            var input = InputRouter.Instance; var set = SaveService.Settings;
            if (mode == ViewMode.Mode2D) hud.Layout2D(db.tuning.fieldW / db.tuning.fieldH); else hud.LayoutFull();
            float dt = Mathf.Min(Time.unscaledDeltaTime, 0.1f);
            if (flow == Flow.Playing)
            {
                if (input != null && input.PausePressed()) { Pause("一時停止"); }
                else
                {
                    acc += dt;
                    float step = sim.Dt; int steps = 0;
                    while (acc >= step && steps < db.tuning.maxStepsPerFrame)
                    {
                        var f = input != null ? input.ReadGame(VR) : default;
                        view.Capture();
                        sim.Step(f);
                        firstStepDone = true;
                        foreach (var e in sim.Events) HandleEvent(e, f);
                        acc -= step; steps++;
                        if (Session.tutorial) TutorialTick(f, step);
                    }
                    if (steps >= db.tuning.maxStepsPerFrame) acc = 0;   // 停止復帰などで溜まった分は捨てる（一気に進めない）
                    if (resultAt > 0 && Time.unscaledTime >= resultAt) ShowResult();
                }
            }
            view.Render(flow == Flow.Playing ? acc / sim.Dt : 1f, flow == Flow.Playing ? dt : 0f);
            hud.Tick(sim, set, VR, input != null && input.TouchActive && flow == Flow.Playing, Session.tutorial);
            hud.ShowHelp(flow == Flow.Playing && !VR && !(input != null && input.TouchActive) ? "Z: 対空  X: 対地  Esc: 一時停止（設定で変更可）" : "");
        }

        void HandleEvent(in SimEvent e, InputFrame f)
        {
            view.OnEvent(e);
            var audio = AudioDirector.Instance;
            bool air = e.type == EvType.AirKill || e.type == EvType.AirFire || e.type == EvType.HeavyHit || e.type == EvType.ShardBlock || e.type == EvType.PlayerHit || e.type == EvType.EnemyFire;
            if (audio != null) audio.PlayEvent(e, view.WorldPos(e.x, e.y, air));
            if (Session.tutorial) tutorialSeen.Add(e.type);
            switch (e.type)
            {
                case EvType.Score: hud.Popup(e.value, view.HudNorm(e.x, e.y, false)); break;
                case EvType.AreaStart: if (firstStepDone && sim.Frame > 2) hud.Message($"AREA {e.value + 1}", db.areas[e.value].data.profile.nameJa, 2.5f); break;
                case EvType.LoopComplete: hud.Message($"{e.value} 周達成", "次の周回へ。敵の弾が少し速くなります", 3.5f); break;
                case EvType.FortressWarn: hud.Message("WARNING", "大型要塞 接近 — コアが開いた瞬間に対地攻撃", 3f); break;
                case EvType.FortressDestroyed: hud.Message("要塞撃破", "+" + e.value.ToString("N0"), 2.5f); break;
                case EvType.Extend: hud.Message("1UP", "残機が増えました", 2f); break;
                case EvType.BannerGet: hud.Message("1UP", "隠された旗を回収", 2f); break;
                case EvType.ObeliskReveal: hud.Message("", "地中から石柱が現れた — さらに爆撃で破壊", 2f); break;
                case EvType.PlayerHit:
                    if (XRBridge.Instance != null) { XRBridge.Instance.Pulse(true, 0.9f, 220); XRBridge.Instance.Pulse(false, 0.9f, 220); }
                    break;
                case EvType.Respawn: hud.Message("", "再出撃", 1.5f); if (InputRouter.Instance != null) InputRouter.Instance.ReleaseAll(); break;
                case EvType.GameOver: resultAt = Time.unscaledTime + 2.0f; break;
                case EvType.AirFire: if (VR && XRBridge.Instance != null) XRBridge.Instance.Pulse(!SaveService.Settings.leftHanded, 0.15f, 12); break;
                case EvType.GroundFire: if (VR && XRBridge.Instance != null) XRBridge.Instance.Pulse(SaveService.Settings.leftHanded, 0.3f, 25); break;
            }
        }

        // ---- 一時停止・中断 ----
        void OnPauseRequested(string why) { if (flow == Flow.Playing) Pause(why); }
        void OnXRInterrupted() { if (flow == Flow.Playing) Pause("VR が中断されました"); }
        void OnVRChanged(bool vr)
        {
            if (mode == ViewMode.Mode2D && vr) { Pause("VR は 3D モードで遊べます"); }
        }

        void Pause(string reason)
        {
            flow = Flow.Paused;
            if (AudioDirector.Instance != null) AudioDirector.Instance.PauseBgm(true);
            if (InputRouter.Instance != null) InputRouter.Instance.ReleaseAll();
            var p = new MenuPage { title = "一時停止", header = () => reason + "\n" + (InputRouter.Instance != null ? InputRouter.Instance.BindingSummary(VR) : ""), onCancel = Resume };
            p.Add(new MenuItem(() => "再開する", Resume));
            p.Add(new MenuItem(() => "設定", () => UIRoot.Instance.menu.Show(SettingsMenu.Build(VR, mode == ViewMode.Mode3D), true)));
            p.Add(new MenuItem(() => "視点: " + (SaveService.Settings.view3D == 0 ? "斜め見下ろし" : "コックピット"), null, d => { SaveService.Settings.view3D = 1 - SaveService.Settings.view3D; SaveService.SaveSettings(); }, () => mode == ViewMode.Mode3D));
            p.Add(new MenuItem(() => "視点リセット（今の向きを正面に）", () => Services.Instance.RecenterVR(), null, () => VR));
            p.Add(new MenuItem(() => "VR を終了する", () => XRBridge.Instance.ToggleVR(), null, () => VR));
            p.Add(new MenuItem(() => "最初からやり直す", NewGame));
            p.Add(new MenuItem(() => "タイトルへ戻る", ToTitle));
            UIRoot.Instance.menu.Show(p);
        }

        void Resume()
        {
            UIRoot.Instance.menu.Hide();
            if (AudioDirector.Instance != null) AudioDirector.Instance.PauseBgm(false);
            if (InputRouter.Instance != null) InputRouter.Instance.ReleaseAll();   // 押しっぱなしで突然動かない
            acc = 0; flow = Flow.Playing;
        }

        void ToTitle() { if (AudioDirector.Instance != null) AudioDirector.Instance.PlayBgm(null); Services.LoadScene("Title"); }

        // ---- 結果 ----
        void ShowResult()
        {
            resultAt = -1; flow = Flow.Result;
            bool record = sim.Diff != Difficulty.Practice && !Session.tutorial;
            if (record) newRecord = SaveService.Submit(scoreKey, sim.Score);
            int best = record ? SaveService.HighScore(scoreKey) : 0;
            var p = new MenuPage
            {
                title = Session.tutorial ? "操作練習 おわり" : "GAME OVER",
                header = () => $"SCORE {sim.Score:N0}\n到達: AREA {sim.AreaIndex + 1}" + (sim.Loop > 0 ? $"（{sim.Loop + 1} 周目）" : "") +
                               (record ? $"\nハイスコア {best:N0}" + (newRecord ? "  <color=#ffd040>記録更新！</color>" : "") : "\n（練習の得点は記録しません）") +
                               (SaveService.LastSaveFailed ? "\n※ この端末では記録を保存できませんでした" : ""),
                onCancel = ToTitle,
            };
            p.Add(new MenuItem(() => sim.Diff == Difficulty.Practice && !Session.tutorial ? $"同じエリア（{Session.startArea + 1}）に再挑戦" : "リトライ", NewGame));
            p.Add(new MenuItem(() => "タイトルへ戻る", ToTitle));
            UIRoot.Instance.menu.Show(p);
        }

        // ---- 操作練習（短いチュートリアル） ----
        void TutorialTick(InputFrame f, float dt)
        {
            tutorialT += dt;
            string[] steps = { "スティック / 矢印キーで移動してみよう", "対空（Z / 右ボタン / 右トリガー）で空の敵を撃つ", "対地（X / 左ボタン / 左トリガー）で照準の下の地上物を爆撃", "照準が金色に点滅したら、その下に何かが埋まっている" };
            bool done = tutorialStep == 0 ? (Mathf.Abs(f.mx) + Mathf.Abs(f.my) > 0.5f && tutorialT > 1.5f)
                      : tutorialStep == 1 ? tutorialSeen.Contains(EvType.AirKill)
                      : tutorialStep == 2 ? tutorialSeen.Contains(EvType.GroundKill) || tutorialSeen.Contains(EvType.ObeliskReveal)
                      : tutorialT > 8f;
            if (tutorialT < 0.02f || done)
            {
                if (done) { tutorialStep++; tutorialT = 0; }
                if (tutorialStep >= steps.Length) { resultAt = Time.unscaledTime + 0.5f; Session.tutorial = true; return; }
                hud.Message("操作練習 " + (tutorialStep + 1) + "/" + steps.Length, steps[tutorialStep], 99f);
            }
            if (tutorialSeen.Contains(EvType.PlayerHit)) tutorialSeen.Remove(EvType.PlayerHit);
            if (sim.Lives < 2) { /* 練習中は残機切れで止めない */ }
        }
    }
}
