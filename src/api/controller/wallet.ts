import expressAsyncHandler from 'express-async-handler';
import {
  AccountId,
  TokenId,
  AccountBalanceQuery,
  Client,
  PrivateKey,
  TransferTransaction,
} from '@hashgraph/sdk';
import prisma from '../prisma-client';
import { hederaClient } from '../lib/hedera/client';
import { decryptPrivateKey } from '../lib/encryption';

// 1. Get wallet address
export const getWalletAddress = expressAsyncHandler(async (req, res) => {
  const { phoneNumber } = req.params;

  const user = await prisma.user.findUnique({
    where: { phoneNumber: phoneNumber },
  });
  if (!user) {
    res.status(404).json({ message: 'User not found' });
    return;
  }

  res.status(200).json({
    hederaAccountId: user.hederaAccountId,
  });
});

// 2. Get USDC balance
export const getWalletBalance = expressAsyncHandler(async (req, res) => {
  const { phoneNumber } = req.params;
  // demo wallet id
  const walletId = '0.0.5143930';
  const user = await prisma.user.findUnique({
    where: { phoneNumber: phoneNumber },
  });
  /* if (!user) {
    res.status(404).json({ message: 'User not found' });
    return;
  }*/

  //const accountId = AccountId.fromString(walletId);
  const accountId = AccountId.fromString(user.hederaAccountId);
  const tokenId = TokenId.fromString(process.env.USDC_TOKEN_ID);

  const balance = await new AccountBalanceQuery()
    .setAccountId(accountId)
    .execute(hederaClient);

  const tokenBalance =
    balance.tokens.get(tokenId.toString())?.toString() || '0';

  res.status(200).json({
    token: 'USDC',
    balance: tokenBalance,
  });
});

// SEND USDC

export const sendUSDC = expressAsyncHandler(async (req, res) => {
  const { senderId, recipientPhone, amount } = req.body;

  if (!senderId || !recipientPhone || !amount) {
    res.status(400).json({ message: 'Missing required fields' });
    return;
  }

  const sender = await prisma.user.findUnique({ where: { id: senderId } });
  const receiver = await prisma.user.findUnique({
    where: { phoneNumber: recipientPhone },
  });

  if (!sender || !receiver) {
    res.status(404).json({ message: 'Sender or recipient not found' });
    return;
  }

  const senderAccount = AccountId.fromString(sender.hederaAccountId);
  const receiverAccount = AccountId.fromString(receiver.hederaAccountId);
  const tokenId = TokenId.fromString(process.env.USDC_TOKEN_ID);

  const privateKey = PrivateKey.fromStringED25519(
    decryptPrivateKey(sender.hederaPrivateKey),
  );

  const transferTx = await new TransferTransaction()
    .addTokenTransfer(tokenId, senderAccount, -Number(amount))
    .addTokenTransfer(tokenId, receiverAccount, Number(amount))
    .freezeWith(hederaClient)
    .sign(privateKey);

  const txResponse = await transferTx.execute(hederaClient);
  const receipt = await txResponse.getReceipt(hederaClient);

  await prisma.transaction.create({
    data: {
      fromUserId: senderId,
      toUserId: receiver.id,
      amount: amount.toString(),
      tokenSymbol: 'USDC',
      hash: txResponse.transactionId.toString(),
      status: 'SENT',
    },
  });

  if (receipt.status.toString() === 'SUCCESS') {
    res.status(200).json({
      message: 'Transfer successful',
      txId: txResponse.transactionId.toString(),
    });
  } else {
    res
      .status(500)
      .json({ message: 'Transfer failed', status: receipt.status.toString() });
  }
});
