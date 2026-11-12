// HUD：得点・ハイスコア・残機・エリア・武器状態・警告・得点表示・タッチボタン・VR の補助レーダー。
// 2D ではゲーム画面の外側の余白（横長なら左右、縦長なら上下）に置き、ゲーム画面の可視範囲を変えない。
using System.Collections.Generic;
using SkywardRuins.Core;
using UnityEngine;
using UnityEngine.UI;

namespace SkywardRuins
{
    public class Hud : MonoBehaviour
    {
        RectTransform root, gameRect, touchRoot, radar;
        Text score, hi, lives, area, weapons, message, sub, bindHelp;
        Image airBtn, gndBtn, stickBase, stickKnob, airFill, gndFill;
        readonly List<(Text t, float until, Vector2 at)> popups = new List<(Text, float, Vector2)>();
        readonly List<Image> radarDots = new List<Image>();
        float msgUntil; int hiScore;
        public RectTransform GameRect => gameRect;
        public RawImage gameImage;   // 2D の描画結果

        public static Hud Create(Transform parent, bool with2DView)
        {
            var rt = UIF.Rect("Hud", parent, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
            var h = rt.gameObject.AddComponent<Hud>(); h.root = rt; h.Build(with2DView); return h;
        }

        void Build(bool with2D)
        {
            gameRect = UIF.Rect("GameRect", root, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, Vector2.zero);
            if (with2D)
            {
                var gi = UIF.Rect("GameImage", gameRect, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
                gameImage = gi.gameObject.AddComponent<RawImage>(); gameImage.raycastTarget = false;
            }
            var top = UIF.Rect("Top", gameRect, new Vector2(0, 1), new Vector2(1, 1), new Vector2(0, -64), new Vector2(0, 0));
            score = UIF.Txt(top, "", 26, TextAnchor.UpperLeft, UIF.Ink, "Score"); Pad(score, 10, 6);
            hi = UIF.Txt(top, "", 22, TextAnchor.UpperCenter, UIF.Accent, "Hi"); Pad(hi, 10, 8);
            area = UIF.Txt(top, "", 22, TextAnchor.UpperRight, UIF.Ink, "Area"); Pad(area, 10, 8);
            var bottom = UIF.Rect("Bottom", gameRect, new Vector2(0, 0), new Vector2(1, 0), new Vector2(0, 0), new Vector2(0, 56));
            lives = UIF.Txt(bottom, "", 24, TextAnchor.LowerLeft, UIF.Ink, "Lives"); Pad(lives, 10, 8);
            weapons = UIF.Txt(bottom, "", 20, TextAnchor.LowerRight, UIF.InkDim, "Weapons"); Pad(weapons, 10, 10);
            message = UIF.Txt(gameRect, "", 40, TextAnchor.MiddleCenter, UIF.Accent, "Message");
            message.rectTransform.anchorMin = new Vector2(0, 0.55f); message.rectTransform.anchorMax = new Vector2(1, 0.7f);
            sub = UIF.Txt(gameRect, "", 24, TextAnchor.UpperCenter, UIF.Ink, "Sub");
            sub.rectTransform.anchorMin = new Vector2(0.05f, 0.40f); sub.rectTransform.anchorMax = new Vector2(0.95f, 0.55f);
            foreach (var t in new[] { score, hi, area, lives, weapons, message, sub }) { var sh = t.gameObject.AddComponent<Shadow>(); sh.effectDistance = new Vector2(2, -2); sh.effectColor = new Color(0, 0, 0, 0.85f); }
            bindHelp = UIF.Txt(root, "", 18, TextAnchor.LowerCenter, UIF.InkDim, "Help"); bindHelp.rectTransform.offsetMin = new Vector2(10, 6); bindHelp.rectTransform.offsetMax = new Vector2(-10, -6);

            // タッチ操作の見た目（判定は InputRouter と同じ TouchLayout を使う）
            touchRoot = UIF.Rect("Touch", root, Vector2.zero, Vector2.zero, Vector2.zero, Vector2.zero);
            touchRoot.pivot = Vector2.zero;
            stickBase = Circle(touchRoot, new Color(1, 1, 1, 0.12f)); stickKnob = Circle(touchRoot, new Color(1, 1, 1, 0.35f));
            airBtn = Circle(touchRoot, new Color(0.35f, 0.85f, 1f, 0.30f)); gndBtn = Circle(touchRoot, new Color(1f, 0.65f, 0.25f, 0.30f));
            airFill = Circle(airBtn.transform, new Color(0.35f, 0.85f, 1f, 0.55f)); gndFill = Circle(gndBtn.transform, new Color(1f, 0.65f, 0.25f, 0.55f));
            var la = UIF.Txt(airBtn.transform, "対空", 30, TextAnchor.MiddleCenter, UIF.Ink, "L"); la.gameObject.AddComponent<Shadow>();
            var lg = UIF.Txt(gndBtn.transform, "対地", 30, TextAnchor.MiddleCenter, UIF.Ink, "L"); lg.gameObject.AddComponent<Shadow>();

            radar = UIF.Rect("Radar", gameRect, new Vector2(0, 1), new Vector2(1, 1), new Vector2(0, -8), new Vector2(0, 0));
            UIF.Img(radar, new Color(0, 0, 0, 0.35f), "Bar");
            for (int i = 0; i < 16; i++) { var d = UIF.Img(radar, new Color(1f, 0.4f, 0.3f, 0.9f), "Dot"); d.rectTransform.anchorMin = d.rectTransform.anchorMax = new Vector2(0, 0.5f); d.rectTransform.sizeDelta = new Vector2(10, 8); radarDots.Add(d); }
        }

        static Image Circle(Transform p, Color c)
        {
            var im = UIF.Img(p, c, "Circle"); var db = GameDatabase.Instance;
            if (db != null && db.softCircle != null) im.sprite = Sprite.Create(db.softCircle, new Rect(0, 0, db.softCircle.width, db.softCircle.height), new Vector2(0.5f, 0.5f));
            im.rectTransform.anchorMin = im.rectTransform.anchorMax = new Vector2(0.5f, 0.5f);
            return im;
        }
        static void Pad(Text t, float x, float y) { t.rectTransform.offsetMin = new Vector2(x, y); t.rectTransform.offsetMax = new Vector2(-x, -y); }

        public void SetHigh(int v) { hiScore = v; }

        /// <summary>2D のゲーム画面の位置：論理画面の縦横比を保って safe-area 内に最大で置く（余白で画面形状の差を吸収）。</summary>
        public void Layout2D(float aspect)
        {
            var canvas = GetComponentInParent<Canvas>(); if (canvas == null) return;
            var cr = ((RectTransform)canvas.transform).rect; var safe = Screen.safeArea; float sx = cr.width / Mathf.Max(1, Screen.width), sy = cr.height / Mathf.Max(1, Screen.height);
            float x0 = safe.xMin * sx, y0 = safe.yMin * sy, w = safe.width * sx, h = safe.height * sy;
            bool touch = InputRouter.Instance != null && InputRouter.Instance.TouchActive;
            float reserve = touch && w < h ? h * 0.22f : 0f;   // 縦持ちのタッチでは下にボタン用の帯を空ける
            float gh = h - reserve, gw = gh * aspect;
            if (gw > w) { gw = w; gh = gw / aspect; }
            gameRect.anchorMin = gameRect.anchorMax = new Vector2(0, 0); gameRect.pivot = new Vector2(0.5f, 0.5f);
            gameRect.sizeDelta = new Vector2(gw, gh);
            gameRect.anchoredPosition = new Vector2(x0 + w / 2, y0 + reserve + (h - reserve) / 2);
        }
        /// <summary>3D / VR では HUD を全面に。</summary>
        public void LayoutFull() { gameRect.anchorMin = Vector2.zero; gameRect.anchorMax = Vector2.one; gameRect.offsetMin = gameRect.offsetMax = Vector2.zero; gameRect.sizeDelta = Vector2.zero; gameRect.anchoredPosition = Vector2.zero; }

        public void Message(string m, string s = "", float seconds = 2.5f) { message.text = m; sub.text = s; msgUntil = Time.unscaledTime + seconds; }

        public void Popup(int pts, Vector2 normPos)
        {
            var t = UIF.Txt(gameRect, pts.ToString(), pts >= 1000 ? 30 : 22, TextAnchor.MiddleCenter, pts >= 1000 ? UIF.Accent : UIF.Ink, "Pop");
            t.gameObject.AddComponent<Shadow>().effectColor = Color.black;
            var rt = t.rectTransform; rt.anchorMin = rt.anchorMax = normPos; rt.sizeDelta = new Vector2(160, 40);
            popups.Add((t, Time.unscaledTime + 0.9f, normPos));
        }

        public void Tick(Sim sim, Settings s, bool vr, bool showTouch, bool tutorial)
        {
            if (sim == null) return;
            int hs = Mathf.Max(hiScore, sim.Score);
            score.text = $"SCORE {sim.Score:N0}";
            hi.text = tutorial ? "操作練習" : (Session.difficulty == Difficulty.Practice ? "練習（記録なし）" : $"HI {hs:N0}");
            area.text = $"AREA {sim.AreaIndex + 1}/16" + (sim.Loop > 0 ? $"  周回 {sim.Loop + 1}" : "") + $"\n<size=18>{sim.Area.profile.nameJa}</size>";
            lives.text = "残機 " + new string('▲', Mathf.Clamp(sim.Lives, 0, 9)) + (sim.Lives > 9 ? $"×{sim.Lives}" : "");
            string air = sim.AirCooldown <= 0 ? "対空 ●" : "対空 ○", gnd = sim.GroundCooldown <= 0 ? "対地 ●" : "対地 ○";
            string assist = (s.autoAir ? " 自動連射" : "") + (s.holdAutoBomb ? " 長押し爆撃" : "");
            weapons.text = air + "  " + gnd + (sim.SightHint ? "  <color=#ffd040>照準反応</color>" : "") + "<size=16>" + assist + "</size>";
            if (Time.unscaledTime > msgUntil) { message.text = ""; sub.text = ""; }
            for (int i = popups.Count - 1; i >= 0; i--)
            {
                var p = popups[i]; float left = p.until - Time.unscaledTime;
                if (left <= 0) { Destroy(p.t.gameObject); popups.RemoveAt(i); continue; }
                p.t.rectTransform.anchorMin = p.t.rectTransform.anchorMax = p.at + new Vector2(0, (0.9f - left) * 0.03f);
                var c = p.t.color; c.a = Mathf.Clamp01(left * 3); p.t.color = c;
            }
            // タッチ UI
            var inp = InputRouter.Instance;
            touchRoot.gameObject.SetActive(showTouch && !vr);
            if (showTouch && !vr && inp != null)
            {
                var canvas = GetComponentInParent<Canvas>(); float k = canvas != null ? ((RectTransform)canvas.transform).rect.width / Mathf.Max(1, Screen.width) : 1f;
                float r = TouchLayout.ButtonRadius * k;
                Place(airBtn, TouchLayout.AirButton * k, r * 2); Place(gndBtn, TouchLayout.GroundButton * k, r * 2);
                airFill.rectTransform.sizeDelta = Vector2.one * r * 2 * (inp.TouchAir ? 1f : 0.6f);
                gndFill.rectTransform.sizeDelta = Vector2.one * r * 2 * (inp.TouchGround ? 1f : 0.6f);
                stickBase.gameObject.SetActive(inp.StickHeld); stickKnob.gameObject.SetActive(inp.StickHeld);
                if (inp.StickHeld) { Place(stickBase, inp.StickOrigin * k, TouchLayout.Unit * 1.8f * k); var d = Vector2.ClampMagnitude(inp.StickPos - inp.StickOrigin, TouchLayout.Unit * 0.9f); Place(stickKnob, (inp.StickOrigin + d) * k, TouchLayout.Unit * 0.9f * k); }
            }
            // 補助レーダー：画面上端の外から来る空中敵の横位置
            radar.gameObject.SetActive(vr && s.radar);
            if (vr && s.radar)
            {
                int n = 0;
                foreach (var a in sim.Air) { if (n >= radarDots.Count) break; if (a.pos.y < sim.T.fieldH - 20) continue; var d = radarDots[n++]; d.gameObject.SetActive(true); d.rectTransform.anchorMin = d.rectTransform.anchorMax = new Vector2(Mathf.Clamp01(a.pos.x / sim.T.fieldW), 0.5f); }
                for (; n < radarDots.Count; n++) radarDots[n].gameObject.SetActive(false);
            }
        }
        static void Place(Image im, Vector2 canvasPos, float size) { var rt = im.rectTransform; rt.anchorMin = rt.anchorMax = Vector2.zero; rt.anchoredPosition = canvasPos; rt.sizeDelta = new Vector2(size, size); }

        public void ShowHelp(string s) { bindHelp.text = s; }
    }
}
