import { runSafeMigrations } from "./migrate.mjs";

runSafeMigrations().catch((error) => {
  console.error(
    `Las migraciones se detuvieron antes de modificar la base de datos: ${error instanceof Error ? error.message : "error desconocido"}`,
  );
  process.exitCode = 1;
});
