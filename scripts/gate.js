#!/usr/bin/env node
/**
 * scripts/gate.js — 에이전트 게이트키퍼 (Tauri + React / Node.js, ESM)
 *
 * 원칙: 에이전트는 "완료"를 선언할 수 없다. 완료 판정과 BACKLOG 체크는 이 스크립트만 한다.
 *
 * 명령어
 *   node scripts/gate.js init                    최초 1회. 상태 디렉터리/비밀키 생성 + pre-commit 훅 설치
 *   node scripts/gate.js lock                    (사람 전용) 보호 대상 해시 기록 + 커밋 + 읽기 전용 설정
 *   node scripts/gate.js unlock                  (사람 전용) 보호 대상 쓰기 허용. 수정 후 반드시 lock 재실행
 *   node scripts/gate.js check <TASK_ID> [--rollback] [--json]
 *   node scripts/gate.js complete <TASK_ID> [--rollback] [--json]
 *   node scripts/gate.js hook-pre-commit         (git 훅이 호출. 직접 실행하지 말 것)
 *
 * 종료 코드: 0 통과 / 1 검사 실패 / 2 사용법·환경 오류
 *
 * 전제: package.json 에 "type": "module", devDependencies 에 eslint, typescript, vitest.
 */
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ════════════════════════════════════════════════════════════════
// 설정 (이 파일 자체가 보호 대상이므로 에이전트가 완화할 수 없다)
// ════════════════════════════════════════════════════════════════
const CONFIG = {
  backlog: 'BACKLOG.md',
  tasksDir: 'tasks', // tasks/<ID>.json
  acceptanceDir: 'tests/acceptance', // 잠긴 인수 테스트
  protectedDirs: ['tasks', 'tests/acceptance'],
  // 루트에서 이 패턴에 맞는 파일은 자동으로 보호 대상이 된다
  protectedRootPatterns: [
    /^eslint\.config\.[cm]?js$/,
    /^tsconfig.*\.json$/,
    /^vitest\.config\.[cm]?[jt]s$/,
    /^vite\.config\.[cm]?[jt]s$/,
  ],
  allowedHooksPath: '', // core.hooksPath 가 이 값이 아니면 훅 우회로 간주
  maxChangedLinesDefault: 300, // 파일당 변경 줄 수 상한 (task.max_changed_lines 로 조정)
  whitespaceChurnLimit: 40, // (전체 변경 − 공백무시 변경) 이 값을 넘으면 포맷/치환 폭주로 판정
  ignoreChurnFiles: new Set(['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'Cargo.lock']),
  timeoutMs: 10 * 60 * 1000,
  maxReportFailures: 25,
};

const TEXT_EXT = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.css', '.scss', '.html',
  '.md', '.toml', '.rs', '.yml', '.yaml', '.txt', '.svg', '.py', '.sh', '.ps1', '.bat',
]);
const CODE_EXT = /\.(tsx?|jsx?|mjs|cjs|rs|css|html|py|sh|ps1|bat)$/;
const LINT_EXT = /\.(tsx?|jsx?|mjs|cjs)$/;
const SCRIPT_EXT = /\.(mjs|cjs|js|py|sh|ps1|bat)$/;

