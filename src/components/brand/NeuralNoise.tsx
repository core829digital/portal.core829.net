"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "cn";

/**
 * NeuralNoise — flusso "neurale" generato da uno shader WebGL.
 * Copia dello sfondo della sezione hero di core829.net (repo core829.net-new, components/ui/neural-noise.tsx):
 * tenere allineato se il sito lo modifica.
 *
 * Basato sul componente originale (stesso fragment shader), riscritto per
 * l'uso in produzione:
 * - stato in ref, effetto con dipendenze stabili: nessun ciclo rAF duplicato
 * - gira solo quando è visibile (IntersectionObserver) e a tab attiva
 * - risoluzione interna ridotta (il rumore è morbido): costo GPU contenuto
 * - prefers-reduced-motion: un solo fotogramma statico
 * - context loss gestita, risorse GL (buffer, programma, shader) rilasciate
 * - fallback CSS (alone radiale) se WebGL non è disponibile
 */

const VERTEX = `
  precision mediump float;
  varying vec2 vUv;
  attribute vec2 a_position;
  void main() {
    vUv = 0.5 * (a_position + 1.0);
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

const FRAGMENT = `
  precision mediump float;
  varying vec2 vUv;
  uniform float u_time;
  uniform float u_ratio;
  uniform vec2 u_pointer_position;
  uniform vec3 u_color;
  uniform float u_speed;
  vec2 rotate(vec2 uv, float th) {
    return mat2(cos(th), sin(th), -sin(th), cos(th)) * uv;
  }
  float neuro_shape(vec2 uv, float t, float p) {
    vec2 sine_acc = vec2(0.0);
    vec2 res = vec2(0.0);
    float scale = 8.0;
    for (int j = 0; j < 15; j++) {
      uv = rotate(uv, 1.0);
      sine_acc = rotate(sine_acc, 1.0);
      vec2 layer = uv * scale + float(j) + sine_acc - t;
      sine_acc += sin(layer) + 2.4 * p;
      res += (0.5 + 0.5 * cos(layer)) / scale;
      scale *= 1.2;
    }
    return res.x + res.y;
  }
  void main() {
    vec2 uv = 0.5 * vUv;
    uv.x *= u_ratio;
    vec2 pointer = vUv - u_pointer_position;
    pointer.x *= u_ratio;
    float p = clamp(length(pointer), 0.0, 1.0);
    p = 0.5 * pow(1.0 - p, 2.0);
    float t = u_speed * u_time;
    vec3 col = vec3(0.0);
    float noise = neuro_shape(uv, t, p);
    noise = 1.2 * pow(noise, 3.0);
    noise += pow(noise, 10.0);
    noise = max(0.0, noise - 0.5);
    noise *= (1.0 - length(vUv - 0.5));
    col = u_color * noise;
    gl_FragColor = vec4(col, noise);
  }
