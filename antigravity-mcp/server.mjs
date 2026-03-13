import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

const MCP_VERSION = '0.2.0';
const GEMINI_CMD = process.env.GEMINI_CLI_BIN || 'gemini';
const GEMINI_DEFAULT_MODEL = process.env.GEMINI_DEFAULT_MODEL || 'auto';
const ANTIGRAVITY_DEFAULT_MODEL = process.env.ANTIGRAVITY_DEFAULT_MODEL || 'auto';

function runGeminiCli(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(GEMINI_CMD, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let out = '';
    let err = '';

    proc.stdout.on('data', (chunk) => {
      out += chunk.toString();
    });

    proc.stderr.on('data', (chunk) => {
      err += chunk.toString();
    });

    proc.on('error', (error) => {
      reject(new Error(`Failed to execute Gemini CLI (${GEMINI_CMD}): ${error.message}`));
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(out);
      } else {
        reject(new Error(`Gemini CLI exited with code ${code}: ${err || out}`.trim()));
      }
    });
  });
}

function createVariantServer({ name, defaultModel }) {
  const server = new McpServer({ name, version: MCP_VERSION }, { capabilities: { tools: {} } });

  server.registerTool(
    'gemini.generate',
    {
      description: `Call Gemini CLI via ${name} with prompt/model/output_format`,
      inputSchema: {
        prompt: z.string(),
        model: z.string().optional(),
        output_format: z.enum(['text', 'json']).optional(),
      },
    },
    async ({ prompt, model, output_format: outputFormat }) => {
      const targetModel = model || defaultModel;
      const format = outputFormat || 'text';
      const cliArgs = ['--model', targetModel, '-y'];

      if (format === 'json') {
        cliArgs.push('--output-format', 'json');
      }

      cliArgs.push('--prompt', prompt);

      try {
        const stdout = await runGeminiCli(cliArgs);

        if (format === 'json') {
          try {
            const parsed = JSON.parse(stdout);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(parsed),
                },
              ],
            };
          } catch {
            return {
              isError: true,
              content: [{ type: 'text', text: `Failed to parse Gemini JSON output. Raw output:\n${stdout}` }],
            };
          }
        }

        return { content: [{ type: 'text', text: stdout.trim() }] };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Gemini CLI call failed: ${error.message}` }],
        };
      }
    }
  );

  return server;
}

function mountMcpRoute(app, routePath, variantOptions) {
  const sessions = Object.create(null);

  app.post(routePath, async (req, res) => {
    try {
      const sessionId = req.headers['mcp-session-id'];
      let transport;

      if (typeof sessionId === 'string' && sessions[sessionId]) {
        transport = sessions[sessionId].transport;
      } else if (!sessionId && isInitializeRequest(req.body)) {
        const server = createVariantServer(variantOptions);
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (newSessionId) => {
            sessions[newSessionId] = { transport, server };
          },
        });

        transport.onclose = async () => {
          if (!transport.sessionId || !sessions[transport.sessionId]) return;
          const closingServer = sessions[transport.sessionId].server;
          delete sessions[transport.sessionId];
          await closingServer.close().catch(() => {});
        };

        await server.connect(transport);
      } else {
        res.status(400).json({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Bad Request: No valid session ID provided' },
          id: null,
        });
        return;
      }

      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error(`Error handling MCP request (${routePath}):`, error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
      }
    }
  });

  app.get(routePath, async (req, res) => {
    const sessionId = req.headers['mcp-session-id'];
    if (typeof sessionId !== 'string' || !sessions[sessionId]) {
      res.status(400).send('Missing or invalid MCP session ID');
      return;
    }

    await sessions[sessionId].transport.handleRequest(req, res);
  });

  app.delete(routePath, async (req, res) => {
    const sessionId = req.headers['mcp-session-id'];
    if (typeof sessionId !== 'string' || !sessions[sessionId]) {
      res.status(400).send('Missing or invalid MCP session ID');
      return;
    }

    await sessions[sessionId].transport.handleRequest(req, res);
  });
}

async function start() {
  const port = Number(process.env.PORT || 8765);
  const host = process.env.HOST || '127.0.0.1';
  const app = createMcpExpressApp({ host });

  mountMcpRoute(app, '/mcp/gemini', {
    name: 'gemini-mcp',
    defaultModel: GEMINI_DEFAULT_MODEL,
  });

  mountMcpRoute(app, '/mcp/antigravity', {
    name: 'antigravity-mcp',
    defaultModel: ANTIGRAVITY_DEFAULT_MODEL,
  });

  app.get('/healthz', (_req, res) => {
    res.json({
      ok: true,
      name: 'multi-gemini-mcp',
      version: MCP_VERSION,
      geminiBin: GEMINI_CMD,
      routes: {
        gemini: '/mcp/gemini',
        antigravity: '/mcp/antigravity',
      },
      defaultModels: {
        gemini: GEMINI_DEFAULT_MODEL,
        antigravity: ANTIGRAVITY_DEFAULT_MODEL,
      },
    });
  });

  app.listen(port, host, () => {
    console.log(`multi-gemini-mcp listening on http://${host}:${port}`);
    console.log(`- gemini route: http://${host}:${port}/mcp/gemini`);
    console.log(`- antigravity route: http://${host}:${port}/mcp/antigravity`);
  });
}

start().catch((error) => {
  console.error('Failed to start multi-gemini-mcp server:', error);
  process.exit(1);
});
