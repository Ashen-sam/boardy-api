import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  SUPABASE_URL: z.string().url(),
  // Use service role key for backend/server-side operations (keep it secret).
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  CLERK_SECRET_KEY: z.string().min(1, "CLERK_SECRET_KEY is required"),
});

export const env = EnvSchema.parse(process.env);


