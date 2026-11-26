import { useEffect, useRef } from 'react';
import { motion, useScroll, useTransform } from 'motion/react';

export default function TechBackdrop({ reducedMotion }) {
  const canvasRef = useRef(null);
  const { scrollYProgress } = useScroll();
  const orb1Y = useTransform(scrollYProgress, [0, 1], reducedMotion ? [0, 0] : [0, -180]);
  const orb2Y = useTransform(scrollYProgress, [0, 1], reducedMotion ? [0, 0] : [0, 220]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let nodes = [];
    let raf = 0;
    const pointer = { x: -9999, y: -9999 };

    const initNodes = (w, h) => {
      const count = Math.min(64, Math.max(28, Math.floor((w * h) / 24000)));
      nodes = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.28,
        vy: (Math.random() - 0.5) * 0.28,
        r: Math.random() * 1.5 + 0.8
      }));
    };

    const draw = () => {
      const w = canvas.clientWidth || window.innerWidth;
      const h = canvas.clientHeight || window.innerHeight;
      ctx.clearRect(0, 0, w, h);

      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        if (!reducedMotion) {
          a.x += a.vx;
          a.y += a.vy;
          if (a.x < 0 || a.x > w) a.vx *= -1;
          if (a.y < 0 || a.y > h) a.vy *= -1;
        }

        ctx.fillStyle = 'rgba(130, 165, 255, 0.46)';
        ctx.beginPath();
        ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2);
        ctx.fill();

        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 155) {
            const alpha = (1 - dist / 155) * 0.20;
            ctx.strokeStyle = `rgba(56, 189, 248, ${alpha.toFixed(3)})`;
            ctx.lineWidth = 0.85;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }

        if (pointer.x > 0) {
          const pd = Math.hypot(a.x - pointer.x, a.y - pointer.y);
          if (pd < 200) {
            const alpha = (1 - pd / 200) * 0.34;
            ctx.strokeStyle = `rgba(130, 165, 255, ${alpha.toFixed(3)})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(pointer.x, pointer.y);
            ctx.stroke();
          }
        }
      }

      if (!reducedMotion) {
        raf = requestAnimationFrame(draw);
      }
    };

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      initNodes(w, h);
      draw();
    };

    const onMove = (e) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
    };
    const onLeave = () => {
      pointer.x = -9999;
      pointer.y = -9999;
    };

    resize();
    window.addEventListener('resize', resize, { passive: true });
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerleave', onLeave);

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerleave', onLeave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [reducedMotion]);

  return (
    <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden" aria-hidden="true">
      <div className="atmos-beam absolute -top-[14vh] -inset-x-[12vw] h-[115vh]" />

      <motion.div
        style={{ y: orb1Y }}
        className="absolute top-[22vh] -left-[12vw] w-[54vw] h-[54vw] max-w-[780px] max-h-[780px] rounded-full bg-[radial-gradient(circle,rgba(99,102,241,0.20),transparent_66%)] blur-3xl"
      />
      <motion.div
        style={{ y: orb2Y }}
        className="absolute top-[48vh] -right-[10vw] w-[50vw] h-[50vw] max-w-[720px] max-h-[720px] rounded-full bg-[radial-gradient(circle,rgba(6,182,212,0.16),transparent_66%)] blur-3xl"
      />
      <div className="absolute bottom-[-16vh] left-1/2 -translate-x-1/2 w-[82vw] h-[50vh] rounded-full bg-[radial-gradient(ellipse,rgba(79,70,229,0.20),rgba(34,211,238,0.06)_48%,transparent_72%)] blur-3xl" />

      <div className="atmos-grid-full absolute inset-0" />
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
    </div>
  );
}
