// 시나리오마다 키트 폴더(build/kits/<slug>)를 조립하고, zip 과 배포 사이트(site/)를 만든다.
// 먼저 node scripts/render-mockups.mjs 와 미리보기 PNG(build/previews)가 있어야 한다.
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeZip } from './zip.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const scenarios = JSON.parse(readFileSync(join(ROOT, 'scenarios/scenarios.json'), 'utf8'));
const KITS = join(ROOT, 'build/kits');
const SITE = join(ROOT, 'site');
const SKIP = new Set(['node_modules', '.next', 'next-env.d.ts', 'tsconfig.tsbuildinfo', 'state', '.vercel', '.git']);
/** 키트에 절대 들어가면 안 되는 파일: .env.example 을 뺀 모든 .env*, 인증서·키 파일 */
const SECRET = (name) => (/^\.env/.test(name) && name !== '.env.example') || /\.(pem|key|p12|pfx)$/i.test(name);

/** 이미지 밖의 모든 파일(HTML·데이터 포함)에서 찾는 실제 키 모양. 문서의 예시('sk-ant-...')는 길이가 짧아 걸리지 않는다 */
const SECRET_PATTERNS = [
  /hooks\.slack\.com\/services\/T[A-Z0-9]{6,}\/B[A-Z0-9]{6,}\/[A-Za-z0-9]{16,}/,
  /\bsk-[A-Za-z0-9_-]{20,}/,
  /\bAIza[0-9A-Za-z_-]{30,}/,
  /serviceKey=[A-Za-z0-9%+/=]{20,}/,
  /\b(MOLIT_API_KEY|LLM_API_KEY|SLACK_WEBHOOK_URL|ODCLOUD_SERVICE_KEY)\s*[:=]\s*["']?[A-Za-z0-9%+/=_:.-]{12,}/,
];

const read = (p) => readFileSync(join(ROOT, p), 'utf8');

// Windows 의 Node 24 에서 fs.cpSync 로 이미 있는 파일을 덮어쓰면 프로세스가 죽는다(실측).
// 그래서 copyFileSync 로 직접 복사한다.
function copyFile(from, to) {
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
}

function copyTree(from, to) {
  for (const name of readdirSync(from)) {
    if (SKIP.has(name) || SECRET(name)) continue;
    const src = join(from, name);
    const dest = join(to, name);
    if (statSync(src).isDirectory()) copyTree(src, dest);
    else copyFile(src, dest);
  }
}

function listFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listFiles(full));
    else out.push(full);
  }
  return out.sort();
}

function readList(sc) {
  const items = [
    '`docs/PRD.md`: 무엇을, 누구를 위해, 완료 기준',
    '`docs/STACK.md`: 기술 스택, 폴더, 제공된 부품, 공통 규칙',
    '`docs/FSD.md`: 기능 명세 (함수 이름·형식·규칙이 정해져 있다. 그대로 따른다)',
    '`docs/DESIGN.md` 와 `design/mockup.html`: 화면. mockup 은 브라우저로 열어 보거나 소스를 읽는다. **mockup 의 숫자는 예시**이고 실제 숫자는 계산해서 넣는다',
    '`docs/API_MOLIT.md`: 국토부 API 와 제공된 데이터 부품',
  ];
  if (sc.llm) items.push('`docs/API_LLM.md`: 분석 모델 연결, 글을 쓰게 하는 순서, 숫자 대조');
  if (sc.automation) items.push('`docs/AUTOMATION.md`: 매일 자동 실행, 스냅샷 비교, GitHub Secrets');
  items.push('`docs/BUILD_PLAN.md`: 단계별 작업 순서와 확인');
  return items.map((t, i) => `${i + 1}. ${t}`).join('\n');
}

