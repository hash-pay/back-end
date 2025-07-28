import {
  TokenAssociateTransaction,
  AccountId,
  PrivateKey,
  TokenId,
} from '@hashgraph/sdk';
import { hederaClient } from '../hedera/client';

export const associateTokenWithAccount = async (accountIdStr, privateKey) => {
  const accountId = AccountId.fromString(accountIdStr);
  const tokenId = TokenId.fromString(process.env.USDC_TOKEN_ID);

  const tx = await new TokenAssociateTransaction()
    .setAccountId(accountId)
    .setTokenIds([tokenId])
    .freezeWith(hederaClient)
    .sign(privateKey);

  const response = await tx.execute(hederaClient);
  await response.getReceipt(hederaClient); // throws if failed
};
