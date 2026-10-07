"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    snap?: {
      pay: (
        token: string,
        callbacks: {
          onSuccess?: (result: unknown) => void;
          onPending?: (result: unknown) => void;
          onError?: (result: unknown) => void;
          onClose?: () => void;
        },
      ) => void;
    };
  }
}

const SANDBOX_SNAP_URL = "https://app.sandbox.midtrans.com/snap/snap.js";
const PRODUCTION_SNAP_URL = "https://app.midtrans.com/snap/snap.js";

/**
 * Opens Snap using a server-created token. `clientKey` is the ONLY Midtrans
 * value this component ever receives — the server key never reaches the
 * browser (FR-027, Constitution Principle IX).
 */
export function SnapTrigger({
  token,
  clientKey,
  isProduction,
  onSuccess,
  onPending,
  onError,
  onClose,
}: {
  token: string;
  clientKey: string;
  isProduction: boolean;
  onSuccess?: (result: unknown) => void;
  onPending?: (result: unknown) => void;
  onError?: (result: unknown) => void;
  onClose?: () => void;
}) {
  const hasOpened = useRef(false);

  useEffect(() => {
    if (hasOpened.current) return;
    hasOpened.current = true;

    const src = isProduction ? PRODUCTION_SNAP_URL : SANDBOX_SNAP_URL;
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);

    function open() {
      window.snap?.pay(token, { onSuccess, onPending, onError, onClose });
    }

    if (existing) {
      open();
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.setAttribute("data-client-key", clientKey);
    script.onload = open;
    document.body.appendChild(script);
  }, [token, clientKey, isProduction, onSuccess, onPending, onError, onClose]);

  return null;
}
