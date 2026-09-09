"use client";

import { useEffect, useRef } from "react";

/**
 * Liquid Chrome: a fluid, metallic WebGL surface.
 *
 * Adapted from the Componentry "liquid-chrome" registry item
 * (https://componentry.dev/docs/components/liquid-chrome). The shader is
 * kept close to the reference; the surrounding lifecycle (sizing, pausing,
 * reduced motion, fallback, cleanup) is written for production use.
 *
 * Purely decorative: the canvas is hidden from assistive technology and the
 * wrapper's dark background doubles as the fallback surface whenever WebGL
 * is unavailable or is lost.
 */

export type LiquidChromeProps = {
  /** Additional classes for the wrapper element. */
  className?: string;
  /** Base tint of the chrome as RGB in the 0–1 range. */
  baseColor?: readonly [number, number, number];
  /** Animation speed multiplier. */
  speed?: number;
  /** Strength of the domain warping. Higher is more turbulent. */
  amplitude?: number;
  /** Whether the surface reacts to pointer movement over it. */
  interactive?: boolean;
};

type ShaderParams = {
  baseColor: readonly [number, number, number];
  speed: number;
  amplitude: number;
  interactive: boolean;
};

/** Backing-store resolution is capped here to avoid oversized framebuffers. */
const MAX_DEVICE_PIXEL_RATIO = 2;

/** Elapsed time used for the single frame drawn under reduced motion. */
const STATIC_FRAME_TIME = 4;

/** Start rendering slightly before the section scrolls into view. */
const VIEWPORT_MARGIN = "200px 0px";

const vertexShaderSource = `
  attribute vec2 position;
  void main() {
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

const fragmentShaderSource = `
  #ifdef GL_FRAGMENT_PRECISION_HIGH
  precision highp float;
  #else
  precision mediump float;
  #endif

  uniform vec2 u_resolution;
  uniform float u_time;
  uniform vec2 u_mouse;
  uniform float u_mouseStrength;
  uniform vec3 u_baseColor;
  uniform float u_amplitude;

  const mat2 m = mat2(0.80, 0.60, -0.60, 0.80);

  float hash(vec2 p) {
    float h = dot(p, vec2(127.1, 311.7));
    return fract(sin(h) * 43758.5453123);
  }

  float noise(in vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }

  float fbm(vec2 p) {
    float f = 0.0;
    f += 0.5000 * noise(p); p = m * p * 2.02;
    f += 0.2500 * noise(p); p = m * p * 2.03;
    f += 0.1250 * noise(p); p = m * p * 2.01;
    f += 0.0625 * noise(p);
    return f / 0.9375;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    vec2 p = -1.0 + 2.0 * uv;
    float aspect = u_resolution.x / max(u_resolution.y, 1.0);
    p.x *= aspect;

    // Subtle radial displacement around the pointer, faded in and out
    // by u_mouseStrength so entering and leaving the surface is smooth.
    vec2 mouse = (u_mouse - 0.5) * 2.0;
    mouse.x *= aspect;
    vec2 diff = p - mouse;
    float dist = length(diff);
    if (dist > 0.0) {
      p += (diff / dist) * exp(-dist * 3.0) * 0.08 * u_mouseStrength;
    }

    float time = u_time * 0.5;

    // Domain warping.
    vec2 q = vec2(0.0);
    q.x = fbm(p + vec2(0.0, 0.0) + time * 0.1);
    q.y = fbm(p + vec2(5.2, 1.3) + time * 0.15);

    vec2 r = vec2(0.0);
    r.x = fbm(p + 4.0 * q + vec2(1.7, 9.2) + time * 0.2);
    r.y = fbm(p + 4.0 * q + vec2(8.3, 2.8) + time * 0.25);

    float f = fbm(p + r * 4.0 * u_amplitude);

    // Chrome / liquid-metal tone mapping.
    vec3 col = u_baseColor;
    float highlight = smoothstep(0.4, 0.6, f);
    float highlight2 = smoothstep(0.6, 0.8, f);
    float dark = smoothstep(0.1, 0.3, f);

    col = mix(col, vec3(0.0), 1.0 - dark);          // shadows
    col = mix(col, vec3(0.8, 0.8, 0.9), highlight);  // silver midtones
    col = mix(col, vec3(1.0), highlight2);           // white specular

    // Vignette.
    float v = 16.0 * uv.x * uv.y * (1.0 - uv.x) * (1.0 - uv.y);
    col *= 0.5 + 0.5 * pow(max(0.0, v), 0.2);

    gl_FragColor = vec4(col, 1.0);
  }
