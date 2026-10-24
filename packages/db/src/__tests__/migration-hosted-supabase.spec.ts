import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const migrations = join(__dirname, "../../prisma/migrations");

describe("migrations on hosted Supabase", () => {
  // The hosted migration role is not a superuser and cannot bind custom
  // parameters (`app.x`) to a function, role or database. CI runs as a
  // superuser, so only this check catches it before a production deploy.
  it("never binds a custom parameter with ALTER FUNCTION/ROLE/DATABASE ... SET", () => {
    const offenders = readdirSync(migrations, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .filter((entry) => {
        const sql = readFileSync(
          join(migrations, entry.name, "migration.sql"),
          "utf8",
        ).replace(/--.*$/gm, "");
        return /ALTER\s+(FUNCTION|ROLE|DATABASE)\b[^;]*?\bSET\s+[a-z_]+\.[a-z_]+/i.test(
          sql,
        );
      })
      .map((entry) => entry.name);
    expect(offenders).toEqual([]);
  });
});
