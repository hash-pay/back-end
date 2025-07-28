import prisma from '../../prisma-client';
import { sendTokens } from './sendPendingTokens';

export async function processPendingTransfers() {
  const pendingTransfers = await prisma.transferRequest.findMany({
    where: { status: 'PENDING' },
    include: {
      sender: true, // assuming relations exist
      recipient: true,
    },
  });

  for (const transfer of pendingTransfers) {
    try {
      if (!transfer.sender || !transfer.recipient) {
        console.error(
          `Invalid sender or recipient for transfer ${transfer.id}`,
        );
        await prisma.transferRequest.update({
          where: { id: transfer.id },
          data: { status: 'FAILED' },
        });
        continue;
      }

      // call your existing sendTokens util, expects bigint for amountMicroUnits
      const success = await sendTokens(
        transfer.sender,
        transfer.recipient,
        transfer.amountMicro,
      );

      await prisma.transferRequest.update({
        where: { id: transfer.id },
        data: {
          status: success ? 'COMPLETED' : 'FAILED',
        },
      });

      if (success) {
        console.log(`Transfer ${transfer.id} completed successfully.`);
      } else {
        console.error(`Transfer ${transfer.id} failed.`);
      }
    } catch (err) {
      console.error(`Error processing transfer ${transfer.id}:`, err);
      await prisma.transferRequest.update({
        where: { id: transfer.id },
        data: { status: 'FAILED' },
      });
    }
  }
}
