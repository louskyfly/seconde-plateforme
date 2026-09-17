export function initClickRipple() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  document.addEventListener(
    'click',
    (event) => {
      const { clientX, clientY } = event as MouseEvent;
      if (typeof clientX !== 'number' || typeof clientY !== 'number') return;

      const ripple = document.createElement('span');
      ripple.className = 'click-ripple';
      ripple.style.left = `${clientX}px`;
      ripple.style.top = `${clientY}px`;
      document.body.appendChild(ripple);

      const remove = () => ripple.remove();
      ripple.addEventListener('animationend', remove);
      window.setTimeout(remove, 900);
    },
    { passive: true }
  );
}