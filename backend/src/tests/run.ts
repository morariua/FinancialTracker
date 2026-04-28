/* eslint-disable no-console */
import http from 'http';
import { AddressInfo } from 'net';
import fs from 'fs';
import path from 'path';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-test-secret-aa';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-test-refresh-secret-test-bb';
process.env.DB_PATH = path.resolve(__dirname, '../../data/test.db');
process.env.CORS_ORIGIN = 'http://localhost:5173';

if (fs.existsSync(process.env.DB_PATH)) {
  fs.unlinkSync(process.env.DB_PATH);
}
const wal = process.env.DB_PATH + '-wal';
const shm = process.env.DB_PATH + '-shm';
if (fs.existsSync(wal)) fs.unlinkSync(wal);
if (fs.existsSync(shm)) fs.unlinkSync(shm);

import app from '../index';

interface Resp {
  status: number;
  body: any;
  headers: http.IncomingHttpHeaders;
}

function request(
  port: number,
  method: string,
  path: string,
  body?: unknown,
  token?: string
): Promise<Resp> {
  return new Promise((resolve, reject) => {
    const data = body ? Buffer.from(JSON.stringify(body)) : undefined;
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        method,
        path,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(data ? { 'Content-Length': data.length } : {}),
        },
      },
      (res) => {
        let chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let parsed: any = text;
          try {
            parsed = text ? JSON.parse(text) : null;
          } catch { /* keep text */ }
          resolve({ status: res.statusCode || 0, body: parsed, headers: res.headers });
        });
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(cond: boolean, label: string, extra?: unknown): void {
  if (cond) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    failures.push(label);
    console.log(`  ✗ ${label}`, extra ?? '');
  }
}

