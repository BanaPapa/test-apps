// scripts/ 에서 쓰는 환경변수 도우미. 내 PC 에서는 .env.local 을 읽고, GitHub Actions 에서는 Secrets 가 이미 들어 있다.
import { existsSync } from 'node:fs';

/** .env.local 이 있으면 읽는다(이미 있는 환경변수는 덮어쓰지 않는다). */
export function loadLocalEnv(path = '.env.local'): void {
  if (!existsSync(path) || typeof process.loadEnvFile !== 'function') return;
  const before = { ...process.env };
  process.loadEnvFile(path);
  for (const [k, v] of Object.entries(before)) process.env[k] = v;
}

/** 필요한 환경변수를 한 번에 확인한다. 빠진 것이 있으면 이름을 모두 담아 Error. */
export function requireEnv<const T extends readonly string[]>(names: T): Record<T[number], string> {
  const missing = names.filter((n) => !process.env[n]?.trim());
  if (missing.length) {
    throw new Error(`환경변수가 없습니다: ${missing.join(', ')}. 내 PC 는 .env.local, GitHub 는 Settings → Secrets 에 넣으세요.`);
  }
  return Object.fromEntries(names.map((n) => [n, process.env[n]!.trim()])) as Record<T[number], string>;
}

/** 값이 있으면 돌려주고, 없으면 null */
export function optionalEnv(name: string): string | null {
  return process.env[name]?.trim() || null;
}
