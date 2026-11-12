// WebXR（De-Panther 氏の WebXR Export）との橋渡し。パッケージが無い環境でもコンパイルできるよう SKYWARD_WEBXR で分ける。
// XR のカメラ姿勢と描画ループは WebXR 側に任せ、ここでは「VR 中か」「左右コントローラーの入力」「振動」「中断」だけを扱う。
using System;
using UnityEngine;
#if SKYWARD_WEBXR
using WebXR;
#endif

namespace SkywardRuins
{
    public struct XRHand
    {
        public bool active; public Vector2 stick; public bool trigger, triggerDown, grip, a, b, stickClick;
        public Transform pose;   // レイの起点（コントローラーの位置・向き）
    }

    public class XRBridge : MonoBehaviour
    {
        public static XRBridge Instance { get; private set; }
        public Transform leftHand, rightHand;    // ProjectBuilder が CameraRig の子に作る
        public bool IsVR { get; private set; }
        public bool Supported { get; private set; }
        public bool Visible { get; private set; } = true;
        public event Action<bool> OnVRChanged;      // VR 開始/終了
        public event Action OnInterrupted;           // XR の中断（ヘッドセットを外した・システムメニュー）
        public string LastError { get; private set; }

        public XRHand Left, Right;
        bool prevTrigL, prevTrigR;
#if SKYWARD_WEBXR
        WebXRController ctrlL, ctrlR;
#endif

        void Awake()
        {
            if (Instance != null && Instance != this) { Destroy(gameObject); return; }
            Instance = this;
#if SKYWARD_WEBXR
            if (leftHand) ctrlL = leftHand.GetComponent<WebXRController>();
            if (rightHand) ctrlR = rightHand.GetComponent<WebXRController>();
            WebXRManager.OnXRChange += HandleXRChange;
            WebXRManager.OnXRCapabilitiesUpdate += HandleCaps;
            WebXRManager.OnVisibilityChange += HandleVisibility;
#endif
        }

        void OnDestroy()
        {
#if SKYWARD_WEBXR
            WebXRManager.OnXRChange -= HandleXRChange;
            WebXRManager.OnXRCapabilitiesUpdate -= HandleCaps;
            WebXRManager.OnVisibilityChange -= HandleVisibility;
#endif
            if (Instance == this) Instance = null;
        }

#if SKYWARD_WEBXR
        void HandleCaps(WebXRDisplayCapabilities caps) { Supported = caps.canPresentVR; }
        void HandleXRChange(WebXRState state, int views, Rect l, Rect r)
        {
            bool vr = state == WebXRState.VR;
            if (vr == IsVR) return;
            IsVR = vr;
            OnVRChanged?.Invoke(vr);
            if (!vr) OnInterrupted?.Invoke();   // 終了時も一時停止へ（突然の被弾を防ぐ）
        }
        void HandleVisibility(WebXRVisibilityState v)
        {
            Visible = v == WebXRVisibilityState.VISIBLE;
            if (!Visible) OnInterrupted?.Invoke();
        }
#endif

        /// <summary>VR を開始/終了する。ユーザー操作（ボタン）から呼ぶこと。非対応なら false と理由。</summary>
        public bool ToggleVR()
        {
#if SKYWARD_WEBXR
            var m = WebXRManager.Instance;
            if (m == null) { LastError = "WebXR の初期化が終わっていません"; return false; }
            if (!IsVR && !m.isSupportedVR) { LastError = "このブラウザ・端末は WebXR の immersive-vr に対応していません"; return false; }
            m.ToggleVR();
            return true;
#else
            LastError = "WebXR Export パッケージが含まれていないビルドです";
            return false;
#endif
        }

        void Update()
        {
#if SKYWARD_WEBXR
            var m = WebXRManager.Instance;
            if (m != null) Supported = m.isSupportedVR;
            Left = Read(ctrlL, leftHand, ref prevTrigL);
            Right = Read(ctrlR, rightHand, ref prevTrigR);
#endif
        }

#if SKYWARD_WEBXR
        static XRHand Read(WebXRController c, Transform t, ref bool prevTrig)
        {
            var h = new XRHand { pose = t };
            if (c == null || !c.isControllerActive) { prevTrig = false; return h; }
            h.active = true;
            h.stick = c.GetAxis2D(WebXRController.Axis2DTypes.Thumbstick);
            h.trigger = c.GetButton(WebXRController.ButtonTypes.Trigger);
            h.triggerDown = h.trigger && !prevTrig; prevTrig = h.trigger;
            h.grip = c.GetButton(WebXRController.ButtonTypes.Grip);
            h.a = c.GetButton(WebXRController.ButtonTypes.ButtonA);
            h.b = c.GetButton(WebXRController.ButtonTypes.ButtonB);
            h.stickClick = c.GetButton(WebXRController.ButtonTypes.Thumbstick);
            return h;
        }
#endif

        /// <summary>対応するコントローラーだけ振動させる。強さは設定の振動強度を掛ける。</summary>
        public void Pulse(bool right, float intensity, float ms)
        {
            float k = SaveService.Settings.vibration; if (k <= 0) return;
#if SKYWARD_WEBXR
            var c = right ? ctrlR : ctrlL;
            if (c != null && c.isControllerActive) c.Pulse(Mathf.Clamp01(intensity * k), ms);
#endif
        }

        /// <summary>実際に検出したコントローラーの入力プロファイル（表示用）。</summary>
        public string ProfileText()
        {
#if SKYWARD_WEBXR
            string P(WebXRController c) { if (c == null || !c.isControllerActive) return "未接続"; var p = c.GetProfiles(); return p != null && p.Length > 0 ? p[0] : "不明"; }
            return $"左: {P(ctrlL)} / 右: {P(ctrlR)}";
#else
            return "WebXR なし";
#endif
        }
    }
}
