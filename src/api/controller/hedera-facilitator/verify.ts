import expressAsyncHandler from 'express-async-handler';
import { PaymentPayload } from './types/types';
import { PublicKey, Transaction } from '@hashgraph/sdk';

function safeBase64Decode(input: string): string {
  // base64url vs base64 differences? adapt if x402 uses url-safe base64
  try {
    const buf = Buffer.from(input, 'base64');
    return buf.toString('utf-8');
  } catch (err) {
    throw new Error('Invalid base64 encoding');
  }
}

export function decodePaymentHeader(paymentB64: string): PaymentPayload {
  if (!paymentB64 || typeof paymentB64 !== 'string') {
    throw new Error('Payment header required and must be a string');
  }
  const decoded = safeBase64Decode(paymentB64);
  try {
    const parsed = JSON.parse(decoded);
    // Minimal structural validation — extend to full schema checks
    if (
      !parsed.payload ||
      !parsed.payload.authorization ||
      !parsed.payload.authorization.from
    ) {
      throw new Error('Missing required payment payload fields');
    }
    return parsed as PaymentPayload;
  } catch (err) {
    throw new Error(`Failed to parse payment JSON: ${(err as Error).message}`);
  }
}

export const verfyHandler = expressAsyncHandler(async (req, res) => {
  try {
    const { x402Version, paymentPayload, paymentRequirements } = req.body;
    console.log('This is verify body', req.body);

    if (paymentPayload.payloadType !== 'hedera-signed-transaction') {
      res.status(400).json({
        isValid: false,
        invalidReason: 'Unsupported payload type',
      });
      return;
    }

    const { signature, authorization } = paymentPayload.payload;

    // Example stub check: does amount match requirements?
    if (authorization.value !== paymentRequirements.maxAmountRequired) {
      res.json({
        isValid: false,
        invalidReason: 'Amount mismatch',
        payer: { address: authorization.from },
      });
      return;
    }

    // TODO: Verify signature against signedTxBase64 using Hedera SDK

    // For now, just stub return valid
    res.json({
      isValid: true,
      payer: { address: authorization.from },
    });
  } catch (err) {
    res.status(500).json({
      isValid: false,
      invalidReason: (err as Error).message,
    });
    return;
  }
});
