//import { createUserWallet } from '../src/api/lib/utils/registerUser';

import dotenv from 'dotenv';
import prisma from '../../prisma-client';
import { sendSMS } from './sendSMS';
import { completeUserWalletSetup } from './completeUserWalletSetup';

dotenv.config();

export async function processPendingUsers() {
  const pendingUsers = await prisma.user.findMany({
    where: { status: 'PENDING' },
  });

  for (const user of pendingUsers) {
    try {
      console.log(`Registering wallet for ${user.phoneNumber}...`);

      const result = await completeUserWalletSetup(user.phoneNumber);

      if (result?.accountId && result?.privateKey) {
        await prisma.user.update({
          where: { phoneNumber: user.phoneNumber },
          data: {
            hederaAccountId: result.accountId,
            hederaPrivateKey: result.privateKey,
            status: 'ACTIVE',
          },
        });

        await sendSMS(user.phoneNumber, '✅ Your YamPay wallet is now ready!');
        console.log(`Wallet created for ${user.phoneNumber}`);
      } else {
        throw new Error('Wallet creation failed');
      }
    } catch (error) {
      console.error(`❌ Failed for ${user.phoneNumber}:`, error);
      await prisma.user.update({
        where: { phoneNumber: user.phoneNumber },
        data: { status: 'FAILED' },
      });
    }
  }
}

/*processPendingUsers()
  .then(() => {
    console.log('Done processing pending users');
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });*/
