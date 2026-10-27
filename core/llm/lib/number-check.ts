// 모델이 쓴 글에 앱이 준 적 없는 숫자가 들어 있는지 찾는다.
// 모델은 숫자를 지어내거나 잘못 옮길 수 있다. 화면에 내보내기 전에 반드시 이 검사를 거친다.
//
// 검사하지 않는 것은 날짜 표기뿐이다: "2026년", "9월", "9월 21일", "2026.09", "9.21 계약", 그리고 층·순서("14층", "2위").
// "28일 뒤", "12개월", "3건" 처럼 기간·건수는 사실 숫자이므로 검사한다.

export type NumberToken = {
  /** 글에 적힌 그대로 (예: "23억 5,000", "9,980만", "+8.6%") */
  raw: string;
  /** 비교용 값. 금액은 만원, 퍼센트는 % 숫자(부호 포함), 나머지는 숫자 그대로 */
  value: number;
  kind: 'money' | 'percent' | 'plain';
  /** 퍼센트에 +/- 부호가 적혀 있었는지 */
  signed: boolean;
  index: number;
};

// 날짜 표기(검사 제외): 연도, 월, 월+일, 점 날짜, "9.21 계약"
// 월 1~12, 일 1~31 범위만 날짜로 본다. 점 날짜 뒤에 금액·퍼센트·수량 단위가 붙으면 날짜가 아니다("1234.5만", "9999.9%").
const MM = '(?:0?[1-9]|1[0-2])';
const DD = '(?:0?[1-9]|[12]\\d|3[01])';
// 뒤에 숫자나 ".숫자"가 이어지면 날짜가 아니다. 문장 끝 마침표("2026.09.")는 날짜로 본다.
const NOT_QUANTITY = '(?!\\d|\\.\\d|\\s*(?:만|억|원|%|건|㎡|평|배|개월|명|곳))';
const DATE_SPANS = [
  new RegExp(`(?<![\\d.])\\d{4}\\s*년(?:\\s*${MM}\\s*월(?:\\s*${DD}\\s*일)?)?`, 'g'),
  new RegExp(`(?<![\\d.])${MM}\\s*월(?:\\s*${DD}\\s*일)?`, 'g'),
  new RegExp(`(?<![\\d.])\\d{4}\\.${MM}(?:\\.${DD})?${NOT_QUANTITY}`, 'g'),
  new RegExp(`(?<![\\d.])${MM}\\.${DD}(?=\\s*계약)`, 'g'),
];
// 억 단위 금액: "23억", "23억 5,000", "23억 5,000만", "1억 380만"
// 억 뒤의 숫자가 소수이거나(3.3㎡) 건·일·개월·㎡ 같은 다른 단위로 이어지면 금액의 일부로 보지 않는다
// ("23억 3건" → 23억 + 3건, "23억 3.3㎡당" → 23억 + 3.3). 문장 끝 마침표("23억 5,000.")는 금액으로 본다.
const MONEY_EOK = /(\d+(?:\.\d+)?)\s*억(?:\s*([\d,]+)(?:\s*만)?(?![\d,]|\.\d|\s*(?:건|일|개월|㎡|평|층|%|년|월|명|곳|위|차|주|회|배)))?/g;
// 만 단위 금액: "9,980만", "8,500만원"
const MONEY_MAN = /([\d,]+(?:\.\d+)?)\s*만(?!\s*\d)/g;
const PERCENT = /([+\-−]?)\s*(\d+(?:\.\d+)?)\s*%/g;
const PLAIN = /\d[\d,]*(?:\.\d+)?/g;
/** 층·순서는 사실 확인 대상이 아니다 */
const SKIP_AFTER = /^\s*(층|위|번째|차|단계)/;

/**
 * @param skipPhrases 숫자가 들어 있어도 검사하지 않을 이름들(자료에 있는 단지명·동 이름, 예: "개포주공5단지").
 *                    글에서 이 문자열과 정확히 같은 구간만 건너뛴다.
 */
