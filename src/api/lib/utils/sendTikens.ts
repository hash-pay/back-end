import {
  AccountId,
  PrivateKey,
  TokenId,
  TransferTransaction,
} from '@hashgraph/sdk';
import { decryptPrivateKey } from '../encryption';
import { hederaClient } from '../hedera/client';
import prisma from '../../prisma-client';

export const sendTokens = async (sender, receiver, amount) => {
  try {
    const senderAccount = AccountId.fromString(sender.hederaAccountId);
    const receiverAccount = AccountId.fromString(receiver.hederaAccountId);
    const privateKey = PrivateKey.fromStringED25519(
      decryptPrivateKey(sender.hederaPrivateKey),
    );

    const tokenId = TokenId.fromString(process.env.USDC_TOKEN_ID);

    const tx = await new TransferTransaction()
      .addTokenTransfer(tokenId, senderAccount, -Number(amount))
      .addTokenTransfer(tokenId, receiverAccount, Number(amount))
      .freezeWith(hederaClient)
      .sign(privateKey);

    const txResponse = await tx.execute(hederaClient);
    const receipt = await txResponse.getReceipt(hederaClient);

    // Record transaction
    await prisma.transaction.create({
      data: {
        fromUserId: sender.id,
        toUserId: receiver.id,
        amount: parseFloat(amount),
        tokenSymbol: 'USDC',
        hash: txResponse.transactionId.toString(),
        status: 'SENT',
      },
    });

    return receipt.status.toString() === 'SUCCESS';
  } catch (err) {
    console.error('[sendTokens error]', err.message);
    return false;
  }
};
