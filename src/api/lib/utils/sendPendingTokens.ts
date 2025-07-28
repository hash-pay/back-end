import {
  AccountId,
  PrivateKey,
  TokenId,
  TransferTransaction,
  Long,
} from '@hashgraph/sdk';
import { decryptPrivateKey } from '../encryption';
import { hederaClient } from '../hedera/client';
import prisma from '../../prisma-client';

export const sendTokens = async (
  sender,
  receiver,
  amountMicroUnits: bigint,
) => {
  try {
    const senderAccount = AccountId.fromString(sender.hederaAccountId);
    const receiverAccount = AccountId.fromString(receiver.hederaAccountId);
    const privateKey = PrivateKey.fromStringED25519(
      decryptPrivateKey(sender.hederaPrivateKey),
    );

    const tokenId = TokenId.fromString(process.env.USDC_TOKEN_ID);

    const tx = await new TransferTransaction()
      //.addTokenTransfer(tokenId, senderAccount, -amountMicroUnits)
      // .addTokenTransfer(tokenId, receiverAccount, amountMicroUnits)
      .addTokenTransfer(
        tokenId,
        senderAccount,
        Long.fromBigInt(-amountMicroUnits),
      )
      .addTokenTransfer(
        tokenId,
        receiverAccount,
        Long.fromBigInt(amountMicroUnits),
      )
      .freezeWith(hederaClient)
      .sign(privateKey);

    const txResponse = await tx.execute(hederaClient);
    const receipt = await txResponse.getReceipt(hederaClient);

    try {
      await prisma.transaction.create({
        data: {
          fromUserId: sender.id,
          toUserId: receiver.id,
          amount: Number(amountMicroUnits) / 1_000_000,
          tokenSymbol: 'USDC',
          hash: txResponse.transactionId.toString(),
          status: 'SENT',
        },
      });
    } catch (logErr) {
      console.error('[⚠️ Failed to log transaction]', logErr.message);
    }

    return receipt.status.toString() === 'SUCCESS';
  } catch (err) {
    console.error('[sendTokens error]', err.message);
    return false;
  }
};
