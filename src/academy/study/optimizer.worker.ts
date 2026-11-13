// Worker del optimizador: aquí sí se puede esperar a los hilos de cálculo (en la pantalla principal no).
import init, { Fsrs, initThreadPool } from 'fsrs-browser';
import wasmUrl from 'fsrs-browser/fsrs_browser_bg.wasm?url';

let ready: Promise<void> | null = null;

self.onmessage = async (e: MessageEvent<{ cids: bigint[]; ids: bigint[]; eases: number[]; types: number[]; offset: number }>) => {
  const { cids, ids, eases, types, offset } = e.data;
  try {
    ready ??= (async () => {
      await init({ module_or_path: wasmUrl });
      await initThreadPool(Math.max(1, Math.min(4, navigator.hardwareConcurrency || 2)));
    })();
    await ready;
    const fsrs = new Fsrs();
    const w = fsrs.computeParametersAnki(offset, BigInt64Array.from(cids), Uint8Array.from(eases), BigInt64Array.from(ids), Uint8Array.from(types), null, true);
    fsrs.free();
    postMessage({ ok: true, params: Array.from(w) });
  } catch (err) {
    postMessage({ ok: false, error: String((err as Error)?.message ?? err) });
  }
};
