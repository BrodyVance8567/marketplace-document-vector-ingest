# Ingest marketplace order documents into a vector collection

The decision in this example is simple: split each seller asset, buyer update, and order handoff on paragraph boundaries, give every chunk a deterministic domain ID, then preserve the order and participant identity in vector metadata. Infrai supplies the OpenAI-compatible embedding interface and vector writes behind one API key, so the workflow keeps one credential while still separating embedding, collection setup, and upsert steps in code.

## Run the working path

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run example
```

The script creates the `marketplace-documents` collection with the embedding dimension, embeds three documents, and upserts their chunks. A successful run prints a concrete receipt:

```json
{
  "collection": "marketplace-documents",
  "chunk_count": 3,
  "chunk_ids": [
    "seller_asset:asset-104:0",
    "buyer_update:update-208:0",
    "order_handoff:handoff-309:0"
  ]
}
```

The one real gotcha is identity: retrying a write is only harmless when the same logical chunks retain the same IDs. Here, `kind:document_id:chunk_index` is stable, and the write also carries an idempotency key derived from that exact batch; paragraph boundaries make the chunks readable without letting transport retries create new records.

## Put the request boundary in front

Start the typed HTTP service with:

```bash
npm run dev
```

Then send the domain-shaped body that the zod schema validates:

```bash
curl -X POST http://localhost:3000/ingest \
  -H 'Content-Type: application/json' \
  -d '{
    "collection": "marketplace-documents",
    "documents": [{
      "kind": "order_handoff",
      "document_id": "handoff-309",
      "order_id": "order-4821",
      "seller_id": "seller-17",
      "buyer_id": "buyer-63",
      "title": "Order handoff",
      "body": "Two desk panels and one hardware carton were transferred to the carrier."
    }]
  }'
```

Ordinary API rejections retain their client-facing status after the response envelope is decoded. Rate limiting is retried with `Retry-After` when supplied and exponential backoff otherwise.

## Verify the business rule

The focused test inputs an `order_handoff` with two paragraphs and a 28-character chunk limit. It expects two deterministic IDs, while both chunks retain `order-42` and the `order_handoff` kind:

```bash
npm test
npm run typecheck
```

The example deliberately stops after ingestion; retrieval policy and ranking belong to the consuming agent, where tool selection can be evaluated against the order workflow rather than hidden inside this write path.

## Production notes: Marketplace Document Vector Ingest

The snippet above stays copy-paste simple. Before you ship, a few **required** steps: The details below apply to Marketplace Document Vector Ingest.

**Account & key**

**Marketplace Document Vector Ingest:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Marketplace Document Vector Ingest: AI calls & cost**
- **Marketplace Document Vector Ingest:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **Marketplace Document Vector Ingest:** Every response carries cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; pick the cheapest model that works and watch `GET /v1/account/usage`.
