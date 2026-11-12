// 永続サービス（Boot で 1 度だけ作る）：音・入力・XR・カメラリグ・UI ルート・EventSystem。
// どのシーンから起動しても EnsureBooted() で重複なく用意される（AudioListener・EventSystem・XR リグを二重に作らない）。
using SkywardRuins.Core;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace SkywardRuins
{
    /// <summary>タイトル → ゲームへ渡す選択内容。</summary>
    public static class Session
    {
        public static ViewMode mode = ViewMode.Mode2D;
        public static Difficulty difficulty = Difficulty.Standard;
        public static int startArea;
        public static bool tutorial;
    }

    public class Services : MonoBehaviour
    {
        public static Services Instance { get; private set; }
        public Camera mainCamera;           // Title と Game3D と VR で使う唯一のメインカメラ（AudioListener 付き）
        public Transform rig;               // XR の原点。通常表示ではここを動かしてカメラ位置を決める
        public UIRoot ui;
        public const string Notice = "このゲームは Claude Code のクラウドセッションで制作しました。";

        public static void EnsureBooted()
        {
            if (Instance != null) return;
            var prefab = Resources.Load<GameObject>("Services");
            if (prefab == null) { Debug.LogError("[SkywardRuins] Resources/Services.prefab がありません（ProjectBuilder を実行してください）"); return; }
            Instantiate(prefab).name = "Services";
        }

        void Awake()
        {
            if (Instance != null && Instance != this) { Destroy(gameObject); return; }
            Instance = this;
            DontDestroyOnLoad(gameObject);
            Application.targetFrameRate = -1;          // Web はブラウザの描画周期（requestAnimationFrame）に合わせる
            Application.runInBackground = false;
            QualitySettings.vSyncCount = 0;
        }

        public static void LoadScene(string name)
        {
            if (AudioDirector.Instance != null) AudioDirector.Instance.StopAllSfx();
            SceneManager.LoadScene(name);
        }

        /// <summary>通常表示（非 VR）のときだけカメラを置く。VR 中はカメラ姿勢を XR に任せ、リグの原点だけ動かす。</summary>
        public void PlaceCamera(Vector3 pos, Quaternion rot, float fov)
        {
            bool vr = XRBridge.Instance != null && XRBridge.Instance.IsVR;
            if (vr) return;
            rig.SetPositionAndRotation(Vector3.zero, Quaternion.identity);
            mainCamera.transform.SetPositionAndRotation(pos, rot);
            mainCamera.fieldOfView = fov;
        }

        /// <summary>VR の観察位置（原点）を置く。頭の位置はユーザーの姿勢のまま。視点リセットの補正を掛ける。</summary>
        public void PlaceRig(Vector3 pos, Quaternion rot) { rig.SetPositionAndRotation(vrRecenterRot * pos + vrRecenterPos, vrRecenterRot * rot); }

        Vector3 vrRecenterPos; Quaternion vrRecenterRot = Quaternion.identity;
        /// <summary>VR の視点リセット：今の頭の向きと位置を「正面・盤面の手前」に合わせ直す（ユーザーが選んだときだけ）。</summary>
        public void RecenterVR()
        {
            var cam = mainCamera.transform;
            float yaw = cam.localEulerAngles.y;
            vrRecenterRot = Quaternion.Euler(0, -yaw, 0);
            var lp = cam.localPosition; lp.y = 0;
            vrRecenterPos = -(vrRecenterRot * lp);
        }
    }
}
