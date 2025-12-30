import type { MigrationConfig } from "drizzle-orm/migrator";
import { db } from "./db";


export async function migrate() {
    // dialect and session will appear to not exist...but they do
    if (window && (window as any).electronAPI && (window as any).electronAPI.getMigrations) {
        const migrations = await window.electronAPI.getMigrations();
        if (!db.ready) await db.waitReady;
        db.dialect.migrate(migrations, db.session, {
            migrationsTable: "drizzle_migrations",
        } satisfies Omit<MigrationConfig, "migrationsFolder">);
    };
}
