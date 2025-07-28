/*import africastalking from 'africastalking';

const at = africastalking({
  apiKey: process.env.AT_API_KEY,
  username: process.env.AT_USERNAME,
});

export const sendSMS = async (to: string, message: string) => {
  try {
    const result = await at.SMS.send({
      to: [to],
      message,
      from: process.env.AT_SENDER_ID, // Optional: or short code
    });
    console.log('SMS sent:', result);
    return true;
  } catch (err) {
    console.error('Failed to send SMS:', err);
    return false;
  }
};*/

export const sendSMS = async (to: string, message: string) => {
  console.log(`message ${message} sent to ${to}`);
};
