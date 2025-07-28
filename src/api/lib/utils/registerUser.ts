import { PrivateKey, AccountCreateTransaction, Hbar } from '@hashgraph/sdk';

import { hederaClient } from '../hedera/client';

import bcrypt from 'bcrypt';
import { encryptPrivateKey } from '../encryption';
import prisma from '../../prisma-client';
import { associateTokenWithAccount } from './associateToken';

export const createUserWallet = async (phoneNumber, pin) => {
  try {
    const privateKey = PrivateKey.generateED25519();
    const publicKey = privateKey.publicKey;

    const transaction = await new AccountCreateTransaction()
      .setKey(publicKey)
      .setInitialBalance(new Hbar(0)) // 0 HBAR for now
      .execute(hederaClient);

    const receipt = await transaction.getReceipt(hederaClient);
    const newAccountId = receipt.accountId.toString();

    // Encrypt PK and hash PIN
    const encryptedPK = encryptPrivateKey(privateKey.toString());
    const hashedPIN = await bcrypt.hash(pin, 10);

    const newUser = await prisma.user.create({
      data: {
        phoneNumber,
        hederaAccountId: newAccountId,
        hederaPrivateKey: encryptedPK,
        pinHash: hashedPIN,
      },
    });

    // Auto-associate token
    await associateTokenWithAccount(newAccountId, privateKey);

    return newUser;
  } catch (err) {
    console.error('[createUserWallet]', err.message);
    return null;
  }
};
