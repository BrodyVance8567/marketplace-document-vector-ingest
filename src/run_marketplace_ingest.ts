import { MarketplaceVectorIngestor, type MarketplaceDocument } from "./marketplace_ingest.js";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before running the example");

const documents: MarketplaceDocument[] = [
  {
    kind: "seller_asset",
    document_id: "asset-104",
    order_id: "order-4821",
    seller_id: "seller-17",
    title: "Walnut desk care guide",
    body: "Wipe the surface with a dry microfiber cloth.\n\nKeep the desk away from direct heat and standing water.",
  },
  {
    kind: "buyer_update",
    document_id: "update-208",
    order_id: "order-4821",
    seller_id: "seller-17",
    buyer_id: "buyer-63",
    title: "Delivery access note",
    body: "The freight elevator is available after 14:00. Call the building desk on arrival.",
  },
  {
    kind: "order_handoff",
    document_id: "handoff-309",
    order_id: "order-4821",
    seller_id: "seller-17",
    buyer_id: "buyer-63",
    title: "Order handoff",
    body: "Two desk panels and one hardware carton were transferred to the carrier. Assembly instructions are attached to carton one.",
  },
];

const result = await new MarketplaceVectorIngestor(apiKey, "marketplace-documents").ingest(documents);
console.log(JSON.stringify(result, null, 2));
