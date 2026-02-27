import type { DeviceType } from "../domain/types.ts";
import {
  DEVICE_KIND_ACCESS_POINT,
  DEVICE_KIND_ROUTER,
  DEVICE_KIND_SERVER,
  DEVICE_KIND_SWITCH,
  DEVICE_KIND_UNKNOWN,
  inferDeviceKindFromType,
} from "../domain/deviceKind.ts";

export type BuilderShortlistChoice = {
  slug: string;
  label: string;
  portSummary: string;
  portTypes: string[];
  thumbPng?: string;
  thumbJpg?: string;
};

export type BuilderShortlistKindOption = {
  kindId: number;
  kindLabel: string;
  selectedSlug: string;
  choices: BuilderShortlistChoice[];
};

export type BuilderDeviceOption = {
  slug: string;
  label: string;
  groupId: string;
  groupLabel: string;
  portSummary: string;
  kindLabel: string;
  portTypes: string[];
  kindId?: number;
  modelLabel?: string;
  thumbPng?: string;
  thumbJpg?: string;
};

export type BuilderPickerOptionsInput = {
  deviceTypes: Record<string, DeviceType>;
  recentDeviceTypeSlugs: string[];
  frequentDeviceTypeSlugs: string[];
  shortlistByKind?: Record<string, string>;
  query: string;
};

export type BuilderPickerModel = {
  options: BuilderDeviceOption[];
  shortlistKinds: BuilderShortlistKindOption[];
};

export const BUILDER_GROUP_SLUG = "__group__";

const KIND_ORDER = [
  DEVICE_KIND_SWITCH,
  DEVICE_KIND_ROUTER,
  DEVICE_KIND_SERVER,
  DEVICE_KIND_ACCESS_POINT,
  DEVICE_KIND_UNKNOWN,
] as const;

const CORE_SHORTLIST_KINDS = [
  DEVICE_KIND_SWITCH,
  DEVICE_KIND_ROUTER,
  DEVICE_KIND_SERVER,
  DEVICE_KIND_ACCESS_POINT,
] as const;

const KIND_FILTER_LABEL_BY_ID = new Map<number, string>([
  [DEVICE_KIND_SWITCH, "Switch"],
  [DEVICE_KIND_ROUTER, "Router"],
  [DEVICE_KIND_SERVER, "Server"],
  [DEVICE_KIND_ACCESS_POINT, "Access point"],
  [DEVICE_KIND_UNKNOWN, "Other"],
]);

const ETHERNET_PORT_MATCH_PRIORITY = [
  "1G",
  "2.5G",
  "5G",
  "10G",
  "25G",
  "40G",
  "50G",
  "100G",
  "100M",
];

const SHORTLIST_CHOICE_LIMIT = 260;
const MODERN_INTERFACE_TYPES = new Set([
  "eth-1g",
  "eth-2.5g",
  "eth-5g",
  "eth-10g",
  "eth-25g",
  "eth-40g",
  "eth-50g",
  "eth-100g",
  "wifi",
]);

const formatDeviceTypeLabel = (
  slug: string,
  deviceType: DeviceType,
): string => {
  const label = `${deviceType.brand ?? ""} ${deviceType.model ?? ""}`.trim();
  return label || slug;
};

const hasDeviceTypeImage = (deviceType: DeviceType): boolean => {
  const thumbPng = typeof deviceType.thumbPng === "string"
    ? deviceType.thumbPng.trim()
    : "";
  const thumbJpg = typeof deviceType.thumbJpg === "string"
    ? deviceType.thumbJpg.trim()
    : "";
  return thumbPng.length > 0 || thumbJpg.length > 0;
};

const INTERFACE_LABEL_BY_TYPE = new Map<string, string>([
  ["eth-100m", "100M"],
  ["eth-1g", "1G"],
  ["eth-2.5g", "2.5G"],
  ["eth-5g", "5G"],
  ["eth-10g", "10G"],
  ["eth-25g", "25G"],
  ["eth-40g", "40G"],
  ["eth-50g", "50G"],
  ["eth-100g", "100G"],
  ["wifi", "Wi-Fi"],
  ["unsupported", "Other"],
]);

const PORT_FILTER_ORDER = [
  "100M",
  "1G",
  "2.5G",
  "5G",
  "10G",
  "25G",
  "40G",
  "50G",
  "100G",
  "Wi-Fi",
  "Other",
];
const PORT_FILTER_ORDER_INDEX = new Map(
  PORT_FILTER_ORDER.map((label, index) => [label, index]),
);

