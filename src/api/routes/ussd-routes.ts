import express from 'express';
import { handleUssdRequest } from '../controller/ussd';

const router = express.Router();

router.route('/').post(handleUssdRequest);

export default router;
