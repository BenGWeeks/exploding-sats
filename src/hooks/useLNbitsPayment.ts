import { useState, useEffect, useCallback, useRef } from 'react';
import { decode } from 'light-bolt11-decoder';

interface LNURLPayResponse {
  callback: string;
  minSendable: number;
  maxSendable: number;
  metadata: string;
  commentAllowed?: number;
}

interface LNURLInvoiceResponse {
  pr: string;
  routes?: unknown[];
}

interface UseLNbitsPaymentOptions {
  lightningAddress: string;
  lnbitsUrl: string;
  apiKey: string;
  onPaid?: () => void;
}

interface UseLNbitsPaymentReturn {
  createInvoice: (amountSats: number, memo?: string) => Promise<string>;
  invoice: string | null;
  paymentHash: string | null;
  isPaid: boolean;
  isPolling: boolean;
  error: string | null;
  reset: () => void;
}

/**
 * Extract payment hash from bolt11 invoice
 */
function extractPaymentHash(bolt11: string): string | null {
  try {
    const decoded = decode(bolt11);
    const paymentHashSection = decoded.sections.find(
      (s: { name: string }) => s.name === 'payment_hash'
    ) as { name: string; value: string } | undefined;
    return paymentHashSection?.value || null;
  } catch {
    return null;
  }
}

/**
 * Hook to create invoices via LNURL and poll LNbits for payment status
 */
export function useLNbitsPayment({
  lightningAddress,
  lnbitsUrl,
  apiKey,
  onPaid,
}: UseLNbitsPaymentOptions): UseLNbitsPaymentReturn {
  const [invoice, setInvoice] = useState<string | null>(null);
  const [paymentHash, setPaymentHash] = useState<string | null>(null);
  const [isPaid, setIsPaid] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const onPaidRef = useRef(onPaid);

  useEffect(() => {
    onPaidRef.current = onPaid;
  }, [onPaid]);

  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

  const checkPaymentStatus = useCallback(async (hash: string): Promise<boolean> => {
    try {
      const url = `${lnbitsUrl}/api/v1/payments/${hash}`;

      const response = await fetch(url, {
        headers: {
          'X-Api-Key': apiKey,
        },
      });

      if (!response.ok) {
        console.warn('[Payment] Status check failed:', response.status, await response.text());
        return false;
      }

      const data = await response.json();
      // LNbits uses "status": "success" for paid invoices (not "paid": true)
      const isPaid = data.paid === true || data.status === 'success';
      return isPaid;
    } catch (err) {
      console.warn('[Payment] Error checking status:', err);
      return false;
    }
  }, [lnbitsUrl, apiKey]);

  const startPolling = useCallback((hash: string) => {
    // Clear any existing polling before starting new one
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }

    setIsPolling(true);

    pollingRef.current = setInterval(async () => {
      const paid = await checkPaymentStatus(hash);

      if (paid) {
        setIsPaid(true);
        setIsPolling(false);

        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }

        if (onPaidRef.current) {
          onPaidRef.current();
        }
      }
    }, 2000);

    // Stop polling after 10 minutes
    setTimeout(() => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
        setIsPolling(false);
      }
    }, 10 * 60 * 1000);
  }, [checkPaymentStatus]);

  const createInvoice = useCallback(async (amountSats: number, memo?: string): Promise<string> => {
    setError(null);
    setIsPaid(false);

    try {
      // Parse lightning address
      const [username, domain] = lightningAddress.split('@');
      if (!username || !domain) {
        throw new Error('Invalid lightning address');
      }

      // Step 1: Get LNURL-pay endpoint (CORS enabled)
      const lnurlResponse = await fetch(`https://${domain}/.well-known/lnurlp/${username}`);
      if (!lnurlResponse.ok) {
        throw new Error('Failed to resolve lightning address');
      }
      const lnurlData: LNURLPayResponse = await lnurlResponse.json();

      // Step 2: Request invoice from callback (CORS enabled)
      const callbackUrl = new URL(lnurlData.callback);
      callbackUrl.searchParams.set('amount', (amountSats * 1000).toString());
      if (memo && lnurlData.commentAllowed) {
        callbackUrl.searchParams.set('comment', memo.slice(0, lnurlData.commentAllowed));
      }

      const invoiceResponse = await fetch(callbackUrl.toString());
      if (!invoiceResponse.ok) {
        throw new Error('Failed to get invoice');
      }
      const invoiceData: LNURLInvoiceResponse = await invoiceResponse.json();

      if (!invoiceData.pr) {
        throw new Error('No invoice returned');
      }

      // Extract payment hash from bolt11
      const hash = extractPaymentHash(invoiceData.pr);
      if (!hash) {
        throw new Error('Could not extract payment hash');
      }

      setInvoice(invoiceData.pr);
      setPaymentHash(hash);

      // Start polling for payment status
      startPolling(hash);

      return invoiceData.pr;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create invoice';
      setError(message);
      throw err;
    }
  }, [lightningAddress, startPolling]);

  const reset = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    setInvoice(null);
    setPaymentHash(null);
    setIsPaid(false);
    setIsPolling(false);
    setError(null);
  }, []);

  return {
    createInvoice,
    invoice,
    paymentHash,
    isPaid,
    isPolling,
    error,
    reset,
  };
}
