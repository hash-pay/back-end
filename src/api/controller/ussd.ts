import expressAsyncHandler from 'express-async-handler';
import bcrypt from 'bcrypt';

import prisma from '../prisma-client';
import { getUserBalance } from '../lib/utils/balance';
import { sendTokens } from '../lib/utils/sendTikens';
import { createUserWallet } from '../lib/utils/registerUser';
import { toMicroUnits } from '../lib/utils/formatCurrencies';
import { sendAirtime } from '../lib/sendAirtime';

export const handleUssdRequest = expressAsyncHandler(async (req, res) => {
  const { sessionId, phoneNumber, text } = req.body;

  // Add this to debug
  console.log('[USSD]', req.body);

  const inputs = text.split('*');
  const level = inputs.length;

  const user = await prisma.user.findUnique({ where: { phoneNumber } });

  // 🚨 NOT REGISTERED: Handle registration menu only
  if (!user) {
    if (text === '') {
      res.send(`CON Welcome to YamPay\n1. Register Wallet`);
      return;
    }

    if (inputs[0] === '1' && level === 1) {
      res.send(`CON Enter 4-digit PIN to secure your wallet:`);
      return;
    }

    if (inputs[0] === '1' && level === 2) {
      const pin = inputs[1];

      if (!/^\d{4}$/.test(pin)) {
        res.send(`END Invalid PIN format.`);
        return;
      }

      // Check if user exist
      const existing = await prisma.user.findUnique({ where: { phoneNumber } });
      if (existing) {
        res.send(`END You already registered.`);
        return;
      }

      const pinHash = await bcrypt.hash(pin, 10);
      // 🔐 register wallet as pending
      await prisma.user.create({
        data: {
          phoneNumber,
          pinHash,
          status: 'PENDING',
        },
      });

      // 🔔 Immediate USSD Response
      res.send(
        `END Wallet creation in progress. You'll receive SMS once ready.`,
      );
      return;
    }
  }

  // Step 0: Welcome Screen
  if (text === '') {
    res.send(
      `CON Welcome to YamPay
1. Check Balance
2. Send Money
3. My Wallet Address
4. Buy Airtime
5. Pay for Goods
6. Language Settings`,
    );
    return;
  }

  const choice = inputs[0];

  // Step 1.1: Check Balance
  if (choice === '1' && level === 1) {
    const user = await prisma.user.findUnique({ where: { phoneNumber } });
    if (!user) {
      res.send(`END User not registered.`);
      return;
    }

    // fetch token balance here (simplified)
    const balance = await getUserBalance(user.hederaAccountId);
    res.send(`END Your balance is ${balance} USDC`);
    return;
  }

  // Step 1.2: Send Money – Ask for recipient
  if (choice === '2' && level === 1) {
    res.send(`CON Enter recipient's phone number:`);
    return;
  }

  // Step 1.3: Send Money – Ask for amount
  if (choice === '2' && level === 2) {
    res.send(`CON Enter amount to send:`);
    return;
  }

  // Step 1.4: Ask for PIN
  if (choice === '2' && level === 3) {
    res.send(`CON Enter your 4-digit PIN:`);
    return;
  }

  // Step 1.5: Perform Send
  if (choice === '2' && level === 4) {
    const recipientPhone = inputs[1];
    const amount = inputs[2];
    const pin = inputs[3];

    const sender = await prisma.user.findUnique({ where: { phoneNumber } });
    const receiver = await prisma.user.findUnique({
      where: { phoneNumber: recipientPhone },
    });

    if (!sender) {
      res.send(`END Your number is not registered.`);
      return;
    }

    if (!receiver) {
      res.send(`END Recipient is not registered.`);
      return;
    }

    const pinMatch = await bcrypt.compare(pin, sender.pinHash);
    if (!pinMatch) {
      res.send(`END Wrong PIN.`);
      return;
    }

    // Here: Call your send function (reuse controller logic or abstract it)
    //const success = await sendTokens(sender, receiver, amount); // implement this
    /* if (!success) {
      res.send(`END Transfer failed.`);
      return;
    }

    res.send(`END Sent ${amount} USDC to ${recipientPhone}`);*/

    await prisma.transferRequest.create({
      data: {
        senderId: sender.id,
        recipientId: receiver.id,
        amountMicro: toMicroUnits(amount), // Human to micro
        status: 'PENDING',
      },
    });
    res.send(`END Transfer in progress. You'll receive SMS shortly.`);
    return;
  }

  // Step 1.6: Wallet Address
  if (choice === '3') {
    const user = await prisma.user.findUnique({ where: { phoneNumber } });
    if (!user) {
      res.send(`END User not found.`);
      return;
    }
    res.send(`END Your wallet address is:\n${user.hederaAccountId}`);
    return;
  }

  // Step 4.1: Buy Airtime – Ask for PIN
  if (choice === '4' && level === 1) {
    res.send(`CON Enter your 4-digit PIN:`);
    return;
  }

  // Step 4.2: Ask if it's for own number or another
  if (choice === '4' && level === 2) {
    const pin = inputs[1];
    const user = await prisma.user.findUnique({ where: { phoneNumber } });

    const pinMatch = await bcrypt.compare(pin, user?.pinHash || '');
    if (!pinMatch) {
      res.send(`END Wrong PIN.`);
      return;
    }

    res.send(`CON Buy for:
1. My number
2. Other number`);
    return;
  }

  // Step 4.3: Ask for recipient number if Other
  if (choice === '4' && level === 3 && inputs[2] === '2') {
    res.send(`CON Enter recipient's phone number:`);
    return;
  }

  // Step 4.4: Ask for amount
  if (
    choice === '4' &&
    ((level === 3 && inputs[2] === '1') || // My number
      level === 4) // Other number
  ) {
    res.send(`CON Enter amount of airtime in TZS:`);
    return;
  }

  // Step 4.5: Final step – process airtime
  if (
    choice === '4' &&
    ((inputs[2] === '1' && level === 4) || // My number
      (inputs[2] === '2' && level === 5)) // Other number
  ) {
    const amount = inputs[inputs.length - 1];
    const recipient = inputs[2] === '1' ? phoneNumber : inputs[3]; // If 'My number', use session phoneNumber

    // Call Africa's Talking Airtime API here
    const result = await sendAirtime({ phoneNumber: recipient, amount });

    if (result.success) {
      res.send(`END ✅ Airtime of TZS ${amount} sent to ${recipient}`);
    } else {
      res.send(`END ❌ Failed to send airtime. Try again later.`);
    }
    return;
  }

  // Step 4.1: Buy Airtime – Ask for PIN
  if (choice === '5' && level === 1) {
    res.send(`Enter Merchant ID (6 digits):`);
    return;
  }

  if (choice === '5' && level === 2) {
    const merchantId = inputs[1];

    if (!/^\d{6}$/.test(merchantId)) {
      res.send(`END ❌ Invalid Merchant ID. Must be 6 digits.`);
      return;
    }

    // Simulate merchant lookup (we don't have merchant system yet)
    const merchantExists = false;

    if (!merchantExists) {
      res.send(`END ❌ Merchant not found. Please try again later.`);
      return;
    }

    // If valid merchant: ask for amount
    res.send(`CON Enter amount to pay:`);
    return;
  }

  if (choice === '6' && level === 1) {
    res.send(`CON Choose Language:
1. English
2. Kiswahili`);
    return;
  }

  // Fallback
  res.send(`END Invalid input. Try again.`);
});
