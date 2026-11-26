import 'dotenv/config';
import postgres from '@prisma/orm-postgres/runtime';
import { contractFromJson } from '@prisma/orm-postgres/static';
import type { Contract } from './contract.d.js';
import contractJson from './contract.json' with { type: 'json' };

export const contract = contractFromJson<Contract>(contractJson);

function createDbClient() {
  return postgres({
    contract,
    url: process.env['DATABASE_URL'] ?? 'postgresql://user:password@localhost:5432/miniapp_store',
  });
}

type DbClient = ReturnType<typeof createDbClient>;

const globalForDb = globalThis as unknown as {
  __prismaDb?: DbClient;
};

export const db: DbClient = globalForDb.__prismaDb ?? createDbClient();

if (process.env.NODE_ENV !== 'production') {
  globalForDb.__prismaDb = db;
}
