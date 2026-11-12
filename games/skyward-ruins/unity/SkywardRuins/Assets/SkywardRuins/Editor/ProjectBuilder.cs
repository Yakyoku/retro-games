// プロジェクト一式をエディタ処理で生成・保存する（何度実行しても同じ結果になる。既存アセットは GUID を保ったまま更新）。
//  1) プレイヤー設定（WebGL・Linear・Input System・テンプレート・圧縮）とレイヤー
//  2) 素材の取り込み設定（ドット絵は点補間・無圧縮、音、フォント）
//  3) マテリアル・メッシュ（models.json）・補助テクスチャ
//  4) GameDatabase（調整値・16 エリア・スプライト・メッシュ・音・イベント対応）
//  5) URP・XR（WebXR Export のローダーと設定）
//  6) Services プレハブ（カメラリグ・XR コントローラー・EventSystem・UI）と 4 シーン（Boot/Title/Game2D/Game3D）
//  7) 検証（参照切れ・重複・必要部品）
// コマンドライン: Unity -batchmode -quit -projectPath unity/SkywardRuins -executeMethod SkywardRuins.EditorTools.ProjectBuilder.BuildAllBatch
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using SkywardRuins.Core;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.UI;
using UnityEngine.Rendering;
using UnityEngine.SceneManagement;
using UnityEngine.UI;
using TrackedPoseDriver = UnityEngine.InputSystem.XR.TrackedPoseDriver;

namespace SkywardRuins.EditorTools
{
    public static class ProjectBuilder
    {
        public const string Root = "Assets/SkywardRuins";
        const string Gen = Root + "/Generated";
        public static readonly string[] ScenePaths = { Root + "/Scenes/Boot.unity", Root + "/Scenes/Title.unity", Root + "/Scenes/Game2D.unity", Root + "/Scenes/Game3D.unity" };
        static readonly List<string> log = new List<string>();
        static void Log(string s) { log.Add(s); Debug.Log("[ProjectBuilder] " + s); }

        [UnityEditor.MenuItem("Skyward Ruins/1. プロジェクト一式を生成")]
        public static void BuildAll()
        {
            log.Clear();
            foreach (var d in new[] { Root + "/Scenes", Root + "/Resources", Gen, Gen + "/Meshes", Gen + "/Areas", Gen + "/Materials", Gen + "/Textures", Root + "/Settings", "Assets/XR/Settings" })
                Directory.CreateDirectory(d);
            AssetDatabase.Refresh();
            ConfigurePlayer();
            ConfigureLayers();
            ImportSettings();
            var tex = MakeTextures();
            var mats = MakeMaterials();
            var meshes = MakeMeshes();
            var db = MakeDatabase(mats, meshes, tex);
            SetupURP();
            SetupXR();
            var services = MakeServicesPrefab();
            MakeScenes();
            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();
            Log("生成完了");
        }

        public static void BuildAllBatch()
        {
            try
            {
                BuildAll();
                var errors = Validate();
                if (errors.Count > 0) { foreach (var e in errors) Debug.LogError("[Validate] " + e); EditorApplication.Exit(2); return; }
                Debug.Log("[Validate] VALIDATION OK");
                EditorApplication.Exit(0);
            }
            catch (Exception e) { Debug.LogException(e); EditorApplication.Exit(1); }
        }

