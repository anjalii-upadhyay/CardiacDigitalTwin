// Blood as one continuous flowing liquid. Each BloodFlowPath droplet is a tapered streak stretched along its own
// velocity (round when still, a jet when ejecting); the streaks are smooth-unioned and raymarched inside a box fitted
// around them each frame. Ripples are advected with the flow so highlights slide downstream. Writes real depth so the
// fluid sits correctly inside the heart cavities.
Shader "CardiacTwin/BloodLiquid"
{
    Properties
    {
        _Color ("Blood colour", Color) = (0.85, 0.06, 0.06, 1)
        _Blend ("Merge distance (x radius)", Range(0.1, 2)) = 1.1
        _Gloss ("Specular power", Range(16, 1024)) = 500
        _Ripple ("Surface ripple strength", Range(0, 1)) = 0.35
        _RippleScale ("Ripple size (x radius)", Range(0.2, 4)) = 1.2
    }
    SubShader
    {
        Tags { "Queue" = "Geometry+10" "RenderType" = "Opaque" }
        Pass
        {
            Tags { "LightMode" = "ForwardBase" }
            Cull Front   // back faces: still renders when the camera is inside the box
            ZWrite On
            ZTest LEqual // tested against SV_Depth (the fluid surface), not the box

            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma target 3.5
            #include "UnityCG.cginc"
            #include "Lighting.cginc"

            #define MAX_BALLS 128
            float4 _Balls[MAX_BALLS]; // xyz world head, w radius (0 = hidden)
            float4 _Tails[MAX_BALLS]; // xyz world tail (head - velocity * stretch), w speed m/s
            int _Count;
            float4 _Color;
            float _Blend, _Gloss, _Ripple, _RippleScale;

            struct v2f { float4 pos : SV_POSITION; float3 world : TEXCOORD0; };

            v2f vert(appdata_base v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.world = mul(unity_ObjectToWorld, v.vertex).xyz;
                return o;
            }

            float smin(float a, float b, float k)
            {
                float h = saturate(0.5 + 0.5 * (b - a) / k);
                return lerp(b, a, h) - k * h * (1 - h);
            }

            // Streak: full radius at the head, tapering toward the tail like a drop pulled along by the flow.
            float streak(float3 p, float3 a, float3 b, float r)
            {
                float3 pa = p - a, ba = b - a;
                float h = saturate(dot(pa, ba) / max(dot(ba, ba), 1e-12));
                return length(pa - ba * h) - r * (1 - 0.45 * h);
            }

            float sdf(float3 p)
            {
                float d = 1e5;
                for (int i = 0; i < MAX_BALLS; i++)
                {
                    if (i >= _Count) break;
                    float4 b = _Balls[i];
                    if (b.w <= 0) continue;
                    d = smin(d, streak(p, b.xyz, _Tails[i].xyz, b.w), b.w * _Blend);
                }
                return d;
            }

            float3 normalAt(float3 p, float e)
            {
                const float2 k = float2(1, -1);
                return normalize(k.xyy * sdf(p + k.xyy * e) + k.yyx * sdf(p + k.yyx * e) +
                                 k.yxy * sdf(p + k.yxy * e) + k.xxx * sdf(p + k.xxx * e));
            }

            float hash(float3 p)
            {
                p = frac(p * 0.3183099 + 0.1) * 17;
                return frac(p.x * p.y * p.z * (p.x + p.y + p.z));
            }

            float vnoise(float3 x)
            {
                float3 i = floor(x), f = frac(x);
                f = f * f * (3 - 2 * f);
                return lerp(lerp(lerp(hash(i), hash(i + float3(1, 0, 0)), f.x),
                                 lerp(hash(i + float3(0, 1, 0)), hash(i + float3(1, 1, 0)), f.x), f.y),
                            lerp(lerp(hash(i + float3(0, 0, 1)), hash(i + float3(1, 0, 1)), f.x),
                                 lerp(hash(i + float3(0, 1, 1)), hash(i + float3(1, 1, 1)), f.x), f.y), f.z);
            }

            // Noise gradient in streak-aligned space: compressed along the flow so ripples read as stretched streaks.
            float3 rippleGrad(float3 q, float3 dir)
            {
                q -= dir * dot(q, dir) * 0.65;
                const float e = 0.15;
                float n0 = vnoise(q);
                return float3(vnoise(q + float3(e, 0, 0)), vnoise(q + float3(0, e, 0)), vnoise(q + float3(0, 0, e))) - n0;
            }

            float4 frag(v2f i, out float depth : SV_Depth) : SV_Target
            {
                float3 ro = _WorldSpaceCameraPos;
                float3 rd = normalize(i.world - ro);

                // Only march the span of the ray that passes near a streak; most box pixels are discarded here.
                float tNear = 1e5, tFar = 0, rMin = 1e5;
                for (int j = 0; j < MAX_BALLS; j++)
                {
                    if (j >= _Count) break;
                    float4 b = _Balls[j];
                    if (b.w <= 0) continue;
                    float3 c = (b.xyz + _Tails[j].xyz) * 0.5;
                    float R = length(b.xyz - _Tails[j].xyz) * 0.5 + b.w * (1 + _Blend);
                    float3 oc = ro - c;
                    float pb = dot(oc, rd), h = pb * pb - (dot(oc, oc) - R * R);
                    if (h < 0) continue;
                    h = sqrt(h);
                    tNear = min(tNear, max(-pb - h, 0));
                    tFar = max(tFar, -pb + h);
                    rMin = min(rMin, b.w);
                }
                if (tFar <= tNear) discard;

                float t = tNear, d = 1;
                float eps = rMin * 0.02;
                for (int s = 0; s < 80; s++)
                {
                    d = sdf(ro + rd * t);
                    if (d < eps || t > tFar) break;
                    t += d * 0.9; // taper makes the field slightly non-exact
                }
                if (d >= eps) discard;

                float3 p = ro + rd * t;
                float3 n = normalAt(p, rMin * 0.05);

                // Local flow = the nearest streak's direction and speed.
                float best = 1e5, rad = rMin, speed = 0;
                float3 dir = float3(0, 1, 0);
                for (int m = 0; m < MAX_BALLS; m++)
                {
                    if (m >= _Count) break;
                    float4 b = _Balls[m];
                    if (b.w <= 0) continue;
                    float dm = streak(p, b.xyz, _Tails[m].xyz, b.w);
                    if (dm < best)
                    {
                        best = dm; rad = b.w; speed = _Tails[m].w;
                        float3 ab = b.xyz - _Tails[m].xyz;
                        dir = dot(ab, ab) > 1e-14 ? normalize(ab) : dir;
                    }
                }

                // Flow-map advection: two ripple layers sliding downstream, cross-faded half a period apart so the
                // pattern moves with the blood without stretching or popping when the speed changes beat to beat.
                float3 q = p / (rad * _RippleScale);
                float flow = min(speed / rad, 40) * 0.6;
                float ph0 = frac(_Time.y * 0.8), ph1 = frac(_Time.y * 0.8 + 0.5);
                float w0 = 1 - abs(1 - 2 * ph0);
                float3 g = rippleGrad(q - dir * flow * ph0 / 0.8, dir) * w0 +
                           rippleGrad(q - dir * flow * ph1 / 0.8 + 7.3, dir) * (1 - w0);
                float moving = saturate(speed / (rad * 4)); // pooled blood is glassy-smooth
                n = normalize(n - (g - n * dot(g, n)) * _Ripple * 6 * (0.3 + 0.7 * moving));

                float3 v = -rd;
                float3 l = normalize(_WorldSpaceLightPos0.xyz);
                float3 hv = normalize(l + v);
                float nv = saturate(dot(n, v));

                // Blood is a dense absorbing liquid: deep, saturated body (darker where we look straight into it),
                // a soft wrapped diffuse for the subsurface glow, sharp wet highlights and a water-like Fresnel sheen.
                float3 body = _Color.rgb * _Color.rgb;                     // squared = deeper, more saturated
                float3 thick = lerp(body * 0.3, body, pow(1 - nv, 1.5));  // edges thinner -> brighter
                float wrap = saturate((dot(n, l) + 0.5) / 1.5);
                float3 col = thick * (_LightColor0.rgb * wrap + ShadeSH9(float4(n, 1)) * 1.5);
                col += _Color.rgb * 0.06;                                  // keeps it readable inside dark cavities

                float spec = pow(saturate(dot(n, hv)), _Gloss) * (_Gloss + 8) / 25;
                float fres = 0.03 + 0.97 * pow(1 - nv, 5);
                float3 refl = DecodeHDR(UNITY_SAMPLE_TEXCUBE_LOD(unity_SpecCube0, reflect(rd, n), 0), unity_SpecCube0_HDR);
                col += _LightColor0.rgb * spec * 0.7 + refl * fres * 0.9;

                float4 clip = UnityWorldToClipPos(p);
                #if defined(UNITY_REVERSED_Z)
                depth = clip.z / clip.w;
                #else
                depth = clip.z / clip.w * 0.5 + 0.5;
                #endif
                return float4(col, 1);
            }
            ENDCG
        }
    }
}
