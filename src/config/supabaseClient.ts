import { createClient, SupabaseClientOptions } from "@supabase/supabase-js";
import { env } from "./env";

// Optimized configuration for concurrent requests
const supabaseOptions: SupabaseClientOptions<"public"> = {
  auth: {
    persistSession: false, // Server-side doesn't need session persistence
    autoRefreshToken: false, // Service role key doesn't expire
  },
  db: {
    schema: "public",
  },
  global: {
    headers: {
      "x-client-info": "express-api",
    },
  },
  // Connection pooling is handled by Supabase automatically
  // but we can optimize for concurrent requests
};

export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, supabaseOptions);