        // ---------------------------------------------------------------- 1) プレイヤー設定
        static void ConfigurePlayer()
        {
            PlayerSettings.companyName = "Skyward Ruins (Claude Code cloud session)";
            PlayerSettings.productName = "Skyward Ruins";
            PlayerSettings.colorSpace = ColorSpace.Linear;                    // WebXR Export（Unity 6）の要件
            PlayerSettings.runInBackground = false;
            PlayerSettings.SetUseDefaultGraphicsAPIs(BuildTarget.WebGL, false);
            PlayerSettings.SetGraphicsAPIs(BuildTarget.WebGL, new[] { GraphicsDeviceType.OpenGLES3 });   // WebGL2 のみ（WebGPU は使わない）
            PlayerSettings.WebGL.template = "PROJECT:SkywardRuins";
            PlayerSettings.WebGL.compressionFormat = WebGLCompressionFormat.Brotli;   // Netlify の _headers で Content-Encoding: br を付ける
            PlayerSettings.WebGL.decompressionFallback = false;
            PlayerSettings.WebGL.dataCaching = true;
            PlayerSettings.WebGL.nameFilesAsHashes = true;
            PlayerSettings.WebGL.exceptionSupport = WebGLExceptionSupport.ExplicitlyThrownExceptionsOnly;
            PlayerSettings.WebGL.powerPreference = WebGLPowerPreference.HighPerformance;
            PlayerSettings.WebGL.linkerTarget = WebGLLinkerTarget.Wasm;
            PlayerSettings.WebGL.threadsSupport = false;                       // クロスオリジン分離を不要にする
            PlayerSettings.WebGL.initialMemorySize = 64;
            PlayerSettings.WebGL.maximumMemorySize = 1024;
            PlayerSettings.WebGL.memoryGrowthMode = WebGLMemoryGrowthMode.Geometric;
            PlayerSettings.SetManagedStrippingLevel(UnityEditor.Build.NamedBuildTarget.WebGL, ManagedStrippingLevel.Minimal);
            PlayerSettings.SetIl2CppCodeGeneration(UnityEditor.Build.NamedBuildTarget.WebGL, UnityEditor.Build.Il2CppCodeGeneration.OptimizeSize);
            PlayerSettings.stripEngineCode = true;
            // Input System のみを使う（旧 Input Manager は使わない）
            var ps = AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/ProjectSettings.asset").FirstOrDefault();
            if (ps != null)
            {
                var so = new SerializedObject(ps); var p = so.FindProperty("activeInputHandler");
                if (p != null && p.intValue != 1) { p.intValue = 1; so.ApplyModifiedPropertiesWithoutUndo(); Log("activeInputHandler = Input System"); }
            }
            QualitySettings.vSyncCount = 0; QualitySettings.antiAliasing = 0;
            Log("プレイヤー設定");
        }

        static void ConfigureLayers()
        {
            var tm = AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/TagManager.asset").FirstOrDefault(); if (tm == null) return;
            var so = new SerializedObject(tm); var layers = so.FindProperty("layers");
            if (layers != null && layers.arraySize > View2D.Layer) { layers.GetArrayElementAtIndex(View2D.Layer).stringValue = "Game2D"; so.ApplyModifiedPropertiesWithoutUndo(); }
        }

        // ---------------------------------------------------------------- 2) 取り込み設定
        static void ImportSettings()
        {
            foreach (var guid in AssetDatabase.FindAssets("t:Texture2D", new[] { Root + "/Art/Sprites" }))
            {
                var path = AssetDatabase.GUIDToAssetPath(guid);
                var ti = (TextureImporter)AssetImporter.GetAtPath(path); if (ti == null) continue;
                bool dirty = ti.textureType != TextureImporterType.Sprite || ti.filterMode != FilterMode.Point || ti.spritePixelsPerUnit != 1 || ti.mipmapEnabled || ti.textureCompression != TextureImporterCompression.Uncompressed;
                if (!dirty) continue;
                ti.textureType = TextureImporterType.Sprite; ti.spriteImportMode = SpriteImportMode.Single; ti.spritePixelsPerUnit = 1;
                ti.filterMode = FilterMode.Point; ti.mipmapEnabled = false; ti.textureCompression = TextureImporterCompression.Uncompressed;
                ti.alphaIsTransparency = true; ti.npotScale = TextureImporterNPOTScale.None; ti.wrapMode = TextureWrapMode.Clamp;
                var st = new TextureImporterSettings(); ti.ReadTextureSettings(st); st.spriteAlignment = (int)SpriteAlignment.Center; st.spriteMeshType = SpriteMeshType.FullRect; ti.SetTextureSettings(st);
                ti.SaveAndReimport();
            }
            foreach (var guid in AssetDatabase.FindAssets("t:AudioClip", new[] { Root + "/Audio" }))
            {
                var path = AssetDatabase.GUIDToAssetPath(guid); var ai = (AudioImporter)AssetImporter.GetAtPath(path); if (ai == null) continue;
                var s = ai.defaultSampleSettings; bool bgm = Path.GetFileName(path).StartsWith("bgm");
                s.loadType = AudioClipLoadType.DecompressOnLoad; s.compressionFormat = AudioCompressionFormat.Vorbis; s.quality = bgm ? 0.6f : 0.8f;
                ai.defaultSampleSettings = s; ai.loadInBackground = bgm; ai.forceToMono = true;
                ai.SaveAndReimport();
            }
            foreach (var guid in AssetDatabase.FindAssets("t:Font", new[] { Root + "/Fonts" }))
            {
                var path = AssetDatabase.GUIDToAssetPath(guid); var fi = AssetImporter.GetAtPath(path) as TrueTypeFontImporter; if (fi == null) continue;
                if (fi.fontTextureCase != FontTextureCase.Dynamic || !fi.includeFontData) { fi.fontTextureCase = FontTextureCase.Dynamic; fi.includeFontData = true; fi.SaveAndReimport(); }
            }
            Log("取り込み設定");
        }