async function main(): Promise<void> {
  const server = http.createServer(app);
  await new Promise<void>((res) => server.listen(0, '127.0.0.1', res));
  const port = (server.address() as AddressInfo).port;

  console.log(`\nTest server on :${port}\n`);

  console.log('Auth flow');
  const reg = await request(port, 'POST', '/api/auth/register', {
    email: 'alice@example.com',
    password: 'StrongPassword1',
    name: 'Alice',
  });
  assert(reg.status === 200 && !!reg.body.access, 'register returns access token', reg.body);

  const dup = await request(port, 'POST', '/api/auth/register', {
    email: 'alice@example.com',
    password: 'StrongPassword1',
    name: 'Alice',
  });
  assert(dup.status === 409, 'duplicate register rejected', dup.body);

  const weak = await request(port, 'POST', '/api/auth/register', {
    email: 'bob@example.com',
    password: 'short',
    name: 'Bob',
  });
  assert(weak.status === 400, 'weak password rejected', weak.body);

  const login = await request(port, 'POST', '/api/auth/login', {
    email: 'alice@example.com',
    password: 'StrongPassword1',
  });
  assert(login.status === 200 && !!login.body.access, 'login returns access token', login.body);
  const token: string = login.body.access;
  const refresh: string = login.body.refresh;

  const wrong = await request(port, 'POST', '/api/auth/login', {
    email: 'alice@example.com',
    password: 'WrongPassword1',
  });
  assert(wrong.status === 401, 'wrong password rejected');

  const me = await request(port, 'GET', '/api/auth/me', undefined, token);
  assert(me.status === 200 && me.body.user.email === 'alice@example.com', '/me returns user');

  const rotated = await request(port, 'POST', '/api/auth/refresh', { refresh });
  assert(rotated.status === 200 && !!rotated.body.access, 'refresh rotation works');

  const rotatedToken = rotated.body.access;
  const reuseOld = await request(port, 'POST', '/api/auth/refresh', { refresh });
  assert(reuseOld.status === 401, 'old refresh token rejected after rotation');

  const noAuth = await request(port, 'GET', '/api/categories');
  assert(noAuth.status === 401, 'protected route requires auth');

  console.log('\nCategories');
  const cats = await request(port, 'GET', '/api/categories', undefined, rotatedToken);
  assert(cats.status === 200 && Array.isArray(cats.body) && cats.body.length >= 5, 'default categories seeded', cats.body?.length);
  const groceriesCat = cats.body.find((c: any) => c.name === 'Groceries');
  const housingCat = cats.body.find((c: any) => c.name === 'Housing');
  const incomeCat = cats.body.find((c: any) => c.name === 'Income');
  assert(!!groceriesCat && !!housingCat && !!incomeCat, 'expected categories present');

  console.log('\nAccounts & Transactions');
  const acct = await request(
    port,
    'POST',
    '/api/accounts',
    { name: 'Checking', type: 'checking', balance: 1000 },
    rotatedToken
  );
  assert(acct.status === 200 && !!acct.body.id, 'account created');

  const tx1 = await request(
    port,
    'POST',
    '/api/transactions',
    {
      account_id: acct.body.id,
      category_id: groceriesCat.id,
      amount: 150,
      description: 'Trader Joes',
      date: new Date().toISOString().slice(0, 10),
      type: 'expense',
    },
    rotatedToken
  );
  assert(tx1.status === 200, 'expense created');

  const tx2 = await request(
    port,
    'POST',
    '/api/transactions',
    {
      account_id: acct.body.id,
      category_id: incomeCat.id,
      amount: 3000,
      description: 'Paycheck',
      date: new Date().toISOString().slice(0, 10),
      type: 'income',
    },
    rotatedToken
  );
  assert(tx2.status === 200, 'income created');

  const acctAfter = await request(port, 'GET', '/api/accounts', undefined, rotatedToken);
  const balance = acctAfter.body[0].balance;
  assert(balance === 1000 - 150 + 3000, `balance updated correctly (got ${balance})`);

  console.log('\nBudgets & Allocation');
  const setIncome = await request(
    port,
    'PATCH',
    '/api/settings',
    { monthly_income: 5000 },
    rotatedToken
  );
  assert(setIncome.status === 200, 'monthly income set');

  const month = new Date().toISOString().slice(0, 7);
  const alloc = await request(
    port,
    'POST',
    '/api/budgets/auto-allocate',
    { month, strategy: '50-30-20' },
    rotatedToken
  );
  assert(alloc.status === 200 && Array.isArray(alloc.body.allocations), 'auto-allocate works', alloc.body);

  const budgets = await request(port, 'GET', `/api/budgets?month=${month}`, undefined, rotatedToken);
  assert(budgets.status === 200 && budgets.body.length > 0, 'budgets returned for month');
  const groceriesBudget = budgets.body.find((b: any) => b.category_name === 'Groceries');
  assert(
    !!groceriesBudget && groceriesBudget.spent === 150,
    `groceries spent rolled up (got ${groceriesBudget?.spent})`
  );

  // Update budget directly
  const upd = await request(
    port,
    'PUT',
    '/api/budgets',
    { category_id: groceriesCat.id, month, amount: 175, rollover: false },
    rotatedToken
  );
  assert(upd.status === 200, 'budget upsert returns ok');

  const budgets2 = await request(port, 'GET', `/api/budgets?month=${month}`, undefined, rotatedToken);
  const g2 = budgets2.body.find((b: any) => b.category_name === 'Groceries');
  assert(g2.amount === 175, 'budget amount updated');

  console.log('\nBills & Alerts');
  const bill = await request(
    port,
    'POST',
    '/api/bills',
    {
      name: 'Rent',
      amount: 1500,
      due_day: Math.min(28, new Date().getUTCDate() + 1),
      category_id: housingCat.id,
      account_id: acct.body.id,
    },
    rotatedToken
  );
  assert(bill.status === 200, 'bill created');

  // Force a low budget by spending close to budget
  await request(
    port,
    'POST',
    '/api/transactions',
    {
      account_id: acct.body.id,
      category_id: groceriesCat.id,
      amount: 25,
      description: 'Snacks',
      date: new Date().toISOString().slice(0, 10),
      type: 'expense',
    },
    rotatedToken
  );

  const ev = await request(port, 'POST', '/api/alerts/evaluate', {}, rotatedToken);
  assert(ev.status === 200, 'alerts evaluated', ev.body);

  const alerts = await request(port, 'GET', '/api/alerts', undefined, rotatedToken);
  assert(alerts.status === 200 && alerts.body.length >= 1, `alerts returned (count=${alerts.body?.length})`);

  console.log('\nDashboard');
  const dash = await request(port, 'GET', `/api/dashboard/summary?month=${month}`, undefined, rotatedToken);
  assert(dash.status === 200 && dash.body.month === month, 'dashboard summary loaded');
  assert(dash.body.spent === 175, `dashboard spent = 175 (got ${dash.body.spent})`);
  assert(dash.body.income === 5000, 'dashboard uses configured monthly_income');
  assert(Array.isArray(dash.body.byCategory) && dash.body.byCategory.length > 0, 'category breakdown present');
  assert(Array.isArray(dash.body.trend) && dash.body.trend.length === 6, 'trend has 6 months');

  console.log('\nCSV Import');
  const csv = `Date,Description,Amount\n${new Date().toISOString().slice(0,10)},Coffee shop,-4.50\n${new Date().toISOString().slice(0,10)},Bus pass,-30.00\n`;
  const imp = await request(
    port,
    'POST',
    '/api/transactions/import-csv',
    { csv, account_id: acct.body.id },
    rotatedToken
  );
  assert(imp.status === 200 && imp.body.imported === 2, `CSV imported (got ${imp.body.imported})`);

  console.log('\nMulti-tenant isolation');
  const reg2 = await request(port, 'POST', '/api/auth/register', {
    email: 'bob@example.com',
    password: 'StrongPassword1',
    name: 'Bob',
  });
  assert(reg2.status === 200, 'second user registered');
  const bobTx = await request(port, 'GET', '/api/transactions', undefined, reg2.body.access);
  assert(bobTx.status === 200 && bobTx.body.length === 0, `bob sees zero tx (got ${bobTx.body.length})`);

  console.log('\nLogout');
  const logout = await request(port, 'POST', '/api/auth/logout', { refresh: rotated.body.refresh });
  assert(logout.status === 200, 'logout ok');
  const reuseLogged = await request(port, 'POST', '/api/auth/refresh', { refresh: rotated.body.refresh });
  assert(reuseLogged.status === 401, 'refresh rejected after logout');

  await new Promise<void>((res) => server.close(() => res()));

  console.log(`\nTotal: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('Failures:', failures);
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error('Test runner crashed', e);
  process.exit(1);
});
