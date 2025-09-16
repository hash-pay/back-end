import express from 'express';
import { verfyHandler } from '../controller/hedera-facilitator/verify';

const router = express.Router();

router.route('/').post(verfyHandler);

export default router;