function fill(template, sc) {
  const coreExtra = [
    sc.llm ? '`lib/llm.ts`, `lib/llm-client.ts`, `lib/number-check.ts`, `app/api/llm/route.ts`' : '',
    sc.automation ? '`lib/snapshot.ts`, `lib/slack.ts`, `lib/env.ts`, `.github/workflows/daily.yml`' : '',
  ].filter(Boolean);
  const needs = [];
  if (sc.llm) needs.push('| 분석 모델 API 키 | 글쓰기 기능을 쓸 때 | OpenRouter(무료 모델 있음) https://openrouter.ai/keys 등. `docs/API_LLM.md` 1절 |');
  if (sc.automation) {
    needs.push('| 슬랙 Webhook 주소 | 알림을 받을 때 | `docs/AUTOMATION.md` 4절 |');
    needs.push('| GitHub 계정 | 매일 자동으로 돌릴 때 | https://github.com |');
  }
  const trouble = [];
  if (sc.llm) trouble.push('| 모델 목록이 안 뜬다 | 키를 다시 확인합니다. OpenRouter 는 키 없이도 목록이 떠야 정상입니다 |');
  if (sc.automation) trouble.push('| 아침에 메시지가 안 왔다 | GitHub 저장소 → Actions 탭 → daily 실행 기록에서 빨간 줄의 오류를 봅니다. Secrets 이름이 정확한지 확인합니다 |');
  const automationSection = sc.automation
    ? `
## 3-1. 매일 자동으로 돌리기

화면에서 지역·조건을 고르고 **설정 파일 만들기**로 나온 내용을 복사해 둡니다. 그다음 \`docs/AUTOMATION.md\` 3절대로:

1. GitHub 에 저장소를 만들고 이 폴더를 올린다
2. 저장소 Settings → Secrets 에 키들을 넣는다 (이름 표가 문서에 있습니다)
3. \`config/\` 파일을 복사해 둔 내용으로 바꾼다
4. Actions 탭에서 \`daily\` 를 한 번 수동 실행 → 슬랙에 "기준선" 메시지가 오면 성공

다음 날부터 매일 아침 8시(한국 시간)에 알아서 돕니다.
`
    : '';
  return template
    .replaceAll('{{TITLE}}', sc.title)
    .replaceAll('{{SUMMARY}}', sc.summary)
    .replaceAll('{{NODE_MIN}}', '22')
    .replaceAll('{{READ_LIST}}', readList(sc))
    .replaceAll('{{CORE_EXTRA}}', coreExtra.length ? `, ${coreExtra.join(', ')}` : '')
    .replaceAll('{{NEEDS_ROWS}}', needs.length ? `${needs.join('\n')}\n` : '')
    .replaceAll('{{TROUBLE_ROWS}}', trouble.length ? `${trouble.join('\n')}\n` : '')
    .replaceAll('{{AUTOMATION_SECTION}}', automationSection)
    .replaceAll('{{VERCEL_EXTRA_KEYS}}', sc.llm ? ', `LLM_API_KEY`' : '');
}

function envExample(sc) {
  const lines = [
    '# 이 파일을 복사해 .env.local 로 이름을 바꾸고 값을 채운다. .env.local 은 git 에 올라가지 않는다.',
    '# 모두 비워 둬도 된다. 비우면 화면의 입력칸에 넣은 키를 쓴다.',
    '',
    '# 공공데이터포털 인증키 (국토교통부_아파트 매매 실거래가 자료)',
    'MOLIT_API_KEY=',
  ];
  if (sc.llm || sc.automation) lines.push('');
  if (sc.llm) {
    lines.push('# 분석 모델 (docs/API_LLM.md). 화면 칸이 비었을 때 서버가 쓰는 키.');
    lines.push('# LLM_API_KEY 는 화면에서 고른 제공사가 LLM_PROVIDER 와 같을 때만 쓰인다.');
    lines.push('# anthropic / openai / gemini / openrouter');
    lines.push('LLM_PROVIDER=');
    lines.push('LLM_API_KEY=');
    if (sc.automation) lines.push('LLM_MODEL=');
  }
  if (sc.automation) {
    lines.push('');
    lines.push('# 매일 실행(npm run daily)을 내 PC 에서 시험할 때 (docs/AUTOMATION.md)');
    lines.push('SLACK_WEBHOOK_URL=');
  }
  return `${lines.join('\n')}\n`;
}

