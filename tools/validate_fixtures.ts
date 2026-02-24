import { join } from "@std/path";

const root = Deno.cwd();
const networksIndexPath = join(root, "data", "networks", "index.json");
const connectionTypesPath = join(root, "data", "connectionTypes.json");

const readJson = async (path: string) => {
  const text = await Deno.readTextFile(path);
  return JSON.parse(text);
};

const readJsonOptional = async (path: string) => {
  try {
    return await readJson(path);
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) return null;
    throw err;
  }
};

type Device = {
  id: string;
  name?: string;
  role?: string;
  site?: string;
  room_id?: string;
};

type ConnectionEnd = { deviceId: string; portId?: string };
type Connection = {
  id: string;
  from: ConnectionEnd;
  to: ConnectionEnd;
  connectionType?: string;
  connection_type?: string;
};

type TrafficUpdate = { connectionId: string };

type TrafficTimeline = {
  initial?: TrafficUpdate[];
  updates?: TrafficUpdate[];
};

type TrafficGenerator = {
  initial?: TrafficUpdate[];
  events?: TrafficUpdate[];
  links?: Record<string, unknown>;
};

type FlowConfig = {
  tickSeconds?: number;
  flows?: Array<
    {
      id?: string;
      fromDeviceId?: string;
      toDeviceId?: string;
      rateMbps?: number;
      status?: string;
    }
  >;
  events?: Array<
    { t?: number; flowId?: string; rateMbps?: number; status?: string }
  >;
};

const asArray = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

const asRecord = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" ? (v as Record<string, unknown>) : null;

const validateConnectionIds = (
  label: string,
  trafficUpdates: TrafficUpdate[],
  connectionIds: Set<string>,
  errors: string[],
) => {
  for (const t of trafficUpdates) {
    const id = String(t?.connectionId || "").trim();
    if (!id) continue;
    if (!connectionIds.has(id)) {
      errors.push(`${label}: traffic references missing connectionId "${id}"`);
    }
  }
};

const errors: string[] = [];
const warnings: string[] = [];

const connectionTypesJson = await readJsonOptional(connectionTypesPath);
const connectionTypes =
  (connectionTypesJson && typeof connectionTypesJson === "object")
    ? connectionTypesJson as Record<string, { capacityMbps?: number }>
    : {};
const knownConnectionTypes = new Set(Object.keys(connectionTypes));

const index = await readJson(networksIndexPath);
const networks = asArray<{ id: string; name?: string }>(index?.networks);

if (!networks.length) {
  console.error(`No networks found in ${networksIndexPath}`);
  Deno.exit(1);
}

