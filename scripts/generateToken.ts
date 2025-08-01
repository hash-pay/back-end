const {
  Client,
  PrivateKey,
  AccountCreateTransaction,
  Hbar,
  TokenCreateTransaction,
  TokenType,
  TokenSupplyType,
} = require('@hashgraph/sdk');

// Initialize your operator account and client
const operatorId = '0.0.5143930';
const operatorKey = PrivateKey.fromStringED25519(
  'fd19f3a187e4b09ff94e5ffef8df2e241981a34b90e79ce31b9eba19fc14f9f3',
);
const client = Client.forTestnet().setOperator(operatorId, operatorKey);

// Generate treasury and supply keys
const treasuryKey = PrivateKey.generateECDSA();
const supplyKey = PrivateKey.generateECDSA();

const generateToken = async () => {
  // Create the treasury account
  const treasuryAccountTx = await new AccountCreateTransaction()
    .setKey(treasuryKey.publicKey)
    .setInitialBalance(new Hbar(1))
    .execute(client);

  const treasuryAccountRx = await treasuryAccountTx.getReceipt(client);
  const treasuryId = treasuryAccountRx.accountId;

  // Create the fungible token
  const tokenCreateTx = await new TokenCreateTransaction()
    .setTokenName('USD Bar')
    .setTokenSymbol('USDB')
    .setTokenType(TokenType.FungibleCommon)
    .setDecimals(2)
    .setInitialSupply(10000)
    .setTreasuryAccountId(treasuryId)
    .setSupplyType(TokenSupplyType.Infinite)
    .setSupplyKey(supplyKey)
    .freezeWith(client);

  // Sign with the treasury key
  const tokenCreateSign = await tokenCreateTx.sign(treasuryKey);

  // Submit the transaction
  const tokenCreateSubmit = await tokenCreateSign.execute(client);

  // Get the transaction receipt and token ID
  const tokenCreateRx = await tokenCreateSubmit.getReceipt(client);
  const tokenId = tokenCreateRx.tokenId;

  console.log(`Created token with ID: ${tokenId}`);
};

generateToken();
