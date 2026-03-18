import axios, { AxiosInstance } from "axios";
import * as xml2js from "xml2js";
import { HostConnectConfig, HostConnectResponse } from "../types.js";
import { HOSTCONNECT_CONTENT_TYPE, DEFAULT_TIMEOUT_MS } from "../constants.js";

export class HostConnectClient {
  private http: AxiosInstance;
  private agentId: string;
  private password: string;

  constructor(config: HostConnectConfig) {
    this.agentId = config.agentId;
    this.password = config.password;

    this.http = axios.create({
      baseURL: config.baseUrl,
      timeout: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      headers: {
        "Content-Type": HOSTCONNECT_CONTENT_TYPE,
        Accept: "text/xml",
      },
    });
  }

  /** Wrap request body XML with the HostConnect Request envelope */
  buildRequest(innerXml: string, options: { returnWarnings?: boolean } = {}): string {
    const attrs = options.returnWarnings ? ` ReturnWarnings="Y"` : "";
    return `<?xml version="1.0"?>\n<!DOCTYPE Request SYSTEM "hostConnect_5_05_000.dtd">\n<Request${attrs}>\n${innerXml}\n</Request>`;
  }

  /** Build auth elements included in every request */
  authXml(): string {
    return `  <AgentID>${escapeXml(this.agentId)}</AgentID>\n  <Password>${escapeXml(this.password)}</Password>`;
  }

  /** POST XML to HostConnect and parse the response */
  async post(xmlBody: string): Promise<HostConnectResponse> {
    let rawXml = "";
    try {
      const response = await this.http.post("", xmlBody);
      rawXml = response.data as string;

      const parsed = await xml2js.parseStringPromise(rawXml, {
        explicitArray: false,
        trim: true,
      });

      // HostConnect wraps everything in a <Reply> root
      const reply = parsed?.Reply ?? parsed;

      // Check for error response
      const errorReply = reply?.ErrorReply;
      if (errorReply) {
        const errorMsg = errorReply?.Error ?? "Unknown HostConnect error";
        return { success: false, errorMessage: String(errorMsg), rawXml };
      }

      return { success: true, data: reply, rawXml };
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        return {
          success: false,
          errorMessage: `HTTP error: ${err.response?.status ?? "unknown"} - ${err.message}`,
          rawXml,
        };
      }
      return {
        success: false,
        errorMessage: err instanceof Error ? err.message : "Unknown error",
        rawXml,
      };
    }
  }
}

