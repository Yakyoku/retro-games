// 入力の集約：キーボード（再割当可）・ゲームパッド・タッチ（複数指）・Quest のコントローラーを 1 つの InputFrame にまとめる。
// 機器の切断・フォーカス喪失・タッチのキャンセル・XR の中断では入力を解除して PauseRequested を出す。
using System;
using System.Collections.Generic;
using SkywardRuins.Core;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.EnhancedTouch;
using ETouch = UnityEngine.InputSystem.EnhancedTouch.Touch;
using TouchPhase = UnityEngine.InputSystem.TouchPhase;

namespace SkywardRuins
{
    public enum MenuKey { None, Up, Down, Left, Right, Confirm, Cancel }

    /// <summary>タッチ操作の配置（safe-area の内側。左に移動、右に対空・対地の独立した大きなボタン）。</summary>
    public static class TouchLayout
    {
        public static Rect Safe => Screen.safeArea;
        public static float Unit => Mathf.Clamp(Mathf.Min(Safe.width, Safe.height) / 6.5f, 56f, 150f);  // 端末の大きさに合わせたボタン半径
        public static Vector2 AirButton => new Vector2(Safe.xMax - Unit * 1.25f, Safe.yMin + Unit * 2.75f);
        public static Vector2 GroundButton => new Vector2(Safe.xMax - Unit * 2.65f, Safe.yMin + Unit * 1.35f);
        public static float ButtonRadius => Unit * 0.95f;
        public static bool InMoveZone(Vector2 p) => p.x < Safe.xMin + Safe.width * 0.55f && p.y < Safe.yMin + Safe.height * 0.85f;
    }

    public class InputRouter : MonoBehaviour
    {
        public static InputRouter Instance { get; private set; }
        public event Action<string> PauseRequested;    // 理由つき
        public bool TouchActive { get; private set; }  // 最後の入力がタッチなら true（タッチ UI を出す）
        public bool UsingGamepad { get; private set; }

        // タッチの状態（HUD がスティックの位置を描くのに使う）
        public Vector2 StickOrigin { get; private set; }
        public Vector2 StickPos { get; private set; }
        public bool StickHeld { get; private set; }
        public bool TouchAir { get; private set; }
        public bool TouchGround { get; private set; }

        readonly Dictionary<int, int> fingerRole = new Dictionary<int, int>(); // touchId → 0 移動 1 対空 2 対地
        bool blockUntilRelease;
        float lastNavTime; MenuKey lastNav;
        Key[] keys = new Key[11];
        public bool WaitingRebind => rebindIndex >= 0;
        int rebindIndex = -1; Action<string> rebindDone;

        void Awake()
        {
            if (Instance != null && Instance != this) { Destroy(gameObject); return; }
            Instance = this;
            EnhancedTouchSupport.Enable();
            LoadKeys();
            InputSystem.onDeviceChange += OnDeviceChange;
            Application.focusChanged += OnFocus;
        }

        void OnDestroy()
        {
            InputSystem.onDeviceChange -= OnDeviceChange;
            Application.focusChanged -= OnFocus;
            if (Instance == this) Instance = null;
        }

        public void LoadKeys()
        {
            var names = SaveService.Settings.keys; var def = Settings.KeyDefaults();
            for (int i = 0; i < keys.Length; i++)
            {
                if (!Enum.TryParse(i < names.Length ? names[i] : def[i], out Key k)) Enum.TryParse(def[i], out k);
                keys[i] = k;
            }
        }

        public static readonly string[] KeyActionNames = { "上", "下", "左", "右", "対空", "対地", "一時停止", "上(2)", "下(2)", "左(2)", "右(2)" };
        public string KeyName(int i) => keys[i].ToString();

        /// <summary>キーの再割当：次に押されたキーを i 番目の操作に割り当てる。</summary>
        public void BeginRebind(int i, Action<string> done) { rebindIndex = i; rebindDone = done; blockUntilRelease = true; }

        void OnDeviceChange(InputDevice d, InputDeviceChange c)
        {
            if (c == InputDeviceChange.Removed || c == InputDeviceChange.Disconnected)
            {
                ReleaseAll();
                PauseRequested?.Invoke(d is Gamepad ? "ゲームパッドが切断されました" : "入力機器が切断されました");
            }
        }
        void OnFocus(bool focus) { if (!focus) { ReleaseAll(); PauseRequested?.Invoke("ウィンドウのフォーカスが外れました"); } }

        /// <summary>押しっぱなし状態を解除する（再開直後に勝手に動いたり撃ったりしない）。</summary>
        public void ReleaseAll() { fingerRole.Clear(); StickHeld = TouchAir = TouchGround = false; blockUntilRelease = true; }

