import pg from 'pg';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  buildCreateDatabaseSql,
  buildCreateRoleSql,
  quoteIdentifier,
  rowsToJsonText,
} from './lib/sql.js';

const { Pool } = pg;
const MCP_NAME = 'postgres-admin-mcp';
const MCP_VERSION = '0.1.0';
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;

function databaseConfig() {
  const connectionString = process.env.DATABASE_URI || process.env.POSTGRES_URL || process.env.POSTGRES_CONNECTION_STRING;
  if (connectionString) {
    return { connectionString };
  }
  return {
    host: process.env.PGHOST || '127.0.0.1',
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE || 'postgres',
    ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : undefined,
  };
}

const pool = new Pool({
  ...databaseConfig(),
  max: Number(process.env.PGPOOL_MAX || 4),
  idleTimeoutMillis: Number(process.env.PGPOOL_IDLE_TIMEOUT_MS || 30_000),
  connectionTimeoutMillis: Number(process.env.PGCONNECT_TIMEOUT_MS || 10_000),
  application_name: process.env.PGAPPNAME || MCP_NAME,
});

function resultText(result, extra = {}) {
  return rowsToJsonText(result.rows || [], { rowCount: result.rowCount, ...extra });
}

async function query(sql, params = []) {
  const client = await pool.connect();
  try {
    return await client.query(sql, params);
  } finally {
    client.release();
  }
}

function textResponse(text) {
  return { content: [{ type: 'text', text }] };
}

function errorResponse(error) {
  return { isError: true, content: [{ type: 'text', text: error.message || String(error) }] };
}

function registerTool(server, name, config, handler) {
  server.registerTool(name, config, async (args) => {
    try {
      return await handler(args || {});
    } catch (error) {
      return errorResponse(error);
    }
  });
}

function createServer() {
  const server = new McpServer(
    { name: MCP_NAME, version: MCP_VERSION },
    { capabilities: { tools: {} } },
  );

  registerTool(
    server,
    'health',
    {
      description: 'Check PostgreSQL connectivity and show current database/user/server address.',
      inputSchema: {},
    },
    async () => {
      const result = await query('SELECT current_database() AS database, current_user AS user, inet_server_addr()::text AS server_addr, inet_server_port() AS server_port, version() AS version');
      return textResponse(resultText(result));
    },
  );

  registerTool(
    server,
    'execute_sql',
    {
      description: 'Execute arbitrary PostgreSQL SQL. Use for SELECT/DDL/DML after confirming the target database. Parameters are passed as $1, $2, ...',
      inputSchema: {
        sql: z.string().min(1),
        params: z.array(z.any()).optional(),
      },
    },
    async ({ sql, params = [] }) => {
      const result = await query(sql, params);
      return textResponse(resultText(result));
    },
  );

  registerTool(
    server,
    'list_databases',
    {
      description: 'List non-template PostgreSQL databases.',
      inputSchema: {},
    },
    async () => {
      const result = await query("SELECT datname AS name, pg_catalog.pg_get_userbyid(datdba) AS owner, pg_size_pretty(pg_database_size(datname)) AS size FROM pg_database WHERE datistemplate = false ORDER BY datname");
      return textResponse(resultText(result));
    },
  );

  registerTool(
    server,
    'list_roles',
    {
      description: 'List PostgreSQL roles and key privileges. Password hashes are not returned.',
      inputSchema: {},
    },
    async () => {
      const result = await query('SELECT rolname AS name, rolcanlogin AS can_login, rolsuper AS superuser, rolcreatedb AS create_db, rolcreaterole AS create_role, rolreplication AS replication FROM pg_roles ORDER BY rolname');
      return textResponse(resultText(result));
    },
  );

  registerTool(
    server,
    'list_schemas',
    {
      description: 'List schemas in the current database.',
      inputSchema: {},
    },
    async () => {
      const result = await query("SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT IN ('pg_catalog', 'information_schema') ORDER BY schema_name");
      return textResponse(resultText(result));
    },
  );

  registerTool(
    server,
    'list_tables',
    {
      description: 'List tables/views in the current database.',
      inputSchema: {
        schema: z.string().optional(),
        limit: z.number().int().min(1).max(MAX_LIMIT).optional(),
      },
    },
    async ({ schema, limit = DEFAULT_LIMIT }) => {
      const params = [];
      let where = "table_schema NOT IN ('pg_catalog', 'information_schema')";
      if (schema) {
        params.push(schema);
        where += ` AND table_schema = $${params.length}`;
      }
      params.push(limit);
      const result = await query(`SELECT table_schema, table_name, table_type FROM information_schema.tables WHERE ${where} ORDER BY table_schema, table_name LIMIT $${params.length}`, params);
      return textResponse(resultText(result));
    },
  );

  registerTool(
    server,
    'select_rows',
    {
      description: 'Read rows from a schema-qualified table with optional WHERE and ORDER BY clauses.',
      inputSchema: {
        table: z.string().min(1),
        schema: z.string().optional(),
        columns: z.array(z.string()).optional(),
        where: z.string().optional(),
        order_by: z.string().optional(),
        params: z.array(z.any()).optional(),
        limit: z.number().int().min(1).max(MAX_LIMIT).optional(),
      },
    },
    async ({ table, schema = 'public', columns, where, order_by: orderBy, params = [], limit = DEFAULT_LIMIT }) => {
      const colSql = columns?.length ? columns.map(quoteIdentifier).join(', ') : '*';
      const qualified = `${quoteIdentifier(schema)}.${quoteIdentifier(table)}`;
      const sqlParts = [`SELECT ${colSql} FROM ${qualified}`];
      if (where) sqlParts.push(`WHERE ${where}`);
      if (orderBy) sqlParts.push(`ORDER BY ${orderBy}`);
      const allParams = [...params, limit];
      sqlParts.push(`LIMIT $${allParams.length}`);
      const result = await query(sqlParts.join(' '), allParams);
      return textResponse(resultText(result));
    },
  );

  registerTool(
    server,
    'create_database',
    {
      description: 'Create a PostgreSQL database. Requires CREATEDB/superuser privilege.',
      inputSchema: {
        name: z.string().min(1),
        owner: z.string().optional(),
        template: z.string().optional(),
        encoding: z.string().optional(),
      },
    },
    async (args) => {
      const sql = buildCreateDatabaseSql(args);
      const result = await query(sql);
      return textResponse(resultText(result, { sql }));
    },
  );

  registerTool(
    server,
    'create_user',
    {
      description: 'Create a PostgreSQL login role/user. Requires CREATEROLE/superuser privilege.',
      inputSchema: {
        username: z.string().min(1),
        password: z.string().optional(),
        login: z.boolean().optional(),
        superuser: z.boolean().optional(),
        createdb: z.boolean().optional(),
        createrole: z.boolean().optional(),
      },
    },
    async (args) => {
      const sql = buildCreateRoleSql(args);
      const result = await query(sql);
      return textResponse(resultText(result, { sql: sql.replace(/PASSWORD\s+'(?:''|[^'])*'/i, "PASSWORD '[REDACTED]'") }));
    },
  );

  return server;
}

async function start() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

start().catch((error) => {
  console.error(`${MCP_NAME} failed:`, error);
  process.exit(1);
});
