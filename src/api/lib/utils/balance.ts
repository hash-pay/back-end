import { AccountId, TokenId, AccountBalanceQuery } from '@hashgraph/sdk';
import { hederaClient } from '../hedera/client';

export const getUserBalance = async (accountIdStr) => {
  try {
    const accountId = AccountId.fromString(accountIdStr);
    const tokenId = TokenId.fromString(process.env.USDC_TOKEN_ID);

    const balance = await new AccountBalanceQuery()
      .setAccountId(accountId)
      .execute(hederaClient);

    const tokenBalance = balance.tokens._map.get(tokenId.toString());

    return tokenBalance ? tokenBalance.toString() : '0';
  } catch (err) {
    console.error('[getUserBalance error]', err.message);
    return '0';
  }
};
