/**
 * DEV-8: Minimal Cloudflare R2 client for the Agent Loop tracer.
 *
 * R2 is the media storage backing the Assemble step of the Agent Loop
 * (Plan → Retrieve → Route → Execute → **Assemble** → Publish) — see
 * ARCHITECTURE.md §2 (Assemble) and §7 (Deployment Topology).
 * R2 exposes an S3-compatible API, so we reuse `@aws-sdk/client-s3`.
 */
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "@/env";

export class R2Service {
  private readonly client: S3Client;

  constructor() {
    this.client = new S3Client({
      region: "auto",
      endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      },
    });
  }

  async upload(
    key: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<string> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: env.R2_BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      }),
    );

    return `${env.R2_PUBLIC_URL}/${key}`;
  }
}

export const r2Service = new R2Service();