        void Update()
        {
            if (rebindIndex >= 0 && Keyboard.current != null)
            {
                foreach (var kc in Keyboard.current.allKeys)
                {
                    if (kc == null || !kc.wasPressedThisFrame) continue;
                    keys[rebindIndex] = kc.keyCode;
                    SaveService.Settings.keys[rebindIndex] = kc.keyCode.ToString();
                    SaveService.SaveSettings();
                    var cb = rebindDone; rebindIndex = -1; rebindDone = null; cb?.Invoke(kc.keyCode.ToString());
                    break;
                }
            }
            UpdateTouch();
        }

        void UpdateTouch()
        {
            var touches = ETouch.activeTouches;
            if (touches.Count > 0) TouchActive = true;
            bool air = false, ground = false, stick = false;
            var seen = new HashSet<int>();
            foreach (var t in touches)
            {
                int id = t.touchId; seen.Add(id);
                Vector2 p = t.screenPosition;
                if (t.phase == TouchPhase.Canceled) { fingerRole.Remove(id); continue; }  // キャンセルは解除
                if (t.phase == TouchPhase.Ended) { fingerRole.Remove(id); continue; }
                if (!fingerRole.TryGetValue(id, out int role))
                {
                    if (t.phase != TouchPhase.Began) continue;
                    if (Vector2.Distance(p, TouchLayout.AirButton) < TouchLayout.ButtonRadius * 1.15f) role = 1;
                    else if (Vector2.Distance(p, TouchLayout.GroundButton) < TouchLayout.ButtonRadius * 1.15f) role = 2;
                    else if (TouchLayout.InMoveZone(p)) { role = 0; StickOrigin = p; }
                    else continue;
                    fingerRole[id] = role;
                }
                if (role == 0) { stick = true; StickPos = p; }
                if (role == 1) air = true;
                if (role == 2) ground = true;
            }
            // 消えた指（ブラウザ側のキャンセル等）を掃除
            var gone = new List<int>(); foreach (var k in fingerRole.Keys) if (!seen.Contains(k)) gone.Add(k); foreach (var k in gone) fingerRole.Remove(k);
            StickHeld = stick; TouchAir = air; TouchGround = ground;
        }

        bool K(int i) => Keyboard.current != null && keys[i] != Key.None && Keyboard.current[keys[i]].isPressed;
        bool KDown(int i) => Keyboard.current != null && keys[i] != Key.None && Keyboard.current[keys[i]].wasPressedThisFrame;

        /// <summary>ゲーム入力（1 フレーム分）。vr=true のときは Quest のコントローラーも読む。</summary>
        public InputFrame ReadGame(bool vr)
        {
            var f = new InputFrame();
            float mx = 0, my = 0;
            if (K(0) || K(7)) my += 1; if (K(1) || K(8)) my -= 1; if (K(3) || K(10)) mx += 1; if (K(2) || K(9)) mx -= 1;
            bool air = K(4), ground = K(5);
            var gp = Gamepad.current;
            if (gp != null)
            {
                Vector2 s = gp.leftStick.ReadValue(); if (s.magnitude < 0.2f) s = Vector2.zero;
                Vector2 dp = gp.dpad.ReadValue();
                if (s != Vector2.zero || dp != Vector2.zero || gp.buttonSouth.isPressed || gp.buttonWest.isPressed) { UsingGamepad = true; TouchActive = false; }
                mx += s.x + dp.x; my += s.y + dp.y;
                bool south = gp.buttonSouth.isPressed, west = gp.buttonWest.isPressed;
                if (SaveService.Settings.swapPadButtons) { air |= west; ground |= south; } else { air |= south; ground |= west; }
                air |= gp.rightTrigger.isPressed; ground |= gp.leftTrigger.isPressed;
            }
            if (StickHeld)
            {
                Vector2 d = (StickPos - StickOrigin) / (TouchLayout.Unit * 0.9f);
                if (d.magnitude > 1f) d.Normalize();
                if (d.magnitude < 0.12f) d = Vector2.zero;
                mx += d.x; my += d.y;
            }
            air |= TouchAir; ground |= TouchGround;
            if (vr && XRBridge.Instance != null)
            {
                bool lh = SaveService.Settings.leftHanded;
                var moveHand = lh ? XRBridge.Instance.Right : XRBridge.Instance.Left;   // 標準：左スティックで移動
                var airHand = lh ? XRBridge.Instance.Left : XRBridge.Instance.Right;    // 標準：右トリガーで対空
                var gndHand = lh ? XRBridge.Instance.Right : XRBridge.Instance.Left;    // 標準：左トリガーで対地
                Vector2 s = moveHand.stick; if (s.magnitude < 0.15f) s = Vector2.zero;
                mx += s.x; my += s.y;
                air |= airHand.trigger; ground |= gndHand.trigger;
            }
            if (blockUntilRelease)
            {
                // 再開直後は、いったん全て離すまで入力を無視する
                if (Mathf.Abs(mx) < 0.05f && Mathf.Abs(my) < 0.05f && !air && !ground) blockUntilRelease = false;
                return f;
            }
            f.mx = Mathf.Clamp(mx, -1, 1); f.my = Mathf.Clamp(my, -1, 1); f.air = air; f.ground = ground;
            return f;
        }

