import { sql } from "drizzle-orm";
import { users } from "./schema";

/** A person's email, or their username for password accounts. Use where an email used to be shown. */
export const userHandle = sql<string | null>`coalesce(${users.email}, ${users.username})`;