const summarizePorts = (deviceType: DeviceType): string => {
  const ports = Array.isArray(deviceType.ports) ? deviceType.ports : [];
  if (!ports.length) return "No port data";

  const nonMgmtPorts = ports.filter((port) => !port.mgmtOnly);
  if (!nonMgmtPorts.length) return "No usable network ports";

  const counts = nonMgmtPorts.reduce((map, port) => {
    const normalized = typeof port.interfaceType === "string"
      ? INTERFACE_LABEL_BY_TYPE.get(port.interfaceType)
      : undefined;
    let key = normalized;
    if (!key && typeof port.type === "string" && port.type.trim()) {
      key = port.type.trim();
    }
    if (!key) key = "Other";
    map.set(key, (map.get(key) ?? 0) + 1);
    return map;
  }, new Map<string, number>());

  const topBuckets = Array.from(counts.entries())
    .sort((left, right) =>
      right[1] - left[1] || left[0].localeCompare(right[0])
    )
    .slice(0, 3)
    .map(([kind, count]) => `${count} ${kind}`);

  return topBuckets.join(", ");
};

const getPortTypeLabels = (deviceType: DeviceType): string[] => {
  const ports = Array.isArray(deviceType.ports) ? deviceType.ports : [];
  const labels = new Set<string>();

  ports
    .filter((port) => !port.mgmtOnly)
    .forEach((port) => {
      const normalized = typeof port.interfaceType === "string"
        ? INTERFACE_LABEL_BY_TYPE.get(port.interfaceType)
        : undefined;
      let label = normalized;
      if (!label && typeof port.type === "string" && port.type.trim()) {
        label = port.type.trim();
      }
      labels.add(label || "Other");
    });

  return Array.from(labels).sort((left, right) => {
    const leftOrder = PORT_FILTER_ORDER_INDEX.get(left) ??
      Number.POSITIVE_INFINITY;
    const rightOrder = PORT_FILTER_ORDER_INDEX.get(right) ??
      Number.POSITIVE_INFINITY;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    return left.localeCompare(right);
  });
};

const isModernDeviceType = (deviceType: DeviceType): boolean => {
  if (!hasDeviceTypeImage(deviceType)) return false;
  const ports = Array.isArray(deviceType.ports) ? deviceType.ports : [];
  const usablePorts = ports.filter((port) => !port.mgmtOnly);
  if (!usablePorts.length) return false;
  return usablePorts.some((port) =>
    typeof port.interfaceType === "string" &&
    MODERN_INTERFACE_TYPES.has(port.interfaceType)
  );
};

const comparePortTypeByPriority = (left: string, right: string) => {
  const leftOrder = PORT_FILTER_ORDER_INDEX.get(left) ??
    Number.POSITIVE_INFINITY;
  const rightOrder = PORT_FILTER_ORDER_INDEX.get(right) ??
    Number.POSITIVE_INFINITY;
  if (leftOrder !== rightOrder) return leftOrder - rightOrder;
  return left.localeCompare(right);
};