`;

type Renderer = {
  /** Match the drawing buffer to the canvas' CSS size and device pixel ratio. */
  resize: () => void;
  /** Start the animation loop (no-op if already running). */
  start: () => void;
  /** Stop the animation loop, keeping the last frame on screen. */
  stop: () => void;
  /** Draw one fixed, non-animated frame. */
  renderStatic: () => void;
  setParams: (params: ShaderParams) => void;
  /** Pointer position in CSS pixels relative to the canvas. */
  setPointer: (x: number, y: number) => void;
  clearPointer: () => void;
  /** Stop the loop and release GPU resources. */
  destroy: () => void;
};

function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string,
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn("LiquidChrome shader failed to compile:", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

/**
 * Creates the WebGL renderer for a canvas. Returns null (having released
 * anything it allocated) when WebGL is unavailable or the shaders fail.
 */
function createRenderer(
  canvas: HTMLCanvasElement,
  initialParams: ShaderParams,
): Renderer | null {
  const gl = canvas.getContext("webgl", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
  });
  if (!gl) return null;

  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
  if (!vertexShader) return null;

  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
  if (!fragmentShader) {
    gl.deleteShader(vertexShader);
    return null;
  }

  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    return null;
  }
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  const releaseProgram = () => {
    gl.detachShader(program, vertexShader);
    gl.detachShader(program, fragmentShader);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    gl.deleteProgram(program);
  };

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn("LiquidChrome program failed to link:", gl.getProgramInfoLog(program));
    releaseProgram();
    return null;
  }

  const positionBuffer = gl.createBuffer();
  if (!positionBuffer) {
    releaseProgram();
    return null;
  }

  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW,
  );
  const positionLocation = gl.getAttribLocation(program, "position");
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

  const uniforms = {
    resolution: gl.getUniformLocation(program, "u_resolution"),
    time: gl.getUniformLocation(program, "u_time"),
    mouse: gl.getUniformLocation(program, "u_mouse"),
    mouseStrength: gl.getUniformLocation(program, "u_mouseStrength"),
    baseColor: gl.getUniformLocation(program, "u_baseColor"),
    amplitude: gl.getUniformLocation(program, "u_amplitude"),
  };

  let params = initialParams;
  let destroyed = false;
  let running = false;
  let frameId = 0;
  let lastFrameAt = 0;
  let elapsed = 0;
  // Tracked here rather than read back from the canvas so a fresh renderer
  // on an already-sized canvas (e.g. a remount) still configures the
  // viewport and resolution uniform for its own program.
  let bufferWidth = 0;
  let bufferHeight = 0;

  // Pointer state in normalized canvas coordinates (origin bottom-left, to
  // match gl_FragCoord). Position and strength are eased toward their
  // targets each frame so the distortion never jumps.
  let pointerInside = false;
  let targetX = 0.5;
  let targetY = 0.5;
  let mouseX = 0.5;
  let mouseY = 0.5;
  let strength = 0;

  const draw = () => {
    if (destroyed) return;
    mouseX += (targetX - mouseX) * 0.25;
    mouseY += (targetY - mouseY) * 0.25;
    strength += ((pointerInside ? 1 : 0) - strength) * 0.1;

    gl.uniform1f(uniforms.time, elapsed);
    gl.uniform2f(uniforms.mouse, mouseX, mouseY);
    gl.uniform1f(uniforms.mouseStrength, strength);
    gl.uniform3f(uniforms.baseColor, params.baseColor[0], params.baseColor[1], params.baseColor[2]);
    gl.uniform1f(uniforms.amplitude, params.amplitude);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  };

  const frame = (now: number) => {
    if (!running) return;
    elapsed += ((now - lastFrameAt) / 1000) * params.speed;
    lastFrameAt = now;
    draw();
    frameId = requestAnimationFrame(frame);
  };

  const stop = () => {
    if (!running) return;
    running = false;
    cancelAnimationFrame(frameId);
  };

  return {
    resize() {
      if (destroyed) return;
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO);
      const width = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const height = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (bufferWidth === width && bufferHeight === height) return;
      bufferWidth = width;
      bufferHeight = height;
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
      gl.uniform2f(uniforms.resolution, width, height);
      // Resizing clears the drawing buffer; repaint if the loop won't.
      if (!running) draw();
    },
    start() {
      if (running || destroyed) return;
      running = true;
      lastFrameAt = performance.now();
      frameId = requestAnimationFrame(frame);
    },
    stop,
    renderStatic() {
      stop();
      elapsed = STATIC_FRAME_TIME;
      draw();
    },
    setParams(next) {
      params = next;
      if (!running) draw();
    },
    setPointer(x, y) {
      if (!params.interactive) return;
      targetX = x / Math.max(canvas.clientWidth, 1);
      targetY = 1 - y / Math.max(canvas.clientHeight, 1);
      if (!pointerInside) {
        // Snap to the entry point so the distortion fades in where the
        // pointer actually is rather than sweeping in from elsewhere.
        pointerInside = true;
        mouseX = targetX;
        mouseY = targetY;
      }
    },
    clearPointer() {
      pointerInside = false;
    },
    destroy() {
      if (destroyed) return;
      stop();
      destroyed = true;
      gl.disableVertexAttribArray(positionLocation);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      gl.deleteBuffer(positionBuffer);
      gl.useProgram(null);
      releaseProgram();
    },
  };
}

export function LiquidChrome({
  className,
  baseColor = [0.1, 0.1, 0.1],
  speed = 1,
  amplitude = 0.6,
  interactive = true,
}: LiquidChromeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const [red, green, blue] = baseColor;

  // Create the renderer once per mount; prop changes are pushed into it
  // by the effect below instead of rebuilding WebGL resources.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.style.display = "";
    const renderer = createRenderer(canvas, { baseColor, speed, amplitude, interactive });
    if (!renderer) {
      // Leave the wrapper's dark background as the fallback surface.
      canvas.style.display = "none";
      return;
    }
    rendererRef.current = renderer;

    let inView = true;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    const sync = () => {
      if (reducedMotion.matches) {
        renderer.renderStatic();
      } else if (inView && document.visibilityState === "visible") {
        renderer.start();
      } else {
        renderer.stop();
      }
    };

    const resizeObserver = new ResizeObserver(() => renderer.resize());
    const intersectionObserver = new IntersectionObserver(
      (entries) => {
        inView = entries.some((entry) => entry.isIntersecting);
        sync();
      },
      { rootMargin: VIEWPORT_MARGIN },
    );

    const handlePointerMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      renderer.setPointer(event.clientX - rect.left, event.clientY - rect.top);
    };
    const handlePointerLeave = () => renderer.clearPointer();
    const handleContextLost = (event: Event) => {
      event.preventDefault();
      renderer.destroy();
      canvas.style.display = "none";
    };

    resizeObserver.observe(canvas);
    intersectionObserver.observe(canvas);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerleave", handlePointerLeave);
    canvas.addEventListener("pointercancel", handlePointerLeave);
    canvas.addEventListener("webglcontextlost", handleContextLost);
    document.addEventListener("visibilitychange", sync);
    reducedMotion.addEventListener("change", sync);

    renderer.resize();
    sync();

    return () => {
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerleave", handlePointerLeave);
      canvas.removeEventListener("pointercancel", handlePointerLeave);
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      document.removeEventListener("visibilitychange", sync);
      reducedMotion.removeEventListener("change", sync);
      renderer.destroy();
      rendererRef.current = null;
    };
    // Initial params only; later changes flow through setParams below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    rendererRef.current?.setParams({
      baseColor: [red, green, blue],
      speed,
      amplitude,
      interactive,
    });
  }, [red, green, blue, speed, amplitude, interactive]);

  return (
    <div
      aria-hidden="true"
      className={["relative h-full w-full overflow-hidden bg-neutral-950", className]
        .filter(Boolean)
        .join(" ")}
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}
