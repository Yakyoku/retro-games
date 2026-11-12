// XR Plug-in Management に WebXR Export のローダーを WebGL 向けに登録し、WebXR の設定を用意する。
#if SKYWARD_WEBXR
using System;
using UnityEditor;
using UnityEditor.XR.Management;
using UnityEditor.XR.Management.Metadata;
using UnityEngine;
using UnityEngine.XR.Management;
using WebXR;

namespace SkywardRuins.EditorTools
{
    public static class XRSetup
    {
        public static void Run(Action<string> log)
        {
            // 1) 全体設定（ビルド対象ごと）
            if (!EditorBuildSettings.TryGetConfigObject(XRGeneralSettings.k_SettingsKey, out XRGeneralSettingsPerBuildTarget per) || per == null)
            {
                per = ScriptableObject.CreateInstance<XRGeneralSettingsPerBuildTarget>();
                AssetDatabase.CreateAsset(per, "Assets/XR/XRGeneralSettingsPerBuildTarget.asset");
                EditorBuildSettings.AddConfigObject(XRGeneralSettings.k_SettingsKey, per, true);
            }
            if (!per.HasSettingsForBuildTarget(BuildTargetGroup.WebGL)) per.CreateDefaultSettingsForBuildTarget(BuildTargetGroup.WebGL);
            if (!per.HasManagerSettingsForBuildTarget(BuildTargetGroup.WebGL)) per.CreateDefaultManagerSettingsForBuildTarget(BuildTargetGroup.WebGL);
            var gs = per.SettingsForBuildTarget(BuildTargetGroup.WebGL);
            gs.InitManagerOnStart = true;
            bool ok = XRPackageMetadataStore.AssignLoader(gs.Manager, typeof(WebXRLoader).FullName, BuildTargetGroup.WebGL);
            EditorUtility.SetDirty(per); EditorUtility.SetDirty(gs); if (gs.Manager != null) EditorUtility.SetDirty(gs.Manager);
            log("XR ローダー（WebXR）登録: " + (ok ? "OK" : "既に登録済み/失敗"));
            // 2) WebXR の設定（座位でも使える local-floor、手の追跡は任意機能、WebXR Interactions の入力系は使わない）
            const string path = "Assets/XR/Settings/WebXRSettings.asset";
            var s = AssetDatabase.LoadAssetAtPath<WebXRSettings>(path);
            if (s == null) { s = ScriptableObject.CreateInstance<WebXRSettings>(); AssetDatabase.CreateAsset(s, path); }
            s.VRRequiredReferenceSpace = WebXRSettings.ReferenceSpaceTypes.local_floor;
            s.AutoLoadWebXRManager = true;
            s.AutoLoadWebXRInputSystem = false;
            s.DisableXRDisplaySubsystem = false;   // URP の XR 描画（両眼）を使う
            EditorUtility.SetDirty(s);
            EditorBuildSettings.AddConfigObject("WebXR.Settings", s, true);
            log("WebXR 設定");
        }

        public static void AddControllers(GameObject left, GameObject right)
        {
            left.AddComponent<WebXRController>().hand = WebXRControllerHand.LEFT;
            right.AddComponent<WebXRController>().hand = WebXRControllerHand.RIGHT;
        }
    }
}
#endif