const pickKindDefaults = (
  {
    candidatesByKind,
    shortlistByKind,
    portTypesBySlug,
  }: {
    candidatesByKind: Map<number, string[]>;
    shortlistByKind: Record<string, string>;
    portTypesBySlug: Map<string, string[]>;
  },
): Map<number, string> => {
  const selectedByKind = new Map<number, string>();

  KIND_ORDER.forEach((kind) => {
    const pinnedSlug = shortlistByKind[String(kind)]?.trim();
    if (!pinnedSlug) return;
    const kindCandidates = candidatesByKind.get(kind) ?? [];
    if (!kindCandidates.includes(pinnedSlug)) return;
    selectedByKind.set(kind, pinnedSlug);
  });

  const coreKinds = CORE_SHORTLIST_KINDS.filter((kind) =>
    (candidatesByKind.get(kind)?.length ?? 0) > 0
  );

  let sharedPortLabel: string | null = null;
  const rankedPortLabels = Array.from(
    new Set(
      coreKinds.flatMap((kind) => {
        const pinnedSlug = selectedByKind.get(kind);
        if (pinnedSlug) return portTypesBySlug.get(pinnedSlug) ?? [];
        const kindCandidates = candidatesByKind.get(kind) ?? [];
        return kindCandidates.flatMap((slug) =>
          portTypesBySlug.get(slug) ?? []
        );
      }),
    ),
  )
    .filter((label) =>
      label !== "Wi-Fi" && label !== "Other" && label.trim().length > 0
    )
    .sort((left, right) => {
      const leftPreferred = ETHERNET_PORT_MATCH_PRIORITY.indexOf(left);
      const rightPreferred = ETHERNET_PORT_MATCH_PRIORITY.indexOf(right);
      if (leftPreferred !== -1 || rightPreferred !== -1) {
        if (leftPreferred === -1) return 1;
        if (rightPreferred === -1) return -1;
        if (leftPreferred !== rightPreferred) {
          return leftPreferred - rightPreferred;
        }
      }
      return comparePortTypeByPriority(left, right);
    });

  for (const label of rankedPortLabels) {
    const supportedAcrossCoreKinds = coreKinds.every((kind) => {
      const pinnedSlug = selectedByKind.get(kind);
      if (pinnedSlug) {
        return (portTypesBySlug.get(pinnedSlug) ?? []).includes(label);
      }
      const kindCandidates = candidatesByKind.get(kind) ?? [];
      return kindCandidates.some((slug) =>
        (portTypesBySlug.get(slug) ?? []).includes(label)
      );
    });
    if (!supportedAcrossCoreKinds) continue;
    sharedPortLabel = label;
    break;
  }

  coreKinds.forEach((kind) => {
    if (selectedByKind.has(kind)) return;
    const kindCandidates = candidatesByKind.get(kind) ?? [];
    if (!kindCandidates.length) return;

    const matched = sharedPortLabel
      ? kindCandidates.find((slug) =>
        (portTypesBySlug.get(slug) ?? []).includes(sharedPortLabel)
      )
      : undefined;

    selectedByKind.set(kind, matched ?? kindCandidates[0]);
  });

  KIND_ORDER.forEach((kind) => {
    if (selectedByKind.has(kind)) return;
    const kindCandidates = candidatesByKind.get(kind) ?? [];
    const first = kindCandidates[0];
    if (first) selectedByKind.set(kind, first);
  });

  return selectedByKind;
};

