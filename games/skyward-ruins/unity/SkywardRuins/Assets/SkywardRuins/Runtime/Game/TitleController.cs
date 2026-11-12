// タイトル：作品名・制作注記（常時表示）・モード／難易度／練習エリア・設定・ハイスコア・VR 開始。
// 背景は 3D 盤面でボットが遊ぶデモ（音なし）。VR 中はメニューと注記を立体空間のキャンバスに出す。
using SkywardRuins.Core;
using UnityEngine;
using UnityEngine.UI;

namespace SkywardRuins
{
    public class TitleController : MonoBehaviour
    {
        GameDatabase db; View3D demo; Sim demoSim; float acc; RectTransform titleRoot; Text notice, vrStatus;
        Rng botRng = new Rng(11);
        static Settings S => SaveService.Settings;
        bool VR => XRBridge.Instance != null && XRBridge.Instance.IsVR;

        void Start()
        {
            Services.EnsureBooted();
            db = GameDatabase.Instance;
            demo = GetComponent<View3D>();
            if (demo != null) { demo.Attract = true; demo.Setup(db, null); NewDemo(); }
            BuildTitle();
            ShowMain();
            if (AudioDirector.Instance != null) { AudioDirector.Instance.Spatial3D = false; AudioDirector.Instance.PlayBgm(null); }
            if (XRBridge.Instance != null) XRBridge.Instance.OnVRChanged += OnVR;
        }
        void OnDestroy()
        {
            if (XRBridge.Instance != null) XRBridge.Instance.OnVRChanged -= OnVR;
            if (titleRoot != null) Destroy(titleRoot.gameObject);
            if (UIRoot.Instance != null) UIRoot.Instance.menu.Hide();
        }
        void OnVR(bool vr) { ShowMain(); }

        void NewDemo() { demoSim = new Sim(db.tuning, db.AreaList(), Difficulty.Easy, new AssistSettings { autoAir = true }, 0, 4242); demo.Begin(demoSim); }

        void BuildTitle()
        {
            var layer = UIRoot.Instance.Layer;
            titleRoot = UIF.Rect("TitleHeader", layer, new Vector2(0, 0.66f), new Vector2(1, 1), Vector2.zero, Vector2.zero);
            var logo = UIF.Txt(titleRoot, "SKYWARD RUINS", 72, TextAnchor.MiddleCenter, new Color(0.95f, 0.96f, 1f), "Logo");
            logo.rectTransform.anchorMin = new Vector2(0, 0.42f); logo.fontStyle = FontStyle.Bold;
            var sh = logo.gameObject.AddComponent<Outline>(); sh.effectColor = new Color(0.1f, 0.15f, 0.25f, 0.9f); sh.effectDistance = new Vector2(3, -3);
            var sub = UIF.Txt(titleRoot, "空の遺跡 — 対空と対地を撃ち分ける縦スクロール・シューティング", 24, TextAnchor.UpperCenter, UIF.Accent, "Sub");
            sub.rectTransform.anchorMax = new Vector2(1, 0.42f); sub.rectTransform.offsetMin = new Vector2(20, 0); sub.rectTransform.offsetMax = new Vector2(-20, 0);
            sub.gameObject.AddComponent<Shadow>().effectColor = Color.black;
            // 制作注記：ゲーム開始前に常時読める位置（作品名の下）。十分な大きさとコントラスト、折り返しで欠けない
            var noteBg = UIF.Rect("NoticeBox", titleRoot, new Vector2(0.03f, 0f), new Vector2(0.97f, 0.20f), Vector2.zero, Vector2.zero);
            UIF.Img(noteBg, new Color(0, 0, 0, 0.62f), "Bg");
            notice = UIF.Txt(noteBg, Services.Notice, 26, TextAnchor.MiddleCenter, Color.white, "Notice");
            notice.resizeTextForBestFit = true; notice.resizeTextMinSize = 18; notice.resizeTextMaxSize = 28;
            notice.rectTransform.offsetMin = new Vector2(12, 4); notice.rectTransform.offsetMax = new Vector2(-12, -4);
            vrStatus = UIF.Txt(layer, "", 20, TextAnchor.LowerCenter, UIF.InkDim, "VrStatus");
            vrStatus.rectTransform.anchorMax = new Vector2(1, 0.06f); vrStatus.transform.SetParent(titleRoot.parent, false);
        }

        static readonly string[] DiffNames = { "標準（3 機）", "やさしい（5 機・敵弾 70%）", "練習（エリア選択・記録なし）" };

