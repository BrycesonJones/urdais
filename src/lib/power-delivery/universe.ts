/** PD-2 physical-grid identity. Never derive this from UEPI or frontend catalog data. */

export const POWER_DELIVERY_UNIVERSE_SLUG = "seven_organized_us_wholesale_markets" as const;

export const PD2_V1_AREAS = [
  { id: "93000000-0000-4000-8200-000000000001", slug: "ercot", name: "ERCOT", eiaBaCode: "ERCO", timezone: "America/Chicago" },
  { id: "93000000-0000-4000-8200-000000000002", slug: "pjm", name: "PJM", eiaBaCode: "PJM", timezone: "America/New_York" },
  { id: "93000000-0000-4000-8200-000000000003", slug: "miso", name: "MISO", eiaBaCode: "MISO", timezone: "America/Chicago" },
  { id: "93000000-0000-4000-8200-000000000004", slug: "spp", name: "SPP", eiaBaCode: "SWPP", timezone: "America/Chicago" },
  { id: "93000000-0000-4000-8200-000000000005", slug: "caiso", name: "CAISO", eiaBaCode: "CISO", timezone: "America/Los_Angeles" },
  { id: "93000000-0000-4000-8200-000000000006", slug: "nyiso", name: "NYISO", eiaBaCode: "NYIS", timezone: "America/New_York" },
  { id: "93000000-0000-4000-8200-000000000007", slug: "iso-ne", name: "ISO-NE", eiaBaCode: "ISNE", timezone: "America/New_York" },
] as const;

export type PowerDeliveryAreaId = (typeof PD2_V1_AREAS)[number]["id"];
export type EiaBalancingAuthorityCode = (typeof PD2_V1_AREAS)[number]["eiaBaCode"];

export const PD2_V1_AREA_BY_EIA_CODE = new Map(PD2_V1_AREAS.map((area) => [area.eiaBaCode, area]));
