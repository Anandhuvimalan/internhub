import "server-only";
import { SignJWT, importPKCS8 } from "jose";
import { AppError } from "./errors";

/**
 * Signed Mux playback: the app only checks entitlement and issues a short JWT;
 * Mux's CDN streams the video, so video traffic never hits our servers.
 * Env: MUX_SIGNING_KEY_ID, MUX_SIGNING_PRIVATE_KEY (base64 PEM from Mux).
 */
export async function muxPlaybackToken(playbackId: string, ttlSeconds = 60 * 60 * 3) {
  const kid = process.env.MUX_SIGNING_KEY_ID;
  const b64 = process.env.MUX_SIGNING_PRIVATE_KEY;
  if (!kid || !b64) throw new AppError(503, "Video playback is not configured", "video_unconfigured");
  let pem = Buffer.from(b64, "base64").toString("utf8");
  if (pem.includes("BEGIN RSA PRIVATE KEY")) {
    // Mux issues PKCS#1; convert to PKCS#8 for jose
    const { createPrivateKey } = await import("node:crypto");
    pem = createPrivateKey(pem).export({ type: "pkcs8", format: "pem" }).toString();
  }
  const key = await importPKCS8(pem, "RS256");
  return new SignJWT({ aud: "v" })
    .setProtectedHeader({ alg: "RS256", kid })
    .setSubject(playbackId)
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSeconds)
    .sign(key);
}
