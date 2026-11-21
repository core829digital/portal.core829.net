/* eslint-disable */
// @ts-nocheck
// liquid-glass v1.1.1 (MIT, © zerowing) — https://github.com/MuhammadaliMS/liquid-glass
// Estensioni CORE829 (opzionali, l'HTML ufficiale resta invariato): proprieta' `source` (canvas/video live come sfondo),
// attributo `fixed-light` (riflesso fermo, niente punto di luce che segue il puntatore) e attributo `lazy` (il contesto
// WebGL esiste solo quando la scena e' entro 300px dal viewport: nessun limite di scene per pagina).
var me = Object.defineProperty;
var pe = (r, e, t) => e in r ? me(r, e, { enumerable: !0, configurable: !0, writable: !0, value: t }) : r[e] = t;
var d = (r, e, t) => pe(r, typeof e != "symbol" ? e + "" : e, t);
const ge = `precision highp float;
// The backdrop the glass bends: an image or video cropped to cover, or the built-in aurora.
uniform vec2 u_size;      // CSS pixels
uniform float u_dpr;
uniform float u_mode;     // 0: image or video, 1: aurora, 2: plain base colour (while an image loads)
uniform sampler2D u_image;
uniform vec4 u_crop;      // scale x, scale y, offset x, offset y (cover crop)
uniform float u_time;
uniform vec3 u_colors[4];
uniform vec3 u_base;
uniform float u_dim;       // 0..1, darkens the backdrop like a scrim

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 4; i++) { value += amplitude * noise(p); p = p * 2.03 + 11.7; amplitude *= 0.5; }
  return value;
}

// Four slow colour fields, folded by a noise flow, with fine contour lines so the glass
// always has edges to bend.
vec3 aurora(vec2 pixel) {
  vec2 q = pixel / max(u_size.x, u_size.y) * 2.4;
  float t = u_time * 0.045;
  vec2 warp = vec2(fbm(q + vec2(t, -t * 0.7)), fbm(q + vec2(-t * 0.6, t) + 5.2));
  vec2 p = q + warp * 1.35;
  vec3 color = u_base;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    vec2 center = vec2(0.6 + 1.1 * sin(t * (1.0 + fi * 0.37) + fi * 1.9), 0.55 + 0.75 * cos(t * (0.8 + fi * 0.29) + fi * 2.6));
    center *= vec2(max(u_size.x / u_size.y, 1.0), max(u_size.y / u_size.x, 1.0)) * 1.2;
    float reach = exp(-dot(p - center, p - center) * 1.15);
    color = mix(color, u_colors[i], clamp(reach * 1.25, 0.0, 1.0));
  }
  float height = fbm(p * 1.6 + t);
  float lines = abs(fract(height * 14.0) - 0.5);
  float line = 1.0 - smoothstep(0.0, 0.07, lines);
  color = mix(color, color * 1.35 + 0.06, line * 0.35);
  color += (hash(pixel + fract(u_time)) - 0.5) * 0.025;
  return color;
}

void main() {
  vec2 pixel = vec2(gl_FragCoord.x, u_size.y * u_dpr - gl_FragCoord.y) / u_dpr;
  vec2 uv = pixel / u_size;
  vec3 color;
  if (u_mode < 0.5) color = texture2D(u_image, vec2(u_crop.z + uv.x * u_crop.x, 1.0 - (u_crop.w + uv.y * u_crop.y))).rgb;
  else if (u_mode < 1.5) color = aurora(pixel);
  else color = u_base;
  gl_FragColor = vec4(color * (1.0 - u_dim), 1.0);
}
`, ve = `precision highp float;
uniform sampler2D u_background;
uniform vec2 u_size;
uniform vec2 u_step;

vec3 sampleLinear(vec2 uv) {
  return pow(texture2D(u_background, clamp(uv, 0.001, 0.999)).rgb, vec3(2.2));
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_size;
  vec3 color = vec3(0.0);
  float total = 0.0;
  // The cached wider Gaussian prevents tiny granules from becoming ridges
  // when the bevel compresses the transmitted image's sampling footprint.
  for (int y = -2; y <= 2; y++) {
    for (int x = -2; x <= 2; x++) {
      vec2 offset = vec2(float(x), float(y));
      float weight = exp(-dot(offset, offset) * 0.5);
      color += sampleLinear(uv + offset * u_step) * weight;
      total += weight;
    }
  }
  color /= total;
  gl_FragColor = vec4(pow(color, vec3(1.0 / 2.2)), 1.0);
}
`, ye = `precision highp float;
// Every glass panel on the scene as a real solid of glass. Each panel is a rounded slab with
// a domed crown and rounded edges, ray-traced from a camera straight in front of it: light
// refracts into the slab, travels through it (bouncing inside when it can't get out), refracts
// out and lands on the backdrop behind. That's what makes the backdrop magnify, flip and
// smear at the rim. The same model as the liquid-glass playground's pebble.
// MAX_PANES is defined by the renderer from what the device's GPU allows.
uniform sampler2D u_scene;
uniform sampler2D u_frost;
uniform vec2 u_size;      // CSS pixels
uniform float u_dpr;
uniform int u_count;
uniform vec4 u_rect[MAX_PANES];    // centre x, centre y, half width, half height (CSS px)
uniform vec4 u_look[MAX_PANES];    // corner radius, frost 0..1, chroma, pointer pull (px)
uniform vec4 u_tint[MAX_PANES];    // rgb, strength
uniform vec4 u_profile[MAX_PANES]; // half depth, edge rounding, dome, index of refraction
uniform vec4 u_lens[MAX_PANES];    // a raised disc on the face: x, y (from centre), radius, amount
uniform vec4 u_extra[MAX_PANES];   // sound glow 0..1, shadow 0..1, press highlight 0..1, unused
uniform vec2 u_light;              // light position, CSS px
uniform vec2 u_pointer;            // pointer position, CSS px
uniform float u_bands[6];          // sound, low to high
uniform float u_level;

const float CAMERA = 780.0;
const float BACKGROUND = -190.0;

// The selected panel, copied out of the arrays (GLSL ES 1.0 can't index them by a variable).
vec4 R; vec4 L; vec4 T; vec4 P; vec4 N; vec4 X;
vec2 pointerLocal;

vec3 sceneColor(vec2 pixel, float frost) {
  vec2 uv = clamp(vec2(pixel.x / u_size.x, 1.0 - pixel.y / u_size.y), 0.001, 0.999);
  vec3 clear = pow(texture2D(u_scene, uv).rgb, vec3(2.2));
  vec3 blurred = pow(texture2D(u_frost, uv).rgb, vec3(2.2));
  return mix(clear, blurred, clamp(frost, 0.0, 1.0));
}

float box(vec2 p, vec2 halfSize, float radius) {
  vec2 q = abs(p) - halfSize + radius;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - radius;
}

// The panel's outline: its rounded rectangle, bulging a little toward a nearby pointer.
float outline(vec2 p) {
  float radius = min(L.x, min(R.z, R.w));
  float d = box(p, R.zw, radius);
  vec2 toPointer = p - pointerLocal;
  return d - L.w * exp(-dot(toPointer, toPointer) / 1800.0);
}

vec3 field(vec2 p) {
  float d = outline(p);
  vec2 e = vec2(0.5, 0.0);
  vec2 n = vec2(outline(p + e.xy) - outline(p - e.xy), outline(p + e.yx) - outline(p - e.yx));
  return vec3(d, normalize(n + 1e-6));
}

// Rounded extrusion with a smooth convex crown; the gradient belongs to the same solid.
vec4 solid(vec3 p) {
  vec3 boundary = field(p.xy);
  vec2 radius = max(R.zw, vec2(20.0));
  float dome = P.z * exp(-1.5 * dot(p.xy / radius, p.xy / radius));
  vec2 domeGradient = -3.0 * dome * p.xy / (radius * radius);
  float rounding = P.y;
  vec2 q = vec2(boundary.x + rounding, abs(p.z) - P.x - dome + rounding);
  vec2 outside = max(q, 0.0);
  float outsideLength = length(outside);
  vec2 weights = outsideLength > 0.0001 ? outside / outsideLength : (q.x > q.y ? vec2(1.0, 0.0) : vec2(0.0, 1.0));
  float distance = min(max(q.x, q.y), 0.0) + outsideLength - rounding;
  vec3 gradient = weights.x * vec3(boundary.yz, 0.0) + weights.y * vec3(-domeGradient, sign(p.z));
  if (N.w > 0.02) {
    vec2 delta = p.xy - N.xy;
    vec2 lensQ = vec2(length(delta) - N.z + 8.0, abs(p.z - P.x - 5.0) - 2.0);
    vec2 lensOutside = max(lensQ, 0.0);
    float lensLength = length(lensOutside);
    vec2 lensWeights = lensLength > 0.0001 ? lensOutside / lensLength : (lensQ.x > lensQ.y ? vec2(1.0, 0.0) : vec2(0.0, 1.0));
    float lensDistance = min(max(lensQ.x, lensQ.y), 0.0) + lensLength - 8.0;
    vec3 lensGradient = vec3(delta / max(length(delta), 0.001) * lensWeights.x, sign(p.z - P.x - 5.0) * lensWeights.y);
    float blend = clamp(0.5 + 0.5 * (distance - lensDistance) / 2.5, 0.0, 1.0) * N.w;
    distance = mix(distance, lensDistance, blend) - 2.5 * blend * (1.0 - blend);
    gradient = mix(gradient, lensGradient, blend);
  }
  return vec4(distance, gradient);
}

bool enterSolid(vec3 origin, vec3 direction, out vec3 hit) {
  vec3 bounds = vec3(R.zw + L.w + 6.0, P.x + P.z + 10.0);
  vec3 inverseRay = 1.0 / (direction + vec3(0.000001));
  vec3 a = (-bounds - origin) * inverseRay;
  vec3 b = (bounds - origin) * inverseRay;
  vec3 nearBox = min(a, b);
  vec3 farBox = max(a, b);
  float nearDistance = max(max(nearBox.x, nearBox.y), nearBox.z);
  float farDistance = min(min(farBox.x, farBox.y), farBox.z);
  float travel = max(0.0, nearDistance);
  if (farDistance < travel) return false;
  for (int i = 0; i < 56; i++) {
    hit = origin + direction * travel;
    float distance = solid(hit).x;
    if (distance < 0.12) return true;
    travel += max(0.06, distance * 0.74);
    if (travel > farDistance) break;
  }
  return false;
}

vec3 exitSolid(vec3 origin, vec3 direction, out float traveled) {
  float travel = 0.6;
  vec3 point = origin + direction * travel;
  float limit = 2.0 * (R.z + R.w) + 2.0 * P.x;
  for (int i = 0; i < 48; i++) {
    point = origin + direction * travel;
    float distance = -solid(point).x;
    if (i > 1 && distance < 0.12) break;
    travel += max(0.10, distance * 0.74);
    if (travel > limit) break;
  }
  traveled = travel;
  return point;
}

vec3 environment(vec3 direction, vec2 pixel) {
  vec2 reflectedPixel = u_size * 0.5 + direction.xy * u_size * 0.42;
  vec3 reflectedScene = sceneColor(reflectedPixel, 0.9);
  float softbox = exp(-pow((direction.x + 0.42) / 0.16, 2.0) - pow((direction.y + 0.58) / 0.28, 4.0));
  float fill = exp(-pow((direction.x - 0.7) / 0.10, 2.0) - pow(direction.y / 0.55, 4.0));
  return mix(reflectedScene, sceneColor(pixel, 0.65), 0.20) + vec3(0.96, 0.98, 1.0) * (softbox * 1.65 + fill * 0.32);
}

float energy(vec2 p, vec2 origin, vec2 spread) {
  vec2 d = (p - origin) / spread;
  return exp(-dot(d, d));
}

void main() {
  vec2 pixel = vec2(gl_FragCoord.x, u_size.y * u_dpr - gl_FragCoord.y) / u_dpr;
  vec3 base = sceneColor(pixel, 0.0);

  // Later panels sit on top (a knob on its track); outside every panel, the nearest one wins.
  float nearest = 1e5;
  float shade = 0.0;
  for (int i = 0; i < MAX_PANES; i++) {
    if (i >= u_count) break;
    vec4 r = u_rect[i];
    float radius = min(u_look[i].x, min(r.z, r.w));
    vec2 local = pixel - r.xy;
    float d = box(local, r.zw, radius) - u_look[i].w;
    float lift = min(r.w, 40.0);
    float s = box(local - vec2(2.0, lift * 0.22), r.zw, radius);
    shade = max(shade, (1.0 - smoothstep(-lift * 0.3, lift * 0.8, s)) * u_extra[i].y);
    bool take = d < 2.0 || (nearest >= 2.0 && d < nearest);
    if (take) { nearest = d; R = r; L = u_look[i]; T = u_tint[i]; P = u_profile[i]; N = u_lens[i]; X = u_extra[i]; }
  }
  vec3 outside = base * (1.0 - shade * 0.16);
  if (nearest > 2.0 || u_count == 0) { gl_FragColor = vec4(pow(outside, vec3(1.0 / 2.2)), 1.0); return; }

  vec2 local = pixel - R.xy;
  pointerLocal = u_pointer - R.xy;
  vec3 origin = vec3(0.0, 0.0, CAMERA);
  vec3 viewRay = normalize(vec3(local, -CAMERA));
  vec3 direction = viewRay;
  vec3 front;
  if (!enterSolid(origin, direction, front)) {
    float contact = (1.0 - smoothstep(-2.0, 13.0, outline(local - vec2(2.0, 7.0)))) * 0.045;
    gl_FragColor = vec4(pow(outside * (1.0 - contact), vec3(1.0 / 2.2)), 1.0);
    return;
  }
  vec3 normal = normalize(solid(front).yzw);
  float ior = P.w;
  vec3 inside = refract(direction, normal, 1.0 / ior);
  float pathLength;
  vec3 rear = exitSolid(front, inside, pathLength);
  vec3 rearNormal = normalize(solid(rear).yzw);
  vec3 outgoing = refract(inside, -rearNormal, ior);
  // Follow one internal bounce instead of a dark band where the first exit totally reflects.
  if (dot(outgoing, outgoing) < 0.01) {
    inside = reflect(inside, rearNormal);
    float secondLength;
    rear = exitSolid(rear, inside, secondLength);
    pathLength += secondLength;
    rearNormal = normalize(solid(rear).yzw);
    outgoing = refract(inside, -rearNormal, ior);
    if (dot(outgoing, outgoing) < 0.01) outgoing = reflect(inside, rearNormal);
  }
  vec3 reflected = environment(reflect(viewRay, normal), pixel);
  vec3 transmitted;
  float frost = L.y;
  if (outgoing.z < -0.045) {
    float distance = (BACKGROUND - rear.z) / outgoing.z;
    vec2 backgroundPoint = (rear.xy + outgoing.xy * distance) * CAMERA / (CAMERA - BACKGROUND);
    vec2 rayPixel = R.xy + backgroundPoint;
    vec2 displacement = clamp(rayPixel - pixel, vec2(-180.0), vec2(180.0));
    float grazing = 1.0 - max(dot(normal, -viewRay), 0.0);
    float filtering = clamp(grazing * grazing * 1.6 + length(displacement) / 300.0 + frost, 0.02, 0.92);
    float chroma = L.z;
    vec3 red = sceneColor(pixel + displacement * (1.0 - chroma), filtering);
    vec3 green = sceneColor(pixel + displacement, filtering);
    vec3 blue = sceneColor(pixel + displacement * (1.0 + chroma), filtering);
    transmitted = vec3(red.r, green.g, blue.b);
  } else transmitted = environment(outgoing, pixel);
  transmitted *= exp(-vec3(0.00032, 0.00015, 0.00007) * min(pathLength, 250.0));
  transmitted = mix(transmitted, pow(T.rgb, vec3(2.2)), T.a);

  float f0 = pow((ior - 1.0) / (ior + 1.0), 2.0);
  float fresnel = f0 + (1.0 - f0) * pow(1.0 - max(dot(normal, -viewRay), 0.0), 5.0);
  vec3 color = mix(transmitted, reflected, fresnel);
  vec3 toLight = normalize(vec3(u_light - R.xy - front.xy, 500.0));
  vec3 halfVector = normalize(toLight - viewRay);
  color += vec3(0.97, 0.985, 1.0) * pow(max(dot(normal, halfVector), 0.0), 160.0) * (0.04 + X.z * 0.10);
  color *= 1.0 + X.z * 0.06;

  // Sound lights the glass from inside in six colours, low notes left to high notes right.
  if (X.x > 0.001) {
    vec2 q = front.xy / max(R.zw, vec2(1.0));
    vec3 glow = vec3(1.0, 0.45, 0.10) * u_bands[0] * energy(q, vec2(-0.39, 0.53), vec2(0.26, 0.53));
    glow += vec3(1.0, 0.19, 0.08) * u_bands[1] * energy(q, vec2(-0.20, 0.64), vec2(0.24, 0.48));
    glow += vec3(1.0, 0.025, 0.30) * u_bands[2] * energy(q, vec2(0.03, 0.61), vec2(0.28, 0.52));
    glow += vec3(0.47, 0.04, 1.0) * u_bands[3] * energy(q, vec2(0.28, 0.55), vec2(0.26, 0.53));
    glow += vec3(0.08, 0.23, 1.0) * u_bands[4] * energy(q, vec2(0.52, 0.38), vec2(0.23, 0.52));
    glow += vec3(0.035, 0.75, 1.0) * u_bands[5] * energy(q, vec2(-0.64, 0.17), vec2(0.17, 0.53));
    color += glow * u_level * 0.75 * X.x;
  }
  if (N.w > 0.5 && length(front.xy - N.xy) < N.z - 2.0) color = mix(color, sceneColor(pixel, 0.85), 0.15);

  float coverage = clamp(0.5 - nearest * u_dpr, 0.0, 1.0);
  color = mix(outside, color, max(coverage, step(nearest, -1.0)));
  gl_FragColor = vec4(pow(max(color, vec3(0.0)), vec3(1.0 / 2.2)), 1.0);
}
`;
function be(r, e, t, i) {
  if (![r, e, t, i].every((v) => Number.isFinite(v) && v > 0))
    throw new RangeError("Backdrop dimensions must be finite and positive.");
  const n = r / e, a = t / i, s = Math.min(1, n / a), g = Math.min(1, a / n);
  return [s, g, (1 - s) / 2, (1 - g) / 2];
}
function xe(r, e = () => new Image()) {
  return new Promise((t, i) => {
    const n = e();
    n.decoding = "async", n.crossOrigin = "anonymous", n.onload = () => {
      if (n.onload = null, n.onerror = null, n.naturalWidth <= 0 || n.naturalHeight <= 0) {
        i(new Error("The backdrop image has invalid image dimensions."));
        return;
      }
      t({ source: n, width: n.naturalWidth, height: n.naturalHeight });
    }, n.onerror = () => {
      n.onload = null, n.onerror = null, i(new Error("The backdrop image could not load; the procedural scene remains available."));
    }, n.src = r;
  });
}
const ne = 16, we = "attribute vec2 a_position; void main() { gl_Position = vec4(a_position, 0.0, 1.0); }";
function _e(r) {
  const e = r.getContext("webgl", { alpha: !1, antialias: !1, premultipliedAlpha: !1, powerPreference: "low-power" });
  if (!e) throw new Error("WebGL is unavailable.");
  const t = [], i = [];
  function n(c, m) {
    const w = e.createShader(c);
    if (!w) throw new Error("Unable to allocate a glass shader.");
    if (e.shaderSource(w, m), e.compileShader(w), !e.getShaderParameter(w, e.COMPILE_STATUS)) {
      const B = e.getShaderInfoLog(w);
      throw e.deleteShader(w), new Error(`Glass shader failed: ${B}`);
    }
    return t.push(w), w;
  }
  function a(c) {
    const m = e.createProgram();
    if (!m) throw new Error("Unable to allocate the glass renderer.");
    if (e.attachShader(m, n(e.VERTEX_SHADER, we)), e.attachShader(m, n(e.FRAGMENT_SHADER, c)), e.linkProgram(m), !e.getProgramParameter(m, e.LINK_STATUS)) throw new Error(`Glass renderer failed to link: ${e.getProgramInfoLog(m)}`);
    return i.push(m), m;
  }
  function s() {
    const c = e.createTexture();
    if (!c) throw new Error("Unable to allocate a glass texture.");
    return e.bindTexture(e.TEXTURE_2D, c), e.texParameteri(e.TEXTURE_2D, e.TEXTURE_MIN_FILTER, e.LINEAR), e.texParameteri(e.TEXTURE_2D, e.TEXTURE_MAG_FILTER, e.LINEAR), e.texParameteri(e.TEXTURE_2D, e.TEXTURE_WRAP_S, e.CLAMP_TO_EDGE), e.texParameteri(e.TEXTURE_2D, e.TEXTURE_WRAP_T, e.CLAMP_TO_EDGE), e.texImage2D(e.TEXTURE_2D, 0, e.RGBA, 1, 1, 0, e.RGBA, e.UNSIGNED_BYTE, new Uint8Array([20, 24, 40, 255])), c;
  }
  const g = a(ge), v = a(ve), h = Number(e.getParameter(e.MAX_FRAGMENT_UNIFORM_VECTORS)) || 64, p = Math.max(2, Math.min(ne, Math.floor((h - 16) / 6))), _ = a(`#define MAX_PANES ${p}
${ye}`), A = e.createBuffer(), f = s(), x = s(), C = s(), N = e.createFramebuffer(), y = e.createFramebuffer();
  if (!A || !N || !y) throw new Error("Unable to allocate glass buffers.");
  e.bindBuffer(e.ARRAY_BUFFER, A), e.bufferData(e.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), e.STATIC_DRAW);
  const R = (c, m) => Object.fromEntries(m.map((w) => [w, e.getUniformLocation(c, w)])), b = R(g, ["u_size", "u_dpr", "u_mode", "u_image", "u_crop", "u_time", "u_colors[0]", "u_base", "u_dim"]), T = R(v, ["u_background", "u_size", "u_step"]), l = R(_, ["u_scene", "u_frost", "u_size", "u_dpr", "u_count", "u_rect[0]", "u_look[0]", "u_tint[0]", "u_profile[0]", "u_lens[0]", "u_extra[0]", "u_light", "u_pointer", "u_bands[0]", "u_level"]), u = new Float32Array(p * 4), o = new Float32Array(p * 4), E = new Float32Array(p * 4), q = new Float32Array(p * 4), I = new Float32Array(p * 4), P = new Float32Array(p * 4), V = new Float32Array(6);
  let X = 1, U = 1, k = 1, M = !1, O = !1, H = 1, Q = 0, W = { width: 1, height: 1 }, j = new Float32Array([1, 0.35, 0.12, 1, 0.18, 0.54, 0.42, 0.23, 1, 0, 0.76, 1]), K = new Float32Array([0.04, 0.03, 0.12]);
  function $(c) {
    e.useProgram(c), e.bindBuffer(e.ARRAY_BUFFER, A);
    const m = e.getAttribLocation(c, "a_position");
    e.enableVertexAttribArray(m), e.vertexAttribPointer(m, 2, e.FLOAT, !1, 0, 0);
  }
  function J(c, m, w, B) {
    if (e.bindTexture(e.TEXTURE_2D, m), e.texImage2D(e.TEXTURE_2D, 0, e.RGBA, w, B, 0, e.RGBA, e.UNSIGNED_BYTE, null), e.bindFramebuffer(e.FRAMEBUFFER, c), e.framebufferTexture2D(e.FRAMEBUFFER, e.COLOR_ATTACHMENT0, e.TEXTURE_2D, m, 0), e.checkFramebufferStatus(e.FRAMEBUFFER) !== e.FRAMEBUFFER_COMPLETE) throw new Error("A glass framebuffer is incomplete.");
  }
  function ae(c, m) {
    X = Math.max(1, c), U = Math.max(1, m), k = Math.min(window.devicePixelRatio || 1, 1.5), r.width = Math.round(X * k), r.height = Math.round(U * k), J(N, x, r.width, r.height), J(y, C, Math.max(1, Math.ceil(r.width / 4)), Math.max(1, Math.ceil(r.height / 4))), e.bindFramebuffer(e.FRAMEBUFFER, null), M = !0;
  }
  function le(c, m = 1, w = 1) {
    H = c === "wait" ? 2 : c ? 0 : 1, !(!c || c === "wait") && (W = { width: Math.max(1, m), height: Math.max(1, w) }, e.bindTexture(e.TEXTURE_2D, f), e.pixelStorei(e.UNPACK_FLIP_Y_WEBGL, !0), e.texImage2D(e.TEXTURE_2D, 0, e.RGBA, e.RGBA, e.UNSIGNED_BYTE, c), e.pixelStorei(e.UNPACK_FLIP_Y_WEBGL, !1));
  }
  function ce(c, m) {
    j = new Float32Array(Array.from({ length: 4 }, (w, B) => c[B % c.length]).flat()), K = new Float32Array(m);
  }
  function de(c) {
    Q = Math.min(0.9, Math.max(0, Number.isFinite(c) ? c : 0));
  }
  function ue(c) {
    if (O || !M) return;
    e.bindFramebuffer(e.FRAMEBUFFER, N), e.viewport(0, 0, r.width, r.height), $(g), e.activeTexture(e.TEXTURE0), e.bindTexture(e.TEXTURE_2D, f), e.uniform1i(b.u_image, 0), e.uniform2f(b.u_size, X, U), e.uniform1f(b.u_dpr, k), e.uniform1f(b.u_mode, H), e.uniform4f(b.u_crop, ...be(X, U, W.width, W.height)), e.uniform1f(b.u_time, c), e.uniform3fv(b["u_colors[0]"], j), e.uniform3fv(b.u_base, K), e.uniform1f(b.u_dim, Q), e.drawArrays(e.TRIANGLES, 0, 3);
    const m = Math.max(1, Math.ceil(r.width / 4)), w = Math.max(1, Math.ceil(r.height / 4));
    e.bindFramebuffer(e.FRAMEBUFFER, y), e.viewport(0, 0, m, w), $(v), e.bindTexture(e.TEXTURE_2D, x), e.uniform1i(T.u_background, 0), e.uniform2f(T.u_size, m, w), e.uniform2f(T.u_step, 5 * k / r.width, 5 * k / r.height), e.drawArrays(e.TRIANGLES, 0, 3), e.bindFramebuffer(e.FRAMEBUFFER, null);
  }
  function he(c, m, w, B) {
    if (O || !M) return;
    const Z = Math.min(p, c.length);
    for (let F = 0; F < Z; F += 1) {
      const S = c[F];
      u.set([S.x, S.y, S.halfWidth, S.halfHeight], F * 4), o.set([S.radius, S.frost, S.chroma, S.pull], F * 4), E.set(S.tint, F * 4), q.set([S.depth, S.rounding, S.dome, S.ior], F * 4), I.set(S.lens, F * 4), P.set([S.glow, S.shadow, S.press, 0], F * 4);
    }
    for (let F = 0; F < 6; F += 1) V[F] = Number(B.bands[F]) || 0;
    e.bindFramebuffer(e.FRAMEBUFFER, null), e.viewport(0, 0, r.width, r.height), $(_), e.activeTexture(e.TEXTURE0), e.bindTexture(e.TEXTURE_2D, x), e.activeTexture(e.TEXTURE1), e.bindTexture(e.TEXTURE_2D, C), e.uniform1i(l.u_scene, 0), e.uniform1i(l.u_frost, 1), e.uniform2f(l.u_size, X, U), e.uniform1f(l.u_dpr, k), e.uniform1i(l.u_count, Z), e.uniform4fv(l["u_rect[0]"], u), e.uniform4fv(l["u_look[0]"], o), e.uniform4fv(l["u_tint[0]"], E), e.uniform4fv(l["u_profile[0]"], q), e.uniform4fv(l["u_lens[0]"], I), e.uniform4fv(l["u_extra[0]"], P), e.uniform2f(l.u_light, m.x, m.y), e.uniform2f(l.u_pointer, w.x, w.y), e.uniform1fv(l["u_bands[0]"], V), e.uniform1f(l.u_level, Math.min(1, Math.max(0, B.level))), e.drawArrays(e.TRIANGLES, 0, 3), e.activeTexture(e.TEXTURE0);
  }
  function fe() {
    O || (O = !0, t.forEach((c) => e.deleteShader(c)), i.forEach((c) => e.deleteProgram(c)), [f, x, C].forEach((c) => e.deleteTexture(c)), e.deleteFramebuffer(N), e.deleteFramebuffer(y), e.deleteBuffer(A), e.getExtension("WEBGL_lose_context")?.loseContext());
  }
  return { resize: ae, setSource: le, setAurora: ce, setDim: de, drawScene: ue, drawGlass: he, destroy: fe, maxPanes: p };
}
const Ee = [[30, 120], [120, 300], [300, 700], [700, 1600], [1600, 4e3], [4e3, 1e4]];
function Ae(r, e, t, i = new Float32Array(6)) {
  if (!Number.isFinite(e) || e <= 0 || !Number.isInteger(t) || t < 32 || t > 32768 || (t & t - 1) !== 0 || r.length !== t / 2 || i.length < 6)
    throw new RangeError("Audio analysis needs a valid sample rate, power-of-two FFT and matching spectrum.");
  const n = e / t;
  return Ee.forEach(([a, s], g) => {
    const v = Math.max(1, Math.ceil(a / n)), h = Math.min(r.length, Math.ceil(s / n));
    let p = 0, _ = 0;
    for (let f = v; f < h; f += 1) {
      const x = r[f] / 255;
      p += x * x, _ = Math.max(_, x);
    }
    const A = h > v ? Math.sqrt(p / (h - v)) : 0;
    i[g] = Math.min(1, (A * 0.4 + _ * 0.6) * 1.3);
  }), i;
}
function Se(r) {
  const e = !!r.getUserMedia && !!r.createAudioContext;
  let t = { status: e ? "idle" : "unavailable", message: e ? "" : "Microphone analysis is not supported in this browser. The visual demo still works." }, i = null, n = null, a = null, s = null, g = new Uint8Array(0), v = new Float32Array(0);
  const h = new Float32Array(6), p = { bands: new Float32Array(6), level: 0 };
  let _ = 0, A = null;
  async function f() {
    const y = i, R = n, b = a, T = s;
    i = null, n = null, a = null, s = null, b?.disconnect(), T?.disconnect(), R?.getTracks().forEach((l) => l.stop()), p.bands.fill(0), p.level = 0, y && y.state !== "closed" && await y.close().catch(() => {
    });
  }
  async function x() {
    _ += 1, t = { status: e ? "idle" : "unavailable", message: e ? "" : t.message }, await f();
  }
  function C() {
    if (!e) return Promise.resolve(!1);
    if (t.status === "live") return Promise.resolve(!0);
    if (t.status === "requesting" && A) return A;
    const y = ++_;
    t = { status: "requesting", message: "Allow microphone access in your browser, or cancel to keep exploring." };
    const R = (async () => {
      try {
        const b = r.createAudioContext();
        i = b;
        const T = b.resume().then(() => null, (o) => o), l = await r.getUserMedia({ audio: { echoCancellation: !0, noiseSuppression: !0, autoGainControl: !0 }, video: !1 });
        if (y !== _)
          return l.getTracks().forEach((o) => o.stop()), !1;
        n = l;
        const u = await T;
        if (u) throw u;
        return y !== _ ? !1 : (a = b.createMediaStreamSource(l), s = b.createAnalyser(), s.fftSize = 4096, s.minDecibels = -90, s.maxDecibels = -15, s.smoothingTimeConstant = 0.55, g = new Uint8Array(s.frequencyBinCount), v = new Float32Array(s.fftSize), a.connect(s), l.getAudioTracks().forEach((o) => o.addEventListener("ended", () => {
          x();
        }, { once: !0 })), t = { status: "live", message: "Microphone on. Audio is analysed on this device; nothing is saved or uploaded." }, !0);
      } catch (b) {
        if (y !== _ || (await f(), y !== _)) return !1;
        const T = b && typeof b == "object" && "name" in b && typeof b.name == "string" ? b.name : "";
        return t = T === "NotAllowedError" || T === "SecurityError" ? { status: "denied", message: "Microphone permission was not allowed. You can allow it in your browser and try again; the demo still works." } : { status: "error", message: T === "NotFoundError" ? "No microphone was found. Connect one and try again, or use the visual demo." : "The microphone could not be started. Check your device and browser permissions, then try again." }, !1;
      }
    })();
    return A = R, R.finally(() => {
      A === R && (A = null);
    }), R;
  }
  function N(y) {
    return t.status !== "live" || !s || !i ? p : ie(s, i.sampleRate, y, p, h, g, v);
  }
  return { start: C, stop: x, read: N, getState: () => ({ ...t }) };
}
function ie(r, e, t, i, n, a, s) {
  r.getByteFrequencyData(a), r.getFloatTimeDomainData(s), Ae(a, e, r.fftSize, n);
  let g = 0;
  for (const A of s) g += A * A;
  const v = Math.sqrt(g / s.length), h = Math.min(1, Math.max(0, (v - 6e-3) / 0.012)), p = Math.min(0.1, Math.max(0, Number.isFinite(t) ? t : 0));
  n.forEach((A, f) => {
    const x = A * h, C = x > i.bands[f] ? 0.045 : 0.23;
    i.bands[f] += (x - i.bands[f]) * (1 - Math.exp(-p / C));
  });
  const _ = Math.min(1, Math.max(0, (v - 6e-3) * 9));
  return i.level += (_ - i.level) * (1 - Math.exp(-p / (_ > i.level ? 0.04 : 0.2))), i;
}
function Me(r) {
  const e = r.context.createAnalyser();
  e.fftSize = 4096, e.minDecibels = -90, e.maxDecibels = -15, e.smoothingTimeConstant = 0.55, r.connect(e);
  const t = { bands: new Float32Array(6), level: 0 }, i = new Float32Array(6), n = new Uint8Array(e.frequencyBinCount), a = new Float32Array(e.fftSize);
  let s = !0;
  return {
    read: (g) => s ? ie(e, r.context.sampleRate, g, t, i, n, a) : t,
    disconnect: () => {
      if (s) {
        s = !1;
        try {
          r.disconnect(e);
        } catch {
        }
        t.bands.fill(0), t.level = 0;
      }
    }
  };
}
function L(r, e, t) {
  return Math.min(t, Math.max(e, r));
}
function z(r, e, t, i, n = 420, a = 18) {
  const s = L(Number.isFinite(i) ? i : 0, 0, 0.06666666666666667), g = Math.max(1, Math.ceil(s / (1 / 240))), v = s / g;
  let h = r, p = e;
  for (let _ = 0; _ < g; _ += 1)
    p += ((t - h) * n - p * a) * v, h += p * v;
  return [h, p];
}
function Re(r, e, t) {
  const i = (r || "").trim().split(/\s+/)[0] ?? "", n = parseFloat(i);
  if (!Number.isFinite(n) || n <= 0) return 0;
  const a = Math.min(e, t), s = i.endsWith("%") ? n / 100 * a : n;
  return L(s, 0, a / 2);
}
function D(r, e, t = -1 / 0, i = 1 / 0) {
  const n = parseFloat(r);
  return Number.isFinite(n) ? L(n, t, i) : e;
}
function Te(r) {
  const e = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)/.exec(r || "");
  if (!e) return null;
  const t = e[4], i = t === void 0 ? 1 : t.endsWith("%") ? parseFloat(t) / 100 : parseFloat(t);
  return [Number(e[1]) / 255, Number(e[2]) / 255, Number(e[3]) / 255, L(i, 0, 1)];
}
function Fe(r) {
  return /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(r);
}
const ke = [[1, 0.35, 0.12], [1, 0.18, 0.54], [0.42, 0.23, 1], [0, 0.76, 1]], Ce = [0.04, 0.03, 0.12], ee = `
:host { display: block; position: relative; isolation: isolate; overflow: hidden; min-height: 120px; color: #fff; background: #0a0818; }
:host([hidden]) { display: none; }
canvas { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 0; pointer-events: none; opacity: 0; transition: opacity .5s; }
:host([data-ready]) canvas { opacity: 1; }
.fallback { position: absolute; inset: 0; z-index: 0; background: var(--image, linear-gradient(120deg, #ff5a1f, #ff2d8a 35%, #6a3bff 65%, #00c2ff)) center / cover no-repeat; }
:host([data-renderer='webgl'][data-ready]) .fallback { display: none; }
.content { position: relative; z-index: 1; height: 100%; }`, re = document.createElement("template");
re.innerHTML = '<div class="fallback" part="fallback"></div><canvas part="canvas" aria-hidden="true"></canvas><div class="content" part="content"><slot></slot></div>';
const te = `
liquid-glass [glass] { -webkit-tap-highlight-color: transparent; }
liquid-glass [glass-drag] { touch-action: none; cursor: grab; user-select: none; }
liquid-glass [glass-drag]:active { cursor: grabbing; }
liquid-glass:not([data-renderer='webgl']) [glass] { background: rgba(255,255,255,.16); border: 1px solid rgba(255,255,255,.38); box-shadow: inset 0 1px 1px rgba(255,255,255,.6), 0 10px 30px rgba(0,0,0,.18); backdrop-filter: blur(14px) saturate(1.7); -webkit-backdrop-filter: blur(14px) saturate(1.7); }`;
function oe(r) {
  if (!("adoptedStyleSheets" in Document.prototype) || !("replaceSync" in CSSStyleSheet.prototype)) return null;
  try {
    const e = new CSSStyleSheet();
    return e.replaceSync(r), e;
  } catch {
    return null;
  }
}
let Y, G;
function Pe(r) {
  if (Y === void 0 && (Y = oe(ee)), Y) {
    r.adoptedStyleSheets = [...r.adoptedStyleSheets, Y];
    return;
  }
  const e = document.createElement("style");
  e.textContent = ee, r.prepend(e);
}
function De() {
  if (G === void 0 && (G = oe(te)), G) {
    document.adoptedStyleSheets.includes(G) || (document.adoptedStyleSheets = [...document.adoptedStyleSheets, G]);
    return;
  }
  if (document.getElementById("liquid-glass-style")) return;
  const r = document.createElement("style");
  r.id = "liquid-glass-style", r.textContent = te, document.head.append(r);
}
class se extends HTMLElement {
  constructor() {
    super();
    d(this, "canvas");
    d(this, "fallback");
    d(this, "renderer", null);
    d(this, "states", /* @__PURE__ */ new WeakMap());
    d(this, "colorProbe", document.createElement("span"));
    d(this, "colorCache", /* @__PURE__ */ new Map());
    d(this, "motionQuery", window.matchMedia("(prefers-reduced-motion: reduce)"));
    d(this, "events", null);
    d(this, "resizeObserver", null);
    d(this, "visibility", null);
    d(this, "mutations", null);
    d(this, "video", null);
    d(this, "wakeObserver", null);
    /** A live canvas or video drawn by the page itself (CORE829 extension): refracted every frame like a video backdrop. */
    d(this, "live", null);
    d(this, "animatedScene", !0);
    d(this, "sceneDirty", !0);
    d(this, "stylesDirty", !0);
    d(this, "onScreen", !0);
    d(this, "frameId", 0);
    d(this, "frameCount", 0);
    d(this, "lastFrame", 0);
    d(this, "time", 0);
    d(this, "width", 1);
    d(this, "height", 1);
    d(this, "lastSignature", "");
    d(this, "backdropRequest", 0);
    d(this, "pointer", { x: 0, y: 0, inside: !1, down: !1, target: null });
    d(this, "light", { x: 0, y: 0, vx: 0, vy: 0 });
    d(this, "bulge", { x: -1e4, y: -1e4, vx: 0, vy: 0 });
    d(this, "microphone", null);
    d(this, "node", null);
    d(this, "manualAudio", null);
    d(this, "silent", { bands: new Float32Array(6), level: 0 });
    d(this, "demo", { bands: new Float32Array(6), level: 0 });
    d(this, "level", 0);
    d(this, "lastAudioStatus", "");
    d(this, "liveSince", 0);
    const t = this.attachShadow({ mode: "open" });
    Pe(t), t.append(re.content.cloneNode(!0)), this.canvas = t.querySelector("canvas"), this.fallback = t.querySelector(".fallback"), this.colorProbe.hidden = !0, t.append(this.colorProbe), De();
  }
  /** 'aurora' (default), or the URL of an image or video to refract. */
  get backdrop() {
    return this.getAttribute("backdrop") || "aurora";
  }
  set backdrop(t) {
    this.setAttribute("backdrop", t);
  }
  /**
   * Optional extension: a live <canvas> (or <video>) element used as the backdrop instead of the `backdrop` attribute.
   * It is read every frame, so an interactive WebGL background stays interactive. Set it to null to go back to `backdrop`.
   */
  get source() {
    return this.live;
  }
  set source(t) {
    this.live = t, t ? (this.video?.pause(), this.video = null, this.renderer?.setSource("wait"), this.animatedScene = !0, this.sceneDirty = !0) : this.applyBackdrop();
  }
  /** The glass elements this scene renders (at most 16). */
  get panes() {
    return Array.from(this.querySelectorAll("[glass]")).slice(0, this.renderer?.maxPanes ?? ne);
  }
  /** The microphone's state: idle, requesting, live, denied, unavailable or error. */
  get microphoneState() {
    return this.mic().getState();
  }
  /** When the microphone went live (performance.now() time), for a recording timer. */
  get listeningSince() {
    return this.liveSince;
  }
  /** Ask for the microphone and let the glass glow with it. Call from a click or a key press. */
  async startMicrophone() {
    const t = this.mic().start();
    this.syncAudio();
    const i = await t;
    return i && (this.liveSince = performance.now()), this.syncAudio(), i;
  }
  /** Stop the microphone and release the device. */
  stopMicrophone() {
    this.microphone && (this.microphone.stop(), this.syncAudio());
  }
  /** Let any Web Audio node light the glass (a player, a synth). Returns a function that stops listening. */
  listen(t) {
    this.node?.disconnect();
    const i = Me(t);
    return this.node = i, () => {
      i.disconnect(), this.node === i && (this.node = null);
    };
  }
  /** Drive the glow with your own levels: six bands (low to high) and an overall level, 0 to 1. null stops. */
  setAudio(t) {
    if (!t) {
      this.manualAudio = null;
      return;
    }
    const i = new Float32Array(6);
    for (let n = 0; n < 6; n += 1) i[n] = L(Number(t.bands[n]) || 0, 0, 1);
    this.manualAudio = { bands: i, level: L(Number(t.level) || 0, 0, 1) };
  }
  mic() {
    return this.microphone ?? (this.microphone = Se({
      getUserMedia: navigator.mediaDevices?.getUserMedia ? (t) => navigator.mediaDevices.getUserMedia(t) : void 0,
      createAudioContext: typeof window.AudioContext == "function" ? () => new AudioContext() : void 0
    })), this.microphone;
  }
  syncAudio() {
    const t = this.mic().getState();
    t.status !== this.lastAudioStatus && (this.lastAudioStatus = t.status, this.dataset.audio = t.status, this.dispatchEvent(new CustomEvent("microphone-change", { detail: t, bubbles: !0, composed: !0 })));
  }
  connectedCallback() {
    this.events = new AbortController();
    const t = this.events.signal, i = this.hasAttribute("lazy");
    i ? this.dataset.renderer = "idle" : this.wake(), this.resizeObserver = new ResizeObserver(() => this.resize()), this.resizeObserver.observe(this), this.visibility = new IntersectionObserver(([n]) => {
      this.onScreen = n.isIntersecting, this.onScreen ? this.start() : this.stop();
    }), this.visibility.observe(this), this.mutations = new MutationObserver(() => {
      this.stylesDirty = !0;
    }), this.mutations.observe(this, { subtree: !0, childList: !0, attributes: !0 }), i ? (this.wakeObserver = new IntersectionObserver(([n]) => {
      n.isIntersecting ? this.wake() : this.sleep();
    }, { rootMargin: "300px 0px" }), this.wakeObserver.observe(this)) : (this.resize(), this.applyDim(), this.applyBackdrop()), this.addEventListener("pointermove", (n) => this.movePointer(n), { passive: !0, signal: t }), this.addEventListener("pointerenter", (n) => this.movePointer(n), { passive: !0, signal: t }), this.addEventListener("pointerleave", () => {
      this.pointer.inside = !1;
    }, { signal: t }), this.addEventListener("pointerdown", (n) => this.press(n), { signal: t }), window.addEventListener("pointerup", (n) => this.release(n), { signal: t }), window.addEventListener("pointercancel", (n) => this.release(n), { signal: t }), window.addEventListener("pointermove", (n) => this.dragMove(n), { passive: !0, signal: t }), document.addEventListener("visibilitychange", () => {
      document.hidden ? (this.stop(), this.stopMicrophone()) : this.start();
    }, { signal: t }), this.canvas.addEventListener("webglcontextlost", (n) => {
      n.preventDefault(), this.renderer && (this.renderer.destroy(), this.renderer = null, this.dataset.renderer = "css");
    }, { signal: t }), this.start();
  }
  /** Creates the WebGL renderer (immediately, or when a lazy scene comes near the viewport). */
  wake() {
    if (!this.renderer) {
      try {
        this.renderer = _e(this.canvas), this.dataset.renderer = "webgl";
      } catch (t) {
        console.warn("liquid-glass: WebGL is unavailable, using frosted CSS glass.", t), this.dataset.renderer = "css";
        return;
      }
      this.isConnected && this.hasAttribute("lazy") && (this.resize(), this.applyDim(), this.applyBackdrop(), this.stylesDirty = !0, this.sceneDirty = !0, this.start());
    }
  }
  /** Releases the WebGL context of a lazy scene that is far from the viewport. */
  sleep() {
    if (!this.renderer) return;
    this.stop(), this.renderer.destroy(), this.renderer = null, this.video?.pause(), delete this.dataset.ready, this.dataset.renderer = "idle", this.lastSignature = "";
    const t = this.canvas.cloneNode(!1);
    this.canvas.replaceWith(t), this.canvas = t, this.canvas.addEventListener("webglcontextlost", (i) => {
      i.preventDefault(), this.renderer && (this.renderer.destroy(), this.renderer = null, this.dataset.renderer = "css");
    });
  }
  disconnectedCallback() {
    this.wakeObserver?.disconnect(), this.wakeObserver = null, this.stop(), this.events?.abort(), this.resizeObserver?.disconnect(), this.visibility?.disconnect(), this.mutations?.disconnect(), this.video?.pause(), this.video = null, this.microphone?.stop(), this.node?.disconnect(), this.node = null, this.renderer?.destroy(), this.renderer = null, delete this.dataset.ready;
  }
  attributeChangedCallback(t, i, n) {
    i === n || !this.isConnected || ((t === "backdrop" || t === "colors") && this.applyBackdrop(), t === "dim" && this.applyDim());
  }
  // ---- the backdrop
  applyBackdrop() {
    const t = ++this.backdropRequest;
    if (this.live) {
      this.renderer?.setSource("wait"), this.animatedScene = !0, this.sceneDirty = !0;
      return;
    }
    const i = this.backdrop.trim();
    if (this.video?.pause(), this.video = null, i === "aurora" || !i) {
      this.renderer?.setAurora(this.auroraColors(), Ce), this.renderer?.setSource(null), this.fallback.style.removeProperty("--image"), this.animatedScene = !0, this.sceneDirty = !0, this.dataset.ready = "";
      return;
    }
    if (this.fallback.style.setProperty("--image", `url("${i.replace(/"/g, "%22")}")`), this.renderer?.setSource("wait"), this.sceneDirty = !0, Fe(i)) {
      const n = document.createElement("video");
      Object.assign(n, { muted: !0, loop: !0, playsInline: !0, autoplay: !0, crossOrigin: "anonymous", src: i }), n.setAttribute("muted", ""), this.video = n, this.animatedScene = !0, n.addEventListener("playing", () => {
        t === this.backdropRequest && (this.dataset.ready = "");
      }, { once: !0 }), n.play().catch(() => {
      });
      return;
    }
    this.animatedScene = !1, xe(i).then((n) => {
      t === this.backdropRequest && (this.renderer?.setSource(n.source, n.width, n.height), this.sceneDirty = !0, this.dataset.ready = "");
    }).catch((n) => {
      t === this.backdropRequest && (console.warn(`liquid-glass: the backdrop "${i}" could not load (images on other sites need CORS headers). Showing the aurora.`, n), this.renderer?.setSource(null), this.animatedScene = !0, this.sceneDirty = !0, this.dataset.ready = "");
    });
  }
  applyDim() {
    const t = D(this.getAttribute("dim") ?? "", 0, 0, 0.9);
    this.renderer?.setDim(t), this.fallback.style.filter = t ? `brightness(${1 - t})` : "", this.sceneDirty = !0;
  }
  auroraColors() {
    const t = (this.getAttribute("colors") || "").split(/[\s,]+/).filter(Boolean).map((i) => this.resolveColor(i)).filter((i) => i[3] > 0);
    return t.length ? t.map(([i, n, a]) => [i, n, a]) : ke;
  }
  // ---- reading the panes
  resolveColor(t) {
    const i = this.colorCache.get(t);
    if (i) return i;
    this.colorProbe.style.color = "", this.colorProbe.style.color = t;
    const n = (this.colorProbe.style.color ? Te(getComputedStyle(this.colorProbe).color) : null) ?? [0, 0, 0, 0];
    return this.colorCache.set(t, n), n;
  }
  readLook(t, i, n) {
    const a = getComputedStyle(t), s = Math.min(i, n) / 2, g = a.getPropertyValue("--glass-tint").trim(), v = a.getPropertyValue("--glass-lens").trim().split(/[\s,]+/).map(Number), h = Math.min(44, Math.max(s * 0.36, Math.min(s * 0.7, 14))) * D(a.getPropertyValue("--glass-depth"), 1, 0.2, 3);
    return {
      radius: Re(a.borderTopLeftRadius, i, n),
      frost: D(a.getPropertyValue("--glass-frost"), 0, 0, 1),
      chroma: D(a.getPropertyValue("--glass-chroma"), 8e-3, 0, 0.1),
      pull: D(a.getPropertyValue("--glass-pull"), Math.min(9, s * 0.3), 0, 40),
      tint: g ? this.resolveColor(g) : [1, 1, 1, 0],
      depth: h,
      rounding: Math.min(h * 0.73, s * 0.9),
      dome: h * 0.48 * D(a.getPropertyValue("--glass-dome"), 1, 0, 4),
      ior: D(a.getPropertyValue("--glass-ior"), 1.38, 1.05, 2.4),
      lens: v.length === 3 && v.every(Number.isFinite) ? [v[0], v[1], v[2]] : null,
      glow: D(a.getPropertyValue("--glass-glow"), 1, 0, 2),
      shadow: D(a.getPropertyValue("--glass-shadow"), 1, 0, 1),
      press: D(a.getPropertyValue("--glass-press"), 1.045, 0.8, 1.3)
    };
  }
  state(t) {
    let i = this.states.get(t);
    return i || (i = { scale: 1, scaleVelocity: 0, glow: 0, glowVelocity: 0, stretchX: 1, stretchXVelocity: 0, stretchY: 1, stretchYVelocity: 0, look: null, drag: null, offsetX: 0, offsetY: 0, lens: [0, 0, 0, 0], lensVelocity: [0, 0, 0, 0] }, this.states.set(t, i)), i;
  }
  // ---- pointer: light, press, drag
  movePointer(t) {
    const i = this.getBoundingClientRect();
    this.pointer.x = t.clientX - i.left, this.pointer.y = t.clientY - i.top, this.pointer.inside = !0;
  }
  press(t) {
    this.movePointer(t);
    const i = t.target?.closest?.("[glass]");
    if (!(!i || !this.contains(i)) && (this.pointer.down = !0, this.pointer.target = i, i.hasAttribute("glass-drag"))) {
      const n = this.state(i);
      n.drag = { pointer: t.pointerId, startX: t.clientX, startY: t.clientY, baseX: n.offsetX, baseY: n.offsetY, lastX: t.clientX, lastY: t.clientY, lastT: t.timeStamp, vx: 0, vy: 0 }, i.setPointerCapture?.(t.pointerId);
    }
  }
  dragMove(t) {
    const i = this.pointer.target, n = i ? this.states.get(i)?.drag : null;
    if (!i || !n || n.pointer !== t.pointerId) return;
    const a = this.state(i), s = Math.max(1, t.timeStamp - n.lastT) / 1e3;
    n.vx = n.vx * 0.6 + (t.clientX - n.lastX) / s * 0.4, n.vy = n.vy * 0.6 + (t.clientY - n.lastY) / s * 0.4, n.lastX = t.clientX, n.lastY = t.clientY, n.lastT = t.timeStamp, a.offsetX = n.baseX + t.clientX - n.startX, a.offsetY = n.baseY + t.clientY - n.startY, i.style.translate = `${a.offsetX}px ${a.offsetY}px`;
  }
  release(t) {
    const i = this.pointer.target;
    if (i) {
      const n = this.states.get(i);
      n?.drag && n.drag.pointer === t.pointerId && (n.drag = null);
    }
    this.pointer.down = !1, this.pointer.target = null;
  }
  // ---- the frame loop
  resize() {
    const t = this.getBoundingClientRect();
    this.width = Math.max(1, t.width), this.height = Math.max(1, t.height);
    try {
      this.renderer?.resize(this.width, this.height);
    } catch (i) {
      console.warn(i), this.renderer?.destroy(), this.renderer = null, this.dataset.renderer = "css";
    }
    this.sceneDirty = !0, this.stylesDirty = !0, this.lastSignature = "";
  }
  start() {
    this.frameId || !this.isConnected || !this.onScreen || document.hidden || (this.lastFrame = performance.now(), this.frameId = requestAnimationFrame((t) => this.frame(t)));
  }
  stop() {
    cancelAnimationFrame(this.frameId), this.frameId = 0;
  }
  frame(t) {
    this.frameId = requestAnimationFrame((l) => this.frame(l));
    const i = this.renderer;
    if (!i) return;
    const n = L((t - this.lastFrame) / 1e3, 0, 1 / 15);
    this.lastFrame = t, this.frameCount += 1;
    const a = this.motionQuery.matches || this.hasAttribute("reduce-motion"), s = this.live;
    if (s) {
      const l = s instanceof HTMLCanvasElement ? s.width : s.videoWidth, u = s instanceof HTMLCanvasElement ? s.height : s.videoHeight;
      l > 1 && u > 1 && (!(s instanceof HTMLVideoElement) || s.readyState >= 2) && (i.setSource(s, l, u), this.sceneDirty = !0, "ready" in this.dataset || (this.dataset.ready = ""));
    }
    const g = this.video;
    g && g.readyState >= 2 && (i.setSource(g, g.videoWidth, g.videoHeight), this.sceneDirty = !0), this.animatedScene && !a && (this.time += n, this.sceneDirty = !0);
    const v = this.sceneDirty;
    this.sceneDirty && (i.drawScene(this.time), this.sceneDirty = !1);
    const h = this.light, p = this.pointer.inside && !this.hasAttribute("fixed-light"), _ = p ? this.pointer.x - 100 : this.width * 0.18, A = p ? this.pointer.y - 160 : -this.height * 0.25;
    [h.x, h.vx] = z(h.x, h.vx, _, n, 330, 24), [h.y, h.vy] = z(h.y, h.vy, A, n, 330, 24);
    const f = this.bulge;
    this.pointer.inside && f.x < -5e3 && Object.assign(f, { x: this.pointer.x, y: this.pointer.y, vx: 0, vy: 0 }), !this.pointer.inside || a ? Object.assign(f, { x: -1e4, y: -1e4, vx: 0, vy: 0 }) : ([f.x, f.vx] = z(f.x, f.vx, this.pointer.x, n, 140, 9), [f.y, f.vy] = z(f.y, f.vy, this.pointer.y, n, 140, 9)), this.microphone && this.syncAudio();
    let x = this.silent;
    this.microphone?.getState().status === "live" ? x = this.microphone.read(n) : this.node ? x = this.node.read(n) : this.manualAudio ? x = this.manualAudio : this.hasAttribute("inner-light") && (this.demo.bands.forEach((l, u) => {
      this.demo.bands[u] = 0.26 + Math.sin(this.time * (1.4 + u * 0.28) + u) * 0.17;
    }), this.demo.level = Math.max(...this.demo.bands) * 0.6, x = this.demo, !this.animatedScene && !a && (this.time += n));
    const C = x === this.demo ? 0.85 : x === this.silent ? 0 : L(x.level * 1.5, 0, 1);
    this.level = a ? C : this.level + (C - this.level) * Math.min(n * 7, 1);
    const N = x !== this.silent || this.level > 2e-3;
    (this.stylesDirty || this.frameCount % 30 === 0) && this.panes.forEach((l) => {
      this.state(l).look = null;
    }), this.stylesDirty = !1;
    const y = this.getBoundingClientRect(), R = [];
    let b = Math.abs(h.vx) + Math.abs(h.vy) + Math.abs(f.vx) + Math.abs(f.vy) > 0.5 || N;
    for (const l of this.panes) {
      const u = l.getBoundingClientRect();
      if (u.width < 1 || u.height < 1 || u.right < y.left || u.left > y.right || u.bottom < y.top || u.top > y.bottom) continue;
      const o = this.state(l);
      o.look ?? (o.look = this.readLook(l, u.width, u.height));
      const E = o.look, q = this.pointer.down && this.pointer.target === l, I = this.pointer.inside && this.pointer.x >= u.left - y.left && this.pointer.x <= u.right - y.left && this.pointer.y >= u.top - y.top && this.pointer.y <= u.bottom - y.top, P = o.drag, V = q ? E.press : I ? 1 + (E.press - 1) * 0.3 : 1, X = P ? L(Math.abs(P.vx) / 2600, 0, 0.22) : 0, U = P ? L(Math.abs(P.vy) / 2600, 0, 0.22) : 0;
      a ? Object.assign(o, { scale: V, scaleVelocity: 0, stretchX: 1, stretchY: 1, stretchXVelocity: 0, stretchYVelocity: 0, glow: q ? 1 : 0, glowVelocity: 0 }) : ([o.scale, o.scaleVelocity] = z(o.scale, o.scaleVelocity, V, n, 520, 14), [o.stretchX, o.stretchXVelocity] = z(o.stretchX, o.stretchXVelocity, 1 + X - U * 0.5, n, 300, 12), [o.stretchY, o.stretchYVelocity] = z(o.stretchY, o.stretchYVelocity, 1 + U - X * 0.5, n, 300, 12), [o.glow, o.glowVelocity] = z(o.glow, o.glowVelocity, q ? 1 : I ? 0.35 : 0, n, 260, 22)), P && (P.vx *= 0.9, P.vy *= 0.9), b || (b = Math.abs(o.scaleVelocity) + Math.abs(o.stretchXVelocity) + Math.abs(o.stretchYVelocity) + Math.abs(o.glowVelocity) > 2e-3);
      const k = E.lens ? [E.lens[0], E.lens[1], E.lens[2], 1] : [o.lens[0], o.lens[1], o.lens[2], 0];
      o.lens[3] === 0 && E.lens && !o.lensVelocity.some(Boolean) && (o.lens = [...k]);
      for (let M = 0; M < 4; M += 1) {
        if (a) {
          o.lens[M] = k[M], o.lensVelocity[M] = 0;
          continue;
        }
        [o.lens[M], o.lensVelocity[M]] = z(o.lens[M], o.lensVelocity[M], k[M], n, 330, 24);
      }
      b || (b = o.lensVelocity.some((M) => Math.abs(M) > 0.01)), R.push({
        x: u.left - y.left + u.width / 2,
        y: u.top - y.top + u.height / 2,
        halfWidth: u.width / 2 * o.scale * o.stretchX,
        halfHeight: u.height / 2 * o.scale * o.stretchY,
        radius: E.radius * o.scale,
        frost: E.frost,
        chroma: E.chroma,
        pull: E.pull,
        tint: E.tint,
        depth: E.depth,
        rounding: E.rounding,
        dome: E.dome,
        ior: E.ior,
        lens: [o.lens[0] * o.scale, o.lens[1] * o.scale, o.lens[2] * o.scale, o.lens[3]],
        glow: E.glow,
        shadow: E.shadow,
        press: o.glow
      });
    }
    const T = R.map((l) => `${l.x.toFixed(1)},${l.y.toFixed(1)},${l.halfWidth.toFixed(1)},${l.halfHeight.toFixed(1)},${l.radius},${l.frost},${l.depth},${l.dome},${l.tint.join(",")}`).join("|");
    !v && !b && T === this.lastSignature || (this.lastSignature = T, i.drawGlass(R, { x: h.x, y: h.y }, { x: f.x, y: f.y }, x === this.silent ? { bands: this.silent.bands, level: this.level } : { bands: x.bands, level: this.level }));
  }
}
d(se, "observedAttributes", ["backdrop", "colors", "dim", "inner-light", "fixed-light", "lazy"]);
typeof customElements < "u" && !customElements.get("liquid-glass") && customElements.define("liquid-glass", se);
export {
  se as LiquidGlassElement
};
