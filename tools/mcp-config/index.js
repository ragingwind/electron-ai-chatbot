import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import fs from 'node:fs/promises';
import path from 'node:path';
import * as dotenv from 'dotenv';
import { read } from 'node:fs';

dotenv.config();

console.error(
  'Starting MCP Server Config Management',
  process.env.MCP_CONFIG_FILEPATH,
  process.env.MCP_CONFIG_SERVERS_ROOT,
);

// @FIXME: might be move to argument or default
const MCP_CONFIG_FILEPATH =
  process.env.MCP_CONFIG_FILEPATH ?? 'mcp-servers.json';
const MCP_CONFIG_SERVERS_ROOT =
  process.env.MCP_CONFIG_SERVERS_ROOT ?? 'mcpServers';

// pause a execution to streamed invocation state with 'call'
async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const server = new McpServer({
  name: 'MCP Config Management',
  version: '1.0.0',
});

function makeResourceContent({ uri, name, data }) {
  return {
    type: 'resource', // @FIXME, resource type is not supported yet
    resource: {
      uri: uri,
      mimeType: 'application/json',
      name: name,
      text: data,
    },
  };
}

// [x] mcp-server-connect all or [names]
// [x] mcp-server-disconnect all or [names]
// [x] mcp-server-add, remove, update
// [o] mcp-server-list
// [x] mcp-server-health
// [x] mcp-server-status
// [x] mcp-server-logs

server.tool(
  'mcp-server-list',
  'List available MCP servers and their descriptions',
  {
    mcpServerConfigPath: z.string().optional(),
    defaultServersRoot: z.string().optional(),
  },
  async ({ mcpServerConfigPath, defaultServersRoot }) => {
    const content = [];

    try {
      const filePath = path.resolve(
        process.cwd(),
        mcpServerConfigPath ?? MCP_CONFIG_FILEPATH,
      );

      const config = await readMCPServerConfig(
        filePath,
        defaultServersRoot ?? MCP_CONFIG_SERVERS_ROOT,
      );

      console.error('MCP Server config file:', filePath, config);

      const a = makeResourceContent({
        uri: `file://${filePath}`,
        name: 'MCP Servers',
        data: JSON.stringify(config),
      });

      console.log('MCP Server config:', a);

      content.push(
        makeResourceContent({
          uri: `file://${filePath}`,
          name: 'MCP Servers',
          data: JSON.stringify(config),
        }),
      );
    } catch (error) {
      console.error('Error reading MCP server config file:', error);
      content.push({
        type: 'text',
        text: 'Error: Invalid formula',
      });
    }

    console.error('MCP Server content:', content);

    return {
      content,
    };
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function readMCPServerConfig(mcpServerConfigPath, defaultServersRoot) {
  const json = JSON.parse(await fs.readFile(mcpServerConfigPath, 'utf-8'));

  console.error(
    'MCP Server config file:',
    mcpServerConfigPath,
    defaultServersRoot,
  );

  console.error('Parsed MCP Server config:', json);

  const config = defaultServersRoot ? json[defaultServersRoot] : json;

  if (!config) {
    throw new Error(
      `Not found ${defaultServersRoot} property in MCP server config`,
    );
  }

  return config;
}
