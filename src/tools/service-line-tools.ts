import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { HostConnectClient, formatResponse, optionalElement } from "../services/hostconnect-client.js";

// ── READ-ONLY SERVICE LINE TOOLS ───────────────────────────────────────────────
export function registerReadOnlyServiceLineTools(server: McpServer, client: HostConnectClient): void {

  // ── GET PAYMENT SUMMARY ────────────────────────────────────────────────────
  server.registerTool(
    "hostconnect_get_payment_summary",
    {
      title: "Get Booking Payment Summary",
      description: `Retrieve the payment summary for a booking from Tourplan HostConnect.

Args:
  - ref (string): Booking reference. Use this OR bookingId.
  - bookingId (number): Numeric booking ID. Use this OR ref.

Returns:
  JSON with payment summary including: TotalAmount, TotalTax, ReceivedTotal, BalanceDue, and individual payment transactions.`,
      inputSchema: z.object({
        ref: z.string().optional().describe("Booking reference"),
        bookingId: z.number().int().optional().describe("Numeric booking ID"),
      }).refine(d => d.ref || d.bookingId, { message: "Either ref or bookingId must be provided" }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (params) => {
      const lines = ["<GetBookingPaymentSummaryRequest>", client.authXml()];
      if (params.ref) lines.push(optionalElement("Ref", params.ref));
      else if (params.bookingId) lines.push(optionalElement("BookingId", params.bookingId));
      lines.push("</GetBookingPaymentSummaryRequest>");

      const xml = client.buildRequest(lines.join("\n"));
      const result = await client.post(xml);
      return { content: [{ type: "text", text: formatResponse(result) }] };
    }
  );

  // ── GET BOOKING MESSAGE ────────────────────────────────────────────────────
  server.registerTool(
    "hostconnect_get_booking_message",
    {
      title: "Get Booking Message",
      description: `Retrieve a message/document for a booking from Tourplan HostConnect (e.g. voucher, invoice, itinerary).

Args:
  - ref (string): Booking reference. Use this OR bookingId.
  - bookingId (number): Numeric booking ID. Use this OR ref.
  - messageLabel (string): Label of the message type to retrieve (e.g. "INVOICE", "VOUCHER"). Use this OR messageCode.
  - messageCode (string): Tourplan message code. Use this OR messageLabel.

Returns:
  JSON with the generated message/document content.`,
      inputSchema: z.object({
        ref: z.string().optional().describe("Booking reference"),
        bookingId: z.number().int().optional().describe("Numeric booking ID"),
        messageLabel: z.string().optional().describe("Message type label (e.g. 'INVOICE', 'VOUCHER')"),
        messageCode: z.string().optional().describe("Tourplan message code"),
      }).refine(d => d.ref || d.bookingId, { message: "Either ref or bookingId must be provided" }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (params) => {
      const lines = ["<GetBookingMessageRequest>", client.authXml()];
      if (params.ref) lines.push(optionalElement("Ref", params.ref));
      else if (params.bookingId) lines.push(optionalElement("BookingId", params.bookingId));
      if (params.messageLabel) lines.push(optionalElement("MessageLabel", params.messageLabel));
      if (params.messageCode) lines.push(optionalElement("MessageCode", params.messageCode));
      lines.push("</GetBookingMessageRequest>");

      const xml = client.buildRequest(lines.join("\n"));
      const result = await client.post(xml);
      return { content: [{ type: "text", text: formatResponse(result) }] };
    }
  );
}

// ── WRITE SERVICE LINE TOOLS ──────────────────────────────────────────────────
export function registerWriteServiceLineTools(server: McpServer, client: HostConnectClient): void {

  // ── AMEND SERVICE REMARKS ──────────────────────────────────────────────────
  // Uses AmendServiceRemarksRequest (not UpdateServiceRequest).
  // DTD: (AgentID, Password, (Ref | BookingId),
  //       (ServiceLineId | (Date, SequenceNumber)),
  //       puTime?, puRemark?, puExternalPointID?,
  //       doTime?, doRemark?, doExternalPointID?, Remarks?)
  server.registerTool(
    "hostconnect_update_service",
    {
      title: "Amend Service Remarks",
      description: `Update pickup/dropoff times, pickup/dropoff remarks, and general remarks on a service line in Tourplan HostConnect.

Uses AmendServiceRemarksRequest. The booking reference (Ref or BookingId) is a direct child of the request — it is NOT wrapped in ExistingBookingInfo.

The service line can be identified either by ServiceLineId OR by Date + SequenceNumber.

Args:
  - ref (string): Booking reference. Use this OR bookingId.
  - bookingId (number): Numeric booking ID. Use this OR ref.
  - serviceLineId (number | string): Service line ID (e.g. 7632 or "7632"). Use this OR (date + sequenceNumber).
  - date (string): Service date YYYY-MM-DD. Use with sequenceNumber as alternative to serviceLineId.
  - sequenceNumber (number): Service sequence number. Use with date as alternative to serviceLineId.
  - puTime (string): Pickup time (e.g. "0800"). Optional.
  - puRemark (string): Pickup remark or location description. Optional.
  - puExternalPointID (string): Pickup external point ID. Optional.
  - doTime (string): Dropoff time (e.g. "1800"). Optional.
  - doRemark (string): Dropoff remark or location description. Optional.
  - doExternalPointID (string): Dropoff external point ID. Optional.
  - remarks (string): General service remarks. Optional.

Returns:
  JSON confirmation. AmendServiceRemarksReply is EMPTY on success — an empty reply with no error means the update succeeded.`,
      inputSchema: z.object({
        ref: z.string().optional().describe("Booking reference"),
        bookingId: z.number().int().optional().describe("Numeric booking ID"),
        serviceLineId: z.coerce.number().int().optional().describe("Service line ID — accepts number or numeric string (e.g. 7632 or \"7632\"). Use this OR (date + sequenceNumber)."),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Service date YYYY-MM-DD — use with sequenceNumber as alternative to serviceLineId"),
        sequenceNumber: z.number().int().optional().describe("Service sequence number — use with date as alternative to serviceLineId"),
        puTime: z.string().optional().describe("Pickup time (e.g. \"0800\")"),
        puRemark: z.string().optional().describe("Pickup remark or location"),
        puExternalPointID: z.string().optional().describe("Pickup external point ID"),
        doTime: z.string().optional().describe("Dropoff time (e.g. \"1800\")"),
        doRemark: z.string().optional().describe("Dropoff remark or location"),
        doExternalPointID: z.string().optional().describe("Dropoff external point ID"),
        remarks: z.string().optional().describe("General service remarks"),
      })
      .refine(d => d.ref || d.bookingId, { message: "Either ref or bookingId must be provided" })
      .refine(
        d => d.serviceLineId != null || (d.date != null && d.sequenceNumber != null),
        { message: "Either serviceLineId or both (date + sequenceNumber) must be provided" }
      ),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (params) => {
      // Element order must strictly follow the DTD:
      // AgentID, Password, (Ref | BookingId),
      // (ServiceLineId | (Date, SequenceNumber)),
      // puTime?, puRemark?, puExternalPointID?,
      // doTime?, doRemark?, doExternalPointID?, Remarks?
      const lines = ["<AmendServiceRemarksRequest>", client.authXml()];

      if (params.ref) lines.push(optionalElement("Ref", params.ref));
      else if (params.bookingId) lines.push(optionalElement("BookingId", params.bookingId));

      if (params.serviceLineId != null) {
        lines.push(optionalElement("ServiceLineId", params.serviceLineId));
      } else {
        lines.push(optionalElement("Date", params.date));
        lines.push(optionalElement("SequenceNumber", params.sequenceNumber));
      }

      if (params.puTime) lines.push(optionalElement("puTime", params.puTime));
      if (params.puRemark) lines.push(optionalElement("puRemark", params.puRemark));
      if (params.puExternalPointID) lines.push(optionalElement("puExternalPointID", params.puExternalPointID));
      if (params.doTime) lines.push(optionalElement("doTime", params.doTime));
      if (params.doRemark) lines.push(optionalElement("doRemark", params.doRemark));
      if (params.doExternalPointID) lines.push(optionalElement("doExternalPointID", params.doExternalPointID));
      if (params.remarks) lines.push(optionalElement("Remarks", params.remarks));

      lines.push("</AmendServiceRemarksRequest>");

      const xml = client.buildRequest(lines.join("\n"));
      const result = await client.post(xml);
      return { content: [{ type: "text", text: formatResponse(result) }] };
    }
  );

  // ── DELETE SERVICE ─────────────────────────────────────────────────────────
  server.registerTool(
    "hostconnect_delete_service",
    {
      title: "Delete Service Line",
      description: `Delete (remove) a service line from a booking in Tourplan HostConnect.

WARNING: This permanently removes the service line. Use cancel_services to cancel instead of delete when the booking should be kept with a cancelled status.

Args:
  - ref (string): Booking reference. Use this OR bookingId.
  - bookingId (number): Numeric booking ID. Use this OR ref.
  - serviceLineId (number | string): ID of the service line to delete. Accepts number or numeric string.
  - sendSupplierMessage (string): Y=send supplier message, N=suppress. Optional.

Returns:
  JSON confirmation of the deletion.`,
      inputSchema: z.object({
        ref: z.string().optional().describe("Booking reference"),
        bookingId: z.number().int().optional().describe("Numeric booking ID"),
        serviceLineId: z.coerce.number().int().describe("Service line ID to delete (accepts number or numeric string)"),
        sendSupplierMessage: z.enum(["Y", "N"]).optional().describe("Y=send supplier message, N=suppress"),
      }).refine(d => d.ref || d.bookingId, { message: "Either ref or bookingId must be provided" }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    async (params) => {
      const lines = ["<DeleteServiceRequest>", client.authXml()];
      if (params.ref) lines.push(optionalElement("Ref", params.ref));
      else if (params.bookingId) lines.push(optionalElement("BookingId", params.bookingId));
      lines.push(optionalElement("ServiceLineId", params.serviceLineId));
      if (params.sendSupplierMessage) lines.push(optionalElement("SendSupplierMessage", params.sendSupplierMessage));
      lines.push("</DeleteServiceRequest>");

      const xml = client.buildRequest(lines.join("\n"));
      const result = await client.post(xml);
      return { content: [{ type: "text", text: formatResponse(result) }] };
    }
  );

  // ── CANCEL SERVICES ────────────────────────────────────────────────────────
  server.registerTool(
    "hostconnect_cancel_services",
    {
      title: "Cancel Services",
      description: `Cancel all services on a booking in Tourplan HostConnect (changes status to cancelled, does not delete).

Note: If the booking contains service lines linked to an external supplier system, those lines must be already cancelled (via delete_service) before this request will succeed.

Args:
  - ref (string): Booking reference. Use this OR bookingId.
  - bookingId (number): Numeric booking ID. Use this OR ref.
  - sendSupplierMessage (string): Y=send cancellation messages, N=suppress. Optional.

Returns:
  JSON confirmation of the cancellation.`,
      inputSchema: z.object({
        ref: z.string().optional().describe("Booking reference"),
        bookingId: z.number().int().optional().describe("Numeric booking ID"),
        sendSupplierMessage: z.enum(["Y", "N"]).optional().describe("Y=send cancellation messages, N=suppress"),
      }).refine(d => d.ref || d.bookingId, { message: "Either ref or bookingId must be provided" }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async (params) => {
      const lines = ["<CancelServicesRequest>", client.authXml()];
      if (params.ref) lines.push(optionalElement("Ref", params.ref));
      else if (params.bookingId) lines.push(optionalElement("BookingId", params.bookingId));
      if (params.sendSupplierMessage) lines.push(optionalElement("SendSupplierMessage", params.sendSupplierMessage));
      lines.push("</CancelServicesRequest>");

      const xml = client.buildRequest(lines.join("\n"));
      const result = await client.post(xml);
      return { content: [{ type: "text", text: formatResponse(result) }] };
    }
  );

  // ── ACCEPT SERVICE ─────────────────────────────────────────────────────────
  server.registerTool(
    "hostconnect_accept_service",
    {
      title: "Accept Service",
      description: `Accept a service that was booked on-request in Tourplan HostConnect.

Args:
  - ref (string): Booking reference. Use this OR bookingId.
  - bookingId (number): Numeric booking ID. Use this OR ref.
  - serviceLineId (number | string): ID of the service line to accept. Accepts number or numeric string.

Returns:
  JSON confirmation of the acceptance.`,
      inputSchema: z.object({
        ref: z.string().optional().describe("Booking reference"),
        bookingId: z.number().int().optional().describe("Numeric booking ID"),
        serviceLineId: z.coerce.number().int().describe("Service line ID to accept (accepts number or numeric string)"),
      }).refine(d => d.ref || d.bookingId, { message: "Either ref or bookingId must be provided" }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (params) => {
      const lines = ["<AcceptServiceRequest>", client.authXml()];
      if (params.ref) lines.push(optionalElement("Ref", params.ref));
      else if (params.bookingId) lines.push(optionalElement("BookingId", params.bookingId));
      lines.push(optionalElement("ServiceLineId", params.serviceLineId));
      lines.push("</AcceptServiceRequest>");

      const xml = client.buildRequest(lines.join("\n"));
      const result = await client.post(xml);
      return { content: [{ type: "text", text: formatResponse(result) }] };
    }
  );

  // ── RECORD BOOKING PAYMENT ─────────────────────────────────────────────────
  server.registerTool(
    "hostconnect_record_payment",
    {
      title: "Record Booking Payment",
      description: `Record a payment against a booking in Tourplan HostConnect.

Args:
  - ref (string): Booking reference. Use this OR bookingId.
  - bookingId (number): Numeric booking ID. Use this OR ref.
  - receiptType (string): Payment/receipt type code. Required.
  - receivedExclusive (number): Payment amount exclusive of tax. Required.
  - receivedTax (number): Tax amount. Required (use 0 if no tax).
  - receiptReference (string): Reference for this payment. Optional.
  - receiptAmountBookingCurrency (number): Amount in booking currency. Optional.

Returns:
  JSON with payment confirmation including ReceiptReference and updated totals.`,
      inputSchema: z.object({
        ref: z.string().optional().describe("Booking reference"),
        bookingId: z.number().int().optional().describe("Numeric booking ID"),
        receiptType: z.string().describe("Payment receipt type code"),
        receivedExclusive: z.number().describe("Payment amount (excl. tax)"),
        receivedTax: z.number().describe("Tax amount (0 if no tax)"),
        receiptReference: z.string().optional().describe("Payment reference number"),
        receiptAmountBookingCurrency: z.number().optional().describe("Amount in booking currency"),
      }).refine(d => d.ref || d.bookingId, { message: "Either ref or bookingId must be provided" }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (params) => {
      const lines = ["<RecordBookingPaymentRequest>", client.authXml()];
      if (params.ref) lines.push(optionalElement("Ref", params.ref));
      else if (params.bookingId) lines.push(optionalElement("BookingId", params.bookingId));
      lines.push(optionalElement("ReceiptType", params.receiptType));
      lines.push(optionalElement("ReceivedExclusive", params.receivedExclusive));
      lines.push(optionalElement("ReceivedTax", params.receivedTax));
      if (params.receiptReference) lines.push(optionalElement("ReceiptReference", params.receiptReference));
      if (params.receiptAmountBookingCurrency !== undefined) {
        lines.push(optionalElement("ReceiptAmountBookingCurrency", params.receiptAmountBookingCurrency));
      }
      lines.push("</RecordBookingPaymentRequest>");

      const xml = client.buildRequest(lines.join("\n"));
      const result = await client.post(xml);
      return { content: [{ type: "text", text: formatResponse(result) }] };
    }
  );
}

// ── COMBINED SERVICE LINE TOOLS (for backward compatibility) ──────────────────
export function registerServiceLineTools(server: McpServer, client: HostConnectClient): void {
  registerReadOnlyServiceLineTools(server, client);
  registerWriteServiceLineTools(server, client);
}
