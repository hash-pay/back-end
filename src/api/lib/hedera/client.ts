import {
  PrivateKey,
  AccountCreateTransaction,
  Hbar,
  Client,
  AccountId,
} from '@hashgraph/sdk';

const operatorId = process.env.HEDERA_OPERATOR_ID;
const operatorKey = process.env.HEDERA_OPERATOR_KEY;

const OPERATOR_ID = AccountId.fromString(operatorId);
const OPERATOR_KEY = PrivateKey.fromStringECDSA(operatorKey);

export const hederaClient = Client.forTestnet().setOperator(
  OPERATOR_ID,
  OPERATOR_KEY,
);
