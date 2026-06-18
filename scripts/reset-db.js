import { connectDb, closeDb, DB_NAME } from "../lib/db.js";
import { resetDatabase } from "../lib/resetDb.js";

async function main() {
  await connectDb();
  console.log(`Resetting database: ${DB_NAME}`);
  await resetDatabase();
  console.log("Done.");
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