// 추가된 줄(diff의 + 줄)에만 적용되는 금지 패턴
const LINE_RULES = [
  {
    id: '미완성 표식 주석',
    re: /(?:\/\/|\/\*|^\s*\*|<!--|#)[^\n]*(?:\b(?:TODO|FIXME|HACK|XXX|STUB|WIP)\b|not implemented|implement (?:this )?later|나중에|연결 필요|구현 예정|추후|미구현|임시 구현)/i,
  },
  { id: '더미/미구현 문자열', re: /lorem ipsum|coming soon|not implemented|미구현|구현 예정/i },
  {
    id: '검사 우회 지시문',
    re: /eslint-(?:disable|enable)|@ts-(?:ignore|nocheck|expect-error)|prettier-ignore|istanbul ignore|c8 ignore/i,
  },
  { id: 'Rust 미완성 매크로', re: /\b(?:todo|unimplemented)!\s*\(/, ext: /\.rs$/ },
  {
    id: '일괄 치환 명령',
    re: /\bsed\s+-[a-z]*i|\bre\.sub\s*\(|\bperl\s+-[a-z]*p[a-z]*i|(?:^|\s)-replace\s+['"]/i,
  },
];

// ════════════════════════════════════════════════════════════════
// 환경
// ════════════════════════════════════════════════════════════════
const IS_WIN = process.platform === 'win32';
const die = (msg) => {
  console.error(`[gate] ${msg}`);
  process.exit(2);
};

const _top = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' });
if (_top.status !== 0) die('git 저장소 안에서 실행해야 합니다.');
const ROOT = path.resolve(_top.stdout.trim());

const posix = (p) => p.split(path.sep).join('/');
const abs = (rel) => path.join(ROOT, rel);
const SELF_REL = posix(path.relative(ROOT, fileURLToPath(import.meta.url)));
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const tail = (s, n = 3000) => (s.length > n ? '…(앞부분 생략)\n' + s.slice(-n) : s).trim();

// 상태 디렉터리는 작업 폴더 "밖"(홈)에 둔다. 비밀키/매니페스트가 워크스페이스에 없게 하기 위함.
const STATE_DIR = path.join(os.homedir(), '.gate-state', sha256(Buffer.from(ROOT)).slice(0, 12));
const MANIFEST_FILE = path.join(STATE_DIR, 'manifest.json');
const SECRET_FILE = path.join(STATE_DIR, 'secret.key');
const HOOK_KEY = 'GIT_HOOK:pre-commit';

// ════════════════════════════════════════════════════════════════
// 프로세스/깃 헬퍼
// ════════════════════════════════════════════════════════════════
const winQuote = (a) => (/[\s"&|<>^]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);

function run(cmd, args, { cwd = ROOT, env = {}, input } = {}) {
  const useShell = IS_WIN && cmd !== 'git'; // Windows 에서 npx/cargo 는 .cmd
  const r = spawnSync(cmd, useShell ? args.map(winQuote) : args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    shell: useShell,
    timeout: CONFIG.timeoutMs,
    env: { ...process.env, ...env },
    input,
  });
  return {
    code: r.status ?? 1,
    out: r.stdout ?? '',
    err: (r.stderr ?? '') + (r.error ? `\n${r.error.message}` : ''),
  };
}
const git = (args, o) => run('git', ['-c', 'core.quotepath=false', ...args], o);
function gitBlob(rel) {
  const r = spawnSync('git', ['show', `HEAD:${rel}`], { cwd: ROOT, maxBuffer: 256 * 1024 * 1024 });
  return r.status === 0 ? r.stdout : null;
}
const hasCommits = () => git(['rev-parse', '--verify', 'HEAD']).code === 0;

// ════════════════════════════════════════════════════════════════
// 보호 대상 매니페스트 (BACKLOG.md 쓰기 권한 박탈의 핵심)
// ════════════════════════════════════════════════════════════════
function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

function protectedFileList() {
  const set = new Set([CONFIG.backlog, SELF_REL]);
  for (const f of fs.readdirSync(ROOT)) {
    if (CONFIG.protectedRootPatterns.some((re) => re.test(f))) set.add(f);
  }
  return [...set];
}

const isProtectedPath = (rel) =>
  protectedFileList().includes(rel) || CONFIG.protectedDirs.some((d) => rel === d || rel.startsWith(d + '/'));

function hookPath() {
  const r = git(['rev-parse', '--git-path', 'hooks/pre-commit']);
  return path.resolve(ROOT, r.out.trim());
}

function snapshot() {
  const s = {};
  for (const rel of protectedFileList()) {
    if (fs.existsSync(abs(rel))) s[rel] = sha256(fs.readFileSync(abs(rel)));
  }
  for (const d of CONFIG.protectedDirs) {
    for (const f of walk(abs(d))) s[posix(path.relative(ROOT, f))] = sha256(fs.readFileSync(f));
  }
  const h = hookPath();
  if (fs.existsSync(h)) s[HOOK_KEY] = sha256(fs.readFileSync(h));
  return s;
}

const loadManifest = () =>
  fs.existsSync(MANIFEST_FILE) ? JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8')) : null;

function saveManifest(files) {
  fs.mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(MANIFEST_FILE, JSON.stringify({ savedAt: new Date().toISOString(), files }, null, 2));
}

function setReadOnly(readOnly) {
  for (const key of Object.keys(snapshot())) {
    if (key === HOOK_KEY) continue;
    try {
      fs.chmodSync(abs(key), readOnly ? 0o444 : 0o644);
    } catch {
      /* 무시: 권한 설정 실패는 해시 검증이 백스톱 */
    }
  }
}

function verifyIntegrity(fails) {
  const saved = loadManifest();
  if (!saved) {
    fails.push(['integrity', '매니페스트가 없습니다. 사람이 `node scripts/gate.js lock` 을 먼저 실행해야 합니다.']);
    return;
  }
  const now = snapshot();
  for (const [k, h] of Object.entries(saved.files)) {
    if (!(k in now)) fails.push(['integrity', `보호 대상 삭제됨: ${k}`]);
    else if (now[k] !== h) {
      fails.push([
        'integrity',
        k === CONFIG.backlog
          ? `${k} 직접 수정 감지. 에이전트는 완료 표시 권한이 없습니다(gate.js complete 만 가능). 되돌리고 구현에 집중하세요.`
          : `보호 대상 변조됨: ${k} (게이트 설정/잠긴 테스트/태스크 정의는 수정 불가)`,
      ]);
    }
  }
  for (const k of Object.keys(now)) {
    if (!(k in saved.files)) fails.push(['integrity', `보호 구역에 허가되지 않은 파일 추가됨: ${k}`]);
  }
}

// ════════════════════════════════════════════════════════════════
// 커밋 nonce: BACKLOG 등 보호 파일을 커밋할 수 있는 건 gate.js 뿐
// ════════════════════════════════════════════════════════════════
const readSecret = () => (fs.existsSync(SECRET_FILE) ? fs.readFileSync(SECRET_FILE, 'utf8').trim() : null);
function nonceFor(secret) {
  const head = git(['rev-parse', 'HEAD']).out.trim();
  return crypto.createHmac('sha256', secret).update(`gate-commit:${head}`).digest('hex');
}

function cmdHookPreCommit() {
  const secret = readSecret();
  if (secret && process.env.GATE_NONCE === nonceFor(secret)) return 0;
  console.error(
    '[gate] 시스템 경고: AI는 수동으로 git commit을 할 수 없습니다.\n' +
    '       반드시 `node scripts/gate.js complete <ID>` 를 사용하여 엄격한 게이트 검증을 거치세요.\n' +
    '       (사람 유저가 수동 커밋을 강제할 경우 --no-verify 옵션을 사용하세요.)'
  );
  return 1;
}

const HOOK_BODY = `#!/bin/sh
# gate.js 관리 훅 — 수정 금지 (해시로 감시됨)
exec node scripts/gate.js hook-pre-commit
`;
function installHook() {
  const h = hookPath();
  fs.mkdirSync(path.dirname(h), { recursive: true });
  fs.writeFileSync(h, HOOK_BODY, { mode: 0o755 });
  try {
    fs.chmodSync(h, 0o755);
  } catch {
    /* Windows */
  }
}

// ════════════════════════════════════════════════════════════════
// 태스크 정의: tasks/<ID>.json
// {
//   "id": "T-001", "title": "...",
//   "touch_list": ["src/components/Foo.tsx", "src/stores/**"],
//   "acceptance_tests": ["tests/acceptance/T-001.test.tsx"],
//   "allow_remove": [], "max_changed_lines": 300
// }
// ════════════════════════════════════════════════════════════════
function globToRe(g) {
  let re = '';
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*') {
      if (g[i + 1] === '*') {
        if (g[i + 2] === '/') {
          re += '(?:.*/)?';
          i += 2;
        } else {
          re += '.*';
          i += 1;
        }
      } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

function loadTask(id) {
  if (!id || !/^[A-Za-z0-9_.-]+$/.test(id)) return { error: `잘못된 태스크 ID: ${id}` };
  const p = abs(`${CONFIG.tasksDir}/${id}.json`);
  if (!fs.existsSync(p)) return { error: `${CONFIG.tasksDir}/${id}.json 이 없습니다.` };
  let t;
  try {
    t = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    return { error: `태스크 JSON 파싱 실패: ${e.message}` };
  }
  const errs = [];
  if (t.id !== id) errs.push('task.id 가 파일명과 다릅니다.');
  if (!Array.isArray(t.touch_list) || t.touch_list.length === 0) errs.push('touch_list 가 비어 있습니다.');
  if (!Array.isArray(t.acceptance_tests) || t.acceptance_tests.length === 0) {
    errs.push('acceptance_tests 가 비어 있습니다. 인수 테스트 없는 태스크는 완료할 수 없습니다.');
  } else {
    for (const a of t.acceptance_tests) {
      if (!a.startsWith(CONFIG.acceptanceDir + '/')) errs.push(`인수 테스트는 ${CONFIG.acceptanceDir}/ 아래여야 함: ${a}`);
      else if (!fs.existsSync(abs(a))) errs.push(`인수 테스트 파일 없음: ${a}`);
    }
  }
  if (errs.length) return { error: errs.join(' / ') };
  return {
    task: {
      id,
      title: t.title ?? id,
      touchRes: t.touch_list.map(globToRe),
      allowRemove: new Set(t.allow_remove ?? []),
      maxLines: t.max_changed_lines ?? CONFIG.maxChangedLinesDefault,
      acceptance: t.acceptance_tests,
    },
  };
}

// ════════════════════════════════════════════════════════════════
// 변경 파일 / 추가된 줄
// ════════════════════════════════════════════════════════════════
function changedFiles() {
  const r = git(['status', '--porcelain=v1', '-z', '--untracked-files=all', '--no-renames']);
  const out = [];
  for (const e of r.out.split('\0')) {
    if (e.length < 4) continue;
    const xy = e.slice(0, 2);
    const file = e.slice(3);
    const exists = fs.existsSync(abs(file));
    let status = 'M';
    if (!exists) status = 'D';
    else if (xy === '??' || xy.includes('A')) status = 'A';
    out.push({ file, status, untracked: xy === '??' });
  }
  return out;
}

function addedLines(c) {
  const lines = [];
  if (c.untracked) {
    fs.readFileSync(abs(c.file), 'utf8')
      .split(/\r?\n/)
      .forEach((text, i) => lines.push({ n: i + 1, text }));
    return lines;
  }
  const r = git(['diff', '-U0', '--no-color', '--no-renames', 'HEAD', '--', c.file]);
  let n = 0;
  let inHunk = false;
  for (const l of r.out.split('\n')) {
    const h = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(l);
    if (h) {
      n = Number(h[1]);
      inHunk = true;
      continue;
    }
    if (!inHunk) continue;
    if (l.startsWith('+')) {
      lines.push({ n, text: l.slice(1).replace(/\r$/, '') });
      n++;
    }
  }
  return lines;
}

// ════════════════════════════════════════════════════════════════
// 개별 검사
// ════════════════════════════════════════════════════════════════
function checkHooksPath(fails) {
  const hp = git(['config', '--get', 'core.hooksPath']).out.trim();
  if (hp !== CONFIG.allowedHooksPath) {
    fails.push(['integrity', `core.hooksPath 가 변경됨("${hp}"). 훅 우회 시도로 간주합니다.`]);
  }
}

function checkScope(changes, task, fails) {
  for (const c of changes) {
    if (isProtectedPath(c.file)) continue; // integrity 에서 이미 보고
    if (!task.touchRes.some((re) => re.test(c.file))) {
      fails.push(['scope', `${c.file}: 이 태스크의 touch_list 밖 파일을 ${c.status === 'D' ? '삭제' : '수정/생성'}했습니다.`]);
    }
  }
}

// 인코딩 손상 탐지: UTF-8 엄격 디코딩, U+FFFD, 모지바케, UTF-16/BOM, NUL, 혼합 줄바꿈
const MOJIBAKE_RE =
  /[\u00C2\u00C3][\u0080-\u00BF]|[\u00EA-\u00ED][\u0080-\u00BF\u0152\u0153\u0160\u0161\u0178\u017D\u017E\u0192\u02C6\u02DC\u2013-\u203A\u20AC\u2122]/g;
const countMatches = (s, re) => (s.match(re) || []).length;
const hasBom = (b) => b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf;

function eolMixed(text) {
  const crlf = countMatches(text, /\r\n/g);
  const lfOnly = countMatches(text, /(?<!\r)\n/g);
  const loneCr = countMatches(text, /\r(?!\n)/g);
  return (crlf > 0 && lfOnly > 0) || loneCr > 0;
}

function checkEncoding(changes, fails) {
  for (const c of changes) {
    if (c.status === 'D' || !TEXT_EXT.has(path.extname(c.file).toLowerCase())) continue;
    const buf = fs.readFileSync(abs(c.file));
    if (buf.length >= 2 && ((buf[0] === 0xff && buf[1] === 0xfe) || (buf[0] === 0xfe && buf[1] === 0xff))) {
      fails.push(['encoding', `${c.file}: UTF-16 BOM 감지(PowerShell 리다이렉션 등으로 인코딩이 바뀜). UTF-8로 써야 합니다.`]);
      continue;
    }
    if (buf.includes(0)) {
      fails.push(['encoding', `${c.file}: NUL 바이트 포함(인코딩 파손 또는 바이너리화).`]);
      continue;
    }
    let text;
    try {
      text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buf);
    } catch {
      fails.push(['encoding', `${c.file}: 유효한 UTF-8이 아닙니다(엄격 디코딩 실패).`]);
      continue;
    }
    const head = c.status === 'A' ? null : gitBlob(c.file);
    const headText = head ? head.toString('utf8') : '';

    if (countMatches(text, /\uFFFD/g) > countMatches(headText, /\uFFFD/g)) {
      fails.push(['encoding', `${c.file}: 깨진 문자(U+FFFD)가 늘었습니다.`]);
    }
    if (countMatches(text, MOJIBAKE_RE) > countMatches(headText, MOJIBAKE_RE)) {
      fails.push(['encoding', `${c.file}: 모지바케(UTF-8 이중 인코딩) 패턴이 늘었습니다. 한글 등 비ASCII 문자가 손상됐을 가능성이 큽니다.`]);
    }
    if (head === null ? hasBom(buf) : hasBom(buf) !== hasBom(head)) {
      fails.push(['encoding', `${c.file}: UTF-8 BOM 유무가 원본과 달라졌습니다.`]);
    }
    if (eolMixed(text) && !(head && eolMixed(headText))) {
      fails.push(['encoding', `${c.file}: 줄바꿈(CRLF/LF)이 한 파일 안에서 섞였습니다.`]);
    }
  }
}

function numstat(flags) {
  const r = git(['diff', '--numstat', '--no-renames', ...flags, 'HEAD']);
  const m = new Map();
  for (const line of r.out.split('\n')) {
    const p = line.split('\t');
    if (p.length < 3) continue;
    m.set(p.slice(2).join('\t'), p[0] === '-' ? 0 : Number(p[0]) + Number(p[1]));
  }
  return m;
}

function checkChurn(changes, task, fails) {
  const full = numstat([]);
  const noWs = numstat(['-w']);
  for (const c of changes) {
    if (c.status !== 'M' || CONFIG.ignoreChurnFiles.has(path.basename(c.file)) || isProtectedPath(c.file)) continue;
    const total = full.get(c.file) ?? 0;
    const real = noWs.get(c.file) ?? 0;
    if (total - real > CONFIG.whitespaceChurnLimit) {
      fails.push(['churn', `${c.file}: 공백/줄바꿈만 바뀐 줄이 ${total - real}줄. 정규식 치환·포매터 폭주 의심. 해당 구간만 최소 수정하세요.`]);
    }
    if (total > task.maxLines) {
      fails.push(['churn', `${c.file}: 변경 ${total}줄 > 상한 ${task.maxLines}줄. 태스크를 더 쪼개거나 수정 범위를 줄이세요.`]);
    }
  }
}

function checkAddedLines(changes, fails) {
  for (const c of changes) {
    if (c.status === 'D' || !CODE_EXT.test(c.file) || isProtectedPath(c.file)) continue;
    const lines = addedLines(c);
    for (const { n, text } of lines) {
      for (const rule of LINE_RULES) {
        if (rule.ext && !rule.ext.test(c.file)) continue;
        if (rule.re.test(text)) fails.push(['forbidden', `${c.file}:${n} [${rule.id}] ${text.trim().slice(0, 120)}`]);
      }
    }
    // 새로 만든 일회용 치환 스크립트 (read → .replace(/…/) → write)
    if (c.status === 'A' && SCRIPT_EXT.test(c.file) && !/^(src|tests)\//.test(c.file)) {
      const body = lines.map((l) => l.text).join('\n');
      if ((/\.replace\(\s*\//.test(body) || /\bre\.sub\s*\(/.test(body)) && /write(File|FileSync)?\b|open\(/.test(body)) {
        fails.push(['forbidden', `${c.file}: 소스를 정규식으로 일괄 치환하는 일회용 스크립트로 보입니다.`]);
      }
    }
  }
}

async function loadTs() {
  try {
    const m = await import('typescript');
    return m.default ?? m;
  } catch {
    return null;
  }
}

function topLevelNames(ts, fileName, text) {
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
  const names = new Set();
  for (const st of sf.statements) {
    if (
      ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st) || ts.isInterfaceDeclaration(st) ||
      ts.isTypeAliasDeclaration(st) || ts.isEnumDeclaration(st)
    ) {
      names.add(st.name ? st.name.text : 'default');
    } else if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name)) names.add(d.name.text);
    } else if (ts.isExportAssignment(st)) names.add('default');
  }
  return names;
}

async function checkSyntaxAndDeclarations(changes, task, fails, warns) {
  const ts = await loadTs();
  if (!ts) {
    warns.push('typescript 패키지를 찾지 못해 구문/선언 보존 검사를 건너뜀(npm i -D typescript).');
    return;
  }
  for (const c of changes) {
    if (c.status === 'D' || !LINT_EXT.test(c.file) || isProtectedPath(c.file)) continue;
    const text = fs.readFileSync(abs(c.file), 'utf8');
    const out = ts.transpileModule(text, {
      fileName: c.file,
      reportDiagnostics: true,
      compilerOptions: { jsx: ts.JsxEmit.Preserve, target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext },
    });
    const diags = out.diagnostics ?? [];
    if (diags.length) {
      for (const d of diags.slice(0, 3)) {
        const pos = d.file && d.start !== undefined ? d.file.getLineAndCharacterOfPosition(d.start).line + 1 : '?';
        fails.push(['syntax', `${c.file}:${pos} ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`]);
      }
      continue;
    }
    if (c.status === 'A') continue;
    const head = gitBlob(c.file);
    if (!head) continue;
    const before = topLevelNames(ts, c.file, head.toString('utf8'));
    const after = topLevelNames(ts, c.file, text);
    const removed = [...before].filter(
      (n) => !after.has(n) && !task.allowRemove.has(n) && !task.allowRemove.has(`${c.file}:${n}`),
    );
    if (removed.length) {
      fails.push(['declaration', `${c.file}: 기존 최상위 선언이 사라졌습니다 → ${removed.join(', ')} (의도된 삭제면 task.allow_remove 에 선언 필요)`]);
    }
  }
}

function runLint(changes, fails) {
  const files = changes.filter((c) => c.status !== 'D' && LINT_EXT.test(c.file)).map((c) => c.file);
  if (!files.length) return;
  const r = run('npx', ['--no-install', 'eslint', '--max-warnings', '0', '--no-warn-ignored', ...files]);
  if (r.code !== 0) fails.push(['lint', tail(r.out + r.err)]);
}

function runTypecheck(fails) {
  const tsconfig = abs('tsconfig.json');
  if (!fs.existsSync(tsconfig)) return;
  // 솔루션 스타일 tsconfig("references")는 `tsc --noEmit` 이 아무것도 검사하지 않으므로 -b 사용
  const solution = fs.readFileSync(tsconfig, 'utf8').includes('"references"');
  const args = solution ? ['--no-install', 'tsc', '-b'] : ['--no-install', 'tsc', '--noEmit'];
  const r = run('npx', args);
  if (r.code !== 0) fails.push(['typecheck', tail(r.out + r.err)]);
}

function runCargo(changes, fails) {
  const rust = changes.some((c) => c.file.startsWith('src-tauri/') && /\.(rs|toml)$/.test(c.file));
  if (!rust) return;
  const r = run('cargo', ['check', '--manifest-path', 'src-tauri/Cargo.toml', '--color', 'never']);
  if (r.code !== 0) fails.push(['cargo', tail(r.out + r.err)]);
}

function runAcceptance(task, fails) {
  const own = run('npx', ['--no-install', 'vitest', 'run', ...task.acceptance]);
  if (own.code !== 0) {
    fails.push(['acceptance', `이 태스크의 인수 테스트 실패(${task.acceptance.join(', ')}):\n${tail(own.out + own.err)}`]);
    return;
  }
  const all = run('npx', ['--no-install', 'vitest', 'run', CONFIG.acceptanceDir]);
  if (all.code !== 0) fails.push(['regression', `기존 인수 테스트 회귀 실패:\n${tail(all.out + all.err)}`]);
}

// ════════════════════════════════════════════════════════════════
// 전체 검사 파이프라인
// ════════════════════════════════════════════════════════════════
async function runChecks(taskId) {
  const fails = [];
  const warns = [];

  checkHooksPath(fails);
  verifyIntegrity(fails);

  const loaded = loadTask(taskId);
  if (loaded.error) {
    fails.push(['task', loaded.error]);
    return { fails, warns };
  }
  const task = loaded.task;

  const changes = changedFiles();
  const meaningful = changes.filter((c) => !isProtectedPath(c.file));
  if (meaningful.length === 0) {
    fails.push(['empty', '변경 사항이 없습니다. 아무것도 만들지 않고 완료할 수 없습니다.']);
    return { fails, warns };
  }

  // Phase A: 빠른 정적 검사
  checkScope(changes, task, fails);
  checkEncoding(changes, fails);
  checkChurn(changes, task, fails);
  checkAddedLines(changes, fails);
  await checkSyntaxAndDeclarations(changes, task, fails, warns);
  runLint(changes, fails);

  // Phase B: 느린 검사는 Phase A 가 깨끗할 때만
  if (fails.length === 0) {
    runTypecheck(fails);
    runCargo(changes, fails);
    if (fails.length === 0) runAcceptance(task, fails);
  } else {
    warns.push('정적 검사 실패로 tsc/cargo/인수 테스트는 실행하지 않았습니다. 위 항목을 고친 뒤 다시 실행됩니다.');
  }
  return { fails, warns };
}

function printReport({ fails, warns }, json, taskId) {
  if (json) {
    console.log(JSON.stringify({ ok: fails.length === 0, task: taskId, failures: fails.map(([category, message]) => ({ category, message })), warnings: warns }, null, 2));
    return;
  }
  if (fails.length === 0) {
    console.log(`✅ GATE PASSED (${taskId})`);
  } else {
    console.log(`❌ GATE FAILED (${taskId}) — ${fails.length}건`);
    fails.slice(0, CONFIG.maxReportFailures).forEach(([cat, msg], i) => console.log(`\n[${i + 1}] (${cat}) ${msg}`));
    if (fails.length > CONFIG.maxReportFailures) console.log(`\n…외 ${fails.length - CONFIG.maxReportFailures}건 생략`);
    console.log('\n지침: 위 위반만 최소 범위로 수정하세요. 정규식/문자열 일괄 치환, 검사 우회 주석, BACKLOG·테스트·게이트 파일 수정은 금지입니다.');
  }
  warns.forEach((w) => console.log(`⚠ ${w}`));
}

// ════════════════════════════════════════════════════════════════
// 롤백 (워크트리/에이전트 전용 체크아웃에서만 사용할 것)
// ════════════════════════════════════════════════════════════════
function rollback() {
  git(['reset', '--hard', 'HEAD']);
  const c = git(['clean', '-fd']);
  installHook();
  setReadOnly(true);
  console.log(`↩ 롤백 완료: HEAD 로 복원, 추적되지 않던 파일 정리.\n${c.out.trim()}`);
}

// ════════════════════════════════════════════════════════════════
// BACKLOG 완료 표시 (이 스크립트만 쓸 수 있음)
// ════════════════════════════════════════════════════════════════
function hasWord(line, id) {
  let i = -1;
  while ((i = line.indexOf(id, i + 1)) !== -1) {
    const b = line[i - 1];
    const a = line[i + id.length];
    if (!(b && /[\w-]/.test(b)) && !(a && /[\w-]/.test(a))) return true;
  }
  return false;
}

function findPendingLine(text, id) {
  const lines = text.split('\n');
  const hits = [];
  lines.forEach((line, i) => {
    if (/^\s*[-*]\s*\[ \]/.test(line) && hasWord(line, id)) hits.push(i);
  });
  return { lines, hits };
}

function markBacklogDone(id) {
  const file = abs(CONFIG.backlog);
  const original = fs.readFileSync(file, 'utf8');
  const { lines, hits } = findPendingLine(original, id);
  if (hits.length !== 1) return { error: `BACKLOG 에서 미완료 항목 "${id}" 이(가) ${hits.length}개 발견됨(정확히 1개여야 함).` };
  const m = /^(\s*[-*]\s*\[)( )(\])/.exec(lines[hits[0]]);
  lines[hits[0]] = m[1] + 'x' + lines[hits[0]].slice(m[0].length - 1);
  const updated = lines.join('\n');
  // 검증: 길이 동일 + 정확히 1글자만 변경
  let diffCount = 0;
  for (let i = 0; i < original.length; i++) if (original[i] !== updated[i]) diffCount++;
  if (updated.length !== original.length || diffCount !== 1) return { error: 'BACKLOG 수정 검증 실패(예상 외 변경).' };
  fs.chmodSync(file, 0o644);
  fs.writeFileSync(file, updated, 'utf8');
  fs.chmodSync(file, 0o444);
  return { ok: true };
}

// ════════════════════════════════════════════════════════════════
// 명령어
// ════════════════════════════════════════════════════════════════
function cmdInit() {
  if (!hasCommits()) die('커밋이 최소 1개 필요합니다.');
  fs.mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 });
  if (!readSecret()) fs.writeFileSync(SECRET_FILE, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
  installHook();
  console.log(`[gate] 초기화 완료\n  상태 디렉터리: ${STATE_DIR}\n  pre-commit 훅 설치됨\n다음: 사람이 BACKLOG.md / tasks / tests/acceptance 를 준비한 뒤 \`node scripts/gate.js lock\``);
  return 0;
}

function validateAcceptanceTests() {
  const problems = [];
  const files = walk(abs(CONFIG.acceptanceDir)).filter((f) => /\.(tsx?|jsx?)$/.test(f));
  if (files.length === 0) problems.push(`${CONFIG.acceptanceDir} 에 테스트 파일이 없습니다.`);
  for (const f of files) {
    const rel = posix(path.relative(ROOT, f));
    const t = fs.readFileSync(f, 'utf8');
    if (/\b(it|test|describe)\.(skip|only|todo|skipIf|fails)\b/.test(t)) problems.push(`${rel}: skip/only/todo 사용`);
    if (/\b(xit|xtest|xdescribe|fit|fdescribe)\s*\(/.test(t)) problems.push(`${rel}: 비활성/포커스 테스트 함수 사용`);
    if (/expect\(\s*(true|false|1|0)\s*\)\s*\.\s*(toBe|toEqual|toBeTruthy)/.test(t)) problems.push(`${rel}: 항상 통과하는 단언`);
    if (!/\b(expect|assert)\b/.test(t)) problems.push(`${rel}: 단언(expect/assert)이 없음`);
  }
  return problems;
}

function cmdLock() {
  const secret = readSecret();
  if (!secret) die('먼저 `node scripts/gate.js init` 를 실행하세요.');
  if (!fs.existsSync(abs(CONFIG.backlog))) die(`${CONFIG.backlog} 가 없습니다.`);
  const problems = validateAcceptanceTests();
  if (fs.existsSync(abs(CONFIG.tasksDir))) {
    for (const f of walk(abs(CONFIG.tasksDir)).filter((p) => p.endsWith('.json'))) {
      const id = path.basename(f, '.json');
      const r = loadTask(id);
      if (r.error) problems.push(`tasks/${id}.json: ${r.error}`);
    }
  }
  if (problems.length) {
    console.error('[gate] lock 거부:\n - ' + problems.join('\n - '));
    return 1;
  }
  installHook();
  const paths = [
    ...protectedFileList().filter((p) => fs.existsSync(abs(p))),
    ...CONFIG.protectedDirs.filter((d) => fs.existsSync(abs(d))),
  ];
  setReadOnly(false);
  git(['add', '--', ...paths]);
  saveManifest(snapshot());
  if (git(['status', '--porcelain', '--', ...paths]).out.trim()) {
    const r = git(['commit', '-m', 'chore(gate): lock protected files', '--', ...paths], { env: { GATE_NONCE: nonceFor(secret) } });
    if (r.code !== 0) {
      console.error(`[gate] lock 커밋 실패:\n${tail(r.out + r.err)}`);
      return 1;
    }
  }
  setReadOnly(true);
  console.log(`[gate] 잠금 완료: ${Object.keys(snapshot()).length}개 파일 해시 기록, 읽기 전용 적용`);
  return 0;
}

function cmdUnlock() {
  setReadOnly(false);
  console.log('[gate] 보호 대상 쓰기 허용. 수정이 끝나면 반드시 `node scripts/gate.js lock` 을 실행하세요.');
  return 0;
}

async function cmdCheck(taskId, flags) {
  if (!hasCommits()) die('커밋이 최소 1개 필요합니다.');
  const res = await runChecks(taskId);
  printReport(res, flags.has('--json'), taskId);
  if (res.fails.length && flags.has('--rollback')) rollback();
  return res.fails.length ? 1 : 0;
}

async function cmdComplete(taskId, flags) {
  if (!hasCommits()) die('커밋이 최소 1개 필요합니다.');
  const secret = readSecret();
  if (!secret) die('먼저 `node scripts/gate.js init` 를 실행하세요.');
  const json = flags.has('--json');

  const pending = findPendingLine(fs.readFileSync(abs(CONFIG.backlog), 'utf8'), taskId).hits.length;
  if (pending !== 1) {
    printReport({ fails: [['backlog', `BACKLOG 에 미완료 항목 "${taskId}" 이(가) ${pending}개 있습니다(정확히 1개 필요).`]], warns: [] }, json, taskId);
    return 1;
  }

  const res = await runChecks(taskId);
  if (res.fails.length) {
    printReport(res, json, taskId);
    if (flags.has('--rollback')) rollback();
    return 1;
  }

  const { task } = loadTask(taskId);
  const mark = markBacklogDone(taskId);
  if (mark.error) {
    printReport({ fails: [['backlog', mark.error]], warns: [] }, json, taskId);
    return 1;
  }
  const manifest = loadManifest();
  manifest.files[CONFIG.backlog] = sha256(fs.readFileSync(abs(CONFIG.backlog)));
  saveManifest(manifest.files);

  git(['add', '-A']);
  const c = git(['commit', '-m', `feat(${task.id}): ${task.title}`, '-m', 'gate-verified'], { env: { GATE_NONCE: nonceFor(secret) } });
  if (c.code !== 0) {
    console.error(`[gate] 커밋 실패:\n${tail(c.out + c.err)}`);
    return 1;
  }
  printReport(res, json, taskId);
  if (!json) console.log(`📌 BACKLOG 체크 + 커밋 완료: ${taskId}`);
  return 0;
}

// ════════════════════════════════════════════════════════════════
// 엔트리
// ════════════════════════════════════════════════════════════════
const [cmd, ...rest] = process.argv.slice(2);
const flags = new Set(rest.filter((a) => a.startsWith('--')));
const pos = rest.filter((a) => !a.startsWith('--'));

const handlers = {
  init: () => cmdInit(),
  lock: () => cmdLock(),
  unlock: () => cmdUnlock(),
  check: () => cmdCheck(pos[0], flags),
  complete: () => cmdComplete(pos[0], flags),
  'hook-pre-commit': () => cmdHookPreCommit(),
};

if (!handlers[cmd]) die('사용법: gate.js <init|lock|unlock|check|complete> [TASK_ID] [--rollback] [--json]');
Promise.resolve(handlers[cmd]()).then(
  (code) => process.exit(code),
  (e) => {
    console.error(e);
    process.exit(2);
  },
);
