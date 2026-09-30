import { errorResponse } from "@/lib/api";
import { getPullDetail } from "@/lib/pulls";
import { getRepo } from "@/lib/repos";
import { reviewPullRequest } from "@/lib/review/engine";
import { encodeEvent, HEARTBEAT_FRAME, HEARTBEAT_MS } from "@/lib/review/stream";
import { scrubError } from "@/lib/scrub";
import { assertRepoRef, parsePullNumber } from "@/lib/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A review runs to its own bounds (SPEC.md §11); nothing here should cut it off.
export const maxDuration = 900;

type Body = { owner?: unknown; repo?: unknown; number?: unknown };

export async function POST(request: Request) {
  let owner: string;
  let repo: string;
  let number: number;

  try {
    const body = (await request.json().catch(() => null)) as Body | null;
    owner = String(body?.owner ?? "");
    repo = String(body?.repo ?? "");
    assertRepoRef(owner, repo);
    number = parsePullNumber(String(body?.number ?? ""));
  } catch (error) {
    return errorResponse(error);
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (text: string) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          open = false;
        }
      };

      // A long quiet stretch — a large search, a slow turn — must not look like
      // a dead connection.
      const heartbeat = setInterval(() => send(HEARTBEAT_FRAME), HEARTBEAT_MS);

      // The client going away should stop the run, not leave it burning tokens.
      const abort = new AbortController();
      request.signal.addEventListener("abort", () => {
        open = false;
        abort.abort();
      });

      try {
        const [repository, pull] = await Promise.all([
          getRepo(owner, repo),
          getPullDetail(owner, repo, number),
        ]);

        for await (const event of reviewPullRequest({
          pull,
          owner,
          repo,
          sizeKb: repository.sizeKb,
          signal: abort.signal,
        })) {
          send(encodeEvent(event));
        }
      } catch (error) {
        send(encodeEvent({ type: "error", message: scrubError(error) }));
      } finally {
        clearInterval(heartbeat);
        if (open) controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
