import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const bucket = process.env.S3_BUCKET;
const region = process.env.S3_REGION ?? "auto";
const endpoint = process.env.S3_ENDPOINT;
const publicBase = process.env.PUBLIC_ASSET_BASE_URL;

/** Empty `LOCAL_UPLOAD_DIR=` in .env would otherwise become mkdir(''). */
export function getLocalUploadRoot(): string {
  const raw = process.env.LOCAL_UPLOAD_DIR?.trim();
  if (raw) return path.resolve(raw);
  return path.join(process.cwd(), "uploads");
}

const localRoot = getLocalUploadRoot();

/** Path segments for `/files/...` URLs (keys may contain `/`). */
export function filesUrlPath(key: string): string {
  return key.split("/").filter(Boolean).map(encodeURIComponent).join("/");
}

function s3(): S3Client | null {
  if (!bucket || !process.env.S3_ACCESS_KEY_ID || !process.env.S3_SECRET_ACCESS_KEY) {
    return null;
  }
  return new S3Client({
    region,
    endpoint: endpoint || undefined,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    },
    forcePathStyle: Boolean(endpoint),
  });
}

export async function putObject(key: string, body: Buffer, contentType: string): Promise<void> {
  const client = s3();
  if (client && bucket) {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
    return;
  }
  const filePath = path.join(localRoot, key);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, body);
}

/** Read object bytes from S3 or local disk (same layout as `putObject`). */
export async function readObject(key: string): Promise<Buffer> {
  const k = key.trim();
  if (!k) throw new Error("empty key");
  const client = s3();
  if (client && bucket) {
    const out = await client.send(new GetObjectCommand({ Bucket: bucket, Key: k }));
    const raw = await out.Body?.transformToByteArray();
    if (!raw?.length) throw new Error(`empty or missing object: ${k}`);
    return Buffer.from(raw);
  }
  const filePath = path.join(localRoot, k);
  return readFile(filePath);
}

export async function deleteObject(key: string | null | undefined): Promise<void> {
  const k = key?.trim();
  if (!k) return;
  const client = s3();
  if (client && bucket) {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: k }));
    return;
  }
  const filePath = path.join(localRoot, k);
  try {
    await unlink(filePath);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
}

export async function signedGetUrl(key: string, expiresIn = 900): Promise<string> {
  const client = s3();
  if (client && bucket) {
    const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
    return getSignedUrl(client, cmd, { expiresIn });
  }
  if (publicBase) {
    return `${publicBase.replace(/\/$/, "")}/${key}`;
  }
  const base = process.env.API_PUBLIC_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/files/${filesUrlPath(key)}`;
}
