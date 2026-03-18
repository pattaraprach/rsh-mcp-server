// HostConnect API types

export interface HostConnectConfig {
  baseUrl: string;
  agentId: string;
  password: string;
  timeoutMs?: number;
}

export interface HostConnectResponse {
  success: boolean;
  errorMessage?: string;
  data?: Record<string, unknown>;
  rawXml?: string;
}

// Booking status types
export type BookingStatus = string; // 2-char Tourplan booking status code

// Room configuration
export interface RoomConfig {
  adults: number;
  children?: number;
  infants?: number;
  roomType?: string;
}

// Pricing for fixed services
export interface FixedServicePricing {
  costCurrency: string;
  costConversionRate: number;
  costExclusive: number;
  costTax: number;
  sellExclusive?: number;
  sellTax?: number;
  agentCurrency: string;
  agentExclusive: number;
  agentTax: number;
  retailExclusive?: number;
  retailTax?: number;
  itemDescription?: string;
  scuFocQty?: number;
}

// Payment details
export interface PaymentDetails {
  finalPaymentDate?: string;
  depositDueDate?: string;
  depositDueAmount?: number;
}

// Option info search parameters
export interface OptionInfoParams {
  opt?: string;
  optionNumber?: string;
  info?: string;
  dateFrom?: string;
  dateTo?: string;
  scuQty?: number;
  adults?: number;
  children?: number;
  infants?: number;
  roomType?: string;
  roomConfigs?: RoomConfig[];
  locationCode?: string;
  endLocationCode?: string;
  maxOptions?: number;
  indexFirstOption?: number;
  rateConvert?: string;
  noteCategory?: string;
  description?: string;
  supplierName?: string;
  priceCode?: string;
  externalSearchMode?: string;
  priceSelectionMethod?: string;
  rateId?: string;
}