const buildPickerModel = (
  {
    deviceTypes,
    recentDeviceTypeSlugs,
    frequentDeviceTypeSlugs,
    shortlistByKind,
    query,
  }: BuilderPickerOptionsInput,
): BuilderPickerModel => {
  const allDeviceTypeSlugs = Object.keys(deviceTypes)
    .filter((slug) => isModernDeviceType(deviceTypes[slug]))
    .sort((left, right) => {
      const leftLabel = formatDeviceTypeLabel(left, deviceTypes[left]);
      const rightLabel = formatDeviceTypeLabel(right, deviceTypes[right]);
      return leftLabel.localeCompare(rightLabel);
    });

  const rankByFrequentSlug = new Map(
    frequentDeviceTypeSlugs.map((slug, index) => [slug, index]),
  );
  const rankByRecentSlug = new Map(
    recentDeviceTypeSlugs.map((slug, index) => [slug, index]),
  );

  const normalizedShortlistByKind = shortlistByKind ?? {};

  const labelBySlug = new Map(
    allDeviceTypeSlugs.map((slug) => [
      slug,
      formatDeviceTypeLabel(slug, deviceTypes[slug]),
    ]),
  );
  const portSummaryBySlug = new Map(
    allDeviceTypeSlugs.map((slug) => [slug, summarizePorts(deviceTypes[slug])]),
  );
  const portTypesBySlug = new Map(
    allDeviceTypeSlugs.map((
      slug,
    ) => [slug, getPortTypeLabels(deviceTypes[slug])]),
  );

  const compareSlugs = (left: string, right: string) => {
    const leftRecentRank = rankByRecentSlug.get(left) ??
      Number.POSITIVE_INFINITY;
    const rightRecentRank = rankByRecentSlug.get(right) ??
      Number.POSITIVE_INFINITY;
    if (leftRecentRank !== rightRecentRank) {
      return leftRecentRank - rightRecentRank;
    }

    const leftRank = rankByFrequentSlug.get(left) ?? Number.POSITIVE_INFINITY;
    const rightRank = rankByFrequentSlug.get(right) ?? Number.POSITIVE_INFINITY;
    if (leftRank !== rightRank) return leftRank - rightRank;

    return (labelBySlug.get(left) ?? left).localeCompare(
      labelBySlug.get(right) ?? right,
    );
  };

  const kindBySlug = new Map<string, number>(
    allDeviceTypeSlugs.map((slug) => {
      const deviceType = deviceTypes[slug];
      const typeText = `${slug} ${deviceType.model}`;
      return [slug, inferDeviceKindFromType(typeText)] as const;
    }),
  );

  const candidatesByKind = new Map<number, string[]>(
    KIND_ORDER.map((kind) => [
      kind,
      allDeviceTypeSlugs
        .filter((slug) => kindBySlug.get(slug) === kind)
        .sort(compareSlugs),
    ]),
  );

  const selectedByKind = pickKindDefaults({
    candidatesByKind,
    shortlistByKind: normalizedShortlistByKind,
    portTypesBySlug,
  });

  const shortlistKinds = KIND_ORDER
    .map((kind): BuilderShortlistKindOption | null => {
      const kindLabel = KIND_FILTER_LABEL_BY_ID.get(kind) ?? "Other";
      const kindCandidates = candidatesByKind.get(kind) ?? [];
      if (!kindCandidates.length) return null;

      const selectedSlug = selectedByKind.get(kind) ?? kindCandidates[0];
      const choices = kindCandidates
        .slice(0, SHORTLIST_CHOICE_LIMIT)
        .map((slug) => {
          const type = deviceTypes[slug];
          const label = labelBySlug.get(slug) ?? slug;
          return {
            slug,
            label,
            portSummary: portSummaryBySlug.get(slug) ?? "No port data",
            portTypes: portTypesBySlug.get(slug) ?? [],
            ...(typeof type.thumbPng === "string"
              ? { thumbPng: type.thumbPng }
              : {}),
            ...(typeof type.thumbJpg === "string"
              ? { thumbJpg: type.thumbJpg }
              : {}),
          } satisfies BuilderShortlistChoice;
        });

      return {
        kindId: kind,
        kindLabel,
        selectedSlug,
        choices,
      };
    })
    .filter((entry): entry is BuilderShortlistKindOption => entry !== null);

  const kindOptions = shortlistKinds.map((kind) => {
    const selectedChoice = kind.choices.find((choice) =>
      choice.slug === kind.selectedSlug
    ) ?? kind.choices[0];

    return {
      slug: selectedChoice.slug,
      label: kind.kindLabel,
      groupId: "device-kinds",
      groupLabel: "Device types",
      portSummary: selectedChoice.portSummary,
      kindLabel: kind.kindLabel,
      portTypes: selectedChoice.portTypes,
      kindId: kind.kindId,
      modelLabel: selectedChoice.label,
      ...(selectedChoice.thumbPng ? { thumbPng: selectedChoice.thumbPng } : {}),
      ...(selectedChoice.thumbJpg ? { thumbJpg: selectedChoice.thumbJpg } : {}),
    } satisfies BuilderDeviceOption;
  });

  const groupOption: BuilderDeviceOption = {
    slug: BUILDER_GROUP_SLUG,
    label: "Group",
    groupId: "canvas-elements",
    groupLabel: "Canvas elements",
    portSummary: "Container for organizing devices.",
    kindLabel: "Group",
    portTypes: [],
  };

  const normalizedQuery = query.trim().toLowerCase();
  const options = [...kindOptions, groupOption];

  if (!normalizedQuery) {
    return {
      options,
      shortlistKinds,
    };
  }

  const filteredOptions = options.filter((option) => {
    const modelText = option.modelLabel ?? "";
    const haystack =
      `${option.label} ${option.groupLabel} ${modelText} ${option.slug} ${option.portSummary}`
        .toLowerCase();
    return haystack.includes(normalizedQuery);
  });

  return {
    options: filteredOptions,
    shortlistKinds,
  };
};

export const buildBuilderPickerModel = (
  input: BuilderPickerOptionsInput,
): BuilderPickerModel => buildPickerModel(input);

export const buildBuilderDeviceTypeOptions = (
  input: BuilderPickerOptionsInput,
): BuilderDeviceOption[] => buildPickerModel(input).options;

export const buildBuilderShortlistKinds = (
  input: BuilderPickerOptionsInput,
): BuilderShortlistKindOption[] => buildPickerModel(input).shortlistKinds;
