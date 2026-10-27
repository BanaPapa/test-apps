// 달(YYYYMM) 계산. 화면과 서버가 함께 쓴다.

/** 끝 달(포함)부터 거꾸로 n 개월의 YYYYMM 목록. 오래된 달이 앞에 온다. */
export function monthsBack(endYm: string, n: number): string[] {
  let y = Number(endYm.slice(0, 4));
  let m = Number(endYm.slice(4, 6));
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.unshift(`${y}${String(m).padStart(2, '0')}`);
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
  }
  return out;
}

/** 한국 시간 기준 이번 달 YYYYMM */
export function currentYm(now: Date = new Date()): string {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return `${kst.getUTCFullYear()}${String(kst.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** 두 달 사이(포함)의 YYYYMM 목록. from 이 to 보다 뒤면 빈 배열. */
export function monthsBetween(fromYm: string, toYm: string): string[] {
  const out: string[] = [];
  let y = Number(fromYm.slice(0, 4));
  let m = Number(fromYm.slice(4, 6));
  const endKey = Number(toYm);
  while (y * 100 + m <= endKey) {
    out.push(`${y}${String(m).padStart(2, '0')}`);
    m += 1;
    if (m === 13) {
      m = 1;
      y += 1;
    }
  }
  return out;
}
