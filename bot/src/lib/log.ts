type Dependency = "telegram" | "supabase" | "bot";
type Outcome = "failed" | "retry" | "unconfirmed" | "partial" | "posted_metadata_unconfirmed";
type Context = { updateId?: number; sessionDate?: string };

// Only emit fields we own. Provider descriptions and exception messages can
// contain participant content, credentials, or a full request URL.
export function botEvent(
  level: "info" | "warn" | "error",
  event: string,
  fields: {
    operation?: string; dependency?: Dependency; outcome?: string; duration_ms?: number;
    error_category?: string; error_code?: string | number; http_status?: number; reason?: string;
  } = {},
  context: Context = {},
): void {
  const line = JSON.stringify({
    level,
    message: event,
    operation: fields.operation,
    dependency: fields.dependency,
    outcome: fields.outcome,
    duration_ms: fields.duration_ms,
    error_category: fields.error_category,
    error_code: fields.error_code,
    http_status: fields.http_status,
    reason: fields.reason,
    update_id: Number.isSafeInteger(context.updateId) ? context.updateId : undefined,
    session_date: /^\d{4}-\d{2}-\d{2}$/.test(context.sessionDate ?? "") ? context.sessionDate : undefined,
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

const networkCodes = new Set([
  "ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "EPIPE",
  "ENETUNREACH", "EHOSTUNREACH", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT", "UND_ERR_SOCKET",
]);

function errorFields(error: unknown): { error_category: string; error_code?: string | number; http_status?: number } {
  const e = error as { name?: unknown; code?: unknown; error_code?: unknown; http_status?: unknown; cause?: { code?: unknown } } | null;
  const status = e?.http_status;
  const http_status = typeof status === "number" && Number.isInteger(status) && status >= 100 && status <= 599 ? status : undefined;
  if (typeof e?.error_code === "number" && Number.isInteger(e.error_code) && e.error_code >= 100 && e.error_code <= 599) {
    return { error_category: "api", error_code: e.error_code, http_status };
  }
  if (e?.name === "SyntaxError") return { error_category: "invalid_response", http_status };
  if (e?.name === "TimeoutError" || e?.name === "AbortError") return { error_category: "timeout" };
  const code = e?.code ?? e?.cause?.code;
  if (typeof code === "string" && networkCodes.has(code)) {
    return { error_category: "transport", error_code: code };
  }
  if (typeof code === "string" && /^(?:[0-9][A-Z0-9]{4}|PGRST\d{3})$/.test(code)) {
    return { error_category: "database", error_code: code };
  }
  return { error_category: error instanceof TypeError || code === "" ? "transport" : "unknown" };
}

export function botFailure(
  operation: string,
  dependency: Dependency,
  started: number,
  error: unknown,
  outcome: Outcome = "failed",
  context?: Context,
): void {
  botEvent("error", "bot_operation_failed", {
    operation, dependency, outcome, duration_ms: Math.round(performance.now() - started),
    ...errorFields(error),
  }, context);
}

// A handled boundary can still throw so its caller keeps the original control
// flow. Outer handlers use this marker to avoid logging the same failure twice.
class ReportedFailure extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : "Operațiunea a eșuat", { cause });
  }
}

export function unreportedFailure(
  operation: string, started: number, error: unknown, outcome: Outcome = "failed", context?: Context,
): void {
  if (!(error instanceof ReportedFailure)) botFailure(operation, "bot", started, error, outcome, context);
}

export async function observeOperation<T>(
  operation: string,
  dependency: Dependency,
  work: () => PromiseLike<T>,
  transportOutcome: Outcome = "failed",
  context?: Context,
): Promise<T> {
  const started = performance.now();
  try {
    return await work();
  } catch (error) {
    if (error instanceof ReportedFailure) throw error;
    botFailure(operation, dependency, started, error, transportOutcome, context);
    throw new ReportedFailure(error);
  }
}

export function observeDatabase<T>(
  operation: string,
  query: () => PromiseLike<{ data: T; error: unknown }>,
  outcome: Outcome = "failed",
  context?: Context,
): Promise<T> {
  return observeOperation(operation, "supabase", async () => {
    const { data, error } = await query();
    if (error) throw error;
    return data;
  }, outcome, context);
}

export async function observeTelegram<T extends { ok: boolean }>(
  operation: string,
  work: () => PromiseLike<T>,
  transportOutcome: Outcome = "failed",
  rejectionOutcome: (result: T) => Outcome = () => "failed",
  context?: Context,
): Promise<T> {
  const started = performance.now();
  const result = await observeOperation(operation, "telegram", work, transportOutcome, context);
  if (!result.ok) botFailure(operation, "telegram", started, result, rejectionOutcome(result), context);
  return result;
}
