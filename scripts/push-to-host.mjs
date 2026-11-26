import 'dotenv/config';
import { execSync } from 'node:child_process';
import pg from 'pg';

const localUrl = process.env.DATABASE_URL;
const targetUrl = process.argv[2] || process.env.TARGET_DATABASE_URL;

if (!localUrl) {
  console.error('Missing local DATABASE_URL in .env');
  process.exit(1);
}

if (!targetUrl) {
  console.error('Usage: npm run host:sync -- "postgresql://user:pass@host/db"');
  process.exit(1);
}

console.log('1. Initializing tables on hosted PostgreSQL...');
execSync('npx prisma db init', {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: targetUrl },
});

console.log('2. Copying products and staff from local DB to hosted DB...');
const localClient = new pg.Client({ connectionString: localUrl });
const targetClient = new pg.Client({ connectionString: targetUrl });

try {
  await localClient.connect();
  await targetClient.connect();

  const { rows: products } = await localClient.query(
    'SELECT name, description, "priceCents", currency, stock, "imageUrl", "isActive" FROM "Product" ORDER BY id ASC',
  );

  let copiedProducts = 0;
  for (const p of products) {
    const existing = await targetClient.query(
      'SELECT id FROM "Product" WHERE name = $1 LIMIT 1',
      [p.name],
    );
    if (existing.rowCount === 0) {
      await targetClient.query(
        'INSERT INTO "Product" (name, description, "priceCents", currency, stock, "imageUrl", "isActive", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())',
        [p.name, p.description, p.priceCents, p.currency, p.stock, p.imageUrl, p.isActive],
      );
      copiedProducts++;
    }
  }

  const { rows: staff } = await localClient.query(
    'SELECT "telegramId", username, name, role, "isActive", "createdBy" FROM "StaffUser" ORDER BY id ASC',
  );

  let copiedStaff = 0;
  for (const s of staff) {
    const res = await targetClient.query(
      'INSERT INTO "StaffUser" ("telegramId", username, name, role, "isActive", "createdBy", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, NOW()) ON CONFLICT ("telegramId") DO NOTHING',
      [s.telegramId, s.username, s.name, s.role, s.isActive, s.createdBy],
    );
    if ((res.rowCount ?? 0) > 0) copiedStaff++;
  }

  console.log(`Done! Copied ${copiedProducts} new product(s) and ${copiedStaff} new staff user(s).`);
} finally {
  await localClient.end().catch(() => {});
  await targetClient.end().catch(() => {});
}
