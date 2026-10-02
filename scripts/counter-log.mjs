// 📊 일별 사용 대수 기록 — counter 릴리스의 ping-pc / ping-and 누적 download_count 를 읽어 stats/counter-log.csv 에 한 줄 남긴다.
//   .github/workflows/counter-log.yml 이 매일 부른다. 로컬에서도 `node scripts/counter-log.mjs` 로 똑같이 돈다.
//
//   ⚠ 조회(GET)만 한다 — counter 릴리스와 두 파일을 지우거나 다시 올리면 누적값이 0으로 돌아간다.
//   ⚠ API 가 실패하거나 두 파일 중 하나라도 없으면 CSV 를 건드리지 않고 실패(exit 1)로 끝낸다 — 빈 값을 쓰지 않는다.
//
//   날짜 = 한국시간(UTC+9) 기준, "실행 시각 − 6시간"의 날짜. 예약 실행은 자정 직후(00:05 KST)라
//   그날 줄 = 전날 마감 누적값이 되고, GitHub 예약이 몇 시간 늦어도 날짜가 밀리지 않는다.
//   낮에 수동으로 돌리면 오늘 줄이 생기고, 자정 뒤 예약 실행이 같은 줄을 마감값으로 갱신한다.
//
//   같은 날짜 줄이 이미 있으면 새 줄 대신 그 줄을 고친다. 증가분 = 이 줄 누적 − 바로 앞 줄 누적(앞 줄이 없으면 비움).
//
//   시험용 환경 변수: COUNTER_LOG_CSV(기록할 파일, 기본 stats/counter-log.csv) · COUNTER_NOW(지금 시각 ISO 문자열)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const API = 'https://api.github.com/repos/allday-lib/wm-dist/releases/tags/counter';
const ASSETS = { pc: 'ping-pc', and: 'ping-and' };
const HEADER = 'date,weekday,pc_total,and_total,pc_delta,and_delta';
const KST_MS = 9 * 3600e3;
const LABEL_SHIFT_MS = 6 * 3600e3;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const csvPath = path.resolve(root, process.env.COUNTER_LOG_CSV || 'stats/counter-log.csv');

function fail(msg) {
    console.error(`counter-log: ${msg} — CSV 를 고치지 않았습니다.`);
    process.exit(1);
}

async function readTotals() {
    const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'wm-dist-counter-log' };
    //   Actions 에서는 GITHUB_TOKEN 으로 읽는다(로그인 없이도 되지만, 공용 러너 IP 의 시간당 60회 제한을 피하려고)
    if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    let res;
    try { res = await fetch(API, { headers }); } catch (e) { fail(`API 요청 실패(${e?.message || e})`); }
    if (!res.ok) fail(`API 응답 ${res.status} ${res.statusText}`);
    let body;
    try { body = await res.json(); } catch { fail('API 응답이 JSON 이 아님'); }
    const assets = Array.isArray(body?.assets) ? body.assets : fail('응답에 assets 가 없음');
    const out = {};
    for (const [key, name] of Object.entries(ASSETS)) {
        const a = assets.find(x => x?.name === name);
        if (!a) fail(`응답에 ${name} 파일이 없음`);
        if (!Number.isInteger(a.download_count) || a.download_count < 0) fail(`${name} 의 download_count 가 숫자가 아님`);
        out[key] = a.download_count;
    }
    return out;
}

function labelOf(now) {
    const d = new Date(now.getTime() + KST_MS - LABEL_SHIFT_MS);   // UTC 필드로 읽으면 한국 날짜가 나온다
    const date = d.toISOString().slice(0, 10);
    return { date, weekday: WEEKDAYS[d.getUTCDay()] };
}

function readRows() {
    if (!fs.existsSync(csvPath)) return [];
    const lines = fs.readFileSync(csvPath, 'utf8').split(/\r?\n/).filter(l => l.trim());
    if (lines.length && lines[0].trim() !== HEADER) fail(`${path.relative(root, csvPath)} 의 첫 줄이 머리글(${HEADER})이 아님`);
    return lines.slice(1).map(l => {
        const [date, weekday, pc, and] = l.split(',');
        return { date, weekday, pc: Number(pc), and: Number(and) };
    });
}

function writeRows(rows) {
    //   증가분은 저장값을 믿지 않고 매번 앞 줄에서 다시 센다 — 줄을 고쳐도 뒤 증가분이 어긋나지 않게
    const lines = [HEADER];
    rows.forEach((r, i) => {
        const prev = rows[i - 1];
        const pcD = prev ? String(r.pc - prev.pc) : '';
        const andD = prev ? String(r.and - prev.and) : '';
        lines.push([r.date, r.weekday, r.pc, r.and, pcD, andD].join(','));
    });
    fs.mkdirSync(path.dirname(csvPath), { recursive: true });
    fs.writeFileSync(csvPath, lines.join('\n') + '\n');
}

const now = process.env.COUNTER_NOW ? new Date(process.env.COUNTER_NOW) : new Date();
if (Number.isNaN(now.getTime())) fail(`COUNTER_NOW 가 날짜가 아님(${process.env.COUNTER_NOW})`);

const totals = await readTotals();
const { date, weekday } = labelOf(now);
const rows = readRows();
const row = { date, weekday, pc: totals.pc, and: totals.and };
const at = rows.findIndex(r => r.date === date);
if (at >= 0) rows[at] = row;
else rows.push(row);
rows.sort((a, b) => a.date.localeCompare(b.date));
writeRows(rows);

console.log(`counter-log: ${date}(${weekday}) pc=${totals.pc} and=${totals.and} — ${at >= 0 ? '같은 날 줄 갱신' : '새 줄 추가'}`);
//   워크플로가 커밋 메시지에 쓸 날짜
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `date=${date}\n`);