        // ---------------------------------------------------------------- 3) 素材
        static Texture2D SaveTex(string name, int w, int h, Func<int, int, Color> f)
        {
            string path = $"{Gen}/Textures/{name}.png";
            var t = new Texture2D(w, h, TextureFormat.RGBA32, false);
            for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) t.SetPixel(x, y, f(x, y));
            File.WriteAllBytes(path, t.EncodeToPNG()); UnityEngine.Object.DestroyImmediate(t);
            AssetDatabase.ImportAsset(path);
            var ti = (TextureImporter)AssetImporter.GetAtPath(path); ti.textureType = TextureImporterType.Default; ti.alphaIsTransparency = true; ti.mipmapEnabled = false; ti.wrapMode = TextureWrapMode.Clamp; ti.textureCompression = TextureImporterCompression.Uncompressed; ti.SaveAndReimport();
            return AssetDatabase.LoadAssetAtPath<Texture2D>(path);
        }
        static (Texture2D circle, Texture2D vignette) MakeTextures()
        {
            var c = SaveTex("soft_circle", 64, 64, (x, y) => { float d = Vector2.Distance(new Vector2(x + 0.5f, y + 0.5f), new Vector2(32, 32)) / 32f; return new Color(1, 1, 1, Mathf.Clamp01((1 - d) * 3f)); });
            var v = SaveTex("vignette", 128, 128, (x, y) => { float d = Vector2.Distance(new Vector2(x + 0.5f, y + 0.5f), new Vector2(64, 64)) / 64f; return new Color(1, 1, 1, Mathf.SmoothStep(0, 1, Mathf.Clamp01((d - 0.55f) / 0.45f))); });
            return (c, v);
        }

        static Material Mat(string name, string shader)
        {
            string path = $"{Gen}/Materials/{name}.mat";
            var sh = Shader.Find(shader); if (sh == null) throw new Exception("シェーダーが見つかりません: " + shader);
            var m = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (m == null) { m = new Material(sh); AssetDatabase.CreateAsset(m, path); } else m.shader = sh;
            EditorUtility.SetDirty(m); return m;
        }
        static Dictionary<string, Material> MakeMaterials()
        {
            var d = new Dictionary<string, Material>
            {
                ["sprite"] = Mat("Sprite", "SkywardRuins/Sprite"),
                ["lit"] = Mat("Lit", "SkywardRuins/Lit"),
                ["terrain"] = Mat("Terrain", "SkywardRuins/Lit"),
                ["unlit"] = Mat("UnlitTransparent", "SkywardRuins/UnlitTransparent"),
            };
            d["lit"].enableInstancing = true; d["unlit"].enableInstancing = true;
            Log("マテリアル " + d.Count);
            return d;
        }

        static Dictionary<string, Mesh> MakeMeshes()
        {
            var json = File.ReadAllText(Root + "/Data/models.json");
            var root = (Dictionary<string, object>)MiniJson.Parse(json);
            var result = new Dictionary<string, Mesh>();
            foreach (var kv in root)
            {
                var m = (Dictionary<string, object>)kv.Value;
                var tris = (List<object>)m["tris"]; var cols = (List<object>)m["cols"];
                var v = new List<Vector3>(); var c = new List<Color>(); var n = new List<Vector3>(); var idx = new List<int>();
                for (int i = 0; i < tris.Count; i++)
                {
                    var t = ((List<object>)tris[i]).Select(o => Convert.ToSingle(o)).ToArray();
                    ColorUtility.TryParseHtmlString((string)cols[i], out var col);
                    var a = new Vector3(t[0], t[1], t[2]); var b = new Vector3(t[3], t[4], t[5]); var cc = new Vector3(t[6], t[7], t[8]);
                    var nn = Vector3.Cross(b - a, cc - a).normalized;   // 面法線（フラットシェーディング）
                    foreach (var p in new[] { a, b, cc }) { idx.Add(v.Count); v.Add(p); c.Add(col); n.Add(nn); }
                }
                string path = $"{Gen}/Meshes/{kv.Key}.asset";
                var mesh = AssetDatabase.LoadAssetAtPath<Mesh>(path);
                bool isNew = mesh == null; if (isNew) mesh = new Mesh();
                mesh.Clear(); mesh.name = kv.Key;
                mesh.SetVertices(v); mesh.SetColors(c); mesh.SetNormals(n); mesh.SetUVs(0, v.Select(p => new Vector2(0.5f, 0.5f)).ToList()); mesh.SetTriangles(idx, 0); mesh.RecalculateBounds();
                if (isNew) AssetDatabase.CreateAsset(mesh, path); else EditorUtility.SetDirty(mesh);
                result[kv.Key] = mesh;
            }
            Log("メッシュ " + result.Count);
            return result;
        }

