import { runSafeMigrations } from "./migrate.mjs";
import {
  allowsInsecureEvaluationDatabase,
  requireMigrationEnvironment,
} from "./runtime-environment.mjs";

async function migrate() {
  requireMigrationEnvironment();
  if (allowsInsecureEvaluationDatabase()) {
    console.warn(
      "ADVERTENCIA: migracion PostgreSQL sin TLS habilitada exclusivamente para este entorno de evaluacion. No usar este perfil con datos personales ni operativos.",
    );
  }
  await runSafeMigrations();
}

migrate().catch((error) => {
  console.error(
    `Las migraciones se detuvieron antes de modificar la base de datos: ${error instanceof Error ? error.message : "error desconocido"}`,
  );
  process.exitCode = 1;
});
