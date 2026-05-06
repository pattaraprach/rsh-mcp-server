# hostconnect-mcp-server

An MCP (Model Context Protocol) server that enables LLMs to interact with **Tourplan's HostConnect API** — the XML-based interface for travel reservations management.

## Overview

This server exposes Tourplan HostConnect functionality as MCP tools, allowing AI assistants like Claude to:
- Search for travel products (hotels, tours, transfers, activities)
- Create and manage bookings
- Handle payments and cancellations
- Query agent, supplier, and currency information

## Tools

### Info & Search
| Tool | Description |
|------|-------------|
| `hostconnect_ping` | Test server connectivity |
| `hostconnect_agent_info` | Get agent account details |
| `hostconnect_option_info` | **Search for available products/services** (main search tool) |
| `hostconnect_get_locations` | List all location codes |
| `hostconnect_get_services` | List all service type codes |
| `hostconnect_supplier_info` | Get supplier details |
| `hostconnect_get_currency_conversions` | Get currency exchange rates |

### Booking Management
| Tool | Description |
|------|-------------|
| `hostconnect_add_service` | **Create a new booking OR add a service to an existing one** |
| `hostconnect_get_booking` | Retrieve full booking details |
| `hostconnect_list_bookings` | Search and list bookings |
| `hostconnect_update_booking` | Update booking header (name, status, remarks) |
| `hostconnect_set_booking_remarks` | Set booking remarks |
| `hostconnect_quote_to_book` | Convert a quote to a confirmed booking |

### Service Line Operations
| Tool | Description |
|------|-------------|
| `hostconnect_update_service` | Update a service line |
| `hostconnect_delete_service` | Permanently delete a service line |
| `hostconnect_cancel_services` | Cancel all services on a booking |
| `hostconnect_accept_service` | Accept an on-request service |

### Payments & Messages
| Tool | Description |
|------|-------------|
| `hostconnect_record_payment` | Record a payment against a booking |
| `hostconnect_get_payment_summary` | Get payment summary and balance |
| `hostconnect_get_booking_message` | Retrieve booking documents (invoice, voucher, etc.) |

## Read-Only Mode

The server can be run in a restricted **read-only mode** that only allows read operations, preventing any modifications to bookings or services.

### Enabling Read-Only Mode

Set the `READ_ONLY_MODE` environment variable to `true`:

```bash
READ_ONLY_MODE=true npm start
```

### Use Cases

- **Production deployments** where you want to prevent accidental modifications
- **Demo environments** for showcasing capabilities without risk
- **Audit/review scenarios** where data should not be altered
- **Limited access** for users who only need to view booking information

### Available Tools in Read-Only Mode

When read-only mode is enabled, only these 11 tools are available:

| Tool | Description |
|------|-------------|
| `hostconnect_ping` | Test connectivity |
| `hostconnect_agent_info` | Get agent details |
| `hostconnect_option_info` | Search available services |
| `hostconnect_get_locations` | Get location codes |
| `hostconnect_get_services` | Get service types |
| `hostconnect_supplier_info` | Get supplier details |
| `hostconnect_get_currency_conversions` | Get currency rates |
| `hostconnect_get_booking` | Get booking details |
| `hostconnect_list_bookings` | Search bookings |
| `hostconnect_get_payment_summary` | Get payment summary |
| `hostconnect_get_booking_message` | Get booking documents |

### Tools Disabled in Read-Only Mode

These 9 tools are disabled when read-only mode is active:

- `hostconnect_add_service`
- `hostconnect_update_booking`
- `hostconnect_set_booking_remarks`
- `hostconnect_quote_to_book`
- `hostconnect_update_service`
- `hostconnect_delete_service`
- `hostconnect_cancel_services`
- `hostconnect_accept_service`
- `hostconnect_record_payment`

## Setup

### Prerequisites
- Node.js 18+
- Access to a Tourplan HostConnect server

### Installation

```bash
npm install
npm run build
```

### Configuration

Set the following environment variables:

```bash
export HOSTCONNECT_URL="http://your-tourplan-server/hostConnect"
export HOSTCONNECT_AGENT_ID="your_agent_id"
export HOSTCONNECT_PASSWORD="your_password"

# Optional
export TRANSPORT="stdio"          # or "http" for HTTP transport
export PORT="3000"                 # only used when TRANSPORT=http
export HOSTCONNECT_TIMEOUT_MS="30000"
export READ_ONLY_MODE="true"      # enable read-only mode (disables write operations)
```

### Running

**stdio mode** (for use with Claude Desktop / MCP clients):
```bash
HOSTCONNECT_URL=http://... HOSTCONNECT_AGENT_ID=... HOSTCONNECT_PASSWORD=... npm start
```

**HTTP mode** (for remote/multi-client access):
```bash
TRANSPORT=http HOSTCONNECT_URL=http://... HOSTCONNECT_AGENT_ID=... HOSTCONNECT_PASSWORD=... npm start
```

**Read-only mode** (prevents any modifications):
```bash
READ_ONLY_MODE=true HOSTCONNECT_URL=http://... HOSTCONNECT_AGENT_ID=... HOSTCONNECT_PASSWORD=... npm start
```

## Claude Desktop Configuration

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "hostconnect": {
      "command": "node",
      "args": ["/path/to/hostconnect-mcp-server/dist/index.js"],
      "env": {
        "HOSTCONNECT_URL": "http://your-server/hostConnect",
        "HOSTCONNECT_AGENT_ID": "your_agent_id",
        "HOSTCONNECT_PASSWORD": "your_password"
      }
    }
  }
}
```

## Example Usage

Once connected, you can ask Claude things like:

- *"Search for hotels in Auckland for 2 adults from 15 March to 20 March"*
- *"Create a booking for John Smith with a 3-night stay at option AKLAPT01 starting 15 March"*
- *"Get the details of booking ABC123"*
- *"List all bookings with travel in April"*
- *"Record a payment of $500 against booking ABC123"*
- *"Cancel all services on booking XYZ789"*

## HostConnect API

This server implements Tourplan HostConnect version **5.05.000**. The API uses XML over HTTP POST. Each request includes agent authentication credentials.

Key HostConnect concepts:
- **Options** (`Opt`) — product/service codes (e.g. `AKLAPT01`)
- **QB** — Quote (`Q`) or Booking (`B`) flag when creating a booking
- **SCUqty** — Service Charge Units (nights, days, etc.)
- **ServiceLineId** — ID of a specific service within a booking
- **Fixed services** — externally-priced services with custom pricing supplied in the request

## Architecture

```
src/
├── index.ts                    # Entry point, transport setup
├── types.ts                    # TypeScript types
├── constants.ts                # Constants
├── services/
│   └── hostconnect-client.ts   # XML client, request builder, XML parser
└── tools/
    ├── info-tools.ts           # Search, agent, supplier, location tools
    ├── booking-tools.ts        # Booking CRUD tools
    └── service-line-tools.ts   # Service line management + payments
```
