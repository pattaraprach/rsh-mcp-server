import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { HostConnectClient, formatResponse, optionalElement, escapeXml, buildRoomConfigsXml, formatOptCode } from "../services/hostconnect-client.js";

// DTD: PaxDetails (PersonId?, Title?, TitleAlias?, Forename?, ForenameAlias?,
//                  Surname?, SurnameAlias?, DateOfBirth?, Age?, PaxType?,
//                  PaxText1?...PaxText10?)
const PaxDetailsSchema = z.object({
  personId:    z.string().optional().describe("Person ID"),
  title:       z.string().optional().describe("Title (e.g. Mr, Mrs, Ms, Dr)"),
  forename:    z.string().optional().describe("First name"),
  surname:     z.string().optional().describe("Last name / family name"),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Date of birth YYYY-MM-DD"),
  age:         z.number().int().min(0).optional().describe("Age in years"),
  paxType:     z.string().optional().describe("Passenger type code (e.g. A=adult, C=child, I=infant)"),
  paxText1:    z.string().optional().describe("User-defined passenger text field 1"),
  paxText2:    z.string().optional().describe("User-defined passenger text field 2"),
  paxText3:    z.string().optional().describe("User-defined passenger text field 3"),
  paxText4:    z.string().optional().describe("User-defined passenger text field 4"),
  paxText5:    z.string().optional().describe("User-defined passenger text field 5"),
  paxText6:    z.string().optional().describe("User-defined passenger text field 6"),
  paxText7:    z.string().optional().describe("User-defined passenger text field 7"),
  paxText8:    z.string().optional().describe("User-defined passenger text field 8"),
  paxText9:    z.string().optional().describe("User-defined passenger text field 9"),
  paxText10:   z.string().optional().describe("User-defined passenger text field 10"),
});

// DTD: RoomConfig (Adults, Children?, Infants?, RoomType?, PaxList?)
const RoomConfigSchema = z.object({
  adults:   z.number().int().min(1).describe("Number of adults"),
  children: z.number().int().min(0).optional().describe("Number of children"),
  infants:  z.number().int().min(0).optional().describe("Number of infants"),
  roomType: z.string().optional().describe("Room type code"),
  paxList:  z.array(PaxDetailsSchema).optional().describe(
    "Individual passenger details — one PaxDetails entry per person. " +
    "Must be used with roomConfigs (not the simple adults/children/infants fields). " +
    "Include title, forename, surname, dateOfBirth, and paxType for each passenger."
  ),
});