export function extractNumbers(text: string, skipPhrases: readonly string[] = []): NumberToken[] {
  const tokens: NumberToken[] = [];
  const taken: [number, number][] = [];
  const overlaps = (s: number, e: number) => taken.some(([a, b]) => s < b && e > a);
  const take = (s: number, e: number) => taken.push([s, e]);

  // 긴 이름부터 가린다("현대까르띠에710" 이 "현대" 보다 먼저)
  for (const phrase of [...new Set(skipPhrases)].filter((p) => /\d/.test(p)).sort((a, b) => b.length - a.length)) {
    for (let i = text.indexOf(phrase); i !== -1; i = text.indexOf(phrase, i + phrase.length)) {
      if (!overlaps(i, i + phrase.length)) take(i, i + phrase.length);
    }
  }
  for (const re of DATE_SPANS) {
    for (const m of text.matchAll(re)) if (!overlaps(m.index!, m.index! + m[0].length)) take(m.index!, m.index! + m[0].length);
  }
  for (const m of text.matchAll(MONEY_EOK)) {
    if (overlaps(m.index!, m.index! + m[0].length)) continue;
    const eok = Number(m[1]);
    const rest = m[2] ? Number(m[2].replace(/,/g, '')) : 0;
    take(m.index!, m.index! + m[0].length);
    tokens.push({ raw: m[0].trim(), value: Math.round(eok * 10000 + rest), kind: 'money', signed: false, index: m.index! });
  }
  for (const m of text.matchAll(MONEY_MAN)) {
    if (overlaps(m.index!, m.index! + m[0].length)) continue;
    take(m.index!, m.index! + m[0].length);
    tokens.push({ raw: m[0].trim(), value: Number(m[1].replace(/,/g, '')), kind: 'money', signed: false, index: m.index! });
  }
  for (const m of text.matchAll(PERCENT)) {
    if (overlaps(m.index!, m.index! + m[0].length)) continue;
    take(m.index!, m.index! + m[0].length);
    const sign = m[1];
    const v = Number(m[2]);
    tokens.push({ raw: m[0].trim(), value: sign === '-' || sign === '−' ? -v : v, kind: 'percent', signed: sign !== '', index: m.index! });
  }
  for (const m of text.matchAll(PLAIN)) {
    const end = m.index! + m[0].length;
    if (overlaps(m.index!, end)) continue;
    if (SKIP_AFTER.test(text.slice(end))) continue;
    tokens.push({ raw: m[0], value: Number(m[0].replace(/,/g, '')), kind: 'plain', signed: false, index: m.index! });
  }
  return tokens.sort((a, b) => a.index - b.index);
}

export type AllowedNumbers = {
  /** 만원 단위 금액들 */
  money?: number[];
  /** 퍼센트 값들. 부호를 지켜서 넣는다 (예: 8.6, -2.3) */
  percent?: number[];
  /** 건수·면적·일수 등 그 밖의 숫자 */
  plain?: number[];
  /** 숫자가 든 이름(자료의 단지명·동 이름). 글에서 이 이름과 똑같은 구간은 검사하지 않는다 */
  names?: string[];
};

function near(a: number, b: number, kind: NumberToken['kind']): boolean {
  // 반올림 표기만 같은 값으로 본다: 퍼센트·일반 숫자는 소수 한 자리, 금액은 만원 단위(평당가 9980.4 → "9,980만").
  if (kind === 'money') return Math.abs(a - b) <= 0.5 + 1e-9;
  return Math.abs(a - b) <= 0.05 + 1e-9;
}

/**
 * 글 속 숫자 중 허용 목록에 없는 것을 돌려준다. 빈 배열이면 통과.
 * - 퍼센트: 글에 +/- 가 적혀 있으면 부호까지 맞아야 한다. 부호 없이 적혔으면("8.6% 올랐다") 크기만 비교한다.
 * - 금액: 만원 단위 반올림만 같은 값으로 본다("9,980만" ← 9980.4 는 통과, "23억 5,100" ← 235000 은 실패).
 * - 그 밖의 숫자: 소수 한 자리 반올림만 허용한다("6.1건" ← 6.08).
 */
export function findUnknownNumbers(text: string, allowed: AllowedNumbers): NumberToken[] {
  const money = allowed.money ?? [];
  const percent = allowed.percent ?? [];
  const plain = [...(allowed.plain ?? []), ...money];
  return extractNumbers(text, allowed.names ?? []).filter((t) => {
    if (t.kind === 'money') return !money.some((v) => near(t.value, v, 'money'));
    if (t.kind === 'percent') {
      return t.signed
        ? !percent.some((v) => near(t.value, v, 'percent'))
        : !percent.some((v) => near(t.value, Math.abs(v), 'percent'));
    }
    return !plain.some((v) => near(t.value, v, 'plain'));
  });
}
