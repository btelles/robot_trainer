import type { MigrationConfig } from "drizzle-orm/migrator";
import { db } from "./db";
import migrations from './migrations.json';


export async function migrate() {
    // dialect and session will appear to not exist...but they do
    if (typeof window !== 'undefined' && (window as any).electronAPI && (window as any).electronAPI.getMigrations) {
        const migrations = await window.electronAPI.getMigrations();
        if (!db.ready)  await db.waitReady;
        await db.dialect.migrate(migrations, db.session, {
            migrationsTable: "drizzle_migrations",
        } satisfies Omit<MigrationConfig, "migrationsFolder">);
    } else {
        if (!db.ready) await db.waitReady;
        console.log("Running migrations...");
        db.dialect.migrate(migrations, db.session, {
            migrationsTable: "drizzle_migrations",
        } satisfies Omit<MigrationConfig, "migrationsFolder">);

    };
}
