import OpenAI from "openai";
import { config } from "../config";

/** One client for the process; the app serves a single user. */
let client: OpenAI | undefined;

export function openai(): OpenAI {
  if (!config.openaiApiKey) throw new Error("OPENAI_API_KEY is not set");
  client ??= new OpenAI({ apiKey: config.openaiApiKey, maxRetries: 2 });
  return client;
}

/** Test seam — lets the engine be exercised without a network client. */
export function __setClient(next: OpenAI | undefined): void {
  client = next;
}
