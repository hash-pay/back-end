import { PrivateKey, AccountCreateTransaction, Hbar } from '@hashgraph/sdk';
import { hederaClient } from '../hedera/client';

import { encryptPrivateKey } from '../encryption';
import prisma from '../../prisma-client';
import { associateTokenWithAccount } from './associateToken';

export const completeUserWalletSetup = async (phoneNumber: string) => {
  try {
    const privateKey = PrivateKey.generateED25519();
    const publicKey = privateKey.publicKey;

    const transaction = await new AccountCreateTransaction()
      .setKey(publicKey)
      .setInitialBalance(new Hbar(0)) // 0 HBAR
      .execute(hederaClient);

    const receipt = await transaction.getReceipt(hederaClient);
    const newAccountId = receipt.accountId.toString();

    const encryptedPK = encryptPrivateKey(privateKey.toString());

    // Update existing user with wallet data
    const updatedUser = await prisma.user.update({
      where: { phoneNumber },
      data: {
        hederaAccountId: newAccountId,
        hederaPrivateKey: encryptedPK,
        status: 'ACTIVE',
      },
    });

    // Associate USDC token
    await associateTokenWithAccount(newAccountId, privateKey);

    return {
      accountId: newAccountId,
      privateKey: encryptedPK,
    };
  } catch (err) {
    console.error('[completeUserWalletSetup]', err.message);
    return null;
  }
};
