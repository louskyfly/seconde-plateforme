import { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { useSettings } from '../hooks/useSettings';

const navItems = [
  { path: '/', label: 'Accueil', icon: '🏠' },
  { path: '/chat', label: 'Chat', icon: '💬' },
  { path: '/idees', label: 'Idées', icon: '💡' },
  { path: '/revisions', label: 'Révisions', icon: '📚' },
  { path: '/fiches', label: 'Fiches', icon: '📄' },
  { path: '/eleves', label: 'Élèves', icon: '👥' },
  { path: '/calendrier', label: 'Calendrier', icon: '📅' },
  { path: '/sondages', label: 'Sondages', icon: '📊' },
  { path: '/messages', label: 'Messages', icon: '✉️' },
];

const adminItems = [
  { path: '/admin', label: 'Admin', icon: '⚙️' },
  { path: '/parametres', label: 'Paramètres', icon: '⚙️' },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(false);
  const { loading } = useSettings();

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/seconde-plateforme/sw.js').catch(console.error);
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(true);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-600">Initialisation...</p>
        </div>
      </div>
    );
  }

  const handleInstall = async () => {
    const event = (window as any).deferredPrompt;
    if (event) {
      event.prompt();
      const { outcome } = await event.userChoice;
      if (outcome === 'accepted') {
        setInstallPrompt(false);
      }
    }
  };

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Mobile header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-white border-b border-gray-200">
        <div className="flex items-center justify-between h-16 px-4">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 rounded-lg hover:bg-gray-100"
            aria-label="Menu"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <h1 className="text-lg font-semibold text-gray-900">Seconde Platform</h1>
          <div className="w-10" />
        </div>
      </header>

      <div className="flex flex-1 pt-16 lg:pt-0">
        {/* Sidebar */}
        <aside
          className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 transform transition-transform duration-300 ease-in-out lg:translate-x-0 ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
          aria-label="Navigation principale"
        >
          <nav className="flex flex-col h-full p-4 space-y-2" aria-label="Navigation principale">
            <div className="px-2 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Navigation
            </div>
            <ul className="space-y-1 flex-1 overflow-y-auto" role="list">
              {navItems.map((item) => (
                <li key={item.path}>
                  <NavLink
                    to={item.path}
                    className={({ isActive }: { isActive: boolean }) => `
                      flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                      ${isActive
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-gray-700 hover:bg-gray-100'}
                    `}
                  >
                    <span aria-hidden="true">{item.icon}</span>
                    <span>{item.label}</span>
                  </NavLink>
                </li>
              ))}
            </ul>

            <div className="border-t border-gray-200 pt-4">
              <p className="px-2 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Administration
              </p>
              <ul className="space-y-1" role="list">
                {adminItems.map((item) => (
                  <li key={item.path}>
                    <NavLink
                      to={item.path}
                      className={({ isActive }: { isActive: boolean }) => `
                        flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                        ${isActive
                          ? 'bg-blue-50 text-blue-700'
                          : 'text-gray-700 hover:bg-gray-100'}
                      `}
                    >
                      <span aria-hidden="true">{item.icon}</span>
                      <span>{item.label}</span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>

            <div className="border-t border-gray-200 pt-4">
              <p className="px-2 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Informations
              </p>
              <div className="px-3 py-2 text-xs text-gray-500">
                <p>Version 1.0.0</p>
                <p className="mt-1">Données stockées localement</p>
              </div>
            </div>
          </nav>
        </aside>

        {/* Overlay for mobile sidebar */}
        {sidebarOpen && isMobile && (
          <div
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* Main content */}
        <main className="lg:ml-64 flex-1 min-h-screen">
          <div className="p-4 lg:p-6 min-h-screen">
            {children}
          </div>
        </main>

        {/* Install prompt */}
        {installPrompt && (
          <div className="fixed bottom-4 right-4 left-4 lg:right-4 lg:left-auto z-50 animate-slide-up">
            <div className="bg-white rounded-xl shadow-xl p-4 max-w-sm mx-4 border border-gray-200">
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <p className="font-medium text-gray-900">Installer l'application</p>
                  <p className="text-sm text-gray-600 mt-1">
                    Ajoutez Seconde Platform à votre écran d'accueil pour un accès rapide.
                  </p>
                </div>
                <button
                  onClick={() => setInstallPrompt(false)}
                  className="p-1 text-gray-400 hover:text-gray-600"
                  aria-label="Fermer"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={handleInstall}
                  className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg font-medium text-sm"
                >
                  Installer
                </button>
                <button
                  onClick={() => setInstallPrompt(false)}
                  className="flex-1 border border-gray-300 text-gray-700 py-2 px-4 rounded-lg font-medium text-sm"
                >
                  Plus tard
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Service Worker registration */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', () => {
                  navigator.serviceWorker.register('/seconde-plateforme/sw.js').catch(console.error);
                });
              }
            `
          }}
        />
      </div>
    </div>
  );
}