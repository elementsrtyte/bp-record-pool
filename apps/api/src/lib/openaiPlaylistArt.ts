/**
 * OpenAI Images API — playlist cover generation for admin/testing.
 * @see https://platform.openai.com/docs/api-reference/images/create
 */

const OPENAI_URL = "https://api.openai.com/v1/images/generations";

function sanitizePlaylistName(name: string): string {
  return name
    .trim()
    .replace(/[^\p{L}\p{N}\s\-_'.,&]/gu, " ")
    .replace(/\s+/g, " ")
    .slice(0, 160);
}

function sanitizePlaylistDescription(desc: string): string {
  return desc
    .trim()
    .replace(/[^\p{L}\p{N}\s\-_'.,&]/gu, " ")
    .replace(/\s+/g, " ")
    .slice(0, 420);
}

export function buildPlaylistCoverPrompt(playlistName: string, playlistDescription?: string | null): string {
  const title = sanitizePlaylistName(playlistName) || "Untitled playlist";
  const blurb = sanitizePlaylistDescription(playlistDescription ?? "");
  const contextLine = blurb
    ? `Playlist concept — title: "${title}". Mood and themes from the curator description (abstract visual inspiration only): ${blurb}`
    : `Playlist concept — title: "${title}".`;

  return [
    "Square 1:1 music streaming playlist cover art, full bleed, edge-to-edge.",
    'Visual style: in the spirit of Spotify\'s algorithmic playlist covers — vivid saturated color, soft volumetric gradients, flowing abstract blobs and organic shapes, subtle mesh-gradient lighting, duotone or harmonious multi-hue palettes, luminous accent glows, modern flat-with-depth illustration (not 3D render, not stock photo).',
    "Energy: upbeat, premium, energetic, nightclub-friendly; colors should pop and feel fresh, never dull or muddy.",
    contextLine,
    "Composition: balanced abstract focal area; rich color fields that read well at small thumbnail size; no frames, no borders, no device mockups.",
    "Hard constraints: absolutely no readable text, letters, numbers, or logos; no brand marks; no photorealistic people or celebrity likenesses; no interface chrome.",
  ].join(" ");
}

type OpenAIImageRow = { b64_json?: string; url?: string };

type OpenAIImageResponse = {
  data?: OpenAIImageRow[];
  error?: { message?: string; type?: string; code?: string; param?: string };
};

function timeoutMs(): number {
  const raw = Number(process.env.OPENAI_IMAGE_TIMEOUT_MS ?? "180000");
  return Number.isFinite(raw) && raw >= 10_000 ? Math.min(raw, 600_000) : 180_000;
}

function parseOpenAiResponse(res: Response, rawText: string): OpenAIImageResponse {
  if (!rawText.trim()) {
    return { error: { message: `Empty response body (HTTP ${res.status})` } };
  }
  try {
    return JSON.parse(rawText) as OpenAIImageResponse;
  } catch {
    return { error: { message: rawText.slice(0, 500) || `Non-JSON response (HTTP ${res.status})` } };
  }
}

function openAiErrorDetail(json: OpenAIImageResponse, status: number): string {
  const e = json.error;
  if (!e?.message) return `OpenAI images error (HTTP ${status})`;
  const bits = [e.message];
  if (e.code) bits.push(`code=${e.code}`);
  if (e.type) bits.push(`type=${e.type}`);
  if (e.param) bits.push(`param=${e.param}`);
  return bits.join(" · ");
}

export async function generatePlaylistCoverPng(
  playlistName: string,
  playlistDescription?: string | null,
): Promise<{ buffer: Buffer; mime: "image/png" }> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const model = (process.env.OPENAI_IMAGE_MODEL ?? "dall-e-3").trim();
  const prompt = buildPlaylistCoverPrompt(playlistName, playlistDescription);

  const isDallE3 = model === "dall-e-3";
  const isDallE2 = model === "dall-e-2";
  const isGptImage = /^gpt-image/i.test(model);

  const body: Record<string, unknown> = {
    model,
    prompt,
    n: 1,
  };

  if (isGptImage) {
    // GPT Image models return base64 by default; `response_format` is not supported (returns 400).
    body.size = process.env.OPENAI_IMAGE_SIZE ?? "1024x1024";
    body.quality = process.env.OPENAI_IMAGE_QUALITY_GPT ?? "medium";
    body.output_format = "png";
  } else if (isDallE3) {
    body.response_format = "b64_json";
    body.size = "1024x1024";
    body.quality = process.env.OPENAI_IMAGE_QUALITY === "hd" ? "hd" : "standard";
  } else if (isDallE2) {
    body.response_format = "b64_json";
    const size = process.env.OPENAI_IMAGE_SIZE ?? "1024x1024";
    body.size = ["256x256", "512x512", "1024x1024"].includes(size) ? size : "1024x1024";
  } else {
    // Unknown model id: same shape as DALL·E 3 (older deployments / custom IDs).
    body.response_format = "b64_json";
    body.size = "1024x1024";
    body.quality = process.env.OPENAI_IMAGE_QUALITY === "hd" ? "hd" : "standard";
  }

  let res: Response;
  try {
    res = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs()),
    });
  } catch (e) {
    const name = (e as Error).name;
    if (name === "TimeoutError" || name === "AbortError") {
      throw new Error(
        `OpenAI request timed out after ${timeoutMs()}ms. Try OPENAI_IMAGE_TIMEOUT_MS (up to 600000) or generate again.`,
      );
    }
    throw new Error((e as Error).message ?? "OpenAI request failed (network)");
  }

  const rawText = await res.text();
  const json = parseOpenAiResponse(res, rawText);

  if (!res.ok) {
    throw new Error(openAiErrorDetail(json, res.status));
  }

  const row = json.data?.[0];
  let buf: Buffer | null = null;
  if (row?.b64_json) {
    buf = Buffer.from(row.b64_json, "base64");
  } else if (row?.url) {
    const imgRes = await fetch(row.url);
    if (!imgRes.ok) {
      throw new Error("Failed to download generated image URL from OpenAI");
    }
    buf = Buffer.from(await imgRes.arrayBuffer());
  }

  if (!buf?.length) {
    throw new Error(
      json.error?.message ??
        "OpenAI returned no image data (check model name and account image API access)",
    );
  }

  return { buffer: buf, mime: "image/png" };
}
