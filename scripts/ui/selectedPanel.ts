import { typeColor } from "../lib/colors.ts";
import type { Dispatch, State } from "../app/state.ts";
import { getSelectedDevices } from "../app/state.ts";
import { CUSTOM_NETWORK_ID } from "../app/customTopology.ts";
import {
  DEVICE_KIND_ACCESS_POINT,
  DEVICE_KIND_ROUTER,
  DEVICE_KIND_SERVER,
  DEVICE_KIND_SWITCH,
  DEVICE_KIND_UNKNOWN,
  inferDeviceKindFromType,
} from "../domain/deviceKind.ts";
import {
  GROUP_BACKGROUND_COLOR_OPTIONS,
  GROUP_LAYOUT_OPTIONS,
  normalizeGroupBackgroundColor,
  normalizeGroupLayout,
} from "../domain/groupStyles.ts";

const PLACEHOLDER_THUMB =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

const clearChildren = (el: Element) => {
  while (el.firstChild) el.removeChild(el.firstChild);
};

type DeviceTypeChoice = {
  slug: string;
  label: string;
  searchText: string;
  kind: number;
  portSummary: string;
};

const TYPE_KIND_ORDER = [
  DEVICE_KIND_SWITCH,
  DEVICE_KIND_ROUTER,
  DEVICE_KIND_SERVER,
  DEVICE_KIND_ACCESS_POINT,
  DEVICE_KIND_UNKNOWN,
];

const TYPE_KIND_LABEL = new Map<number, string>([
  [DEVICE_KIND_SWITCH, "Switches"],
  [DEVICE_KIND_ROUTER, "Routers"],
  [DEVICE_KIND_SERVER, "Servers"],
  [DEVICE_KIND_ACCESS_POINT, "Access points"],
  [DEVICE_KIND_UNKNOWN, "Other"],
]);

const DEVICE_KIND_LABEL = new Map<number, string>([
  [DEVICE_KIND_SWITCH, "Switch"],
  [DEVICE_KIND_ROUTER, "Router"],
  [DEVICE_KIND_SERVER, "Server"],
  [DEVICE_KIND_ACCESS_POINT, "Access point"],
  [DEVICE_KIND_UNKNOWN, "Other"],
]);

