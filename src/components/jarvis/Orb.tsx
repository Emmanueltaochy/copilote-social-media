"use client";

import { useEffect, useRef } from "react";

export type OrbMode = "idle" | "listening" | "thinking" | "speaking";

/**
 * L'orbe de Jarvis : une sphère de particules or (charte Taochy, noir et or)
 * qui respire, et des poussières d'or qui flottent dans l'air autour d'elle.
 * Même rendu que le Jarvis de taochyagency.com (Three.js).
 *
 * - écoute : l'orbe s'éclaircit et pulse ;
 * - réflexion : elle tourne plus vite et frémit ;
 * - parole : elle vibre au rythme de la voix.
 */
export function Orb({ mode, className, onClick }: { mode: OrbMode; className?: string; onClick?: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const modeRef = useRef<OrbMode>(mode);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let stop = false;
    let cleanup = () => {};

    void import("three").then((THREE) => {
      if (stop) return;
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);

      const dot = (() => {
        const c = document.createElement("canvas");
        c.width = c.height = 64;
        const g = c.getContext("2d")!;
        const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
        gr.addColorStop(0, "rgba(255,255,255,1)");
        gr.addColorStop(0.3, "rgba(255,255,255,.6)");
        gr.addColorStop(1, "rgba(255,255,255,0)");
        g.fillStyle = gr;
        g.fillRect(0, 0, 64, 64);
        return new THREE.CanvasTexture(c);
      })();

      const cA = new THREE.Color("#cead6f");
      const cB = new THREE.Color("#8f7340");
      const cC = new THREE.Color("#f6e7c1");

      /* ---- la sphère ---- */
      const N = 9000;
      const pos = new Float32Array(N * 3);
      const base = new Float32Array(N * 3);
      const seed = new Float32Array(N);
      const col = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) {
        const y = 1 - (i / (N - 1)) * 2;
        const r = Math.sqrt(1 - y * y);
        const th = i * 2.399963;
        const k = 1 + (Math.random() - 0.5) * 0.12;
        base[i * 3] = Math.cos(th) * r * k;
        base[i * 3 + 1] = y * k;
        base[i * 3 + 2] = Math.sin(th) * r * k;
        seed[i] = Math.random() * 100;
        const c = i % 7 === 0 ? cC : cA.clone().lerp(cB, Math.random() * 0.8);
        col[i * 3] = c.r;
        col[i * 3 + 1] = c.g;
        col[i * 3 + 2] = c.b;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
      const mat = new THREE.PointsMaterial({ size: 0.035, map: dot, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      const points = new THREE.Points(geo, mat);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color: 0xcead6f, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending }));
      halo.scale.set(5, 5, 1);
      const orb = new THREE.Group();
      orb.add(points);
      orb.add(halo);
      scene.add(orb);

      /* ---- les poussières d'or qui flottent dans l'air ---- */
      const M = 900;
      const dpos = new Float32Array(M * 3);
      const dvel = new Float32Array(M * 3);
      const dseed = new Float32Array(M);
      const dcol = new Float32Array(M * 3);
      const spawn = (i: number, anywhere: boolean) => {
        dpos[i * 3] = (Math.random() - 0.5) * 9;
        dpos[i * 3 + 1] = anywhere ? (Math.random() - 0.5) * 6 : -3.2 - Math.random();
        dpos[i * 3 + 2] = (Math.random() - 0.5) * 5 - 0.5;
        dvel[i * 3] = (Math.random() - 0.5) * 0.002;
        dvel[i * 3 + 1] = 0.0015 + Math.random() * 0.004;
        dvel[i * 3 + 2] = (Math.random() - 0.5) * 0.0015;
      };
      for (let i = 0; i < M; i++) {
        spawn(i, true);
        dseed[i] = Math.random() * 100;
        const c = Math.random() < 0.25 ? cC : cA.clone().lerp(cB, Math.random());
        dcol[i * 3] = c.r;
        dcol[i * 3 + 1] = c.g;
        dcol[i * 3 + 2] = c.b;
      }
      const dgeo = new THREE.BufferGeometry();
      dgeo.setAttribute("position", new THREE.BufferAttribute(dpos, 3));
      dgeo.setAttribute("color", new THREE.BufferAttribute(dcol, 3));
      const dmat = new THREE.PointsMaterial({ size: 0.065, map: dot, vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
      const dust = new THREE.Points(dgeo, dmat);
      scene.add(dust);

      const resize = () => {
        const w = canvas.clientWidth || 1;
        const h = canvas.clientHeight || 1;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.position.set(0, 0, w < h ? 6.2 : 4.6);
        camera.updateProjectionMatrix();
      };
      const ro = new ResizeObserver(resize);
      ro.observe(canvas);
      resize();

      const clock = new THREE.Clock();
      let level = 0;
      let raf = 0;
      const loop = () => {
        const t = clock.getElapsedTime();
        const m = modeRef.current;
        // Intensité visée selon l'état : la voix fait vibrer, l'écoute pulse doucement.
        const target =
          m === "speaking" ? 0.35 + 0.35 * Math.abs(Math.sin(t * 7.3) * Math.sin(t * 2.1)) : m === "listening" ? 0.18 + 0.12 * Math.sin(t * 3) : 0;
        level += (target - level) * 0.18;
        const think = m === "thinking" ? 1 : 0;
        for (let i = 0; i < N; i++) {
          const s = seed[i];
          const n = Math.sin(t * 1.3 + s) * 0.03 + Math.sin(t * 0.7 + s * 3.1) * 0.02;
          const amp = 1 + n + level * (0.25 + 0.35 * Math.sin(s * 5 + t * 9)) + think * 0.06 * Math.sin(t * 6 + s);
          pos[i * 3] = base[i * 3] * amp;
          pos[i * 3 + 1] = base[i * 3 + 1] * amp;
          pos[i * 3 + 2] = base[i * 3 + 2] * amp;
        }
        geo.attributes.position.needsUpdate = true;
        points.rotation.y = t * (0.12 + think * 0.5);
        points.rotation.x = Math.sin(t * 0.2) * 0.25;
        mat.size = 0.033 + level * 0.03;
        halo.material.opacity = 0.12 + level * 0.35 + (m === "listening" ? 0.08 : 0);
        halo.material.color.set(m === "listening" ? 0xe9d6a6 : m === "thinking" ? 0x8f7340 : 0xcead6f);

        // Les poussières montent, ondulent, et sont aspirées vers l'orbe quand elle réfléchit.
        const pull = think ? 0.004 : m === "listening" ? 0.0015 : 0;
        for (let i = 0; i < M; i++) {
          const s = dseed[i];
          const j = i * 3;
          dpos[j] += dvel[j] + Math.sin(t * 0.6 + s) * 0.0012 - dpos[j] * pull;
          dpos[j + 1] += dvel[j + 1] * (1 + level * 2) - dpos[j + 1] * pull * 0.5;
          dpos[j + 2] += dvel[j + 2] + Math.cos(t * 0.5 + s) * 0.0008 - dpos[j + 2] * pull;
          if (dpos[j + 1] > 3.4 || Math.abs(dpos[j]) > 5.5) spawn(i, false);
        }
        dgeo.attributes.position.needsUpdate = true;
        dust.rotation.y = Math.sin(t * 0.05) * 0.3;
        dmat.opacity = 0.45 + level * 0.4;

        renderer.render(scene, camera);
        raf = requestAnimationFrame(loop);
      };
      loop();

      cleanup = () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        geo.dispose();
        dgeo.dispose();
        mat.dispose();
        dmat.dispose();
        dot.dispose();
        renderer.dispose();
      };
    });

    return () => {
      stop = true;
      cleanup();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      onClick={onClick}
      className={className}
      style={{ display: "block", width: "100%", height: "100%", cursor: onClick ? "pointer" : "default" }}
      aria-label="Jarvis"
    />
  );
}
