import { assert, assertEquals } from "@std/assert";
import { applyTieredLayout, type TieredLayoutNode } from "./tiered.ts";
import { computeTieredLayoutHints } from "../domain/layoutHints.ts";

type FixtureDevice = {
  id: string;
  name?: string;
  role?: string;
  site?: string;
  room_id?: string;
};

type FixtureConnection = {
  id: string;
  from: { deviceId: string };
  to: { deviceId: string };
};

const loadTieredLayout = async (
  networkId: string,
  crossMinimize = false,
) => {
  const devices = JSON.parse(
    await Deno.readTextFile(`data/networks/${networkId}/devices.json`),
  ) as FixtureDevice[];
  const connections = JSON.parse(
    await Deno.readTextFile(`data/networks/${networkId}/connections.json`),
  ) as FixtureConnection[];

  const nodes: TieredLayoutNode[] = devices.map((device) => ({
    ...device,
    ...computeTieredLayoutHints(device),
  }));
  const links = connections.map((connection) => ({
    id: connection.id,
    source: connection.from.deviceId,
    target: connection.to.deviceId,
  }));

  applyTieredLayout({
    simulation: { stop() {} },
    d3: null,
    nodes,
    links,
    width: 1200,
    height: 720,
    crossMinimize,
  });

  return nodes;
};

Deno.test("tiered layout: metro ring separates POPs from customers", async () => {
  for (const crossMinimize of [false, true]) {
    const nodes = await loadTieredLayout("metro-ring", crossMinimize);
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const pop7 = byId.get("pop-7");
    const custE = byId.get("cust-e");

    assert(pop7);
    assert(custE);
    assertEquals(pop7.__tierIndex, 1);
    assertEquals(custE.__tierIndex, 6);
    assert(Number(custE.y) > Number(pop7.y));

    const edgeXs = nodes
      .filter((node) => node.__tierIndex === 1)
      .map((node) => Math.round(Number(node.x)));
    const customerXs = nodes
      .filter((node) => node.__tierIndex === 6)
      .map((node) => Math.round(Number(node.x)));

    assertEquals(new Set(edgeXs).size, edgeXs.length);
    assertEquals(new Set(customerXs).size, customerXs.length);
  }
});

Deno.test("tiered layout: campus access points do not share access-switch tier", async () => {
  for (const crossMinimize of [false, true]) {
    const nodes = await loadTieredLayout("campus", crossMinimize);
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const access = byId.get("bldg-a-acc-1");
    const ap = byId.get("bldg-a-ap-1");

    assert(access);
    assert(ap);
    assertEquals(access.__tierIndex, 4);
    assertEquals(ap.__tierIndex, 6);
    assert(Number(ap.y) > Number(access.y));
  }
});
