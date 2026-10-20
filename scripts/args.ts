/**
 * 命令行参数解析（`--key=value` 形式）。
 */
export function parseArgs(argv: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const a of argv) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/)
    if (m) out[m[1]!] = m[2] ?? ''
  }
  return out
}

/** 取一个只允许两个候选值的参数 */
export function pickOption<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : fallback
}
