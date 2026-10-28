import { it, expect } from "vitest";
import { validateArchive, UnsafeArchive } from "@/lib/archive";
const valid = Buffer.from("UEsDBBQAAAAIAAiNW12GphA2BwAAAAUAAAAJAAAAaGVsbG8udHh0y0jNyckHAFBLAQIUAxQAAAAIAAiNW12GphA2BwAAAAUAAAAJAAAAAAAAAAAAAACAAQAAAABoZWxsby50eHRQSwUGAAAAAAEAAQA3AAAALgAAAAAA", "base64");
const nested = Buffer.from("UEsDBBQAAAAIAAiNW10OxcvXCAAAABYAAAAKAAAAbmVzdGVkLnppcAvwZmVjwAAAUEsBAhQDFAAAAAgACI1bXQ7Fy9cIAAAAFgAAAAoAAAAAAAAAAAAAAIABAAAAAG5lc3RlZC56aXBQSwUGAAAAAAEAAQA4AAAAMAAAAAAA", "base64");
it("accepts a real bounded ZIP and ordinary text", async () => {
  await expect(validateArchive(valid, "application/zip")).resolves.toBeUndefined();
  await expect(validateArchive(Buffer.from("hello"), "text/plain")).resolves.toBeUndefined();
});
it("rejects malformed, encrypted and nested archives", async () => {
  await expect(validateArchive(Buffer.from("not a zip"), "application/zip")).rejects.toBeInstanceOf(UnsafeArchive);
  await expect(validateArchive(valid.subarray(0, 30), "application/zip")).rejects.toBeInstanceOf(UnsafeArchive);
  await expect(validateArchive(Buffer.from([0x1f, 0x8b, 0x08]), "text/plain")).rejects.toBeInstanceOf(UnsafeArchive);
  await expect(validateArchive(nested, "application/zip")).rejects.toBeInstanceOf(UnsafeArchive);
  const encrypted = Buffer.from(valid), central = encrypted.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]));
  encrypted.writeUInt16LE(encrypted.readUInt16LE(central + 8) | 1, central + 8);
  await expect(validateArchive(encrypted, "application/zip")).rejects.toBeInstanceOf(UnsafeArchive);
});
it("rejects ZIP metadata over budget before decompression and lies about inflated size", async () => {
  const oversized = Buffer.from(valid), central = oversized.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]));
  oversized.writeUInt32LE(51 * 1024 * 1024, central + 24);
  await expect(validateArchive(oversized, "application/zip")).rejects.toBeInstanceOf(UnsafeArchive);
  const wrongSize = Buffer.from(valid); wrongSize.writeUInt32LE(1, central + 24);
  await expect(validateArchive(wrongSize, "application/zip")).rejects.toBeInstanceOf(UnsafeArchive);
});
