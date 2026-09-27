import assert from "node:assert/strict";
import test from "node:test";
import { chunkMarketplaceDocument } from "../src/marketplace_ingest.js";

test("an order handoff keeps its order identity on every deterministic chunk", () => {
  const chunks = chunkMarketplaceDocument({
    kind: "order_handoff",
    document_id: "handoff-9",
    order_id: "order-42",
    seller_id: "seller-7",
    buyer_id: "buyer-3",
    title: "Carrier handoff",
    body: "First carton transferred.\n\nSecond carton transferred.",
  }, 28);

  assert.deepEqual(chunks.map((chunk) => chunk.id), [
    "order_handoff:handoff-9:0",
    "order_handoff:handoff-9:1",
  ]);
  assert.ok(chunks.every((chunk) => chunk.metadata.order_id === "order-42"));
  assert.ok(chunks.every((chunk) => chunk.metadata.kind === "order_handoff"));
});
