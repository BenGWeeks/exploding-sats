/// <reference types="vite/client" />

interface WebLNProvider {
  enable(): Promise<void>;
  sendPayment(invoice: string): Promise<{ preimage: string }>;
  makeInvoice(args: { amount?: number; defaultAmount?: number; minimumAmount?: number; maximumAmount?: number; defaultMemo?: string }): Promise<{ paymentRequest: string }>;
  signMessage(message: string): Promise<{ message: string; signature: string }>;
  verifyMessage(signature: string, message: string): Promise<void>;
}

interface Window {
  webln?: WebLNProvider;
}
