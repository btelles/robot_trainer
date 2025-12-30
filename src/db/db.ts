import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

const client = new PGlite("idb://robot-trainer");

const db = drizzle(client);

export { db };
