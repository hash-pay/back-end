/**
 * Minimal /settle endpoint
 * Request body: { payment: "<base64>", requirement: {...} }
 * Response: { success: boolean, transaction?: string, error?: string }
 *
 * In production, `settle` should call out to the network or to a wallet service
 * to actually transfer/settle funds (or confirm the transfer). Here we mock it.
 */

import expressAsyncHandler from 'express-async-handler';
import { Transaction } from '@hashgraph/sdk';
import { hederaClient } from '../../lib/hedera/client';

export const settlePayment = expressAsyncHandler(async (req, res) => {
  try {
    const { paymentPayload } = req.body;
    const { signature } = paymentPayload.payload;

    // Decode base64 signed transaction
    const txBytes = Buffer.from(signature, 'base64');
    const tx = Transaction.fromBytes(txBytes);

    const submit = await tx.execute(hederaClient);
    const receipt = await submit.getReceipt(hederaClient);
    console.log(
      'The transaction consensus status is ' + receipt.status.toString(),
    );
    console.log('payer is', tx.transactionId.accountId.toString());
    res.json({
      success: true,
      transaction: submit.transactionId.toString(),
      payer: tx.transactionId.accountId.toString(),
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: (err as Error).message,
    });
  }
});