for (const net of networks) {
  const networkId = String(net?.id || "").trim();
  if (!networkId) {
    errors.push("index.json: network missing id");
    continue;
  }

  const basePath = join(root, "data", "networks", networkId);
  const devicesPath = join(basePath, "devices.json");
  const connectionsPath = join(basePath, "connections.json");
  const trafficPath = join(basePath, "traffic.json");
  const trafficGeneratorPath = join(basePath, "traffic.generator.json");
  const trafficConnectorPath = join(basePath, "traffic.connector.json");
  const trafficFlowPath = join(basePath, "traffic.flow.json");

  const devicesRaw = await readJson(devicesPath);
  const connectionsRaw = await readJson(connectionsPath);

  const devices = asArray<Device>(devicesRaw);
  const connections = asArray<Connection>(connectionsRaw);

  if (!devices.length) errors.push(`${networkId}: devices.json has no devices`);
  if (!connections.length) {
    warnings.push(`${networkId}: connections.json has no connections`);
  }

  const deviceIds = new Set<string>();
  for (const d of devices) {
    const id = String(d?.id || "").trim();
    if (!id) {
      errors.push(`${networkId}: device missing id`);
      continue;
    }
    if (deviceIds.has(id)) {
      errors.push(`${networkId}: duplicate device id "${id}"`);
    }
    deviceIds.add(id);

    const name = String(d?.name || "").trim();
    if (!name) warnings.push(`${networkId}: device "${id}" missing name`);

    const role = String(d?.role || "").trim();
    if (!role) errors.push(`${networkId}: device "${id}" missing role`);
    if (role.toLowerCase() === "switch") {
      warnings.push(`${networkId}: device "${id}" has generic role "switch"`);
    }

    const site = String(d?.site || "").trim();
    if (!site) {
      // We want deterministic Layered grouping/order without name heuristics.
      errors.push(`${networkId}: device "${id}" missing site`);
    }
  }

  const connectionIds = new Set<string>();
  for (const c of connections) {
    const id = String(c?.id || "").trim();
    if (!id) {
      errors.push(`${networkId}: connection missing id`);
      continue;
    }
    if (connectionIds.has(id)) {
      errors.push(`${networkId}: duplicate connection id "${id}"`);
    }
    connectionIds.add(id);

    const fromId = String(c?.from?.deviceId || "").trim();
    const toId = String(c?.to?.deviceId || "").trim();

    if (!fromId || !toId) {
      errors.push(`${networkId}: connection "${id}" missing from/to deviceId`);
      continue;
    }

    if (!deviceIds.has(fromId)) {
      errors.push(
        `${networkId}: connection "${id}" from deviceId not found: "${fromId}"`,
      );
    }
    if (!deviceIds.has(toId)) {
      errors.push(
        `${networkId}: connection "${id}" to deviceId not found: "${toId}"`,
      );
    }

    if (fromId === toId) {
      warnings.push(
        `${networkId}: connection "${id}" is a self-loop (${fromId})`,
      );
    }

    const camel = String(c?.connectionType || "").trim();
    const snake = String(c?.connection_type || "").trim();
    const typeId = camel || snake;
    if (!typeId) {
      errors.push(`${networkId}: connection "${id}" missing connectionType`);
    } else {
      if (!camel && snake) {
        warnings.push(
          `${networkId}: connection "${id}" uses legacy field connection_type; prefer connectionType`,
        );
      }
      if (knownConnectionTypes.size && !knownConnectionTypes.has(typeId)) {
        errors.push(
          `${networkId}: connection "${id}" has unknown connectionType "${typeId}" (not in data/connectionTypes.json)`,
        );
      }
    }
  }

  const connector = await readJsonOptional(trafficConnectorPath);
  const connectorObj = asRecord(connector);
  if (connectorObj) {
    const kind = typeof connectorObj.kind === "string"
      ? connectorObj.kind.trim()
      : "";
    if (kind === "flow") {
      const flowJson = await readJsonOptional(trafficFlowPath);
      if (!flowJson) {
        errors.push(
          `${networkId}: traffic.connector.json kind "flow" but traffic.flow.json is missing`,
        );
      } else {
        const flow = flowJson as FlowConfig;
        const flows = asArray<NonNullable<FlowConfig["flows"]>[number]>(
          flow.flows,
        );
        for (const f of flows) {
          const fromId = String(f?.fromDeviceId || "").trim();
          const toId = String(f?.toDeviceId || "").trim();
          const id = String(f?.id || "").trim();
          if (!id) {
            warnings.push(`${networkId}: traffic.flow.json flow missing id`);
          }
          if (!fromId || !toId) {
            errors.push(
              `${networkId}: traffic.flow.json flow "${
                id || "(missing id)"
              }" missing fromDeviceId/toDeviceId`,
            );
            continue;
          }
          if (!deviceIds.has(fromId)) {
            errors.push(
              `${networkId}: traffic.flow.json flow "${
                id || "(missing id)"
              }" fromDeviceId not found: "${fromId}"`,
            );
          }
          if (!deviceIds.has(toId)) {
            errors.push(
              `${networkId}: traffic.flow.json flow "${
                id || "(missing id)"
              }" toDeviceId not found: "${toId}"`,
            );
          }
        }

        const events = asArray<NonNullable<FlowConfig["events"]>[number]>(
          flow.events,
        );
        const flowIds = new Set(
          flows.map((f) => String(f?.id || "").trim()).filter(Boolean),
        );
        for (const ev of events) {
          const flowId = String(ev?.flowId || "").trim();
          if (flowId && flowIds.size && !flowIds.has(flowId)) {
            warnings.push(
              `${networkId}: traffic.flow.json event references unknown flowId "${flowId}"`,
            );
          }
        }
      }
    }
  }

  const trafficJson = await readJsonOptional(trafficPath);
  if (trafficJson) {
    if (Array.isArray(trafficJson)) {
      validateConnectionIds(
        `${networkId}:traffic.json`,
        asArray<TrafficUpdate>(trafficJson),
        connectionIds,
        errors,
      );
    } else {
      const timeline = trafficJson as TrafficTimeline;
      validateConnectionIds(
        `${networkId}:traffic.json initial`,
        asArray<TrafficUpdate>(timeline.initial),
        connectionIds,
        errors,
      );
      validateConnectionIds(
        `${networkId}:traffic.json updates`,
        asArray<TrafficUpdate>(timeline.updates),
        connectionIds,
        errors,
      );
    }
  }

  const generator = await readJsonOptional(trafficGeneratorPath);
  if (generator) {
    const gen = generator as TrafficGenerator;
    validateConnectionIds(
      `${networkId}:traffic.generator.json initial`,
      asArray<TrafficUpdate>(gen.initial),
      connectionIds,
      errors,
    );
    validateConnectionIds(
      `${networkId}:traffic.generator.json events`,
      asArray<TrafficUpdate>(gen.events),
      connectionIds,
      errors,
    );

    const linkKeys = gen.links ? Object.keys(gen.links) : [];
    for (const linkId of linkKeys) {
      if (!connectionIds.has(linkId)) {
        errors.push(
          `${networkId}: traffic.generator.json links includes missing connectionId "${linkId}"`,
        );
      }
    }
  }
}

if (warnings.length) {
  console.warn(`WARN: ${warnings.length}`);
  for (const w of warnings) console.warn(`- ${w}`);
}

if (errors.length) {
  console.error(`ERROR: ${errors.length}`);
  for (const e of errors) console.error(`- ${e}`);
  Deno.exit(1);
}

console.log(`OK: validated ${networks.length} network(s)`);