/** Escape special XML characters in a string value */
export function escapeXml(value: string | number | undefined): string {
  if (value === undefined || value === null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Optionally emit an XML element if value is defined */
export function optionalElement(tag: string, value: string | number | undefined): string {
  if (value === undefined || value === null || value === "") return "";
  return `  <${tag}>${escapeXml(value)}</${tag}>`;
}

/** Individual passenger detail record — maps to DTD PaxDetails element */
export interface PaxDetail {
  personId?: string;
  title?: string;
  forename?: string;
  surname?: string;
  dateOfBirth?: string;  // YYYY-MM-DD
  age?: number;
  paxType?: string;      // e.g. "A" (adult), "C" (child), "I" (infant)
  paxText1?: string;
  paxText2?: string;
  paxText3?: string;
  paxText4?: string;
  paxText5?: string;
  paxText6?: string;
  paxText7?: string;
  paxText8?: string;
  paxText9?: string;
  paxText10?: string;
}

/** Build a room configs XML block, optionally including per-pax PaxList details.
 *
 * DTD: RoomConfig (Adults, Children?, Infants?, RoomType?, PaxList?)
 *      PaxList (PaxDetails+)
 *      PaxDetails (PersonId?, Title?, TitleAlias?, Forename?, ForenameAlias?,
 *                  Surname?, SurnameAlias?, DateOfBirth?, Age?, PaxType?,
 *                  PaxText1?...PaxText10?)
 */
export function buildRoomConfigsXml(
  rooms: Array<{ adults: number; children?: number; infants?: number; roomType?: string; paxList?: PaxDetail[] }>
): string {
  const lines = rooms.map((r) => {
    // Element order follows DTD: Adults, Children?, Infants?, RoomType?, PaxList?
    let inner = `    <Adults>${r.adults}</Adults>`;
    if (r.children !== undefined) inner += `\n    <Children>${r.children}</Children>`;
    if (r.infants !== undefined) inner += `\n    <Infants>${r.infants}</Infants>`;
    if (r.roomType) inner += `\n    <RoomType>${escapeXml(r.roomType)}</RoomType>`;

    if (r.paxList && r.paxList.length > 0) {
      inner += `\n    <PaxList>`;
      for (const pax of r.paxList) {
        // Element order strictly follows DTD:
        // PersonId?, Title?, TitleAlias?, Forename?, ForenameAlias?,
        // Surname?, SurnameAlias?, DateOfBirth?, Age?, PaxType?, PaxText1?...PaxText10?
        inner += `\n      <PaxDetails>`;
        if (pax.personId)   inner += `\n        <PersonId>${escapeXml(pax.personId)}</PersonId>`;
        if (pax.title)      inner += `\n        <Title>${escapeXml(pax.title)}</Title>`;
        if (pax.forename)   inner += `\n        <Forename>${escapeXml(pax.forename)}</Forename>`;
        if (pax.surname)    inner += `\n        <Surname>${escapeXml(pax.surname)}</Surname>`;
        if (pax.dateOfBirth) inner += `\n        <DateOfBirth>${escapeXml(pax.dateOfBirth)}</DateOfBirth>`;
        if (pax.age !== undefined) inner += `\n        <Age>${pax.age}</Age>`;
        if (pax.paxType)    inner += `\n        <PaxType>${escapeXml(pax.paxType)}</PaxType>`;
        if (pax.paxText1)   inner += `\n        <PaxText1>${escapeXml(pax.paxText1)}</PaxText1>`;
        if (pax.paxText2)   inner += `\n        <PaxText2>${escapeXml(pax.paxText2)}</PaxText2>`;
        if (pax.paxText3)   inner += `\n        <PaxText3>${escapeXml(pax.paxText3)}</PaxText3>`;
        if (pax.paxText4)   inner += `\n        <PaxText4>${escapeXml(pax.paxText4)}</PaxText4>`;
        if (pax.paxText5)   inner += `\n        <PaxText5>${escapeXml(pax.paxText5)}</PaxText5>`;
        if (pax.paxText6)   inner += `\n        <PaxText6>${escapeXml(pax.paxText6)}</PaxText6>`;
        if (pax.paxText7)   inner += `\n        <PaxText7>${escapeXml(pax.paxText7)}</PaxText7>`;
        if (pax.paxText8)   inner += `\n        <PaxText8>${escapeXml(pax.paxText8)}</PaxText8>`;
        if (pax.paxText9)   inner += `\n        <PaxText9>${escapeXml(pax.paxText9)}</PaxText9>`;
        if (pax.paxText10)  inner += `\n        <PaxText10>${escapeXml(pax.paxText10)}</PaxText10>`;
        inner += `\n      </PaxDetails>`;
      }
      inner += `\n    </PaxList>`;
    }

    return `  <RoomConfig>\n${inner}\n  </RoomConfig>`;
  });
  return `<RoomConfigs>\n${lines.join("\n")}\n</RoomConfigs>`;
}

/**
 * Validate and normalise a Tourplan Opt code to ensure correct segment lengths.
 *
 * Structure: Location(3) + Service(2) + Supplier(6) + OptionCode(6) = exactly 17 chars
 * Trailing spaces on the OptionCode segment may be omitted per the HostConnect spec.
 *
 * Examples from spec:
 *  SYDAC????????????  → SYD(3) + AC(2) + ????????????(12) = 17 chars  (all Sydney accommodation)
 *  SYD??SYDLUX??????  → SYD(3) + ??(2) + SYDLUX(6) + ??????(6) = 17 chars
 *  QTSSSAJHAC BUNGEE  → QTS(3) + SS(2) + AJHAC (6) + BUNGEE(6) = 17 chars (exact match)
 *
 * Rules enforced:
 *  - Location  : exactly 3 chars (space-padded if short)
 *  - Service   : exactly 2 chars (space-padded if short)
 *  - Supplier  : exactly 6 chars (space-padded if short, unless ? wildcards present)
 *  - OptionCode: exactly 6 chars (space-padded if short); trailing spaces trimmed per spec
 *
 * Accepts either:
 *  - A single raw opt string  → validates and pads supplier segment to 6 chars if needed
 *  - Explicit segments        → formatOptCode(location, service, supplier?, optionCode?)
 */
export function formatOptCode(
  locationOrFull: string,
  service?: string,
  supplier?: string,
  optionCode?: string
): string {
  if (!service) {
    // Single raw string — validate and fix supplier padding only
    const raw = locationOrFull;
    if (raw.length <= 5) return raw; // location+service only, trailing chars omitted

    // If the pattern contains ? wildcards and is shorter than 17 chars, pad with ?
    // to ensure it matches options with longer codes (Tourplan opt max is 17 chars).
    if (raw.includes("?") && raw.length < 17) {
      return raw.padEnd(17, "?");
    }

    const loc = raw.slice(0, 3);
    const svc = raw.slice(3, 5);
    const supRaw = raw.slice(5, 11); // supplier = chars 5-10 (6 chars)
    const opc = raw.slice(11);       // option    = chars 11-16 (up to 6 chars)
    // Pad supplier to 6 if present, shorter than 6, and contains no wildcards
    if (supRaw.length > 0 && supRaw.length < 6 && !supRaw.includes("?")) {
      return (loc + svc + supRaw.padEnd(6, " ") + opc).trimEnd();
    }
    return raw.trimEnd();
  }

  // Explicit segments
  const loc = locationOrFull.slice(0, 3).padEnd(3, " ");
  const svc = service.slice(0, 2).padEnd(2, " ");

  if (!supplier) {
    // No supplier — location+service only, trailing spaces trimmed
    return (loc + svc).trimEnd();
  }

  // Pad supplier to exactly 6 chars (unless wildcards are filling the space)
  const sup = (!supplier.includes("?") && supplier.length < 6)
    ? supplier.padEnd(6, " ")
    : supplier.slice(0, 6);

  if (!optionCode) {
    const partial = (loc + svc + sup).trimEnd();
    // Apply the same 17-char wildcard padding as the single-string path
    if (partial.includes("?") && partial.length < 17) return partial.padEnd(17, "?");
    return partial;
  }

  // OptionCode: pad to 6, then trim trailing spaces per spec
  const opc = optionCode.length < 6 && !optionCode.includes("?")
    ? optionCode.padEnd(6, " ")
    : optionCode.slice(0, 6);

  const full = (loc + svc + sup + opc).trimEnd();
  // Apply the same 17-char wildcard padding as the single-string path
  if (full.includes("?") && full.length < 17) return full.padEnd(17, "?");
  return full;
}

/** Format a HostConnect response for MCP output — returns pretty-printed JSON or an error string. */
export function formatResponse(result: HostConnectResponse): string {
  if (!result.success) {
    return `Error: ${result.errorMessage}`;
  }
  return JSON.stringify(result.data, null, 2);
}
