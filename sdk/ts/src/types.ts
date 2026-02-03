/**
 * L402 Types and Errors
 * 
 * @trace Task-P1-03, Vol.2 §2.4
 * @constraint D-SDK-05: TS 类型检查通过
 */

/**
 * L402 Challenge from 402 Response
 */
export interface L402Challenge {
  macaroon: string;
  invoice: string;
  paymentHash?: string;
  amountMsats?: number;
}

/**
 * L402 Credential for authenticated requests
 */
export interface L402Credential {
  macaroon: string;
  preimage: string;
}

/**
 * Format credential as Authorization header value
 */
export function formatCredentialHeader(credential: L402Credential): string {
  return `L402 ${credential.macaroon}:${credential.preimage}`;
}
