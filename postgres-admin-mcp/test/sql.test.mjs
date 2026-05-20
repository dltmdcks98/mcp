import test from 'node:test';
import assert from 'node:assert/strict';
import {
  quoteIdentifier,
  quoteLiteral,
  buildCreateDatabaseSql,
  buildCreateRoleSql,
  normalizeRows,
} from '../lib/sql.js';

test('quoteIdentifier safely quotes identifiers with embedded quotes', () => {
  assert.equal(quoteIdentifier('app"db'), '"app""db"');
});

test('quoteIdentifier rejects empty identifiers', () => {
  assert.throws(() => quoteIdentifier(''), /Identifier must be a non-empty string/);
});

test('quoteLiteral safely quotes password literals', () => {
  assert.equal(quoteLiteral("pa'ss"), "'pa''ss'");
});

test('buildCreateDatabaseSql supports owner and template options', () => {
  assert.equal(
    buildCreateDatabaseSql({ name: 'app_db', owner: 'app_user', template: 'template0', encoding: 'UTF8' }),
    'CREATE DATABASE "app_db" OWNER "app_user" TEMPLATE "template0" ENCODING \'UTF8\''
  );
});

test('buildCreateRoleSql creates login role with password and membership flags', () => {
  assert.equal(
    buildCreateRoleSql({ username: 'app_user', password: "pa'ss", login: true, createdb: true, createrole: false }),
    'CREATE ROLE "app_user" WITH LOGIN PASSWORD \'pa\'\'ss\' NOSUPERUSER CREATEDB NOCREATEROLE'
  );
});

test('normalizeRows redacts password-like fields', () => {
  const rows = normalizeRows([{ username: 'postgres', password: 'secret', api_token: 'abc', count: 1 }]);
  assert.deepEqual(rows, [{ username: 'postgres', password: '[REDACTED]', api_token: '[REDACTED]', count: 1 }]);
});
