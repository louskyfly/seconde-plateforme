import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '@/lib/api';

function Confetti() {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = window.innerWidth;
    const H = window.innerHeight;
    canvas.width = W;
    canvas.height = H;

    const pieces = Array.from({ length: 120 }, () => ({
      x: Math.random() * W,
      y: -20 - Math.random() * H,
      size: 6 + Math.random() * 10,
      color: ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#ff6ec7', '#ffa500'][Math.floor(Math.random() * 6)],
      angle: Math.random() * 360,
      speed: 1.5 + Math.random() * 2.5,
      spin: (Math.random() - 0.5) * 8,
    }));

    let frame = 0;
    const maxFrames = 180;

    function draw() {
      if (!ctx) return;
      ctx.clearRect(0, 0, W, H);
      for (const p of pieces) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.angle * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
        p.y += p.speed;
        p.angle += p.spin;
      }
      frame++;
      if (frame < maxFrames && pieces.some((p) => p.y < H + 50)) {
        requestAnimationFrame(draw);
      }
    }
    draw();
  }, []);

  return <canvas ref={canvasRef} style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 9999 }} />;
}

/** Nom(s) du/des anniversaires d'aujourd'hui. */
function BirthdayNames({ names }: { names: string[] }) {
  return (
    <div className="fixed inset-0 flex items-center justify-center z-[10000] pointer-events-none">
      <div className="relative pointer-events-auto text-center px-6 py-8 bg-white/95 dark:bg-gray-900/95 backdrop-blur rounded-3xl shadow-2xl border border-yellow-300 dark:border-yellow-700 animate-bounce-in">
        <div className="text-5xl mb-2">🎉</div>
        <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
          Joyeux anniversaire
        </h2>
        <p className="mt-1 text-lg text-gray-700 dark:text-gray-300">
          {names.map((n, i) => (i === names.length - 1 && names.length > 1 ? `et ${n}` : n)).join(', ')}
        </p>
        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
          Toute la classe te souhaite une merveilleuse journée ! 🎂🎁
        </p>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('birthday-dismiss'))}
          className="mt-6 px-5 py-2 text-sm font-medium text-white bg-indigo-600 rounded-full hover:bg-indigo-700 transition-colors"
        >
          Fermer
        </button>
      </div>
    </div>
  );
}

export function BirthdayAnimation() {
  const [show, setShow] = useState(false);
  const [names, setNames] = useState<string[]>([]);

  useEffect(() => {
    const today = new Date();
    const todayMmDd = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    api.getBirthdays()
      .then(({ birthdays }) => {
        const todays = birthdays.filter((b) => b.date_mmdd === todayMmDd);
        if (todays.length > 0) {
          // On ne connaît pas les prénoms, on affiche l'empreinte courte
          setNames(todays.map((b) => b.fingerprint.slice(0, 6).toUpperCase()));
          setShow(true);
        }
      })
      .catch(() => {});

    const dismiss = () => setShow(false);
    window.addEventListener('birthday-dismiss', dismiss);
    return () => window.removeEventListener('birthday-dismiss', dismiss);
  }, []);

  if (!show) return null;

  return createPortal(
    <>
      <Confetti />
      <BirthdayNames names={names} />
    </>,
    document.body
  );
}

// Add the animation keyframes
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes bounce-in {
      0% { transform: scale(0.8); opacity: 0; }
      50% { transform: scale(1.05); }
      100% { transform: scale(1); opacity: 1; }
    }
    .animate-bounce-in { animation: bounce-in 0.4s ease-out; }
  `;
  document.head.appendChild(style);
}