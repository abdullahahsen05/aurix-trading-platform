import { z } from "zod";

export const aiProviderSchema = z.enum(["GEMINI", "OPENAI"]);

export const aiProviderKeySchema = z.object({
  provider: aiProviderSchema,
  apiKey: z.string().trim().min(12).max(500),
});
