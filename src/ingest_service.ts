import express from "express";
import { z } from "zod";
import { InfraiError, MarketplaceVectorIngestor } from "./marketplace_ingest.js";

const documentSchema = z.object({
  kind: z.enum(["seller_asset", "buyer_update", "order_handoff"]),
  document_id: z.string().min(1),
  order_id: z.string().min(1),
  seller_id: z.string().min(1),
  buyer_id: z.string().min(1).optional(),
  title: z.string().min(1),
  body: z.string().min(1),
});

const ingestSchema = z.object({
  collection: z.string().min(1),
  documents: z.array(documentSchema).min(1),
});

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");

const app = express();
app.use(express.json({ limit: "1mb" }));

app.post("/ingest", async (request, response) => {
  const parsed = ingestSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "invalid_request", issues: parsed.error.issues });
    return;
  }

  try {
    const ingestor = new MarketplaceVectorIngestor(apiKey, parsed.data.collection);
    response.status(200).json(await ingestor.ingest(parsed.data.documents));
  } catch (error) {
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      response.status(status).json({ error: error.code, message: error.message });
      return;
    }
    response.status(502).json({ error: "ingest_failed", message: error instanceof Error ? error.message : "Unknown error" });
  }
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`Marketplace ingest service listening on http://localhost:${port}`));
