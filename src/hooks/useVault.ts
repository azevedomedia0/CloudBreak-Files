import { useEffect, useState } from 'react';
import { rustBridge } from '../services/rustBridge';
import type { AppPreferences } from '../utils/appPreferences';

/** Vault lock state, with auto-lock after the idle timeout from preferences. */
export function useVault(appPreferences: AppPreferences, showToast: (message: string) => void) {
  const [isVaultUnlocked, setIsVaultUnlocked] = useState<boolean>(false);

  /** Resolves to true when the lock state changed, false when it failed (the reason is shown as a toast). */
  const handleToggleVaultLock = async (unlocked: boolean, passphrase?: string): Promise<boolean> => {
    try {
      if (unlocked) {
        await rustBridge.unlockVault(passphrase ?? '');
      } else {
        await rustBridge.lockVault();
      }
      setIsVaultUnlocked(unlocked);
      if (appPreferences.securityAlerts) {
        showToast(unlocked ? 'Vault Decrypted' : 'Vault Locked & Encrypted');
      }
      return true;
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
      return false;
    }
  };


  // Auto-lock vault after idle timeout
  useEffect(() => {
    if (!isVaultUnlocked || appPreferences.autoLockMinutes <= 0) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const ms = appPreferences.autoLockMinutes * 60 * 1000;
    const arm = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void (async () => {
          try {
            await rustBridge.lockVault();
            setIsVaultUnlocked(false);
            if (appPreferences.securityAlerts) {
              showToast('Vault auto-locked after idle timeout');
            }
          } catch {
            // ignore
          }
        })();
      }, ms);
    };
    const events: Array<keyof WindowEventMap> = ['pointerdown', 'keydown', 'mousemove', 'wheel'];
    arm();
    for (const ev of events) window.addEventListener(ev, arm, { passive: true });
    return () => {
      if (timer) clearTimeout(timer);
      for (const ev of events) window.removeEventListener(ev, arm);
    };
  }, [isVaultUnlocked, appPreferences.autoLockMinutes, appPreferences.securityAlerts, showToast]);

  return { isVaultUnlocked, handleToggleVaultLock };
}