`;

export type RGB = readonly [number, number, number];

/** Racing Red CORE829 (#ef233c) in componenti 0-1, leggermente acceso per lo shader. */
export const CORE829_RED: RGB = [0.94, 0.14, 0.24];

interface NeuralNoiseProps {
  /** Colore del flusso (componenti 0-1). Default: rosso CORE829. */
  color?: RGB;
  opacity?: number;
  /** Velocità (moltiplicatore del tempo in ms). */
  speed?: number;
  /** Frazione della risoluzione CSS usata per il rendering (0.3-1). */
  resolution?: number;
  className?: string;
  style?: React.CSSProperties;
  /** Ferma il rendering (es. quando l'hero non è più visibile). */
  paused?: boolean;
}

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.error("[NeuralNoise] shader:", gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

export function NeuralNoise({
  color = CORE829_RED,
  opacity = 0.95,
  speed = 0.001,
  resolution = 0.55,
  className,
  style,
  paused = false,
}: NeuralNoiseProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  // Valori correnti letti dal loop senza riavviare l'effetto
  const live = useRef({ paused, color, speed });
  // Aggiorna i valori letti dal loop di disegno senza riavviarlo (dopo il rendering, non durante).
  useEffect(() => {
    live.current = { paused, color, speed };
  });
  const colorKey = color.join(",");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = (canvas.getContext("webgl", {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: "low-power",
      preserveDrawingBuffer: false,
    }) || canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (!gl) {
      setFailed(true);
      return;
    }

    const vs = compile(gl, gl.VERTEX_SHADER, VERTEX);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
    const program = gl.createProgram();
    if (!vs || !fs || !program) {
      setFailed(true);
      return;
    }
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error("[NeuralNoise] link:", gl.getProgramInfoLog(program));
      setFailed(true);
      return;
    }
    gl.useProgram(program);

    const u = {
      time: gl.getUniformLocation(program, "u_time"),
      ratio: gl.getUniformLocation(program, "u_ratio"),
      pointer: gl.getUniformLocation(program, "u_pointer_position"),
      color: gl.getUniformLocation(program, "u_color"),
      speed: gl.getUniformLocation(program, "u_speed"),
    };

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    );
    const loc = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const pointer = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 };
    let raf = 0;
    let visible = true;
    let tabVisible = !document.hidden;
    let elapsed = 0; // ms accumulati: la pausa non crea salti
    let last = performance.now();
    let destroyed = false;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const scale = Math.max(0.3, Math.min(1, resolution)) * dpr;
      const w = Math.max(2, Math.round(canvas.clientWidth * scale));
      const h = Math.max(2, Math.round(canvas.clientHeight * scale));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, w, h);
      gl.uniform1f(u.ratio, w / h);
    };

    const draw = () => {
      const c = live.current.color;
      gl.uniform3f(u.color, c[0], c[1], c[2]);
      gl.uniform1f(u.speed, live.current.speed);
      gl.uniform1f(u.time, elapsed);
      gl.uniform2f(u.pointer, pointer.x, 1 - pointer.y);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };

    const loop = (now: number) => {
      raf = 0;
      if (destroyed) return;
      const dt = Math.min(64, now - last);
      last = now;
      if (!live.current.paused && visible && tabVisible) {
        elapsed += dt;
        pointer.x += (pointer.tx - pointer.x) * 0.12;
        pointer.y += (pointer.ty - pointer.y) * 0.12;
        draw();
      }
      raf = requestAnimationFrame(loop);
    };

    const start = () => {
      if (reduceMotion || raf) return;
      last = performance.now();
      raf = requestAnimationFrame(loop);
    };

    resize();
    elapsed = 4000; // fotogramma iniziale già "sviluppato"
    draw();
    start();

    const ro = new ResizeObserver(() => {
      resize();
      draw();
    });
    ro.observe(canvas);

    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
      },
      { threshold: 0 }
    );
    io.observe(canvas);

    const onVisibility = () => {
      tabVisible = !document.hidden;
    };
    document.addEventListener("visibilitychange", onVisibility);

    const onPointer = (e: PointerEvent) => {
      pointer.tx = e.clientX / window.innerWidth;
      pointer.ty = e.clientY / window.innerHeight;
    };
    if (!reduceMotion) window.addEventListener("pointermove", onPointer, { passive: true });

    const onLost = (e: Event) => {
      e.preventDefault();
      setFailed(true);
    };
    canvas.addEventListener("webglcontextlost", onLost);

    return () => {
      destroyed = true;
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointermove", onPointer);
      canvas.removeEventListener("webglcontextlost", onLost);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      // Nessun loseContext(): il canvas verrà rimosso e il browser rilascia il
      // contesto; forzarlo romperebbe il doppio mount di React StrictMode.
    };
    // colorKey/resolution: ricreano il contesto solo se cambiano davvero
  }, [colorKey, resolution]);

  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
      style={style}
    >
      {/* Alone di base: unico elemento se WebGL non è disponibile */}
      <div
        className={cn(
          "absolute inset-0 transition-opacity duration-700",
          failed ? "opacity-100" : "opacity-40"
        )}
        style={{
          background: `radial-gradient(ellipse 55% 45% at 50% 50%, rgba(${Math.round(
            color[0] * 255
          )},${Math.round(color[1] * 255)},${Math.round(color[2] * 255)},0.45), transparent 70%)`,
        }}
      />
      {!failed && (
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full"
          style={{ opacity }}
        />
      )}
    </div>
  );
}

export default NeuralNoise;
