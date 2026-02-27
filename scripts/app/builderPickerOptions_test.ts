import { assert, assertEquals } from "@std/assert";
import type { DeviceType } from "../domain/types.ts";
import {
  buildBuilderDeviceTypeOptions,
  BUILDER_GROUP_SLUG,
} from "./builderPickerOptions.ts";

const mkDeviceType = (
  slug: string,
  brand: string,
  model: string,
  ports: DeviceType["ports"] = [{ id: "p1", interfaceType: "eth-1g" }],
): DeviceType => ({
  id: slug,
  slug,
  brand,
  model,
  ports,
  thumbPng: "https://example.com/thumb.png",
});

Deno.test(
  "builderPickerOptions: exposes one representative option per device kind plus group tile",
  () => {
    const deviceTypes: Record<string, DeviceType> = {
      "switch/cisco-c9300-48t": mkDeviceType(
        "switch/cisco-c9300-48t",
        "Cisco",
        "C9300-48T",
      ),
      "switch/ubnt-usw-48": mkDeviceType(
        "switch/ubnt-usw-48",
        "Ubiquiti",
        "USW-48",
      ),
      "router/mx204": mkDeviceType("router/mx204", "Juniper", "MX204"),
      "server/r740": mkDeviceType("server/r740", "Dell", "PowerEdge R740"),
      "ap/u6-lr": mkDeviceType("ap/u6-lr", "Ubiquiti", "U6-LR"),
      "sensor/custom": mkDeviceType("sensor/custom", "Acme", "Sensor Node"),
    };

    const options = buildBuilderDeviceTypeOptions({
      deviceTypes,
      recentDeviceTypeSlugs: [],
      frequentDeviceTypeSlugs: [
        "switch/cisco-c9300-48t",
        "router/mx204",
        "server/r740",
        "ap/u6-lr",
        "sensor/custom",
      ],
      query: "",
    });

    assertEquals(options.map((option) => option.label), [
      "Switch",
      "Router",
      "Server",
      "Access point",
      "Other",
      "Group",
    ]);
    assertEquals(options[0].slug, "switch/cisco-c9300-48t");
    assertEquals(options[5].slug, BUILDER_GROUP_SLUG);
    assert(
      options.slice(0, 5).every((option) => option.groupId === "device-kinds"),
    );
    assertEquals(options[5].groupId, "canvas-elements");
  },
);

Deno.test(
  "builderPickerOptions: recent representative is preferred over frequent for each kind",
  () => {
    const deviceTypes: Record<string, DeviceType> = {
      "switch/a": mkDeviceType("switch/a", "Acme", "Switch A"),
      "switch/b": mkDeviceType("switch/b", "Acme", "Switch B"),
      "router/r1": mkDeviceType("router/r1", "Acme", "Router 1"),
    };

    const options = buildBuilderDeviceTypeOptions({
      deviceTypes,
      recentDeviceTypeSlugs: ["switch/b"],
      frequentDeviceTypeSlugs: ["switch/a", "router/r1"],
      query: "",
    });

    const switchOption = options.find((option) => option.label === "Switch");
    assertEquals(switchOption?.slug, "switch/b");
  },
);

Deno.test(
  "builderPickerOptions: shortlistByKind overrides auto-picked representative",
  () => {
    const deviceTypes: Record<string, DeviceType> = {
      "switch/a": mkDeviceType("switch/a", "Acme", "Switch A"),
      "switch/b": mkDeviceType("switch/b", "Acme", "Switch B"),
      "router/r1": mkDeviceType("router/r1", "Acme", "Router 1"),
      "server/s1": mkDeviceType("server/s1", "Acme", "Server 1"),
      "ap/ap1": mkDeviceType("ap/ap1", "Acme", "AP 1"),
    };

    const options = buildBuilderDeviceTypeOptions({
      deviceTypes,
      recentDeviceTypeSlugs: ["switch/b"],
      frequentDeviceTypeSlugs: ["switch/b"],
      shortlistByKind: {
        "2": "switch/a",
      },
      query: "",
    });

    const switchOption = options.find((option) => option.label === "Switch");
    assertEquals(switchOption?.slug, "switch/a");
  },
);

Deno.test(
  "builderPickerOptions: query filters the simplified palette options",
  () => {
    const deviceTypes: Record<string, DeviceType> = {
      "switch/cisco-c9300-48t": mkDeviceType(
        "switch/cisco-c9300-48t",
        "Cisco",
        "C9300-48T",
      ),
      "router/mx204": mkDeviceType("router/mx204", "Juniper", "MX204"),
    };

    const options = buildBuilderDeviceTypeOptions({
      deviceTypes,
      recentDeviceTypeSlugs: [],
      frequentDeviceTypeSlugs: [],
      query: "group",
    });

    assertEquals(options.length, 1);
    assertEquals(options[0].slug, BUILDER_GROUP_SLUG);
  },
);

