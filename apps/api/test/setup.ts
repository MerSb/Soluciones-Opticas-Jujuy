import path from "node:path";
import { fileURLToPath } from "node:url";

// Tests need DATABASE_URL (and friends), same as `npm run dev` — loaded
// here via Node's native env-file loader rather than adding dotenv as a
// dependency. Tests run against the seeded local dev database — see
// docs/API.md "Testing" for why a separate test database isn't set up
// for this read-only stage.
const rootEnvPath = path.resolve(fileURLToPath(import.meta.url), "../../../../.env");
process.loadEnvFile(rootEnvPath);
