import { fromBuffer, type Entry, type ZipFile } from "yauzl";
import type { Readable } from "node:stream";
export class UnsafeArchive extends Error { constructor() { super("Archive exceeds safe scanning limits or is unsupported"); } }
const MAX_ENTRY = 50 * 1024 * 1024, MAX_EXPANDED = 100 * 1024 * 1024, MAX_FILES = 1000;
const zipMagic = (b: Buffer) => b.length >= 4 && [0x04034b50, 0x06054b50, 0x08074b50].includes(b.readUInt32LE(0));
const compressedMagic = (b: Buffer) => zipMagic(b) || b.subarray(0, 2).equals(Buffer.from([0x1f, 0x8b])) || b.subarray(0, 4).toString() === "Rar!" || b.subarray(0, 3).toString() === "BZh" || b.subarray(0, 4).equals(Buffer.from([0x28, 0xb5, 0x2f, 0xfd])) || b.subarray(0, 6).equals(Buffer.from([0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00])) || b.subarray(257, 262).toString() === "ustar" || b.subarray(0, 6).equals(Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]));
/** Independently validate ZIP/Office expansion before trusting a scanner's clean verdict. */
export async function validateArchive(bytes: Buffer, mime: string): Promise<void> {
  const required = mime.includes("zip") || mime.includes("openxmlformats");
  if (!zipMagic(bytes)) { if (required || compressedMagic(bytes)) throw new UnsafeArchive(); return; }
  await new Promise<void>((resolve, reject) => {
    let zip: ZipFile | undefined, stream: Readable | undefined, count = 0, declared = 0, expanded = 0, done = false;
    const fail = () => { if (!done) { done = true; stream?.destroy(); zip?.close(); reject(new UnsafeArchive()); } };
    fromBuffer(bytes, { lazyEntries: true, validateEntrySizes: true }, (error, reader) => {
      if (error || !reader) { fail(); return; } zip = reader;
      reader.on("error", fail);
      reader.on("end", () => { if (!done) { done = true; resolve(); } });
      reader.on("entry", (entry: Entry) => {
        declared += entry.uncompressedSize; count++;
        if (count > MAX_FILES || !Number.isSafeInteger(entry.uncompressedSize) || entry.uncompressedSize > MAX_ENTRY || declared > MAX_EXPANDED || (entry.generalPurposeBitFlag & 1) || /\.(zip|7z|rar|gz|bz2|xz|tar|zst)$/i.test(entry.fileName)) { fail(); return; }
        if (entry.fileName.endsWith("/")) { reader.readEntry(); return; }
        reader.openReadStream(entry, (streamError, input) => {
          if (streamError || !input) { fail(); return; } stream = input;
          let size = 0, prefix = Buffer.alloc(0);
          input.on("error", fail);
          input.on("data", (chunk: Buffer) => {
            size += chunk.length; expanded += chunk.length;
            if (prefix.length < 512) prefix = Buffer.concat([prefix, chunk.subarray(0, 512 - prefix.length)]);
            if (size > MAX_ENTRY || expanded > MAX_EXPANDED || compressedMagic(prefix)) fail();
          });
          input.on("end", () => { if (!done) { if (size !== entry.uncompressedSize) fail(); else reader.readEntry(); } });
        });
      });
      reader.readEntry();
    });
  });
}
