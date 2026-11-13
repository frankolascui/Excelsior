// Carga una sola vez tus parámetros de FSRS (si los has ajustado) antes de programar tarjetas.
import { getSettings } from './api';
import { validParams } from './optimize';
import { setUserParams } from './srs';

let loading: Promise<void> | null = null;
export function ensureParams(): Promise<void> {
  loading ??= getSettings()
    .then((s) => setUserParams(validParams(s?.fsrs_params) ? s!.fsrs_params! : null))
    .catch(() => setUserParams(null));
  return loading;
}