function packageJson(sc) {
  const pkg = JSON.parse(read('core/base/package.json'));
  pkg.name = `realdeal-${sc.slug}`;
  if (sc.automation) {
    pkg.scripts.daily = 'tsx scripts/daily.ts';
    pkg.devDependencies.tsx = '4.23.15';
    pkg.devDependencies = Object.fromEntries(Object.entries(pkg.devDependencies).sort(([a], [b]) => a.localeCompare(b)));
  }
  return `${JSON.stringify(pkg, null, 2)}\n`;
}

function assemble(sc) {
  const dir = join(KITS, sc.slug);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  copyTree(join(ROOT, 'core/base'), dir);
  if (sc.llm) copyTree(join(ROOT, 'core/llm'), dir);
  if (sc.automation) copyTree(join(ROOT, 'core/automation'), dir);

  const docs = join(dir, 'docs');
  mkdirSync(docs, { recursive: true });
  for (const f of ['STACK.md', 'API_MOLIT.md']) copyFile(join(ROOT, 'shared-docs', f), join(docs, f));
  if (sc.llm) copyFile(join(ROOT, 'shared-docs/API_LLM.md'), join(docs, 'API_LLM.md'));
  if (sc.automation) copyFile(join(ROOT, 'shared-docs/AUTOMATION.md'), join(docs, 'AUTOMATION.md'));
  copyTree(join(ROOT, 'scenarios', sc.slug, 'docs'), docs);

  mkdirSync(join(dir, 'design'), { recursive: true });
  copyFile(join(ROOT, 'build/mockups', `${sc.slug}.html`), join(dir, 'design/mockup.html'));
  copyFile(join(ROOT, 'build/previews', `${sc.slug}.png`), join(dir, 'design/preview.png'));

  const claude = fill(read('templates/CLAUDE.md'), sc);
  writeFileSync(join(dir, 'CLAUDE.md'), claude);
  writeFileSync(join(dir, 'AGENTS.md'), claude);
  writeFileSync(join(dir, 'START_HERE.md'), fill(read('templates/START_HERE.md'), sc));
  writeFileSync(join(dir, '.env.example'), envExample(sc));
  writeFileSync(join(dir, 'package.json'), packageJson(sc));

  const leftover = listFiles(dir)
    .filter((f) => f.endsWith('.md'))
    .filter((f) => /\{\{[A-Z_]+\}\}/.test(readFileSync(f, 'utf8')));
  if (leftover.length) throw new Error(`${sc.slug}: 채우지 못한 자리표시: ${leftover.join(', ')}`);
  return dir;
}

function zipKit(sc, dir) {
  const top = `realdeal-${sc.slug}`;
  const entries = listFiles(dir).map((f) => ({
    path: `${top}/${relative(dir, f).split(sep).join('/')}`,
    data: readFileSync(f),
  }));
  // 마지막 관문: 비밀 파일이나 키처럼 보이는 내용이 있으면 만들지 않는다.
  for (const e of entries) {
    const name = e.path.split('/').pop();
    if (SECRET(name) || e.path.includes('/state/')) throw new Error(`${sc.slug}: 키트에 넣으면 안 되는 파일: ${e.path}`);
    if (!/\.(png|jpe?g|gif|webp|ico|woff2?)$/i.test(name)) {
      const text = e.data.toString('utf8');
      const hit = SECRET_PATTERNS.find((re) => re.test(text));
      if (hit) throw new Error(`${sc.slug}: 실제 키처럼 보이는 값이 있다(${hit}): ${e.path}`);
    }
  }
  return makeZip(entries);
}

