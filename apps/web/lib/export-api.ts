import { apiDownload } from "./api-client";

export async function exportModuleAsCsv(moduleName: string): Promise<void> {
  const blob = await apiDownload(`/export/${moduleName}`);
  const date = new Date().toISOString().split('T')[0];
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `export-${moduleName}-${date}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
