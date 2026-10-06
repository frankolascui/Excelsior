// Descargar un archivo: dentro de Claude (Artifact) pasa por la capacidad «downloads»; en la web, enlace normal.
type Downloads = { save: (r: { filename: string; data: string }) => Promise<unknown> };

/** Devuelve 'ok', 'declined' (el usuario dijo que no) o 'error'. */
export async function saveFile(filename: string, data: string, mime = 'text/plain'): Promise<'ok' | 'declined' | 'error'> {
  const claudeRt = (window as unknown as { claude?: { use?: (n: string) => Promise<Downloads | null> } }).claude;
  const downloads = claudeRt?.use ? await claudeRt.use('downloads').catch(() => null) : null;
  if (downloads) {
    try {
      await downloads.save({ filename, data });
      return 'ok';
    } catch (e) {
      return (e as { code?: string }).code === 'declined' ? 'declined' : 'error';
    }
  }
  try {
    const blob = new Blob([data], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    return 'ok';
  } catch {
    return 'error';
  }
}