mkdirSync(join(SITE, 'downloads'), { recursive: true });
mkdirSync(join(SITE, 'previews'), { recursive: true });
mkdirSync(join(SITE, 'mockups'), { recursive: true });

const built = [];
for (const sc of scenarios) {
  const dir = assemble(sc);
  const zip = zipKit(sc, dir);
  writeFileSync(join(SITE, 'downloads', `realdeal-${sc.slug}.zip`), zip);
  copyFile(join(ROOT, 'build/previews', `${sc.slug}.png`), join(SITE, 'previews', `${sc.slug}.png`));
  copyFile(join(ROOT, 'build/mockups', `${sc.slug}.html`), join(SITE, 'mockups', `${sc.slug}.html`));
  built.push({ ...sc, zipBytes: zip.length, files: listFiles(dir).length });
  console.log(`kit ${sc.slug}: ${listFiles(dir).length} files, zip ${(zip.length / 1024).toFixed(0)} KB`);
}
writeFileSync(join(SITE, 'scenarios.json'), `${JSON.stringify(built, null, 2)}\n`);

// 사이트 본문: index.template.html 의 <!--CARDS--> 를 채운다
const tpl = read('site-src/index.template.html');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const card = (sc) => {
    const needs = ['공공데이터포털 인증키'];
    if (sc.llm) needs.push('분석 모델 API 키');
    if (sc.automation) needs.push('슬랙 · GitHub');
    return `      <article class="kit" id="${sc.slug}">
        <a class="kit-shot" href="mockups/${sc.slug}.html" target="_blank" rel="noopener" aria-label="${esc(sc.title)} 시안 크게 보기">
          <img src="previews/${sc.slug}.png" alt="${esc(sc.title)} 목표 화면" width="1280" height="1000" loading="lazy">
        </a>
        <div class="kit-body">
          <p class="kit-no">${sc.no}</p>
          <h3>${esc(sc.title)}</h3>
          <p class="kit-summary">${esc(sc.summary)}</p>
          <dl class="kit-meta">
            <div><dt>누가</dt><dd>${esc(sc.who)}</dd></div>
            <div><dt>만들어지는 것</dt><dd>${esc(sc.output)}</dd></div>
            <div><dt>필요한 것</dt><dd>${needs.map((n) => `<span class="need${n === '공공데이터포털 인증키' ? '' : ' need-extra'}">${esc(n)}</span>`).join('')}</dd></div>
          </dl>
          <div class="kit-actions">
            <a class="btn btn-primary" href="downloads/realdeal-${sc.slug}.zip" download>키트 받기 <span class="btn-size">${Math.round(sc.zipBytes / 1024)} KB</span></a>
            <a class="btn" href="mockups/${sc.slug}.html" target="_blank" rel="noopener">시안 크게 보기</a>
          </div>
        </div>
      </article>`;
};
const basic = built.filter((s) => !s.llm).map(card).join('\n');
const llm = built.filter((s) => s.llm).map(card).join('\n');
const quick = built
  .map((sc) => {
    const needs = ['인증키', sc.llm ? '모델 키' : '', sc.automation ? '슬랙·GitHub' : ''].filter(Boolean).join(' · ');
    return `        <li>
          <span class="quick-no">${sc.no}</span>
          <a class="quick-name" href="#${sc.slug}"><b>${esc(sc.title)}</b><small>${esc(needs)}</small></a>
          <a class="btn btn-primary" href="downloads/realdeal-${sc.slug}.zip" download aria-label="${esc(sc.title)} 키트 받기">받기</a>
        </li>`;
  })
  .join('\n');
writeFileSync(
  join(SITE, 'index.html'),
  tpl.replace('<!--CARDS_BASIC-->', basic).replace('<!--CARDS_LLM-->', llm).replace('<!--QUICK-->', quick),
);
console.log('site ready:', relative(ROOT, SITE));
