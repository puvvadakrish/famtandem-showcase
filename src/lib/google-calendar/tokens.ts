import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const TOKEN_PREFIX = "v1";

export function encryptGoogleRefreshToken(token: string, secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFromSecret(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    TOKEN_PREFIX,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url")
  ].join(".");
}

export function decryptGoogleRefreshToken(encryptedToken: string, secret: string) {
  const [version, ivValue, tagValue, ciphertextValue] = encryptedToken.split(".");
  if (version !== TOKEN_PREFIX || !ivValue || !tagValue || !ciphertextValue) {
    throw new Error("Google Calendar token is not readable.");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    keyFromSecret(secret),
    Buffer.from(ivValue, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final()
  ]).toString("utf8");
}

function keyFromSecret(secret: string) {
  return createHash("sha256").update(secret).digest();
}
