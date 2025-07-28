import express, { Express, Request, Response } from 'express';
import dotenv from 'dotenv';
import userRoutes from './routes/user-routes';
import ussdRoutes from './routes/ussd-routes';
import cors from 'cors';
import cron from 'node-cron';
import { processPendingUsers } from './lib/utils/register-pedning-users';
import { processPendingTransfers } from './lib/utils/proccessPendingTransfer';
dotenv.config();

const app: Express = express();
const port = process.env.PORT || 5000;
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// ✅ Enable CORS for all routes
//app.use(cors());

app.use(
  cors({
    origin: [
      'http://localhost:3001',
      'https://app.mygoat.fun',
      'http://localhost:3000',
      'https://goat-app-dashboard.vercel.app',
    ],
    //credentials: true, // 👈 this part
  }),
);

app.get('/', (req: Request, res: Response) => {
  res.status(200).send('GOAT');
});

app.use('/api/v1/users', userRoutes);
app.use('/api/v1/ussd', ussdRoutes);

// Schedule the cron job to run every 15 minutes
cron.schedule('* * * * *', async () => {
  console.log(
    '[CRON] Running wallet registration job at',
    new Date().toISOString(),
  );
  await processPendingUsers();
  await processPendingTransfers();
});

app.listen(port, () => {
  console.log(`[server]: Server is running at http://localhost:${port}`);
});
