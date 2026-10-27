import { z } from "zod";

/** User-supplied links are rendered as <a href>; only http(s) is allowed (no javascript:/data:). */
export const httpUrl = (message = "Must be an http(s) link") =>
  z.string().trim().max(2000).url(message).refine((v) => /^https?:\/\//i.test(v), message);
