import { useEffect, useState, type FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { useSettings } from '@/hooks/useSettings';
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

  const [copied, setCopied] = useState(false);
  const [qrUrl, setQrUrl] = useState('');
  const [qrBusy, setQrBusy] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setClassName(settings.class_name);
    setDelegateName(settings.delegate_name);
    setAccentColor(settings.accent_color);
    setHomeInfo(settings.home_info);
  }, [settings]);

  const saveClass = async (e: FormEvent) => {
    e.preventDefault();
    setClassBusy(true);
    setClassError('');
    setClassSuccess('');
    try {
      await api.updateSettings({ class_name: className, delegate_name: delegateName, accent_color: accentColor });
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
      await api.updateSettings({ home_info: homeInfo });
      setHomeSuccess("Texte d'accueil enregistré");
    } catch (err: any) {
      setHomeError(err.message || 'Erreur');
    } finally {
      setHomeBusy(false);
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
            onChange={(e) => setAccentColor(e.target.value)}
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