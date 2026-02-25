import { FixtureValidationError } from "./errors.ts";

type ThumbPaths = { thumbPng: string; thumbJpg: string };

const slugToFileBase = (mfg: string, modelFileBase: string): string => {
  return `${String(mfg).toLowerCase()}-${String(modelFileBase).toLowerCase()}`
    .replace(/[^a-z0-9\-]+/g, "-")
    .replace(/\-+/g, "-")
    .replace(/(^-|-$)/g, "");
};

// Domain-boundary helper: given a strict NetBox type slug (Manufacturer/ModelFileBase),
// compute the likely local vendor elevation image paths.
export const computeNetboxElevationThumbs = (
  deviceTypeSlug: string,
  ctx = "deviceTypeSlug",
): ThumbPaths | undefined => {
  const slug = deviceTypeSlug.trim();
  if (!slug) {
    throw new FixtureValidationError(ctx, "must be a non-empty string");
  }
  if (!slug.includes("/")) return undefined;

  const parts = slug.split("/");
  if (parts.length !== 2) {
    throw new FixtureValidationError(
      ctx,
      "expected NetBox type slug in the form 'Manufacturer/ModelFileBase'",
    );
  }
  const [mfg, modelFileBase] = parts;
  if (!mfg || !modelFileBase) {
    throw new FixtureValidationError(
      ctx,
      "expected NetBox type slug in the form 'Manufacturer/ModelFileBase'",
    );
  }

  const fileBase = slugToFileBase(mfg, modelFileBase);
  if (!fileBase) return undefined;

  const base =
    `vendor/netbox-devicetype-library/elevation-images/${mfg}/${fileBase}.front`;
  return { thumbPng: `${base}.png`, thumbJpg: `${base}.jpg` };
};
