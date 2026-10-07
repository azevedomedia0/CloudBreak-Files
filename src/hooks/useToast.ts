import { useState } from 'react';

/** One message at a time. It clears itself after 3.5 seconds. */
export function useToast() {
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  return { toast, showToast };
}
