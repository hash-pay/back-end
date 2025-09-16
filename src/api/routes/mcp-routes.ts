import express from 'express';
import { registerUsers } from '../controller/users';
import { proxyMcpRequest } from '../controller/proxy-mcp';

const router = express.Router();

router.route('/:id').all(proxyMcpRequest);

export default router;
