export async function loadEngine() {
  const url = new URL('../clinicalcore.wasm', import.meta.url);
  const bytes = await (await fetch(url)).arrayBuffer();
  const { instance } = await WebAssembly.instantiate(bytes);
  const { memory, buf_alloc, buf_free, run } = instance.exports;
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  const put = data => {
    const ptr = buf_alloc(data.length);
    new Uint8Array(memory.buffer, ptr, data.length).set(data);
    return ptr;
  };

  return (tool, input) => {
    const name = enc.encode(tool);
    const data = enc.encode(JSON.stringify(input));
    const namePtr = put(name);
    const dataPtr = put(data);
    const packed = run(namePtr, name.length, dataPtr, data.length);
    buf_free(namePtr, name.length);
    buf_free(dataPtr, data.length);
    const ptr = Number(packed >> 32n);
    const len = Number(packed & 0xffffffffn);
    const out = JSON.parse(dec.decode(new Uint8Array(memory.buffer, ptr, len)));
    buf_free(ptr, len);
    return out;
  };
}