Deno.test(
  "builderPickerOptions: core kind defaults prefer a shared ethernet port type",
  () => {
    const deviceTypes: Record<string, DeviceType> = {
      "switch/x10g": mkDeviceType("switch/x10g", "Acme", "Switch 10G", [
        { id: "p1", interfaceType: "eth-10g" },
      ]),
      "switch/x1g": mkDeviceType("switch/x1g", "Acme", "Switch 1G", [
        { id: "p1", interfaceType: "eth-1g" },
      ]),
      "router/r1": mkDeviceType("router/r1", "Acme", "Router 1G", [
        { id: "p1", interfaceType: "eth-1g" },
      ]),
      "server/s1": mkDeviceType("server/s1", "Acme", "Server 1G", [
        { id: "p1", interfaceType: "eth-1g" },
      ]),
      "ap/a1": mkDeviceType("ap/a1", "Acme", "AP 1G", [
        { id: "p1", interfaceType: "eth-1g" },
        { id: "wifi", interfaceType: "wifi" },
      ]),
    };

    const options = buildBuilderDeviceTypeOptions({
      deviceTypes,
      recentDeviceTypeSlugs: [],
      frequentDeviceTypeSlugs: ["switch/x10g"],
      query: "",
    });

    const switchOption = options.find((option) => option.label === "Switch");
    assertEquals(switchOption?.slug, "switch/x1g");
  },
);

Deno.test(
  "builderPickerOptions: excludes legacy 100M-only device types",
  () => {
    const deviceTypes: Record<string, DeviceType> = {
      "switch/legacy": mkDeviceType("switch/legacy", "Acme", "Legacy 100M", [
        { id: "p1", interfaceType: "eth-100m" },
      ]),
      "switch/modern": mkDeviceType("switch/modern", "Acme", "Modern 1G", [
        { id: "p1", interfaceType: "eth-1g" },
      ]),
      "router/r1": mkDeviceType("router/r1", "Acme", "Router 1G", [
        { id: "p1", interfaceType: "eth-1g" },
      ]),
      "server/s1": mkDeviceType("server/s1", "Acme", "Server 1G", [
        { id: "p1", interfaceType: "eth-1g" },
      ]),
      "ap/a1": mkDeviceType("ap/a1", "Acme", "AP 1G", [
        { id: "p1", interfaceType: "eth-1g" },
        { id: "w1", interfaceType: "wifi" },
      ]),
    };

    const options = buildBuilderDeviceTypeOptions({
      deviceTypes,
      recentDeviceTypeSlugs: [],
      frequentDeviceTypeSlugs: [],
      query: "",
    });

    const switchOption = options.find((option) => option.label === "Switch");
    assertEquals(switchOption?.slug, "switch/modern");
  },
);

Deno.test(
  "builderPickerOptions: excludes device types without images",
  () => {
    const withImage = mkDeviceType("switch/with-image", "Acme", "Switch 1G", [
      { id: "p1", interfaceType: "eth-1g" },
    ]);
    const withoutImage = {
      ...mkDeviceType("switch/no-image", "Acme", "No Image 1G", [
        { id: "p1", interfaceType: "eth-1g" },
      ]),
    };
    delete withoutImage.thumbPng;
    delete withoutImage.thumbJpg;

    const deviceTypes: Record<string, DeviceType> = {
      "switch/with-image": withImage,
      "switch/no-image": withoutImage,
      "router/r1": mkDeviceType("router/r1", "Acme", "Router 1G", [
        { id: "p1", interfaceType: "eth-1g" },
      ]),
      "server/s1": mkDeviceType("server/s1", "Acme", "Server 1G", [
        { id: "p1", interfaceType: "eth-1g" },
      ]),
      "ap/a1": mkDeviceType("ap/a1", "Acme", "AP 1G", [
        { id: "p1", interfaceType: "eth-1g" },
        { id: "w1", interfaceType: "wifi" },
      ]),
    };

    const options = buildBuilderDeviceTypeOptions({
      deviceTypes,
      recentDeviceTypeSlugs: [],
      frequentDeviceTypeSlugs: [],
      query: "",
    });

    const switchOption = options.find((option) => option.label === "Switch");
    assertEquals(switchOption?.slug, "switch/with-image");
    assert(!options.some((option) => option.slug === "switch/no-image"));
  },
);
