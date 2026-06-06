export interface WebConfigCheckResult {
  ok: boolean
  strict: boolean
  errors: string[]
  warnings: string[]
}

export function validateWebConfigEnv(
  env?: Record<string, string | undefined>,
  options?: { strict?: boolean }
): WebConfigCheckResult
