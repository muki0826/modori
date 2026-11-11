// 모도리 데이터 수집 — 매일 GitHub Actions에서 실행해 site/data/live.json을 갱신해요.
// 키가 없거나 한 곳이 실패해도 나머지는 그대로 두고 계속 진행해요.
import { readFile, writeFile } from 'node:fs/promises';

const OUT = new URL('../site/data/live.json', import.meta.url);
const SRC = JSON.parse(await readFile(new URL('./sources.json', import.meta.url), 'utf8'));
const { FSS_KEY = '', YT_KEY = '' } = process.env;
const prev = await readFile(OUT, 'utf8').then(JSON.parse).catch(() => ({}));
const live = {
  updated: prev.updated || null,
  products: { saving: [], deposit: [], ...(prev.products || {}) },
  videos: prev.videos || [],
  news: prev.news || [],
  status: {},
};
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); // KST
const get = async (url, as = 'json') => {
  const r = await fetch(url, { headers: { 'user-agent': 'modori-updater' }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return as === 'json' ? r.json() : r.text();
};
const unesc = s => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

/* 1) 예금·적금 금리 — 금융감독원 금융상품 한눈에 오픈 API */
async function products(kind) {
  const api = kind === 'saving' ? 'savingProductsSearch' : 'depositProductsSearch';
  const base = new Map();
  for (const grp of SRC.productGroups) {
    for (let page = 1, max = 1; page <= max && page <= 10; page++) {
      const j = await get(`https://finlife.fss.or.kr/finlifeapi/${api}.json?auth=${FSS_KEY}&topFinGrpNo=${grp}&pageNo=${page}`);
      const res = j.result || {};
      if (res.err_cd && res.err_cd !== '000') throw new Error(`FSS ${res.err_cd} ${res.err_msg || ''}`);
      max = +res.max_page_no || 1;
      for (const b of res.baseList || []) {
        base.set(`${b.fin_co_no}|${b.fin_prdt_cd}`, {
          co: b.kor_co_nm, name: b.fin_prdt_nm, join: (b.join_way || '').replace(/,/g, ', '), who: (b.join_member || '').slice(0, 80),
          cond: (b.spcl_cnd || '').slice(0, 600), limit: +b.max_limit || 0, rates: {},
        });
      }
      for (const o of res.optionList || []) {
        const p = base.get(`${o.fin_co_no}|${o.fin_prdt_cd}`), t = String(+o.save_trm), a = +o.intr_rate, m = +o.intr_rate2;
        if (!p || !t || !(a > 0)) continue;
        if (kind === 'saving' && o.rsrv_type && o.rsrv_type !== 'S' && p.rates[t]) continue; // 정액적립식 우선
        const cur = p.rates[t];
        if (!cur || o.rsrv_type === 'S' || a > cur[0]) p.rates[t] = [a, Math.max(a, m || a)];
      }
    }
  }
  return [...base.values()].filter(p => Object.keys(p.rates).length);
}

/* 2) 주제별 영상 — 유튜브 Data API 검색 */
async function videos() {
  const after = new Date(Date.now() - SRC.videoMaxAgeDays * 864e5).toISOString();
  const out = [], seen = new Set();
  for (const [topic, q] of Object.entries(SRC.videoQueries)) {
    const u = 'https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoDuration=medium&regionCode=KR&relevanceLanguage=ko&safeSearch=strict'
      + `&maxResults=${SRC.videosPerTopic + 2}&publishedAfter=${after}&q=${encodeURIComponent(q)}&key=${YT_KEY}`;
    const j = await get(u);
    let n = 0;
    for (const it of j.items || []) {
      const id = it.id && it.id.videoId, sn = it.snippet || {};
      if (!id || seen.has(id) || n >= SRC.videosPerTopic) continue;
      seen.add(id); n++;
      out.push({ topic, id, title: unesc(sn.title).slice(0, 90), channel: unesc(sn.channelTitle).slice(0, 30), date: (sn.publishedAt || '').slice(0, 10) });
    }
  }
  return out;
}

/* 3) 공식 소식 — 정책브리핑 RSS */
async function news() {
  const out = [];
  for (const f of SRC.feeds) {
    try {
      const xml = await get(f.url, 'text');
      for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
        const pick = tag => unesc((m[1].match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`)) || [])[1]);
        const title = pick('title'), link = pick('link'), d = new Date(pick('pubDate'));
        if (!title || !/^https?:\/\//.test(link) || !SRC.newsKeywords.some(k => title.includes(k))) continue;
        out.push({ title: title.slice(0, 90), link, src: f.src, date: isNaN(d) ? '' : new Date(+d + 9 * 3600e3).toISOString().slice(0, 10) });
      }
    } catch (e) { console.warn(`소식 ${f.src} 건너뜀: ${e.message}`); }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30);
}

const step = async (name, on, fn, apply) => {
  if (!on) { live.status[name] = 'skipped (키 없음)'; console.log(`${name}: 키가 없어 건너뛰어요`); return; }
  try { const v = await fn(); if (v && v.length) { apply(v); live.status[name] = `ok ${v.length}`; } else live.status[name] = 'empty (이전 값 유지)'; }
  catch (e) { live.status[name] = `error ${String(e.message).replace(FSS_KEY || '§', '***').replace(YT_KEY || '§', '***')} (이전 값 유지)`; }
  console.log(`${name}: ${live.status[name]}`);
};
await step('saving', !!FSS_KEY, () => products('saving'), v => { live.products.saving = v; });
await step('deposit', !!FSS_KEY, () => products('deposit'), v => { live.products.deposit = v; });
await step('videos', !!YT_KEY, videos, v => { live.videos = v; });
await step('news', true, news, v => { live.news = v; });
if (Object.values(live.status).some(s => s.startsWith('ok'))) live.updated = today;
await writeFile(OUT, JSON.stringify(live));
console.log(`저장: ${live.updated} · 적금 ${live.products.saving.length} · 예금 ${live.products.deposit.length} · 영상 ${live.videos.length} · 소식 ${live.news.length}`);
