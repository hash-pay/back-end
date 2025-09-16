import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { experimental_createMCPClient as createMCPClient } from 'ai';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { PricingEntry } from '../../types/payments';

// Server metadata type definition
export interface MCPServerMetadata {
  name?: string;
  version?: string;
  description?: string;
  protocolVersion?: string;
  capabilities?: {
    experimental?: Record<string, unknown>;
    logging?: Record<string, unknown>;
    prompts?: {
      listChanged?: boolean;
    };
    resources?: {
      subscribe?: boolean;
      listChanged?: boolean;
    };
    tools?: {
      listChanged?: boolean;
    };
  };
  metadata?: Record<string, unknown>;
  vendor?: {
    name?: string;
    version?: string;
  };
}

// Tool with payment information
export interface MCPToolWithPayments {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  annotations?: Record<string, unknown>;
  pricing?: PricingEntry[];
}

// Comprehensive server information
export interface MCPServerInfo {
  metadata: MCPServerMetadata;
  tools: MCPToolWithPayments[];
  toolCount: number;
  hasPayments: boolean;
  prompts?: Record<string, unknown>;
}

// Payment annotation type definitions
interface SimplePaymentOption {
  type?: 'simple';
  price: number;
  currency?: string;
  network?: string;
  recipient?: string;
}

interface AdvancedPaymentOption {
  type?: 'advanced';
  rawAmount: string | number;
  tokenDecimals?: number;
  tokenSymbol?: string;
  currency?: string;
  network?: string;
  recipient?: string;
  description?: string;
}

export async function getMcpTools(url: string) {
  try {
    //const transport = new StreamableHTTPClientTransport(new URL(url))
    const transport = new StreamableHTTPClientTransport(new URL(url));
    const client = new Client({ name: 'mcpay-inspect', version: '1.0.0' });

    await client.connect(transport);
    /*const client = await createMCPClient({
      transport,
    })*/

    const tools = await client.listTools();

    if (!tools) {
      throw new Error('No tools found');
    }

    // const toolsNames = Object.keys(tools)

    /* return toolsNames.map((toolName) => ({
      name: toolName,
      description: tools[toolName]?.description,
      inputSchema: tools[toolName]?.inputSchema,
    }))*/
    return tools.tools.map((tool) => {
      // Extract payment information from annotations
      //const pricingInfo = extractPaymentFromAnnotations(tool.annotations, userWalletAddress)

      return {
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: tool.annotations,
        // pricing: pricingInfo
      };
    });
  } catch (error) {
    console.warn(
      'Warning: MCP tools unavailable (returning empty set):',
      error,
    );
    return [];
  }
}
