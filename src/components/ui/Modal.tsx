import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: string;
}

export function Modal({ isOpen, onClose, title, children, maxWidth = 'max-w-lg' }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  // Verrouille le défilement de la page entière (html + body) et compense la
  // largeur de la barre de défilement pour éviter un décalage à l'ouverture.
  useEffect(() => {
    if (!isOpen) return;
    const { body, documentElement } = document;
    const previous = {
      body: body.style.overflow,
      html: documentElement.style.overflow,
      padding: body.style.paddingRight,
    };
    const scrollbar = window.innerWidth - documentElement.clientWidth;
    body.style.overflow = 'hidden';
    documentElement.style.overflow = 'hidden';
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
    return () => {
      body.style.overflow = previous.body;
      documentElement.style.overflow = previous.html;
      body.style.paddingRight = previous.padding;
    };
  }, [isOpen]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Rendu via un portail sur <body> : sans cela, le popup était positionné par
  // rapport au conteneur .page-transition (filter) ou .glass (backdrop-filter),
  // qui deviennent le référent des éléments `position: fixed` -> overlay
  // raccourci et popup décentré. Le portail garantit un centrage sur l'écran.
  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden overscroll-contain bg-black/40 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`modal-animate glass-card ${maxWidth} w-full max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain md:max-h-[85vh]`}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">{title}</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full glass flex items-center justify-center text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}
