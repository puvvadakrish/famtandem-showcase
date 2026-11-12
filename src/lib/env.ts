import "server-only";
import { parseServerEnv, type ServerEnv } from "@/lib/env-core";

export function getServerEnv(): ServerEnv {
  return parseServerEnv(process.env);
}
