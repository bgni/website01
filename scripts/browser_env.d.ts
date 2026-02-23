// deno-lint-ignore-file no-explicit-any
/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

// This project uses D3 via a CDN script tag, so the symbol exists at runtime.
// We declare it here so `deno check` can typecheck browser modules.
declare const d3: any;