export function registerBookingTools(server: McpServer, client: HostConnectClient): void {

  // ── GET BOOKING ────────────────────────────────────────────────────────────
  server.registerTool(
    "hostconnect_get_booking",
    {
      title: "Get Booking",
      description: `Retrieve full details of a booking from Tourplan HostConnect.

Args:
  - ref (string): Booking reference code (e.g. "ABC123"). Use this OR bookingId.
  - bookingId (number): Numeric booking ID. Use this OR ref.
  - returnPackageServices (boolean): Include package service lines. Default: false.
  - noteFormat (string): Note format: "T"=text, "H"=HTML, "R"=RTF. Optional.

Returns:
  JSON with full booking details including: Name, Status, TravelDate, ServiceLines (each with Opt, DateFrom, Adults, Pricing, Remarks), BookingNotes, PaymentDetails, TourplanBookingStatus, and financial totals.`,
      inputSchema: z.object({
        ref: z.string().optional().describe("Booking reference code (e.g. 'ABC123')"),
        bookingId: z.number().int().optional().describe("Numeric booking ID"),
        returnPackageServices: z.boolean().default(false).describe("Include package service lines"),
        noteFormat: z.enum(["T", "H", "R"]).optional().describe("Note format: T=text, H=HTML, R=RTF"),
      }).refine(d => d.ref || d.bookingId, { message: "Either ref or bookingId must be provided" }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (params) => {
      const lines = ["<GetBookingRequest>", client.authXml()];
      if (params.ref) lines.push(optionalElement("Ref", params.ref));
      else if (params.bookingId) lines.push(optionalElement("BookingId", params.bookingId));
      if (params.returnPackageServices) lines.push("  <ReturnPackageServices>Y</ReturnPackageServices>");
      if (params.noteFormat) lines.push(optionalElement("NoteFormat", params.noteFormat));
      lines.push("</GetBookingRequest>");

      const xml = client.buildRequest(lines.join("\n"));
      const result = await client.post(xml);
      return { content: [{ type: "text", text: formatResponse(result) }] };
    }
  );

  // ── LIST BOOKINGS ──────────────────────────────────────────────────────────
  server.registerTool(
    "hostconnect_list_bookings",
    {
      title: "List Bookings",
      description: `Search and list bookings in Tourplan HostConnect.

Args:
  - name (string): Filter by booking/passenger name (partial match). Optional.
  - agentRef (string): Filter by agent reference. Optional.
  - travelDateFrom (string): Filter by travel date from YYYY-MM-DD. Optional.
  - travelDateTo (string): Filter by travel date to YYYY-MM-DD. Optional.
  - tourplanBookingStatus (string): Filter by booking status code (2-char). Optional.
  - maxBookings (number): Maximum number of results (default: 50). Optional.

Returns:
  JSON array of bookings, each with: Ref, BookingId, Name, TravelDate, TourplanBookingStatus, and summary totals.`,
      inputSchema: z.object({
        name: z.string().optional().describe("Filter by passenger/booking name"),
        agentRef: z.string().optional().describe("Filter by agent reference"),
        travelDateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Travel date from YYYY-MM-DD"),
        travelDateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Travel date to YYYY-MM-DD"),
        tourplanBookingStatus: z.string().max(2).optional().describe("Filter by 2-char booking status code"),
        maxBookings: z.number().int().min(1).max(500).default(50).describe("Maximum results to return"),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (params) => {
      const lines = ["<ListBookingsRequest>", client.authXml()];
      if (params.name) lines.push(optionalElement("Name", params.name));
      if (params.agentRef) lines.push(optionalElement("AgentRef", params.agentRef));
      if (params.travelDateFrom) lines.push(optionalElement("TravelDateFrom", params.travelDateFrom));
      if (params.travelDateTo) lines.push(optionalElement("TravelDateTo", params.travelDateTo));
      if (params.tourplanBookingStatus) lines.push(optionalElement("TourplanBookingStatus", params.tourplanBookingStatus));
      lines.push(optionalElement("MaximumBookings", params.maxBookings));
      lines.push("</ListBookingsRequest>");

      const xml = client.buildRequest(lines.join("\n"));
      const result = await client.post(xml);
      return { content: [{ type: "text", text: formatResponse(result) }] };
    }
  );

  // ── ADD SERVICE (CREATE/ADD TO BOOKING) ────────────────────────────────────
  server.registerTool(
    "hostconnect_add_service",
    {
      title: "Add Service to Booking",
      description: `Add a travel service to a new or existing booking in Tourplan HostConnect.

To create a NEW booking: provide 'name' and 'qb' (quote/booking flag).
To add to an EXISTING booking: provide 'ref' or 'bookingId'.

Args:
  - name (string): Passenger/booking name. Required for new bookings.
  - qb (string): "Q"=quote, "B"=booking. Required for new bookings.
  - ref (string): Existing booking reference. Use for existing bookings.
  - bookingId (number): Existing booking ID. Use for existing bookings.
  - opt (string): Option/product code to book (e.g. "AKLAPT01"). Required unless optionNumber provided.
  - optionNumber (string): Numeric option ID. Alternative to opt.
  - rateId (string): Rate ID from a prior OptionInfo search. Defaults to "Default" if not supplied. Use "Default" when no prior OptionInfo pricing call was made — omitting this causes Tourplan error 1001 "RateId not supplied".
  - dateFrom (string): Service start date YYYY-MM-DD. Required.
  - adults (number): Number of adults. Required if not using roomConfigs.
  - children (number): Number of children. Optional.
  - infants (number): Number of infants. Optional.
  - roomType (string): Room type code. Optional.
  - roomConfigs (array): Room configurations. Use instead of adults/children/infants when you need per-passenger details. Each entry supports: adults, children, infants, roomType, and paxList (array of PaxDetails with title, forename, surname, dateOfBirth, paxType, etc.).
  - scuQty (number): Number of service units (nights, days). Optional.
  - agentRef (string): Agent's own reference code. Optional.
  - remarks (string): Service remarks/notes. Optional.
  - onRequest (boolean): Book on-request (not confirmed). Optional.
  - priceCode (string): 2-char price code. Optional.
  - tourplanBookingStatus (string): Initial booking status. Optional.
  - returnBookingDetails (boolean): Return full booking after add. Default: false.

Returns:
  JSON with BookingId, Ref, ServiceLineId, and optionally full booking details if returnBookingDetails=true.`,
      inputSchema: z.object({
        // Booking identification
        name: z.string().optional().describe("Passenger/booking name (required for new bookings)"),
        qb: z.enum(["Q", "B"]).optional().describe("Q=Quote, B=Booking (required for new bookings)"),
        ref: z.string().optional().describe("Existing booking reference"),
        bookingId: z.number().int().optional().describe("Existing booking ID"),
        // Service
        opt: z.string().optional().describe("Option/product code to book"),
        optionNumber: z.string().optional().describe("Numeric option ID"),
        rateId: z.string().optional().describe("Rate ID from prior OptionInfo search. Defaults to \"Default\" if not supplied — always required by Tourplan; use \"Default\" when no pricing call was made."),
        dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Service start date YYYY-MM-DD"),
        // Pax
        adults: z.number().int().min(1).optional().describe("Number of adults"),
        children: z.number().int().min(0).optional().describe("Number of children"),
        infants: z.number().int().min(0).optional().describe("Number of infants"),
        roomType: z.string().optional().describe("Room type code"),
        roomConfigs: z.array(RoomConfigSchema).optional().describe("Room configurations for multi-room bookings"),
        scuQty: z.number().int().min(1).optional().describe("Service units (nights, days, etc.)"),
        // Optional fields
        agentRef: z.string().optional().describe("Agent's own reference code"),
        remarks: z.string().optional().describe("Service remarks/notes"),
        onRequest: z.boolean().optional().describe("Book on-request (not confirmed)"),
        priceCode: z.string().max(2).optional().describe("2-char price code"),
        tourplanBookingStatus: z.string().max(2).optional().describe("Initial booking status code"),
        tourplanConsultant: z.string().max(6).optional().describe("Tourplan consultant code"),
        supplierCode: z.string().max(6).optional().describe("Supplier code (for fixed services)"),
        locationCode: z.string().max(3).optional().describe("Location code (required for fixed services)"),
        serviceCode: z.string().max(2).optional().describe("Service type code (required for fixed services)"),
        returnBookingDetails: z.boolean().default(false).describe("Return full booking details after adding"),
        sendSupplierMessage: z.enum(["Y", "N"]).optional().describe("Y=send supplier message, N=don't send"),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (params) => {
      const lines = ["<AddServiceRequest>", client.authXml()];

      // Booking info block
      if (params.name && params.qb) {
        lines.push(`  <NewBookingInfo>`);
        lines.push(`    <Name>${escapeXml(params.name)}</Name>`);
        lines.push(`    <QB>${params.qb}</QB>`);
        if (params.tourplanBookingStatus) lines.push(`    <TourplanBookingStatus>${escapeXml(params.tourplanBookingStatus)}</TourplanBookingStatus>`);
        lines.push(`  </NewBookingInfo>`);
      } else if (params.ref) {
        lines.push(`  <ExistingBookingInfo><Ref>${escapeXml(params.ref)}</Ref></ExistingBookingInfo>`);
      } else if (params.bookingId) {
        lines.push(`  <ExistingBookingInfo><BookingId>${params.bookingId}</BookingId></ExistingBookingInfo>`);
      }

      // Service option
      if (params.opt) lines.push(optionalElement("Opt", formatOptCode(params.opt)));
      else if (params.optionNumber) lines.push(optionalElement("OptionNumber", params.optionNumber));
      if (params.supplierCode) lines.push(optionalElement("SupplierCode", params.supplierCode));
      // RateId is always required by Tourplan; default to "Default" when not provided or empty.
      // Use || (not ??) so that an explicit empty string also falls back to "Default".
      lines.push(optionalElement("RateId", params.rateId || "Default"));

      lines.push(optionalElement("DateFrom", params.dateFrom));

      // Pax / room configs
      if (params.roomConfigs && params.roomConfigs.length > 0) {
        lines.push(buildRoomConfigsXml(params.roomConfigs));
      } else {
        lines.push(`  <Adults>${params.adults ?? 2}</Adults>`);
        if (params.children !== undefined) lines.push(optionalElement("Children", params.children));
        if (params.infants !== undefined) lines.push(optionalElement("Infants", params.infants));
        if (params.roomType) lines.push(optionalElement("RoomType", params.roomType));
      }

      if (params.scuQty) lines.push(optionalElement("SCUqty", params.scuQty));
      if (params.onRequest) lines.push("  <OnRequest>Y</OnRequest>");
      if (params.agentRef) lines.push(optionalElement("AgentRef", params.agentRef));
      if (params.remarks) lines.push(optionalElement("Remarks", params.remarks));
      if (params.priceCode) lines.push(optionalElement("PriceCode", params.priceCode));
      if (params.tourplanConsultant) lines.push(optionalElement("TourplanConsultant", params.tourplanConsultant));
      if (params.locationCode) lines.push(optionalElement("LocationCode", params.locationCode));
      if (params.serviceCode) lines.push(optionalElement("ServiceCode", params.serviceCode));
      if (params.sendSupplierMessage) lines.push(optionalElement("SendSupplierMessage", params.sendSupplierMessage));

      if (params.returnBookingDetails) {
        lines.push(`  <ReturnBookingDetails><ReturnBooking>Y</ReturnBooking></ReturnBookingDetails>`);
      }

      lines.push("</AddServiceRequest>");

      const xml = client.buildRequest(lines.join("\n"));
      const result = await client.post(xml);
      return { content: [{ type: "text", text: formatResponse(result) }] };
    }
  );

  // ── UPDATE BOOKING ─────────────────────────────────────────────────────────
  server.registerTool(
    "hostconnect_update_booking",
    {
      title: "Update Booking Header",
      description: `Update the header information of an existing booking in Tourplan HostConnect.

Args:
  - ref (string): Booking reference. Use this OR bookingId.
  - bookingId (number): Numeric booking ID. Use this OR ref.
  - name (string): New passenger/booking name. Optional.
  - agentRef (string): New agent reference. Optional.
  - oldBookingStatus (string): Current booking status (required if changing status). Optional.
  - newBookingStatus (string): New booking status to change to. Optional.
  - consult (string): Consultant code. Optional.
  - tourplanConsultant (string): Tourplan consultant code. Optional.
  - enteredDate (string): Override the booking entered date YYYY-MM-DD. Optional.
  - udText1-5 (string): User-defined text fields 1-5. Optional.

Returns:
  JSON with updated TourplanBookingStatus and BookingUpdateCount.`,
      inputSchema: z.object({
        ref: z.string().optional().describe("Booking reference"),
        bookingId: z.number().int().optional().describe("Numeric booking ID"),
        name: z.string().optional().describe("New booking/passenger name"),
        agentRef: z.string().optional().describe("Agent reference code"),
        oldBookingStatus: z.string().max(2).optional().describe("Current status (required when changing status)"),
        newBookingStatus: z.string().max(2).optional().describe("New status to change to"),
        consult: z.string().optional().describe("Consultant code"),
        tourplanConsultant: z.string().max(6).optional().describe("Tourplan consultant code"),
        enteredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Override entered date YYYY-MM-DD"),
        udText1: z.string().max(60).optional().describe("User-defined text field 1"),
        udText2: z.string().max(60).optional().describe("User-defined text field 2"),
        udText3: z.string().max(60).optional().describe("User-defined text field 3"),
        udText4: z.string().max(60).optional().describe("User-defined text field 4"),
        udText5: z.string().max(60).optional().describe("User-defined text field 5"),
        finalPaymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Final payment due date"),
        depositDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Deposit due date"),
        depositDueAmount: z.number().int().min(0).optional().describe("Deposit amount in cents"),
      }).refine(d => d.ref || d.bookingId, { message: "Either ref or bookingId must be provided" }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (params) => {
      const lines = ["<UpdateBookingRequest>", client.authXml()];

      if (params.ref) lines.push(optionalElement("Ref", params.ref));
      else if (params.bookingId) lines.push(optionalElement("BookingId", params.bookingId));

      if (params.name) lines.push(optionalElement("Name", params.name));
      if (params.oldBookingStatus && params.newBookingStatus) {
        lines.push(optionalElement("TourplanOldBookingStatus", params.oldBookingStatus));
        lines.push(optionalElement("TourplanBookingStatus", params.newBookingStatus));
      }
      if (params.agentRef) lines.push(optionalElement("AgentRef", params.agentRef));
      if (params.consult) lines.push(optionalElement("Consult", params.consult));
      if (params.tourplanConsultant) lines.push(optionalElement("TourplanConsultant", params.tourplanConsultant));
      if (params.enteredDate) lines.push(optionalElement("EnteredDate", params.enteredDate));
      if (params.udText1) lines.push(optionalElement("UDText1", params.udText1));
      if (params.udText2) lines.push(optionalElement("UDText2", params.udText2));
      if (params.udText3) lines.push(optionalElement("UDText3", params.udText3));
      if (params.udText4) lines.push(optionalElement("UDText4", params.udText4));
      if (params.udText5) lines.push(optionalElement("UDText5", params.udText5));

      // Payment details
      if (params.finalPaymentDate || params.depositDueDate || params.depositDueAmount !== undefined) {
        lines.push("  <PaymentDetails>");
        if (params.finalPaymentDate) lines.push(`    <FinalPaymentDate>${params.finalPaymentDate}</FinalPaymentDate>`);
        if (params.depositDueDate) lines.push(`    <DepositDueDate>${params.depositDueDate}</DepositDueDate>`);
        if (params.depositDueAmount !== undefined) lines.push(`    <DepositDueAmount>${params.depositDueAmount}</DepositDueAmount>`);
        lines.push("  </PaymentDetails>");
      }

      lines.push("</UpdateBookingRequest>");

      const xml = client.buildRequest(lines.join("\n"));
      const result = await client.post(xml);
      return { content: [{ type: "text", text: formatResponse(result) }] };
    }
  );

  // ── SET BOOKING REMARKS ────────────────────────────────────────────────────
  server.registerTool(
    "hostconnect_set_booking_remarks",
    {
      title: "Set Booking Remarks",
      description: `Set or update remarks on a booking in Tourplan HostConnect.

Args:
  - ref (string): Booking reference. Use this OR bookingId.
  - bookingId (number): Numeric booking ID. Use this OR ref.
  - remarks (string): The remarks text to set on the booking.

Returns:
  JSON confirmation of the remarks update.`,
      inputSchema: z.object({
        ref: z.string().optional().describe("Booking reference"),
        bookingId: z.number().int().optional().describe("Numeric booking ID"),
        remarks: z.string().describe("Remarks text to set on the booking"),
      }).refine(d => d.ref || d.bookingId, { message: "Either ref or bookingId must be provided" }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (params) => {
      const lines = ["<SetBookingRemarksRequest>", client.authXml()];
      if (params.ref) lines.push(optionalElement("Ref", params.ref));
      else if (params.bookingId) lines.push(optionalElement("BookingId", params.bookingId));
      lines.push(optionalElement("Remarks", params.remarks));
      lines.push("</SetBookingRemarksRequest>");

      const xml = client.buildRequest(lines.join("\n"));
      const result = await client.post(xml);
      return { content: [{ type: "text", text: formatResponse(result) }] };
    }
  );

  // ── QUOTE TO BOOK ──────────────────────────────────────────────────────────
  server.registerTool(
    "hostconnect_quote_to_book",
    {
      title: "Convert Quote to Booking",
      description: `Convert a quote (status Q) to a confirmed booking (status B) in Tourplan HostConnect.

Args:
  - ref (string): Booking reference of the quote. Use this OR bookingId.
  - bookingId (number): Numeric booking ID of the quote. Use this OR ref.
  - sendSupplierMessage (string): Y=send supplier messages, N=don't send. Optional.

Returns:
  JSON confirmation of the quote-to-book conversion.`,
      inputSchema: z.object({
        ref: z.string().optional().describe("Quote booking reference"),
        bookingId: z.number().int().optional().describe("Numeric booking ID of the quote"),
        sendSupplierMessage: z.enum(["Y", "N"]).optional().describe("Y=send supplier messages, N=suppress"),
      }).refine(d => d.ref || d.bookingId, { message: "Either ref or bookingId must be provided" }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (params) => {
      const lines = ["<QuoteToBookRequest>", client.authXml()];
      if (params.ref) lines.push(optionalElement("Ref", params.ref));
      else if (params.bookingId) lines.push(optionalElement("BookingId", params.bookingId));
      if (params.sendSupplierMessage) lines.push(optionalElement("SendSupplierMessage", params.sendSupplierMessage));
      lines.push("</QuoteToBookRequest>");

      const xml = client.buildRequest(lines.join("\n"));
      const result = await client.post(xml);
      return { content: [{ type: "text", text: formatResponse(result) }] };
    }
  );
}