        // ---------------------------------------------------------------- 4) データベース
        static T LoadOrCreate<T>(string path) where T : ScriptableObject
        {
            var a = AssetDatabase.LoadAssetAtPath<T>(path);
            if (a == null) { a = ScriptableObject.CreateInstance<T>(); AssetDatabase.CreateAsset(a, path); }
            return a;
        }

        static GameDatabase MakeDatabase(Dictionary<string, Material> mats, Dictionary<string, Mesh> meshes, (Texture2D circle, Texture2D vignette) tex)
        {
            var db = LoadOrCreate<GameDatabase>(Root + "/Resources/GameDatabase.asset");
            if (db.tuning == null) db.tuning = new Tuning();
            // 16 エリア（生成規則はコアの Stage。エリアごとに ScriptableObject として保存し、インスペクタで確認・調整できる）
            var areas = SkywardRuins.Core.Stage.BuildAll(db.tuning);
            db.areas = new AreaAsset[areas.Count];
            for (int i = 0; i < areas.Count; i++)
            {
                var a = LoadOrCreate<AreaAsset>($"{Gen}/Areas/Area{i + 1:00}.asset");
                a.data = areas[i]; EditorUtility.SetDirty(a); db.areas[i] = a;
            }
            // スプライト
            var sj = (Dictionary<string, object>)MiniJson.Parse(File.ReadAllText(Root + "/Art/sprites.json"));
            var sets = new List<SpriteSet>();
            foreach (var kv in sj)
            {
                var info = (Dictionary<string, object>)kv.Value; int frames = Convert.ToInt32(info["frames"]);
                var set = new SpriteSet { name = kv.Key, fps = Convert.ToSingle(info["fps"]), frames = new Sprite[frames] };
                for (int f = 0; f < frames; f++)
                {
                    var sp = AssetDatabase.LoadAssetAtPath<Sprite>($"{Root}/Art/Sprites/{kv.Key}_{f}.png");
                    if (sp == null) throw new Exception($"スプライトがありません: {kv.Key}_{f}");
                    set.frames[f] = sp;
                }
                sets.Add(set);
            }
            db.sprites = sets.ToArray();
            db.meshes = meshes.Select(kv => new MeshEntry { name = kv.Key, mesh = kv.Value }).ToArray();
            // 音
            var aj = (Dictionary<string, object>)MiniJson.Parse(File.ReadAllText(Root + "/Data/audio.json"));
            var audio = new List<AudioEntry>();
            foreach (var kv in aj)
            {
                var i = (Dictionary<string, object>)kv.Value;
                var clip = AssetDatabase.LoadAssetAtPath<AudioClip>($"{Root}/Audio/{kv.Key}.wav");
                if (clip == null) throw new Exception("音がありません: " + kv.Key);
                audio.Add(new AudioEntry { name = kv.Key, clip = clip, loop = (bool)i["loop"], gain = Convert.ToSingle(i["gain"]), priority = Convert.ToInt32(i["priority"]), maxVoices = Convert.ToInt32(i["maxVoices"]), cooldown = Convert.ToSingle(i["cooldown"]), spatial = (bool)i["spatial"], description = i.ContainsKey("desc") ? (string)i["desc"] : "" });
            }
            db.audio = audio.ToArray();
            var ej = (Dictionary<string, object>)MiniJson.Parse(File.ReadAllText(Root + "/Data/audio_events.json"));
            db.audioEvents = ((List<object>)ej["events"]).Select(o =>
            {
                var d = (Dictionary<string, object>)o;
                return new AudioEventEntry { ev = (EvType)Enum.Parse(typeof(EvType), (string)d["ev"]), cue = d.ContainsKey("cue") ? (string)d["cue"] : "", bgm = d.ContainsKey("bgm") ? (string)d["bgm"] : "" };
            }).ToArray();
            db.font = AssetDatabase.LoadAssetAtPath<Font>(Root + "/Fonts/SkywardUI.ttf");
            if (db.font == null) throw new Exception("フォント Fonts/SkywardUI.ttf がありません（tools/gen-font.py）");
            db.spriteMaterial = mats["sprite"]; db.litMaterial = mats["lit"]; db.terrainMaterial = mats["terrain"]; db.unlitTransparent = mats["unlit"];
            db.softCircle = tex.circle; db.vignette = tex.vignette;
            EditorUtility.SetDirty(db);
            Log($"データベース: エリア {db.areas.Length}・スプライト {db.sprites.Length}・メッシュ {db.meshes.Length}・音 {db.audio.Length}・音イベント {db.audioEvents.Length}");
            return db;
        }

