import { it, expect } from "vitest";
import { createServer } from "node:net";
import { totp, matchStep, encryptSecret, decryptSecret } from "@/lib/totp";
import { scanBytes } from "@/lib/malware";
it("matches the RFC 6238 SHA-1 vector and rejects used/old codes", () => {
  const key = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  expect(totp(key, 1)).toBe("287082"); // RFC 94287082 truncated to six digits
  expect(matchStep(key, "287082", BigInt(-1), 59000)).toBe(BigInt(1));
  expect(matchStep(key, "287082", BigInt(1), 59000)).toBeNull();
  expect(matchStep(key, "287082", BigInt(-1), 180000)).toBeNull();
  const encrypted = encryptSecret(key);
  expect(encrypted).not.toContain(key);
  expect(decryptSecret(encrypted)).toBe(key);
  const altered = Buffer.from(encrypted, "base64"); altered[30] ^= 1;
  expect(() => decryptSecret(altered.toString("base64"))).toThrow();
});
it("speaks ClamAV INSTREAM, detects malware and fails closed on protocol errors", async () => {
  const oldHost = process.env.CLAMAV_HOST, oldPort = process.env.CLAMAV_PORT;
  let reply = "stream: OK\0", signatureDate = new Date().toUTCString();
  const server = createServer(socket => {
    let bytes = Buffer.alloc(0);
    socket.on("data", chunk => {
      bytes = Buffer.concat([bytes, chunk]);
      if (bytes.toString() === "zVERSION\0") { socket.end(`ClamAV test/1/${signatureDate}\0`); return; }
      if (bytes.length >= 10 + 4 + 3 + 4) {
        expect(bytes.subarray(0, 10).toString()).toBe("zINSTREAM\0");
        expect(bytes.readUInt32BE(10)).toBe(3);
        expect(bytes.subarray(14, 17).toString()).toBe("abc");
        socket.end(reply);
      }
    });
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("No scanner test port");
  process.env.CLAMAV_HOST = "127.0.0.1"; process.env.CLAMAV_PORT = String(address.port);
  try {
    expect(await scanBytes(Buffer.from("abc"))).toBe("CLEAN");
    reply = "stream: Eicar-Signature FOUND\0";
    expect(await scanBytes(Buffer.from("abc"))).toBe("INFECTED");
    reply = "stream: scan limit exceeded ERROR\0";
    await expect(scanBytes(Buffer.from("abc"))).rejects.toThrow("Malware scan failed");
    signatureDate = new Date(0).toUTCString();
    await expect(scanBytes(Buffer.from("abc"))).rejects.toThrow("Malware signatures are stale");
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    if (oldHost === undefined) delete process.env.CLAMAV_HOST; else process.env.CLAMAV_HOST = oldHost;
    if (oldPort === undefined) delete process.env.CLAMAV_PORT; else process.env.CLAMAV_PORT = oldPort;
  }
});
