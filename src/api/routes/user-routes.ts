import express from 'express';
import { associateToken, checkEnvs, registerUser } from '../controller/users';
import {
  getWalletAddress,
  getWalletBalance,
  sendUSDC,
} from '../controller/wallet';

const router = express.Router();

router.route('/register').post(registerUser);
router.route('/test').post(checkEnvs);
router.route('/:userId/associate').post(associateToken);
router.route('/:phoneNumber/address').get(getWalletAddress);
router.route('/:phoneNumber/balance').get(getWalletBalance);
router.route('/send').post(sendUSDC);

export default router;
