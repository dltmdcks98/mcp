const SECRET_FIELD_RE = /(password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|credential)/i;

export function quoteIdentifier(value) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('Identifier must be a non-empty string');
  }
  return `"${value.replaceAll('"', '""')}"`;
}

export function quoteLiteral(value) {
  if (value === null || value === undefined) {
    return 'NULL';
  }
  return `'${String(value).replaceAll("'", "''")}'`;
}

function requireName(name, label) {
  if (typeof name !== 'string' || !name.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return name.trim();
}

export function buildCreateDatabaseSql({ name, owner, template, encoding } = {}) {
  const parts = ['CREATE DATABASE', quoteIdentifier(requireName(name, 'Database name'))];
  if (owner) {
    parts.push('OWNER', quoteIdentifier(requireName(owner, 'Owner')));
  }
  if (template) {
    parts.push('TEMPLATE', quoteIdentifier(requireName(template, 'Template')));
  }
  if (encoding) {
    parts.push('ENCODING', quoteLiteral(encoding));
  }
  return parts.join(' ');
}

export function buildCreateRoleSql({ username, password, login = true, superuser = false, createdb = false, createrole = false } = {}) {
  const parts = ['CREATE ROLE', quoteIdentifier(requireName(username, 'Username')), 'WITH'];
  parts.push(login ? 'LOGIN' : 'NOLOGIN');
  if (password !== undefined && password !== null && password !== '') {
    parts.push('PASSWORD', quoteLiteral(password));
  }
  parts.push(superuser ? 'SUPERUSER' : 'NOSUPERUSER');
  parts.push(createdb ? 'CREATEDB' : 'NOCREATEDB');
  parts.push(createrole ? 'CREATEROLE' : 'NOCREATEROLE');
  return parts.join(' ');
}

export function normalizeRows(rows) {
  return rows.map((row) => {
    const normalized = {};
    for (const [key, value] of Object.entries(row)) {
      normalized[key] = SECRET_FIELD_RE.test(key) ? '[REDACTED]' : value;
    }
    return normalized;
  });
}

export function rowsToJsonText(rows, extra = {}) {
  return JSON.stringify({ ...extra, rows: normalizeRows(rows), rowCount: rows.length }, null, 2);
}
