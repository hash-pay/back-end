import express from 'express';
import { settlePayment } from '../controller/hedera-facilitator/settle';

const router = express.Router();

router.route('/').post(settlePayment);
export default router;
