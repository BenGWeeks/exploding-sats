/**
 * Lightning Invoice Generation
 * Generates invoices from Lightning addresses
 */

interface LNURLPayResponse {
  status?: 'OK' | 'ERROR';
  tag: string;
  commentAllowed?: number;
  minSendable: number;
  maxSendable: number;
  metadata: string;
  callback: string;
}

interface LNURLInvoiceResponse {
  status?: 'OK' | 'ERROR';
  reason?: string;
  pr?: string;
}

export function isValidLightningAddress(address: string): boolean {
  if (!address || typeof address !== 'string') {
    return false;
  }

  const trimmed = address.trim();
  const parts = trimmed.split('@');
  if (parts.length !== 2) {
    return false;
  }

  const [username, domain] = parts;
  
  if (!username || username.length === 0) {
    return false;
  }

  if (!domain || !domain.includes('.')) {
    return false;
  }

  const domainParts = domain.split('.');
  if (domainParts.length < 2 || domainParts[domainParts.length - 1].length < 2) {
    return false;
  }

  return true;
}

async function resolveLightningAddress(
  lightningAddress: string
): Promise<LNURLPayResponse> {
  if (!isValidLightningAddress(lightningAddress)) {
    throw new Error('Invalid Lightning address format. Expected: username@domain.com');
  }

  const [username, domain] = lightningAddress.split('@');
  const lnurlEndpoint = `https://${domain}/.well-known/lnurlp/${username}`;
  
  const response = await fetch(lnurlEndpoint, {
    headers: { 'Accept': 'application/json' },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to resolve Lightning address: ${response.status} ${response.statusText}`
    );
  }

  const data: LNURLPayResponse = await response.json();

  if (data.status && data.status !== 'OK') {
    throw new Error('LNURL endpoint returned error status');
  }

  if (data.tag !== 'payRequest') {
    throw new Error(`Unexpected LNURL tag: ${data.tag}`);
  }

  return data;
}

interface GetInvoiceParams {
  lightningAddress: string;
  amountSats: number;
  comment?: string;
}

export async function getInvoiceFromLightningAddress(
  params: GetInvoiceParams
): Promise<string> {
  const { lightningAddress, amountSats, comment } = params;

  if (!isValidLightningAddress(lightningAddress)) {
    throw new Error('Invalid Lightning address format. Expected: username@domain.com');
  }

  if (amountSats <= 0) {
    throw new Error('Amount must be greater than 0');
  }

  // Resolve LNURL-pay endpoint
  const lnurlData = await resolveLightningAddress(lightningAddress);

  // Validate amount against min/max bounds
  const minSats = lnurlData.minSendable / 1000;
  const maxSats = lnurlData.maxSendable / 1000;

  if (amountSats < minSats) {
    throw new Error(`Amount ${amountSats} sats is below minimum ${minSats} sats`);
  }

  if (amountSats > maxSats) {
    throw new Error(`Amount ${amountSats} sats exceeds maximum ${maxSats} sats`);
  }

  // Request invoice from callback URL
  const amountMsats = amountSats * 1000;
  const callbackUrl = new URL(lnurlData.callback);
  callbackUrl.searchParams.set('amount', amountMsats.toString());

  if (comment && lnurlData.commentAllowed) {
    if (comment.length > lnurlData.commentAllowed) {
      throw new Error(
        `Comment length ${comment.length} exceeds maximum ${lnurlData.commentAllowed} characters`
      );
    }
    callbackUrl.searchParams.set('comment', comment);
  }

  const invoiceResponse = await fetch(callbackUrl.toString(), {
    headers: { 'Accept': 'application/json' },
  });

  if (!invoiceResponse.ok) {
    throw new Error(
      `Failed to get invoice: ${invoiceResponse.status} ${invoiceResponse.statusText}`
    );
  }

  const invoiceData: LNURLInvoiceResponse = await invoiceResponse.json();

  if (invoiceData.pr) {
    return invoiceData.pr;
  }

  if (invoiceData.status && invoiceData.status !== 'OK') {
    const errorReason = invoiceData.reason || 'Invoice generation failed';
    throw new Error(`Invoice generation failed: ${errorReason}`);
  }

  throw new Error('No invoice returned from provider');
}
