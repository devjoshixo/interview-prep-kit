// LLM client wrapper. Kept behind a single function so the pipeline depends on
// this interface, not on a specific provider/SDK.
//
// TODO(owner): choose a provider (see LLM_PROVIDER / LLM_API_KEY / LLM_MODEL in
// .env.example) and implement complete() using native fetch against its API.
export async function complete(prompt: string): Promise<string> {
  void prompt;
  throw new Error("llm.complete: not implemented");
}
