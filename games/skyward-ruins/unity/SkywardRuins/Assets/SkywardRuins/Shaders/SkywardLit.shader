// 面ごとの頂点色＋テクスチャを主光源のランバートと環境光で照らす（URP）。両面描画で、裏から見えた面は法線を反転。
// _Flash で白く光らせる（被弾・予兆）。GPU インスタンシング対応（木・岩・建物）。
Shader "SkywardRuins/Lit"
{
    Properties
    {
        _MainTex ("Texture", 2D) = "white" {}
        _Color ("Color", Color) = (1,1,1,1)
        _Flash ("Flash", Range(0,1)) = 0
    }
    SubShader
    {
        Tags { "RenderType"="Opaque" "RenderPipeline"="UniversalPipeline" "Queue"="Geometry" }
        Pass
        {
            Name "ForwardLit"
            Tags { "LightMode"="UniversalForward" }
            Cull Off
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile_instancing
            #pragma multi_compile_fog
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"
            TEXTURE2D(_MainTex); SAMPLER(sampler_MainTex);
            CBUFFER_START(UnityPerMaterial)
                float4 _MainTex_ST; half4 _Color; half _Flash;
            CBUFFER_END
            struct Attributes { float4 positionOS : POSITION; float3 normalOS : NORMAL; half4 color : COLOR; float2 uv : TEXCOORD0; UNITY_VERTEX_INPUT_INSTANCE_ID };
            struct Varyings { float4 positionCS : SV_POSITION; float3 normalWS : TEXCOORD1; half4 color : COLOR; float2 uv : TEXCOORD0; half fog : TEXCOORD2; UNITY_VERTEX_INPUT_INSTANCE_ID UNITY_VERTEX_OUTPUT_STEREO };
            Varyings vert (Attributes i)
            {
                Varyings o = (Varyings)0;
                UNITY_SETUP_INSTANCE_ID(i); UNITY_TRANSFER_INSTANCE_ID(i, o); UNITY_INITIALIZE_VERTEX_OUTPUT_STEREO(o);
                VertexPositionInputs p = GetVertexPositionInputs(i.positionOS.xyz);
                o.positionCS = p.positionCS; o.normalWS = TransformObjectToWorldNormal(i.normalOS);
                o.color = i.color; o.uv = TRANSFORM_TEX(i.uv, _MainTex); o.fog = ComputeFogFactor(p.positionCS.z);
                return o;
            }
            half4 frag (Varyings i, FRONT_FACE_TYPE face : FRONT_FACE_SEMANTIC) : SV_Target
            {
                UNITY_SETUP_INSTANCE_ID(i); UNITY_SETUP_STEREO_EYE_INDEX_POST_VERTEX(i);
                float3 n = normalize(i.normalWS) * IS_FRONT_VFACE(face, 1, -1);
                Light L = GetMainLight();
                half nl = saturate(dot(n, L.direction));
                half3 amb = SampleSH(n);
                half4 tex = SAMPLE_TEXTURE2D(_MainTex, sampler_MainTex, i.uv);
                half3 c = tex.rgb * i.color.rgb * _Color.rgb;
                half3 lit = c * (L.color * nl * 0.85h + amb * 0.9h + 0.12h);
                lit = lerp(lit, half3(1, 1, 1), _Flash);
                lit = MixFog(lit, i.fog);
                return half4(lit, 1);
            }
            ENDHLSL
        }
    }
}
