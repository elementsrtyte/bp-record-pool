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

export function buildPlaylistCoverPrompt(playlistName: string): string {
  const title = sanitizePlaylistName(playlistName) || "Untitled playlist";
  return [
    `Square 1:1 album-art cover for a DJ record-pool playlist inspired by the title: "${title}".`,
    "Brand tone: Blueprint Pool — curated electronic music for working DJs; premium, trustworthy, nightlife energy without cliché stock imagery.",
    "Visuals: deep charcoal or near-black ground, electric blue and soft white accent light, abstract waveform or vinyl-groove suggestion, subtle grain/noise for texture.",
    "Composition: bold minimal layout with a calm center (suitable for optional text overlay later); edge-to-edge, no borders, no frames.",
    "Constraints: no readable words or letters, no logos, no real celebrity faces, no photorealistic people. Stylized typography textures only if illegible.",
    "Mood: modern streaming platform / Beatport-adjacent sophistication; cohesive, high contrast, sharp.",
  ].join(" ");
}

type OpenAIImageRow = { b64_json?: string; url?: string };

type OpenAIImageResponse = {
  data?: OpenAIImageRow[];
  error?: { message?: string; type?: string; code?: string };
};

export async function generatePlaylistCoverPng(
  playlistName: string,
): Promise<{ buffer: Buffer; mime: "image/png" }> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const model = (process.env.OPENAI_IMAGE_MODEL ?? "dall-e-3").trim();
  const prompt = buildPlaylistCoverPrompt(playlistName);

  const isDallE3 = model === "dall-e-3";
  const body: Record<string, unknown> = {
    model,
    prompt,
    n: 1,
    response_format: "b64_json",
  };

  if (isDallE3) {
    body.size = "1024x1024";
    body.quality = process.env.OPENAI_IMAGE_QUALITY === "hd" ? "hd" : "standard";
  } else {
    body.size = process.env.OPENAI_IMAGE_SIZE ?? "1024x1024";
    body.quality = process.env.OPENAI_IMAGE_QUALITY_GPT ?? "medium";
    if (model.includes("gpt-image")) {
      body.output_format = "png";
    }
  }

  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  const json = (await res.json()) as OpenAIImageResponse;
  if (!res.ok) {
    const msg = json.error?.message ?? res.statusText;
    throw new Error(msg || `OpenAI images error (${res.status})`);
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
    throw new Error("OpenAI returned no image data");
  }

  return { buffer: buf, mime: "image/png" };
}
