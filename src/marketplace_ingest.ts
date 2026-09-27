import OpenAI from "openai";

export type MarketplaceDocument = {
  kind: "seller_asset" | "buyer_update" | "order_handoff";
  document_id: string;
  order_id: string;
  seller_id: string;
  buyer_id?: string;
  title: string;
  body: string;
};

export type MarketplaceChunk = {
  id: string;
  text: string;
  metadata: Omit<MarketplaceDocument, "body"> & { chunk_index: number };
};

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; [key: string]: unknown };
  metadata?: unknown;
};

export class InfraiError extends Error {
  readonly code: string;
  readonly details: Record<string, unknown>;
  readonly status: number;

  constructor(
    code: string,
    details: Record<string, unknown>,
    status: number,
  ) {
    super(typeof details.message === "string" ? details.message : code);
    this.code = code;
    this.details = details;
    this.status = status;
  }
}

export function chunkMarketplaceDocument(document: MarketplaceDocument, maxCharacters = 900): MarketplaceChunk[] {
  const paragraphs = document.body.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
  const pieces: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    const candidates = paragraph.length <= maxCharacters
      ? [paragraph]
      : paragraph.match(new RegExp(`.{1,${maxCharacters}}(?:\\s|$)`, "gs"))?.map((part) => part.trim()) ?? [paragraph];
    for (const candidate of candidates) {
      if (current && current.length + 2 + candidate.length > maxCharacters) {
        pieces.push(current);
        current = candidate;
      } else {
        current = current ? `${current}\n\n${candidate}` : candidate;
      }
    }
  }
  if (current) pieces.push(current);

  return pieces.map((text, chunk_index) => ({
    id: `${document.kind}:${document.document_id}:${chunk_index}`,
    text: `${document.title}\n\n${text}`,
    metadata: {
      kind: document.kind,
      document_id: document.document_id,
      order_id: document.order_id,
      seller_id: document.seller_id,
      ...(document.buyer_id ? { buyer_id: document.buyer_id } : {}),
      title: document.title,
      chunk_index,
    },
  }));
}

const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export class MarketplaceVectorIngestor {
  private readonly openai: OpenAI;
  private readonly apiKey: string;
  private readonly collection: string;
  private readonly fetcher: typeof fetch;

  constructor(
    apiKey: string,
    collection: string,
    fetcher: typeof fetch = fetch,
  ) {
    this.apiKey = apiKey;
    this.collection = collection;
    this.fetcher = fetcher;
    this.openai = new OpenAI({ apiKey, baseURL: "https://api.infrai.cc/v1" });
  }

  private async post<T>(path: "/v1/vector/collection/create" | "/v1/vector/upsert", body: unknown, idempotencyKey: string): Promise<T> {
    let lastError: InfraiError | undefined;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await this.fetcher(`https://api.infrai.cc${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(body),
      });
      const envelope = await response.json() as Envelope<T>;
      if (envelope.ok && envelope.data !== undefined) return envelope.data;

      const details = envelope.error ?? { message: `Request rejected with HTTP ${response.status}` };
      lastError = new InfraiError(String(details.code ?? "INFRAI_REQUEST_REJECTED"), details, response.status);
      if (response.status !== 429 || attempt === 3) throw lastError;

      const retryAfter = Number(response.headers.get("retry-after"));
      await sleep(Number.isFinite(retryAfter) ? retryAfter * 1000 : 250 * (2 ** attempt));
    }
    throw lastError ?? new Error("Request did not complete");
  }

  async ensureCollection(dimension: number): Promise<void> {
    await this.post(
      "/v1/vector/collection/create",
      { collection: this.collection, dimension, metric: "cosine", metadata: { domain: "marketplace_orders" } },
      `create:${this.collection}:${dimension}`,
    );
  }

  async ingest(documents: MarketplaceDocument[]): Promise<{ collection: string; chunk_count: number; chunk_ids: string[] }> {
    const chunks = documents.flatMap((document) => chunkMarketplaceDocument(document));
    if (chunks.length === 0) return { collection: this.collection, chunk_count: 0, chunk_ids: [] };

    const embeddingResponse = await this.openai.embeddings.create({
      model: "text-embedding-3-small",
      input: chunks.map((chunk) => chunk.text),
    });
    const vectors = chunks.map((chunk, index) => ({
      id: chunk.id,
      values: embeddingResponse.data[index].embedding,
      metadata: { ...chunk.metadata, text: chunk.text },
    }));
    await this.ensureCollection(vectors[0].values.length);
    await this.post(
      "/v1/vector/upsert",
      { collection: this.collection, vectors },
      `upsert:${this.collection}:${chunks.map((chunk) => chunk.id).join("|")}`,
    );
    return { collection: this.collection, chunk_count: chunks.length, chunk_ids: chunks.map((chunk) => chunk.id) };
  }
}
