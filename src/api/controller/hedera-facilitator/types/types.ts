export type PaymentPayload = {
  x402Version?: number;
  payload: {
    authorization: {
      from: string; // payer address (or account) — adjust to your schema
      value?: unknown;
      validAfter?: number;
      validBefore?: number;
    };
    signature?: string;
  };
  // other fields...
};
