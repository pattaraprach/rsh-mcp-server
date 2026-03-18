import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { HostConnectClient, formatResponse, optionalElement } from "../services/hostconnect-client.js";

export function registerServiceLineTools(server: McpServer, client: HostConnectClient): void {

  // ── UPDATE SERVICE ─────────────────────────────────────────────────────────
  server.registerTool(
    "hostconnect_update_service",
    {
      title: "Update Service Line",
      description: `Update an existing service line on a booking in Tourplan HostConnect.

For fixed services all fields can be updated. For regular service lines only: SequenceNumber, pickup/dropoff times and remarks, general Remarks, SupplierConfirmation, TourplanServiceStatus, ServiceLineNotes.

Args:
  - ref (string): Booking reference. Use this OR bookingId.
  - bookingId (number): Numeric booking ID. Use this OR ref.
  - serviceLineId (number): ID of the service line to update. Required.
  - dateFrom (string): New service start date YYYY-MM-DD. Optional.
  - adults (number): New adult count. Optional.
  - children (number): New children count. Optional.
  - infants (number): New infant count. Optional.
  - roomType (string): New room type. Optional.
  - scuQty (number): New service unit quantity. Optional.
  - remarks (string): Updated remarks. Optional.
  - tourplanServiceStatus (string): New service status code. Optional.
  - supplierConfirmation (string): Supplier confirmation number. Optional.
  - puTime (string): Pickup time. Optional.
  - puRemark (string): Pickup remark. Optional.
  - doTime (string): Dropoff time. Optional.
  - doRemark (string): Dropoff remark. Optional.
  - sequenceNumber (number): New sequence number. Optional.

Returns:
  JSON confirmation with ServiceLineUpdateCount.`,
      inputSchema: z.object({
        ref: z.string().optional().describe("Booking reference"),
        bookingId: z.number().int().optional().describe("Numeric booking ID"),
        serviceLineId: z.number().int().describe("Service line ID to update"),
        dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("New service start date YYYY-MM-DD"),
        adults: z.number().int().min(1).optional().describe("New adult count"),
        children: z.number().int().min(0).optional().describe("New children count"),
        infants: z.number().int().min(0).optional().describe("New infant count"),
        roomType: z.string().optional().describe("New room type code"),
        scuQty: z.number().int().min(1).optional().describe("New service unit quantity"),
        remarks: z.string().optional().describe("Updated service remarks"),
        tourplanServiceStatus: z.string().max(2).optional().describe("New service status code"),
        supplierConfirmation: z.string().max(30).optional().describe("Supplier confirmation number"),
        puTime: z.string().optional().describe("Pickup time"),
        puRemark: z.string().optional().describe("Pickup remark"),
        doTime: z.string().optional().describe("Dropoff time"),
        doRemark: z.string().optional().describe("Dropoff remark"),
        sequenceNumber: z.number().int().optional().describe("New service sequence number"),
      }).refine(d => d.ref || d.bookingId, { message: "Either ref or bookingId must be provided" }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (params) => {
      const lines = ["<UpdateServiceRequest>", client.authXml()];

      if (params.ref) lines.push(optionalElement("Ref", params.ref));
      else if (params.bookingId) lines.push(optionalElement("BookingId", params.bookingId));

      lines.push(optionalElement("ServiceLineId", params.serviceLineId));

      if (params.dateFrom) lines.push(optionalElement("DateFrom", params.dateFrom));
      if (params.sequenceNumber !== undefined) lines.push(optionalElement("SequenceNumber", params.sequenceNumber));
      if (params.adults) lines.push(optionalElement("Adults", params.adults));
      if (params.children !== undefined) lines.push(optionalElement("Children", params.children));
      if (params.infants !== undefined) lines.push(optionalElement("Infants", params.infants));
      if (params.roomType) lines.push(optionalElement("RoomType", params.roomType));
      if (params.scuQty) lines.push(optionalElement("SCUqty", params.scuQty));
      if (params.puTime) lines.push(optionalElement("puTime", params.puTime));
      if (params.puRemark) lines.push(optionalElement("puRemark", params.puRemark));
      if (params.doTime) lines.push(optionalElement("doTime", params.doTime));
      if (params.doRemark) lines.push(optionalElement("doRemark", params.doRemark));
      if (params.remarks) lines.push(optionalElement("Remarks", params.remarks));
      if (params.tourplanServiceStatus) lines.push(optionalElement("TourplanServiceStatus", params.tourplanServiceStatus));
      if (params.supplierConfirmation) lines.push(optionalElement("SupplierConfirmation", params.supplierConfirmation));

      lines.push("</UpdateServiceRequest>");

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
  - serviceLineId (number): ID of the service line to delete. Required.
  - sendSupplierMessage (string): Y=send supplier message, N=suppress. Optional.

Returns:
  JSON confirmation of the deletion.`,
      inputSchema: z.object({
        ref: z.string().optional().describe("Booking reference"),
        bookingId: z.number().int().optional().describe("Numeric booking ID"),
        serviceLineId: z.number().int().describe("Service line ID to delete"),
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
  - serviceLineId (number): ID of the service line to accept. Required.

Returns:
  JSON confirmation of the acceptance.`,
      inputSchema: z.object({
        ref: z.string().optional().describe("Booking reference"),
        bookingId: z.number().int().optional().describe("Numeric booking ID"),
        serviceLineId: z.number().int().describe("Service line ID to accept"),
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
