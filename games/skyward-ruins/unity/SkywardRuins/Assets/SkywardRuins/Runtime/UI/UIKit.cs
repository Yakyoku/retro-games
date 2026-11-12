// UI の土台：画面用キャンバス（2D/通常 3D）と立体空間用キャンバス（VR）を持ち、同じメニューをどちらにも出す。
// メニューはマウス・タッチ（uGUI のボタン）、キーボード・ゲームパッド（選択移動）、VR（コントローラーのレイとトリガー）で操作できる。
using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

namespace SkywardRuins
{
    public static class UIF
    {
        public static readonly Color Panel = new Color(0.06f, 0.08f, 0.11f, 0.86f);
        public static readonly Color Row = new Color(0.16f, 0.19f, 0.25f, 0.95f);
        public static readonly Color RowSel = new Color(0.86f, 0.70f, 0.28f, 1f);
        public static readonly Color Ink = new Color(0.95f, 0.96f, 0.98f, 1f);
        public static readonly Color InkDim = new Color(0.72f, 0.76f, 0.82f, 1f);
        public static readonly Color Accent = new Color(1f, 0.82f, 0.35f, 1f);

        public static RectTransform Rect(string name, Transform parent, Vector2 anchorMin, Vector2 anchorMax, Vector2 offMin, Vector2 offMax)
        {
            var go = new GameObject(name, typeof(RectTransform)); go.layer = parent != null ? parent.gameObject.layer : 5;
            var rt = (RectTransform)go.transform; rt.SetParent(parent, false);
            rt.anchorMin = anchorMin; rt.anchorMax = anchorMax; rt.offsetMin = offMin; rt.offsetMax = offMax;
            return rt;
        }
        public static Image Img(Transform parent, Color c, string name = "Image")
        {
            var rt = Rect(name, parent, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
            var im = rt.gameObject.AddComponent<Image>(); im.color = c; im.raycastTarget = false;
            var db = GameDatabase.Instance; if (db != null && db.uiMaterial != null) im.material = db.uiMaterial;
            return im;
        }
        public static Text Txt(Transform parent, string s, int size, TextAnchor anchor, Color c, string name = "Text")
        {
            var rt = Rect(name, parent, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
            var t = rt.gameObject.AddComponent<Text>();
            var db = GameDatabase.Instance; t.font = db != null ? db.font : null;
            t.text = s; t.fontSize = size; t.alignment = anchor; t.color = c; t.raycastTarget = false;
            t.horizontalOverflow = HorizontalWrapMode.Wrap; t.verticalOverflow = VerticalWrapMode.Overflow;
            t.supportRichText = true; t.lineSpacing = 1.05f;
            return t;
        }
        public static Button Btn(Transform parent, string label, int size, Action onClick, string name = "Button")
        {
            var im = Img(parent, Row, name); im.raycastTarget = true;
            var b = im.gameObject.AddComponent<Button>(); b.targetGraphic = im; b.transition = Selectable.Transition.None;
            var nav = b.navigation; nav.mode = Navigation.Mode.None; b.navigation = nav;   // 選択移動は MenuView が行う
            b.onClick.AddListener(() => onClick?.Invoke());
            var t = Txt(im.transform, label, size, TextAnchor.MiddleCenter, Ink, "Label"); t.rectTransform.offsetMin = new Vector2(12, 0); t.rectTransform.offsetMax = new Vector2(-12, 0);
            return b;
        }
    }

    /// <summary>メニュー項目。adjust があれば左右（◀ ▶）で値を変える。</summary>
    public class MenuItem
    {
        public Func<string> label; public Action confirm; public Action<int> adjust; public Func<bool> visible;
        public MenuItem(Func<string> label, Action confirm = null, Action<int> adjust = null, Func<bool> visible = null) { this.label = label; this.confirm = confirm; this.adjust = adjust; this.visible = visible; }
    }
    public class MenuPage
    {
        public string title; public Func<string> header; public Func<string> footer; public List<MenuItem> items = new List<MenuItem>(); public Action onCancel;
        public MenuPage Add(MenuItem i) { items.Add(i); return this; }
    }

    public class UIRoot : MonoBehaviour
    {
        public Canvas screenCanvas, worldCanvas;   // ProjectBuilder が作る（world は VR 用、通常は非表示）
        public RectTransform screenLayer, worldLayer;
        public MenuView menu;
        public Transform vrAnchor;                  // VR のメニュー・HUD を置く位置（リグの子）
        public LineRenderer rayL, rayR;
        public bool InVR { get; private set; }
        RectTransform movable;                       // メニューなど、VR と画面で付け替えるもの

        public static UIRoot Instance { get; private set; }

        void Awake()
        {
            Instance = this;
            menu = gameObject.AddComponent<MenuView>();
            menu.Init(this);
            SetVR(false);
        }
        void Start() { if (XRBridge.Instance != null) XRBridge.Instance.OnVRChanged += SetVR; }   // XRBridge の Awake 後に購読
        void OnDestroy() { if (XRBridge.Instance != null) XRBridge.Instance.OnVRChanged -= SetVR; }

        /// <summary>VR の開始/終了で、メニューと HUD を立体空間のキャンバスへ付け替える。</summary>
        public void SetVR(bool vr)
        {
            InVR = vr;
            worldCanvas.gameObject.SetActive(vr);
            var layer = vr ? worldLayer : screenLayer;
            foreach (Transform child in new List<Transform>(Children(vr ? screenLayer : worldLayer))) child.SetParent(layer, false);
            if (rayL) rayL.enabled = vr; if (rayR) rayR.enabled = vr;
        }
        static IEnumerable<Transform> Children(Transform t) { foreach (Transform c in t) yield return c; }
        public RectTransform Layer => InVR ? worldLayer : screenLayer;

        void LateUpdate() { if (InVR) UpdatePointers(); }

        // ---- VR のレイ：コントローラーの向きに光線を出し、キャンバス面との交点でボタンを選ぶ ----
        void UpdatePointers()
        {
            var xr = XRBridge.Instance; if (xr == null) return;
            Ray(xr.Left, rayL); Ray(xr.Right, rayR);
        }
        void Ray(XRHand h, LineRenderer lr)
        {
            if (lr == null) return;
            if (!h.active || h.pose == null) { lr.enabled = false; return; }
            lr.enabled = true;
            var origin = h.pose.position; var dir = h.pose.forward;
            var plane = new Plane(-worldCanvas.transform.forward, worldCanvas.transform.position);
            float dist = 3f;
            if (plane.Raycast(new UnityEngine.Ray(origin, dir), out float d) && d < 6f)
            {
                dist = d; var hit = origin + dir * d;
                var b = menu.ButtonAt(hit);
                if (b != null) { menu.Hover(b); if (h.triggerDown) { b.onClick.Invoke(); XRBridge.Instance.Pulse(h.pose == XRBridge.Instance.rightHand, 0.3f, 25); } }
            }
            lr.SetPosition(0, origin); lr.SetPosition(1, origin + dir * dist);
        }
    }

    /// <summary>縦並びのメニュー。表示中は毎フレーム文言を更新し、選択行を強調する。</summary>
    public class MenuView : MonoBehaviour
    {
        UIRoot root; RectTransform panel; Text title, header, footer;
        class Row { public MenuItem item; public Button main, left, right; public Text label; public RectTransform rt; }
        readonly List<Row> rows = new List<Row>();
        MenuPage page; int sel; readonly Stack<(MenuPage, int)> history = new Stack<(MenuPage, int)>();
        public bool Visible => panel != null && panel.gameObject.activeSelf;
        public MenuPage Page => page;
        const float RowH = 56, Width = 660;

        public void Init(UIRoot r)
        {
            root = r;
            panel = UIF.Rect("Menu", r.screenLayer, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, Vector2.zero);
            panel.sizeDelta = new Vector2(Width + 40, 200);
            UIF.Img(panel, UIF.Panel, "Bg");
            title = UIF.Txt(panel, "", 40, TextAnchor.UpperCenter, UIF.Accent, "Title");
            header = UIF.Txt(panel, "", 24, TextAnchor.UpperCenter, UIF.InkDim, "Header");
            footer = UIF.Txt(panel, "", 22, TextAnchor.LowerCenter, UIF.InkDim, "Footer");
            panel.gameObject.SetActive(false);
        }

        public void Show(MenuPage p, bool push = false)
        {
            if (push && page != null) history.Push((page, sel)); else if (!push) history.Clear();
            page = p; sel = 0; Build(); panel.gameObject.SetActive(true);
        }
        public void Back()
        {
            if (history.Count > 0) { var (p, s) = history.Pop(); page = p; sel = s; Build(); }
            else page?.onCancel?.Invoke();
        }
        public void Hide() { if (panel != null) panel.gameObject.SetActive(false); page = null; history.Clear(); }

        void Build()
        {
            foreach (var r in rows) Destroy(r.rt.gameObject);
            rows.Clear();
            var visible = new List<MenuItem>(); foreach (var it in page.items) if (it.visible == null || it.visible()) visible.Add(it);
            float headH = string.IsNullOrEmpty(page.title) ? 20 : 70;
            float headerH = page.header != null ? 120 : 0;
            float footH = page.footer != null ? 90 : 20;
            float h = headH + headerH + visible.Count * (RowH + 8) + footH;
            panel.sizeDelta = new Vector2(Width + 40, h);
            Place(title.rectTransform, 10, 60); title.text = page.title ?? "";
            Place(header.rectTransform, headH, headerH); header.gameObject.SetActive(page.header != null);
            footer.rectTransform.anchorMin = new Vector2(0, 0); footer.rectTransform.anchorMax = new Vector2(1, 0);
            footer.rectTransform.offsetMin = new Vector2(20, 10); footer.rectTransform.offsetMax = new Vector2(-20, footH);
            footer.gameObject.SetActive(page.footer != null);
            float y = headH + headerH;
            for (int i = 0; i < visible.Count; i++)
            {
                var it = visible[i]; int idx = i;
                var row = new Row { item = it };
                row.rt = UIF.Rect("Row" + i, panel, new Vector2(0, 1), new Vector2(1, 1), new Vector2(20, -(y + RowH)), new Vector2(-20, -y));
                if (it.adjust != null)
                {
                    row.left = UIF.Btn(row.rt, "◀", 30, () => { sel = idx; it.adjust(-1); Click(); }, "Left"); Anchor(row.left, 0, 0, 0, 0.14f);
                    row.right = UIF.Btn(row.rt, "▶", 30, () => { sel = idx; it.adjust(1); Click(); }, "Right"); Anchor(row.right, 0.86f, 0, 1, 0);
                    row.main = UIF.Btn(row.rt, "", 28, () => { sel = idx; if (it.confirm != null) it.confirm(); else it.adjust(1); Click(); }, "Main"); Anchor(row.main, 0.155f, 0, 0.845f, 0);
                }
                else { row.main = UIF.Btn(row.rt, "", 28, () => { sel = idx; it.confirm?.Invoke(); Click(); }, "Main"); Anchor(row.main, 0, 0, 1, 0); }
                row.label = row.main.GetComponentInChildren<Text>();
                rows.Add(row);
                y += RowH + 8;
            }
            Refresh();
        }
        static void Place(RectTransform rt, float top, float height) { rt.anchorMin = new Vector2(0, 1); rt.anchorMax = new Vector2(1, 1); rt.offsetMin = new Vector2(24, -(top + height)); rt.offsetMax = new Vector2(-24, -top); }
        static void Anchor(Button b, float x0, float y0, float x1, float y1) { var rt = (RectTransform)b.transform; rt.anchorMin = new Vector2(x0, 0); rt.anchorMax = new Vector2(x1, 1); rt.offsetMin = Vector2.zero; rt.offsetMax = Vector2.zero; }
        static void Click() { if (AudioDirector.Instance != null) AudioDirector.Instance.Play("ui_select"); }

        void Refresh()
        {
            if (page == null) return;
            if (page.header != null) header.text = page.header();
            if (page.footer != null) footer.text = page.footer();
            for (int i = 0; i < rows.Count; i++)
            {
                var r = rows[i]; string s = r.item.label(); if (r.label.text != s) r.label.text = s;
                var c = i == sel ? UIF.RowSel : UIF.Row;
                r.main.targetGraphic.color = c; r.label.color = i == sel ? new Color(0.08f, 0.08f, 0.1f) : UIF.Ink;
                if (r.left) r.left.targetGraphic.color = c; if (r.right) r.right.targetGraphic.color = c;
            }
        }

        void Update()
        {
            if (!Visible || page == null) return;
            var input = InputRouter.Instance;
            if (input != null)
            {
                var k = input.ReadMenu(root.InVR);
                if (rows.Count > 0)
                {
                    if (k == MenuKey.Up) { sel = (sel + rows.Count - 1) % rows.Count; Move(); }
                    if (k == MenuKey.Down) { sel = (sel + 1) % rows.Count; Move(); }
                    var it = rows[Mathf.Clamp(sel, 0, rows.Count - 1)].item;
                    if (k == MenuKey.Left && it.adjust != null) { it.adjust(-1); Move(); }
                    if (k == MenuKey.Right && it.adjust != null) { it.adjust(1); Move(); }
                    if (k == MenuKey.Confirm) { if (it.confirm != null) it.confirm(); else it.adjust?.Invoke(1); Click(); }
                }
                if (k == MenuKey.Cancel) { Back(); Click(); }
            }
            if (page != null && rows.Count > 0 && page.items != null) Refresh();
        }
        static void Move() { if (AudioDirector.Instance != null) AudioDirector.Instance.Play("ui_move"); }

        /// <summary>VR のレイの当たった位置にあるボタン。</summary>
        public Button ButtonAt(Vector3 world)
        {
            foreach (var r in rows)
                foreach (var b in new[] { r.left, r.right, r.main })
                {
                    if (b == null || !b.gameObject.activeInHierarchy) continue;
                    var rt = (RectTransform)b.transform; Vector2 lp = rt.InverseTransformPoint(world);
                    if (rt.rect.Contains(lp)) return b;
                }
            return null;
        }
        public void Hover(Button b) { for (int i = 0; i < rows.Count; i++) if (rows[i].main == b || rows[i].left == b || rows[i].right == b) { if (sel != i) { sel = i; Move(); } } }

        /// <summary>メニューを画面のどこに置くか（タイトルでは下寄せ）。</summary>
        public void SetAnchorY(float y) { panel.anchorMin = panel.anchorMax = new Vector2(0.5f, y); panel.pivot = new Vector2(0.5f, y); }
    }
}
