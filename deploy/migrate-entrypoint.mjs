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
    `La migracion o su verificacion fallo; la base de datos puede haber cambiado. No inicie la API: revise migrate status, el historial y el respaldo. Detalle: ${error instanceof Error ? error.message : "error desconocido"}`,
  );
  process.exitCode = 1;
});
