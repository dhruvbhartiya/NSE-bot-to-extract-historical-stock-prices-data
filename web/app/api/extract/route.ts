import { spawn } from "node:child_process";

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RequestPayload = {
  symbol: string;
  from_date: string;
  to_date: string;
};

type RouteBody =
  | { filename: string; rows: number; download_url?: string; file_base64?: string }
  | { error: string; suggestions?: string[] };

type LocalExtractorResponse = {
  statusCode: number;
  body: RouteBody;
};

const INTERNAL_ROUTE_PATH = "/api/extract";

function getConfiguredUpstream(request: NextRequest) {
  const configured = process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_API_URL || "";

  if (!configured) {
    return "";
  }

  const upstreamUrl = new URL(configured, request.nextUrl.origin);
  const internalUrl = new URL(INTERNAL_ROUTE_PATH, request.nextUrl.origin);

  if (upstreamUrl.href === internalUrl.href) {
    return "";
  }

  return upstreamUrl.toString();
}

async function proxyToUpstream(upstreamUrl: string, payload: RequestPayload) {
  const response = await fetch(upstreamUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const rawBody = await response.text();
  let parsedBody: RouteBody;

  try {
    parsedBody = JSON.parse(rawBody) as RouteBody;
  } catch {
    parsedBody = {
      error: rawBody || "The upstream API returned an invalid response.",
    };
  }

  if (response.ok && "download_url" in parsedBody && parsedBody.download_url && !parsedBody.file_base64) {
    const fileResponse = await fetch(parsedBody.download_url, { cache: "no-store" });

    if (!fileResponse.ok) {
      return NextResponse.json(
        {
          error: `The generated file could not be downloaded from the upstream service (${fileResponse.status}).`,
        },
        { status: 502 },
      );
    }

    const fileBuffer = Buffer.from(await fileResponse.arrayBuffer());
    parsedBody = {
      ...parsedBody,
      file_base64: fileBuffer.toString("base64"),
    };
  }

  return NextResponse.json(parsedBody, { status: response.status });
}

function pythonCandidates(scriptPath: string) {
  if (process.platform === "win32") {
    return [
      ["py", ["-3", scriptPath]],
      ["python", [scriptPath]],
    ] as const;
  }

  return [
    ["python3", [scriptPath]],
    ["python", [scriptPath]],
  ] as const;
}

function runLocalExtractor(payload: RequestPayload) {
  const scriptPath = "./scripts/local_extract.py";

  return new Promise<LocalExtractorResponse>((resolve, reject) => {
    const attempts = pythonCandidates(scriptPath);
    let attemptIndex = 0;

    const tryNext = (lastError?: Error) => {
      if (attemptIndex >= attempts.length) {
        reject(
          lastError ??
            new Error(
              "No Python runtime was found. Install Python or configure BACKEND_API_URL.",
            ),
        );
        return;
      }

      const [command, args] = attempts[attemptIndex];
      attemptIndex += 1;

      const child = spawn(command, args, {
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      child.on("error", (error) => {
        tryNext(error);
      });

      child.on("close", (code) => {
        if (code !== 0) {
          tryNext(
            new Error(stderr.trim() || stdout.trim() || `${command} exited with code ${code}`),
          );
          return;
        }

        try {
          resolve(JSON.parse(stdout) as LocalExtractorResponse);
        } catch (error) {
          reject(
            new Error(
              `Failed to parse local extractor output: ${String(error)}${stderr ? `\n${stderr.trim()}` : ""}`,
            ),
          );
        }
      });

      child.stdin.write(JSON.stringify(payload));
      child.stdin.end();
    };

    tryNext();
  });
}

export async function POST(request: NextRequest) {
  let payload: RequestPayload;

  try {
    payload = (await request.json()) as RequestPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 });
  }

  const upstreamUrl = getConfiguredUpstream(request);

  try {
    if (upstreamUrl) {
      return await proxyToUpstream(upstreamUrl, payload);
    }

    const result = await runLocalExtractor(payload);
    return NextResponse.json(result.body, { status: result.statusCode });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to run the local extractor. Configure BACKEND_API_URL to use the deployed backend.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
