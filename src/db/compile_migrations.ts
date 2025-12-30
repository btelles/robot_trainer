import { readMigrationFiles } from "drizzle-orm/migrator";
import fs from "node:fs";
import path from "node:path";

const migrationsFolder = path.resolve(__dirname, '../../../drizzle');
const migrations = readMigrationFiles({ migrationsFolder });

const outPath = path.resolve(__dirname, '../../../src/db/migrations.json');

fs.writeFile(outPath, JSON.stringify(migrations), (err) => {
  if (err) {
    console.error('Error writing migrations.json:', err);
    process.exit(1);
  }
  console.log('Migrations compiled!');
});