        public bool PausePressed()
        {
            if (rebindIndex >= 0) return false;
            if (KDown(6)) return true;
            var gp = Gamepad.current; if (gp != null && gp.startButton.wasPressedThisFrame) return true;
            return false;
        }

        /// <summary>メニュー操作（キーボード・ゲームパッド・VR スティック）。押しっぱなしは 0.18 秒ごとにくり返す。</summary>
        public MenuKey ReadMenu(bool vr)
        {
            if (rebindIndex >= 0) return MenuKey.None;
            var kb = Keyboard.current; var gp = Gamepad.current;
            if (kb != null)
            {
                if (KDown(4) || kb.enterKey.wasPressedThisFrame || kb.spaceKey.wasPressedThisFrame) return MenuKey.Confirm;
                if (KDown(5) || KDown(6) || kb.backspaceKey.wasPressedThisFrame) return MenuKey.Cancel;
            }
            if (gp != null)
            {
                if (gp.buttonSouth.wasPressedThisFrame || gp.startButton.wasPressedThisFrame) return MenuKey.Confirm;
                if (gp.buttonEast.wasPressedThisFrame) return MenuKey.Cancel;
            }
            Vector2 d = Vector2.zero;
            if (kb != null) { if (K(0) || K(7)) d.y += 1; if (K(1) || K(8)) d.y -= 1; if (K(3) || K(10)) d.x += 1; if (K(2) || K(9)) d.x -= 1; }
            if (gp != null) { d += gp.leftStick.ReadValue() + gp.dpad.ReadValue(); }
            if (vr && XRBridge.Instance != null) { d += XRBridge.Instance.Left.stick + XRBridge.Instance.Right.stick; if (XRBridge.Instance.Left.b || XRBridge.Instance.Right.b) return Edge(MenuKey.Cancel); }
            MenuKey k = MenuKey.None;
            if (d.y > 0.6f) k = MenuKey.Up; else if (d.y < -0.6f) k = MenuKey.Down; else if (d.x > 0.6f) k = MenuKey.Right; else if (d.x < -0.6f) k = MenuKey.Left;
            return Repeat(k);
        }

        MenuKey Edge(MenuKey k) { if (lastNav == k) return MenuKey.None; lastNav = k; lastNavTime = Time.unscaledTime; return k; }
        MenuKey Repeat(MenuKey k)
        {
            if (k == MenuKey.None) { lastNav = MenuKey.None; return MenuKey.None; }
            float now = Time.unscaledTime;
            if (k != lastNav) { lastNav = k; lastNavTime = now + 0.25f; return k; }
            if (now >= lastNavTime) { lastNavTime = now + 0.18f; return k; }
            return MenuKey.None;
        }

        /// <summary>現在の割当の表示文字列（実際に読んでいる入力をそのまま書く）。</summary>
        public string BindingSummary(bool vr)
        {
            string kb = $"キーボード: 移動 {keys[0]}/{keys[1]}/{keys[2]}/{keys[3]}（{keys[7]}{keys[9]}{keys[8]}{keys[10]}）・対空 {keys[4]}・対地 {keys[5]}・一時停止 {keys[6]}";
            string pad = SaveService.Settings.swapPadButtons ? "ゲームパッド: スティック/十字キーで移動・West(□/X)で対空・South(×/A)で対地・Start で一時停止"
                                                             : "ゲームパッド: スティック/十字キーで移動・South(×/A)で対空・West(□/X)で対地・Start で一時停止";
            string touch = "タッチ: 画面左で移動・右下の大きなボタン（上=対空 / 下=対地）";
            string xr = SaveService.Settings.leftHanded ? "Quest: 右スティックで移動・左トリガーで対空・右トリガーで対地" : "Quest: 左スティックで移動・右トリガーで対空・左トリガーで対地";
            if (vr && XRBridge.Instance != null) xr += "（" + XRBridge.Instance.ProfileText() + "）";
            return kb + "\n" + pad + "\n" + touch + "\n" + xr;
        }
    }
}
