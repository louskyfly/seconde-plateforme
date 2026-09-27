import { useEffect, useState, type FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { useSettings, refreshSettings } from '@/hooks/useSettings';
import { applyAccent } from '@/lib/accent';
import { applySeason, normalizeSeasonTheme, SEASON_THEMES, type SeasonTheme } from '@/lib/season';
import { fileToDataUri } from '@/lib/image';
import { Modal } from '@/components/ui/Modal';

export function Settings() {
  const { token } = useParams<{ token: string }>();
  const { settings } = useSettings();
  const { logout } = useAuth();
  const navigate = useNavigate();

  const publicUrl = `${window.location.origin}${window.location.pathname.replace(/\/gestion\/.*$/, '/')}`;

  const [className, setClassName] = useState('');
  const [delegateName, setDelegateName] = useState('');
  const [accentColor, setAccentColor] = useState('#3b5ba6');
  const [homeInfo, setHomeInfo] = useState('');
  const [homeImage, setHomeImage] = useState<string | null>(null);
  const [homeImageBusy, setHomeImageBusy] = useState(false);

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdError, setPwdError] = useState('');
  const [pwdSuccess, setPwdSuccess] = useState('');
  const [pwdBusy, setPwdBusy] = useState(false);

  const [classSuccess, setClassSuccess] = useState('');
  const [classError, setClassError] = useState('');
  const [classBusy, setClassBusy] = useState(false);

  const [homeSuccess, setHomeSuccess] = useState('');
  const [homeError, setHomeError] = useState('');
  const [homeBusy, setHomeBusy] = useState(false);

  const [confirmRegen, setConfirmRegen] = useState(false);
  const [newToken, setNewToken] = useState('');
  const [regenBusy, setRegenBusy] = useState(false);

  const [season, setSeason] = useState<SeasonTheme>('aucun');
  const [seasonBusy, setSeasonBusy] = useState<SeasonTheme | null>(null);
  const [seasonMessage, setSeasonMessage] = useState('');

  const [copied, setCopied] = useState(false);
  const [qrUrl, setQrUrl] = useState('');
  const [qrBusy, setQrBusy] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setClassName(settings.class_name);
    setDelegateName(settings.delegate_name);
    setAccentColor(settings.accent_color);
    setHomeInfo(settings.home_info);
    setHomeImage(settings.home_image ?? null);
    setSeason(normalizeSeasonTheme(settings.season_theme));
  }, [settings]);

  /** Active ou désactive immédiatement un thème de saison, pour toute la classe. */
  const chooseSeason = async (theme: SeasonTheme) => {
    setSeason(theme);
    applySeason(theme);
    setSeasonBusy(theme);
    setSeasonMessage('');
    try {
      await api.updateSettings({ season_theme: theme });
      await refreshSettings().catch(() => {});
      setSeasonMessage(theme === 'aucun' ? 'Thème normal appliqué' : `Thème ${SEASON_THEMES.find((t) => t.value === theme)?.label} appliqué à toute la classe`);
    } catch (err: any) {
      setSeason(normalizeSeasonTheme(settings?.season_theme));
      applySeason(settings?.season_theme);
      setSeasonMessage(err.message || 'Erreur');
    } finally {
      setSeasonBusy(null);
    }
  };

  const saveClass = async (e: FormEvent) => {
    e.preventDefault();
    setClassBusy(true);
    setClassError('');
    setClassSuccess('');
    try {
      await api.updateSettings({ class_name: className, delegate_name: delegateName, accent_color: accentColor });
      applyAccent(accentColor);
      await refreshSettings().catch(() => {});
      setClassSuccess('Paramètres enregistrés');
    } catch (err: any) {
      setClassError(err.message || 'Erreur');
    } finally {
      setClassBusy(false);
    }
  };

  const saveHome = async (e: FormEvent) => {
    e.preventDefault();
    setHomeBusy(true);
    setHomeError('');
    setHomeSuccess('');
    try {
      await api.updateSettings({ home_info: homeInfo, home_image: homeImage });
      await refreshSettings().catch(() => {});
      setHomeSuccess("Texte d'accueil enregistré");
    } catch (err: any) {
      setHomeError(err.message || 'Erreur');
    } finally {
      setHomeBusy(false);
    }
  };

  const pickHomeImage = async (file: File | undefined) => {
    if (!file) return;
    setHomeImageBusy(true);
    setHomeError('');
    try {
      const dataUri = await fileToDataUri(file, 1200);
      setHomeImage(dataUri);
    } catch {
      setHomeError("Impossible de charger l'image");
    } finally {
      setHomeImageBusy(false);
    }
  };

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    setPwdError('');
    setPwdSuccess('');
    if (newPassword.length < 8) {
      setPwdError('Le nouveau mot de passe doit contenir au moins 8 caractères');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwdError('Les mots de passe ne correspondent pas');
      return;
    }
    setPwdBusy(true);
    try {
      await api.changePassword(oldPassword, newPassword);
      setPwdSuccess('Mot de passe modifié');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setPwdError(err.message || 'Erreur');
    } finally {
      setPwdBusy(false);
    }
  };

  const regenerate = async () => {
    setRegenBusy(true);
    try {
      const res = await api.regenerateToken();
      setNewToken(res.token);
      try {
        await logout();
      } catch {}
      setConfirmRegen(false);
    } catch (err: any) {
      setClassError(err.message || 'Erreur');
      setConfirmRegen(false);
    } finally {
      setRegenBusy(false);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const generateQr = async () => {
    setQrBusy(true);
    try {
      const dataUrl = await QRCode.toDataURL(publicUrl, {
        width: 288,
        margin: 1,
        errorCorrectionLevel: 'M',
      });
      setQrUrl(dataUrl);
    } catch {
      setQrUrl('');
    } finally {
      setQrBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Paramètres</h1>

      <div className="glass-card space-y-4">
        <div>
          <h2 className="font-semibold">Thème de la plateforme</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Décore toute l'application pour les élèves. Activation et désactivation immédiates.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {SEASON_THEMES.map((theme) => {
            const active = season === theme.value;
            return (
              <button
                key={theme.value}
                type="button"
                onClick={() => chooseSeason(theme.value)}
                disabled={seasonBusy !== null}
                className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-left transition-all ${
                  active
                    ? 'ring-2 ring-indigo-500/60 bg-indigo-500/15'
                    : 'glass hover:bg-gray-100/50 dark:hover:bg-gray-700/30'
                } ${seasonBusy !== null ? 'opacity-60' : ''}`}
              >
                <span className="text-2xl">{theme.emoji}</span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{theme.label}</span>
                  <span className="block text-[11px] text-gray-500 dark:text-gray-400">{theme.hint}</span>
                </span>
                {active && <span className="ml-auto text-sm">✓</span>}
              </button>
            );
          })}
        </div>
        {seasonMessage && <p className="text-xs text-gray-500 dark:text-gray-400">{seasonMessage}</p>}
      </div>

      <div className="glass-card space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-semibold">Lien de la classe</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 break-all">{publicUrl}</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={copyLink} className="glass-button text-sm">
            {copied ? '✅ Copié !' : '📋 Copier le lien'}
          </button>
          <button onClick={generateQr} disabled={qrBusy} className="glass-button text-sm">
            {qrBusy ? 'Génération...' : '🔳 Créer un QR code'}
          </button>
        </div>
        {qrUrl && (
          <div className="flex items-center gap-4">
            <img src={qrUrl} alt="QR code" className="w-36 h-36 rounded-xl bg-white p-2 border border-white/20" />
            <button
              onClick={() => {
                const a = document.createElement('a');
                a.href = qrUrl;
                a.download = 'qr-code.png';
                a.click();
              }}
              className="glass-button text-sm"
            >
              ⬇️ Télécharger le QR code
            </button>
          </div>
        )}
        <p className="text-xs text-gray-400 dark:text-gray-500">
          Le lien d'accès délégué reste privé : {window.location.origin}/gestion/{token || '•••'}
        </p>
      </div>

      <form onSubmit={saveClass} className="glass-card space-y-4">
        <h2 className="font-semibold">Informations de la classe</h2>
        <div>
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">
            Nom de la classe
          </label>
          <input
            value={className}
            onChange={(e) => setClassName(e.target.value)}
            className="glass-input"
            placeholder="Ex : Seconde 3"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">
            Nom du délégué
          </label>
          <input
            value={delegateName}
            onChange={(e) => setDelegateName(e.target.value)}
            className="glass-input"
            placeholder="Ex : Alex Martin"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">
            Couleur d'accent
          </label>
          <input
            type="color"
            value={accentColor}
            onChange={(e) => {
              setAccentColor(e.target.value);
              applyAccent(e.target.value);
            }}
            className="w-14 h-11 rounded-xl bg-white/70 dark:bg-gray-800/70 border border-white/20 cursor-pointer"
          />
        </div>
        {classSuccess && <p className="text-sm text-green-600 dark:text-green-400">{classSuccess}</p>}
        {classError && <p className="text-sm text-red-500">{classError}</p>}
        <button type="submit" disabled={classBusy} className="glass-button-primary w-full">
          {classBusy ? 'Enregistrement...' : 'Enregistrer'}
        </button>
      </form>

      <form onSubmit={saveHome} className="glass-card space-y-4">
        <h2 className="font-semibold">Page d'accueil</h2>
        <div>
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">
            Texte d'accueil
          </label>
          <textarea
            value={homeInfo}
            onChange={(e) => setHomeInfo(e.target.value)}
            rows={4}
            className="glass-input resize-none"
            placeholder="Message affiché sur la page d'accueil de la classe..."
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">
            Image d'accueil (optionnelle)
          </label>
          {homeImage ? (
            <div className="relative overflow-hidden rounded-2xl">
              <img src={homeImage} alt="Aperçu" className="w-full max-h-52 object-cover" />
              <button
                type="button"
                onClick={() => setHomeImage(null)}
                className="absolute top-2 right-2 glass-button px-3 py-1.5 text-xs bg-black/40 text-white border-white/20"
              >
                ✕ Retirer
              </button>
            </div>
          ) : (
            <label className="glass flex items-center justify-center gap-2 rounded-2xl px-4 py-4 text-xs text-gray-500 dark:text-gray-400 cursor-pointer min-h-[44px]">
              {homeImageBusy ? 'Chargement...' : '🖼️ Choisir une image'}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => pickHomeImage(e.target.files?.[0])}
              />
            </label>
          )}
        </div>
        {homeSuccess && <p className="text-sm text-green-600 dark:text-green-400">{homeSuccess}</p>}
        {homeError && <p className="text-sm text-red-500">{homeError}</p>}
        <button type="submit" disabled={homeBusy} className="glass-button-primary w-full">
          {homeBusy ? 'Enregistrement...' : 'Enregistrer'}
        </button>
      </form>

      <form onSubmit={handleChangePassword} className="glass-card space-y-4">
        <h2 className="font-semibold">Changer le mot de passe</h2>
        <div>
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">
            Ancien mot de passe
          </label>
          <input
            type="password"
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
            className="glass-input"
            required
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">
            Nouveau mot de passe
          </label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="glass-input"
            required
            minLength={8}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">
            Confirmer le nouveau mot de passe
          </label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="glass-input"
            required
            minLength={8}
          />
        </div>
        {pwdSuccess && <p className="text-sm text-green-600 dark:text-green-400">{pwdSuccess}</p>}
        {pwdError && <p className="text-sm text-red-500">{pwdError}</p>}
        <button type="submit" disabled={pwdBusy} className="glass-button-primary w-full">
          {pwdBusy ? 'Modification...' : 'Modifier le mot de passe'}
        </button>
      </form>

      <div className="glass-card border-red-300/40 dark:border-red-900/40 space-y-4">
        <h2 className="font-semibold text-red-600 dark:text-red-400">Zone sensible</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Régénérer ce lien rendra l'ancien lien invalide. Les élèves devront utiliser le nouveau lien.
        </p>
        <button
          onClick={() => setConfirmRegen(true)}
          disabled={regenBusy}
          className="glass-button w-full bg-red-500/90 text-white border-red-400/30 hover:bg-red-600/90"
        >
          {regenBusy ? 'Régénération...' : '🔄 Régénérer le lien privé'}
        </button>
      </div>

      <Modal isOpen={confirmRegen} onClose={() => setConfirmRegen(false)} title="Régénérer le lien privé">
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-5">
          Voulez-vous vraiment régénérer le lien d'accès délégué ? L'ancien lien ne fonctionnera plus.
        </p>
        <div className="flex gap-3">
          <button onClick={() => setConfirmRegen(false)} className="glass-button flex-1">
            Annuler
          </button>
          <button
            onClick={regenerate}
            className="glass-button flex-1 bg-red-500/90 text-white border-red-400/30 hover:bg-red-600/90"
          >
            Régénérer
          </button>
        </div>
      </Modal>

      <Modal
        isOpen={!!newToken}
        onClose={() => { setNewToken(''); navigate('/gestion'); }}
        title="Nouveau lien généré"
      >
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
          Votre nouveau lien d'accès délégué est :
        </p>
        <p className="glass-card text-sm break-all">{window.location.origin}/gestion/{newToken}/</p>
        <p className="text-xs text-red-500 mt-3">
          Enregistrez ce lien maintenant : vous avez été déconnecté et devrez vous reconnecter avec ce nouveau lien.
        </p>
        <button
          onClick={() => { setNewToken(''); navigate('/gestion'); }}
          className="glass-button-primary w-full mt-4"
        >
          Comprendre
        </button>
      </Modal>
    </div>
  );
}

export default Settings;