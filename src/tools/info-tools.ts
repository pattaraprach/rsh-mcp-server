import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { HostConnectClient, formatResponse, optionalElement, formatOptCode } from "../services/hostconnect-client.js";

const VALID_INFO_CODES = new Set(['G','A','I','E','R','S','D','B','N','T','F','M','L','P','V']);
const RATE_TYPE_CODES = ['R','S','D'];
const S_EXCLUDES = ['A','E','I'];

function refineInfoCombination(val: string, ctx: z.RefinementCtx): void {
  if (val.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "info must not be empty." });
    return;
  }
  const duplicates = [...val].filter((ch, i) => val.indexOf(ch) !== i);
  if (duplicates.length > 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `No duplicate codes allowed. Duplicate(s): ${[...new Set(duplicates)].join(", ")}.` });
    return;
  }
  const invalid = [...val].filter(ch => !VALID_INFO_CODES.has(ch));
  if (invalid.length > 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unknown code(s): ${invalid.join(", ")}. Valid codes: G A I E R S D B N T F M L P V.` });
    return;
  }
  const rateTypes = RATE_TYPE_CODES.filter(c => val.includes(c));
  if (rateTypes.length > 1) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Only one rate type allowed per call. Found: ${rateTypes.join(", ")}. Choose one of R, S, or D.` });
    return;
  }
  const sConflicts = S_EXCLUDES.filter(c => val.includes(c));
  if (val.includes('S') && sConflicts.length > 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `S (stay pricing) cannot combine with availability codes. Remove: ${sConflicts.join(", ")}.` });
  }
}

