console.log(
  Buffer.from(
    JSON.stringify({
      payload: {
        authorization: {
          from: '0.0.12345',
          value: '1000000',
          validAfter: 1690000000,
          validBefore: 1699999999,
        },
        signature: 'dummy-signature',
      },
    }),
  ).toString('base64'),
);