        // ---------------------------------------------------------------- 5) URP / XR
        static void SetupURP()
        {
            const string asm = "Unity.RenderPipelines.Universal.Runtime";
            var assetT = Type.GetType("UnityEngine.Rendering.Universal.UniversalRenderPipelineAsset, " + asm);
            var rdT = Type.GetType("UnityEngine.Rendering.Universal.UniversalRendererData, " + asm);
            if (assetT == null || rdT == null) throw new Exception("URP パッケージが読み込まれていません（Packages/manifest.json）");
            string rdPath = Root + "/Settings/URP_Renderer.asset", aPath = Root + "/Settings/URP_Asset.asset";
            var rd = AssetDatabase.LoadAssetAtPath(rdPath, rdT) as ScriptableObject;
            if (rd == null) { rd = ScriptableObject.CreateInstance(rdT); AssetDatabase.CreateAsset(rd, rdPath); }
            var urp = AssetDatabase.LoadAssetAtPath(aPath, assetT) as RenderPipelineAsset;
            if (urp == null)
            {
                var create = assetT.GetMethods(BindingFlags.Public | BindingFlags.Static).First(m => m.Name == "Create" && m.GetParameters().Length == 1);
                urp = (RenderPipelineAsset)create.Invoke(null, new object[] { rd });
                AssetDatabase.CreateAsset(urp, aPath);
            }
            // 画質の基本値（影なし・HDR なし・MSAA 2x）。存在しない項目は飛ばす
            var so = new SerializedObject(urp);
            void SetB(string n, bool v) { var p = so.FindProperty(n); if (p != null) p.boolValue = v; else Log("URP 項目なし: " + n); }
            void SetI(string n, int v) { var p = so.FindProperty(n); if (p != null) p.intValue = v; else Log("URP 項目なし: " + n); }
            SetB("m_SupportsHDR", false); SetI("m_MSAA", 2); SetB("m_MainLightShadowsSupported", false); SetB("m_AdditionalLightShadowsSupported", false);
            SetB("m_SupportsCameraDepthTexture", false); SetB("m_SupportsCameraOpaqueTexture", false);
            so.ApplyModifiedPropertiesWithoutUndo();
            GraphicsSettings.defaultRenderPipeline = urp;
            int cur = QualitySettings.GetQualityLevel();
            for (int i = 0; i < QualitySettings.names.Length; i++) { QualitySettings.SetQualityLevel(i, false); QualitySettings.renderPipeline = urp; }
            QualitySettings.SetQualityLevel(cur, false);
            Log("URP");
        }

        static void SetupXR()
        {
#if SKYWARD_WEBXR
            XRSetup.Run(Log);
#else
            Log("WebXR Export パッケージが無いため XR 設定を省略（VR は無効）");
#endif
        }

