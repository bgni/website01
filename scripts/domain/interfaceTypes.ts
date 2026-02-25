import type { InterfaceType } from "./types.ts";

const toStr = (v: unknown): string => (v == null ? "" : String(v));

// Boundary-only normalization of NetBox-ish interface type strings.
// Anything unknown becomes 'unsupported' so that topology validation can
// hard-error if a link references it.
export const normalizeInterfaceType = (
  raw: unknown,
): InterfaceType | undefined => {
  const s = toStr(raw).trim().toLowerCase();
  if (!s) return undefined;

  // Ethernet
  if (s === "100base-tx" || s === "100base-t") return "eth-100m";
  if (s === "1000base-t") return "eth-1g";
  if (s === "2.5gbase-t") return "eth-2.5g";
  if (s === "5gbase-t") return "eth-5g";

  if (
    s === "10gbase-t" ||
    s === "10gbase-x-sfpp" ||
    s === "10gbase-x-sfp+" ||
    s === "10gbase-x-sfp"
  ) {
    return "eth-10g";
  }

  if (s === "25gbase-x-sfp28") return "eth-25g";
  if (s === "40gbase-x-qsfpp" || s === "40gbase-x-qsfp+") return "eth-40g";
  if (s === "50gbase-x-sfp56") return "eth-50g";
  if (s === "100gbase-x-qsfp28") return "eth-100g";

  // Wi-Fi
  if (
    s === "ieee802.11a" ||
    s === "ieee802.11b" ||
    s === "ieee802.11g" ||
    s === "ieee802.11n" ||
    s === "ieee802.11ac" ||
    s === "ieee802.11ax" ||
    s === "ieee802.11be"
  ) {
    return "wifi";
  }

  return "unsupported";
};

export const isLinkableInterfaceType = (
  t: InterfaceType | undefined,
): boolean => {
  if (!t) return false;
  return t.startsWith("eth-");
};
