// Centralized access to the global D3 bundle loaded in index.html.
// This keeps D3 usage explicit in modules without forcing a heavyweight ESM import.
//
// deno-lint-ignore no-explicit-any
export type D3Global = any;

export const getD3 = (): D3Global => {
  // deno-lint-ignore no-explicit-any
  const d3 = (globalThis as any).d3;
  if (!d3) {
    throw new Error(
      "D3 is not available on globalThis. Ensure index.html loads the D3 script before importing modules.",
    );
  }
  return d3;
};
