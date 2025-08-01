import expressAsyncHandler from 'express-async-handler';
import prisma from '../prisma-client';
import bcrypt from 'bcrypt';
import {
  PrivateKey,
  AccountCreateTransaction,
  Hbar,
  Client,
  AccountId,
  TokenId,
  TokenAssociateTransaction,
} from '@hashgraph/sdk';
import { v4 as uuidv4 } from 'uuid';
import { decryptPrivateKey, encryptPrivateKey } from '../lib/encryption';
import { hederaClient } from '../lib/hedera/client';
import { sendAirtime } from '../lib/sendAirtime';

export const registerUser = expressAsyncHandler(async (req, res) => {
  const { phoneNumber, pin } = req.body;

  if (!phoneNumber || !pin) {
    res.status(400).json({ message: 'Phone number and PIN are required.' });
    throw new Error('Missing input');
  }

  // Check if user already exists
  const existing = await prisma.user.findUnique({
    where: { phoneNumber },
  });

  if (existing) {
    res.status(400).json({ message: 'User already registered.' });
    throw new Error('Duplicate user');
  }

  // Generate new Hedera account
  const userPrivateKey = PrivateKey.generateED25519();
  const userPublicKey = userPrivateKey.publicKey;

  const tx = await new AccountCreateTransaction()
    .setKey(userPublicKey)
    .setInitialBalance(new Hbar(0)) // 0 HBAR since platform pays gas
    .execute(hederaClient);

  const receipt = await tx.getReceipt(hederaClient);
  const accountId = receipt.accountId.toString();

  // Hash the PIN
  const saltRounds = 10;
  const hashedPin = await bcrypt.hash(pin, saltRounds);

  // encrypt PK
  const encryptedKey = encryptPrivateKey(userPrivateKey.toString());
  // Save user
  const newUser = await prisma.user.create({
    data: {
      phoneNumber,
      pinHash: hashedPin,
      hederaAccountId: accountId,
      hederaPrivateKey: encryptedKey, // You should encrypt this
    },
  });

  res.status(201).json({
    message: 'User registered successfully.',
    userId: newUser.id,
    phoneNumber: newUser.phoneNumber,
  });
});

const publicKey = process.env.HEDERA_OPERATOR_ID;
const privateKey = process.env.HEDERA_OPERATOR_KEY;

export const checkEnvs = expressAsyncHandler(async (req, res) => {
  res.status(200).json({
    publicKey,
    privateKey,
  });
});

export const associateToken = expressAsyncHandler(async (req, res) => {
  const { userId } = req.params;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    res.status(404).json({ message: 'User not found' });
    return;
  }

  const accountId = AccountId.fromString(user.hederaAccountId);
  // const decryptedKey = decryptPrivateKey(user.hederaPrivateKey);
  const privateKey = PrivateKey.fromStringED25519(user.hederaPrivateKey);
  const tokenId = TokenId.fromString(process.env.USDC_TOKEN_ID);

  const tx = await new TokenAssociateTransaction()
    .setAccountId(accountId)
    .setTokenIds([tokenId])
    .freezeWith(hederaClient)
    .sign(privateKey);

  const response = await tx.execute(hederaClient);
  const receipt = await response.getReceipt(hederaClient);

  if (receipt.status.toString() === 'SUCCESS') {
    res.status(200).json({ message: 'Token associated successfully.' });
  } else {
    res.status(500).json({
      message: 'Token association failed.',
      status: receipt.status.toString(),
    });
  }
});

const number = '255625220627';
export const buyAritime = expressAsyncHandler(async (req, res) => {
  try {
    const response = await sendAirtime({ phoneNumber: number, amount: 100 });

    res.status(200).json(response);
  } catch (error) {
    res.status(500).json(error);
  }
});