const PORT_LABEL_BY_INTERFACE_TYPE = new Map<string, string>([
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

const hasModernPorts = (
  ports: Array<{
    interfaceType?: string;
    mgmtOnly?: boolean;
  }>,
): boolean => {
  if (!Array.isArray(ports) || !ports.length) return false;
  return ports.some((port) =>
    !port.mgmtOnly &&
    typeof port.interfaceType === "string" &&
    MODERN_INTERFACE_TYPES.has(port.interfaceType)
  );
};

const hasTypeImage = (
  deviceType: { thumbPng?: string; thumbJpg?: string } | undefined,
): boolean => {
  if (!deviceType || typeof deviceType !== "object") return false;
  const thumbPng = typeof deviceType.thumbPng === "string"
    ? deviceType.thumbPng.trim()
    : "";
  const thumbJpg = typeof deviceType.thumbJpg === "string"
    ? deviceType.thumbJpg.trim()
    : "";
  return thumbPng.length > 0 || thumbJpg.length > 0;
};

const summarizePortProfile = (
  ports: Array<{
    interfaceType?: string;
    type?: string;
    mgmtOnly?: boolean;
  }>,
): string => {
  if (!Array.isArray(ports) || ports.length === 0) return "No port data";

  const nonMgmt = ports.filter((port) => !port.mgmtOnly);
  if (!nonMgmt.length) return "No usable network ports";
  const source = nonMgmt;

  const counts = source.reduce((map, port) => {
    const normalized = typeof port.interfaceType === "string"
      ? PORT_LABEL_BY_INTERFACE_TYPE.get(port.interfaceType)
      : undefined;
    let key = normalized;
    if (!key && typeof port.type === "string" && port.type.trim()) {
      key = port.type.trim();
    }
    if (!key) key = "Other";
    map.set(key, (map.get(key) ?? 0) + 1);
    return map;
  }, new Map<string, number>());

  const top = Array.from(counts.entries())
    .sort((left, right) =>
      right[1] - left[1] || left[0].localeCompare(right[0])
    )
    .slice(0, 3)
    .map(([kind, count]) => `${count} ${kind}`);

  return top.join(", ");
};

export function createSelectedPanel(
  {
    selectedDevicesEl,
    selectedOverlay: _selectedOverlay,
    dispatch,
    onRenameDevice,
    onChangeDeviceType,
    onUpdateDeviceProperties,
    onDeleteDevice,
  }: {
    selectedDevicesEl: HTMLElement;
    selectedOverlay: HTMLElement | null;
    dispatch: Dispatch;
    onRenameDevice: (deviceId: string, nextName: string) => void;
    onChangeDeviceType: (deviceId: string, nextDeviceTypeSlug: string) => void;
    onUpdateDeviceProperties: (
      deviceId: string,
      propertiesJsonText: string,
    ) => void;
    onDeleteDevice: (deviceId: string) => void;
  },
) {
  let lastThumbWired = 0;

  const wireThumbFallbacks = () => {
    // Ensure we don't wire too aggressively if repeated renders happen.
    const now = Date.now();
    if (now - lastThumbWired < 10) return;
    lastThumbWired = now;

    selectedDevicesEl.querySelectorAll<HTMLImageElement>("img.thumb").forEach(
      (img) => {
        if ((img as unknown as { __wired?: boolean }).__wired) return;
        (img as unknown as { __wired?: boolean }).__wired = true;
        img.addEventListener(
          "error",
          () => {
            const fallback = img.getAttribute("data-fallback") ||
              PLACEHOLDER_THUMB;
            if (img.src !== fallback) {
              img.src = fallback;
              return;
            }
            // If even fallback fails (shouldn't), ensure we stabilize on placeholder.
            img.src = PLACEHOLDER_THUMB;
          },
          { once: true },
        );
      },
    );
  };

  const render = (state: State) => {
    clearChildren(selectedDevicesEl);
    const selectedList = getSelectedDevices(state);

    if (!selectedList.length) {
      const empty = document.createElement("span");
      empty.className = "status";
      empty.textContent = "No devices selected";
      selectedDevicesEl.appendChild(empty);
      return;
    }

    const allTypeChoices: DeviceTypeChoice[] = Object.keys(state.deviceTypes)
      .flatMap((slug) => {
        const deviceType = state.deviceTypes[slug];
        if (!hasModernPorts(deviceType?.ports ?? [])) return [];
        if (!hasTypeImage(deviceType)) return [];
        const label = `${deviceType?.brand ?? ""} ${deviceType?.model ?? ""}`
          .trim() || slug;
        return [
          {
            slug,
            label,
            searchText: `${slug} ${deviceType?.brand ?? ""} ${
              deviceType?.model ?? ""
            }`.toLowerCase(),
            kind: inferDeviceKindFromType(
              `${slug} ${deviceType?.model ?? ""}`.trim(),
            ),
            portSummary: summarizePortProfile(deviceType?.ports ?? []),
          } satisfies DeviceTypeChoice,
        ];
      })
      .sort((left, right) => left.label.localeCompare(right.label));

    const visibleTypeChoices = (
      query: string,
      selectedSlug?: string,
    ): DeviceTypeChoice[] => {
      const normalizedQuery = query.trim().toLowerCase();

      if (!normalizedQuery) {
        const grouped = TYPE_KIND_ORDER.flatMap((kind) =>
          allTypeChoices.filter((choice) => choice.kind === kind).slice(0, 12)
        );

        const selectedChoice = selectedSlug
          ? allTypeChoices.find((choice) => choice.slug === selectedSlug)
          : undefined;
        if (
          selectedChoice &&
          !grouped.some((choice) => choice.slug === selectedChoice.slug)
        ) {
          grouped.unshift(selectedChoice);
        }

        return grouped;
      }

      const matches = allTypeChoices.filter((choice) =>
        choice.searchText.includes(normalizedQuery)
      );
      const displayed = matches.slice(0, 180);
      const selectedChoice = selectedSlug
        ? allTypeChoices.find((choice) => choice.slug === selectedSlug)
        : undefined;
      if (
        selectedChoice &&
        !displayed.some((choice) => choice.slug === selectedChoice.slug)
      ) {
        displayed.unshift(selectedChoice);
      }

      return displayed;
    };

    selectedList.forEach((d) => {
      const card = document.createElement("div");
      card.className = "selected-card";
      const isCustomMode = state.networkId === CUSTOM_NETWORK_ID;

      const makeThumb = () => {
        const img = document.createElement("img");
        img.className = "thumb";
        img.alt = "";
        img.loading = "lazy";

        const src = d.thumbPng ?? d.thumbJpg ?? PLACEHOLDER_THUMB;
        const fallback = d.thumbJpg ?? PLACEHOLDER_THUMB;
        img.src = src;
        img.setAttribute("data-fallback", fallback);
        return img;
      };

      card.appendChild(makeThumb());

      const content = document.createElement("div");
      content.className = "content";

      const title = document.createElement("div");
      title.className = "title";

      const dot = document.createElement("span");
      dot.style.width = "10px";
      dot.style.height = "10px";
      dot.style.borderRadius = "50%";
      dot.style.background = typeColor(d.deviceKind);
      dot.style.display = "inline-block";

      const titleText = document.createElement("span");
      titleText.textContent = d.name;

      title.appendChild(dot);
      title.appendChild(document.createTextNode(" "));
      title.appendChild(titleText);

      const meta = document.createElement("div");
      meta.className = "meta";
      const normalizedName = typeof d.name === "string"
        ? d.name.trim().toLowerCase()
        : "";
      const modelText = typeof d.model === "string" ? d.model.trim() : "";
      const showModel = modelText
        ? !normalizedName.includes(modelText.toLowerCase())
        : false;
      const brandModel = [
        typeof d.brand === "string" ? d.brand.trim() : "",
        showModel ? modelText : "",
      ].filter((v) => Boolean(v)).join(" • ");
      meta.textContent = brandModel || modelText || d.deviceTypeSlug || d.type;

      const metaDetail = document.createElement("div");
      metaDetail.className = "meta-detail";
      const deviceKindLabel = DEVICE_KIND_LABEL.get(d.deviceKind) ?? "Device";
      metaDetail.textContent = `${deviceKindLabel} • ${
        summarizePortProfile(d.ports ?? [])
      }`;

      const typePill = document.createElement("div");
      typePill.className = "type-pill";
      const typePillText = typeof d.deviceTypeSlug === "string" &&
          d.deviceTypeSlug.trim()
        ? d.deviceTypeSlug.trim()
        : d.type;
      typePill.textContent = typePillText;

      content.appendChild(title);
      content.appendChild(meta);
      content.appendChild(metaDetail);
      content.appendChild(typePill);

      if (isCustomMode) {
        const isContainer = d.isContainer === true;
        const editableProperties = (() => {
          const copy: Record<string, unknown> = { ...d };
          const stripKeys = [
            "id",
            "name",
            "type",
            "deviceKind",
            "deviceTypeSlug",
            "brand",
            "model",
            "ports",
            "thumbPng",
            "thumbJpg",
            "partNumber",
            "layoutTierIndexHint",
            "layoutSiteRank",
            "layoutStableKey",
          ];
          stripKeys.forEach((key) => delete copy[key]);
          return copy;
        })();

        const applyEditablePropertiesPatch = (
          patch: Record<string, unknown>,
        ) => {
          Object.assign(editableProperties, patch);
          onUpdateDeviceProperties(d.id, JSON.stringify(editableProperties));
        };

        if (!isContainer) {
          const typeRow = document.createElement("div");
          typeRow.className = "selected-edit-row selected-type-row";

          const typeControls = document.createElement("div");
          typeControls.className = "selected-type-controls";

          const typeSearchRow = document.createElement("div");
          typeSearchRow.className = "selected-type-search-row";

          const typeSearchInput = document.createElement("input");
          typeSearchInput.type = "search";
          typeSearchInput.className = "selected-type-search";
          typeSearchInput.placeholder = "Filter full catalog…";
          typeSearchInput.hidden = true;
          typeSearchInput.setAttribute(
            "aria-label",
            `Filter device type options for ${d.name}`,
          );

          const toggleTypeSearchBtn = document.createElement("button");
          toggleTypeSearchBtn.type = "button";
          toggleTypeSearchBtn.className = "selected-action";
          toggleTypeSearchBtn.textContent = "Filter";
          toggleTypeSearchBtn.setAttribute(
            "aria-label",
            `Toggle full catalog filter for ${d.name}`,
          );

          const typeSelect = document.createElement("select");
          typeSelect.className = "selected-type-select";
          typeSelect.setAttribute("aria-label", `Device type for ${d.name}`);

          const typeDetail = document.createElement("div");
          typeDetail.className = "selected-type-detail";
          let isTypeSearchOpen = false;
          let pendingSelectedSlug = d.deviceTypeSlug ?? "";

          const syncTypeDetail = () => {
            const selectedChoice = allTypeChoices.find((choice) =>
              choice.slug === pendingSelectedSlug
            );
            if (!selectedChoice) {
              typeDetail.textContent = "No matching type selected.";
              return;
            }
            const kindLabel = TYPE_KIND_LABEL.get(selectedChoice.kind) ??
              "Other";
            typeDetail.textContent =
              `${kindLabel} • ${selectedChoice.portSummary}`;
          };

          const renderTypeSelectOptions = () => {
            clearChildren(typeSelect);

            const choices = visibleTypeChoices(
              isTypeSearchOpen ? typeSearchInput.value : "",
              pendingSelectedSlug,
            );

            const optionsByKind = choices.reduce((map, choice) => {
              const list = map.get(choice.kind);
              if (list) {
                list.push(choice);
              } else {
                map.set(choice.kind, [choice]);
              }
              return map;
            }, new Map<number, DeviceTypeChoice[]>());

            TYPE_KIND_ORDER.forEach((kind) => {
              const kindChoices = optionsByKind.get(kind) ?? [];
              if (!kindChoices.length) return;

              const group = document.createElement("optgroup");
              group.label = TYPE_KIND_LABEL.get(kind) ?? "Other";
              kindChoices.forEach((choice) => {
                const option = document.createElement("option");
                option.value = choice.slug;
                option.textContent = `${choice.label} (${choice.portSummary})`;
                if (choice.slug === pendingSelectedSlug) option.selected = true;
                group.appendChild(option);
              });
              typeSelect.appendChild(group);
            });

            if (
              pendingSelectedSlug &&
              Array.from(typeSelect.options).some((option) =>
                option.value === pendingSelectedSlug
              )
            ) {
              typeSelect.value = pendingSelectedSlug;
            } else if (typeSelect.options.length > 0) {
              typeSelect.value = typeSelect.options[0].value;
              pendingSelectedSlug = typeSelect.value;
            } else {
              pendingSelectedSlug = "";
            }
            syncTypeDetail();
          };

          renderTypeSelectOptions();
          typeSearchInput.addEventListener("input", renderTypeSelectOptions);
          toggleTypeSearchBtn.addEventListener("click", () => {
            isTypeSearchOpen = !isTypeSearchOpen;
            typeSearchInput.hidden = !isTypeSearchOpen;
            toggleTypeSearchBtn.classList.toggle("is-active", isTypeSearchOpen);
            if (!isTypeSearchOpen) {
              typeSearchInput.value = "";
            }
            renderTypeSelectOptions();
            if (isTypeSearchOpen) typeSearchInput.focus();
          });
          typeSelect.addEventListener("change", () => {
            pendingSelectedSlug = typeSelect.value;
            syncTypeDetail();
          });

          const applyTypeBtn = document.createElement("button");
          applyTypeBtn.type = "button";
          applyTypeBtn.className = "selected-action";
          applyTypeBtn.textContent = "Apply type";
          applyTypeBtn.addEventListener("click", () => {
            onChangeDeviceType(d.id, pendingSelectedSlug || typeSelect.value);
          });

          typeSearchRow.appendChild(typeSearchInput);
          typeSearchRow.appendChild(toggleTypeSearchBtn);
          typeControls.appendChild(typeSearchRow);
          typeControls.appendChild(typeSelect);
          typeControls.appendChild(typeDetail);
          typeRow.appendChild(typeControls);
          typeRow.appendChild(applyTypeBtn);
          content.appendChild(typeRow);
        } else {
          const groupSettings = document.createElement("div");
          groupSettings.className = "selected-group-settings";

          const groupLayoutField = document.createElement("label");
          groupLayoutField.className = "selected-group-field";
          const groupLayoutLabel = document.createElement("span");
          groupLayoutLabel.textContent = "Layout";
          const groupLayoutSelect = document.createElement("select");
          groupLayoutSelect.className = "selected-type-select";
          groupLayoutSelect.setAttribute(
            "aria-label",
            `Group layout for ${d.name}`,
          );
          GROUP_LAYOUT_OPTIONS.forEach((option) => {
            const element = document.createElement("option");
            element.value = option.id;
            element.textContent = option.label;
            groupLayoutSelect.appendChild(element);
          });

          const groupColorField = document.createElement("label");
          groupColorField.className = "selected-group-field";
          const groupColorLabel = document.createElement("span");
          groupColorLabel.textContent = "Background";
          const groupColorSwatches = document.createElement("div");
          groupColorSwatches.className = "selected-group-swatches";
          groupColorSwatches.setAttribute(
            "aria-label",
            `Group background color for ${d.name}`,
          );

          let pendingGroupLayout = normalizeGroupLayout(
            editableProperties.groupLayout,
          );
          let pendingGroupBackgroundColor = normalizeGroupBackgroundColor(
            editableProperties.groupBackgroundColor,
          );
          groupLayoutSelect.value = pendingGroupLayout;

          const applyGroupStyle = () => {
            applyEditablePropertiesPatch({
              groupLayout: pendingGroupLayout,
              groupBackgroundColor: pendingGroupBackgroundColor,
            });
          };

          const renderGroupColorSwatches = () => {
            clearChildren(groupColorSwatches);
            GROUP_BACKGROUND_COLOR_OPTIONS.forEach((option) => {
              const button = document.createElement("button");
              button.type = "button";
              button.className = "selected-group-swatch";
              button.style.background = option.hex;
              button.title = `${option.label} (${option.hex.toUpperCase()})`;
              button.setAttribute(
                "aria-label",
                `${option.label} background`,
              );
              button.classList.toggle(
                "is-selected",
                option.id === pendingGroupBackgroundColor,
              );
              button.addEventListener("click", () => {
                pendingGroupBackgroundColor = normalizeGroupBackgroundColor(
                  option.id,
                );
                renderGroupColorSwatches();
                applyGroupStyle();
              });
              groupColorSwatches.appendChild(button);
            });
          };

          groupLayoutSelect.addEventListener("change", () => {
            pendingGroupLayout = normalizeGroupLayout(groupLayoutSelect.value);
            applyGroupStyle();
          });
          renderGroupColorSwatches();

          groupLayoutField.appendChild(groupLayoutLabel);
          groupLayoutField.appendChild(groupLayoutSelect);
          groupColorField.appendChild(groupColorLabel);
          groupColorField.appendChild(groupColorSwatches);
          groupSettings.appendChild(groupLayoutField);
          groupSettings.appendChild(groupColorField);
          content.appendChild(groupSettings);
        }

        const editRow = document.createElement("div");
        editRow.className = "selected-edit-row";

        const nameInput = document.createElement("input");
        nameInput.type = "text";
        nameInput.className = "selected-name-input";
        nameInput.value = d.name;
        nameInput.setAttribute("aria-label", `Rename ${d.name}`);

        const saveBtn = document.createElement("button");
        saveBtn.type = "button";
        saveBtn.className = "selected-action";
        saveBtn.textContent = "Rename";
        saveBtn.addEventListener("click", () => {
          onRenameDevice(d.id, nameInput.value);
        });

        nameInput.addEventListener("keydown", (event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          onRenameDevice(d.id, nameInput.value);
        });

        const deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "selected-action danger";
        deleteBtn.textContent = "Delete";
        deleteBtn.addEventListener("click", () => {
          onDeleteDevice(d.id);
        });

        editRow.appendChild(nameInput);
        editRow.appendChild(saveBtn);
        editRow.appendChild(deleteBtn);

        const advancedDetails = document.createElement("details");
        advancedDetails.className = "selected-advanced";

        const advancedSummary = document.createElement("summary");
        advancedSummary.className = "selected-advanced-summary";
        advancedSummary.textContent = "{}";
        advancedSummary.title = "Edit JSON properties";
        advancedSummary.setAttribute(
          "aria-label",
          `Edit JSON properties for ${d.name}`,
        );
        advancedDetails.appendChild(advancedSummary);

        const advancedBody = document.createElement("div");
        advancedBody.className = "selected-advanced-body";

        const propertiesLabel = document.createElement("div");
        propertiesLabel.className = "selected-properties-label";
        propertiesLabel.textContent = "Properties (JSON object)";

        const propertiesInput = document.createElement("textarea");
        propertiesInput.className = "selected-properties-input";
        propertiesInput.value = JSON.stringify(editableProperties, null, 2);
        propertiesInput.setAttribute(
          "aria-label",
          `Custom properties JSON for ${d.name}`,
        );

        const propertiesActions = document.createElement("div");
        propertiesActions.className = "selected-properties-actions";

        const savePropertiesBtn = document.createElement("button");
        savePropertiesBtn.type = "button";
        savePropertiesBtn.className = "selected-action";
        savePropertiesBtn.textContent = "Save properties";
        savePropertiesBtn.addEventListener("click", () => {
          onUpdateDeviceProperties(d.id, propertiesInput.value);
        });

        propertiesActions.appendChild(savePropertiesBtn);
        advancedBody.appendChild(propertiesLabel);
        advancedBody.appendChild(propertiesInput);
        advancedBody.appendChild(propertiesActions);
        advancedDetails.appendChild(advancedBody);

        content.appendChild(editRow);
        content.appendChild(advancedDetails);
      }

      const removeBtn = document.createElement("button");
      removeBtn.className = "remove";
      removeBtn.type = "button";
      removeBtn.title = "Remove";
      removeBtn.setAttribute("aria-label", "Remove");
      removeBtn.textContent = "×";
      removeBtn.dataset.id = d.id;
      removeBtn.addEventListener(
        "click",
        () => dispatch({ type: "toggleSelect", id: d.id }),
      );

      card.appendChild(content);
      card.appendChild(removeBtn);
      selectedDevicesEl.appendChild(card);
    });

    wireThumbFallbacks();
  };

  return { render };
}
