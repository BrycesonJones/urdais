/** Stable analytics values shown on the optional audience-classification step. */
export const AUDIENCE_ROLES = [
  { value: "independent_researcher_analyst", label: "Independent Researcher / Analyst" },
  { value: "quantitative_researcher_trader", label: "Quantitative Researcher / Trader" },
  { value: "frontier_ai_lab", label: "Frontier AI Lab" },
  { value: "ai_systems_software_company", label: "AI Systems / Software Development Company" },
  { value: "academic_university", label: "Academic / University" },
  { value: "investor_asset_manager", label: "Investor / Asset Manager" },
  { value: "data_center_compute_infrastructure_operator", label: "Data Center / Compute Infrastructure Operator" },
  { value: "energy_power_market_professional", label: "Energy / Power Market Professional" },
  { value: "semiconductor_hardware_company", label: "Semiconductor / Hardware Company" },
  { value: "consultant_advisory_firm", label: "Consultant / Advisory Firm" },
  { value: "other", label: "Other" },
] as const;

export type AudienceRole = (typeof AUDIENCE_ROLES)[number]["value"];

const ALLOWED = new Set<string>(AUDIENCE_ROLES.map(({ value }) => value));

export function isAudienceRole(value: unknown): value is AudienceRole {
  return typeof value === "string" && ALLOWED.has(value);
}