        void ShowMain()
        {
            var menu = UIRoot.Instance.menu;
            menu.SetAnchorY(0.36f);
            var p = new MenuPage { title = "" };
            p.Add(new MenuItem(() => "2D アーケードで遊ぶ", () => StartGame(ViewMode.Mode2D, false), null, () => !VR));
            p.Add(new MenuItem(() => VR ? "VR で遊ぶ（3D）" : "3D で遊ぶ", () => StartGame(ViewMode.Mode3D, false)));
            p.Add(new MenuItem(() => "難易度  " + DiffNames[S.difficulty], () => Cycle(1), Cycle));
            p.Add(new MenuItem(() => $"練習エリア  {S.practiceArea + 1}：{db.areas[S.practiceArea].data.profile.nameJa}", null, d => { S.practiceArea = (S.practiceArea + d + 16) % 16; SaveService.SaveSettings(); }, () => S.difficulty == 2));
            p.Add(new MenuItem(() => "操作練習（短い）", () => StartGame(S.lastMode == 1 || VR ? ViewMode.Mode3D : ViewMode.Mode2D, true)));
            p.Add(new MenuItem(() => "VR を開始（Quest のブラウザ等）", EnterVR, null, () => !VR));
            p.Add(new MenuItem(() => "設定", () => menu.Show(SettingsMenu.Build(VR, true), true)));
            p.Add(new MenuItem(() => "ハイスコア", () => menu.Show(Scores(), true)));
            menu.Show(p);
        }

        void Cycle(int d) { S.difficulty = (S.difficulty + d + 3) % 3; SaveService.SaveSettings(); }

        void EnterVR()
        {
            if (XRBridge.Instance == null || !XRBridge.Instance.ToggleVR())
                vrStatus.text = "VR を開始できません：" + (XRBridge.Instance != null ? XRBridge.Instance.LastError : "XR 未初期化") + "（通常の 3D で遊べます）";
            else vrStatus.text = "VR を開始しています…";
        }

        MenuPage Scores()
        {
            var p = new MenuPage { title = "ハイスコア", onCancel = () => UIRoot.Instance.menu.Back() };
            p.header = () =>
            {
                var sb = new System.Text.StringBuilder();
                foreach (var (k, s) in SaveService.AllScores()) sb.AppendLine($"{Label(k)}  {s:N0}");
                return sb.Length == 0 ? "まだ記録がありません" : sb.ToString();
            };
            p.Add(new MenuItem(() => "もどる", () => UIRoot.Instance.menu.Back()));
            return p;
        }
        static string Label(string key)
        {
            var parts = key.Split('/');
            string d = parts.Length > 1 ? (parts[1] == "Standard" ? "標準" : parts[1] == "Easy" ? "やさしい" : parts[1]) : "";
            string a = parts.Length > 2 && parts[2] != "--" ? "（支援 " + parts[2].Replace("-", "") + "）" : "";
            return parts[0] + " " + d + a;
        }

        void StartGame(ViewMode m, bool tutorial)
        {
            Session.mode = m; Session.tutorial = tutorial; Session.difficulty = (Difficulty)S.difficulty; Session.startArea = S.practiceArea;
            S.lastMode = (int)m; SaveService.SaveSettings();
            Services.LoadScene(m == ViewMode.Mode2D ? "Game2D" : "Game3D");
        }

        void Update()
        {
            if (demo == null || demoSim == null) return;
            float dt = Mathf.Min(Time.unscaledDeltaTime, 0.1f); acc += dt; int n = 0;
            while (acc >= demoSim.Dt && n < 4)
            {
                demo.Capture(); demoSim.Bullets.Clear(); demoSim.Step(Bot()); foreach (var e in demoSim.Events) demo.OnEvent(e);
                acc -= demoSim.Dt; n++;
                if (demoSim.State != SimState.Playing || demoSim.AreaIndex > 0) NewDemo();
            }
            if (n >= 4) acc = 0;
            demo.Render(acc / demoSim.Dt, dt);
            if (titleRoot != null && titleRoot.parent != UIRoot.Instance.Layer) { titleRoot.SetParent(UIRoot.Instance.Layer, false); vrStatus.transform.SetParent(UIRoot.Instance.Layer, false); }
        }

        InputFrame Bot()
        {
            // デモ用：近い空中敵の下へ寄り、地上目標が照準に入ったら爆撃
            float tx = demoSim.Player.x; float best = 999;
            foreach (var a in demoSim.Air) if (a.kind != SpawnKind.Shard && a.pos.y > demoSim.Player.y && a.pos.y < best) { best = a.pos.y; tx = a.pos.x; }
            float mx = Mathf.Clamp((tx - demoSim.Player.x) / 20f, -1, 1) + Mathf.Sin(Time.time * 0.7f) * 0.2f;
            float my = Mathf.Clamp((50 - demoSim.Player.y) / 30f, -1, 1);
            foreach (var a in demoSim.Air) { var d = new Vector2(demoSim.Player.x - a.pos.x, demoSim.Player.y - a.pos.y); if (d.magnitude < 30) { mx += Mathf.Sign(d.x) * 0.8f; } }
            return new InputFrame { mx = Mathf.Clamp(mx, -1, 1), my = my, air = true, ground = (demoSim.SightLock || demoSim.SightHint) && demoSim.Frame % 6 < 3 };
        }
    }
}
