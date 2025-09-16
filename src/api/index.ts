import express, { Express, Request, Response } from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import bodyParser from 'body-parser';
import cron from 'node-cron';
import verfyRoute from './routes/verify-routes';
import settleRoutes from './routes/settle-routes';
import { paymentMiddleware, Network } from 'x402-express';
import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { wrapFetchWithPayment, decodeXPaymentResponse } from 'x402-fetch';
import { baseSepolia } from 'viem/chains';
const pk = 'e10a7186d46f8e50f0305b2be365f755a4a4a8ab325091a3ba49d02b42a7f622';
// Create a wallet client (using your private key)
const account = privateKeyToAccount(`0x${pk}`); // we recommend using an environment variable for this
dotenv.config();

const app: Express = express();
const port = process.env.PORT || 4000;
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// ✅ Enable CORS for all routes
//app.use(cors());

/*app.use(
  cors({
    origin: [
      '*',
      'http://localhost:3001',
      'https://app.mygoat.fun',
      'http://localhost:3000',
      'https://goat-app-dashboard.vercel.app',
    ],
    //credentials: true, // 👈 this part
  }),
);*/

app.use(
  paymentMiddleware(
    '0x2237A1E5Ed40758752a7Da5F118057af9efA0607', // your receiving wallet address
    {
      // Route configurations for protected endpoints
      'GET /weather': {
        // USDC amount in dollars
        price: '$0.001',
        network: 'base-sepolia',
      },
    },
    {
      url: 'https://x402.org/facilitator', // Facilitator URL for Base Sepolia testnet.
    },
  ),
);

// Implement your route
app.get('/weather', (req, res) => {
  res.send({
    report: {
      weather: 'sunny',
      temperature: 70,
    },
  });
});

// wallet creation logic...

const fetchWithPayment = wrapFetchWithPayment(fetch, account);

app.get('/test-get-weather', async (req, res) => {
  fetchWithPayment('http://localhost:4000/weather', {
    //url should be something like https://api.example.com/paid-endpoint
    method: 'GET',
  })
    .then(async (response) => {
      const body = await response.json();
      console.log(body);

      const paymentResponse = decodeXPaymentResponse(
        response.headers.get('x-payment-response')!,
      );
      console.log(paymentResponse);
      res.send({
        paymentResponse,
      });
    })
    .catch((error) => {
      console.error('something went wrong ', error.response?.data?.error);
      res.send(error);
    });
  //const response = await axios.get("http://localhost:3000/weather");
});

app.get('/', (req: Request, res: Response) => {
  res.status(200).send('GOAT');
});

app.use('/verify', verfyRoute);
app.use('/settle', settleRoutes);

// Schedule the cron job to run every 15 minutes
/*cron.schedule('* * * * *', async () => {
  console.log(
    '[CRON] Running wallet registration job at',
    new Date().toISOString(),
  );
  await processPendingUsers();
  await processPendingTransfers();
});*/

app.listen(port, () => {
  console.log(`[server]: Server is running at http://localhost:${port}`);
});
