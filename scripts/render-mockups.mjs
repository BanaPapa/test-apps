// design-src/*.dc.html(캔버스 시안) → build/mockups/<slug>.html (브라우저로 바로 여는 정적 HTML).
// 시안 파일의 renderVals() 를 실행해 {{구멍}} 과 <sc-for>/<sc-if> 를 펼친다.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const scenarios = JSON.parse(readFileSync(join(ROOT, 'scenarios/scenarios.json'), 'utf8'));
const OUT = join(ROOT, 'build/mockups');
mkdirSync(OUT, { recursive: true });

const BOOL_ATTRS = new Set(['checked', 'disabled', 'selected', 'readonly', 'hidden']);

function lookup(scope, path) {
  const p = path.trim();
  if (p === 'true') return true;
  if (p === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(p)) return Number(p);
  return p.split('.').reduce((v, k) => (v == null ? undefined : v[k]), scope);
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 같은 이름 태그의 짝 맞는 닫는 태그 위치 */
function findClose(src, tag, from) {
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'g');
  re.lastIndex = from;
  let depth = 1;
  for (let m; (m = re.exec(src)); ) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return { start: m.index, end: re.lastIndex };
  }
  throw new Error(`닫는 </${tag}> 없음`);
}

function expandBlocks(src, scope) {
  let out = '';
  let i = 0;
  const open = /<(sc-for|sc-if)\b([^>]*)>/g;
  for (let m; (m = open.exec(src)); ) {
    if (m.index < i) continue;
    out += src.slice(i, m.index);
    const tag = m[1];
    const attrs = m[2];
    const close = findClose(src, tag, open.lastIndex);
    const inner = src.slice(open.lastIndex, close.start);
    const attr = (name) => attrs.match(new RegExp(`${name}="\\{\\{\\s*([^}]+?)\\s*\\}\\}"`))?.[1];
    if (tag === 'sc-for') {
      const list = lookup(scope, attr('list')) ?? [];
      const as = attrs.match(/as="([^"]+)"/)[1];
      list.forEach((item, idx) => {
        out += expandBlocks(inner, { ...scope, [as]: item, $index: idx });
      });
    } else if (lookup(scope, attr('value'))) {
      out += expandBlocks(inner, scope);
    }
    i = close.end;
    open.lastIndex = close.end;
  }
  out += src.slice(i);
  return fillHoles(out, scope);
}

function fillHoles(src, scope) {
  // 속성 전체가 구멍인 경우: 불리언 처리
  let s = src.replace(/\s([a-zA-Z-]+)="\{\{\s*([^}]+?)\s*\}\}"/g, (all, name, path) => {
    const v = lookup(scope, path);
    if (typeof v === 'boolean') {
      if (BOOL_ATTRS.has(name.toLowerCase())) return v ? ` ${name}` : '';
      return ` ${name}="${v}"`;
    }
    if (typeof v === 'function') return '';
    return ` ${name}="${esc(v)}"`;
  });
  s = s.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, path) => esc(lookup(scope, path)));
  return s;
}

function render(file) {
  const src = readFileSync(join(ROOT, 'design-src', file), 'utf8');
  const title = src.match(/<title>([^<]*)<\/title>/)?.[1] ?? '';
  const lang = src.match(/<html lang="([^"]+)"/)?.[1] ?? 'ko';
  const xdc = src.match(/<x-dc>([\s\S]*)<\/x-dc>/)[1];
  const helmet = xdc.match(/<helmet>([\s\S]*?)<\/helmet>/)?.[1] ?? '';
  const body = xdc.replace(/<helmet>[\s\S]*?<\/helmet>/, '');
  const code = src.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/)[1];
  class DCLogic {
    constructor() {
      this.props = {};
      this.state = {};
    }
    setState() {}
  }
  const Component = new Function('DCLogic', `${code}\nreturn Component;`)(DCLogic);
  const vals = new Component().renderVals();
  const html = expandBlocks(body, vals);
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · 목표 화면 (예시 데이터)</title>
${helmet.trim()}
</head>
<body>
<!-- 목표 화면 시안. 숫자와 단지명은 지어낸 예시이며 모양·간격·색만 따른다. -->
${html.trim()}
</body>
</html>
`;
}

for (const sc of scenarios) {
  const html = render(sc.mockup);
  if (/\{\{|<sc-for|<sc-if/.test(html)) throw new Error(`${sc.slug}: 펼치지 못한 구멍이 남았다`);
  writeFileSync(join(OUT, `${sc.slug}.html`), html, 'utf8');
  console.log('mockup', sc.slug);
}
