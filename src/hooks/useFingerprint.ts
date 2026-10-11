import { useEffect, useState } from 'react';

export function useFingerprint() {
  const [fingerprint, setFingerprint] = useState<string>('');

  useEffect(() => {
    let fp = localStorage.getItem('device_fingerprint');
    if (!fp) {
      fp = crypto.randomUUID();
      localStorage.setItem('device_fingerprint', fp);
    }
    setFingerprint(fp);
  }, []);

  return fingerprint;
}