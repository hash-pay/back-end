import expressAsyncHandler from 'express-async-handler';
import prisma from '../prisma-client';
import { randomUUID } from 'crypto';
import { getMcpTools } from '../lib/inspectMcpTools';
import { Prisma } from '@prisma/client';

// POST /servers
export const createServer1 = expressAsyncHandler(async (req, res) => {
  const {
    clerkUserId,
    mcpOrigin,
    receiverAddress,
    requireAuth,
    name,
    description,
    metadata,
  } = req.body;

  if (!clerkUserId) {
    res.status(400).json({ message: 'Missing clerkUserId' });
  }

  // 1. Find the internal user via Account
  const account = await prisma.account.findUnique({
    where: { accountId: clerkUserId },
    include: { user: true },
  });

  if (!account || !account.user) {
    res.status(404).json({ message: 'User not found' });
  }

  const userId = account.user.id;
  const serverId = randomUUID();

  // 2. Check if serverId or mcpOrigin already exists
  const existingServer = await prisma.mcpServer.findFirst({
    where: {
      OR: [{ serverId }, { mcpOrigin }],
    },
  });

  if (existingServer) {
    res
      .status(409)
      .json({ message: 'Server with this ID or origin already exists' });
    return;
  }

  // 3. Create the new server
  const newServer = await prisma.mcpServer.create({
    data: {
      serverId,
      mcpOrigin,
      receiverAddress,
      requireAuth: requireAuth ?? false,
      name,
      description,
      metadata,
      creatorId: userId,
    },
  });

  // 4. Optionally, add server ownership for creator
  await prisma.serverOwnership.create({
    data: {
      serverId: newServer.id,
      userId,
      role: 'owner',
      grantedBy: null, // creator is granting ownership to self
    },
  });

  res.status(201).json(newServer);
});

// Define the expected input shape
export interface CreateServerInput {
  clerkUserId: string;
  mcpOrigin: string;
  receiverAddress: string;
  requireAuth?: boolean;
  name?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  tools?: {
    name: string;
    pricing?: unknown[]; // could further type PricingEntry if available
  }[];
}

// POST /servers
export const createServer = expressAsyncHandler(async (req, res) => {
  const {
    clerkUserId,
    mcpOrigin,
    receiverAddress,
    requireAuth,
    name,
    description,
    metadata,
    tools: userToolsInput, // optional pricing info from client
  } = req.body;

  if (!clerkUserId) {
    res.status(400).json({ message: 'Missing clerkUserId' });
    return;
  }

  // 1️⃣ Find the internal user via Account
  const account = await prisma.account.findUnique({
    where: { accountId: clerkUserId },
    include: { user: true },
  });

  if (!account || !account.user) {
    res.status(404).json({ message: 'User not found' });
    return;
  }

  const userId = account.user.id;
  const serverId = randomUUID();

  // 2️⃣ Idempotency check: Does this server already exist?
  const existingServer = await prisma.mcpServer.findFirst({
    where: { mcpOrigin },
    include: { tools: true },
  });
  if (existingServer) {
    res.status(200).json(existingServer); // return existing server
    return;
  }

  // 3️⃣ Fetch tools from MCP origin
  const toolList = await getMcpTools(mcpOrigin);
  if (!toolList || toolList.length === 0) {
    console.warn('No tools fetched from MCP origin:', mcpOrigin);
    res.status(400).json({ message: 'Failed to fetch tools from MCP origin' });
    return;
  }

  // 4️⃣ Create server and tools within a transaction
  const newServer = await prisma.$transaction(async (tx) => {
    // Create the server
    const server = await tx.mcpServer.create({
      data: {
        serverId,
        mcpOrigin,
        receiverAddress,
        requireAuth: requireAuth ?? false,
        name,
        description,
        metadata,
        creatorId: userId,
      },
    });

    // Create server ownership for creator
    await tx.serverOwnership.create({
      data: {
        serverId: server.id,
        userId,
        role: 'owner',
        grantedBy: null,
      },
    });

    // Create tools
    for (const tool of toolList) {
      const userToolInput = userToolsInput?.find(
        (t: any) => t.name === tool.name,
      );
      await tx.mcpTool.create({
        data: {
          serverId: server.id,
          userId, // optional: associate with creator
          name: tool.name,
          description: tool.description,
          //inputSchema: tool.inputSchema || {},
          inputSchema: tool.inputSchema
            ? (tool.inputSchema as Prisma.InputJsonValue)
            : {},
          outputSchema: {}, // MCP tools may not have outputSchema yet
          pricing: userToolInput?.pricing ? tool.pricing : undefined,
        },
      });
    }

    return server;
  });

  res.status(201).json(newServer);
});