        // ---------------------------------------------------------------- 6) プレハブとシーン
        static GameObject MakeServicesPrefab()
        {
            var root = new GameObject("Services");
            var svc = root.AddComponent<Services>(); root.AddComponent<AudioDirector>(); root.AddComponent<InputRouter>(); var xr = root.AddComponent<XRBridge>();
            var rig = new GameObject("CameraRig").transform; rig.SetParent(root.transform, false);
            var camGo = new GameObject("Main Camera"); camGo.tag = "MainCamera"; camGo.transform.SetParent(rig, false);
            var cam = camGo.AddComponent<Camera>(); cam.clearFlags = CameraClearFlags.SolidColor; cam.backgroundColor = new Color(0.62f, 0.75f, 0.88f); cam.nearClipPlane = 0.05f; cam.farClipPlane = 1500f; cam.allowHDR = false;
            camGo.AddComponent<AudioListener>();
            var tpd = camGo.AddComponent<TrackedPoseDriver>();
            tpd.positionInput = new InputActionProperty(new InputAction("HeadPosition", InputActionType.Value, "<XRHMD>/centerEyePosition", expectedControlType: "Vector3"));
            tpd.rotationInput = new InputActionProperty(new InputAction("HeadRotation", InputActionType.Value, "<XRHMD>/centerEyeRotation", expectedControlType: "Quaternion"));
            tpd.trackingType = TrackedPoseDriver.TrackingType.RotationAndPosition;
            tpd.updateType = TrackedPoseDriver.UpdateType.UpdateAndBeforeRender;
            var left = new GameObject("LeftHand").transform; left.SetParent(rig, false);
            var right = new GameObject("RightHand").transform; right.SetParent(rig, false);
#if SKYWARD_WEBXR
            XRSetup.AddControllers(left.gameObject, right.gameObject);
#endif
            xr.leftHand = left; xr.rightHand = right;
            svc.mainCamera = cam; svc.rig = rig;

            var es = new GameObject("EventSystem"); es.transform.SetParent(root.transform, false);
            es.AddComponent<EventSystem>(); es.AddComponent<InputSystemUIInputModule>();

            var uiGo = new GameObject("UI"); uiGo.transform.SetParent(root.transform, false);
            // 画面用キャンバス：720×720 を必ず収める拡大（縦長・横長どちらでも欠けない）
            var sc = new GameObject("ScreenCanvas", typeof(RectTransform)); sc.transform.SetParent(uiGo.transform, false); sc.layer = 5;
            var scv = sc.AddComponent<Canvas>(); scv.renderMode = RenderMode.ScreenSpaceOverlay; scv.sortingOrder = 10;
            var scaler = sc.AddComponent<CanvasScaler>(); scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize; scaler.referenceResolution = new Vector2(720, 720); scaler.screenMatchMode = CanvasScaler.ScreenMatchMode.Expand;
            sc.AddComponent<GraphicRaycaster>();
            var sLayer = UIF.Rect("Layer", sc.transform, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
            // VR 用キャンバス：観察位置の正面 1.5m・目の高さ付近に立てる（照準と敵弾を隠さないよう盤面の奥・上）
            var wc = new GameObject("WorldCanvas", typeof(RectTransform)); wc.transform.SetParent(rig, false); wc.layer = 5;
            var wcv = wc.AddComponent<Canvas>(); wcv.renderMode = RenderMode.WorldSpace; wcv.worldCamera = cam;
            var wrt = (RectTransform)wc.transform; wrt.sizeDelta = new Vector2(1000, 760); wrt.localScale = Vector3.one * 0.0016f; wrt.localPosition = new Vector3(0, 1.45f, 1.7f); wrt.localRotation = Quaternion.Euler(-8, 0, 0);
            wc.AddComponent<GraphicRaycaster>();
            var wLayer = UIF.Rect("Layer", wc.transform, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
            var ui = uiGo.AddComponent<UIRoot>();
            ui.screenCanvas = scv; ui.worldCanvas = wcv; ui.screenLayer = sLayer; ui.worldLayer = wLayer; ui.vrAnchor = rig;
            ui.rayL = MakeRay(uiGo.transform, "RayL"); ui.rayR = MakeRay(uiGo.transform, "RayR");
            svc.ui = ui;
            wc.SetActive(false);

            string path = Root + "/Resources/Services.prefab";
            var prefab = PrefabUtility.SaveAsPrefabAsset(root, path);
            UnityEngine.Object.DestroyImmediate(root);
            Log("Services プレハブ");
            return prefab;
        }

        static LineRenderer MakeRay(Transform parent, string name)
        {
            var go = new GameObject(name); go.transform.SetParent(parent, false);
            var lr = go.AddComponent<LineRenderer>(); lr.positionCount = 2; lr.widthMultiplier = 0.004f; lr.useWorldSpace = true;
            lr.sharedMaterial = AssetDatabase.LoadAssetAtPath<Material>($"{Gen}/Materials/UnlitTransparent.mat");
            lr.startColor = new Color(1, 1, 1, 0.8f); lr.endColor = new Color(1, 1, 1, 0.1f); lr.enabled = false;
            return lr;
        }

        static void Lighting()
        {
            RenderSettings.ambientMode = AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = new Color(0.75f, 0.82f, 0.95f); RenderSettings.ambientEquatorColor = new Color(0.55f, 0.6f, 0.58f); RenderSettings.ambientGroundColor = new Color(0.3f, 0.32f, 0.25f);
            RenderSettings.fog = true; RenderSettings.fogMode = FogMode.Linear; RenderSettings.fogColor = new Color(0.62f, 0.75f, 0.88f); RenderSettings.fogStartDistance = 60; RenderSettings.fogEndDistance = 160;
            RenderSettings.skybox = null;
            var sun = new GameObject("Sun"); var l = sun.AddComponent<Light>(); l.type = LightType.Directional; l.intensity = 1.15f; l.color = new Color(1f, 0.97f, 0.9f); l.shadows = LightShadows.None;
            sun.transform.rotation = Quaternion.Euler(52, -35, 0);
        }

        static Scene NewScene() => EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

        static void MakeScenes()
        {
            var s = NewScene(); new GameObject("Boot").AddComponent<BootLoader>(); EditorSceneManager.SaveScene(s, ScenePaths[0]);
            s = NewScene(); Lighting(); var t = new GameObject("Title"); t.AddComponent<View3D>(); t.AddComponent<TitleController>(); EditorSceneManager.SaveScene(s, ScenePaths[1]);
            s = NewScene(); var g2 = new GameObject("Game"); g2.AddComponent<View2D>(); var r2 = g2.AddComponent<GameRunner>(); r2.mode = ViewMode.Mode2D; EditorSceneManager.SaveScene(s, ScenePaths[2]);
            s = NewScene(); Lighting(); var g3 = new GameObject("Game"); g3.AddComponent<View3D>(); var r3 = g3.AddComponent<GameRunner>(); r3.mode = ViewMode.Mode3D; EditorSceneManager.SaveScene(s, ScenePaths[3]);
            EditorBuildSettings.scenes = ScenePaths.Select(p => new EditorBuildSettingsScene(p, true)).ToArray();
            Log("シーン 4 本と Build Settings");
        }

        // ---------------------------------------------------------------- 7) 検証
        public static List<string> Validate()
        {
            var e = new List<string>();
            var db = AssetDatabase.LoadAssetAtPath<GameDatabase>(Root + "/Resources/GameDatabase.asset");
            if (db == null) { e.Add("GameDatabase がありません"); return e; }
            if (db.areas == null || db.areas.Length != 16) e.Add("エリアが 16 ではありません");
            else for (int i = 0; i < 16; i++) { var a = db.areas[i]; if (a == null || a.data == null || a.data.tiles == null || a.data.tiles.Length == 0 || a.data.events.Count < 10) e.Add($"エリア {i + 1} のデータ不足"); }
            foreach (var n in new[] { "player", "dart", "arc", "seeker", "crosser", "sniper", "heavy", "shard", "turret", "tank", "bunker", "radar", "obelisk", "banner", "fortress", "fortturret", "core", "shot", "bomb", "bullet", "sight", "boomair", "boomground", "crater", "bombburst", "spark" })
            { var s = db.sprites.FirstOrDefault(x => x.name == n); if (s == null || s.frames.Any(f => f == null)) e.Add("スプライト欠落: " + n); }
            foreach (var n in new[] { "player", "dart", "arc", "seeker", "crosser", "sniper", "heavy", "shard", "turret", "tank", "bunker", "radar", "radar_dish", "obelisk", "mound", "banner", "fortress", "fortturret", "core", "core_eye", "bullet", "shot", "bomb", "tree", "rock", "building", "debris" })
            { var m = db.meshes.FirstOrDefault(x => x.name == n); if (m == null || m.mesh == null || m.mesh.vertexCount == 0) e.Add("メッシュ欠落: " + n); }
            foreach (var ev in db.audioEvents) { if (!string.IsNullOrEmpty(ev.cue) && db.audio.All(a => a.name != ev.cue)) e.Add($"音イベント {ev.ev} の音 {ev.cue} がありません"); if (!string.IsNullOrEmpty(ev.bgm) && ev.bgm != "-" && db.audio.All(a => a.name != ev.bgm)) e.Add($"曲 {ev.bgm} がありません"); }
            foreach (var a in db.audio) if (a.clip == null) e.Add("音クリップ欠落: " + a.name);
            foreach (var need in new[] { "air_fire", "ground_fire", "bomb_land", "air_kill", "ground_kill", "player_hit", "fortress_warn", "fortress_destroyed", "obelisk_reveal", "extend", "jingle_start", "jingle_gameover", "bgm_play", "bgm_fortress" })
                if (db.audio.All(a => a.name != need)) e.Add("必須の音がありません: " + need);
            if (db.font == null) e.Add("フォント未設定");
            if (db.spriteMaterial == null || db.litMaterial == null || db.terrainMaterial == null || db.unlitTransparent == null) e.Add("マテリアル未設定");
            foreach (var m in new[] { db.spriteMaterial, db.litMaterial, db.terrainMaterial, db.unlitTransparent }) if (m != null && (m.shader == null || !m.shader.isSupported)) e.Add("シェーダーが使えません: " + m.name);
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(Root + "/Resources/Services.prefab");
            if (prefab == null) e.Add("Services プレハブがありません");
            else
            {
                if (prefab.GetComponentsInChildren<AudioListener>(true).Length != 1) e.Add("AudioListener は 1 つだけ");
                if (prefab.GetComponentsInChildren<EventSystem>(true).Length != 1) e.Add("EventSystem は 1 つだけ");
                if (prefab.GetComponentsInChildren<Camera>(true).Length != 1) e.Add("メインカメラは 1 つだけ");
                var svc = prefab.GetComponent<Services>(); if (svc == null || svc.mainCamera == null || svc.rig == null || svc.ui == null) e.Add("Services の参照切れ");
                var ui = prefab.GetComponentInChildren<UIRoot>(true); if (ui == null || ui.screenLayer == null || ui.worldLayer == null || ui.worldCanvas == null) e.Add("UIRoot の参照切れ");
                var xr = prefab.GetComponent<XRBridge>(); if (xr == null || xr.leftHand == null || xr.rightHand == null) e.Add("XRBridge の参照切れ");
            }
            // シーン：Services を含まない（永続側だけ）・必要な部品がある
            var expect = new Dictionary<string, Type[]> { [ScenePaths[0]] = new[] { typeof(BootLoader) }, [ScenePaths[1]] = new[] { typeof(TitleController), typeof(View3D) }, [ScenePaths[2]] = new[] { typeof(GameRunner), typeof(View2D) }, [ScenePaths[3]] = new[] { typeof(GameRunner), typeof(View3D) } };
            foreach (var kv in expect)
            {
                var sc = EditorSceneManager.OpenScene(kv.Key, OpenSceneMode.Single);
                var all = sc.GetRootGameObjects().SelectMany(g => g.GetComponentsInChildren<Component>(true)).ToList();
                foreach (var t in kv.Value) if (!all.Any(c => c != null && c.GetType() == t)) e.Add($"{Path.GetFileName(kv.Key)} に {t.Name} がありません");
                if (all.Any(c => c is AudioListener || c is EventSystem || c is Camera)) e.Add($"{Path.GetFileName(kv.Key)} にカメラ/AudioListener/EventSystem が重複して置かれています");
                if (all.Any(c => c == null)) e.Add($"{Path.GetFileName(kv.Key)} に参照切れのスクリプトがあります");
            }
            if (EditorBuildSettings.scenes.Length != 4 || EditorBuildSettings.scenes[0].path != ScenePaths[0]) e.Add("Build Settings のシーン順が違います");
            if (GraphicsSettings.defaultRenderPipeline == null) e.Add("URP が設定されていません");
            if (PlayerSettings.colorSpace != ColorSpace.Linear) e.Add("Color Space が Linear ではありません");
            if (!Directory.Exists("Assets/WebGLTemplates/SkywardRuins")) e.Add("WebGL テンプレートがありません");
            return e;
        }
    }

    /// <summary>models.json などを読むための最小の JSON パーサ（JsonUtility は入れ子の配列や辞書を読めないため）。</summary>
    public static class MiniJson
    {
        public static object Parse(string s) { int i = 0; var v = Value(s, ref i); return v; }
        static void Ws(string s, ref int i) { while (i < s.Length && char.IsWhiteSpace(s[i])) i++; }
        static object Value(string s, ref int i)
        {
            Ws(s, ref i); char c = s[i];
            if (c == '{') { i++; var d = new Dictionary<string, object>(); Ws(s, ref i); if (s[i] == '}') { i++; return d; } while (true) { Ws(s, ref i); var k = Str(s, ref i); Ws(s, ref i); i++; d[k] = Value(s, ref i); Ws(s, ref i); if (s[i] == ',') { i++; continue; } i++; return d; } }
            if (c == '[') { i++; var l = new List<object>(); Ws(s, ref i); if (s[i] == ']') { i++; return l; } while (true) { l.Add(Value(s, ref i)); Ws(s, ref i); if (s[i] == ',') { i++; continue; } i++; return l; } }
            if (c == '"') return Str(s, ref i);
            if (s.Substring(i).StartsWith("true")) { i += 4; return true; }
            if (s.Substring(i, Math.Min(5, s.Length - i)).StartsWith("false")) { i += 5; return false; }
            if (s.Substring(i, Math.Min(4, s.Length - i)).StartsWith("null")) { i += 4; return null; }
            int st = i; while (i < s.Length && "+-0123456789.eE".IndexOf(s[i]) >= 0) i++;
            return double.Parse(s.Substring(st, i - st), System.Globalization.CultureInfo.InvariantCulture);
        }
        static string Str(string s, ref int i)
        {
            var sb = new System.Text.StringBuilder(); i++;
            while (s[i] != '"') { if (s[i] == '\\') { i++; char e = s[i]; if (e == 'u') { sb.Append((char)Convert.ToInt32(s.Substring(i + 1, 4), 16)); i += 4; } else sb.Append(e == 'n' ? '\n' : e == 't' ? '\t' : e); } else sb.Append(s[i]); i++; }
            i++; return sb.ToString();
        }
    }
}
