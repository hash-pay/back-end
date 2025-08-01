import africastalking from 'africastalking';

const at = africastalking({
  apiKey:
    'atsk_51728a1d155335ac9f16bb51577a69c1400b727251a7212940fe9f9f47c2c7c7f0738a7f', //process.env.AT_API_KEY!,
  username: 'sandbox', //process.env.AT_USERNAME!,
});

export const sendAirtime = async ({
  phoneNumber,
  amount,
}: {
  phoneNumber: string;
  amount: string | number;
}) => {
  console.log(
    `this is info from real app, phoneNumber : ${phoneNumber}, and amount : ${amount}`,
  );
  try {
    const number = `+${phoneNumber}`;
    const response = await at.AIRTIME.send({
      recipients: [
        {
          phoneNumber: number, //'+254711082001',
          amount: 1000, // or '1000'
          currencyCode: 'TZS',
        },
      ],
    });

    console.log('[Airtime Result]', response);
    return { success: true, data: response };
  } catch (err) {
    console.error('[Airtime Error]', err.message);
    return { success: false };
  }
};