export function registerInfoTools(server: McpServer, client: HostConnectClient): void {

  // ── PING ──────────────────────────────────────────────────────────────────
  server.registerTool(
    "hostconnect_ping",
    {
      title: "Ping HostConnect",
      description: `Test connectivity to the Tourplan HostConnect server.

Returns "OK" if the server is reachable and the credentials are valid.

Returns:
  JSON with a Status field containing "OK" on success, or an error message.`,
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      const xml = client.buildRequest(`  <PingRequest/>`);
      const result = await client.post(xml);
      return { content: [{ type: "text", text: formatResponse(result) }] };
    }
  );

  // ── AGENT INFO ────────────────────────────────────────────────────────────
  server.registerTool(
    "hostconnect_agent_info",
    {
      title: "Get Agent Info",
      description: `Retrieve information about the logged-in agent from Tourplan HostConnect.

Returns agent details including name, contact info, currency settings, account info, user-defined text fields, and optionally the last receipt.

Args:
  - returnAccountInfo (boolean): Whether to include account balance info. Default: false.
  - returnLastReceipt (boolean): Whether to include the last payment receipt. Default: false.

Returns:
  JSON with agent details including: AgentID, Name, Address, Email, DefaultCurrency, CurrencySubCode, UDText1-20, and optionally AccountInfo and LastReceipt.`,
      inputSchema: z.object({
        returnAccountInfo: z.boolean().default(false).describe("Include account balance information"),
        returnLastReceipt: z.boolean().default(false).describe("Include last payment receipt details"),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ returnAccountInfo, returnLastReceipt }) => {
      const inner = [
        `<AgentInfoRequest>`,
        client.authXml(),
        returnAccountInfo ? `  <ReturnAccountInfo>Y</ReturnAccountInfo>` : "",
        returnLastReceipt ? `  <ReturnLastReceipt>Y</ReturnLastReceipt>` : "",
        `</AgentInfoRequest>`,
      ].filter(Boolean).join("\n");

      const xml = client.buildRequest(inner);
      const result = await client.post(xml);
      return { content: [{ type: "text", text: formatResponse(result) }] };
    }
  );

  // ── OPTION INFO ───────────────────────────────────────────────────────────
  server.registerTool(
    "hostconnect_option_info",
    {
      title: "Search Options / Services",
      description: `Search for available travel service options in Tourplan HostConnect (hotels, tours, transfers, etc.).

This is the primary tool for searching available products. Returns rates, availability, descriptions, and pricing.

**Wildcard/Pattern Search via 'opt':**
The opt field format is: Location(3 chars) + Service(2 chars) + Supplier(6 chars) + OptionCode (up to 6 chars), max 17 chars total.
Use ? as a single-character wildcard anywhere in the pattern. IMPORTANT: Always pad wildcard patterns to the full 17-character maximum, otherwise options with longer codes will be silently missed:
  - 'BKK??????????????' → all Bangkok options (3 + 14 wildcards = 17 chars)
  - 'BKKAC????????????' → all Bangkok accommodation (AC) options (5 + 12 wildcards = 17 chars)
  - 'BKKTARSOBKK??????' → all options for supplier RSOBKK in Bangkok transfers (11 + 6 wildcards = 17 chars)
Short patterns like 'BKKAC???????' (only 12 chars) will silently miss options whose codes are longer than 12 characters.
Trailing characters can be omitted ONLY for exact opt codes (e.g. 'BKKAC' is valid as an exact prefix but not as a wildcard search).

Args:
  - opt (string, max 17): Exact option code OR wildcard pattern using ? (e.g. 'BKKAC????????????' for all Bangkok accommodation — must be padded to 17 chars). Optional.
  - optionNumber (string): Numeric option identifier. Optional.
  - description (string): Partial text to search options by name/description. Optional.
  - supplierName (string): Filter by supplier name. Optional.
  - locationCode (string): 3-char Tourplan location code to filter by location (e.g. "BKK"). Optional.
  - endLocationCode (string): End location for point-to-point services. Optional.
  - info (string): Combined info codes — concatenate letters to retrieve all needed data in one call. E.g. "GR" (description + rates), "GRA" (+ availability), "GRFM" (+ FYIs + amenities). Rules: only one of R/S/D per call; S cannot combine with A/E/I. See inputSchema description for full code list. Optional.
  - dateFrom (string): Start date in YYYY-MM-DD format. Optional.
  - dateTo (string): End date in YYYY-MM-DD format. Optional.
  - scuQty (number): Number of service charge units (nights, days, etc.). Optional.
  - adults (number): Number of adults. Optional.
  - children (number): Number of children. Optional.
  - infants (number): Number of infants. Optional.
  - roomType (string): Room type code. Optional.
  - maxOptions (number): Maximum number of results to return (default 50). Optional.
  - indexFirstOption (number): Pagination: index of first result to return. Optional.
  - priceCode (string): 2-char price code for special pricing. Optional.
  - externalSearchMode (string): "I"=internal only, "E"=external only, "A"=all. Optional.
  - rateId (string): Specific rate ID from a prior OptionInfo call. Optional.

Returns:
  JSON array of matching options with details including: Opt, Description, Supplier, Location, SCU, rates, availability, and notes.`,
      inputSchema: z.object({
        opt: z.string().max(17).optional().describe("Option identifier (Location[3] + Service[2] + Supplier[6] + OptionCode). Supports ? wildcard patterns — MUST be padded to 17 chars to avoid missing options (e.g. 'BKKAC????????????' matches all Bangkok accommodation). Exact codes can be shorter."),
        optionNumber: z.string().optional().describe("Numeric option identifier"),
        description: z.string().optional().describe("Search by product name/description"),
        supplierName: z.string().optional().describe("Filter by supplier name"),
        locationCode: z.string().max(3).optional().describe("3-char location code (e.g. 'AKL')"),
        endLocationCode: z.string().max(3).optional().describe("End location for point-to-point services"),
        info: z.string()
          .superRefine(refineInfoCombination)
          .optional()
          .describe(
            "Info codes to return — combine letters in a single string to retrieve all data in one call.\n" +
            "\n" +
            "Code meanings:\n" +
            "  G = General info (description, supplier, class, pax rules)\n" +
            "  A = Availability\n" +
            "  I = Detailed availability\n" +
            "  E = Full availability\n" +
            "  R = Rates (rate schedule)\n" +
            "  S = Stay pricing and availability\n" +
            "  D = Rate date ranges\n" +
            "  B = Package details\n" +
            "  N = Enquiry notes\n" +
            "  T = Multiple enquiry notes\n" +
            "  F = FYIs\n" +
            "  M = Amenities\n" +
            "  L = Supplier replicated locations (codes only)\n" +
            "  P = Supplier replicated locations with pickup points\n" +
            "  V = Replicated locations encountered in search\n" +
            "\n" +
            "Combination rules (strictly enforced):\n" +
            "  • Only one rate type allowed: R, S, or D — never combine two or more of these\n" +
            "  • If S is included, do not include A, E, or I\n" +
            "  • If omitted, only option identifiers and ValidLocations are returned\n" +
            "\n" +
            "Efficiency examples:\n" +
            "  'GR'   → description + rates (minimum for search + price)\n" +
            "  'GRA'  → description + rates + availability\n" +
            "  'GRFM' → description + rates + FYIs + amenities\n" +
            "  'GS'   → description + stay pricing (no separate availability)\n" +
            "  'GD'   → description + rate date ranges\n" +
            "\n" +
            "Invalid combinations:\n" +
            "  'RS', 'RD', 'SD' → ❌ two rate types\n" +
            "  'SA', 'SE', 'SI' → ❌ S excludes availability codes"
          ),
        dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Start date YYYY-MM-DD"),
        dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("End date YYYY-MM-DD"),
        scuQty: z.number().int().min(1).optional().describe("Number of nights/days/units"),
        adults: z.number().int().min(1).optional().describe("Number of adults"),
        children: z.number().int().min(0).optional().describe("Number of children"),
        infants: z.number().int().min(0).optional().describe("Number of infants"),
        roomType: z.string().optional().describe("Room type code"),
        maxOptions: z.number().int().min(1).max(500).default(50).describe("Maximum results to return"),
        indexFirstOption: z.number().int().min(1).optional().describe("Pagination start index"),
        priceCode: z.string().max(2).optional().describe("2-char price code for special rates"),
        externalSearchMode: z.enum(["I", "E", "A"]).optional().describe("I=internal only, E=external, A=all"),
        rateId: z.string().optional().describe("Specific rate ID from prior search"),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params) => {
      const lines: string[] = ["<OptionInfoRequest>", client.authXml()];

      if (params.opt) lines.push(optionalElement("Opt", formatOptCode(params.opt)));
      if (params.optionNumber) lines.push(optionalElement("OptionNumber", params.optionNumber));
      if (params.info) lines.push(optionalElement("Info", params.info));
      if (params.dateFrom) lines.push(optionalElement("DateFrom", params.dateFrom));
      if (params.dateTo) lines.push(optionalElement("DateTo", params.dateTo));
      if (params.scuQty) lines.push(optionalElement("SCUqty", params.scuQty));
      if (params.adults) lines.push(optionalElement("Adults", params.adults));
      if (params.children !== undefined) lines.push(optionalElement("Children", params.children));
      if (params.infants !== undefined) lines.push(optionalElement("Infants", params.infants));
      if (params.roomType) lines.push(optionalElement("RoomType", params.roomType));
      if (params.maxOptions) lines.push(optionalElement("MaximumOptions", params.maxOptions));
      if (params.indexFirstOption) lines.push(optionalElement("IndexFirstOption", params.indexFirstOption));
      if (params.locationCode) lines.push(optionalElement("LocationCode", params.locationCode));
      if (params.endLocationCode) lines.push(optionalElement("EndLocationCode", params.endLocationCode));
      if (params.description) lines.push(optionalElement("Description", params.description));
      if (params.supplierName) lines.push(optionalElement("SupplierName", params.supplierName));
      if (params.priceCode) lines.push(optionalElement("PriceCode", params.priceCode));
      if (params.externalSearchMode) lines.push(optionalElement("ExternalSearchMode", params.externalSearchMode));
      if (params.rateId) lines.push(optionalElement("RateId", params.rateId));

      lines.push("</OptionInfoRequest>");

      const xml = client.buildRequest(lines.join("\n"), { returnWarnings: true });
      const result = await client.post(xml);

      // Build response text, appending diagnostic warnings as needed
      let responseText = formatResponse(result);

      if (result.success) {
        const optReply = result.data?.OptionInfoReply;
        const hasOptions = optReply &&
          typeof optReply === "object" &&
          optReply !== "" &&
          optReply.Option != null;

        // Warn when the reply is empty. The message is tailored to the most likely cause:
        // wildcard patterns shorter than 17 chars silently miss options with longer codes,
        // so we call that out specifically when a wildcard opt was supplied. For all other
        // cases (date/availability filters, narrow location search, etc.) we emit a neutral
        // "no results" note rather than a misleading pattern-length warning.
        if (!hasOptions) {
          const usedWildcardOpt = params.opt?.includes("?");
          if (usedWildcardOpt) {
            responseText +=
              "\n\n⚠️  WARNING: OptionInfoReply returned no options for this wildcard pattern. " +
              "Ensure the pattern is padded to exactly 17 characters " +
              "(e.g. 'BKKAC????????????' not 'BKKAC???????'). " +
              "Short patterns silently miss options whose codes exceed the pattern length. " +
              "The tool auto-pads wildcard patterns, so if you passed a shorter one it was " +
              "already padded — the service/location/supplier combination may genuinely have no options.";
          } else {
            responseText +=
              "\n\nℹ️  No options found. Try broadening your search criteria " +
              "(e.g. remove date filters, use a wildcard opt pattern, or check the location/service codes).";
          }
        }

      }

      return { content: [{ type: "text", text: responseText }] };
    }
  );

  // ── GET LOCATIONS ─────────────────────────────────────────────────────────
  server.registerTool(
    "hostconnect_get_locations",
    {
      title: "Get Locations",
      description: `Retrieve a list of available locations from Tourplan HostConnect.

Returns all configured locations with their codes and names.

Returns:
  JSON array of location objects, each with: LocationCode (3-char), Name, and other location details.`,
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      const inner = `<GetLocationsRequest>\n${client.authXml()}\n</GetLocationsRequest>`;
      const xml = client.buildRequest(inner);
      const result = await client.post(xml);
      return { content: [{ type: "text", text: formatResponse(result) }] };
    }
  );

  // ── GET SERVICES ──────────────────────────────────────────────────────────
  server.registerTool(
    "hostconnect_get_services",
    {
      title: "Get Service Types",
      description: `Retrieve a list of available service types/categories from Tourplan HostConnect.

Returns all configured service type codes and their descriptions.

Returns:
  JSON array of service types with: ServiceCode, Description.`,
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      const inner = `<GetServicesRequest>\n${client.authXml()}\n</GetServicesRequest>`;
      const xml = client.buildRequest(inner);
      const result = await client.post(xml);
      return { content: [{ type: "text", text: formatResponse(result) }] };
    }
  );

  // ── SUPPLIER INFO ─────────────────────────────────────────────────────────
  server.registerTool(
    "hostconnect_supplier_info",
    {
      title: "Get Supplier Info",
      description: `Retrieve information about a supplier from Tourplan HostConnect.

Args:
  - supplierCode (string): 6-char supplier code. Optional if supplierName provided.
  - supplierId (number): Numeric supplier ID. Optional.
  - supplierName (string): Supplier name to search. Optional.
  - supplierLogin (string): Login as supplier (returns only that supplier's data). Optional.

Returns:
  JSON with supplier details including: SupplierCode, SupplierName, Address, Contact, SupplierAnalysis codes, banking details.`,
      inputSchema: z.object({
        supplierCode: z.string().max(6).optional().describe("6-char supplier code"),
        supplierId: z.number().int().optional().describe("Numeric supplier ID"),
        supplierName: z.string().optional().describe("Supplier name to search"),
        supplierLogin: z.string().optional().describe("Supplier login (returns only that supplier)"),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (params) => {
      const lines = ["<SupplierInfoRequest>", client.authXml()];
      if (params.supplierCode) lines.push(optionalElement("SupplierCode", params.supplierCode));
      if (params.supplierId) lines.push(optionalElement("SupplierId", params.supplierId));
      if (params.supplierName) lines.push(optionalElement("SupplierName", params.supplierName));
      if (params.supplierLogin) lines.push(optionalElement("SupplierLogin", params.supplierLogin));
      lines.push("</SupplierInfoRequest>");

      const xml = client.buildRequest(lines.join("\n"));
      const result = await client.post(xml);
      return { content: [{ type: "text", text: formatResponse(result) }] };
    }
  );

  // ── GET CURRENCY CONVERSIONS ──────────────────────────────────────────────
  server.registerTool(
    "hostconnect_get_currency_conversions",
    {
      title: "Get Currency Conversions",
      description: `Retrieve currency conversion rates configured in Tourplan HostConnect.

Args:
  - returnAllSubCodes (boolean): If true, returns rates for all currency sub-codes. If false, returns only rates for the agent's default sub-code. Default: false.

Returns:
  JSON with CurrencyConversionSet objects, each containing: FromCurrency, ToCurrency, CurrencySubCode, and a list of CurrencyConversion entries with DateFrom and Rate.`,
      inputSchema: z.object({
        returnAllSubCodes: z.boolean().default(false).describe("Return all sub-code rates (default: agent's sub-code only)"),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ returnAllSubCodes }) => {
      const lines = ["<GetCurrencyConversionsRequest>", client.authXml()];
      if (returnAllSubCodes) lines.push("  <ReturnAllSubCodes>Y</ReturnAllSubCodes>");
      lines.push("</GetCurrencyConversionsRequest>");

      const xml = client.buildRequest(lines.join("\n"));
      const result = await client.post(xml);
      return { content: [{ type: "text", text: formatResponse(result) }] };
    }
  );
}
