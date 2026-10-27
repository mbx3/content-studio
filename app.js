(function () {
'use strict';
/* استودیو محتوا — اپ تولید و تحلیل محتوای اینستاگرام
 * همه‌ی داده‌ها فقط روی همین دستگاه ذخیره می‌شوند (IndexedDB).
 * این فایل از چند فایل منبع کنار هم ساخته شده؛ برای تغییر، بخش مربوط را پیدا کن. */
const APP_VERSION = '1.1.1';
const APP_ID = 'fitlife-studio';
const DAY_MS = 86400000;
const HOUR_MS = 3600000;

/* ---------- اعداد، متن و تاریخ میلادی ---------- */
const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

function faNum(s) {
  return String(s).replace(/[0-9]/g, (d) => FA_DIGITS[+d]);
}

// عدد خام برای نمایش داخل فیلد ورودی (بدون جداکننده‌ی هزارگان)
function faInput(n) {
  if (n == null || n === '') return '';
  return faNum(String(n)).replace('.', '٫');
}

function normDigits(s) {
  return String(s == null ? '' : s)
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660));
}

function parseNum(s) {
  if (s == null) return null;
  if (typeof s === 'number') return Number.isFinite(s) ? s : null;
  let t = normDigits(s).trim();
  t = t.replace(/[٪%\s‌‎‏]/g, '').replace(/٫/g, '.').replace(/[٬,،]/g, '');
  if (!t) return null;
  if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(t)) return Number(t);
  return null;
}

const _nf = {};
function fmtNum(n, frac = 0) {
  if (n == null || !Number.isFinite(n)) return '—';
  if (!_nf[frac]) {
    _nf[frac] = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: frac, minimumFractionDigits: 0 });
  }
  return _nf[frac].format(n);
}

function autoFrac(n) {
  const a = Math.abs(n);
  return a < 1 ? 2 : a < 10 ? 1 : 0;
}

function fmtPct(n, frac) {
  if (n == null || !Number.isFinite(n)) return '—';
  return fmtNum(n, frac == null ? autoFrac(n) : frac) + '٪';
}

function fmtCompact(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1e6) return fmtNum(n / 1e6, 1) + ' میلیون';
  if (a >= 1e4) return fmtNum(Math.round(n / 1e3)) + ' هزار';
  if (a >= 1e3) return fmtNum(Math.round(n / 100) / 10, 1) + ' هزار';
  return fmtNum(n);
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let _uidCounter = 0;
function uid(prefix) {
  return (prefix || '') + Date.now().toString(36) + (_uidCounter++).toString(36) + Math.random().toString(36).slice(2, 6);
}

function pad2(n) {
  return (n < 10 ? '0' : '') + n;
}

function dateToISO(d) {
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

function isoToDate(iso, time) {
  if (!iso) return null;
  const p = iso.split('-').map(Number);
  let hh = 0, mm = 0;
  if (time) {
    const t = time.split(':').map(Number);
    hh = t[0] || 0;
    mm = t[1] || 0;
  }
  return new Date(p[0], p[1] - 1, p[2], hh, mm);
}

function todayISO() {
  return dateToISO(new Date());
}

function nowTime() {
  const d = new Date();
  return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}

function addDaysISO(iso, n) {
  const d = isoToDate(iso);
  d.setDate(d.getDate() + n);
  return dateToISO(d);
}

function diffDaysISO(a, b) {
  return Math.round((isoToDate(b) - isoToDate(a)) / DAY_MS);
}

function wordCount(s) {
  const t = String(s || '').trim();
  return t ? t.split(/\s+/).length : 0;
}

function fmtHours(h) {
  if (h == null) return '';
  if (h < 1) return 'کمتر از یک ساعت';
  if (h < 48) return fmtNum(Math.round(h)) + ' ساعت';
  return fmtNum(Math.round(h / 24)) + ' روز';
}

function fmtAgoDays(days) {
  if (days == null) return 'هرگز';
  if (days <= 0) return 'امروز';
  if (days === 1) return 'دیروز';
  return fmtNum(days) + ' روز پیش';
}

function sum(arr) {
  let s = 0;
  for (const v of arr) if (v != null && Number.isFinite(v)) s += v;
  return s;
}

function median(arr) {
  const a = arr.filter((v) => v != null && Number.isFinite(v)).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function nameOf(list, id) {
  const f = list.find((x) => x.id === id);
  return f ? f.name : '';
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/* ---------- تقویم شمسی (الگوریتم Borkowski، مثل jalaali-js) ---------- */
const J_BREAKS = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];

function _jdiv(a, b) { return ~~(a / b); }
function _jmod(a, b) { return a - ~~(a / b) * b; }

function _jalCal(jy, withoutLeap) {
  const bl = J_BREAKS.length;
  const gy = jy + 621;
  let leapJ = -14, jp = J_BREAKS[0], jm, jump = 0, leap, leapG, march, n, i;
  if (jy < jp || jy >= J_BREAKS[bl - 1]) throw new Error('Invalid Jalali year ' + jy);
  for (i = 1; i < bl; i += 1) {
    jm = J_BREAKS[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ = leapJ + _jdiv(jump, 33) * 8 + _jdiv(_jmod(jump, 33), 4);
    jp = jm;
  }
  n = jy - jp;
  leapJ = leapJ + _jdiv(n, 33) * 8 + _jdiv(_jmod(n, 33) + 3, 4);
  if (_jmod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
  leapG = _jdiv(gy, 4) - _jdiv((_jdiv(gy, 100) + 1) * 3, 4) - 150;
  march = 20 + leapJ - leapG;
  if (withoutLeap) return { gy, march };
  if (jump - n < 6) n = n - jump + _jdiv(jump + 4, 33) * 33;
  leap = _jmod(_jmod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;
  return { leap, gy, march };
}

function _g2d(gy, gm, gd) {
  let d = _jdiv((gy + _jdiv(gm - 8, 6) + 100100) * 1461, 4) + _jdiv(153 * _jmod(gm + 9, 12) + 2, 5) + gd - 34840408;
  d = d - _jdiv(_jdiv(gy + 100100 + _jdiv(gm - 8, 6), 100) * 3, 4) + 752;
  return d;
}

function _d2g(jdn) {
  let j = 4 * jdn + 139361631;
  j = j + _jdiv(_jdiv(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = _jdiv(_jmod(j, 1461), 4) * 5 + 308;
  const gd = _jdiv(_jmod(i, 153), 5) + 1;
  const gm = _jmod(_jdiv(i, 153), 12) + 1;
  const gy = _jdiv(j, 1461) - 100100 + _jdiv(8 - gm, 6);
  return { gy, gm, gd };
}

function _j2d(jy, jm, jd) {
  const r = _jalCal(jy, true);
  return _g2d(r.gy, 3, r.march) + (jm - 1) * 31 - _jdiv(jm, 7) * (jm - 7) + jd - 1;
}

function _d2j(jdn) {
  const gy = _d2g(jdn).gy;
  let jy = gy - 621;
  const r = _jalCal(jy, false);
  const jdn1f = _g2d(gy, 3, r.march);
  let k = jdn - jdn1f, jm, jd;
  if (k >= 0) {
    if (k <= 185) {
      jm = 1 + _jdiv(k, 31);
      jd = _jmod(k, 31) + 1;
      return { jy, jm, jd };
    }
    k -= 186;
  } else {
    jy -= 1;
    k += 179;
    if (r.leap === 1) k += 1;
  }
  jm = 7 + _jdiv(k, 30);
  jd = _jmod(k, 30) + 1;
  return { jy, jm, jd };
}

function toJalali(gy, gm, gd) { return _d2j(_g2d(gy, gm, gd)); }
function toGregorian(jy, jm, jd) { return _d2g(_j2d(jy, jm, jd)); }

function jMonthLength(jy, jm) {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  return _jalCal(jy, false).leap === 0 ? 30 : 29;
}

const J_MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
// به ترتیب getDay() جاوااسکریپت (۰ = یکشنبه)
const WEEKDAYS = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'];
// ستون‌های تقویم از شنبه
const WD_SAT = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];
const WD_SAT_SHORT = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];

function isoToJ(iso) {
  const p = iso.split('-').map(Number);
  return toJalali(p[0], p[1], p[2]);
}

function jToISO(jy, jm, jd) {
  const g = toGregorian(jy, jm, jd);
  return g.gy + '-' + pad2(g.gm) + '-' + pad2(g.gd);
}

// ۰ = شنبه … ۶ = جمعه
function satIndex(iso) {
  return (isoToDate(iso).getDay() + 1) % 7;
}

function weekStartISO(iso) {
  return addDaysISO(iso, -satIndex(iso));
}

function jMonthStartISO(iso) {
  const j = isoToJ(iso);
  return jToISO(j.jy, j.jm, 1);
}

function addJMonths(iso, n) {
  const j = isoToJ(iso);
  let m = j.jm - 1 + n;
  const jy = j.jy + Math.floor(m / 12);
  m = ((m % 12) + 12) % 12;
  return jToISO(jy, m + 1, 1);
}

function fmtJ(iso, opt) {
  opt = opt || {};
  if (!iso) return 'بدون تاریخ';
  const j = isoToJ(iso);
  let s = faNum(j.jd) + ' ' + J_MONTHS[j.jm - 1];
  const thisYear = isoToJ(todayISO()).jy;
  if (opt.year === true || (opt.year !== false && j.jy !== thisYear)) s += ' ' + faNum(j.jy);
  if (opt.weekday) s = WEEKDAYS[isoToDate(iso).getDay()] + ' ' + s;
  return s;
}

function fmtJMonth(iso) {
  const j = isoToJ(iso);
  return J_MONTHS[j.jm - 1] + ' ' + faNum(j.jy);
}

function relDayName(iso) {
  const dd = diffDaysISO(todayISO(), iso);
  if (dd === 0) return 'امروز';
  if (dd === 1) return 'فردا';
  if (dd === -1) return 'دیروز';
  return null;
}

function fmtJShort(iso) {
  return relDayName(iso) || fmtJ(iso, { weekday: Math.abs(diffDaysISO(todayISO(), iso)) < 7 });
}

function fmtWhen(iso, time) {
  if (!iso) return 'بدون تاریخ';
  return fmtJShort(iso) + (time ? '، ساعت ' + faNum(time) : '');
}

/* ---------- تاریخ میلادی (اینستاگرام تاریخ‌ها را میلادی نشان می‌دهد) ---------- */
const G_MONTHS = ['ژانویه', 'فوریه', 'مارس', 'آوریل', 'مه', 'ژوئن', 'ژوئیه', 'اوت', 'سپتامبر', 'اکتبر', 'نوامبر', 'دسامبر'];

function gParts(iso) {
  const p = iso.split('-').map(Number);
  return { gy: p[0], gm: p[1], gd: p[2] };
}

function fmtG(iso, withYear) {
  const g = gParts(iso);
  const showYear = withYear === true || (withYear !== false && g.gy !== new Date().getFullYear());
  return faNum(g.gd) + ' ' + G_MONTHS[g.gm - 1] + (showYear ? ' ' + faNum(g.gy) : '');
}

// یک ماه شمسی همیشه دو ماه میلادی را می‌پوشاند
function gMonthsLabel(monthStartISO) {
  const j = isoToJ(monthStartISO);
  const a = gParts(monthStartISO);
  const b = gParts(jToISO(j.jy, j.jm, jMonthLength(j.jy, j.jm)));
  if (a.gy === b.gy) return G_MONTHS[a.gm - 1] + ' و ' + G_MONTHS[b.gm - 1] + ' ' + faNum(b.gy);
  return G_MONTHS[a.gm - 1] + ' ' + faNum(a.gy) + ' و ' + G_MONTHS[b.gm - 1] + ' ' + faNum(b.gy);
}

function fmtWhenG(iso, time) {
  if (!iso) return 'انتخاب تاریخ';
  return fmtWhen(iso, time) + (relDayName(iso) ? '' : ' (' + fmtG(iso) + ')');
}

/* ---------- مقادیر پیش‌فرض ---------- */
const GOALS = [
  { id: 'attract', name: 'جذب' },
  { id: 'trust', name: 'اعتمادسازی' },
  { id: 'sell', name: 'فروش' },
];
const FORMATS = [
  { id: 'reel', name: 'ریلز' },
  { id: 'carousel', name: 'کاروسل' },
  { id: 'post', name: 'پست تکی' },
  { id: 'story', name: 'استوری' },
];
const PUBTYPES = [
  { id: 'normal', name: 'عادی' },
  { id: 'trial', name: 'ترایل' },
  { id: 'collab', name: 'کولب کلینیک' },
  { id: 'collab2', name: 'کولب دیگر' },
];
const STAGES = [
  { id: 'idea', name: 'ایده', short: 'ایده' },
  { id: 'script', name: 'سناریو', short: 'سناریو' },
  { id: 'shoot', name: 'ضبط', short: 'ضبط' },
  { id: 'edit', name: 'ادیت', short: 'ادیت' },
  { id: 'ready', name: 'آماده انتشار', short: 'آماده' },
  { id: 'published', name: 'منتشر شد', short: 'منتشر' },
];
const PROD_STAGES = ['script', 'shoot', 'edit', 'ready'];
const PRIORITIES = [
  { id: 'high', name: 'فوری' },
  { id: 'mid', name: 'معمولی' },
  { id: 'low', name: 'بعداً' },
];
const LEAD_TYPES = [
  { id: 'dm', name: 'دایرکت مشاوره' },
  { id: 'booking', name: 'نوبت گرفت' },
  { id: 'visit', name: 'مراجعه کرد' },
  { id: 'online', name: 'پلن مجازی' },
];
const L_STATUS = [
  { id: 'hyp', name: 'فرضیه' },
  { id: 'test', name: 'در حال تست' },
  { id: 'ok', name: 'تأیید شده' },
  { id: 'no', name: 'رد شده' },
];
const SNIP_KINDS = [
  { id: 'hook', name: 'هوک' },
  { id: 'cta', name: 'CTA' },
  { id: 'retention', name: 'متن نگهداشت' },
  { id: 'cover', name: 'متن کاور' },
];
const CHECKPOINT_NAMES = { 24: '۲۴ ساعته', 72: '۷۲ ساعته', 168: '۷ روزه', 720: '۳۰ روزه' };

function checkpointName(t, label) {
  if (CHECKPOINT_NAMES[t]) return CHECKPOINT_NAMES[t];
  if (label) return label;
  if (t != null) return fmtHours(t);
  return 'ثبت دستی';
}

// تعداد رنگ سری‌ها؛ مقدار رنگ‌ها در styles.css (--s0 تا --s6) برای حالت روشن و تیره جداست
const SERIES_COLORS = 7;

const DEFAULT_TEMPLATES = {
  ideas:
    'تو استراتژیست محتوای من هستی. برای [حوزه] ۳۰ ایده محتوا تولید کن. با جستجو در بین فعالین و مخاطبان این حوزه در شبکه‌های اجتماعی خصوصاً اینستاگرام روی بزرگترین دغدغه‌ها، ناامیدی‌ها، ترس‌ها، اشتباهات، اعتراض‌ها، خواسته‌ها و اهداف مخاطبانم تمرکز کن. از ایده‌هایی که در اینستاگرام خارجی موفق بودند اما چندان در اینستاگرام ایرانی وارد نشده‌اند در صورتی که احساس می‌کنی مانع فرهنگی برای ارتباط برقرار کردن مخاطب ایرانی با آن وجود ندارد، ایده بگیر ولی تعداد این ایده‌ها حداکثر نیمی از کل ایده‌ها باشد. ایده‌ها را در سه دسته جذب، اعتمادسازی و فروش تقسیم‌بندی کن. برای هر ایده، فرمت محتوا، زاویه هوک و دلیل عملکرد خوب آن را هم بنویس.',
  hook:
    'برای [موضوع] ۳۰ هوک اسکرول‌استاپ تولید کن. هر هوک بین ۵ تا ۱۰ کلمه باشد. روی احساسات منفی، اشتباهات، باورهای غلط، پیامدهای دردناک، فرصت‌های از دست‌رفته و شکاف کنجکاوی تمرکز کن. از هوک‌های کلیشه‌ای دوری کن و کاری کن هر کدام غیرقابل نادیده گرفتن باشند.',
  cta:
    'برای [پست] ۳۰ CTA تولید کن. هدف افزایش ذخیره، اشتراک‌گذاری، کامنت و دایرکت باشد. لحن CTAها را طبیعی، ظریف و محاوره‌ای نگه دار. طوری ننویس که فروشنده‌طور یا اصراری به نظر برسد؛ کاری کن مخاطب با میل خودش تعامل کند.',
  caption:
    'برای [موضوع] یک کپشن اینستاگرامی بنویس. لحن آن انسانی و قابل همدلی باشد. با یک جمله‌ی شروع قوی آغاز کن، پاراگراف‌ها را کوتاه نگه دار، از زبان ساده استفاده کن، نکات کاربردی قابل اجرا؛ یک CTA ظریف، ۵ هشتگ مرتبط و کلمات کلیدی سئو را در انتها قرار بده.',
  scenario:
    'در نقش یک نویسنده‌ی حرفه‌ای محتوا عمل کن. برای [موضوع] یک سناریوی ریلز اینستاگرام ۳۰ تا ۵۰ ثانیه‌ای بنویس. حوزه‌ی کاری من [حوزه کاری] است، جایگاه من در این سناریو [جایگاه] است. مخاطب هدف من [مخاطب هدف] هستند. متن باید طوری باشد که انگار دارم با یک دوست حرف می‌زنم؛ با زبان ساده، هوک قوی، روان، یک پیام روشن و یک CTA طبیعی. از لحن خشک، رسمی یا رباتی دوری کن.',
};

const TEMPLATE_NAMES = {
  ideas: 'ایده محتوا',
  hook: 'هوک',
  cta: 'CTA',
  caption: 'کپشن',
  scenario: 'سناریو',
};

const DEFAULT_CHECKLIST = [
  { id: 'c1', text: 'دلیل سیو قبل از ثانیه‌ی ۱۵ دیده می‌شه' },
  { id: 'c2', text: 'اصل حرف همون ثانیه‌های اول می‌رسه' },
  { id: 'c3', text: 'متن نگهداشت واضحه و آخر ویدیو جوابش داده می‌شه' },
  { id: 'c4', text: 'متن نگهداشت به متن دیگه‌ای روی صفحه ارجاع نمی‌ده' },
  { id: 'c5', text: 'نوع CTA با محتوا جوره (محتوای بیرونی: شیر، موقعیت شخصی: دایرکت)' },
  { id: 'c6', text: 'ادعاهای علمی منبع دارن و عدم قطعیت گفته شده' },
  { id: 'c7', text: 'اسم برند دارو توی متن خودم نیومده' },
  { id: 'c8', text: 'هیچ بیماری قضاوت یا شرمنده نمی‌شه' },
  { id: 'c9', text: 'زیرنویس اضافه شده' },
  { id: 'c10', text: 'کاور ساده و خواناست' },
  { id: 'c11', text: 'خط اول کپشن هوکه و کلمات کلیدی داخل متن اومده' },
  { id: 'c12', text: '۵ هشتگ مرتبط گذاشتم' },
  { id: 'c13', text: 'برای مقایسه‌ی بالینی حساس، خط توضیح توی کپشن هست' },
];

function defaultSettings() {
  return {
    theme: 'auto',
    series: [
      { id: 'qa', name: '۳۰ ثانیه، یک سوال', short: '۳۰ثانیه', ci: 0 },
      { id: 'sci', name: 'علم رژیم', short: 'علمی', ci: 1 },
      { id: 'fun', name: 'طنز و سرگرمی', short: 'طنز', ci: 2 },
      { id: 'self', name: 'از خودم', short: 'از خودم', ci: 3 },
      { id: 'cook', name: 'آشپزخونه', short: 'آشپزخونه', ci: 4 },
      { id: 'clinic', name: 'کولب کلینیک', short: 'کولب', ci: 5 },
      { id: 'other', name: 'سایر', short: 'سایر', ci: 6 },
    ],
    lists: {
      sources: ['سؤال بیمار', 'گروه تلگرام', 'کامنت یا دایرکت', 'ترند خارجی', 'تجربه‌ی خودم', 'مقاله و تحقیق', 'ایده‌پردازی با Claude'],
      concerns: ['استوپ وزنی', 'نوسان وزن هفتگی', 'طب سنتی', 'قطع دارو', 'فستینگ و کتو', 'چرا رژیم دیگه جواب نمی‌ده', 'آمپول لاغری', 'عوارض دارو', 'ولع و پرخوری'],
      styles: ['سلفی تک‌برداشت', 'آشپزی و ریویل', 'جدول و گرافیک', 'داستان‌گویی', 'طنز و نمایشی', 'اسلایدشو عکس'],
      hookTypes: ['تناقض تصویری', 'سؤال بیمار روی صفحه', 'شکاف کنجکاوی', 'باور غلط', 'اعتراف شخصی', 'عدد و فهرست', 'معرفی مستقیم موضوع'],
      ctaTypes: ['سیو', 'شیر', 'کامنت', 'دایرکت', 'فالو', 'بدون CTA'],
      locations: ['سر شیفت', 'خانه', 'کلینیک', 'بیرون'],
      centers: ['بابلسر', 'جویبار', 'آنلاین'],
      channels: ['ریلز', 'استوری', 'اکسپلور', 'پیج کلینیک', 'معرفی دیگران', 'سایر'],
      lcats: ['هوک', 'کاور', 'فرمت', 'کپشن', 'زمان انتشار', 'الگوریتم', 'CTA', 'سایر'],
    },
    checklist: DEFAULT_CHECKLIST.map((c) => Object.assign({}, c)),
    checkpoints: [24, 72, 168, 720],
    wpm: 140,
    backupDays: 7,
    statMode: 'pct',
    profile: {
      field: 'پزشکی عمومی با تمرکز بر تغذیه و مدیریت وزن',
      role: 'راوی اول‌شخص (پزشک تغذیه، با لحن یک دوست قابل اعتماد)',
      audience: 'بزرگسالان ۲۵ تا ۵۴ ساله‌ی علاقه‌مند به کاهش وزن (با رژیم یا آمپول)',
    },
    templates: Object.assign({}, DEFAULT_TEMPLATES),
  };
}

// فهرست‌هایی که در تنظیمات قابل ویرایش‌اند و فیلدهایی که از آن‌ها استفاده می‌کنند
const LIST_META = {
  sources: { name: 'منبع ایده', fields: [['items', 'source']] },
  concerns: { name: 'دغدغه‌های مخاطب', fields: [['items', 'concerns', true]] },
  styles: { name: 'سبک اجرا', fields: [['items', 'style']] },
  hookTypes: { name: 'نوع هوک', fields: [['items', 'hookType']] },
  ctaTypes: { name: 'نوع CTA', fields: [['items', 'ctaType']] },
  locations: { name: 'محل ضبط', fields: [['items', 'location']] },
  centers: { name: 'مراکز درمانی', fields: [['leads', 'center']] },
  channels: { name: 'راه آشنایی بیمار', fields: [['leads', 'channel']] },
  lcats: { name: 'دسته‌ی درس‌ها', fields: [['learnings', 'category']] },
};

/* ---------- داده‌ها و ذخیره‌سازی روی دستگاه ---------- */
let S = null; // کل داده‌های اپ

const IDB_NAME = 'fitlife-studio';
const IDB_STORE = 'kv';
const LS_STATE = IDB_NAME + ':state'; // نسخه‌ی دوم داده‌ها در localStorage
const COLLS = ['items', 'leads', 'learnings', 'snippets', 'questions'];
let _db = null;
let _storageWarn = null; // اگر IndexedDB باز نشد

function idbOpen() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('IndexedDB در دسترس نیست'));
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbRun(mode, fn) {
  return new Promise((resolve, reject) => {
    const tx = _db.transaction(IDB_STORE, mode);
    const r = fn(tx.objectStore(IDB_STORE));
    tx.oncomplete = () => resolve(r ? r.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function kvGet(key) {
  if (_db) return idbRun('readonly', (st) => st.get(key));
  const v = localStorage.getItem(IDB_NAME + ':' + key);
  return v ? JSON.parse(v) : undefined;
}

async function kvSet(key, val) {
  if (_db) return idbRun('readwrite', (st) => st.put(val, key));
  localStorage.setItem(IDB_NAME + ':' + key, JSON.stringify(val));
}

function emptyState() {
  return {
    app: APP_ID,
    version: 1,
    meta: { createdAt: new Date().toISOString(), lastBackupAt: null, savedAt: null, timeFix1: true, settingsAt: null },
    settings: defaultSettings(),
    items: [],
    leads: [],
    learnings: [],
    snippets: [],
    questions: [],
    inbox: {},
    igIgnored: [],
    tomb: {},
  };
}

function isEmptyState(st) {
  return !st || COLLS.every((k) => !st[k] || !st[k].length);
}

function normItem(it) {
  const base = {
    title: '', series: 'other', goal: null, stage: 'idea', format: 'reel', pubType: 'normal',
    style: null, hookType: null, ctaType: null, source: null, concerns: [], location: null,
    priority: 'mid', notes: '', plannedDate: null, plannedTime: null, publishDate: null,
    publishTime: null, order: null, durationSec: null, caption: '', sources: [], checklist: {},
    snapshots: [], archived: false,
  };
  for (const k in base) if (it[k] === undefined) it[k] = base[k];
  it.script = Object.assign({ hook: '', retention: '', body: '', cta: '', shots: '' }, it.script || {});
  it.cover = Object.assign({ text: '', notes: '' }, it.cover || {});
  if (!Array.isArray(it.concerns)) it.concerns = [];
  if (!Array.isArray(it.sources)) it.sources = [];
  if (!Array.isArray(it.snapshots)) it.snapshots = [];
  it.snapshots.forEach((s) => { if (!s.id) s.id = uid('s'); });
  it.sources.forEach((s) => { if (!s.id) s.id = uid('r'); });
  if (!it.id) it.id = uid('i');
  if (!it.createdAt) it.createdAt = new Date().toISOString();
  if (!it.updatedAt) it.updatedAt = it.createdAt;
  return it;
}

let _migrated = false;

function migrate(st) {
  const d = defaultSettings();
  const cur = st.settings || {};
  st.settings = Object.assign({}, d, cur);
  st.settings.lists = Object.assign({}, d.lists, cur.lists || {});
  st.settings.profile = Object.assign({}, d.profile, cur.profile || {});
  st.settings.templates = Object.assign({}, d.templates, cur.templates || {});
  if (!Array.isArray(st.settings.series) || !st.settings.series.length) st.settings.series = d.series;
  if (!st.settings.series.some((s) => s.id === 'other')) st.settings.series.push({ id: 'other', name: 'سایر', short: 'سایر', ci: 6 });
  if (!Array.isArray(st.settings.checklist)) st.settings.checklist = d.checklist;
  if (!Array.isArray(st.settings.checkpoints) || !st.settings.checkpoints.length) st.settings.checkpoints = d.checkpoints;
  for (const k of COLLS) if (!Array.isArray(st[k])) st[k] = [];
  if (!st.inbox || typeof st.inbox !== 'object' || Array.isArray(st.inbox)) st.inbox = {};
  if (!Array.isArray(st.igIgnored)) st.igIgnored = [];
  if (!st.tomb || typeof st.tomb !== 'object' || Array.isArray(st.tomb)) st.tomb = {};
  st.meta = Object.assign({ createdAt: new Date().toISOString(), lastBackupAt: null, savedAt: null }, st.meta || {});
  st.items.forEach(normItem);
  // نسخه‌ی ۱.۰.۰ برای پستی که بعداً وارد می‌شد، ساعت همان لحظه‌ی ثبت را می‌گذاشت.
  // ساعت پست‌هایی که تاریخ انتشارشان قبل از روز ثبتشان در اپ است، یک بار پاک می‌شود.
  if (!st.meta.timeFix1) {
    for (const it of st.items) {
      if (it.publishDate && it.publishTime && it.createdAt && it.publishDate < dateToISO(new Date(it.createdAt))) it.publishTime = null;
    }
    st.meta.timeFix1 = true;
    _migrated = true;
  }
  for (const k of ['leads', 'learnings', 'snippets', 'questions']) {
    st[k].forEach((x) => {
      if (!x.id) x.id = uid(k[0]);
      if (!x.updatedAt) x.updatedAt = x.createdAt || new Date().toISOString();
    });
  }
  st.learnings.forEach((l) => { if (!Array.isArray(l.itemIds)) l.itemIds = []; });
  st.app = APP_ID;
  st.version = 1;
  return st;
}

function _readMirror() {
  try {
    const v = localStorage.getItem(LS_STATE);
    return v ? JSON.parse(v) : null;
  } catch (e) {
    return null;
  }
}

function _newer(a, b) {
  if (!a) return b;
  if (!b) return a;
  const sa = (a.meta && a.meta.savedAt) || '';
  const sb = (b.meta && b.meta.savedAt) || '';
  return sb > sa ? b : a;
}

let _lastSettingsJSON = null;

async function loadState() {
  let fromIdb = null;
  try {
    _db = await idbOpen();
  } catch (e) {
    _db = null;
    _storageWarn = 'idb';
  }
  if (_db) {
    try {
      fromIdb = await idbRun('readonly', (st) => st.get('state'));
    } catch (e) {
      console.warn(e);
      _storageWarn = 'idb';
    }
  }
  // هر کدام تازه‌تر بود؛ اگر یکی از دست رفته باشد، دیگری جایش را می‌گیرد
  const st = _newer(fromIdb || null, _readMirror());
  S = st ? migrate(st) : emptyState();
  _lastSettingsJSON = JSON.stringify(S.settings);
  if (_migrated || (st && !fromIdb && _db)) {
    _migrated = false;
    await save(true);
  }
  return S;
}

let _saveTimer = null;
let _saveFailedOnce = false;
let _pendingLoud = false; // فقط تغییرهای کاربر همگام‌سازی را صدا می‌زنند، نه ذخیره‌های خود همگام‌سازی

async function _doSave() {
  _saveTimer = null;
  const loud = _pendingLoud;
  _pendingLoud = false;
  try {
    const now = new Date().toISOString();
    const sj = JSON.stringify(S.settings);
    if (_lastSettingsJSON !== null && sj !== _lastSettingsJSON) S.meta.settingsAt = now;
    _lastSettingsJSON = sj;
    S.meta.savedAt = now;
    await kvSet('state', S);
    _saveFailedOnce = false;
  } catch (e) {
    console.error(e);
    if (!_saveFailedOnce) toast('ذخیره نشد. یک پشتیبان بگیر و اپ رو دوباره باز کن.');
    _saveFailedOnce = true;
  }
  if (_db) {
    try {
      localStorage.setItem(LS_STATE, JSON.stringify(S));
    } catch (e) {
      // فضای localStorage پر است؛ نسخه‌ی کهنه نباید جای نسخه‌ی اصلی را بگیرد
      try { localStorage.removeItem(LS_STATE); } catch (e2) { /* ignore */ }
    }
  }
  if (loud && typeof onStateSaved === 'function') onStateSaved();
}

function save(immediate, quiet) {
  if (!quiet) _pendingLoud = true;
  if (_saveTimer) clearTimeout(_saveTimer);
  if (immediate) return _doSave();
  _saveTimer = setTimeout(_doSave, 250);
}

function flushSave() {
  if (_saveTimer) {
    clearTimeout(_saveTimer);
    return _doSave();
  }
  return Promise.resolve();
}

function touch(obj) {
  if (obj) obj.updatedAt = new Date().toISOString();
  save();
}

// حذف یک مورد؛ نشانه‌ی حذف نگه داشته می‌شود تا همگام‌سازی آن را برنگرداند
function markDeleted(id) {
  if (id) S.tomb[id] = new Date().toISOString();
}

// بعد از جایگزینی کامل، نسخه‌ی روی گیت‌هاب هم بدون ادغام جایگزین می‌شود
function markForcePush() {
  S.meta.forcePushAt = new Date().toISOString();
}

// متن ثابت داده‌ها برای فهمیدن اینکه چیزی واقعاً عوض شده یا نه
function canonicalState(st) {
  const meta = Object.assign({}, st.meta);
  delete meta.savedAt;
  delete meta.lastBackupAt;
  return JSON.stringify(Object.assign({}, st, { meta }));
}

function hashStr(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(36) + (h1 >>> 0).toString(36);
}

async function requestPersist() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      const already = await navigator.storage.persisted();
      if (!already) await navigator.storage.persist();
    }
  } catch (e) { /* ignore */ }
}

/* ---------- ساخت و پیدا کردن موارد ---------- */
function newItem(p) {
  const now = new Date().toISOString();
  return normItem(Object.assign({ id: uid('i'), createdAt: now, updatedAt: now, series: 'sci', stage: 'idea' }, p || {}));
}

function itemById(id) {
  return S.items.find((i) => i.id === id) || null;
}

function seriesById(id) {
  const list = S.settings.series;
  return list.find((s) => s.id === id) || list.find((s) => s.id === 'other') || list[0];
}

function seriesVar(id) {
  const sr = seriesById(id);
  return '--sc:var(--s' + ((sr ? sr.ci : 6) % SERIES_COLORS) + ')';
}

function isCollab(it) {
  return it.pubType === 'collab' || it.pubType === 'collab2';
}

function isPublished(it) {
  return it.stage === 'published';
}

function activeItems() {
  return S.items.filter((i) => !i.archived);
}

// کلید ترتیب زمانی انتشار؛ پست‌های بدون تاریخ قدیمی‌تر از پست‌های تاریخ‌دار حساب می‌شوند
function pubKey(it) {
  if (it.publishDate) return 1e13 + isoToDate(it.publishDate, it.publishTime || '12:00').getTime();
  return it.order != null ? it.order : 0;
}

function publishedChrono() {
  return activeItems().filter(isPublished).sort((a, b) => pubKey(a) - pubKey(b));
}

function hoursSincePub(it, now) {
  if (!it.publishDate) return null;
  return ((now || Date.now()) - isoToDate(it.publishDate, it.publishTime || '12:00').getTime()) / HOUR_MS;
}

// درج آمار به ترتیب زمانی (بر اساس ساعت از انتشار)
function insertSnapshot(it, snap) {
  const arr = it.snapshots;
  if (snap.t == null) { arr.push(snap); return; }
  let pos = arr.length;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i].t != null && arr[i].t > snap.t) { pos = i; break; }
  }
  arr.splice(pos, 0, snap);
}

function nextOrder() {
  let m = 0;
  for (const it of S.items) if (it.order != null && it.order > m) m = it.order;
  return m + 1;
}

/* ---------- پشتیبان‌گیری ---------- */
function backupFileName(ext) {
  const j = isoToJ(todayISO());
  return 'studio-backup-' + j.jy + '-' + pad2(j.jm) + '-' + pad2(j.jd) + '.' + ext;
}

function exportJSON() {
  return JSON.stringify({ app: APP_ID, kind: 'backup', version: 1, appVersion: APP_VERSION, exportedAt: new Date().toISOString(), data: S });
}

function downloadText(filename, text, mime) {
  const blob = new Blob([text], { type: mime || 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

async function shareBackup() {
  const text = exportJSON();
  const file = new File([text], backupFileName('txt'), { type: 'text/plain' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'پشتیبان استودیو محتوا' });
      return 'shared';
    } catch (e) {
      if (e && e.name === 'AbortError') return 'aborted';
    }
  }
  downloadText(backupFileName('json'), text);
  return 'downloaded';
}

function saveBackupFile() {
  downloadText(backupFileName('json'), exportJSON());
  return 'downloaded';
}

function markBackedUp() {
  S.meta.lastBackupAt = new Date().toISOString();
  save();
}

function daysSinceBackup() {
  if (!S.meta.lastBackupAt) return null;
  return Math.floor((Date.now() - new Date(S.meta.lastBackupAt).getTime()) / DAY_MS);
}

function parseBackup(text) {
  let obj;
  try { obj = JSON.parse(text); } catch (e) { throw new Error('این فایل قابل خواندن نیست.'); }
  const data = obj && obj.data ? obj.data : obj;
  if (!data || !Array.isArray(data.items)) throw new Error('این فایل، پشتیبان استودیو محتوا نیست.');
  return data;
}

async function keepSafetyCopy() {
  try { await kvSet('prev', JSON.parse(JSON.stringify(S))); } catch (e) { console.warn(e); }
}

async function replaceAll(data) {
  await keepSafetyCopy();
  S = migrate(JSON.parse(JSON.stringify(data)));
  markForcePush();
  await save(true);
}

async function mergeAll(data) {
  await keepSafetyCopy();
  const inc = migrate(JSON.parse(JSON.stringify(data)));
  let added = 0, updated = 0;
  for (const k of COLLS) {
    const map = new Map(S[k].map((x) => [x.id, x]));
    for (const x of inc[k]) {
      const cur = map.get(x.id);
      if (!cur) { S[k].push(x); added++; }
      else if ((x.updatedAt || '') > (cur.updatedAt || '')) {
        S[k][S[k].indexOf(cur)] = x;
        updated++;
      }
    }
  }
  // سری‌ها و فهرست‌هایی که در فایل هست ولی اینجا نیست اضافه می‌شوند
  for (const sr of inc.settings.series) {
    if (!S.settings.series.some((s) => s.id === sr.id)) S.settings.series.push(sr);
  }
  for (const key in inc.settings.lists) {
    const cur = S.settings.lists[key] || (S.settings.lists[key] = []);
    for (const v of inc.settings.lists[key]) if (!cur.includes(v)) cur.push(v);
  }
  await save(true);
  return { added, updated };
}

async function restorePrev() {
  const prev = await kvGet('prev');
  if (!prev) return false;
  const cur = JSON.parse(JSON.stringify(S));
  S = migrate(prev);
  markForcePush();
  await kvSet('prev', cur);
  await save(true);
  return true;
}

async function hasPrev() {
  try { return !!(await kvGet('prev')); } catch (e) { return false; }
}

async function resetAll() {
  await keepSafetyCopy();
  S = emptyState();
  markForcePush();
  await save(true);
}

/* ---------- شاخص‌ها و تحلیل ---------- */
function _ratio(a, b, k) {
  return a != null && b ? (a / b) * k : null;
}

function rateOf(s, key) {
  const p = s[key + 'Pct'];
  if (p != null) return p;
  return _ratio(s[key], s.reach, 100);
}

function countOf(s, key) {
  if (s[key] != null) return s[key];
  const p = s[key + 'Pct'];
  if (p != null && s.reach) return Math.round((p * s.reach) / 100);
  return null;
}

const METRICS = {
  followRate: { name: 'تبدیل به فالوور', unit: 'pct', better: 1, desc: 'فالوور جدید تقسیم بر بیننده‌ها (ریچ). مهم‌ترین شاخص رشد پیج.', need: 'فالوور جدید و ریچ', calc: (s) => _ratio(s.follows, s.reach, 100) },
  saveRate: { name: 'نرخ سیو', unit: 'pct', better: 1, desc: 'سیو تقسیم بر بیننده‌ها.', need: 'سیو (یا درصدش) و ریچ', calc: (s) => rateOf(s, 'saves') },
  shareRate: { name: 'نرخ شیر', unit: 'pct', better: 1, desc: 'شیر تقسیم بر بیننده‌ها.', need: 'شیر (یا درصدش) و ریچ', calc: (s) => rateOf(s, 'shares') },
  avgWatch: { name: 'واچ‌تایم', unit: 'sec', better: 1, desc: 'میانگین زمان تماشا به ثانیه. روی این پیج، کل زمان توجه از درصد نگهداشت مهم‌تر بوده.', need: 'میانگین واچ‌تایم', calc: (s) => (s.avgWatch != null ? s.avgWatch : null) },
  retention: { name: 'نگهداشت', unit: 'pct', better: 1, desc: 'واچ‌تایم تقسیم بر مدت ویدیو.', need: 'واچ‌تایم و مدت ویدیو', calc: (s, it) => (s.avgWatch != null && it.durationSec ? (s.avgWatch / it.durationSec) * 100 : null) },
  skipRate: { name: 'اسکیپ‌ریت', unit: 'pct', better: -1, desc: 'درصد بیننده‌هایی که سریع رد شدن. هرچی کمتر، بهتر.', need: 'اسکیپ‌ریت', calc: (s) => (s.skipRate != null ? s.skipRate : null) },
  profileRate: { name: 'بازدید پروفایل', unit: 'per1k', better: 1, desc: 'بازدید پروفایل در هر ۱۰۰۰ بیننده.', need: 'بازدید پروفایل و ریچ', calc: (s) => _ratio(s.profileVisits, s.reach, 1000) },
  nonFollower: { name: 'سهم غیرفالوور', unit: 'pct', better: 1, desc: 'چند درصد بیننده‌ها فالوورت نبودن؛ یعنی پست چقدر به آدم‌های جدید رسیده.', need: 'درصد فالوور/غیرفالوور', calc: (s) => (s.followersPct != null ? 100 - s.followersPct : null) },
  commentRate: { name: 'نرخ کامنت', unit: 'pct', better: 1, desc: 'کامنت تقسیم بر بیننده‌ها.', need: 'کامنت (یا درصدش) و ریچ', calc: (s) => rateOf(s, 'comments') },
  views: { name: 'ویو', unit: 'count', better: 1, desc: 'تعداد بازدید.', need: 'ویو', calc: (s) => (s.views != null ? s.views : null) },
  follows: { name: 'فالوور جدید', unit: 'count', better: 1, desc: 'فالوورهایی که از این پست اومدن.', need: 'فالوور جدید', calc: (s) => (s.follows != null ? s.follows : null) },
  dms: { name: 'دایرکت مشاوره', unit: 'count', better: 1, desc: 'دایرکت‌های مشاوره‌ای که در «قیف بیمار» به این پست نسبت دادی.', lead: true },
  bookings: { name: 'نوبت و پلن', unit: 'count', better: 1, desc: 'نوبت حضوری یا پلن مجازی که به این پست نسبت دادی.', lead: true },
};
const METRIC_ORDER = ['followRate', 'saveRate', 'shareRate', 'avgWatch', 'retention', 'skipRate', 'profileRate', 'nonFollower', 'commentRate', 'views', 'follows', 'dms', 'bookings'];

function fmtMetric(mid, v) {
  if (v == null || !Number.isFinite(v)) return '—';
  const u = METRICS[mid].unit;
  if (u === 'pct') return fmtPct(v);
  if (u === 'sec') return fmtNum(v, v < 10 ? 1 : 0) + ' ثانیه';
  if (u === 'per1k') return fmtNum(v, v < 10 ? 1 : 0);
  return fmtCompact(v);
}

let _leadIdx = null;
function leadIndex() {
  if (_leadIdx) return _leadIdx;
  const idx = {};
  for (const l of S.leads) {
    if (!l.itemId) continue;
    const e = idx[l.itemId] || (idx[l.itemId] = { dm: 0, booking: 0, visit: 0, online: 0 });
    e[l.type] = (e[l.type] || 0) + (l.count || 1);
  }
  _leadIdx = idx;
  return idx;
}
function invalidateLeads() { _leadIdx = null; }

// مقدار یک شاخص برای یک پست. basis: 'latest' یا ساعت مقطع (۲۴، ۷۲، …)
function metricFor(it, mid, basis) {
  const m = METRICS[mid];
  if (m.lead) {
    if (!isPublished(it)) return { value: null, snap: null };
    const e = leadIndex()[it.id] || {};
    const v = mid === 'dms' ? e.dm || 0 : (e.booking || 0) + (e.online || 0);
    return { value: v, snap: null };
  }
  const snaps = it.snapshots;
  if (basis && basis !== 'latest') {
    const h = Number(basis);
    const s = snaps.find((x) => x.t === h);
    if (!s) return { value: null, snap: null };
    const v = m.calc(s, it);
    return { value: v != null && Number.isFinite(v) ? v : null, snap: s };
  }
  for (let i = snaps.length - 1; i >= 0; i--) {
    const v = m.calc(snaps[i], it);
    if (v != null && Number.isFinite(v)) return { value: v, snap: snaps[i] };
  }
  return { value: null, snap: null };
}

function analysisPool(includeCollab) {
  return publishedChrono().filter((it) => includeCollab || !isCollab(it));
}

function accountMedian(mid) {
  return median(analysisPool(false).map((it) => metricFor(it, mid, 'latest').value));
}

function _hourBucket(t) {
  const h = +String(t).split(':')[0];
  if (h >= 6 && h < 12) return 'صبح (۶ تا ۱۲)';
  if (h >= 12 && h < 17) return 'ظهر (۱۲ تا ۱۷)';
  if (h >= 17 && h < 21) return 'عصر (۱۷ تا ۲۱)';
  return 'شب (۲۱ تا ۶)';
}

function _durBucket(s) {
  if (s <= 30) return 'تا ۳۰ ثانیه';
  if (s <= 60) return '۳۱ تا ۶۰ ثانیه';
  if (s <= 120) return '۱ تا ۲ دقیقه';
  return 'بیش از ۲ دقیقه';
}

const DIMS = {
  series: { name: 'سری', get: (it) => it.series, label: (v) => seriesById(v).name, ci: (v) => seriesById(v).ci },
  style: { name: 'سبک اجرا', get: (it) => it.style },
  hookType: { name: 'نوع هوک', get: (it) => it.hookType },
  pubType: { name: 'نوع انتشار', get: (it) => it.pubType, label: (v) => nameOf(PUBTYPES, v) },
  goal: { name: 'هدف', get: (it) => it.goal, label: (v) => nameOf(GOALS, v) },
  format: { name: 'فرمت', get: (it) => it.format, label: (v) => nameOf(FORMATS, v) },
  ctaType: { name: 'نوع CTA', get: (it) => it.ctaType },
  duration: { name: 'مدت ویدیو', get: (it) => (it.durationSec ? _durBucket(it.durationSec) : null) },
  weekday: { name: 'روز انتشار', get: (it) => (it.publishDate ? WEEKDAYS[isoToDate(it.publishDate).getDay()] : null) },
  hour: { name: 'ساعت انتشار', get: (it) => (it.publishDate && it.publishTime ? _hourBucket(it.publishTime) : null) },
};
const DIM_ORDER = ['series', 'style', 'hookType', 'pubType', 'goal', 'format', 'ctaType', 'duration', 'weekday', 'hour'];

function groupCompare(pool, mid, basis, dimKey) {
  const dim = DIMS[dimKey];
  const groups = new Map();
  for (const it of pool) {
    const g = dim.get(it);
    if (g == null || g === '') continue;
    const v = metricFor(it, mid, basis).value;
    if (v == null) continue;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push({ it, v });
  }
  const rows = [];
  for (const [key, pts] of groups) {
    rows.push({ key, label: dim.label ? dim.label(key) : key, ci: dim.ci ? dim.ci(key) : null, n: pts.length, med: median(pts.map((p) => p.v)), pts });
  }
  const b = METRICS[mid].better;
  rows.sort((x, y) => b * (y.med - x.med) || y.n - x.n);
  return rows;
}

function autoInsights(pool, mid, basis) {
  const m = METRICS[mid];
  const out = [];
  for (const dk of ['series', 'style', 'hookType', 'pubType', 'goal', 'ctaType', 'duration', 'hour', 'weekday']) {
    const rows = groupCompare(pool, mid, basis, dk).filter((r) => r.n >= 2);
    if (rows.length < 2) continue;
    const top = rows[0], bot = rows[rows.length - 1];
    let ratio;
    if (m.better > 0) ratio = bot.med > 0 ? top.med / bot.med : top.med > 0 ? 99 : 1;
    else ratio = top.med > 0 ? bot.med / top.med : 1;
    if (ratio >= 1.5) out.push({ dk, top, bot, ratio });
  }
  out.sort((a, b) => b.ratio - a.ratio);
  return out.slice(0, 3);
}

function bestOf(pool, mid) {
  let best = null;
  const b = METRICS[mid].better;
  for (const it of pool) {
    const v = metricFor(it, mid, 'latest').value;
    if (v == null) continue;
    if (!best || b * (v - best.v) > 0) best = { it, v };
  }
  return best;
}

/* ---------- یادآور ثبت آمار ---------- */
// هر مقطع یک بازه دارد؛ عددی که خیلی دیرتر از مقطع ثبت شود دیگر آمار آن مقطع نیست
function checkpointWindowEnd(c, next) {
  const end = c + Math.max(12, c * 0.5);
  return next != null ? Math.min(end, next) : end;
}

function dueList() {
  const cps = S.settings.checkpoints.slice().sort((a, b) => a - b);
  const out = [];
  const now = Date.now();
  for (const it of activeItems()) {
    if (!isPublished(it)) continue;
    const h = hoursSincePub(it, now);
    if (h == null || h < 0) continue;
    for (let i = 0; i < cps.length; i++) {
      const c = cps[i];
      if (h >= c && h < checkpointWindowEnd(c, cps[i + 1]) && !it.snapshots.some((s) => s.t === c)) out.push({ it, c, late: h - c });
    }
  }
  return out.sort((a, b) => a.late - b.late);
}

function upcomingDue(withinH) {
  const cps = S.settings.checkpoints.slice().sort((a, b) => a - b);
  const out = [];
  const now = Date.now();
  for (const it of activeItems()) {
    if (!isPublished(it)) continue;
    const h = hoursSincePub(it, now);
    if (h == null || h < 0) continue;
    for (const c of cps) {
      if (h < c && c - h <= withinH && !it.snapshots.some((s) => s.t === c)) { out.push({ it, c, inH: c - h }); break; }
    }
  }
  return out.sort((a, b) => a.inH - b.inH);
}

function suggestCheckpoint(it) {
  const h = hoursSincePub(it);
  if (h == null) return null;
  const cps = S.settings.checkpoints.slice().sort((a, b) => a - b);
  let pick = null;
  cps.forEach((c, i) => {
    if (h >= c * 0.85 && h < checkpointWindowEnd(c, cps[i + 1]) && !it.snapshots.some((s) => s.t === c)) pick = c;
  });
  return pick;
}

/* ---------- تعادل محتوا ---------- */
function balanceRange(fromISO, toISO) {
  const inR = (d) => d && d >= fromISO && d <= toISO;
  const list = activeItems().filter((it) => (isPublished(it) ? inR(it.publishDate) : inR(it.plannedDate)));
  const byGoal = { attract: 0, trust: 0, sell: 0, none: 0 };
  const bySeries = {};
  for (const it of list) {
    byGoal[it.goal || 'none'] = (byGoal[it.goal || 'none'] || 0) + 1;
    bySeries[it.series] = (bySeries[it.series] || 0) + 1;
  }
  const warnings = [];
  const total = list.length;
  if (total >= 3) {
    for (const g of GOALS) if (!byGoal[g.id]) warnings.push('توی این بازه هیچ پستی با هدف «' + g.name + '» نداری.');
  }
  if (total >= 4) {
    for (const sid in bySeries) {
      if (bySeries[sid] / total >= 0.6) warnings.push(fmtPct((bySeries[sid] / total) * 100, 0) + ' پست‌های این بازه از سری «' + seriesById(sid).name + '» هستن.');
    }
  }
  return { list, total, byGoal, bySeries, warnings };
}

/* ---------- خلاصه‌ی دوره‌ای ---------- */
function periodStats(fromISO, toISO) {
  const items = activeItems().filter((it) => isPublished(it) && it.publishDate && it.publishDate >= fromISO && it.publishDate <= toISO && !isCollab(it));
  const leads = S.leads.filter((l) => l.date >= fromISO && l.date <= toISO);
  const cnt = (t) => sum(leads.filter((l) => l.type === t).map((l) => l.count || 1));
  return {
    n: items.length,
    follows: sum(items.map((it) => metricFor(it, 'follows', 'latest').value)),
    followMed: median(items.map((it) => metricFor(it, 'followRate', 'latest').value)),
    saveMed: median(items.map((it) => metricFor(it, 'saveRate', 'latest').value)),
    dms: cnt('dm'),
    bookings: cnt('booking') + cnt('online'),
  };
}

function checklistProgress(it) {
  const list = S.settings.checklist;
  const done = list.filter((c) => it.checklist[c.id]).length;
  return { done, total: list.length };
}

function unverifiedSources(it) {
  return it.sources.filter((s) => !s.verified).length;
}

function speechSeconds(text) {
  return Math.round((wordCount(text) / (S.settings.wpm || 140)) * 60);
}

function scriptText(it) {
  const s = it.script;
  return [s.hook, s.body, s.cta].filter(Boolean).join(' ');
}

function fillTemplate(key, map) {
  let t = S.settings.templates[key] || DEFAULT_TEMPLATES[key] || '';
  for (const k in map) t = t.split('[' + k + ']').join(map[k]);
  return t;
}

function itemPrompt(it, key) {
  const sr = seriesById(it.series);
  const p = S.settings.profile;
  const topic = it.title || '…';
  let txt;
  if (key === 'scenario') txt = fillTemplate('scenario', { 'موضوع': topic, 'حوزه کاری': p.field, 'جایگاه': p.role, 'مخاطب هدف': p.audience });
  else if (key === 'cta') txt = fillTemplate('cta', { 'پست': '«' + topic + '» (سری ' + sr.name + ')' });
  else txt = fillTemplate(key, { 'موضوع': topic });
  if (key === 'scenario' || key === 'caption') {
    const lines = ['- سری: ' + sr.name];
    if (it.goal) lines.push('- هدف پست: ' + nameOf(GOALS, it.goal));
    if (it.concerns.length) lines.push('- دغدغه‌ی مخاطب: ' + it.concerns.join('، '));
    if (it.script.hook) lines.push('- هوک فعلی: ' + it.script.hook);
    if (key === 'caption' && it.script.body) lines.push('- متن ویدیو: ' + it.script.body);
    if (it.notes) lines.push('- یادداشت‌ها: ' + it.notes);
    txt += '\n\nاطلاعات این پست:\n' + lines.join('\n');
  }
  return txt;
}

function chatTitle(it) {
  return 'سناریو | ' + seriesById(it.series).short + ' | ' + (it.title || '');
}

/* ---------- آیکون‌ها (خطی، ۲۴×۲۴) ---------- */
const ICONS = {
  home: '<path d="M3.5 10.5 12 3.5l8.5 7"/><path d="M5.5 9v10.5a1 1 0 0 0 1 1H10v-6h4v6h3.5a1 1 0 0 0 1-1V9"/>',
  layers: '<path d="m12 3.5 8.5 4.75L12 13 3.5 8.25 12 3.5Z"/><path d="m3.5 12.5 8.5 4.75 8.5-4.75"/><path d="m3.5 16.5 8.5 4 8.5-4"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  chart: '<path d="M3.5 20.5h17"/><path d="M6.5 17v-5M12 17V6.5M17.5 17v-8"/>',
  more: '<circle cx="5.5" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="18.5" cy="12" r="1.4" fill="currentColor" stroke="none"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  back: '<path d="M5 12h14M13.5 6.5 19 12l-5.5 5.5"/>',
  chevL: '<path d="m14.5 6-6 6 6 6"/>',
  chevR: '<path d="m9.5 6 6 6-6 6"/>',
  x: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  pencil: '<path d="M4.5 19.5h4l11-11a2.1 2.1 0 0 0-3-3l-11 11v3Z"/><path d="m14.5 7.5 2 2"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>',
  copy: '<rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2"/><path d="M15.5 8.5V5.5a1.5 1.5 0 0 0-1.5-1.5H5.5A1.5 1.5 0 0 0 4 5.5V14a1.5 1.5 0 0 0 1.5 1.5h3"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  alert: '<path d="M12 4 3 19.5h18L12 4Z"/><path d="M12 10v4M12 16.8v.2"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 7.8v.2"/>',
  bulb: '<path d="M9.5 17.5h5M10.5 20.5h3"/><path d="M12 3.5a5.8 5.8 0 0 0-3.5 10.4c.6.5 1 1.2 1 2v.6h5v-.6c0-.8.4-1.5 1-2A5.8 5.8 0 0 0 12 3.5Z"/>',
  film: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M7.5 4.5v15M16.5 4.5v15M3.5 9.5h4M3.5 14.5h4M16.5 9.5h4M16.5 14.5h4"/>',
  funnel: '<path d="M4 5h16l-6.2 7.5v5.5l-3.6 1.8v-7.3L4 5Z"/>',
  book: '<path d="M12 6.5C10 5 7 4.6 3.5 5v13.6c3.5-.4 6.5 0 8.5 1.4 2-1.4 5-1.8 8.5-1.4V5c-3.5-.4-6.5 0-8.5 1.5Z"/><path d="M12 6.5V20"/>',
  quote: '<path d="M4.5 6a1.5 1.5 0 0 1 1.5-1.5h12A1.5 1.5 0 0 1 19.5 6v9a1.5 1.5 0 0 1-1.5 1.5H9.5l-5 4V6Z"/><path d="M8.5 9h7M8.5 12h4.5"/>',
  sliders: '<path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="17" r="2"/>',
  download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14"/>',
  upload: '<path d="M12 15.5v-11M7.5 9 12 4.5 16.5 9M5 19.5h14"/>',
  share: '<circle cx="6.5" cy="12" r="2.3"/><circle cx="17.5" cy="6" r="2.3"/><circle cx="17.5" cy="18" r="2.3"/><path d="m8.6 10.9 6.8-3.7M8.6 13.1l6.8 3.7"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0V4Z"/><path d="M8 6H5v1.5A3.5 3.5 0 0 0 8.2 11M16 6h3v1.5a3.5 3.5 0 0 1-3.2 3.5M12 13v3.5M8.5 20h7M9.5 16.5h5V20h-5z"/>',
  archive: '<rect x="3.5" y="4.5" width="17" height="4" rx="1"/><path d="M5 8.5V19a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8.5M10 12.5h4"/>',
  refresh: '<path d="M19.5 11A7.5 7.5 0 0 0 6 6.8L4.5 8.5M4.5 4.5v4h4M4.5 13A7.5 7.5 0 0 0 18 17.2l1.5-1.7M19.5 19.5v-4h-4"/>',
  phone: '<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 18h2"/>',
  spark: '<path d="M12 3.5c.6 3.9 2.6 5.9 6.5 6.5-3.9.6-5.9 2.6-6.5 6.5-.6-3.9-2.6-5.9-6.5-6.5 3.9-.6 5.9-2.6 6.5-6.5Z"/><path d="M18.5 15c.3 1.6 1 2.3 2.5 2.5-1.5.2-2.2.9-2.5 2.5-.3-1.6-1-2.3-2.5-2.5 1.5-.2 2.2-.9 2.5-2.5Z"/>',
  msg: '<path d="M20.5 12a8.5 8.5 0 0 1-12.3 7.6L3.5 21l1.4-4.6A8.5 8.5 0 1 1 20.5 12Z"/>',
  checks: '<path d="M10 6.5h10M10 12h10M10 17.5h10"/><path d="m3.5 6.5 1.5 1.5 2.5-3M3.5 12l1.5 1.5 2.5-3M3.5 17.5 5 19l2.5-3"/>',
  doc: '<path d="M6 3.5h8l4 4v13H6v-17Z"/><path d="M14 3.5v4h4M9 12h6M9 15.5h6"/>',
  userPlus: '<circle cx="9" cy="8" r="3.5"/><path d="M3 19.5c.8-3.3 3.2-5 6-5 1.5 0 2.9.4 4 1.3M18 13v6M15 16h6"/>',
  arrowUp: '<path d="M12 19V5.5M6.5 11 12 5.5 17.5 11"/>',
  arrowDown: '<path d="M12 5v13.5M6.5 13 12 18.5 17.5 13"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.8"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
  star: '<path d="m12 3.8 2.5 5.1 5.6.8-4 3.9.9 5.6-5-2.6-5 2.6.9-5.6-4-3.9 5.6-.8L12 3.8Z"/>',
  cloud: '<path d="M7 18.5h10.5a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.6 9.2 4.7 4.7 0 0 0 7 18.5Z"/>',
  cloudOff: '<path d="M7 18.5h10.5a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.6 9.2 4.7 4.7 0 0 0 7 18.5Z"/><path d="M4 4l16 16"/>',
  camera: '<rect x="3.5" y="6.5" width="17" height="13" rx="3"/><path d="M8.5 6.5 10 4h4l1.5 2.5"/><circle cx="12" cy="13" r="3.5"/>',
  grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>',
  list: '<path d="M8.5 6.5h11M8.5 12h11M8.5 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01"/>',
  palette: '<path d="M12 3.5a8.5 8.5 0 0 0 0 17c1.3 0 1.8-1 1.4-2-.5-1.2.1-2.5 1.5-2.5h2.1a3.5 3.5 0 0 0 3.5-3.5c0-5-3.8-9-8.5-9Z"/><circle cx="7.8" cy="11" r="1"/><circle cx="10.5" cy="7.5" r="1"/><circle cx="14.8" cy="7.8" r="1"/>',
  shield: '<path d="M12 3.5 5 6v5.5c0 4.3 3 7.6 7 9 4-1.4 7-4.7 7-9V6l-7-2.5Z"/><path d="m9 12 2 2 4-4"/>',
};

function ic(name, cls) {
  return '<svg class="ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + (ICONS[name] || '') + '</svg>';
}

/* ---------- اجزای رابط کاربری ---------- */
function $(sel, el) { return (el || document).querySelector(sel); }
function $$(sel, el) { return Array.from((el || document).querySelectorAll(sel)); }

let _toastTimer = null;
function toast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

/* ---------- برگه‌ی پایین (bottom sheet) با پشتیبانی دکمه‌ی برگشت اندروید ---------- */
const _sheets = [];
let _afterSheetClose = [];

function openSheet(opts) {
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML =
    '<div class="sheet-backdrop" data-sclose></div>' +
    '<section class="sheet' + (opts.tall ? ' tall' : '') + '" role="dialog" aria-modal="true" aria-label="' + esc(opts.title || '') + '">' +
    '<div class="sheet-grab" aria-hidden="true"></div>' +
    (opts.title ? '<header class="sheet-head"><h3>' + esc(opts.title) + '</h3><button type="button" class="icon-btn" data-sclose aria-label="بستن">' + ic('x') + '</button></header>' : '') +
    '<div class="sheet-body">' + (opts.body || '') + '</div></section>';
  document.body.appendChild(wrap);
  document.body.classList.add('noscroll');
  const entry = { wrap, body: wrap.querySelector('.sheet-body'), onClose: opts.onClose };
  _sheets.push(entry);
  history.pushState({ sheet: _sheets.length }, '');
  wrap.addEventListener('click', (e) => {
    if (e.target.closest('[data-sclose]')) closeSheet();
  });
  requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('open')));
  if (opts.onMount) opts.onMount(entry.body, entry);
  autogrowAll(entry.body);
  const af = entry.body.querySelector('[autofocus]');
  if (af) setTimeout(() => af.focus(), 280);
  return entry;
}

function closeSheet(then) {
  if (then) _afterSheetClose.push(then);
  if (_sheets.length) history.back();
  else _flushAfterClose();
}

function _popSheet() {
  const e = _sheets.pop();
  if (!e) return;
  e.wrap.classList.remove('open');
  setTimeout(() => e.wrap.remove(), 260);
  if (!_sheets.length) document.body.classList.remove('noscroll');
  if (e.onClose) {
    try { e.onClose(); } catch (err) { console.error(err); }
  }
}

function _flushAfterClose() {
  const fns = _afterSheetClose;
  _afterSheetClose = [];
  fns.forEach((fn) => fn());
}

let _lastPopWasSheet = false;
window.addEventListener('popstate', () => {
  if (_sheets.length) {
    _lastPopWasSheet = true;
    _popSheet();
    _flushAfterClose();
  }
});

function confirmBox(opts) {
  return new Promise((resolve) => {
    let ok = false;
    openSheet({
      title: opts.title,
      body:
        (opts.text ? '<p class="sheet-text">' + esc(opts.text) + '</p>' : '') +
        '<div class="sheet-actions"><button type="button" class="btn ' + (opts.danger ? 'danger' : 'primary') + '" data-ok>' + esc(opts.ok || 'تأیید') + '</button>' +
        '<button type="button" class="btn ghost" data-sclose>انصراف</button></div>',
      onMount: (b) => {
        b.querySelector('[data-ok]').addEventListener('click', () => { ok = true; closeSheet(); });
      },
      onClose: () => resolve(ok),
    });
  });
}

function _optRow(o, i, on, multi) {
  const dot = o.ci != null ? '<span class="sdot" style="--sc:var(--s' + o.ci + ')"></span>' : '';
  const mark = multi ? '<span class="pcheck">' + ic('check') + '</span>' : on ? ic('check', 'pmark') : '';
  return '<button type="button" class="prow' + (on ? ' on' : '') + '" data-i="' + i + '" aria-pressed="' + on + '">' + dot +
    '<span class="prow-t"><b>' + esc(o.label) + '</b>' + (o.sub ? '<span>' + esc(o.sub) + '</span>' : '') + '</span>' + mark + '</button>';
}

function _searchFilter(b) {
  const s = b.querySelector('[data-psearch]');
  if (!s) return;
  s.addEventListener('input', () => {
    const q = s.value.trim();
    b.querySelectorAll('[data-i]').forEach((el) => { el.hidden = !!q && !el.textContent.includes(q); });
  });
}

function pickOne(opts) {
  return new Promise((resolve) => {
    let result;
    const rows = opts.options.map((o, i) => _optRow(o, i, o.value === opts.value, false)).join('');
    openSheet({
      title: opts.title,
      tall: opts.options.length > 7,
      body:
        (opts.options.length > 8 ? '<input class="input psearch" type="search" placeholder="جستجو" data-psearch>' : '') +
        '<div class="plist">' + (rows || '<p class="muted pad">موردی نیست.</p>') + '</div>' +
        (opts.clearLabel ? '<button type="button" class="btn ghost block" data-clear>' + esc(opts.clearLabel) + '</button>' : ''),
      onMount: (b) => {
        _searchFilter(b);
        b.addEventListener('click', (e) => {
          const r = e.target.closest('[data-i]');
          if (r) { result = opts.options[+r.dataset.i].value; closeSheet(); return; }
          if (e.target.closest('[data-clear]')) { result = null; closeSheet(); }
        });
      },
      onClose: () => resolve(result),
    });
  });
}

function pickMany(opts) {
  return new Promise((resolve) => {
    let result;
    const sel = new Set(opts.values || []);
    const rows = opts.options.map((o, i) => _optRow(o, i, sel.has(o.value), true)).join('');
    openSheet({
      title: opts.title,
      tall: true,
      body:
        (opts.options.length > 8 ? '<input class="input psearch" type="search" placeholder="جستجو" data-psearch>' : '') +
        '<div class="plist">' + (rows || '<p class="muted pad">موردی نیست.</p>') + '</div>' +
        '<div class="sheet-actions"><button type="button" class="btn primary" data-ok>تأیید</button><button type="button" class="btn ghost" data-sclose>انصراف</button></div>',
      onMount: (b) => {
        _searchFilter(b);
        b.addEventListener('click', (e) => {
          const r = e.target.closest('[data-i]');
          if (r) {
            const v = opts.options[+r.dataset.i].value;
            if (sel.has(v)) sel.delete(v); else sel.add(v);
            r.classList.toggle('on', sel.has(v));
            r.setAttribute('aria-pressed', sel.has(v));
            return;
          }
          if (e.target.closest('[data-ok]')) { result = Array.from(sel); closeSheet(); }
        });
      },
      onClose: () => resolve(result),
    });
  });
}

/* ---------- انتخاب تاریخ شمسی (با روز میلادی کنار هر روز) ---------- */
let _lastPickedISO = null;

// opts: title, date, time, touched, withTime, nowIfToday, rememberLast, allowClear, unknownLabel, timeHint
// خروجی: {date, time, touched}؛ null یعنی «بدون تاریخ»؛ undefined یعنی بسته شد
function pickDate(opts) {
  opts = opts || {};
  return new Promise((resolve) => {
    let result;
    const today = todayISO();
    let sel = opts.date || null;
    let viewISO = jMonthStartISO(sel || (opts.rememberLast && _lastPickedISO) || today);
    let time = opts.time || null;
    let touched = opts.touched != null ? !!opts.touched : opts.time != null;
    // ساعتی که کاربر صریحاً انتخاب نکرده: فقط برای «امروز» و فقط اگر خواسته شده، ساعت الان
    const effTime = () => (touched ? time : opts.nowIfToday && sel === today ? nowTime() : null);

    function grid() {
      const j = isoToJ(viewISO);
      const len = jMonthLength(j.jy, j.jm);
      const off = satIndex(viewISO);
      let h = '<div class="cal-grid dp-grid">' + WD_SAT_SHORT.map((w, i) => '<div class="cal-wd' + (i === 6 ? ' fri' : '') + '">' + w + '</div>').join('');
      for (let i = 0; i < off; i++) h += '<div></div>';
      for (let d = 1; d <= len; d++) {
        const iso = jToISO(j.jy, j.jm, d);
        const g = gParts(iso);
        const cls = (iso === sel ? ' on' : '') + (iso === today ? ' today' : '') + (satIndex(iso) === 6 ? ' fri' : '');
        h += '<button type="button" class="dp-day' + cls + '" data-d="' + iso + '" aria-label="' + fmtJ(iso, { year: true }) + '، ' + fmtG(iso, true) + '">' +
          '<span class="dj">' + faNum(d) + '</span><span class="dg' + (g.gd === 1 ? ' m1' : '') + '">' + (g.gd === 1 ? G_MONTHS[g.gm - 1] : faNum(g.gd)) + '</span></button>';
      }
      return h + '</div>';
    }

    const selText = () => (sel ? fmtJ(sel, { weekday: true, year: true }) + '، برابر ' + fmtG(sel, true) : 'یک روز رو انتخاب کن');
    const body =
      '<div class="dp-head"><button type="button" class="icon-btn" data-m="-1" aria-label="ماه قبل">' + ic('chevR') + '</button>' +
      '<div class="dp-title"><b data-mt>' + fmtJMonth(viewISO) + '</b><span class="dp-g" data-gt>' + gMonthsLabel(viewISO) + '</span></div>' +
      '<button type="button" class="icon-btn" data-m="1" aria-label="ماه بعد">' + ic('chevL') + '</button></div>' +
      '<div data-grid>' + grid() + '</div>' +
      '<div class="dp-sel" data-sel>' + selText() + '</div>' +
      (opts.withTime ? '<div class="field dp-time"><div class="flabel">ساعت</div><div class="dp-trow"><input class="input" type="time" data-time aria-label="ساعت">' +
        '<button type="button" class="chip" data-tunk aria-pressed="false">' + esc(opts.unknownLabel || 'نامعلوم') + '</button></div>' +
        (opts.timeHint ? '<div class="fhint">' + esc(opts.timeHint) + '</div>' : '') + '</div>' : '') +
      '<div class="sheet-actions">' + (opts.withTime ? '<button type="button" class="btn primary" data-ok>تأیید</button>' : '') +
      '<button type="button" class="btn" data-today>امروز</button>' +
      (opts.allowClear ? '<button type="button" class="btn ghost" data-clear>بدون تاریخ</button>' : '') + '</div>';

    openSheet({
      title: opts.title || 'انتخاب تاریخ',
      body,
      onMount: (b) => {
        const ti = b.querySelector('[data-time]');
        const tu = b.querySelector('[data-tunk]');
        const markUnknown = (unknown) => {
          tu.classList.toggle('on', unknown);
          tu.setAttribute('aria-pressed', String(unknown));
        };
        const syncTime = () => {
          if (!ti) return;
          const t = effTime();
          ti.value = t || '';
          markUnknown(!t);
        };
        const redraw = () => {
          b.querySelector('[data-grid]').innerHTML = grid();
          b.querySelector('[data-mt]').textContent = fmtJMonth(viewISO);
          b.querySelector('[data-gt]').textContent = gMonthsLabel(viewISO);
          b.querySelector('[data-sel]').textContent = selText();
        };
        const finish = () => {
          result = { date: sel, time: opts.withTime ? effTime() : null, touched };
          if (sel) _lastPickedISO = sel;
          closeSheet();
        };
        syncTime();
        b.addEventListener('click', (e) => {
          const m = e.target.closest('[data-m]');
          if (m) { viewISO = addJMonths(viewISO, +m.dataset.m); redraw(); return; }
          const d = e.target.closest('[data-d]');
          if (d) { sel = d.dataset.d; redraw(); syncTime(); if (!opts.withTime) finish(); return; }
          if (e.target.closest('[data-today]')) {
            sel = today;
            viewISO = jMonthStartISO(today);
            redraw();
            syncTime();
            if (!opts.withTime) finish();
            return;
          }
          if (e.target.closest('[data-tunk]')) {
            time = null;
            touched = true;
            syncTime();
            return;
          }
          if (e.target.closest('[data-ok]')) {
            if (!sel) { toast('اول یک روز رو انتخاب کن'); return; }
            finish();
            return;
          }
          if (e.target.closest('[data-clear]')) { result = null; closeSheet(); }
        });
        if (ti) {
          const onTime = () => {
            time = ti.value || null;
            touched = true;
            markUnknown(!time);
          };
          ti.addEventListener('change', onTime);
          ti.addEventListener('input', onTime);
        }
      },
      onClose: () => resolve(result),
    });
  });
}

async function copyText(text, msg) {
  let ok = false;
  try {
    await navigator.clipboard.writeText(text);
    ok = true;
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
    ta.remove();
  }
  toast(ok ? msg || 'کپی شد' : 'کپی نشد؛ متن رو دستی انتخاب کن');
}

/* ---------- فرم‌ها ---------- */
function getPath(o, p) {
  return p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
}

function setPath(o, p, v) {
  const ks = p.split('.');
  let a = o;
  for (let i = 0; i < ks.length - 1; i++) {
    if (a[ks[i]] == null || typeof a[ks[i]] !== 'object') a[ks[i]] = {};
    a = a[ks[i]];
  }
  a[ks[ks.length - 1]] = v;
}

function _readVal(el) {
  if (el.type === 'checkbox') return el.checked;
  if (el.dataset.type === 'num') return parseNum(el.value);
  return el.value;
}

// اتصال دوطرفه‌ی فیلدهای data-bind به یک شیء
function bindForm(root, obj, onChange) {
  const isChangeOnly = (el) => el.tagName === 'SELECT' || el.type === 'checkbox' || el.type === 'time';
  root.addEventListener('input', (e) => {
    const el = e.target;
    if (!el.dataset || !el.dataset.bind || isChangeOnly(el)) return;
    setPath(obj, el.dataset.bind, _readVal(el));
    if (onChange) onChange(el.dataset.bind, el);
  });
  root.addEventListener('change', (e) => {
    const el = e.target;
    if (!el.dataset || !el.dataset.bind || !isChangeOnly(el)) return;
    setPath(obj, el.dataset.bind, _readVal(el));
    if (onChange) onChange(el.dataset.bind, el);
  });
  root.addEventListener('click', (e) => {
    const c = e.target.closest('[data-chips] [data-value]');
    if (!c || !root.contains(c)) return;
    const grp = c.closest('[data-chips]');
    const path = grp.dataset.bind;
    if (!path) return;
    const val = c.dataset.value;
    if (grp.hasAttribute('data-multi')) {
      const arr = (getPath(obj, path) || []).slice();
      const i = arr.indexOf(val);
      if (i >= 0) arr.splice(i, 1); else arr.push(val);
      setPath(obj, path, arr);
      c.classList.toggle('on', i < 0);
      c.setAttribute('aria-pressed', String(i < 0));
    } else {
      const cur = getPath(obj, path);
      const nv = cur === val && grp.hasAttribute('data-clearable') ? null : val;
      setPath(obj, path, nv);
      grp.querySelectorAll('[data-value]').forEach((x) => {
        const on = x.dataset.value === nv;
        x.classList.toggle('on', on);
        x.setAttribute('aria-pressed', String(on));
      });
    }
    if (onChange) onChange(path, grp);
  });
}

function fieldHtml(label, inner, hint, cls) {
  return '<div class="field' + (cls ? ' ' + cls : '') + '">' + (label ? '<div class="flabel">' + label + '</div>' : '') + inner + (hint ? '<div class="fhint">' + hint + '</div>' : '') + '</div>';
}

function inputHtml(path, value, o) {
  o = o || {};
  const v = o.num ? faInput(value) : value == null ? '' : value;
  return '<input class="input' + (o.cls ? ' ' + o.cls : '') + '"' + (path ? ' data-bind="' + path + '"' : '') +
    (o.num ? ' data-type="num" inputmode="decimal"' : '') + ' type="' + (o.type || 'text') + '" value="' + esc(v) + '"' +
    (o.ph ? ' placeholder="' + esc(o.ph) + '"' : '') + (o.af ? ' autofocus' : '') + (o.attrs || '') + '>';
}

function taHtml(path, value, o) {
  o = o || {};
  return '<textarea class="input ta autogrow' + (o.cls ? ' ' + o.cls : '') + '"' + (path ? ' data-bind="' + path + '"' : '') + ' rows="' + (o.rows || 3) + '"' +
    (o.ph ? ' placeholder="' + esc(o.ph) + '"' : '') + (o.af ? ' autofocus' : '') + (o.attrs || '') + '>' + esc(value || '') + '</textarea>';
}

// options: رشته یا {value, label, ci}
function chipsHtml(path, options, value, o) {
  o = o || {};
  const vals = o.multi ? value || [] : [value];
  const items = options.map((op) => {
    const v = typeof op === 'string' ? op : op.value;
    const l = typeof op === 'string' ? op : op.label;
    const on = vals.indexOf(v) >= 0;
    const dot = typeof op === 'object' && op.ci != null ? '<span class="sdot" style="--sc:var(--s' + op.ci + ')"></span>' : '';
    return '<button type="button" class="chip' + (on ? ' on' : '') + '" data-value="' + esc(v) + '" aria-pressed="' + on + '">' + dot + esc(l) + '</button>';
  });
  return '<div class="chips' + (o.scroll ? ' scroll' : '') + '" data-chips' + (path ? ' data-bind="' + path + '"' : '') + (o.multi ? ' data-multi' : '') + (o.clearable === false ? '' : ' data-clearable') + '>' + items.join('') + '</div>';
}

function seriesOptions() {
  return S.settings.series.map((s) => ({ value: s.id, label: s.name, ci: s.ci }));
}

function idOptions(list) {
  return list.map((x) => ({ value: x.id, label: x.name }));
}

function segHtml(name, options, value) {
  return '<div class="seg" role="tablist" data-seg="' + name + '">' + options.map((o) =>
    '<button type="button" role="tab" class="' + (o.value === value ? 'on' : '') + '" aria-selected="' + (o.value === value) + '" data-segv="' + esc(o.value) + '">' + esc(o.label) +
    (o.count != null ? '<span class="cnt">' + faNum(o.count) + '</span>' : '') + '</button>').join('') + '</div>';
}

function secHead(title, action) {
  return '<div class="sec-h"><h2>' + title + '</h2>' + (action || '') + '</div>';
}

function emptyHtml(icon, title, text, action) {
  return '<div class="empty">' + ic(icon, 'empty-ic') + '<h3>' + esc(title) + '</h3>' + (text ? '<p>' + text + '</p>' : '') + (action || '') + '</div>';
}

function seriesTag(id) {
  const sr = seriesById(id);
  return '<span class="stag" style="--sc:var(--s' + sr.ci + ')"><span class="sdot"></span>' + esc(sr.short || sr.name) + '</span>';
}

function badgeHtml(text, kind, icon) {
  return '<span class="badge' + (kind ? ' ' + kind : '') + '">' + (icon ? ic(icon) : '') + esc(text) + '</span>';
}

function autogrow(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 2 + 'px';
}

function autogrowAll(root) {
  $$('textarea.autogrow', root).forEach(autogrow);
}

document.addEventListener('input', (e) => {
  if (e.target.matches && e.target.matches('textarea.autogrow')) autogrow(e.target);
});

/* ---------- نمودارها (HTML/CSS، راست‌به‌چپ) ---------- */
function niceMax(v) {
  if (!v || v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  const m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return m * p;
}

// ستون‌های روند به ترتیب انتشار؛ قدیمی‌ترین سمت راست
function trendHtml(points, mid, med) {
  if (!points.length) return '';
  const top = niceMax(Math.max(Math.max.apply(null, points.map((p) => p.v)), med || 0));
  const bars = points.map((p) =>
    '<button type="button" class="tc-bar" style="height:' + Math.max(1.5, (p.v / top) * 100).toFixed(2) + '%;--sc:var(--s' + p.ci + ')" data-id="' + p.id + '" data-label="' + esc(p.label) +
    '" data-val="' + esc(fmtMetric(mid, p.v)) + '" aria-label="' + esc(p.label) + '، ' + esc(fmtMetric(mid, p.v)) + '"></button>').join('');
  const medPos = med != null ? (med / top) * 100 : null;
  const medLine = medPos != null ? '<div class="tc-med" style="bottom:' + medPos.toFixed(2) + '%"></div>' : '';
  const ticks = [[100, fmtMetric(mid, top)], [50, fmtMetric(mid, top / 2)], [0, '۰']]
    .filter((t) => medPos == null || Math.abs(t[0] - medPos) > 11)
    .map((t) => '<span style="bottom:' + t[0] + '%">' + t[1] + '</span>').join('');
  const medTick = medPos != null ? '<span class="tc-ymed" style="bottom:' + medPos.toFixed(2) + '%">میانه</span>' : '';
  return '<div class="tc" data-trend>' +
    '<div class="tc-plot"><div class="tc-area"><div class="tc-grid"></div>' + medLine + '<div class="tc-bars">' + bars + '</div></div>' +
    '<div class="tc-y">' + ticks + medTick + '</div></div>' +
    '<div class="tc-x"><span>قدیمی‌تر</span><span>جدیدتر</span></div>' +
    '<div class="tc-readout" data-readout>روی هر ستون بزن تا اسم پست و عددش رو ببینی.</div></div>';
}

// مقایسه‌ی گروه‌ها: هر نقطه یک پست، خط عمودی میانه‌ی گروه
function gcHtml(rows, mid) {
  if (!rows.length) return '';
  let max = 0;
  rows.forEach((r) => r.pts.forEach((p) => { if (p.v > max) max = p.v; }));
  max = niceMax(max);
  const pos = (v) => clamp((v / max) * 100, 0, 100).toFixed(2);
  const body = rows.map((r) =>
    '<div class="gc-row' + (r.n < 2 ? ' thin' : '') + '">' +
    '<div class="gc-head"><span class="gc-name">' + (r.ci != null ? '<span class="sdot" style="--sc:var(--s' + r.ci + ')"></span>' : '') + esc(r.label) + '</span>' +
    '<span class="gc-val">' + fmtMetric(mid, r.med) + '</span><span class="gc-n">' + faNum(r.n) + ' پست</span></div>' +
    '<div class="gc-track">' + r.pts.map((p) =>
      '<button type="button" class="gc-dot" style="inset-inline-start:' + pos(p.v) + '%;' + seriesVar(p.it.series) + '" data-id="' + p.it.id + '" data-label="' + esc(p.it.title) +
      '" data-val="' + esc(fmtMetric(mid, p.v)) + '" aria-label="' + esc(p.it.title) + '، ' + esc(fmtMetric(mid, p.v)) + '"></button>').join('') +
    '<span class="gc-med" style="inset-inline-start:' + pos(r.med) + '%" title="میانه"></span></div></div>').join('');
  return '<div class="gc" data-trend>' + body +
    '<div class="gc-scale"><span>۰</span><span>' + fmtMetric(mid, max) + '</span></div>' +
    '<div class="tc-readout" data-readout>هر نقطه یک پسته و خط پررنگ، میانه‌ی گروه. روی نقطه بزن.</div></div>';
}

function mountCharts(root) {
  $$('[data-trend]', root).forEach((tc) => {
    tc.addEventListener('click', (e) => {
      const b = e.target.closest('.tc-bar, .gc-dot');
      if (!b) return;
      $$('.sel', tc).forEach((x) => x.classList.remove('sel'));
      b.classList.add('sel');
      tc.querySelector('[data-readout]').innerHTML = '<b>' + esc(b.dataset.val) + '</b> <span>' + esc(b.dataset.label) + '</span> <a href="#/item/' + esc(b.dataset.id) + '">باز کردن پست</a>';
    });
  });
}

// میله‌های افقی تک‌رنگ؛ rows: [{label, v, ci?, fmt?}]
function hbarsHtml(rows) {
  if (!rows.length) return '';
  const max = Math.max.apply(null, rows.map((r) => r.v).concat([0])) || 1;
  return '<div class="hbs">' + rows.map((r) =>
    '<div class="hb"><div class="hb-l">' + (r.ci != null ? '<span class="sdot" style="--sc:var(--s' + r.ci + ')"></span>' : '') + '<span>' + esc(r.label) + '</span></div>' +
    '<div class="hb-t"><div class="hb-b" style="width:' + ((r.v / max) * 100).toFixed(2) + '%"></div></div>' +
    '<div class="hb-v">' + (r.fmt != null ? r.fmt : fmtNum(r.v)) + '</div></div>').join('') + '</div>';
}

function seriesLegend(ids) {
  const uniq = Array.from(new Set(ids));
  if (uniq.length < 2) return '';
  return '<div class="legend">' + uniq.map((id) => {
    const sr = seriesById(id);
    return '<span><span class="sdot" style="--sc:var(--s' + sr.ci + ')"></span>' + esc(sr.short || sr.name) + '</span>';
  }).join('') + '</div>';
}

/* ---------- خانه ---------- */
let _installEvt = null;
let _lastSeries = null;

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function stageName(id) {
  return nameOf(STAGES, id);
}

function stageIdx(it) {
  return STAGES.findIndex((s) => s.id === it.stage);
}

function nextAction() {
  const due = dueList();
  if (due.length) {
    const d = due[0];
    return {
      label: 'الان',
      title: 'آمار ' + checkpointName(d.c) + '‌ی «' + d.it.title + '» رو ثبت کن',
      text: 'از انتشارش ' + fmtHours(hoursSincePub(d.it)) + ' گذشته.' + (due.length > 1 ? ' ' + faNum(due.length - 1) + ' آمار دیگه هم منتظره.' : ''),
      btn: 'ثبت آمار',
      go: '#/item/' + d.it.id + '/stat/new?cp=' + d.c,
    };
  }
  const today = todayISO();
  const planned = activeItems()
    .filter((it) => !isPublished(it) && it.plannedDate)
    .sort((a, b) => (a.plannedDate + (a.plannedTime || '')).localeCompare(b.plannedDate + (b.plannedTime || '')));
  const late = planned.filter((it) => it.plannedDate < today && it.plannedDate >= addDaysISO(today, -14));
  if (late.length) {
    const it = late[late.length - 1];
    return {
      label: 'عقب افتاده',
      title: '«' + it.title + '» قرار بود ' + fmtJShort(it.plannedDate) + ' منتشر بشه',
      text: 'مرحله‌ی فعلی: ' + stageName(it.stage) + '. یا منتشرش کن یا تاریخش رو جابه‌جا کن.',
      btn: 'باز کردن پست',
      go: '#/item/' + it.id,
    };
  }
  const next = planned.find((it) => it.plannedDate >= today);
  if (next) {
    const cp = checklistProgress(next);
    return {
      label: next.plannedDate === today ? 'امروز' : 'پست بعدی',
      title: '«' + next.title + '»',
      text: fmtWhen(next.plannedDate, next.plannedTime) + '، مرحله‌ی ' + stageName(next.stage) + '، چک‌لیست ' + faNum(cp.done) + ' از ' + faNum(cp.total) + '.',
      btn: 'ادامه‌ی کار',
      go: '#/item/' + next.id,
    };
  }
  const prod = activeItems().filter((it) => PROD_STAGES.indexOf(it.stage) >= 0).length;
  if (prod) {
    return { label: 'برنامه‌ی هفته خالیه', title: faNum(prod) + ' پست در حال تولید داری که تاریخ انتشار ندارن', text: 'یکی‌شون رو توی تقویم برای این هفته بذار.', btn: 'باز کردن تقویم', go: '#/calendar' };
  }
  const ideas = activeItems().filter((it) => it.stage === 'idea').length;
  if (ideas) {
    return { label: 'برنامه‌ی هفته خالیه', title: 'از بین ' + faNum(ideas) + ' ایده، یکی رو برای تولید انتخاب کن', text: '', btn: 'رفتن به ایده‌ها', go: '#/content?tab=idea' };
  }
  return { label: 'شروع', title: 'اولین ایده‌ات رو ثبت کن', text: 'هر سؤال بیمار یا کامنت جالب می‌تونه یک پست باشه.', btn: 'ایده‌ی جدید', act: 'newIdea' };
}

function heroHtml() {
  const a = nextAction();
  return '<section class="hero"><div class="hero-k">' + esc(a.label) + '</div><h2>' + esc(a.title) + '</h2>' +
    (a.text ? '<p>' + esc(a.text) + '</p>' : '') +
    '<button type="button" class="btn primary"' + (a.go ? ' data-go="' + a.go + '"' : ' data-act="' + a.act + '"') + '>' + esc(a.btn) + '</button></section>';
}

function onboardingHtml() {
  return '<section class="hero"><div class="hero-k">شروع</div><h2>استودیو آماده‌ست</h2>' +
    '<p>اگه قبلاً پشتیبان خودکار رو روشن کرده بودی، با کد بازیابی همه‌چیز از گیت‌هاب برمی‌گرده. اگه فایل پشتیبان یا فایل اطلاعات اولیه داری، اون رو وارد کن.</p>' +
    '<div class="hero-actions"><button type="button" class="btn primary" data-act="restore">' + ic('cloud') + 'بازگردانی از گیت‌هاب</button>' +
    '<button type="button" class="btn on-dark" data-act="import">' + ic('upload') + 'وارد کردن فایل</button>' +
    '<button type="button" class="btn on-dark" data-act="newIdea">شروع از صفر</button></div></section>' +
    '<section class="sec">' + secHead('روال کار') + '<ol class="steps">' +
    '<li><b>ثبت ایده، همون لحظه.</b> سر شیفت یا وسط مطب، با دکمه‌ی + پایین صفحه.</li>' +
    '<li><b>تولید مرحله‌به‌مرحله.</b> سناریو، هوک، کپشن و منابع داخل خود پست؛ پرامپت‌های Claude آماده‌ی کپی.</li>' +
    '<li><b>آمار سر موعد.</b> بعد از انتشار، اپ یادت می‌اندازه آمار ۲۴ و ۷۲ ساعته و ۷ و ۳۰ روزه رو ثبت کنی.</li>' +
    '<li><b>تحلیل و بیمار.</b> ببین کدوم سری و فرمت فالوور و مشاوره میاره.</li></ol></section>';
}

function installHtml() {
  return '<div class="note gold">' + ic('phone') + '<div><b>نصب روی گوشی</b><p>با نصب، اپ آیکون خودش رو می‌گیره، تمام‌صفحه باز می‌شه و بدون اینترنت هم کار می‌کنه.</p>' +
    '<button type="button" class="btn primary sm" data-act="install">نصب اپ</button></div></div>';
}

function backupNoteHtml() {
  if (!S.items.length) return '';
  if (SYNC) {
    if (!SYNC.lastError) return '';
    return '<div class="note warn">' + ic('alert') + '<div><b>پشتیبان خودکار کار نمی‌کنه</b><p>' + esc(SYNC.lastError) + '</p>' +
      '<button type="button" class="btn sm" data-go="#/backup">بررسی</button></div></div>';
  }
  return '<div class="note warn">' + ic('cloud') + '<div><b>پشتیبان خودکار خاموشه</b>' +
    '<p>داده‌ها فقط روی همین گوشی‌ان و اگه مرورگر پاکشون کنه، از دست می‌رن. با روشن کردن پشتیبان خودکار، بعد از هر تغییر یک نسخه توی گیت‌هاب ذخیره می‌شه.</p>' +
    '<div class="row-actions"><button type="button" class="btn sm primary" data-act="connect">روشن کردن</button><button type="button" class="btn sm ghost" data-act="backup">فایل پشتیبان</button></div></div></div>';
}

function todoHtml() {
  const due = dueList().slice(1);
  const soon = upcomingDue(12);
  const rows = [];
  const unread = inboxList().filter((e) => !e.readAt);
  if (unread.length) {
    const e0 = unread[0];
    rows.push('<button type="button" class="row" data-go="' + (unread.length === 1 ? '#/claude/' + encodeURIComponent(e0.key) : '#/claude') + '"><span class="ric gold">' + ic('spark') + '</span><span class="rt"><b>' +
      (unread.length === 1 ? 'تحلیل تازه از Claude: ' + esc(e0.title) : faNum(unread.length) + ' تحلیل تازه از Claude') + '</b><span>' + faNum(unread.reduce((a, e) => a + pendingCount(e), 0)) + ' پیشنهاد برای بررسی</span></span>' + ic('chevL') + '</button>');
  }
  const igUn = SYNC && IG ? igUnlinked().length : 0;
  if (igUn) {
    rows.push('<button type="button" class="row" data-go="#/ig"><span class="ric">' + ic('camera') + '</span><span class="rt"><b>' + faNum(igUn) + ' پست اینستاگرام هنوز به اپ وصل نشده</b><span>وصلشون کن تا آمارشون خودکار بیاد</span></span>' + ic('chevL') + '</button>');
  }
  due.forEach((d) => {
    rows.push('<button type="button" class="row" data-go="#/item/' + d.it.id + '/stat/new?cp=' + d.c + '"><span class="ric">' + ic('clock') + '</span><span class="rt"><b>آمار ' + checkpointName(d.c) + '‌ی «' + esc(d.it.title) + '»</b><span>از انتشار ' + fmtHours(hoursSincePub(d.it)) + ' گذشته</span></span>' + ic('chevL') + '</button>');
  });
  soon.forEach((d) => {
    rows.push('<div class="row static"><span class="ric">' + ic('clock') + '</span><span class="rt"><b>آمار ' + checkpointName(d.c) + '‌ی «' + esc(d.it.title) + '»</b><span>حدود ' + fmtHours(d.inH) + ' دیگه</span></span></div>');
  });
  const undated = activeItems().filter((it) => isPublished(it) && !it.publishDate).length;
  const hideUntil = S.meta.hideUndatedUntil;
  if (undated && (!hideUntil || hideUntil < todayISO())) {
    rows.push('<div class="row static"><span class="ric">' + ic('calendar') + '</span><span class="rt"><b>' + faNum(undated) + ' پست منتشرشده تاریخ انتشار ندارن</b>' +
      '<span>با ثبت تاریخ، خلاصه‌ی ماهانه و مقایسه‌ی روز و ساعت انتشار کامل می‌شه.</span><span class="row-actions"><button type="button" class="btn sm" data-go="#/content?tab=pub&nd=1">نشونم بده</button>' +
      '<button type="button" class="btn sm ghost" data-act="hideUndated">بعداً</button></span></span></div>');
  }
  if (!rows.length) return '';
  return '<section class="sec">' + secHead('کارهای باز') + '<div class="list">' + rows.join('') + '</div></section>';
}

function weekStripHtml() {
  const today = todayISO();
  const ws = weekStartISO(today);
  const byDay = itemsByDate(ws, addDaysISO(ws, 6));
  let h = '';
  for (let i = 0; i < 7; i++) {
    const iso = addDaysISO(ws, i);
    const list = byDay[iso] || [];
    const dots = list.slice(0, 3).map((it) => '<span class="cdot' + (isPublished(it) ? '' : ' plan') + '" style="' + seriesVar(it.series) + '"></span>').join('') + (list.length > 3 ? '<span class="cmore">+</span>' : '');
    h += '<button type="button" class="wday' + (iso === today ? ' today' : '') + (i === 6 ? ' fri' : '') + '" data-go="#/calendar?d=' + iso + '" aria-label="' + WD_SAT[i] + ' ' + fmtJ(iso) + '، ' + faNum(list.length) + ' مورد">' +
      '<span class="wd">' + WD_SAT_SHORT[i] + '</span><b>' + faNum(isoToJ(iso).jd) + '</b><span class="wdots">' + dots + '</span></button>';
  }
  return '<section class="sec">' + secHead('این هفته', '<button type="button" class="link" data-go="#/calendar">تقویم</button>') + '<div class="wstrip">' + h + '</div>' +
    '<div class="legend small"><span><span class="cdot" style="--sc:var(--ink-2)"></span>منتشرشده</span><span><span class="cdot plan" style="--sc:var(--ink-2)"></span>برنامه‌ریزی‌شده</span></div></section>';
}

function kpiTile(label, cur, prev, fmt, better) {
  let delta = '';
  if (prev != null && cur != null && prev !== cur) {
    const up = cur > prev;
    const good = better > 0 ? up : !up;
    delta = '<span class="kd ' + (good ? 'good' : 'bad') + '">' + ic(up ? 'arrowUp' : 'arrowDown') + '۳۰ روز قبلش ' + fmt(prev) + '</span>';
  } else if (prev != null) {
    delta = '<span class="kd">۳۰ روز قبلش ' + fmt(prev) + '</span>';
  }
  return '<div class="kpi"><div class="kl">' + label + '</div><div class="kv">' + fmt(cur) + '</div>' + delta + '</div>';
}

function kpiHtml() {
  const t = todayISO();
  const cur = periodStats(addDaysISO(t, -29), t);
  const prev = periodStats(addDaysISO(t, -59), addDaysISO(t, -30));
  const head = secHead('۳۰ روز اخیر', '<button type="button" class="link" data-go="#/analysis">تحلیل</button>');
  if (!cur.n && !prev.n && !cur.dms && !cur.bookings) {
    return '<section class="sec">' + head + '<p class="muted small card">وقتی پست‌های این ماه با تاریخ انتشار ثبت بشن، اینجا خلاصه‌ی ۳۰ روز اخیر رو با ۳۰ روز قبلش مقایسه می‌کنی. پست‌های کولب حساب نمی‌شن.</p></section>';
  }
  const n = (v) => fmtNum(v);
  const p = (v) => fmtPct(v);
  return '<section class="sec">' + head + '<div class="kpis">' +
    kpiTile('پست منتشرشده', cur.n, prev.n, n, 1) +
    kpiTile('فالوور جدید', cur.follows, prev.follows, n, 1) +
    kpiTile('میانه‌ی تبدیل به فالوور', cur.followMed, prev.followMed, p, 1) +
    kpiTile('دایرکت مشاوره', cur.dms, prev.dms, n, 1) +
    '</div></section>';
}

function pipelineHtml() {
  const counts = {};
  activeItems().forEach((it) => { counts[it.stage] = (counts[it.stage] || 0) + 1; });
  const sts = ['idea'].concat(PROD_STAGES);
  return '<section class="sec">' + secHead('خط تولید') + '<div class="strip pipe">' + sts.map((st, i) =>
    '<button type="button" class="frame' + (counts[st] ? ' done' : '') + '" data-go="#/content?tab=' + (st === 'idea' ? 'idea' : 'prod') + '"><b>' + faNum(counts[st] || 0) + '</b><span>' + STAGES.find((x) => x.id === st).short + '</span></button>').join('') + '</div></section>';
}

function recordsHtml() {
  const pool = analysisPool(false);
  const rows = [['followRate', 'بهترین تبدیل به فالوور'], ['saveRate', 'بهترین نرخ سیو'], ['avgWatch', 'بیشترین واچ‌تایم'], ['views', 'بیشترین ویو']]
    .map(([mid, label]) => {
      const b = bestOf(pool, mid);
      if (!b) return '';
      return '<button type="button" class="row" data-go="#/item/' + b.it.id + '"><span class="ric">' + ic('trophy') + '</span><span class="rt"><b>' + label + ': ' + fmtMetric(mid, b.v) + '</b><span>«' + esc(b.it.title) + '»</span></span>' + ic('chevL') + '</button>';
    }).join('');
  if (!rows) return '';
  return '<section class="sec">' + secHead('رکوردهای پیج', '<span class="muted small">بدون کولب‌ها</span>') + '<div class="list">' + rows + '</div></section>';
}

function itemsByDate(fromISO, toISO) {
  const map = {};
  for (const it of activeItems()) {
    const d = isPublished(it) ? it.publishDate : it.plannedDate;
    if (!d || d < fromISO || d > toISO) continue;
    (map[d] || (map[d] = [])).push(it);
  }
  for (const k in map) {
    map[k].sort((a, b) => ((isPublished(a) ? a.publishTime : a.plannedTime) || '').localeCompare((isPublished(b) ? b.publishTime : b.plannedTime) || ''));
  }
  return map;
}

function viewHome() {
  const parts = [contextWarnHtml()];
  if (_installEvt && !isStandalone()) parts.push(installHtml());
  if (!S.items.length) {
    parts.push(onboardingHtml());
  } else {
    parts.push(heroHtml());
    parts.push(backupNoteHtml());
    parts.push(todoHtml());
    parts.push(weekStripHtml());
    parts.push(kpiHtml());
    parts.push(pipelineHtml());
    parts.push(recordsHtml());
  }
  return {
    title: 'استودیو محتوا',
    sub: fmtJ(todayISO(), { weekday: true, year: true }),
    tab: 'home',
    html: parts.join(''),
    fab: { icon: 'plus', label: 'افزودن', fn: quickAdd },
    actions: SYNC ? [{ icon: SYNC.lastError ? 'cloudOff' : 'cloud', label: 'پشتیبان خودکار: ' + syncWhenText(), fn: () => go('#/backup'), sync: true }] : [],
    mount: (root) => {
      root.addEventListener('click', (e) => {
        const a = actEl(e);
        if (!a) return;
        const act = a.dataset.act;
        if (act === 'newIdea') ideaSheet();
        else if (act === 'connect') connectSheet();
        else if (act === 'restore') connectSheet({ restore: true });
        else if (act === 'import') pickImportFile();
        else if (act === 'backup') backupSheet();
        else if (act === 'install') doInstall();
        else if (act === 'hideUndated') {
          S.meta.hideUndatedUntil = addDaysISO(todayISO(), 30);
          save();
          rerender();
        }
      });
    },
  };
}

/* ---------- افزودن سریع ---------- */
function quickAdd() {
  const opts = [
    ['idea', 'bulb', 'ایده‌ی جدید', 'سؤال بیمار، کامنت یا موضوع تازه'],
    ['pub', 'film', 'پست منتشرشده', 'پستی که قبلاً گذاشتی و توی اپ نیست'],
    ['stat', 'chart', 'ثبت آمار', 'برای یکی از پست‌های منتشرشده'],
    ['lead', 'msg', 'دایرکت یا نوبت', 'و این‌که از کدوم پست اومده'],
    ['learning', 'book', 'درس جدید', 'چیزی که از یک پست فهمیدی'],
    ['snippet', 'quote', 'هوک یا CTA', 'برای استفاده‌ی بعدی'],
  ];
  openSheet({
    title: 'افزودن',
    body: '<div class="list">' + opts.map((o) => '<button type="button" class="row" data-q="' + o[0] + '"><span class="ric">' + ic(o[1]) + '</span><span class="rt"><b>' + o[2] + '</b><span>' + o[3] + '</span></span></button>').join('') + '</div>',
    onMount: (b) => {
      b.addEventListener('click', (e) => {
        const r = e.target.closest('[data-q]');
        if (!r) return;
        const k = r.dataset.q;
        closeSheet(() => {
          if (k === 'idea') ideaSheet();
          else if (k === 'pub') pastPostSheet();
          else if (k === 'stat') pickPostForStat();
          else if (k === 'lead') leadSheet();
          else if (k === 'learning') learningSheet();
          else snippetSheet();
        });
      });
    },
  });
}

async function pickPostForStat() {
  const due = new Map(dueList().map((d) => [d.it.id, d]));
  const pubs = publishedChrono().reverse();
  pubs.sort((a, b) => (due.has(b.id) ? 1 : 0) - (due.has(a.id) ? 1 : 0));
  if (!pubs.length) { toast('هنوز پست منتشرشده‌ای نداری'); return; }
  const v = await pickOne({
    title: 'آمار کدوم پست؟',
    options: pubs.map((it) => ({ value: it.id, label: it.title, sub: (due.has(it.id) ? 'وقت ثبت آمار ' + checkpointName(due.get(it.id).c) + '، ' : '') + (it.publishDate ? fmtJ(it.publishDate) : 'بدون تاریخ'), ci: seriesById(it.series).ci })),
  });
  if (v) go('#/item/' + v + '/stat/new');
}

function ideaSheet(preset) {
  const d = newItem(Object.assign({ series: _lastSeries || 'sci', stage: 'idea' }, preset || {}));
  const L = S.settings.lists;
  const body =
    fieldHtml('عنوان یا سؤال', taHtml('title', '', { rows: 2, ph: 'مثلاً: چرا وزنم هر هفته بالا پایین می‌ره؟', af: true })) +
    fieldHtml('سری', chipsHtml('series', seriesOptions(), d.series, { clearable: false })) +
    fieldHtml('هدف', chipsHtml('goal', idOptions(GOALS), d.goal)) +
    fieldHtml('منبع ایده', chipsHtml('source', L.sources, d.source)) +
    fieldHtml('محل ضبط', chipsHtml('location', L.locations, d.location)) +
    '<details class="more-fields"><summary>جزئیات بیشتر</summary>' +
    fieldHtml('دغدغه‌ی مخاطب', chipsHtml('concerns', L.concerns, d.concerns, { multi: true })) +
    fieldHtml('یادداشت', taHtml('notes', '', { rows: 2 })) + '</details>' +
    '<div class="sheet-actions"><button type="button" class="btn primary" data-save>ثبت ایده</button><button type="button" class="btn" data-save-open>ثبت و باز کردن</button></div>';
  openSheet({
    title: preset && preset.plannedDate ? 'ایده برای ' + fmtJShort(preset.plannedDate) : 'ایده‌ی جدید',
    body,
    onMount: (b) => {
      bindForm(b, d);
      b.addEventListener('click', (e) => {
        const s = e.target.closest('[data-save],[data-save-open]');
        if (!s) return;
        d.title = (d.title || '').trim();
        if (!d.title) { toast('عنوان رو بنویس'); b.querySelector('textarea').focus(); return; }
        S.items.push(d);
        _lastSeries = d.series;
        touch(d);
        requestPersist();
        const open = s.hasAttribute('data-save-open');
        closeSheet(() => {
          toast('ایده ثبت شد');
          if (open) go('#/item/' + d.id); else rerender();
        });
      });
    },
  });
}

/* ---------- ثبت پستی که قبلاً منتشر شده ---------- */
function pastPostSheet() {
  const d = newItem({ series: _lastSeries || 'sci', stage: 'published', format: 'reel', pubType: 'normal' });
  const pd = { date: null, time: null, touched: false };
  const L = S.settings.lists;
  const dateText = () => fmtWhenG(pd.date, pd.time);
  const body =
    fieldHtml('عنوان', taHtml('title', '', { rows: 2, ph: 'اسمی که خودت پست رو باهاش می‌شناسی', af: true })) +
    fieldHtml('تاریخ انتشار', '<button type="button" class="input date-btn" data-pd>' + ic('calendar') + '<span>' + dateText() + '</span></button>', 'همون تاریخی که زیر پست توی اینستاگرام نوشته؛ ساعت لازم نیست.') +
    fieldHtml('سری', chipsHtml('series', seriesOptions(), d.series, { clearable: false })) +
    fieldHtml('نوع انتشار', chipsHtml('pubType', idOptions(PUBTYPES), d.pubType, { clearable: false })) +
    fieldHtml('مدت ویدیو (ثانیه)', inputHtml('durationSec', null, { num: true, ph: 'مثلاً ۴۵' })) +
    '<details class="more-fields" open><summary>برچسب‌های تحلیل</summary>' +
    fieldHtml('هدف', chipsHtml('goal', idOptions(GOALS), d.goal)) +
    fieldHtml('فرمت', chipsHtml('format', idOptions(FORMATS), d.format, { clearable: false })) +
    fieldHtml('سبک اجرا', chipsHtml('style', L.styles, d.style)) +
    fieldHtml('نوع هوک', chipsHtml('hookType', L.hookTypes, d.hookType)) +
    fieldHtml('نوع CTA', chipsHtml('ctaType', L.ctaTypes, d.ctaType)) + '</details>' +
    '<div class="sheet-actions"><button type="button" class="btn primary" data-save-stat>ثبت و وارد کردن آمار</button><button type="button" class="btn" data-save>فقط ثبت</button></div>';
  openSheet({
    title: 'پست منتشرشده',
    tall: true,
    body,
    onMount: (b) => {
      bindForm(b, d);
      b.addEventListener('click', async (e) => {
        if (e.target.closest('[data-pd]')) {
          const r = await pickDate(pubDateOpts(pd.date, pd.time, pd.touched, { title: 'تاریخ انتشار', nowIfToday: false }));
          if (r) {
            pd.date = r.date;
            pd.time = r.time;
            pd.touched = r.touched;
            b.querySelector('[data-pd] span').textContent = dateText();
          }
          return;
        }
        const s = e.target.closest('[data-save],[data-save-stat]');
        if (!s) return;
        d.title = (d.title || '').trim();
        if (!d.title) { toast('عنوان رو بنویس'); b.querySelector('textarea').focus(); return; }
        d.publishDate = pd.date;
        d.publishTime = pd.date ? pd.time : null;
        d.order = nextOrder();
        S.items.push(d);
        _lastSeries = d.series;
        touch(d);
        requestPersist();
        const toStat = s.hasAttribute('data-save-stat');
        closeSheet(() => {
          toast('پست ثبت شد');
          if (toStat) go('#/item/' + d.id + '/stat/new');
          else rerender();
        });
      });
    },
  });
}

/* ---------- فهرست محتوا: ایده‌ها، در تولید، منتشرشده ---------- */
let _contentSearch = '';

function statMini(v, l) {
  return '<span class="smini"><b>' + v + '</b><span>' + l + '</span></span>';
}

function ideaCardHtml(it) {
  const badges = [];
  if (it.priority === 'high') badges.push(badgeHtml('فوری', 'gold'));
  if (it.location) badges.push(badgeHtml(it.location, '', it.location === 'سر شیفت' ? 'clock' : null));
  if (it.plannedDate) badges.push(badgeHtml(fmtJShort(it.plannedDate), '', 'calendar'));
  const meta = [it.goal ? nameOf(GOALS, it.goal) : '', it.source || ''].filter(Boolean).map(esc).join('، ');
  const tags = it.concerns.length ? '<div class="tags">' + it.concerns.map((c) => '<span class="tag">' + esc(c) + '</span>').join('') + '</div>' : '';
  return '<article class="icard" tabindex="0" role="link" style="' + seriesVar(it.series) + '" data-go="#/item/' + it.id + '">' +
    '<div class="icard-top">' + seriesTag(it.series) + badges.join('') + '</div>' +
    '<h3>' + esc(it.title || 'بدون عنوان') + '</h3>' + (meta ? '<div class="icard-meta">' + meta + '</div>' : '') + tags +
    '<div class="icard-foot"><button type="button" class="btn sm" data-act="start" data-id="' + it.id + '">' + ic('film') + 'شروع تولید</button></div></article>';
}

function prodCardHtml(it) {
  const cp = checklistProgress(it);
  const uv = unverifiedSources(it);
  const late = it.plannedDate && it.plannedDate < todayISO();
  return '<article class="icard" tabindex="0" role="link" style="' + seriesVar(it.series) + '" data-go="#/item/' + it.id + '">' +
    '<div class="icard-top">' + seriesTag(it.series) + (it.plannedDate ? badgeHtml(fmtWhen(it.plannedDate, it.plannedTime), late ? 'warn' : '', 'calendar') : '') + '</div>' +
    '<h3>' + esc(it.title || 'بدون عنوان') + '</h3>' +
    '<div class="icard-meta">چک‌لیست ' + faNum(cp.done) + ' از ' + faNum(cp.total) + (uv ? '<span class="warn-t">' + ic('alert') + faNum(uv) + ' منبع بررسی‌نشده</span>' : '') + '</div>' +
    '<div class="mini-prog" aria-hidden="true"><span style="width:' + (cp.total ? (cp.done / cp.total) * 100 : 0) + '%"></span></div></article>';
}

function pubCardHtml(it, dueMap) {
  const v = metricFor(it, 'views', 'latest').value;
  const f = metricFor(it, 'follows', 'latest').value;
  const fr = metricFor(it, 'followRate', 'latest').value;
  const sv = metricFor(it, 'saveRate', 'latest').value;
  const stats = [
    v != null ? statMini(fmtCompact(v), 'ویو') : '',
    f != null ? statMini(fmtNum(f), 'فالوور') : '',
    fr != null ? statMini(fmtPct(fr), 'تبدیل') : '',
    sv != null ? statMini(fmtPct(sv), 'سیو') : '',
  ].join('');
  const due = dueMap.get(it.id);
  return '<article class="icard" tabindex="0" role="link" style="' + seriesVar(it.series) + '" data-go="#/item/' + it.id + '">' +
    '<div class="icard-top">' + seriesTag(it.series) + (it.pubType !== 'normal' ? badgeHtml(nameOf(PUBTYPES, it.pubType)) : '') +
    (due ? badgeHtml('آمار ' + checkpointName(due.c), 'warn', 'clock') : '') +
    '<span class="icard-date">' + (it.publishDate ? fmtJ(it.publishDate) : 'بدون تاریخ') + '</span></div>' +
    '<h3>' + esc(it.title || 'بدون عنوان') + '</h3>' +
    (stats ? '<div class="stats-row">' + stats + '</div>' : '<div class="icard-meta">هنوز آماری ثبت نشده</div>') +
    (it.publishDate ? '' : '<div class="icard-foot"><button type="button" class="btn sm" data-act="pubdate" data-id="' + it.id + '">' + ic('calendar') + 'ثبت تاریخ انتشار</button></div>') + '</article>';
}

function contentList(tab, q) {
  const sr = q.sr || '';
  const s = _contentSearch.trim();
  let list = S.items.filter((it) => (q.ar === '1' ? it.archived : !it.archived));
  if (tab === 'idea') list = list.filter((it) => it.stage === 'idea');
  else if (tab === 'prod') list = list.filter((it) => PROD_STAGES.indexOf(it.stage) >= 0);
  else list = list.filter(isPublished);
  if (sr) list = list.filter((it) => it.series === sr);
  if (q.loc && tab === 'idea') list = list.filter((it) => it.location === q.loc);
  if (q.nd === '1' && tab === 'pub') list = list.filter((it) => !it.publishDate);
  if (s) list = list.filter((it) => (it.title + ' ' + it.notes + ' ' + it.script.body + ' ' + it.caption).indexOf(s) >= 0);

  if (!list.length) {
    if (s || sr || q.loc || q.nd) return emptyHtml('search', 'چیزی پیدا نشد', 'فیلترها یا جستجو رو تغییر بده.');
    if (tab === 'idea') return emptyHtml('bulb', 'بانک ایده خالیه', 'ایده‌ها رو همون لحظه که به ذهنت می‌رسن با دکمه‌ی + ثبت کن.');
    if (tab === 'prod') return emptyHtml('film', 'چیزی در حال تولید نیست', 'روی یک ایده «شروع تولید» رو بزن.');
    return emptyHtml('chart', 'هنوز پستی منتشر نشده', 'وقتی پستی رو منتشر کردی، توی صفحه‌ی خودش مرحله رو روی «منتشر شد» بذار.');
  }

  if (tab === 'idea') {
    const pr = { high: 0, mid: 1, low: 2 };
    list.sort((a, b) => (pr[a.priority] - pr[b.priority]) || (b.createdAt || '').localeCompare(a.createdAt || ''));
    return list.map(ideaCardHtml).join('');
  }
  if (tab === 'prod') {
    return PROD_STAGES.slice().reverse().map((st) => {
      const g = list.filter((it) => it.stage === st).sort((a, b) => (a.plannedDate || '9').localeCompare(b.plannedDate || '9'));
      if (!g.length) return '';
      return '<div class="group-h">' + stageName(st) + '<span>' + faNum(g.length) + '</span></div>' + g.map(prodCardHtml).join('');
    }).join('');
  }
  const sort = q.sort || 'new';
  if (sort === 'new') list.sort((a, b) => pubKey(b) - pubKey(a));
  else {
    const mid = sort === 'follow' ? 'followRate' : sort === 'save' ? 'saveRate' : 'views';
    const val = (it) => { const r = metricFor(it, mid, 'latest').value; return r == null ? -1 : r; };
    list.sort((a, b) => val(b) - val(a));
  }
  const dueMap = new Map(dueList().map((d) => [d.it.id, d]));
  return list.map((it) => pubCardHtml(it, dueMap)).join('');
}

function viewContent(q) {
  const tab = q.tab === 'prod' || q.tab === 'pub' ? q.tab : 'idea';
  const act = activeItems();
  const counts = {
    idea: act.filter((it) => it.stage === 'idea').length,
    prod: act.filter((it) => PROD_STAGES.indexOf(it.stage) >= 0).length,
    pub: act.filter(isPublished).length,
  };
  const presentSeries = Array.from(new Set(S.items.map((it) => it.series)));
  const seriesChips = S.settings.series.filter((s) => presentSeries.indexOf(s.id) >= 0)
    .map((s) => '<button type="button" class="chip' + (q.sr === s.id ? ' on' : '') + '" data-sr="' + s.id + '"><span class="sdot" style="--sc:var(--s' + s.ci + ')"></span>' + esc(s.short || s.name) + '</button>').join('');
  let extra = '';
  if (tab === 'idea') {
    extra = '<div class="chips scroll">' + S.settings.lists.locations.map((l) => '<button type="button" class="chip' + (q.loc === l ? ' on' : '') + '" data-loc="' + esc(l) + '">' + esc(l) + '</button>').join('') + '</div>';
  } else if (tab === 'pub') {
    const sorts = [['new', 'جدیدترین'], ['follow', 'تبدیل به فالوور'], ['save', 'نرخ سیو'], ['views', 'ویو']];
    extra = '<div class="chips scroll">' + sorts.map((s) => '<button type="button" class="chip' + ((q.sort || 'new') === s[0] ? ' on' : '') + '" data-sort="' + s[0] + '">' + s[1] + '</button>').join('') +
      '<button type="button" class="chip' + (q.nd === '1' ? ' on' : '') + '" data-nd>بدون تاریخ</button></div>';
  }
  const html =
    segHtml('tab', [{ value: 'idea', label: 'ایده‌ها', count: counts.idea }, { value: 'prod', label: 'در تولید', count: counts.prod }, { value: 'pub', label: 'منتشرشده', count: counts.pub }], tab) +
    '<div class="searchbar">' + ic('search') + '<input class="input" type="search" placeholder="جستجو در عنوان، سناریو و کپشن" value="' + esc(_contentSearch) + '" data-search></div>' +
    '<div class="chips scroll">' + '<button type="button" class="chip' + (!q.sr ? ' on' : '') + '" data-sr="">همه‌ی سری‌ها</button>' + seriesChips + '</div>' + extra +
    '<div class="cards" data-list>' + contentList(tab, q) + '</div>' +
    '<div class="center"><button type="button" class="link" data-ar>' + (q.ar === '1' ? 'برگشت به فهرست اصلی' : 'نمایش آرشیو') + '</button></div>';

  return {
    title: 'محتوا',
    tab: 'content',
    html,
    actions: tab === 'idea' ? [{ icon: 'spark', label: 'پرامپت ۳۰ ایده', fn: ideasPromptSheet }] : [],
    fab: { icon: 'plus', label: 'ایده‌ی جدید', fn: () => ideaSheet() },
    mount: (root) => {
      const list = root.querySelector('[data-list]');
      const search = root.querySelector('[data-search]');
      search.addEventListener('input', () => {
        _contentSearch = search.value;
        list.innerHTML = contentList(tab, q);
      });
      root.addEventListener('click', (e) => {
        const seg = e.target.closest('[data-segv]');
        if (seg) { setQuery({ tab: seg.dataset.segv, loc: null, sort: null, nd: null }); return; }
        const pdb = e.target.closest('[data-act="pubdate"]');
        if (pdb) {
          const it = itemById(pdb.dataset.id);
          askPublishDate(it, false).then((changed) => {
            if (changed && it.publishDate) {
              toast('تاریخ «' + it.title + '» ثبت شد');
              rerender();
            }
          });
          return;
        }
        const st = e.target.closest('[data-act="start"]');
        if (st) {
          const it = itemById(st.dataset.id);
          it.stage = 'script';
          touch(it);
          toast('«' + it.title + '» رفت به مرحله‌ی سناریو');
          rerender();
          return;
        }
        const sr = e.target.closest('[data-sr]');
        if (sr) { setQuery({ sr: sr.dataset.sr || null }); return; }
        const loc = e.target.closest('[data-loc]');
        if (loc) { setQuery({ loc: q.loc === loc.dataset.loc ? null : loc.dataset.loc }); return; }
        const so = e.target.closest('[data-sort]');
        if (so) { setQuery({ sort: so.dataset.sort === 'new' ? null : so.dataset.sort }); return; }
        if (e.target.closest('[data-nd]')) { setQuery({ nd: q.nd === '1' ? null : '1' }); return; }
        if (e.target.closest('[data-ar]')) setQuery({ ar: q.ar === '1' ? null : '1' });
      });
    },
  };
}

function ideasPromptSheet() {
  const d = { field: 'آشپزی رژیمی' };
  const opts = ['آشپزی رژیمی', 'تغذیه و کاهش وزن', 'آمپول‌های لاغری و مدیریت وزن', 'مکمل‌ها', 'تجربه‌ی شخصی پزشک تغذیه'];
  openSheet({
    title: 'پرامپت ۳۰ ایده',
    body: '<p class="sheet-text">قالب «ایده محتوا»ی خودت. حوزه رو انتخاب یا تایپ کن، بعد کپی کن و توی یک چت جدید با Claude بفرست.</p>' +
      fieldHtml('حوزه', chipsHtml('', opts, d.field, { clearable: false }) + inputHtml('field', d.field, { cls: 'mt8' })) +
      '<div class="sheet-actions"><button type="button" class="btn primary" data-copy>' + ic('copy') + 'کپی پرامپت</button></div>',
    onMount: (b) => {
      const inp = b.querySelector('[data-bind="field"]');
      bindForm(b, d);
      b.addEventListener('click', (e) => {
        const c = e.target.closest('[data-chips] [data-value]');
        if (c) {
          d.field = c.dataset.value;
          inp.value = d.field;
          $$('[data-chips] [data-value]', b).forEach((x) => x.classList.toggle('on', x === c));
          return;
        }
        if (e.target.closest('[data-copy]')) {
          copyText(fillTemplate('ideas', { 'حوزه': (d.field || '').trim() || '…' }), 'پرامپت کپی شد');
          closeSheet();
        }
      });
    },
  });
}

/* ---------- صفحه‌ی یک پست ---------- */
function stripHtml(it) {
  const cur = stageIdx(it);
  return '<div class="strip" role="group" aria-label="مرحله‌ی تولید">' + STAGES.map((s, i) =>
    '<button type="button" class="frame' + (i < cur ? ' done' : '') + (i === cur ? ' cur' : '') + '" data-act="stage" data-stage="' + s.id + '" aria-pressed="' + (i === cur) + '">' +
    '<span class="fnum">' + faNum(i + 1) + '</span><span>' + s.short + '</span></button>').join('') + '</div>';
}

function dateBtnHtml(kind, date, time) {
  return '<button type="button" class="input date-btn" data-act="date" data-kind="' + kind + '">' + ic('calendar') + '<span>' + fmtWhenG(date, time) + '</span></button>';
}

function promptCardHtml(it) {
  return '<div class="card prompt-card"><div class="pc-h">' + ic('spark') + '<b>پرامپت برای Claude</b></div>' +
    '<p class="muted small">قالب‌های خودت، پرشده با اطلاعات همین پست. کپی کن و توی یک چت جدید بفرست.</p>' +
    '<div class="btn-grid"><button type="button" class="btn sm" data-act="prompt" data-k="scenario">سناریو</button><button type="button" class="btn sm" data-act="prompt" data-k="hook">۳۰ هوک</button>' +
    '<button type="button" class="btn sm" data-act="prompt" data-k="cta">۳۰ CTA</button><button type="button" class="btn sm" data-act="prompt" data-k="caption">کپشن</button></div>' +
    '<div class="flabel mt12">اسم چت سناریو</div><button type="button" class="copy-line" data-act="chattitle"><span data-chattitle>' + esc(chatTitle(it)) + '</span>' + ic('copy') + '</button></div>';
}

function infoTabHtml(it) {
  const L = S.settings.lists;
  return fieldHtml('سری', chipsHtml('series', seriesOptions(), it.series, { clearable: false })) +
    fieldHtml('هدف', chipsHtml('goal', idOptions(GOALS), it.goal)) +
    fieldHtml('فرمت', chipsHtml('format', idOptions(FORMATS), it.format, { clearable: false })) +
    fieldHtml('نوع انتشار', chipsHtml('pubType', idOptions(PUBTYPES), it.pubType, { clearable: false }), 'پست‌های کولب توی تحلیل جدا حساب می‌شن، چون ویوشون از پیج کلینیک میاد.') +
    fieldHtml('سبک اجرا', chipsHtml('style', L.styles, it.style)) +
    fieldHtml('نوع هوک', chipsHtml('hookType', L.hookTypes, it.hookType)) +
    fieldHtml('نوع CTA', chipsHtml('ctaType', L.ctaTypes, it.ctaType)) +
    fieldHtml('منبع ایده', chipsHtml('source', L.sources, it.source)) +
    fieldHtml('دغدغه‌ی مخاطب', chipsHtml('concerns', L.concerns, it.concerns, { multi: true })) +
    fieldHtml('محل ضبط', chipsHtml('location', L.locations, it.location)) +
    fieldHtml('اولویت', chipsHtml('priority', idOptions(PRIORITIES), it.priority, { clearable: false })) +
    '<div class="grid2">' + fieldHtml('تاریخ برنامه', dateBtnHtml('planned', it.plannedDate, it.plannedTime)) +
    fieldHtml('مدت ویدیو (ثانیه)', inputHtml('durationSec', it.durationSec, { num: true, ph: 'مثلاً ۴۵' })) + '</div>' +
    (isPublished(it) ? fieldHtml('زمان انتشار', dateBtnHtml('published', it.publishDate, it.publishTime), 'برای یادآور ثبت آمار و مقایسه‌ی روز و ساعت انتشار لازمه.') : '') +
    fieldHtml('یادداشت', taHtml('notes', it.notes, { rows: 3, ph: 'هر چیزی که باید یادت بمونه' })) +
    promptCardHtml(it);
}

function hookCountText(h) {
  const n = wordCount(h);
  if (!n) return 'قالب هوک: بین ۵ تا ۱۰ کلمه';
  return faNum(n) + ' کلمه' + (n < 5 ? '؛ کمی کوتاهه' : n > 10 ? '؛ کمی بلنده' : '');
}

function estHtml(it) {
  const txt = scriptText(it);
  const words = wordCount(txt);
  if (!words) return ic('clock') + '<span>با نوشتن هوک و متن، مدت تقریبی ویدیو اینجا حساب می‌شه.</span>';
  const secs = speechSeconds(txt);
  let warn = '';
  if (it.series === 'qa' && secs > 50) warn = '؛ برای «۳۰ ثانیه، یک سوال» بلنده';
  else if (secs > 60 && it.series !== 'self' && it.series !== 'sci') warn = '؛ از یک دقیقه بیشتره';
  return ic('clock') + '<span>حدود <b>' + faNum(secs) + ' ثانیه</b> صحبت (' + faNum(words) + ' کلمه)' + warn + '</span>';
}

function scriptTabHtml(it) {
  const sc = it.script;
  return fieldHtml('هوک', taHtml('script.hook', sc.hook, { rows: 2, ph: 'جمله‌ی اولی که می‌گی یا روی صفحه میاد' }), '<span data-hookcnt>' + hookCountText(sc.hook) + '</span>') +
    fieldHtml('متن نگهداشت', inputHtml('script.retention', sc.retention, { ph: 'مثلاً: آخرش می‌گم کدوم مکمل رو اصلاً لازم نداری' }), 'چیزی رو وعده بده که آخر ویدیو جوابش رو می‌دی. جمله‌ی کامل بنویس، نه تکه‌کلمه.') +
    fieldHtml('متن سناریو', taHtml('script.body', sc.body, { rows: 8, ph: 'متن اصلی ویدیو' })) +
    fieldHtml('CTA', taHtml('script.cta', sc.cta, { rows: 2, ph: 'مثلاً: سؤال اپیزود بعد رو از بین کامنت‌ها انتخاب می‌کنم' })) +
    '<div class="est" data-est>' + estHtml(it) + '</div>' +
    fieldHtml('یادداشت ضبط و صحنه‌ها', taHtml('script.shots', sc.shots, { rows: 3, ph: 'کجا، با چی، چه صحنه‌هایی' })) +
    '<h3 class="sub-h">کاور</h3>' +
    fieldHtml('متن کاور', inputHtml('cover.text', it.cover.text, {})) +
    fieldHtml('یادداشت کاور', taHtml('cover.notes', it.cover.notes, { rows: 2, ph: 'عکس، رنگ، حالت' })) +
    '<button type="button" class="btn sm" data-act="toBank">' + ic('quote') + 'ذخیره‌ی هوک و CTA در بانک</button>';
}

function capMetaHtml(it) {
  const c = it.caption || '';
  const len = Array.from(c).length;
  const tags = (c.match(/#[^\s#]+/g) || []).length;
  const first = c.split('\n')[0];
  const firstArr = Array.from(first);
  return '<div class="cap-counts"><span' + (len > 2200 ? ' class="warn-t"' : '') + '>' + fmtNum(len) + ' از ۲٬۲۰۰ نویسه</span><span' + (tags > 5 ? ' class="warn-t"' : '') + '>' + faNum(tags) + ' هشتگ</span></div>' +
    (first.trim() ? '<div class="cap-preview"><span class="muted small">قبل از «بیشتر» این دیده می‌شه:</span><p>' + esc(firstArr.slice(0, 125).join('')) + (firstArr.length > 125 ? '…' : '') + '</p></div>' : '');
}

function srcRowHtml(s) {
  return '<div class="src-row' + (s.verified ? ' ok' : '') + '"><button type="button" class="src-check" data-act="srcv" data-sid="' + s.id + '" aria-pressed="' + !!s.verified + '" aria-label="بررسی شد">' + ic('check') + '</button>' +
    '<span class="src-t">' + esc(s.text) + '</span><button type="button" class="icon-btn sm" data-act="srcdel" data-sid="' + s.id + '" aria-label="حذف منبع">' + ic('trash') + '</button></div>';
}

function captionTabHtml(it) {
  return fieldHtml('کپشن', taHtml('caption', it.caption, { rows: 8, ph: 'خط اول، هوک کپشنه' })) +
    '<div class="cap-meta" data-capmeta>' + capMetaHtml(it) + '</div>' +
    '<div class="btn-row"><button type="button" class="btn sm" data-act="copycap">' + ic('copy') + 'کپی کپشن</button><button type="button" class="btn sm" data-act="prompt" data-k="caption">' + ic('spark') + 'پرامپت کپشن</button></div>' +
    '<h3 class="sub-h">منابع علمی</h3><p class="muted small">منبعی که هنوز بررسی نشده، توی چک‌لیست و فهرست تولید هشدار می‌ده. بعد از بررسی تیکش بزن.</p>' +
    '<div class="src-list">' + (it.sources.map(srcRowHtml).join('') || '<p class="muted small">منبعی ثبت نشده.</p>') + '</div>' +
    '<div class="src-add"><input class="input" data-newsrc placeholder="مثلاً SURMOUNT-1، NEJM 2022"><button type="button" class="btn sm" data-act="addsrc">افزودن</button></div>';
}

function checkTabHtml(it) {
  const cp = checklistProgress(it);
  const uv = unverifiedSources(it);
  const warns = [];
  if (uv) warns.push(faNum(uv) + ' منبع هنوز بررسی نشده.');
  if (!it.script.hook) warns.push('هوک نوشته نشده.');
  if (it.format === 'reel' && !it.script.retention) warns.push('متن نگهداشت نداره.');
  if (!it.script.cta) warns.push('CTA نوشته نشده.');
  if (!it.caption) warns.push('کپشن خالیه.');
  return '<div class="prog-card"><div class="prog-h"><b data-ckcount>' + faNum(cp.done) + ' از ' + faNum(cp.total) + '</b><span class="muted small">قواعد خودت قبل از انتشار</span></div>' +
    '<div class="mini-prog big"><span data-ckbar style="width:' + (cp.total ? (cp.done / cp.total) * 100 : 0) + '%"></span></div></div>' +
    (warns.length ? '<div class="note warn">' + ic('alert') + '<div>' + warns.map(esc).join('<br>') + '</div></div>' : '') +
    '<div class="checklist">' + S.settings.checklist.map((c) =>
      '<label class="ck"><input type="checkbox" data-bind="checklist.' + c.id + '"' + (it.checklist[c.id] ? ' checked' : '') + '><span class="ck-box">' + ic('check') + '</span><span>' + esc(c.text) + '</span></label>').join('') + '</div>' +
    '<button type="button" class="btn sm ghost" data-go="#/settings/checklist">' + ic('pencil') + 'ویرایش قواعد</button>';
}

function compareToMedian(mid, v) {
  const med = accountMedian(mid);
  if (med == null || med <= 0 || v == null) return '';
  const r = v / med;
  const b = METRICS[mid].better;
  if (r > 0.87 && r < 1.15) return '<div class="mt-c">حدود میانه‌ی پیج</div>';
  const good = b > 0 ? r > 1 : r < 1;
  const txt = r >= 1.15 ? fmtNum(r, 1) + ' برابر میانه' : fmtNum(Math.round((1 - r) * 100)) + '٪ کمتر از میانه';
  return '<div class="mt-c ' + (good ? 'good' : 'bad') + '">' + ic(r > 1 ? 'arrowUp' : 'arrowDown') + txt + '</div>';
}

function snapRowHtml(it, s) {
  const bits = [];
  if (s.views != null) bits.push(fmtCompact(s.views) + ' ویو');
  if (s.reach != null) bits.push(fmtCompact(s.reach) + ' ریچ');
  if (s.follows != null) bits.push(fmtNum(s.follows) + ' فالوور');
  const sv = countOf(s, 'saves');
  if (sv != null) bits.push(fmtNum(sv) + ' سیو');
  else if (s.savesPct != null) bits.push('سیو ' + fmtPct(s.savesPct));
  const tag = s.ig ? badgeHtml('اینستاگرام', '', 'camera') : s.by === 'claude' ? badgeHtml('Claude', '', 'spark') : '';
  return '<button type="button" class="row" data-go="#/item/' + it.id + '/stat/' + s.id + '"><span class="ric">' + ic('chart') + '</span><span class="rt"><b>' + esc(checkpointName(s.t, s.label)) + tag + '</b><span>' + (bits.join('، ') || 'بدون عدد') + '</span></span>' + ic('chevL') + '</button>';
}

function statsTabHtml(it) {
  let h = '';
  if (!it.publishDate) {
    h += '<div class="note warn">' + ic('calendar') + '<div><b>زمان انتشار ثبت نشده</b><p>برای یادآور خودکار ثبت آمار و مقایسه‌ی ماهانه لازمه.</p><button type="button" class="btn sm" data-act="date" data-kind="published">ثبت زمان انتشار</button></div></div>';
  }
  if (it.igId) {
    const fd = igFollowerDelta(it, 72);
    h += '<div class="note small ig-note">' + ic('camera') + '<div><b>آمار این پست خودکار از اینستاگرام میاد</b>' +
      '<p>فالوور جدید ریلز رو اینستاگرام از این راه نمی‌ده؛ اون رو از Insights دستی وارد کن.' + (fd != null ? ' در ۷۲ ساعت بعد از این پست، فالوورهای کل پیج ' + (fd >= 0 ? fmtNum(fd) + ' تا زیاد شد' : fmtNum(-fd) + ' تا کم شد') + ' (همه‌ی پست‌ها و عوامل با هم).' : '') + '</p>' +
      (it.permalink ? '<a class="link" href="' + esc(it.permalink) + '" target="_blank" rel="noopener">باز کردن در اینستاگرام</a>' : '') + '</div></div>';
  }
  const due = dueList().find((d) => d.it.id === it.id);
  h += '<button type="button" class="btn primary block" data-go="#/item/' + it.id + '/stat/new' + (due ? '?cp=' + due.c : '') + '">' + ic('plus') + (due ? 'ثبت آمار ' + checkpointName(due.c) : 'ثبت آمار') + '</button>';
  const tiles = ['followRate', 'saveRate', 'shareRate', 'avgWatch', 'retention', 'skipRate', 'profileRate', 'nonFollower', 'views', 'follows'].map((mid) => {
    const r = metricFor(it, mid, 'latest');
    if (r.value == null) return '';
    return '<div class="mt"><div class="mt-l">' + METRICS[mid].name + '</div><div class="mt-v">' + fmtMetric(mid, r.value) + '</div>' + (isCollab(it) ? '' : compareToMedian(mid, r.value)) + '</div>';
  }).join('');
  if (tiles) {
    h += '<section class="sec">' + secHead('شاخص‌ها', '<span class="muted small">' + (isCollab(it) ? 'کولب؛ با میانه مقایسه نمی‌شه' : 'در مقایسه با میانه‌ی پیج') + '</span>') + '<div class="mtiles">' + tiles + '</div></section>';
  }
  const srcSnap = it.snapshots.slice().reverse().find((s) => s.src && Object.keys(s.src).some((k) => s.src[k] != null));
  if (srcSnap) {
    const names = [['reels', 'ریلز'], ['explore', 'اکسپلور'], ['feed', 'فید'], ['stories', 'استوری'], ['profile', 'پروفایل'], ['other', 'سایر']];
    const rows = names.filter((n) => srcSnap.src[n[0]] != null).map((n) => ({ label: n[1], v: srcSnap.src[n[0]], fmt: fmtPct(srcSnap.src[n[0]], 1) })).sort((a, b) => b.v - a.v);
    h += '<section class="sec">' + secHead('منبع بازدید', '<span class="muted small">' + esc(checkpointName(srcSnap.t, srcSnap.label)) + '</span>') + '<div class="card">' + hbarsHtml(rows) + '</div></section>';
  }
  h += '<section class="sec">' + secHead('ثبت‌های آمار') + (it.snapshots.length ? '<div class="list">' + it.snapshots.slice().reverse().map((s) => snapRowHtml(it, s)).join('') + '</div>' : '<p class="muted small">هنوز آماری ثبت نشده.</p>') + '</section>';
  const li = leadIndex()[it.id];
  h += '<section class="sec">' + secHead('بیمارهای این پست', '<button type="button" class="link" data-act="lead">ثبت دایرکت یا نوبت</button>') +
    (li ? '<div class="kpis three"><div class="kpi"><div class="kl">دایرکت مشاوره</div><div class="kv">' + fmtNum(li.dm || 0) + '</div></div><div class="kpi"><div class="kl">نوبت و پلن</div><div class="kv">' + fmtNum((li.booking || 0) + (li.online || 0)) + '</div></div><div class="kpi"><div class="kl">مراجعه</div><div class="kv">' + fmtNum(li.visit || 0) + '</div></div></div>'
      : '<p class="muted small">هنوز دایرکت یا نوبتی به این پست نسبت ندادی.</p>') + '</section>';
  const ls = S.learnings.filter((l) => l.itemIds.indexOf(it.id) >= 0);
  h += '<section class="sec">' + secHead('درس‌های این پست', '<button type="button" class="link" data-act="learn">ثبت درس</button>') +
    (ls.length ? '<div class="cards">' + ls.map(learningCardHtml).join('') + '</div>' : '<p class="muted small">چی از این پست یاد گرفتی؟ ثبتش کن تا توی دفترچه بمونه.</p>') + '</section>';
  return h;
}

function itemTabHtml(it, tab) {
  if (tab === 'script') return scriptTabHtml(it);
  if (tab === 'caption') return captionTabHtml(it);
  if (tab === 'check') return checkTabHtml(it);
  if (tab === 'stats') return statsTabHtml(it);
  return infoTabHtml(it);
}

function viewItem(id, q) {
  const it = itemById(id);
  if (!it) return notFoundView('این پست پیدا نشد. شاید حذف شده.');
  const tabs = [{ value: 'info', label: 'مشخصات' }, { value: 'script', label: 'سناریو' }, { value: 'caption', label: 'کپشن' }, { value: 'check', label: 'چک‌لیست' }];
  if (isPublished(it)) tabs.push({ value: 'stats', label: 'آمار' });
  let tab = q.tab || (isPublished(it) ? 'stats' : it.stage === 'idea' ? 'info' : 'script');
  if (!tabs.some((t) => t.value === tab)) tab = 'info';
  const section = isPublished(it) ? 'pub' : it.stage === 'idea' ? 'idea' : 'prod';
  const when = isPublished(it)
    ? (it.publishDate ? 'منتشرشده، ' + fmtWhen(it.publishDate, it.publishTime) : 'منتشرشده، بدون تاریخ')
    : (it.plannedDate ? 'برنامه: ' + fmtWhen(it.plannedDate, it.plannedTime) : '');
  const html =
    '<div class="item-head" style="' + seriesVar(it.series) + '">' +
    taHtml('title', it.title, { rows: 1, cls: 'title-input', ph: 'عنوان پست', attrs: ' aria-label="عنوان پست"' }) +
    '<div class="item-sub">' + seriesTag(it.series) + (it.archived ? badgeHtml('آرشیو', 'warn') : '') + (when ? '<span class="muted small">' + esc(when) + '</span>' : '') + '</div>' +
    stripHtml(it) + '</div>' +
    '<div class="sticky-seg">' + segHtml('tab', tabs, tab) + '</div>' +
    '<div class="tab-body">' + itemTabHtml(it, tab) + '</div>';
  return {
    title: section === 'idea' ? 'ایده' : section === 'prod' ? 'در تولید' : 'منتشرشده',
    back: '/content?tab=' + section,
    tab: 'content',
    html,
    actions: [{ icon: 'more', label: 'گزینه‌ها', fn: () => itemMenu(it) }],
    mount: (root) => mountItem(root, it),
  };
}

function mountItem(root, it) {
  const curFrame = root.querySelector('.strip .frame.cur');
  if (curFrame && curFrame.scrollIntoView) curFrame.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  bindForm(root, it, (path, el) => {
    touch(it);
    if (path === 'series' || path === 'pubType') { rerender(); return; }
    if (path === 'title') { const ct = root.querySelector('[data-chattitle]'); if (ct) ct.textContent = chatTitle(it); return; }
    if (path.indexOf('script.') === 0) {
      const hc = root.querySelector('[data-hookcnt]');
      if (hc) hc.textContent = hookCountText(it.script.hook);
      const est = root.querySelector('[data-est]');
      if (est) est.innerHTML = estHtml(it);
      return;
    }
    if (path === 'caption') { root.querySelector('[data-capmeta]').innerHTML = capMetaHtml(it); return; }
    if (path.indexOf('checklist.') === 0) {
      const cp = checklistProgress(it);
      root.querySelector('[data-ckcount]').textContent = faNum(cp.done) + ' از ' + faNum(cp.total);
      root.querySelector('[data-ckbar]').style.width = (cp.total ? (cp.done / cp.total) * 100 : 0) + '%';
    }
  });
  root.addEventListener('keydown', (e) => {
    if (e.target.matches('[data-newsrc]') && e.key === 'Enter') { e.preventDefault(); addSource(root, it); }
    if (e.target.matches('.title-input') && e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
  });
  root.addEventListener('click', async (e) => {
    const seg = e.target.closest('[data-segv]');
    if (seg) { setQuery({ tab: seg.dataset.segv }); return; }
    const a = actEl(e);
    if (!a) return;
    const act = a.dataset.act;
    if (act === 'stage') await setStage(it, a.dataset.stage);
    else if (act === 'date') await editItemDate(it, a.dataset.kind);
    else if (act === 'prompt') copyText(itemPrompt(it, a.dataset.k), 'پرامپت ' + TEMPLATE_NAMES[a.dataset.k] + ' کپی شد');
    else if (act === 'chattitle') copyText(chatTitle(it), 'اسم چت کپی شد');
    else if (act === 'copycap') {
      if (!it.caption) { toast('کپشن خالیه'); return; }
      copyText(it.caption, 'کپشن کپی شد');
    } else if (act === 'addsrc') addSource(root, it);
    else if (act === 'srcv') {
      const s = it.sources.find((x) => x.id === a.dataset.sid);
      s.verified = !s.verified;
      touch(it);
      rerender();
    } else if (act === 'srcdel') {
      it.sources = it.sources.filter((x) => x.id !== a.dataset.sid);
      touch(it);
      rerender();
    } else if (act === 'toBank') itemToBank(it);
    else if (act === 'lead') leadSheet({ itemId: it.id });
    else if (act === 'learn') learningSheet({ itemIds: [it.id] });
    else if (act === 'editLearning') {
      const l = S.learnings.find((x) => x.id === a.dataset.lid);
      if (l) learningSheet(null, l);
    }
  });
}

function addSource(root, it) {
  const inp = root.querySelector('[data-newsrc]');
  const t = inp.value.trim();
  if (!t) { inp.focus(); return; }
  it.sources.push({ id: uid('r'), text: t, verified: false });
  touch(it);
  rerender();
  toast('منبع اضافه شد');
}

function itemToBank(it) {
  const add = [];
  const pairs = [['hook', it.script.hook], ['cta', it.script.cta], ['retention', it.script.retention], ['cover', it.cover.text]];
  for (const [kind, text] of pairs) {
    const t = (text || '').trim();
    if (!t) continue;
    if (S.snippets.some((s) => s.kind === kind && s.text === t)) continue;
    const now = new Date().toISOString();
    add.push({ id: uid('n'), kind, text: t, series: it.series, itemId: it.id, used: isPublished(it), result: null, createdAt: now, updatedAt: now });
  }
  if (!add.length) { toast('چیز تازه‌ای برای ذخیره نبود'); return; }
  S.snippets.push.apply(S.snippets, add);
  save();
  toast(faNum(add.length) + ' مورد به بانک هوک و CTA اضافه شد');
}

async function setStage(it, st) {
  if (st === it.stage) return;
  if (st === 'published') {
    const ok = await publishSheet(it);
    if (!ok) return;
  } else {
    it.stage = st;
  }
  touch(it);
  toast('مرحله: ' + stageName(st));
  if (st === 'published') setQuery({ tab: 'stats' });
  else rerender();
}

const PUB_TIME_HINT = 'اگه ساعت دقیق رو نمی‌دونی، «نامعلوم» بمونه؛ همون روز کافیه.';

function pubDateOpts(date, time, touched, extra) {
  return Object.assign({ title: 'زمان انتشار', date, time: touched ? time : null, touched, withTime: true, nowIfToday: true, rememberLast: true, timeHint: PUB_TIME_HINT }, extra || {});
}

function publishSheet(it) {
  return new Promise((resolve) => {
    const d = { date: it.publishDate || todayISO(), time: it.publishTime || null, touched: !!it.publishTime, pubType: it.pubType || 'normal', dur: it.durationSec };
    // اگر ساعت انتخاب نشده و انتشار امروز است، ساعت همین لحظه ثبت می‌شود
    const eff = () => (d.touched ? d.time : d.date === todayISO() ? nowTime() : null);
    let ok = false;
    openSheet({
      title: 'ثبت انتشار',
      body: '<p class="sheet-text">زمان انتشار رو ثبت کن تا یادآور آمار سر وقت بیاد. برای پست‌های قدیمی همون روز کافیه.</p>' +
        fieldHtml('زمان انتشار', '<button type="button" class="input date-btn" data-pd>' + ic('calendar') + '<span>' + fmtWhenG(d.date, eff()) + '</span></button>') +
        fieldHtml('نوع انتشار', chipsHtml('pubType', idOptions(PUBTYPES), d.pubType, { clearable: false })) +
        fieldHtml('مدت ویدیو (ثانیه)', inputHtml('dur', d.dur, { num: true })) +
        '<div class="sheet-actions"><button type="button" class="btn primary" data-ok>منتشر شد</button><button type="button" class="btn ghost" data-sclose>انصراف</button></div>',
      onMount: (b) => {
        bindForm(b, d);
        b.addEventListener('click', async (e) => {
          if (e.target.closest('[data-pd]')) {
            const r = await pickDate(pubDateOpts(d.date, d.time, d.touched));
            if (r) {
              d.date = r.date;
              d.time = r.time;
              d.touched = r.touched;
              b.querySelector('[data-pd] span').textContent = fmtWhenG(d.date, eff());
            }
            return;
          }
          if (e.target.closest('[data-ok]')) {
            it.stage = 'published';
            it.publishDate = d.date;
            it.publishTime = eff();
            it.pubType = d.pubType;
            if (d.dur != null) it.durationSec = d.dur;
            if (it.order == null) it.order = nextOrder();
            ok = true;
            closeSheet();
          }
        });
      },
      onClose: () => resolve(ok),
    });
  });
}

// ثبت یا تغییر تاریخ انتشار؛ اگر چیزی عوض شد true برمی‌گرداند
async function askPublishDate(it, allowClear) {
  const r = await pickDate(pubDateOpts(it.publishDate, it.publishTime, !!it.publishTime, { allowClear: !!allowClear, nowIfToday: !it.publishDate }));
  if (r === undefined) return false;
  it.publishDate = r ? r.date : null;
  it.publishTime = r ? r.time : null;
  touch(it);
  return true;
}

async function editItemDate(it, kind) {
  if (kind !== 'planned') {
    if (await askPublishDate(it, true)) rerender();
    return;
  }
  const r = await pickDate({ title: 'تاریخ برنامه', date: it.plannedDate, time: it.plannedTime, withTime: true, allowClear: true, unknownLabel: 'بدون ساعت' });
  if (r === undefined) return;
  it.plannedDate = r ? r.date : null;
  it.plannedTime = r ? r.time : null;
  touch(it);
  rerender();
}

function itemMenu(it) {
  openSheet({
    title: 'گزینه‌ها',
    body: '<div class="list">' +
      '<button type="button" class="row" data-m="ask"><span class="ric">' + ic('spark') + '</span><span class="rt"><b>سؤال از Claude درباره‌ی این پست</b><span>تحلیل، هوک، سناریو یا هر چیزی درباره‌ی همین پست</span></span></button>' +
      '<button type="button" class="row" data-m="dup"><span class="ric">' + ic('copy') + '</span><span class="rt"><b>تکثیر</b><span>نسخه‌ی تازه با همین سناریو و کپشن، بدون آمار؛ برای نسخه‌ی دوم ترایل</span></span></button>' +
      '<button type="button" class="row" data-m="arch"><span class="ric">' + ic('archive') + '</span><span class="rt"><b>' + (it.archived ? 'برگرداندن از آرشیو' : 'آرشیو') + '</b><span>' + (it.archived ? 'دوباره توی فهرست‌ها دیده می‌شه' : 'از فهرست‌ها پنهان می‌شه ولی پاک نمی‌شه') + '</span></span></button>' +
      '<button type="button" class="row danger" data-m="del"><span class="ric">' + ic('trash') + '</span><span class="rt"><b>حذف</b><span>همراه همه‌ی آمارهاش</span></span></button></div>',
    onMount: (b) => {
      b.addEventListener('click', (e) => {
        const r = e.target.closest('[data-m]');
        if (!r) return;
        const m = r.dataset.m;
        if (m === 'ask') {
          closeSheet(() => askClaudeSheet({ itemId: it.id }));
          return;
        }
        if (m === 'dup') {
          const c = JSON.parse(JSON.stringify(it));
          const now = new Date().toISOString();
          Object.assign(c, { id: uid('i'), title: it.title + ' (نسخه‌ی دوم)', stage: isPublished(it) ? 'edit' : it.stage, snapshots: [], publishDate: null, publishTime: null, order: null, archived: false, igId: null, permalink: null, createdAt: now, updatedAt: now });
          S.items.push(c);
          save();
          closeSheet(() => { toast('نسخه‌ی تازه ساخته شد'); go('#/item/' + c.id); });
        } else if (m === 'arch') {
          it.archived = !it.archived;
          touch(it);
          closeSheet(() => { toast(it.archived ? 'آرشیو شد' : 'از آرشیو برگشت'); rerender(); });
        } else if (m === 'del') {
          closeSheet(async () => {
            const ok = await confirmBox({ title: 'حذف «' + it.title + '»؟', text: 'این پست و آمارهاش پاک می‌شن. دایرکت‌ها و درس‌های مرتبط می‌مونن ولی دیگه به این پست وصل نیستن.', ok: 'حذف کن', danger: true });
            if (!ok) return;
            S.items = S.items.filter((x) => x !== it);
            markDeleted(it.id);
            S.leads.forEach((l) => { if (l.itemId === it.id) l.itemId = null; });
            S.learnings.forEach((l) => { l.itemIds = l.itemIds.filter((x) => x !== it.id); });
            S.snippets.forEach((s) => { if (s.itemId === it.id) s.itemId = null; });
            invalidateLeads();
            save();
            toast('حذف شد');
            location.replace('#/content?tab=' + (isPublished(it) ? 'pub' : it.stage === 'idea' ? 'idea' : 'prod'));
          });
        }
      });
    },
  });
}

function notFoundView(msg) {
  return { title: 'پیدا نشد', back: '/', tab: '', html: emptyHtml('search', 'پیدا نشد', esc(msg || ''), '<button type="button" class="btn" data-go="#/">برگشت به خانه</button>') };
}

/* ---------- فرم ثبت آمار ---------- */
const ENG_FIELDS = [['likes', 'لایک'], ['comments', 'کامنت'], ['shares', 'شیر'], ['saves', 'سیو'], ['reposts', 'ریپست']];
const SRC_FIELDS = [['reels', 'ریلز'], ['explore', 'اکسپلور'], ['feed', 'فید'], ['stories', 'استوری'], ['profile', 'پروفایل'], ['other', 'سایر']];
const SNAP_NUM_KEYS = ['views', 'reach', 'follows', 'profileVisits', 'likes', 'comments', 'shares', 'saves', 'reposts', 'likesPct', 'commentsPct', 'sharesPct', 'savesPct', 'repostsPct', 'skipRate', 'avgWatch', 'followersPct', 'age2554', 'age1317'];

function numField(label, path, value, hint) {
  return fieldHtml(label, inputHtml(path, value, { num: true }), hint);
}

function altText(f, k) {
  const s = f.s;
  if (!s.reach) return '';
  if (f.mode === 'pct') {
    const c = s[k + 'Pct'] != null ? Math.round((s[k + 'Pct'] * s.reach) / 100) : s[k];
    return c != null ? 'حدود ' + fmtNum(c) + ' نفر' : '';
  }
  const v = s[k] != null ? (s[k] / s.reach) * 100 : s[k + 'Pct'];
  return v != null ? 'حدود ' + fmtPct(v) : '';
}

function engHtml(f) {
  const pct = f.mode === 'pct';
  return '<div class="grid2">' + ENG_FIELDS.map(([k, l]) =>
    fieldHtml(l + (pct ? ' (٪)' : ''), inputHtml('s.' + k + (pct ? 'Pct' : ''), f.s[k + (pct ? 'Pct' : '')], { num: true }), '<span data-alt="' + k + '">' + altText(f, k) + '</span>')).join('') + '</div>' +
    (pct ? '<p class="fhint">درصدهایی که اینستاگرام کنار هر عدد نشون می‌ده (مثلاً «سیو ۱٫۲۸٪»).</p>' : '');
}

function updateAlt(root, f) {
  ENG_FIELDS.forEach(([k]) => {
    const el = root.querySelector('[data-alt="' + k + '"]');
    if (el) el.textContent = altText(f, k);
  });
}

function customHint(h) {
  return h != null && h >= 48 ? 'یعنی حدود ' + fmtHours(h) + ' بعد از انتشار' : '';
}

function guessMode(d) {
  const nc = ENG_FIELDS.filter(([k]) => d[k] != null).length;
  const np = ENG_FIELDS.filter(([k]) => d[k + 'Pct'] != null).length;
  if (nc || np) return nc >= np ? 'count' : 'pct';
  return null;
}

function previewHtml(it, f) {
  const s = f.s;
  const tmpIt = { durationSec: f.dur };
  const items = [
    ['تبدیل به فالوور', METRICS.followRate.calc(s, tmpIt), 'followRate'],
    ['نرخ سیو', METRICS.saveRate.calc(s, tmpIt), 'saveRate'],
    ['نرخ شیر', METRICS.shareRate.calc(s, tmpIt), 'shareRate'],
    ['نگهداشت', METRICS.retention.calc(s, tmpIt), 'retention'],
  ].filter((x) => x[1] != null && Number.isFinite(x[1]));
  if (!items.length) return '<span class="muted small">با وارد کردن ریچ و بقیه‌ی عددها، شاخص‌ها اینجا حساب می‌شن.</span>';
  return items.map((x) => '<span class="pv"><span>' + x[0] + '</span><b>' + fmtMetric(x[2], x[1]) + '</b></span>').join('');
}

function srcSumHtml(s) {
  const vals = SRC_FIELDS.map(([k]) => s.src[k]).filter((v) => v != null);
  if (!vals.length) return '';
  const t = sum(vals);
  return 'جمع: ' + fmtNum(t, 1) + '٪' + (Math.abs(t - 100) > 3 ? '؛ معمولاً حدود ۱۰۰٪ می‌شه' : '');
}

function viewStatForm(itemId, sid, q) {
  const it = itemById(itemId);
  if (!it) return notFoundView('این پست پیدا نشد.');
  const existing = sid !== 'new' ? it.snapshots.find((s) => s.id === sid) : null;
  if (sid !== 'new' && !existing) return notFoundView('این ثبت آمار پیدا نشد.');
  const cps = S.settings.checkpoints.slice().sort((a, b) => a - b);
  const d = existing ? JSON.parse(JSON.stringify(existing)) : { id: uid('s'), t: q.cp ? Number(q.cp) : suggestCheckpoint(it), label: '', takenAt: new Date().toISOString(), src: {} };
  if (!d.src) d.src = {};
  const isCustom = existing ? cps.indexOf(d.t) < 0 : d.t == null || cps.indexOf(d.t) < 0;
  const f = { s: d, dur: it.durationSec, mode: (existing && guessMode(d)) || S.settings.statMode || 'pct', custom: isCustom, customH: isCustom ? d.t : null };
  if (!existing && !isCustom) f.customH = null;
  if (!existing && f.custom && d.t == null) {
    const h = hoursSincePub(it);
    f.customH = h != null ? Math.round(h) : null;
  }
  const h = hoursSincePub(it);
  const cpChips = cps.map((c) => '<button type="button" class="chip' + (!f.custom && d.t === c ? ' on' : '') + '" data-cp="' + c + '">' + checkpointName(c) + '</button>').join('') +
    '<button type="button" class="chip' + (f.custom ? ' on' : '') + '" data-cp="custom">دلخواه</button>';

  const html =
    '<div class="card stat-head" style="' + seriesVar(it.series) + '">' + seriesTag(it.series) + '<b>' + esc(it.title) + '</b>' +
    '<span class="muted small">' + (it.publishDate ? 'منتشرشده ' + fmtWhen(it.publishDate, it.publishTime) + (h != null && h >= 0 ? '؛ ' + fmtHours(h) + ' پیش' : '') : 'زمان انتشار ثبت نشده') + '</span></div>' +
    fieldHtml('مقطع', '<div class="chips" data-cps>' + cpChips + '</div>') +
    '<div class="custom-cp" data-custom' + (f.custom ? '' : ' hidden') + '><div class="grid2">' +
    fieldHtml('ساعت از انتشار', inputHtml('customH', f.customH, { num: true, ph: 'مثلاً ۳۶' }), '<span data-customhint>' + customHint(f.customH) + '</span>') +
    fieldHtml('برچسب (اختیاری)', inputHtml('s.label', d.label, { ph: 'مثلاً بعد از انتخاب رشته' })) + '</div></div>' +
    '<h3 class="sub-h">پایه</h3><div class="grid2">' +
    numField('ویو', 's.views', d.views) +
    numField('ریچ (بیننده‌ها)', 's.reach', d.reach, 'Accounts reached') +
    numField('فالوور جدید', 's.follows', d.follows) +
    numField('بازدید پروفایل', 's.profileVisits', d.profileVisits) + '</div>' +
    '<div class="sub-h-row"><h3 class="sub-h">تعامل</h3>' + segHtml('mode', [{ value: 'pct', label: 'درصد' }, { value: 'count', label: 'تعداد' }], f.mode) + '</div>' +
    '<div data-eng>' + engHtml(f) + '</div>' +
    '<h3 class="sub-h">نگهداشت</h3><div class="grid2">' +
    numField('اسکیپ‌ریت (٪)', 's.skipRate', d.skipRate) +
    numField('میانگین واچ‌تایم (ثانیه)', 's.avgWatch', d.avgWatch) +
    numField('مدت ویدیو (ثانیه)', 'dur', f.dur) + '</div>' +
    '<h3 class="sub-h">منبع بازدید (٪)</h3><div class="grid3">' +
    SRC_FIELDS.map(([k, l]) => numField(l, 's.src.' + k, d.src[k])).join('') + '</div><div class="fhint" data-srcsum>' + srcSumHtml(d) + '</div>' +
    '<h3 class="sub-h">مخاطب</h3><div class="grid3">' +
    numField('فالوور (٪)', 's.followersPct', d.followersPct, 'بقیه غیرفالوورن') +
    numField('سن ۲۵ تا ۵۴ (٪)', 's.age2554', d.age2554) +
    numField('سن ۱۳ تا ۱۷ (٪)', 's.age1317', d.age1317) + '</div>' +
    fieldHtml('یادداشت', taHtml('s.note', d.note, { rows: 2, ph: 'هر چیزی که روی این عددها اثر داشته' })) +
    '<div class="preview" data-preview>' + previewHtml(it, f) + '</div>' +
    '<div class="form-actions"><button type="button" class="btn primary" data-save>' + ic('check') + 'ثبت آمار</button>' +
    (existing ? '<button type="button" class="btn danger" data-del>' + ic('trash') + 'حذف</button>' : '') + '</div>';

  return {
    title: existing ? 'ویرایش آمار' : 'ثبت آمار',
    back: '/item/' + it.id + '?tab=stats',
    tab: 'content',
    html,
    mount: (root) => {
      bindForm(root, f, (path) => {
        if (path === 'customH') root.querySelector('[data-customhint]').textContent = customHint(f.customH);
        if (path.indexOf('s.src.') === 0) root.querySelector('[data-srcsum]').textContent = srcSumHtml(d);
        else updateAlt(root, f);
        root.querySelector('[data-preview]').innerHTML = previewHtml(it, f);
      });
      root.addEventListener('click', async (e) => {
        const cp = e.target.closest('[data-cp]');
        if (cp) {
          f.custom = cp.dataset.cp === 'custom';
          if (!f.custom) d.t = Number(cp.dataset.cp);
          $$('[data-cp]', root).forEach((x) => x.classList.toggle('on', x === cp));
          root.querySelector('[data-custom]').hidden = !f.custom;
          return;
        }
        const seg = e.target.closest('[data-segv]');
        if (seg) {
          f.mode = seg.dataset.segv;
          S.settings.statMode = f.mode;
          save();
          $$('[data-seg="mode"] button', root).forEach((x) => x.classList.toggle('on', x === seg));
          root.querySelector('[data-eng]').innerHTML = engHtml(f);
          return;
        }
        if (e.target.closest('[data-save]')) {
          if (f.custom) d.t = f.customH != null ? f.customH : null;
          if (d.t == null && !f.custom) { toast('مقطع رو انتخاب کن'); return; }
          for (const k in d.src) if (d.src[k] == null) delete d.src[k];
          const has = SNAP_NUM_KEYS.some((k) => d[k] != null) || Object.keys(d.src).length > 0;
          if (!has) { toast('حداقل یک عدد وارد کن'); return; }
          if (!f.custom) d.label = '';
          d.updatedAt = new Date().toISOString();
          if (existing) {
            it.snapshots = it.snapshots.filter((s) => s.id !== existing.id);
          } else if (d.t != null && it.snapshots.some((s) => s.t === d.t)) {
            const ok = await confirmBox({ title: 'آمار ' + checkpointName(d.t) + ' قبلاً ثبت شده', text: 'ثبت قبلی با این عددها جایگزین بشه؟', ok: 'جایگزین کن' });
            if (!ok) return;
            it.snapshots = it.snapshots.filter((s) => s.t !== d.t);
          }
          insertSnapshot(it, d);
          if (f.dur != null) it.durationSec = f.dur;
          touch(it);
          toast('آمار ثبت شد');
          goBack();
          return;
        }
        if (e.target.closest('[data-del]')) {
          const ok = await confirmBox({ title: 'این ثبت آمار حذف بشه؟', ok: 'حذف کن', danger: true });
          if (!ok) return;
          it.snapshots = it.snapshots.filter((s) => s.id !== existing.id);
          touch(it);
          toast('حذف شد');
          goBack();
        }
      });
    },
  };
}

/* ---------- تقویم محتوایی ---------- */
function calPillHtml(it) {
  const pub = isPublished(it);
  const t = pub ? it.publishTime : it.plannedTime;
  return '<button type="button" class="cpill' + (pub ? ' pub' : '') + '" style="' + seriesVar(it.series) + '" data-item="' + it.id + '">' +
    '<span class="cp-mark" aria-hidden="true"></span><span class="cp-t">' + esc(it.title || 'بدون عنوان') + '</span>' +
    '<span class="cp-s">' + (pub ? 'منتشر شد' : stageName(it.stage)) + (t ? '، ' + faNum(t) : '') + '</span></button>';
}

function balanceHtml(b, label) {
  if (!b.total) {
    return '<div class="card"><div class="card-h"><b>تعادل محتوا</b><span class="muted small">' + label + '</span></div><p class="muted small">توی این بازه چیزی منتشر یا برنامه‌ریزی نشده.</p></div>';
  }
  const goalRows = GOALS.map((g) => ({ label: g.name, v: b.byGoal[g.id] || 0 }));
  if (b.byGoal.none) goalRows.push({ label: 'بدون هدف', v: b.byGoal.none });
  const seriesRows = Object.keys(b.bySeries).map((sid) => ({ label: seriesById(sid).name, v: b.bySeries[sid], ci: seriesById(sid).ci })).sort((x, y) => y.v - x.v);
  return '<div class="card"><div class="card-h"><b>تعادل محتوا</b><span class="muted small">' + label + '، ' + faNum(b.total) + ' پست</span></div>' +
    '<div class="bal-sub">بر اساس هدف</div>' + hbarsHtml(goalRows) +
    '<div class="bal-sub">بر اساس سری</div>' + hbarsHtml(seriesRows) +
    (b.warnings.length ? '<div class="note warn small">' + ic('alert') + '<div>' + b.warnings.map(esc).join('<br>') + '</div></div>' : '') + '</div>';
}

function weekRangeLabel(ws) {
  const we = addDaysISO(ws, 6);
  const a = isoToJ(ws), b = isoToJ(we);
  if (a.jm === b.jm) return faNum(a.jd) + ' تا ' + faNum(b.jd) + ' ' + J_MONTHS[b.jm - 1];
  return faNum(a.jd) + ' ' + J_MONTHS[a.jm - 1] + ' تا ' + faNum(b.jd) + ' ' + J_MONTHS[b.jm - 1];
}

function viewCalendar(q) {
  const mode = q.v === 'month' ? 'month' : 'week';
  const anchor = q.d || todayISO();
  const today = todayISO();
  let body = '';
  let bal;
  if (mode === 'week') {
    const ws = weekStartISO(anchor);
    const we = addDaysISO(ws, 6);
    const map = itemsByDate(ws, we);
    const isCur = ws === weekStartISO(today);
    body += '<div class="cal-nav"><button type="button" class="icon-btn" data-nav="-7" aria-label="هفته‌ی قبل">' + ic('chevR') + '</button><b>' + weekRangeLabel(ws) + '</b>' +
      '<button type="button" class="icon-btn" data-nav="7" aria-label="هفته‌ی بعد">' + ic('chevL') + '</button>' + (isCur ? '' : '<button type="button" class="btn sm" data-today>امروز</button>') + '</div>';
    body += '<div class="week">';
    for (let i = 0; i < 7; i++) {
      const iso = addDaysISO(ws, i);
      const list = map[iso] || [];
      body += '<div class="wk-day' + (iso === today ? ' today' : '') + (i === 6 ? ' fri' : '') + '"><div class="wk-date"><b>' + faNum(isoToJ(iso).jd) + '</b><span>' + WD_SAT[i] + '</span></div>' +
        '<div class="wk-items">' + list.map(calPillHtml).join('') + '<button type="button" class="wk-add" data-add="' + iso + '">' + ic('plus') + 'برنامه‌ریزی</button></div></div>';
    }
    body += '</div>';
    bal = balanceHtml(balanceRange(addDaysISO(ws, -21), we), '۴ هفته‌ی منتهی به این هفته');
  } else {
    const ms = jMonthStartISO(anchor);
    const j = isoToJ(ms);
    const len = jMonthLength(j.jy, j.jm);
    const me = jToISO(j.jy, j.jm, len);
    const map = itemsByDate(ms, me);
    const isCur = ms === jMonthStartISO(today);
    body += '<div class="cal-nav"><button type="button" class="icon-btn" data-mnav="-1" aria-label="ماه قبل">' + ic('chevR') + '</button><b>' + fmtJMonth(ms) + '</b>' +
      '<button type="button" class="icon-btn" data-mnav="1" aria-label="ماه بعد">' + ic('chevL') + '</button>' + (isCur ? '' : '<button type="button" class="btn sm" data-today>امروز</button>') + '</div>';
    body += '<div class="cal-grid">' + WD_SAT_SHORT.map((w, i) => '<div class="cal-wd' + (i === 6 ? ' fri' : '') + '">' + w + '</div>').join('');
    const off = satIndex(ms);
    for (let i = 0; i < off; i++) body += '<div class="cal-day blank"></div>';
    for (let d = 1; d <= len; d++) {
      const iso = jToISO(j.jy, j.jm, d);
      const list = map[iso] || [];
      const dots = list.slice(0, 4).map((it) => '<span class="cdot' + (isPublished(it) ? '' : ' plan') + '" style="' + seriesVar(it.series) + '"></span>').join('') + (list.length > 4 ? '<span class="cmore">+</span>' : '');
      body += '<button type="button" class="cal-day' + (iso === today ? ' today' : '') + (satIndex(iso) === 6 ? ' fri' : '') + '" data-day="' + iso + '" aria-label="' + fmtJ(iso, { weekday: true }) + '، ' + faNum(list.length) + ' مورد">' +
        '<span class="dn">' + faNum(d) + '</span><span class="cal-dots">' + dots + '</span></button>';
    }
    body += '</div>';
    bal = balanceHtml(balanceRange(ms, me), 'این ماه');
  }
  const unscheduled = activeItems().filter((it) => !isPublished(it) && !it.plannedDate);
  const html =
    segHtml('v', [{ value: 'week', label: 'هفته' }, { value: 'month', label: 'ماه' }], mode) + body +
    '<div class="legend small"><span><span class="cdot" style="--sc:var(--ink-2)"></span>منتشرشده</span><span><span class="cdot plan" style="--sc:var(--ink-2)"></span>برنامه‌ریزی‌شده</span></div>' +
    (unscheduled.length ? '<button type="button" class="row card-row" data-go="#/content?tab=' + (unscheduled.some((it) => it.stage !== 'idea') ? 'prod' : 'idea') + '"><span class="ric">' + ic('bulb') + '</span><span class="rt"><b>' + faNum(unscheduled.length) + ' ایده و پست تاریخ ندارن</b><span>برای برنامه‌ریزی، روی «برنامه‌ریزی» یا یک روز بزن</span></span>' + ic('chevL') + '</button>' : '') +
    '<section class="sec">' + bal + '</section>';
  return {
    title: 'تقویم',
    tab: 'calendar',
    html,
    fab: { icon: 'plus', label: 'ایده‌ی جدید', fn: () => ideaSheet() },
    mount: (root) => {
      root.addEventListener('click', (e) => {
        const seg = e.target.closest('[data-segv]');
        if (seg) { setQuery({ v: seg.dataset.segv === 'week' ? null : 'month' }); return; }
        const nv = e.target.closest('[data-nav]');
        if (nv) { setQuery({ d: addDaysISO(weekStartISO(anchor), +nv.dataset.nav) }); return; }
        const mn = e.target.closest('[data-mnav]');
        if (mn) { setQuery({ d: addJMonths(anchor, +mn.dataset.mnav) }); return; }
        if (e.target.closest('[data-today]')) { setQuery({ d: null }); return; }
        const pill = e.target.closest('[data-item]');
        if (pill) { go('#/item/' + pill.dataset.item); return; }
        const add = e.target.closest('[data-add]');
        if (add) { scheduleSheet(add.dataset.add); return; }
        const day = e.target.closest('[data-day]');
        if (day) daySheet(day.dataset.day);
      });
    },
  };
}

function daySheet(iso) {
  const list = itemsByDate(iso, iso)[iso] || [];
  openSheet({
    title: fmtJ(iso, { weekday: true }),
    body: (list.length ? '<div class="wk-items">' + list.map(calPillHtml).join('') + '</div>' : '<p class="sheet-text">برای این روز چیزی برنامه‌ریزی نشده.</p>') +
      '<div class="sheet-actions"><button type="button" class="btn primary" data-bank>از ایده‌ها و تولید</button><button type="button" class="btn" data-new>ایده‌ی تازه</button></div>',
    onMount: (b) => {
      b.addEventListener('click', (e) => {
        const p = e.target.closest('[data-item]');
        if (p) { closeSheet(() => go('#/item/' + p.dataset.item)); return; }
        if (e.target.closest('[data-bank]')) { closeSheet(() => scheduleFromBank(iso)); return; }
        if (e.target.closest('[data-new]')) closeSheet(() => ideaSheet({ plannedDate: iso }));
      });
    },
  });
}

function scheduleSheet(iso) {
  openSheet({
    title: 'برنامه‌ریزی برای ' + fmtJShort(iso),
    body: '<div class="list"><button type="button" class="row" data-bank><span class="ric">' + ic('layers') + '</span><span class="rt"><b>از ایده‌ها و پست‌های در حال تولید</b><span>یکی از موارد موجود رو بذار روی این روز</span></span></button>' +
      '<button type="button" class="row" data-new><span class="ric">' + ic('bulb') + '</span><span class="rt"><b>ایده‌ی تازه</b><span>بنویس و همین‌جا برنامه‌ریزی کن</span></span></button></div>',
    onMount: (b) => {
      b.addEventListener('click', (e) => {
        if (e.target.closest('[data-bank]')) closeSheet(() => scheduleFromBank(iso));
        else if (e.target.closest('[data-new]')) closeSheet(() => ideaSheet({ plannedDate: iso }));
      });
    },
  });
}

async function scheduleFromBank(iso) {
  const cands = activeItems().filter((it) => !isPublished(it))
    .sort((a, b) => (a.plannedDate ? 1 : 0) - (b.plannedDate ? 1 : 0) || stageIdx(b) - stageIdx(a));
  if (!cands.length) { toast('ایده یا پستی در حال تولید نداری'); return; }
  const v = await pickOne({
    title: 'چی رو برای ' + fmtJShort(iso) + ' بذارم؟',
    options: cands.map((it) => ({ value: it.id, label: it.title, sub: stageName(it.stage) + (it.plannedDate ? '؛ الان برای ' + fmtJShort(it.plannedDate) : ''), ci: seriesById(it.series).ci })),
  });
  if (!v) return;
  const it = itemById(v);
  it.plannedDate = iso;
  touch(it);
  toast('«' + it.title + '» برای ' + fmtJShort(iso) + ' برنامه‌ریزی شد');
  rerender();
}

/* ---------- تحلیل ---------- */
const _an = { m: 'followRate', b: 'latest', c: '0', d: 'series' };

function insightText(ins, mid) {
  const m = METRICS[mid];
  return 'در «' + DIMS[ins.dk].name + '»، میانه‌ی ' + m.name + ' برای «' + ins.top.label + '» ' + fmtMetric(mid, ins.top.med) +
    ' بوده و برای «' + ins.bot.label + '» ' + fmtMetric(mid, ins.bot.med) + ' (' + faNum(ins.top.n) + ' و ' + faNum(ins.bot.n) + ' پست).';
}

function viewAnalysis(q) {
  for (const k of ['m', 'b', 'c', 'd']) if (q[k] != null) _an[k] = q[k];
  const mid = METRICS[_an.m] ? _an.m : 'followRate';
  const m = METRICS[mid];
  const basis = m.lead ? 'latest' : _an.b;
  const dim = DIMS[_an.d] ? _an.d : 'series';
  const pool = analysisPool(_an.c === '1');
  const vals = pool.map((it) => ({ it, v: metricFor(it, mid, basis).value })).filter((x) => x.v != null);
  const med = median(vals.map((x) => x.v));
  let ranked = [];
  let ins = [];

  let h = '<div class="chips scroll">' + METRIC_ORDER.map((id) => '<button type="button" class="chip' + (id === mid ? ' on' : '') + '" data-m="' + id + '">' + METRICS[id].name + '</button>').join('') + '</div>';
  if (!m.lead) {
    h += segHtml('b', [{ value: 'latest', label: 'آخرین ثبت' }, { value: '24', label: '۲۴ ساعت' }, { value: '72', label: '۷۲ ساعت' }, { value: '168', label: '۷ روز' }, { value: '720', label: '۳۰ روز' }], basis);
  }
  h += '<label class="switch"><input type="checkbox" data-collab' + (_an.c === '1' ? ' checked' : '') + '><span class="sw"></span><span>پست‌های کولب هم حساب بشن</span></label>';
  h += '<div class="def"><b>' + m.name + '</b><p>' + m.desc + '</p><span class="muted small">' + faNum(vals.length) + ' از ' + faNum(pool.length) + ' پست این داده رو دارن' +
    (med != null ? '؛ میانه‌ی پیج: <b>' + fmtMetric(mid, med) + '</b>' : '') + '</span>' +
    (!m.lead && basis !== 'latest' ? '<span class="muted small">فقط پست‌هایی که آمار ' + checkpointName(Number(basis)) + ' دارن مقایسه می‌شن؛ این‌طوری پست‌های قدیمی و جدید منصفانه کنار هم قرار می‌گیرن.</span>' : '') + '</div>';

  if (!vals.length) {
    h += emptyHtml('chart', 'هنوز داده‌ای برای «' + m.name + '» نیست', m.lead ? 'دایرکت‌ها و نوبت‌ها رو در «قیف بیمار» ثبت کن و بگو از کدوم پست اومدن.' : 'برای این شاخص لازمه این‌ها ثبت بشن: ' + esc(m.need) + '.');
  } else {
    const recent = vals.slice(-24);
    h += '<section class="sec">' + secHead('روند', '<span class="muted small">' + (recent.length < vals.length ? faNum(recent.length) + ' پست آخر، ' : '') + 'به ترتیب انتشار</span>') +
      '<div class="card">' + trendHtml(recent.map((x) => ({ id: x.it.id, label: x.it.title, v: x.v, ci: seriesById(x.it.series).ci })), mid, med) +
      seriesLegend(recent.map((x) => x.it.series)) + '</div></section>';

    const rows = groupCompare(pool, mid, basis, dim);
    h += '<section class="sec">' + secHead('مقایسه بر اساس') +
      '<div class="chips scroll">' + DIM_ORDER.map((k) => '<button type="button" class="chip' + (k === dim ? ' on' : '') + '" data-d="' + k + '">' + DIMS[k].name + '</button>').join('') + '</div>' +
      (rows.length ? '<div class="card">' + gcHtml(rows, mid) + (dim !== 'series' ? seriesLegend(rows.reduce((a, r) => a.concat(r.pts.map((p) => p.it.series)), [])) : '') + '</div>'
        : '<p class="muted small card">هیچ پستی «' + DIMS[dim].name + '» ثبت‌شده نداره. توی صفحه‌ی هر پست، بخش مشخصات رو کامل کن.</p>') + '</section>';

    ins = m.lead ? [] : autoInsights(pool, mid, basis);
    if (ins.length) {
      h += '<section class="sec">' + secHead('چیزهایی که به چشم میاد') + '<div class="cards">' + ins.map((x, i) =>
        '<div class="insight">' + ic('spark') + '<div><p>' + esc(insightText(x, mid)) + '</p><button type="button" class="link" data-hyp="' + i + '">ثبت به‌عنوان فرضیه</button></div></div>').join('') +
        (vals.length < 12 ? '<p class="muted small">تعداد پست‌ها هنوز کمه. این‌ها رو فرضیه بدون و با ترایل امتحانشون کن.</p>' : '') + '</div></section>';
    }
    h += '<button type="button" class="row card-row" data-askai><span class="ric gold">' + ic('spark') + '</span><span class="rt"><b>تحلیل عمیق‌تر از Claude</b><span>درباره‌ی «' + esc(m.name) + '» بر اساس «' + esc(DIMS[dim].name) + '» بپرس</span></span>' + ic('chevL') + '</button>';

    ranked = vals.slice().sort((a, b) => m.better * (b.v - a.v));
    h += '<section class="sec">' + secHead('رتبه‌بندی', '<span class="muted small">' + (m.better > 0 ? 'از بیشترین' : 'از کمترین') + '</span>') + '<div class="list rank">' +
      ranked.slice(0, 10).map((x, i) => '<button type="button" class="row" data-go="#/item/' + x.it.id + '"><span class="rank-n">' + faNum(i + 1) + '</span><span class="rt"><b>' + esc(x.it.title) + '</b><span>' + seriesTag(x.it.series) + (isCollab(x.it) ? badgeHtml('کولب') : '') + '</span></span><span class="rank-v">' + fmtMetric(mid, x.v) + '</span></button>').join('') + '</div>' +
      (ranked.length > 10 ? '<button type="button" class="link" data-all>نمایش همه‌ی ' + faNum(ranked.length) + ' پست</button>' : '') + '</section>';
  }
  const missing = pool.filter((it) => metricFor(it, mid, basis).value == null);
  if (missing.length && !m.lead) {
    h += '<button type="button" class="row card-row" data-missing><span class="ric">' + ic('info') + '</span><span class="rt"><b>' + faNum(missing.length) + ' پست این داده رو ندارن</b><span>لازمه: ' + esc(m.need) + (basis !== 'latest' ? '، در مقطع ' + checkpointName(Number(basis)) : '') + '</span></span>' + ic('chevL') + '</button>';
  }
  return {
    title: 'تحلیل',
    tab: 'analysis',
    html: h,
    mount: (root) => {
      root.addEventListener('change', (e) => {
        if (e.target.matches('[data-collab]')) setQuery({ c: e.target.checked ? '1' : '0' });
      });
      root.addEventListener('click', async (e) => {
        const mm = e.target.closest('[data-m]');
        if (mm) { setQuery({ m: mm.dataset.m }); return; }
        const seg = e.target.closest('[data-segv]');
        if (seg) { setQuery({ b: seg.dataset.segv }); return; }
        const dd = e.target.closest('[data-d]');
        if (dd) { setQuery({ d: dd.dataset.d }); return; }
        if (e.target.closest('[data-askai]')) {
          askClaudeSheet({ text: 'درباره‌ی «' + m.name + '» (' + (basis === 'latest' ? 'آخرین ثبت' : checkpointName(Number(basis))) + ') و مقایسه بر اساس «' + DIMS[dim].name + '»: چه الگویی می‌بینی، چقدر قابل اتکاست و برای بالا بردنش چی بسازم؟' });
          return;
        }
        const hy = e.target.closest('[data-hyp]');
        if (hy) {
          const x = ins[+hy.dataset.hyp];
          const ids = x.top.pts.concat(x.bot.pts).map((p) => p.it.id);
          learningSheet({ text: insightText(x, mid), status: 'hyp', itemIds: ids.slice(0, 8) });
          return;
        }
        if (e.target.closest('[data-all]')) {
          const v = await pickOne({ title: 'همه‌ی پست‌ها: ' + m.name, options: ranked.map((x, i) => ({ value: x.it.id, label: faNum(i + 1) + '. ' + x.it.title, sub: fmtMetric(mid, x.v), ci: seriesById(x.it.series).ci })) });
          if (v) go('#/item/' + v);
          return;
        }
        if (e.target.closest('[data-missing]')) {
          const v = await pickOne({ title: 'پست‌های بدون «' + m.name + '»', options: missing.map((it) => ({ value: it.id, label: it.title, sub: it.snapshots.length ? faNum(it.snapshots.length) + ' ثبت آمار' : 'بدون آمار', ci: seriesById(it.series).ci })) });
          if (v) go('#/item/' + v + '?tab=stats');
        }
      });
    },
  };
}

/* ---------- قیف بیمار ---------- */
function leadRowHtml(l) {
  const it = l.itemId ? itemById(l.itemId) : null;
  const sub = [l.center, it ? '«' + it.title + '»' : 'پست نامشخص', l.channel].filter(Boolean).map(esc).join('، ');
  return '<button type="button" class="row" data-lead="' + l.id + '"><span class="ric lead-' + l.type + '">' + ic(l.type === 'dm' ? 'msg' : l.type === 'visit' ? 'userPlus' : 'calendar') + '</span>' +
    '<span class="rt"><b>' + nameOf(LEAD_TYPES, l.type) + ((l.count || 1) > 1 ? ' ×' + faNum(l.count) : '') + '</b><span>' + sub + '</span></span><span class="muted small">' + fmtJ(l.date) + '</span></button>';
}

function viewFunnel(q) {
  const all = q.p === 'all';
  const anchor = q.d || todayISO();
  let from = '0000-00-00', to = '9999-99-99', label = 'همه‌ی زمان‌ها';
  if (!all) {
    from = jMonthStartISO(anchor);
    const j = isoToJ(from);
    to = jToISO(j.jy, j.jm, jMonthLength(j.jy, j.jm));
    label = fmtJMonth(from);
  }
  const leads = S.leads.filter((l) => l.date >= from && l.date <= to).sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));
  const tot = { dm: 0, booking: 0, visit: 0, online: 0 };
  leads.forEach((l) => { tot[l.type] = (tot[l.type] || 0) + (l.count || 1); });

  let h = '<p class="privacy">' + ic('shield') + 'فقط عدد و منبع ثبت کن؛ اسم و اطلاعات بیمار اینجا جایی نداره.</p>';
  h += segHtml('p', [{ value: 'month', label: 'ماهانه' }, { value: 'all', label: 'همه‌ی زمان‌ها' }], all ? 'all' : 'month');
  if (!all) {
    h += '<div class="cal-nav"><button type="button" class="icon-btn" data-mnav="-1" aria-label="ماه قبل">' + ic('chevR') + '</button><b>' + label + '</b><button type="button" class="icon-btn" data-mnav="1" aria-label="ماه بعد">' + ic('chevL') + '</button></div>';
  }
  h += '<div class="kpis">' + LEAD_TYPES.map((t) => '<div class="kpi"><div class="kl">' + t.name + '</div><div class="kv">' + fmtNum(tot[t.id] || 0) + '</div></div>').join('') + '</div>';

  if (!leads.length) {
    h += emptyHtml('msg', 'توی این بازه چیزی ثبت نشده', 'هر دایرکت مشاوره، نوبت یا پلن مجازی رو با دکمه‌ی + ثبت کن و بگو از کدوم پست اومده. این‌طوری معلوم می‌شه کدوم محتوا بیمار میاره، نه فقط ویو.');
  } else {
    const conv = tot.dm ? ((tot.booking + tot.online) / tot.dm) * 100 : null;
    h += '<section class="sec">' + secHead('قیف') + '<div class="card">' + hbarsHtml([
      { label: 'دایرکت مشاوره', v: tot.dm },
      { label: 'نوبت و پلن', v: tot.booking + tot.online },
      { label: 'مراجعه', v: tot.visit },
    ]) + (conv != null ? '<p class="muted small mt8">از هر ۱۰۰ دایرکت مشاوره، حدود ' + fmtNum(Math.round(conv)) + ' تا به نوبت یا پلن رسیده.</p>' : '') + '</div></section>';

    const byPost = {};
    leads.forEach((l) => {
      if (!l.itemId || !itemById(l.itemId)) return;
      const e = byPost[l.itemId] || (byPost[l.itemId] = { dm: 0, bk: 0 });
      if (l.type === 'dm') e.dm += l.count || 1;
      else if (l.type === 'booking' || l.type === 'online') e.bk += l.count || 1;
    });
    const postRows = Object.keys(byPost).map((id) => ({ it: itemById(id), dm: byPost[id].dm, bk: byPost[id].bk }))
      .sort((a, b) => (b.bk - a.bk) || (b.dm - a.dm)).slice(0, 8);
    if (postRows.length) {
      h += '<section class="sec">' + secHead('پست‌هایی که بیمار آوردن') + '<div class="list">' + postRows.map((r) =>
        '<button type="button" class="row" data-go="#/item/' + r.it.id + '"><span class="ric">' + ic('target') + '</span><span class="rt"><b>' + esc(r.it.title) + '</b><span>' + faNum(r.dm) + ' دایرکت، ' + faNum(r.bk) + ' نوبت یا پلن</span></span>' + ic('chevL') + '</button>').join('') + '</div></section>';
    }
    const bySeries = {};
    leads.forEach((l) => {
      const it = l.itemId ? itemById(l.itemId) : null;
      if (!it) return;
      bySeries[it.series] = (bySeries[it.series] || 0) + (l.count || 1);
    });
    const sRows = Object.keys(bySeries).map((sid) => ({ label: seriesById(sid).name, v: bySeries[sid], ci: seriesById(sid).ci })).sort((a, b) => b.v - a.v);
    if (sRows.length) h += '<section class="sec">' + secHead('بر اساس سری') + '<div class="card">' + hbarsHtml(sRows) + '</div></section>';
    const groupBy = (key) => {
      const m = {};
      leads.forEach((l) => { const k = l[key] || 'نامشخص'; m[k] = (m[k] || 0) + (l.count || 1); });
      return Object.keys(m).map((k) => ({ label: k, v: m[k] })).sort((a, b) => b.v - a.v);
    };
    h += '<section class="sec">' + secHead('بر اساس مرکز') + '<div class="card">' + hbarsHtml(groupBy('center')) + '</div></section>';
    h += '<section class="sec">' + secHead('راه آشنایی') + '<div class="card">' + hbarsHtml(groupBy('channel')) + '</div></section>';
    h += '<section class="sec">' + secHead('ثبت‌ها') + '<div class="list">' + leads.map(leadRowHtml).join('') + '</div></section>';
  }
  return {
    title: 'قیف بیمار',
    back: '/more',
    tab: 'more',
    html: h,
    fab: { icon: 'plus', label: 'ثبت دایرکت یا نوبت', fn: () => leadSheet() },
    mount: (root) => {
      root.addEventListener('click', (e) => {
        const seg = e.target.closest('[data-segv]');
        if (seg) { setQuery({ p: seg.dataset.segv === 'all' ? 'all' : null }); return; }
        const mn = e.target.closest('[data-mnav]');
        if (mn) { setQuery({ d: addJMonths(anchor, +mn.dataset.mnav) }); return; }
        const r = e.target.closest('[data-lead]');
        if (r) {
          const l = S.leads.find((x) => x.id === r.dataset.lead);
          if (l) leadSheet(null, l);
        }
      });
    },
  };
}

function leadSheet(preset, existing) {
  const d = existing ? JSON.parse(JSON.stringify(existing)) : Object.assign({ id: uid('l'), date: todayISO(), type: 'dm', count: 1, center: null, itemId: null, channel: null, note: '' }, preset || {});
  const L = S.settings.lists;
  const postLabel = () => {
    const it = d.itemId ? itemById(d.itemId) : null;
    return it ? esc(it.title) : 'نامشخص';
  };
  const body =
    fieldHtml('چی بود؟', chipsHtml('type', idOptions(LEAD_TYPES), d.type, { clearable: false })) +
    '<div class="grid2">' + fieldHtml('تعداد', '<div class="stepper"><button type="button" data-step="-1" aria-label="کمتر">−</button><b data-cnt>' + faNum(d.count) + '</b><button type="button" data-step="1" aria-label="بیشتر">+</button></div>') +
    fieldHtml('تاریخ', '<button type="button" class="input date-btn" data-ld>' + ic('calendar') + '<span>' + fmtJShort(d.date) + '</span></button>') + '</div>' +
    fieldHtml('از کدوم پست؟', '<button type="button" class="input date-btn" data-lp>' + ic('layers') + '<span data-lpt>' + postLabel() + '</span></button>', 'اگه بیمار گفت کدوم ویدیو رو دیده، همون رو انتخاب کن.') +
    fieldHtml('مرکز', chipsHtml('center', L.centers, d.center)) +
    fieldHtml('راه آشنایی', chipsHtml('channel', L.channels, d.channel)) +
    fieldHtml('یادداشت', inputHtml('note', d.note, { ph: 'بدون اسم و اطلاعات بیمار' })) +
    '<div class="sheet-actions"><button type="button" class="btn primary" data-save>' + (existing ? 'ذخیره' : 'ثبت') + '</button>' +
    (existing ? '<button type="button" class="btn danger" data-del>حذف</button>' : '<button type="button" class="btn ghost" data-sclose>انصراف</button>') + '</div>';
  openSheet({
    title: existing ? 'ویرایش' : 'دایرکت یا نوبت',
    body,
    onMount: (b) => {
      bindForm(b, d);
      b.addEventListener('click', async (e) => {
        const st = e.target.closest('[data-step]');
        if (st) {
          d.count = Math.max(1, (d.count || 1) + +st.dataset.step);
          b.querySelector('[data-cnt]').textContent = faNum(d.count);
          return;
        }
        if (e.target.closest('[data-ld]')) {
          const r = await pickDate({ title: 'تاریخ', date: d.date });
          if (r) { d.date = r.date; b.querySelector('[data-ld] span').textContent = fmtJShort(d.date); }
          return;
        }
        if (e.target.closest('[data-lp]')) {
          const pubs = publishedChrono().reverse();
          const v = await pickOne({
            title: 'از کدوم پست؟',
            value: d.itemId || '__none',
            options: [{ value: '__none', label: 'نامشخص' }].concat(pubs.map((it) => ({ value: it.id, label: it.title, sub: it.publishDate ? fmtJ(it.publishDate) : '', ci: seriesById(it.series).ci }))),
          });
          if (v !== undefined) {
            d.itemId = v === '__none' ? null : v;
            b.querySelector('[data-lpt]').innerHTML = postLabel();
          }
          return;
        }
        if (e.target.closest('[data-save]')) {
          const now = new Date().toISOString();
          d.updatedAt = now;
          if (existing) Object.assign(existing, d);
          else { d.createdAt = now; S.leads.push(d); }
          invalidateLeads();
          save();
          closeSheet(() => { toast(existing ? 'ذخیره شد' : 'ثبت شد'); rerender(); });
          return;
        }
        if (e.target.closest('[data-del]')) {
          S.leads = S.leads.filter((x) => x.id !== existing.id);
          markDeleted(existing.id);
          invalidateLeads();
          save();
          closeSheet(() => { toast('حذف شد'); rerender(); });
        }
      });
    },
  });
}

/* ---------- دفترچه‌ی درس‌ها ---------- */
function learningCardHtml(l) {
  const st = L_STATUS.find((s) => s.id === l.status) || L_STATUS[0];
  const links = (l.itemIds || []).map(itemById).filter(Boolean)
    .map((it) => '<button type="button" class="lk" data-go="#/item/' + it.id + '"><span class="sdot" style="' + seriesVar(it.series) + '"></span>' + esc(it.title) + '</button>').join('');
  return '<article class="lcard" tabindex="0" role="button" data-act="editLearning" data-lid="' + l.id + '">' +
    '<div class="lc-top">' + badgeHtml(st.name, 'st-' + st.id) + (l.category ? '<span class="muted small">' + esc(l.category) + '</span>' : '') + '<span class="muted small lc-date">' + fmtJ(l.date) + '</span></div>' +
    '<p>' + esc(l.text) + '</p>' + (links ? '<div class="lk-row">' + links + '</div>' : '') + '</article>';
}

function viewLearnings(q) {
  const f = q.f || 'all';
  const counts = {};
  S.learnings.forEach((l) => { counts[l.status] = (counts[l.status] || 0) + 1; });
  const list = S.learnings.filter((l) => f === 'all' || l.status === f).sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || ''));
  const chips = '<div class="chips scroll"><button type="button" class="chip' + (f === 'all' ? ' on' : '') + '" data-f="all">همه ' + faNum(S.learnings.length) + '</button>' +
    L_STATUS.map((s) => '<button type="button" class="chip' + (f === s.id ? ' on' : '') + '" data-f="' + s.id + '">' + s.name + ' ' + faNum(counts[s.id] || 0) + '</button>').join('') + '</div>';
  const html = '<p class="muted small">چیزهایی که از پست‌ها فهمیدی، تا دوباره یادشون نگیری. فرضیه‌ها رو با ترایل تست کن و بعد وضعیتشون رو عوض کن.</p>' + chips +
    (list.length ? '<div class="cards">' + list.map(learningCardHtml).join('') + '</div>' : emptyHtml('book', 'دفترچه خالیه', 'بعد از ارزیابی هر پست، یک خط بنویس که چی جواب داد و چی نداد.'));
  return {
    title: 'دفترچه‌ی درس‌ها',
    back: '/more',
    tab: 'more',
    html,
    fab: { icon: 'plus', label: 'درس جدید', fn: () => learningSheet() },
    mount: (root) => {
      root.addEventListener('click', (e) => {
        const c = e.target.closest('[data-f]');
        if (c) { setQuery({ f: c.dataset.f === 'all' ? null : c.dataset.f }); return; }
        const a = actEl(e);
        if (a && a.dataset.act === 'editLearning') {
          const l = S.learnings.find((x) => x.id === a.dataset.lid);
          if (l) learningSheet(null, l);
        }
      });
    },
  };
}

function learningSheet(preset, existing) {
  const d = existing ? JSON.parse(JSON.stringify(existing)) : Object.assign({ id: uid('e'), text: '', status: 'hyp', category: null, itemIds: [], date: todayISO() }, preset || {});
  const linkedHtml = () => (d.itemIds.length ? d.itemIds.map(itemById).filter(Boolean).map((it) => '<span class="lk"><span class="sdot" style="' + seriesVar(it.series) + '"></span>' + esc(it.title) + '</span>').join('') : '<span class="muted small">پستی وصل نیست</span>');
  openSheet({
    title: existing ? 'ویرایش درس' : 'درس جدید',
    body:
      fieldHtml('چی فهمیدی؟', taHtml('text', d.text, { rows: 3, ph: 'مثلاً: سلفی‌های بلند اول‌شخص بیشترین تبدیل به فالوور رو دارن', af: !existing })) +
      fieldHtml('وضعیت', chipsHtml('status', idOptions(L_STATUS), d.status, { clearable: false })) +
      fieldHtml('دسته', chipsHtml('category', S.settings.lists.lcats, d.category)) +
      fieldHtml('پست‌های مرتبط', '<div class="lk-row" data-linked>' + linkedHtml() + '</div><button type="button" class="btn sm mt8" data-links>' + ic('layers') + 'انتخاب پست‌ها</button>') +
      '<div class="sheet-actions"><button type="button" class="btn primary" data-save>' + (existing ? 'ذخیره' : 'ثبت درس') + '</button>' +
      (existing ? '<button type="button" class="btn danger" data-del>حذف</button>' : '') + '</div>',
    onMount: (b) => {
      bindForm(b, d);
      b.addEventListener('click', async (e) => {
        if (e.target.closest('[data-links]')) {
          const items = activeItems().slice().sort((x, y) => pubKey(y) - pubKey(x));
          const v = await pickMany({ title: 'پست‌های مرتبط', values: d.itemIds, options: items.map((it) => ({ value: it.id, label: it.title, sub: isPublished(it) ? 'منتشرشده' : stageName(it.stage), ci: seriesById(it.series).ci })) });
          if (v) { d.itemIds = v; b.querySelector('[data-linked]').innerHTML = linkedHtml(); }
          return;
        }
        if (e.target.closest('[data-save]')) {
          d.text = (d.text || '').trim();
          if (!d.text) { toast('متن درس رو بنویس'); return; }
          const now = new Date().toISOString();
          d.updatedAt = now;
          if (existing) Object.assign(existing, d);
          else { d.createdAt = now; S.learnings.push(d); }
          save();
          closeSheet(() => { toast(existing ? 'ذخیره شد' : 'به دفترچه اضافه شد'); rerender(); });
          return;
        }
        if (e.target.closest('[data-del]')) {
          S.learnings = S.learnings.filter((x) => x.id !== existing.id);
          markDeleted(existing.id);
          save();
          closeSheet(() => { toast('حذف شد'); rerender(); });
        }
      });
    },
  });
}

/* ---------- بانک هوک و CTA ---------- */
function snippetCardHtml(s) {
  const it = s.itemId ? itemById(s.itemId) : null;
  return '<article class="scard' + (s.used ? ' used' : '') + '"><p>' + esc(s.text) + '</p><div class="sc-foot">' +
    (s.series ? seriesTag(s.series) : '') + (s.used ? badgeHtml('استفاده شده') : '') +
    (s.result === 'good' ? badgeHtml('جواب داد', 'good') : s.result === 'bad' ? badgeHtml('جواب نداد', 'bad') : '') +
    (it ? '<button type="button" class="lk" data-go="#/item/' + it.id + '">' + esc(it.title) + '</button>' : '') +
    '<span class="sc-actions"><button type="button" class="icon-btn sm" data-copy="' + s.id + '" aria-label="کپی">' + ic('copy') + '</button>' +
    '<button type="button" class="icon-btn sm" data-edit="' + s.id + '" aria-label="ویرایش">' + ic('pencil') + '</button></span></div></article>';
}

function viewSnippets(q) {
  const k = SNIP_KINDS.some((x) => x.id === q.k) ? q.k : 'hook';
  const u = q.u || 'all';
  const counts = {};
  S.snippets.forEach((s) => { counts[s.kind] = (counts[s.kind] || 0) + 1; });
  const list = S.snippets.filter((s) => s.kind === k && (u === 'all' || (u === 'used' ? s.used : !s.used)))
    .sort((a, b) => (a.used ? 1 : 0) - (b.used ? 1 : 0) || (b.createdAt || '').localeCompare(a.createdAt || ''));
  const html =
    segHtml('k', SNIP_KINDS.map((x) => ({ value: x.id, label: x.name, count: counts[x.id] || 0 })), k) +
    '<div class="chips scroll">' + [['all', 'همه'], ['unused', 'استفاده‌نشده'], ['used', 'استفاده‌شده']].map((x) => '<button type="button" class="chip' + (u === x[0] ? ' on' : '') + '" data-u="' + x[0] + '">' + x[1] + '</button>').join('') + '</div>' +
    (list.length ? '<div class="cards">' + list.map(snippetCardHtml).join('') + '</div>'
      : emptyHtml('quote', 'چیزی اینجا نیست', 'هوک‌ها و CTAهایی که Claude برات می‌سازه رو یک‌جا وارد کن (هر خط یکی) و هر کدوم استفاده شد، علامتش بزن.'));
  return {
    title: 'بانک هوک و CTA',
    back: '/more',
    tab: 'more',
    html,
    fab: { icon: 'plus', label: 'افزودن', fn: () => snippetSheet({ kind: k }) },
    mount: (root) => {
      root.addEventListener('click', (e) => {
        const seg = e.target.closest('[data-segv]');
        if (seg) { setQuery({ k: seg.dataset.segv, u: null }); return; }
        const uu = e.target.closest('[data-u]');
        if (uu) { setQuery({ u: uu.dataset.u === 'all' ? null : uu.dataset.u }); return; }
        const c = e.target.closest('[data-copy]');
        if (c) {
          const s = S.snippets.find((x) => x.id === c.dataset.copy);
          copyText(s.text);
          return;
        }
        const ed = e.target.closest('[data-edit]');
        if (ed) snippetSheet(null, S.snippets.find((x) => x.id === ed.dataset.edit));
      });
    },
  };
}

function snippetSheet(preset, existing) {
  const d = existing ? JSON.parse(JSON.stringify(existing)) : Object.assign({ id: uid('n'), kind: 'hook', text: '', series: null, itemId: null, used: false, result: null }, preset || {});
  const RESULTS = [{ id: 'good', name: 'جواب داد' }, { id: 'bad', name: 'جواب نداد' }];
  openSheet({
    title: existing ? 'ویرایش' : 'افزودن به بانک',
    body:
      fieldHtml('نوع', chipsHtml('kind', idOptions(SNIP_KINDS), d.kind, { clearable: false })) +
      fieldHtml(existing ? 'متن' : 'متن (هر خط یک مورد)', taHtml('text', d.text, { rows: existing ? 3 : 6, af: true, ph: existing ? '' : 'می‌تونی ۳۰ هوکی که Claude داده رو یک‌جا بچسبونی؛ شماره‌ها خودشون حذف می‌شن.' })) +
      fieldHtml('سری', chipsHtml('series', seriesOptions(), d.series)) +
      (existing ? fieldHtml('وضعیت', '<label class="switch"><input type="checkbox" data-bind="used"' + (d.used ? ' checked' : '') + '><span class="sw"></span><span>استفاده شده</span></label>') +
        fieldHtml('نتیجه', chipsHtml('result', idOptions(RESULTS), d.result)) : '') +
      '<div class="sheet-actions"><button type="button" class="btn primary" data-save>' + (existing ? 'ذخیره' : 'افزودن') + '</button>' +
      (existing ? '<button type="button" class="btn danger" data-del>حذف</button>' : '') + '</div>',
    onMount: (b) => {
      bindForm(b, d);
      b.addEventListener('click', (e) => {
        if (e.target.closest('[data-save]')) {
          const now = new Date().toISOString();
          if (existing) {
            d.text = (d.text || '').trim();
            if (!d.text) { toast('متن خالیه'); return; }
            d.updatedAt = now;
            Object.assign(existing, d);
            save();
            closeSheet(() => { toast('ذخیره شد'); rerender(); });
            return;
          }
          const lines = String(d.text || '').split('\n')
            .map((l) => l.replace(/^\s*(?:[0-9۰-۹]+\s*[\.\-\)ـ:]|[-•*])\s*/, '').replace(/^[«"]|[»"]$/g, '').trim())
            .filter(Boolean);
          if (!lines.length) { toast('متن خالیه'); return; }
          const seen = new Set(S.snippets.filter((s) => s.kind === d.kind).map((s) => s.text));
          let n = 0;
          for (const t of lines) {
            if (seen.has(t)) continue;
            seen.add(t);
            S.snippets.push({ id: uid('n'), kind: d.kind, text: t, series: d.series, itemId: d.itemId || null, used: false, result: null, createdAt: now, updatedAt: now });
            n++;
          }
          save();
          closeSheet(() => { toast(faNum(n) + ' مورد اضافه شد'); rerender(); });
          return;
        }
        if (e.target.closest('[data-del]')) {
          S.snippets = S.snippets.filter((x) => x.id !== existing.id);
          markDeleted(existing.id);
          save();
          closeSheet(() => { toast('حذف شد'); rerender(); });
        }
      });
    },
  });
}

/* ---------- بیشتر، پشتیبان‌گیری، راهنما ---------- */
function viewMore() {
  const unread = unreadInbox();
  const igText = IG && IG.fetchedAt ? 'آخرین دریافت: ' + fmtAgoDays(Math.floor((Date.now() - new Date(IG.fetchedAt).getTime()) / DAY_MS)) : 'دریافت خودکار آمار پست‌ها';
  const rows = [
    ['#/claude', 'spark', 'تحلیل‌های Claude', unread ? faNum(unread) + ' تحلیل تازه' : 'سؤال بپرس و پیشنهادها رو اعمال کن', unread],
    ['#/ig', 'camera', 'اینستاگرام', igText],
    ['#/funnel', 'funnel', 'قیف بیمار', 'دایرکت‌ها و نوبت‌هایی که از پست‌ها اومدن'],
    ['#/learnings', 'book', 'دفترچه‌ی درس‌ها', faNum(S.learnings.length) + ' درس و فرضیه'],
    ['#/snippets', 'quote', 'بانک هوک و CTA', faNum(S.snippets.length) + ' مورد'],
    ['#/backup', 'cloud', 'پشتیبان و همگام‌سازی', SYNC ? 'پشتیبان خودکار: ' + syncWhenText() : 'پشتیبان خودکار خاموشه'],
    ['#/settings', 'sliders', 'تنظیمات', 'سری‌ها، فهرست‌ها، چک‌لیست و پرامپت‌ها'],
    ['#/help', 'info', 'راهنما', 'روال پیشنهادی و معنی شاخص‌ها'],
  ];
  const html = '<div class="list">' + rows.map((r) =>
    '<button type="button" class="row" data-go="' + r[0] + '"><span class="ric">' + ic(r[1]) + '</span><span class="rt"><b>' + r[2] + '</b><span>' + esc(r[3]) + '</span></span>' +
    (r[4] ? '<span class="cnt-badge">' + faNum(r[4]) + '</span>' : '') + ic('chevL') + '</button>').join('') + '</div>' +
    '<p class="center muted small mt16">استودیو محتوا، نسخه‌ی ' + faNum(APP_VERSION) + '</p>';
  return { title: 'بیشتر', tab: 'more', html };
}

/* ---------- پشتیبان ---------- */
function backupSheet() {
  openSheet({
    title: 'گرفتن پشتیبان',
    body: '<p class="sheet-text">یک فایل از همه‌ی داده‌ها ساخته می‌شه. بهترین جا برای نگه‌داشتنش Saved Messages تلگرامه.</p><div class="list">' +
      '<button type="button" class="row" data-share><span class="ric">' + ic('share') + '</span><span class="rt"><b>فرستادن به تلگرام یا درایو</b><span>از منوی اشتراک‌گذاری گوشی</span></span></button>' +
      '<button type="button" class="row" data-dl><span class="ric">' + ic('download') + '</span><span class="rt"><b>ذخیره توی گوشی</b><span>پوشه‌ی دانلودها</span></span></button></div>',
    onMount: (b) => {
      b.addEventListener('click', async (e) => {
        if (e.target.closest('[data-share]')) {
          const r = await shareBackup();
          if (r !== 'aborted') { markBackedUp(); closeSheet(() => { toast(r === 'shared' ? 'پشتیبان فرستاده شد' : 'فایل پشتیبان ذخیره شد'); rerender(); }); }
          return;
        }
        if (e.target.closest('[data-dl]')) {
          saveBackupFile();
          markBackedUp();
          closeSheet(() => { toast('فایل پشتیبان ذخیره شد'); rerender(); });
        }
      });
    },
  });
}

function pickImportFile() {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = '.json,.txt,application/json,text/plain';
  inp.addEventListener('change', async () => {
    const file = inp.files && inp.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      let kind = null;
      try { kind = JSON.parse(text).kind; } catch (e) { kind = null; }
      if (kind === 'studio-inbox') {
        const key = importInboxText(text, file.name);
        if (!key) throw new Error('این فایل تحلیل قابل خواندن نیست.');
        toast('تحلیل Claude وارد شد');
        go('#/claude/' + encodeURIComponent(key));
        return;
      }
      importSheet(parseBackup(text));
    } catch (err) {
      toast(err.message || 'فایل خوانده نشد');
    }
  });
  inp.click();
}

function importSheet(data) {
  const n = (k) => (Array.isArray(data[k]) ? data[k].length : 0);
  const snaps = (data.items || []).reduce((a, it) => a + ((it.snapshots || []).length), 0);
  const empty = !S.items.length && !S.leads.length && !S.learnings.length && !S.snippets.length;
  openSheet({
    title: 'وارد کردن فایل',
    body: '<p class="sheet-text">این فایل شامل ' + faNum(n('items')) + ' پست و ایده، ' + faNum(snaps) + ' ثبت آمار، ' + faNum(n('learnings')) + ' درس، ' + faNum(n('snippets')) + ' هوک و CTA و ' + faNum(n('leads')) + ' دایرکت و نوبته.</p>' +
      (empty ? '' : '<p class="sheet-text muted">«ادغام» موارد تازه رو اضافه می‌کنه و هر موردی که توی فایل جدیدتره رو به‌روز می‌کنه. «جایگزینی» همه‌ی داده‌های فعلی رو با فایل عوض می‌کنه' + (SYNC ? '، نسخه‌ی گیت‌هاب هم همین‌طور (نسخه‌های قبلی توی تاریخچه می‌مونن)' : '') + '. در هر دو حالت، یک نسخه از وضعیت فعلی نگه داشته می‌شه که از صفحه‌ی پشتیبان قابل برگشته.</p>') +
      '<div class="sheet-actions">' + (empty ? '<button type="button" class="btn primary" data-replace>وارد کن</button>'
        : '<button type="button" class="btn primary" data-merge>ادغام</button><button type="button" class="btn danger" data-replace>جایگزینی کامل</button>') + '</div>',
    onMount: (b) => {
      b.addEventListener('click', async (e) => {
        if (e.target.closest('[data-merge]')) {
          const r = await mergeAll(data);
          invalidateLeads();
          applyTheme();
          closeSheet(() => { toast(faNum(r.added) + ' مورد اضافه و ' + faNum(r.updated) + ' مورد به‌روز شد'); location.replace('#/'); rerender(); });
          return;
        }
        if (e.target.closest('[data-replace]')) {
          await replaceAll(data);
          invalidateLeads();
          applyTheme();
          requestPersist();
          closeSheet(() => { toast('داده‌ها وارد شدن'); location.replace('#/'); rerender(); });
        }
      });
    },
  });
}

const REPO_NEW_URL = 'https://github.com/new?name=studio-data&visibility=private&description=' + encodeURIComponent('داده‌های استودیو محتوا (خصوصی)');
const TOKEN_NEW_URL = 'https://github.com/settings/personal-access-tokens/new?name=studio-app&description=' + encodeURIComponent('استودیو محتوا: پشتیبان خودکار و اینستاگرام') + '&expires_in=none&contents=write&actions=write&secrets=write';

function inAppBrowserName() {
  const ua = navigator.userAgent || '';
  if (/Telegram/i.test(ua)) return 'تلگرام';
  if (/Instagram/i.test(ua)) return 'اینستاگرام';
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) return 'فیسبوک';
  if (/WhatsApp/i.test(ua)) return 'واتس‌اپ';
  if (/; wv\)/.test(ua)) return 'یک برنامه‌ی دیگه';
  return null;
}

function contextWarnHtml() {
  const n = inAppBrowserName();
  if (!n) return '';
  return '<div class="note danger">' + ic('alert') + '<div><b>این صفحه داخل مرورگر ' + esc(n) + ' باز شده</b><p>داده‌هایی که اینجا ثبت کنی جدا از اپ نصب‌شده‌ان و ممکنه پاک بشن. لینک رو توی کروم باز کن یا از آیکون اپ استفاده کن.</p></div></div>';
}

function syncCardHtml() {
  if (!SYNC) {
    return '<div class="card sync-card off"><div class="card-h"><b>' + ic('cloud') + 'پشتیبان خودکار خاموشه</b></div>' +
      '<p class="muted small">با روشن کردنش، داده‌ها بعد از هر تغییر توی یک ریپوی خصوصی گیت‌هاب ذخیره می‌شن و تاریخچه‌ی همه‌ی نسخه‌ها هم می‌مونه. اگه اپ پاک یا ریست بشه، با کد بازیابی همه‌چیز برمی‌گرده. Claude هم از همین‌جا داده‌ها رو می‌خونه و تحلیل‌هاش رو برمی‌گردونه.</p>' +
      '<button type="button" class="btn primary mt8" data-connect>روشن کردن پشتیبان خودکار</button></div>';
  }
  const err = SYNC.lastError;
  return '<div class="card sync-card ' + (err ? 'err' : 'on') + '"><div class="card-h"><b>' + ic(err ? 'alert' : 'cloud') + (err ? 'پشتیبان خودکار خطا داد' : 'پشتیبان خودکار روشنه') + '</b>' +
    '<span class="muted small" dir="ltr">' + esc(SYNC.owner + '/' + SYNC.repo) + '</span></div>' +
    '<p class="small' + (err ? ' warn-t' : ' muted') + '">' + esc(err || 'آخرین همگام‌سازی: ' + syncWhenText()) + '</p>' +
    '<div class="btn-row"><button type="button" class="btn sm primary" data-syncnow>' + ic('refresh') + 'الان همگام کن</button>' +
    '<button type="button" class="btn sm" data-go="#/sync/history">' + ic('clock') + 'تاریخچه‌ی نسخه‌ها</button>' +
    '<button type="button" class="btn sm" data-recovery>' + ic('shield') + 'کد بازیابی</button>' +
    (err && /توکن/.test(err) ? '<button type="button" class="btn sm" data-connect>توکن تازه</button>' : '') + '</div></div>';
}

function connectSheet(opts) {
  opts = opts || {};
  const d = { input: '', repo: SYNC ? SYNC.repo : DATA_REPO_DEFAULT };
  openSheet({
    title: opts.restore ? 'بازگردانی از گیت‌هاب' : 'روشن کردن پشتیبان خودکار',
    tall: true,
    body: (opts.restore
      ? '<p class="sheet-text">کد بازیابی‌ای که توی تلگرام نگه داشتی رو اینجا بچسبون تا همه‌ی داده‌ها از گیت‌هاب برگردن.</p>'
      : '<p class="sheet-text">یک بار انجام می‌شه. اگه قبلاً ریپو یا توکن رو ساختی، اون قدم رو رد کن.</p><ol class="setup">' +
        igSetupStep(1, 'ساخت ریپوی خصوصی studio-data', '<p>صفحه‌ای که باز می‌شه، مطمئن شو <b>Private</b> انتخاب شده و «Create repository» رو بزن.</p><a class="btn sm" href="' + esc(REPO_NEW_URL) + '" target="_blank" rel="noopener">ساخت ریپو</a>') +
        igSetupStep(2, 'ساخت توکن دسترسی', '<p>دسترسی‌ها از قبل انتخاب شده‌ان. فقط توی «Repository access» گزینه‌ی <b>Only select repositories</b> رو بزن و <b>studio-data</b> رو انتخاب کن؛ بعد پایین صفحه «Generate token» و توکن رو کپی کن.</p><a class="btn sm" href="' + esc(TOKEN_NEW_URL) + '" target="_blank" rel="noopener">ساخت توکن</a>') +
        igSetupStep(3, 'توکن رو اینجا بچسبون', '') + '</ol>') +
      fieldHtml(opts.restore ? 'کد بازیابی یا توکن' : 'توکن یا کد بازیابی', taHtml('input', '', { rows: 3, ph: 'github_pat_… یا studio1.…', attrs: ' dir="ltr" autocomplete="off" autocapitalize="off" spellcheck="false"' })) +
      '<details class="more-fields"><summary>اسم ریپو فرق داره؟</summary>' + fieldHtml('اسم ریپو', inputHtml('repo', d.repo, { attrs: ' dir="ltr" autocapitalize="off"' })) + '</details>' +
      '<p class="sync-err" data-err hidden></p>' +
      '<div class="sheet-actions"><button type="button" class="btn primary" data-go-connect>' + (opts.restore ? 'بازگردانی' : 'اتصال') + '</button><button type="button" class="btn ghost" data-sclose>انصراف</button></div>',
    onMount: (b) => {
      bindForm(b, d);
      const btn = b.querySelector('[data-go-connect]');
      const errEl = b.querySelector('[data-err]');
      btn.addEventListener('click', async () => {
        errEl.hidden = true;
        if (!parseConnectInput(d.input)) {
          errEl.textContent = 'این متن نه توکن گیت‌هابه نه کد بازیابی. توکن با github_pat_ شروع می‌شه و کد بازیابی با studio1.';
          errEl.hidden = false;
          return;
        }
        btn.disabled = true;
        btn.textContent = 'در حال اتصال…';
        try {
          const before = S.items.length;
          await connectSync(d.input, (d.repo || '').trim() || DATA_REPO_DEFAULT);
          const restored = S.items.length - before;
          closeSheet(() => {
            toast(restored > 0 ? faNum(restored) + ' مورد از گیت‌هاب برگشت' : 'پشتیبان خودکار روشن شد');
            rerender();
            if (!parseConnectInput(d.input).owner) recoverySheet(true);
          });
        } catch (e) {
          await disconnectSync();
          errEl.textContent = e.code === 'bad-input' ? 'متن واردشده درست نیست.' : syncErrorText(e);
          errEl.hidden = false;
          btn.disabled = false;
          btn.textContent = opts.restore ? 'بازگردانی' : 'اتصال';
        }
      });
    },
  });
}

function recoverySheet(first) {
  const code = recoveryCode();
  openSheet({
    title: 'کد بازیابی',
    body: (first ? '<p class="sheet-text"><b>پشتیبان خودکار روشن شد.</b> این کد رو همین الان توی Saved Messages تلگرام نگه دار.</p>' : '') +
      '<p class="sheet-text">اگه اپ پاک یا ریست بشه، یا گوشی رو عوض کنی، با این کد همه‌ی داده‌ها برمی‌گردن. کد شامل توکن دسترسیه؛ برای کس دیگه‌ای نفرستش.</p>' +
      '<div class="code-box" dir="ltr">' + esc(code) + '</div>' +
      '<div class="sheet-actions"><button type="button" class="btn primary" data-share>' + ic('share') + 'فرستادن به تلگرام</button><button type="button" class="btn" data-copy>' + ic('copy') + 'کپی</button></div>',
    onMount: (b) => {
      b.addEventListener('click', async (e) => {
        if (e.target.closest('[data-copy]')) { copyText(code, 'کد بازیابی کپی شد'); return; }
        if (e.target.closest('[data-share]')) {
          if (navigator.share) {
            try { await navigator.share({ text: 'کد بازیابی استودیو محتوا:\n' + code }); } catch (err) { /* ignore */ }
          } else copyText(code, 'کد بازیابی کپی شد');
        }
      });
    },
  });
}

function viewBackup() {
  const snaps = S.items.reduce((a, it) => a + it.snapshots.length, 0);
  const html = contextWarnHtml() + syncCardHtml() +
    '<div class="kpis three mt12"><div class="kpi"><div class="kl">پست و ایده</div><div class="kv">' + fmtNum(S.items.length) + '</div></div><div class="kpi"><div class="kl">ثبت آمار</div><div class="kv">' + fmtNum(snaps) + '</div></div><div class="kpi"><div class="kl">آخرین پشتیبان</div><div class="kv small-v">' + fmtAgoDays(daysSinceBackup()) + '</div></div></div>' +
    '<section class="sec">' + secHead('پشتیبان به‌صورت فایل') + '<div class="list">' +
    '<button type="button" class="row" data-share><span class="ric">' + ic('share') + '</span><span class="rt"><b>فرستادن به تلگرام یا درایو</b><span>یک نسخه‌ی جدا از گیت‌هاب</span></span></button>' +
    '<button type="button" class="row" data-dl><span class="ric">' + ic('download') + '</span><span class="rt"><b>ذخیره توی گوشی</b><span>پوشه‌ی دانلودها</span></span></button></div></section>' +
    '<section class="sec">' + secHead('بازگردانی') + '<div class="list">' +
    (SYNC ? '' : '<button type="button" class="row" data-restore><span class="ric">' + ic('cloud') + '</span><span class="rt"><b>بازگردانی از گیت‌هاب</b><span>با کد بازیابی</span></span></button>') +
    '<button type="button" class="row" data-imp><span class="ric">' + ic('upload') + '</span><span class="rt"><b>وارد کردن از فایل</b><span>فایل پشتیبان، فایل اطلاعات اولیه یا فایل تحلیل Claude</span></span></button>' +
    '<button type="button" class="row" data-prev hidden><span class="ric">' + ic('refresh') + '</span><span class="rt"><b>برگرداندن نسخه‌ی قبلی</b><span>وضعیت قبل از آخرین واردکردن، اعمال یا پاک کردن</span></span></button></div></section>' +
    '<section class="sec">' + secHead('حافظه‌ی گوشی') + '<p class="muted small card" data-persist>در حال بررسی…</p></section>' +
    (SYNC ? '<div class="center mt16"><button type="button" class="link danger-t" data-disconnect>قطع پشتیبان خودکار روی این گوشی</button></div>' : '');
  return {
    title: 'پشتیبان و همگام‌سازی',
    back: '/more',
    tab: 'more',
    html,
    mount: async (root) => {
      root.addEventListener('click', async (e) => {
        if (e.target.closest('[data-connect]')) { connectSheet(); return; }
        if (e.target.closest('[data-restore]')) { connectSheet({ restore: true }); return; }
        if (e.target.closest('[data-recovery]')) { recoverySheet(false); return; }
        if (e.target.closest('[data-syncnow]')) {
          toast('در حال همگام‌سازی…');
          const ok = await syncNow({ extras: true, rerender: true });
          toast(ok ? 'همگام شد' : SYNC.lastError || 'همگام نشد');
          rerender();
          return;
        }
        if (e.target.closest('[data-disconnect]')) {
          const ok = await confirmBox({ title: 'پشتیبان خودکار قطع بشه؟', text: 'داده‌های روی گیت‌هاب سر جاشون می‌مونن؛ فقط این گوشی دیگه چیزی نمی‌فرسته. با کد بازیابی دوباره وصل می‌شه.', ok: 'قطع کن', danger: true });
          if (!ok) return;
          await disconnectSync();
          rerender();
          return;
        }
        if (e.target.closest('[data-share]')) {
          const r = await shareBackup();
          if (r !== 'aborted') { markBackedUp(); toast(r === 'shared' ? 'پشتیبان فرستاده شد' : 'فایل پشتیبان ذخیره شد'); rerender(); }
          return;
        }
        if (e.target.closest('[data-dl]')) { saveBackupFile(); markBackedUp(); toast('فایل پشتیبان ذخیره شد'); rerender(); return; }
        if (e.target.closest('[data-imp]')) { pickImportFile(); return; }
        if (e.target.closest('[data-prev]')) {
          const ok = await confirmBox({ title: 'برگرداندن نسخه‌ی قبلی؟', text: 'داده‌های فعلی با نسخه‌ی قبل از آخرین واردکردن، اعمال گروهی یا پاک کردن عوض می‌شن. وضعیت فعلی هم نگه داشته می‌شه.', ok: 'برگردون' });
          if (!ok) return;
          if (await restorePrev()) { invalidateLeads(); applyTheme(); toast('نسخه‌ی قبلی برگشت'); rerender(); }
        }
      });
      if (await hasPrev()) { const p = root.querySelector('[data-prev]'); if (p) p.hidden = false; }
      const el = root.querySelector('[data-persist]');
      try {
        const p = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : null;
        const base = p ? 'ذخیره‌سازی دائمی فعاله: مرورگر داده‌های اپ رو خودسرانه پاک نمی‌کنه.' : 'ذخیره‌سازی دائمی هنوز فعال نشده؛ اگه حافظه‌ی گوشی پر بشه، مرورگر ممکنه داده‌ها رو پاک کنه.';
        const tail = _storageWarn ? ' حافظه‌ی اصلی مرورگر (IndexedDB) باز نشد و داده‌ها جای دیگه‌ای نگه داشته می‌شن.' : '';
        if (el) el.textContent = base + tail + (SYNC ? ' نسخه‌ی اصلی روی گیت‌هاب امنه.' : ' پشتیبان خودکار رو روشن کن.');
      } catch (err) { if (el) el.textContent = 'قابل بررسی نیست.'; }
    },
  };
}

function viewSyncHistory() {
  if (!SYNC) return notFoundView('پشتیبان خودکار وصل نیست.');
  return {
    title: 'تاریخچه‌ی نسخه‌ها',
    back: '/backup',
    tab: 'more',
    html: '<p class="muted small">هر ذخیره‌ی خودکار یک نسخه‌ست. روی یک نسخه بزن تا ببینی چی داخلشه و اگه خواستی برش گردونی.</p><div class="list" data-hist><p class="pad muted small">در حال گرفتن از گیت‌هاب…</p></div>',
    mount: async (root) => {
      const box = root.querySelector('[data-hist]');
      let list = [];
      try {
        list = await ghHistory();
      } catch (e) {
        box.innerHTML = '<p class="pad warn-t small">' + esc(syncErrorText(e)) + '</p>';
        return;
      }
      if (!list.length) { box.innerHTML = '<p class="pad muted small">هنوز نسخه‌ای نیست.</p>'; return; }
      box.innerHTML = list.map((c, i) => {
        const d = c.date ? new Date(c.date) : null;
        return '<button type="button" class="row" data-ver="' + i + '"><span class="ric">' + ic('clock') + '</span><span class="rt"><b>' + (d ? esc(fmtWhen(dateToISO(d), pad2(d.getHours()) + ':' + pad2(d.getMinutes()))) : '') + (i === 0 ? ' (آخرین)' : '') + '</b><span>' + esc(String(c.msg || '').split('\n')[0]) + '</span></span>' + ic('chevL') + '</button>';
      }).join('');
      box.addEventListener('click', async (e) => {
        const r = e.target.closest('[data-ver]');
        if (!r) return;
        const c = list[+r.dataset.ver];
        toast('در حال گرفتن نسخه…');
        let data;
        try {
          const f = await ghRead('state.json', c.sha);
          data = parseBackup(f.text);
        } catch (err) {
          toast(err.message || syncErrorText(err));
          return;
        }
        importSheet(data);
      });
    },
  };
}

/* ---------- راهنما ---------- */
function viewHelp() {
  const metricRows = ['followRate', 'saveRate', 'shareRate', 'avgWatch', 'retention', 'skipRate', 'profileRate', 'nonFollower']
    .map((mid) => '<div class="defrow"><b>' + METRICS[mid].name + '</b><span>' + METRICS[mid].desc + '</span></div>').join('');
  const html =
    '<section class="sec">' + secHead('روال پیشنهادی') + '<ol class="steps">' +
    '<li><b>ایده رو همون لحظه ثبت کن.</b> دکمه‌ی + پایین صفحه. منبع (سؤال بیمار، گروه تلگرام، کامنت) و محل ضبط رو هم بزن تا سر شیفت بدونی چی رو می‌تونی بگیری.</li>' +
    '<li><b>تولید رو مرحله‌به‌مرحله جلو ببر.</b> نوار بالای هر پست: سناریو، ضبط، ادیت، آماده. هوک، متن نگهداشت، سناریو، کپشن و منابع داخل همون پست. پرامپت‌های آماده‌ی Claude توی بخش مشخصات و کپشن هست.</li>' +
    '<li><b>قبل از انتشار، چک‌لیست.</b> قواعد خودت؛ از تنظیمات قابل تغییره.</li>' +
    '<li><b>«منتشر شد» رو بزن و ساعتش رو ثبت کن.</b> از این لحظه یادآور آمار ۲۴ و ۷۲ ساعته و ۷ و ۳۰ روزه روی صفحه‌ی خانه میاد.</li>' +
    '<li><b>آمار رو از Insights وارد کن.</b> درصدها یا تعدادها، هر کدوم که اینستاگرام نشون داد. ریچ یعنی Accounts reached.</li>' +
    '<li><b>بیمارها رو ثبت کن.</b> هر دایرکت مشاوره یا نوبت، با اسم پستی که دیده. فقط عدد، بدون اطلاعات بیمار.</li>' +
    '<li><b>هفته‌ای یک بار تحلیل و پشتیبان.</b> نتیجه‌ها رو به‌عنوان فرضیه توی دفترچه ثبت کن و با ترایل تست کن.</li></ol></section>' +
    '<section class="sec">' + secHead('معنی شاخص‌ها') + '<div class="card defs">' + metricRows + '</div></section>' +
    '<section class="sec">' + secHead('چند نکته') + '<div class="card"><ul class="tips">' +
    '<li>عددها رو با کیبورد فارسی یا انگلیسی بنویس؛ فرقی نداره.</li>' +
    '<li>توی تحلیل، «آمار ۷۲ ساعته» رو انتخاب کن تا پست‌های تازه و قدیمی منصفانه مقایسه بشن.</li>' +
    '<li>پست‌های کولب کلینیک به‌طور پیش‌فرض از تحلیل بیرون‌ان، چون ویوشون از پیج کلینیک میاد.</li>' +
    '<li>برای نسخه‌ی دوم یک ترایل، از منوی سه‌نقطه‌ی پست «تکثیر» رو بزن.</li>' +
    '<li>اپ بعد از نصب بدون اینترنت هم کار می‌کنه.</li></ul></div></section>';
  return { title: 'راهنما', back: '/more', tab: 'more', html };
}

/* ---------- تنظیمات ---------- */
const CHECKPOINT_CHOICES = [[24, '۲۴ ساعت'], [48, '۴۸ ساعت'], [72, '۷۲ ساعت'], [168, '۷ روز'], [336, '۱۴ روز'], [720, '۳۰ روز']];

function viewSettings() {
  const st = S.settings;
  const listRows = Object.keys(LIST_META).map((k) =>
    '<button type="button" class="row" data-go="#/settings/list/' + k + '"><span class="rt"><b>' + LIST_META[k].name + '</b><span>' + esc((st.lists[k] || []).slice(0, 4).join('، ')) + ((st.lists[k] || []).length > 4 ? '…' : '') + '</span></span>' + ic('chevL') + '</button>').join('');
  const html =
    '<section class="sec">' + secHead('ظاهر') + segHtml('theme', [{ value: 'auto', label: 'مثل گوشی' }, { value: 'light', label: 'روشن' }, { value: 'dark', label: 'تیره' }], st.theme) + '</section>' +
    '<section class="sec">' + secHead('محتوا') + '<div class="list">' +
    '<button type="button" class="row" data-go="#/settings/series"><span class="ric">' + ic('palette') + '</span><span class="rt"><b>سری‌ها</b><span>' + esc(st.series.map((s) => s.short || s.name).join('، ')) + '</span></span>' + ic('chevL') + '</button>' +
    '<button type="button" class="row" data-go="#/settings/checklist"><span class="ric">' + ic('checks') + '</span><span class="rt"><b>چک‌لیست قبل از انتشار</b><span>' + faNum(st.checklist.length) + ' قاعده</span></span>' + ic('chevL') + '</button>' +
    '<button type="button" class="row" data-go="#/settings/prompts"><span class="ric">' + ic('spark') + '</span><span class="rt"><b>پرامپت‌ها</b><span>قالب‌های ایده، هوک، CTA، کپشن و سناریو</span></span>' + ic('chevL') + '</button></div></section>' +
    '<section class="sec">' + secHead('فهرست‌ها') + '<div class="list">' + listRows + '</div></section>' +
    '<section class="sec">' + secHead('آمار') +
    fieldHtml('مقطع‌های یادآور ثبت آمار', '<div class="chips" data-cps>' + CHECKPOINT_CHOICES.map((c) => '<button type="button" class="chip' + (st.checkpoints.indexOf(c[0]) >= 0 ? ' on' : '') + '" data-cp="' + c[0] + '">' + c[1] + '</button>').join('') + '</div>') +
    fieldHtml('سرعت حرف زدن (کلمه در دقیقه)', inputHtml('wpm', st.wpm, { num: true }), 'برای تخمین مدت ویدیو از روی متن سناریو. حدود ۱۴۰ برای حرف زدن معمولی.') + '</section>' +
    '<section class="sec">' + secHead('پشتیبان') +
    fieldHtml('یادآور پشتیبان‌گیری', chipsHtml('', [{ value: '3', label: 'هر ۳ روز' }, { value: '7', label: 'هر هفته' }, { value: '14', label: 'هر دو هفته' }, { value: '0', label: 'خاموش' }], String(st.backupDays), { clearable: false })) +
    '<button type="button" class="row card-row" data-go="#/backup"><span class="ric">' + ic('shield') + '</span><span class="rt"><b>پشتیبان‌گیری و بازگردانی</b><span>آخرین پشتیبان: ' + fmtAgoDays(daysSinceBackup()) + '</span></span>' + ic('chevL') + '</button></section>' +
    '<section class="sec">' + secHead('اپ') + '<div class="list">' +
    '<button type="button" class="row" data-upd><span class="ric">' + ic('refresh') + '</span><span class="rt"><b>بررسی نسخه‌ی جدید</b><span>نسخه‌ی فعلی ' + faNum(APP_VERSION) + '</span></span></button>' +
    '<button type="button" class="row danger" data-reset><span class="ric">' + ic('trash') + '</span><span class="rt"><b>پاک کردن همه‌ی داده‌ها</b><span>یک نسخه برای برگشت نگه داشته می‌شه</span></span></button></div></section>';
  return {
    title: 'تنظیمات',
    back: '/more',
    tab: 'more',
    html,
    mount: (root) => {
      bindForm(root, st, (path) => { if (path === 'wpm') save(); });
      root.addEventListener('click', async (e) => {
        const seg = e.target.closest('[data-segv]');
        if (seg) { st.theme = seg.dataset.segv; save(); applyTheme(); rerender(); return; }
        const cp = e.target.closest('[data-cp]');
        if (cp) {
          const v = +cp.dataset.cp;
          const i = st.checkpoints.indexOf(v);
          if (i >= 0) {
            if (st.checkpoints.length === 1) { toast('حداقل یک مقطع لازمه'); return; }
            st.checkpoints.splice(i, 1);
          } else st.checkpoints.push(v);
          st.checkpoints.sort((a, b) => a - b);
          save();
          cp.classList.toggle('on', i < 0);
          return;
        }
        const ch = e.target.closest('[data-chips] [data-value]');
        if (ch) {
          st.backupDays = +ch.dataset.value;
          save();
          $$('[data-chips] [data-value]', root).forEach((x) => x.classList.toggle('on', x === ch));
          return;
        }
        if (e.target.closest('[data-upd]')) { checkForUpdate(); return; }
        if (e.target.closest('[data-reset]')) {
          const ok = await confirmBox({ title: 'همه‌ی داده‌ها پاک بشه؟', text: 'همه‌ی پست‌ها، آمارها، درس‌ها و تنظیمات پاک می‌شن. یک نسخه از وضعیت فعلی نگه داشته می‌شه که از صفحه‌ی پشتیبان قابل برگشته؛ ولی اول یک پشتیبان بگیر.', ok: 'پاک کن', danger: true });
          if (!ok) return;
          await resetAll();
          invalidateLeads();
          applyTheme();
          toast('همه‌ی داده‌ها پاک شد');
          location.replace('#/');
        }
      });
    },
  };
}

/* ---------- سری‌ها ---------- */
function viewSeriesSettings() {
  const used = {};
  S.items.forEach((it) => { used[it.series] = (used[it.series] || 0) + 1; });
  const rows = S.settings.series.map((s) =>
    '<div class="se-row" data-sid="' + s.id + '"><button type="button" class="swatch" style="--sc:var(--s' + s.ci + ')" data-color aria-label="رنگ"></button>' +
    '<div class="se-fields"><input class="input" data-f="name" value="' + esc(s.name) + '" aria-label="اسم سری"><input class="input sm" data-f="short" value="' + esc(s.short || '') + '" aria-label="اسم کوتاه" placeholder="اسم کوتاه"></div>' +
    (s.id === 'other' ? '<span class="icon-btn sm"></span>' : '<button type="button" class="icon-btn sm" data-del aria-label="حذف">' + ic('trash') + '</button>') +
    '<span class="se-n">' + faNum(used[s.id] || 0) + ' پست</span></div>').join('');
  const html = '<p class="muted small">اسم کوتاه توی کارت‌ها و اسم چت سناریو («سناریو | علمی | …») استفاده می‌شه.</p><div class="se-list">' + rows + '</div>' +
    '<button type="button" class="btn block mt12" data-add>' + ic('plus') + 'سری جدید</button>';
  return {
    title: 'سری‌ها',
    back: '/settings',
    tab: 'more',
    html,
    mount: (root) => {
      root.addEventListener('change', (e) => {
        const inp = e.target.closest('[data-f]');
        if (!inp) return;
        const s = S.settings.series.find((x) => x.id === inp.closest('[data-sid]').dataset.sid);
        const v = inp.value.trim();
        if (inp.dataset.f === 'name' && !v) { inp.value = s.name; return; }
        s[inp.dataset.f] = v;
        save();
        toast('ذخیره شد');
      });
      root.addEventListener('click', async (e) => {
        const row = e.target.closest('[data-sid]');
        if (e.target.closest('[data-color]')) {
          const s = S.settings.series.find((x) => x.id === row.dataset.sid);
          const v = await pickOne({ title: 'رنگ سری', value: s.ci, options: Array.from({ length: SERIES_COLORS }, (_, i) => ({ value: i, label: 'رنگ ' + faNum(i + 1), sub: S.settings.series.filter((x) => x.ci === i).map((x) => x.name).join('، '), ci: i })) });
          if (v != null) { s.ci = v; save(); rerender(); }
          return;
        }
        if (e.target.closest('[data-del]')) {
          const s = S.settings.series.find((x) => x.id === row.dataset.sid);
          const n = S.items.filter((it) => it.series === s.id).length;
          const ok = await confirmBox({ title: 'حذف سری «' + s.name + '»؟', text: n ? faNum(n) + ' پست این سری به «سایر» منتقل می‌شن.' : '', ok: 'حذف کن', danger: true });
          if (!ok) return;
          S.items.forEach((it) => { if (it.series === s.id) it.series = 'other'; });
          S.snippets.forEach((x) => { if (x.series === s.id) x.series = 'other'; });
          S.settings.series = S.settings.series.filter((x) => x !== s);
          save();
          rerender();
          return;
        }
        if (e.target.closest('[data-add]')) {
          const usedCi = S.settings.series.map((x) => x.ci);
          let ci = 0;
          while (usedCi.indexOf(ci) >= 0 && ci < SERIES_COLORS - 1) ci++;
          S.settings.series.splice(S.settings.series.length - 1, 0, { id: uid('sr'), name: 'سری جدید', short: 'جدید', ci });
          save();
          rerender();
        }
      });
    },
  };
}

/* ---------- ویرایش فهرست‌ها ---------- */
function listUsage(key, value) {
  let n = 0;
  for (const [coll, field, multi] of LIST_META[key].fields) {
    for (const x of S[coll]) {
      if (multi ? (x[field] || []).indexOf(value) >= 0 : x[field] === value) n++;
    }
  }
  return n;
}

function renameListValue(key, oldV, newV) {
  for (const [coll, field, multi] of LIST_META[key].fields) {
    for (const x of S[coll]) {
      if (multi) x[field] = (x[field] || []).map((v) => (v === oldV ? newV : v)).filter((v) => v != null);
      else if (x[field] === oldV) x[field] = newV;
    }
  }
}

function viewListSettings(key) {
  const meta = LIST_META[key];
  if (!meta) return notFoundView('این فهرست پیدا نشد.');
  const list = S.settings.lists[key] || (S.settings.lists[key] = []);
  const html = '<p class="muted small">تغییر اسم یک مورد، روی همه‌ی جاهایی که استفاده شده هم اعمال می‌شه.</p><div class="le-list">' +
    list.map((v, i) => '<div class="le-row"><input class="input" value="' + esc(v) + '" data-i="' + i + '" aria-label="مورد ' + faNum(i + 1) + '">' +
      '<button type="button" class="icon-btn sm" data-up="' + i + '" aria-label="بالا"' + (i === 0 ? ' disabled' : '') + '>' + ic('arrowUp') + '</button>' +
      '<button type="button" class="icon-btn sm" data-down="' + i + '" aria-label="پایین"' + (i === list.length - 1 ? ' disabled' : '') + '>' + ic('arrowDown') + '</button>' +
      '<button type="button" class="icon-btn sm" data-del="' + i + '" aria-label="حذف">' + ic('trash') + '</button></div>').join('') + '</div>' +
    '<div class="src-add mt12"><input class="input" data-new placeholder="مورد جدید"><button type="button" class="btn sm" data-add>افزودن</button></div>';
  return {
    title: meta.name,
    back: '/settings',
    tab: 'more',
    html,
    mount: (root) => {
      const addNew = () => {
        const inp = root.querySelector('[data-new]');
        const v = inp.value.trim();
        if (!v) return;
        if (list.indexOf(v) >= 0) { toast('این مورد هست'); return; }
        list.push(v);
        save();
        rerender();
      };
      root.addEventListener('keydown', (e) => { if (e.target.matches('[data-new]') && e.key === 'Enter') { e.preventDefault(); addNew(); } });
      root.addEventListener('change', (e) => {
        const inp = e.target.closest('[data-i]');
        if (!inp) return;
        const i = +inp.dataset.i;
        const oldV = list[i];
        const v = inp.value.trim();
        if (!v || v === oldV) { inp.value = oldV; return; }
        if (list.indexOf(v) >= 0) { toast('این مورد هست'); inp.value = oldV; return; }
        list[i] = v;
        renameListValue(key, oldV, v);
        save();
        toast('ذخیره شد');
      });
      root.addEventListener('click', async (e) => {
        if (e.target.closest('[data-add]')) { addNew(); return; }
        const up = e.target.closest('[data-up]');
        const down = e.target.closest('[data-down]');
        if (up || down) {
          const i = +(up || down).dataset[up ? 'up' : 'down'];
          const j = up ? i - 1 : i + 1;
          if (j < 0 || j >= list.length) return;
          const t = list[i]; list[i] = list[j]; list[j] = t;
          save();
          rerender();
          return;
        }
        const del = e.target.closest('[data-del]');
        if (del) {
          const i = +del.dataset.del;
          const n = listUsage(key, list[i]);
          if (n) {
            const ok = await confirmBox({ title: 'حذف «' + list[i] + '»؟', text: faNum(n) + ' مورد از این مقدار استفاده می‌کنن و خالی می‌شن.', ok: 'حذف کن', danger: true });
            if (!ok) return;
            renameListValue(key, list[i], null);
          }
          list.splice(i, 1);
          save();
          rerender();
        }
      });
    },
  };
}

/* ---------- چک‌لیست ---------- */
function viewChecklistSettings() {
  const list = S.settings.checklist;
  const html = '<p class="muted small">قواعدی که قبل از انتشار هر پست چک می‌کنی.</p><div class="le-list">' +
    list.map((c, i) => '<div class="le-row"><textarea class="input ta autogrow" rows="1" data-i="' + i + '" aria-label="قاعده ' + faNum(i + 1) + '">' + esc(c.text) + '</textarea>' +
      '<button type="button" class="icon-btn sm" data-up="' + i + '" aria-label="بالا"' + (i === 0 ? ' disabled' : '') + '>' + ic('arrowUp') + '</button>' +
      '<button type="button" class="icon-btn sm" data-down="' + i + '" aria-label="پایین"' + (i === list.length - 1 ? ' disabled' : '') + '>' + ic('arrowDown') + '</button>' +
      '<button type="button" class="icon-btn sm" data-del="' + i + '" aria-label="حذف">' + ic('trash') + '</button></div>').join('') + '</div>' +
    '<div class="src-add mt12"><input class="input" data-new placeholder="قاعده‌ی جدید"><button type="button" class="btn sm" data-add>افزودن</button></div>' +
    '<button type="button" class="link mt16" data-defaults>برگرداندن قواعد پیش‌فرض</button>';
  return {
    title: 'چک‌لیست قبل از انتشار',
    back: '/settings',
    tab: 'more',
    html,
    mount: (root) => {
      root.addEventListener('change', (e) => {
        const inp = e.target.closest('[data-i]');
        if (!inp) return;
        const v = inp.value.trim();
        if (!v) { inp.value = list[+inp.dataset.i].text; return; }
        list[+inp.dataset.i].text = v;
        save();
        toast('ذخیره شد');
      });
      root.addEventListener('click', async (e) => {
        if (e.target.closest('[data-add]')) {
          const inp = root.querySelector('[data-new]');
          const v = inp.value.trim();
          if (!v) return;
          list.push({ id: uid('c'), text: v });
          save();
          rerender();
          return;
        }
        const up = e.target.closest('[data-up]');
        const down = e.target.closest('[data-down]');
        if (up || down) {
          const i = +(up || down).dataset[up ? 'up' : 'down'];
          const j = up ? i - 1 : i + 1;
          if (j < 0 || j >= list.length) return;
          const t = list[i]; list[i] = list[j]; list[j] = t;
          save();
          rerender();
          return;
        }
        const del = e.target.closest('[data-del]');
        if (del) { list.splice(+del.dataset.del, 1); save(); rerender(); return; }
        if (e.target.closest('[data-defaults]')) {
          const ok = await confirmBox({ title: 'قواعد پیش‌فرض برگرده؟', text: 'قواعد فعلی با قواعد اولیه جایگزین می‌شن.', ok: 'برگردون' });
          if (!ok) return;
          S.settings.checklist = DEFAULT_CHECKLIST.map((c) => Object.assign({}, c));
          save();
          rerender();
        }
      });
    },
  };
}

/* ---------- پرامپت‌ها ---------- */
function viewPromptSettings() {
  const st = S.settings;
  const html = '<p class="muted small">جاهای داخل [ ] موقع کپی با اطلاعات پست پر می‌شن. [موضوع] و [پست] از عنوان پست میاد و سه مورد زیر از همین صفحه.</p>' +
    '<section class="sec">' + secHead('درباره‌ی تو') +
    fieldHtml('[حوزه کاری]', taHtml('profile.field', st.profile.field, { rows: 2 })) +
    fieldHtml('[جایگاه]', taHtml('profile.role', st.profile.role, { rows: 2 })) +
    fieldHtml('[مخاطب هدف]', taHtml('profile.audience', st.profile.audience, { rows: 2 })) + '</section>' +
    '<section class="sec">' + secHead('قالب‌ها') +
    Object.keys(DEFAULT_TEMPLATES).map((k) => fieldHtml(TEMPLATE_NAMES[k], taHtml('templates.' + k, st.templates[k], { rows: 5 }))).join('') + '</section>' +
    '<button type="button" class="link" data-defaults>برگرداندن قالب‌های اولیه</button>';
  return {
    title: 'پرامپت‌ها',
    back: '/settings',
    tab: 'more',
    html,
    mount: (root) => {
      bindForm(root, st, () => save());
      root.addEventListener('click', async (e) => {
        if (!e.target.closest('[data-defaults]')) return;
        const ok = await confirmBox({ title: 'قالب‌های اولیه برگرده؟', text: 'تغییرهایی که توی قالب‌ها دادی پاک می‌شه. بخش «درباره‌ی تو» دست نمی‌خوره.', ok: 'برگردون' });
        if (!ok) return;
        st.templates = Object.assign({}, DEFAULT_TEMPLATES);
        save();
        rerender();
      });
    },
  };
}

/* ---------- پشتیبان خودکار و همگام‌سازی با ریپوی خصوصی گیت‌هاب ---------- */
const GH_API = 'https://api.github.com';
const DATA_REPO_DEFAULT = 'studio-data';
const LS_SYNC = IDB_NAME + ':sync';
const SYNC_DELAY = 15000;
const EXTRAS_EVERY = 10 * 60000;

let SYNC = null; // {owner, repo, token, branch, lastSha, lastHash, lastPushAt, lastPullAt, lastExtrasAt, lastError, lastErrorAt, lastForceAt, igSha, igStatusSha, connectedAt}
let _syncState = 'off'; // off | idle | syncing | ok | error | offline
let _syncTimer = null;
let _syncBusy = false;
let _syncAgain = false;

async function loadSyncCfg() {
  let c = null;
  try { c = await kvGet('sync'); } catch (e) { /* ignore */ }
  if (!c) {
    try {
      const v = localStorage.getItem(LS_SYNC);
      if (v) c = JSON.parse(v);
    } catch (e) { /* ignore */ }
  }
  SYNC = c && c.token && c.owner && c.repo ? c : null;
  _syncState = SYNC ? (SYNC.lastError ? 'error' : 'idle') : 'off';
}

async function saveSyncCfg() {
  try {
    if (SYNC) await kvSet('sync', SYNC);
    else if (_db) await idbRun('readwrite', (st) => st.delete('sync'));
  } catch (e) { /* ignore */ }
  try {
    if (SYNC) localStorage.setItem(LS_SYNC, JSON.stringify(SYNC));
    else localStorage.removeItem(LS_SYNC);
  } catch (e) { /* ignore */ }
}

function setSyncState(st) {
  _syncState = st;
  const el = document.querySelector('[data-syncdot]');
  if (el) el.dataset.state = st;
}

/* ---------- ارتباط با API گیت‌هاب ---------- */
function utf8ToB64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function b64ToUtf8(b64) {
  const bin = atob(String(b64).replace(/\s/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function ghError(msg, code, status) {
  const e = new Error(msg);
  e.code = code;
  e.status = status;
  return e;
}

async function gh(method, path, body, opts) {
  opts = opts || {};
  const headers = { Accept: opts.accept || 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  const token = opts.token || (SYNC && SYNC.token);
  if (token) headers.Authorization = 'Bearer ' + token;
  if (body) headers['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetch(GH_API + path, { method, headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
  } catch (e) {
    throw ghError('network', 'network');
  }
  if (res.status === 204) return null;
  const text = await res.text();
  if (opts.raw && res.ok) return text;
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
  if (!res.ok) throw ghError((data && data.message) || 'HTTP ' + res.status, 'http', res.status);
  return data;
}

function repoPath(p) {
  return '/repos/' + encodeURIComponent(SYNC.owner) + '/' + encodeURIComponent(SYNC.repo) + (p || '');
}

function encPath(p) {
  return p.split('/').map(encodeURIComponent).join('/');
}

async function ghStat(path) {
  try {
    const d = await gh('GET', repoPath('/contents/' + encPath(path)));
    return Array.isArray(d) ? null : d;
  } catch (e) {
    if (e.status === 404) return null;
    throw e;
  }
}

async function ghRead(path, ref) {
  const q = ref ? '?ref=' + encodeURIComponent(ref) : '';
  let d;
  try {
    d = await gh('GET', repoPath('/contents/' + encPath(path) + q));
  } catch (e) {
    if (e.status === 404) return null;
    throw e;
  }
  if (!d || Array.isArray(d)) return null;
  let text;
  if (d.encoding === 'base64' && d.content) text = b64ToUtf8(d.content);
  else text = await gh('GET', repoPath('/contents/' + encPath(path) + q), null, { accept: 'application/vnd.github.raw+json', raw: true });
  return { sha: d.sha, text };
}

async function ghWrite(path, text, sha, message) {
  const body = { message, content: utf8ToB64(text) };
  if (sha) body.sha = sha;
  const d = await gh('PUT', repoPath('/contents/' + encPath(path)), body);
  return d && d.content ? d.content.sha : null;
}

async function ghList(dir) {
  try {
    const d = await gh('GET', repoPath('/contents/' + encPath(dir)));
    return Array.isArray(d) ? d : [];
  } catch (e) {
    if (e.status === 404) return [];
    throw e;
  }
}

function syncErrorText(e) {
  if (!e) return 'خطای نامشخص';
  if (e.code === 'network') return 'به گیت‌هاب وصل نشد؛ اینترنت رو چک کن.';
  if (e.code === 'public') return 'این ریپو عمومیه؛ برای داده‌ها باید Private باشه.';
  if (e.code === 'noperm') return 'توکن اجازه‌ی نوشتن توی این ریپو رو نداره.';
  if (e.status === 401) return 'توکن نامعتبره یا منقضی شده؛ یک توکن تازه بساز.';
  if (e.status === 403) return 'گیت‌هاب اجازه نداد؛ دسترسی‌های توکن رو چک کن.';
  if (e.status === 404) return 'ریپو پیدا نشد، یا توکن به این ریپو دسترسی نداره.';
  if (e.status === 409 || e.status === 422) return 'تداخل نسخه‌ها؛ دوباره امتحان می‌شه.';
  return 'خطای گیت‌هاب: ' + (e.message || e.status);
}

/* ---------- چرخه‌ی همگام‌سازی ---------- */
function remotePayload() {
  return JSON.stringify({ app: APP_ID, kind: 'backup', version: 1, appVersion: APP_VERSION, exportedAt: new Date().toISOString(), data: S }, null, 1);
}

function commitMsg(prefix) {
  const snaps = S.items.reduce((a, it) => a + it.snapshots.length, 0);
  return (prefix || 'پشتیبان خودکار') + ': ' + S.items.length + ' پست و ایده، ' + snaps + ' ثبت آمار (نسخه‌ی اپ ' + APP_VERSION + ')';
}

function onStateSaved() {
  if (SYNC) scheduleSync(SYNC_DELAY);
}

function scheduleSync(ms) {
  if (!SYNC) return;
  clearTimeout(_syncTimer);
  _syncTimer = setTimeout(() => { syncNow(); }, ms);
}

// اگر کاربر در حال تایپ است صفحه را دوباره نمی‌سازد
function safeRerender() {
  const a = document.activeElement;
  if (_sheets.length) return;
  if (a && a.matches && a.matches('input, textarea, select') && document.getElementById('main').contains(a)) return;
  rerender();
}

async function syncNow(opts) {
  opts = opts || {};
  if (!SYNC) return false;
  if (_syncBusy) {
    _syncAgain = true;
    return false;
  }
  if (navigator.onLine === false) {
    setSyncState('offline');
    return false;
  }
  clearTimeout(_syncTimer);
  _syncBusy = true;
  setSyncState('syncing');
  let ok = false;
  let changed = false;
  try {
    await flushSave();
    // اول تحلیل‌ها و آمار اینستاگرام، بعد ادغام و ارسال؛ این‌طوری همه در یک دور به گیت‌هاب می‌رسد
    if (opts.extras || Date.now() - (SYNC.lastExtrasAt || 0) > EXTRAS_EVERY) changed = await syncExtras();
    changed = (await syncState(0)) || changed;
    SYNC.lastError = null;
    SYNC.lastErrorAt = null;
    ok = true;
    setSyncState('ok');
  } catch (e) {
    console.warn('sync', e);
    SYNC.lastError = syncErrorText(e);
    SYNC.lastErrorAt = new Date().toISOString();
    setSyncState(e.code === 'network' ? 'offline' : 'error');
  } finally {
    _syncBusy = false;
    await saveSyncCfg();
    if (_syncAgain) {
      _syncAgain = false;
      scheduleSync(3000);
    }
  }
  if (changed || opts.rerender) safeRerender();
  return ok;
}

// برمی‌گرداند که داده‌های روی گوشی عوض شد یا نه
async function syncState(attempt) {
  const stat = await ghStat('state.json');
  try {
    if (S.meta.forcePushAt && S.meta.forcePushAt !== SYNC.lastForceAt) {
      const forceAt = S.meta.forcePushAt;
      SYNC.lastSha = await ghWrite('state.json', remotePayload(), stat ? stat.sha : undefined, commitMsg('جایگزینی کامل'));
      SYNC.lastHash = hashStr(canonicalState(S));
      SYNC.lastForceAt = forceAt;
      afterPush();
      return false;
    }
    let changed = false;
    let baseSha = stat ? stat.sha : undefined;
    if (stat && stat.sha !== SYNC.lastSha) {
      const file = await ghRead('state.json');
      if (file) {
        const remote = migrate(parseBackup(file.text));
        const remoteHash = hashStr(canonicalState(remote));
        if (mergeInto(S, remote)) {
          changed = true;
          invalidateLeads();
          await save(true, true);
        }
        SYNC.lastSha = file.sha;
        SYNC.lastHash = remoteHash;
        baseSha = file.sha;
      }
    }
    const h = hashStr(canonicalState(S));
    if (!stat || h !== SYNC.lastHash) {
      SYNC.lastSha = await ghWrite('state.json', remotePayload(), baseSha, commitMsg());
      SYNC.lastHash = h;
      afterPush();
    }
    SYNC.lastPullAt = new Date().toISOString();
    return changed;
  } catch (e) {
    if ((e.status === 409 || e.status === 422) && attempt < 2) {
      SYNC.lastSha = null;
      return syncState(attempt + 1);
    }
    throw e;
  }
}

function afterPush() {
  const now = new Date().toISOString();
  SYNC.lastPushAt = now;
  S.meta.lastBackupAt = now;
  save(false, true);
}

// ادغام نسخه‌ی گیت‌هاب در داده‌های روی گوشی (بدون عوض شدن اشیای فعلی)
function mergeInto(dst, remote) {
  let changed = false;
  const tomb = dst.tomb || (dst.tomb = {});
  for (const id in remote.tomb || {}) {
    if (!tomb[id] || remote.tomb[id] > tomb[id]) {
      tomb[id] = remote.tomb[id];
      changed = true;
    }
  }
  const cutoff = new Date(Date.now() - 180 * DAY_MS).toISOString();
  for (const id in tomb) if (tomb[id] < cutoff) delete tomb[id];
  const dead = (x) => tomb[x.id] && tomb[x.id] >= (x.updatedAt || '');
  for (const k of COLLS) {
    const arr = dst[k];
    const idx = new Map(arr.map((x, i) => [x.id, i]));
    for (const x of remote[k] || []) {
      const i = idx.get(x.id);
      if (i == null) {
        if (!dead(x)) {
          arr.push(x);
          changed = true;
        }
      } else if ((x.updatedAt || '') > (arr[i].updatedAt || '')) {
        arr[i] = x;
        changed = true;
      }
    }
    if (arr.some(dead)) {
      dst[k] = arr.filter((x) => !dead(x));
      changed = true;
    }
  }
  const rm = remote.meta || {};
  if ((rm.settingsAt || '') > (dst.meta.settingsAt || '')) {
    dst.settings = remote.settings;
    dst.meta.settingsAt = rm.settingsAt;
    _lastSettingsJSON = JSON.stringify(dst.settings);
    changed = true;
  }
  for (const key in remote.inbox || {}) {
    const b = remote.inbox[key];
    const a = dst.inbox[key];
    if (!a) {
      dst.inbox[key] = b;
      changed = true;
      continue;
    }
    const dec = Object.assign({}, b.decisions || {}, a.decisions || {});
    if (Object.keys(dec).length !== Object.keys(a.decisions || {}).length) {
      a.decisions = dec;
      changed = true;
    }
    if (!a.readAt && b.readAt) {
      a.readAt = b.readAt;
      changed = true;
    }
  }
  for (const id of remote.igIgnored || []) {
    if (dst.igIgnored.indexOf(id) < 0) {
      dst.igIgnored.push(id);
      changed = true;
    }
  }
  if ((rm.lastBackupAt || '') > (dst.meta.lastBackupAt || '')) dst.meta.lastBackupAt = rm.lastBackupAt;
  return changed;
}

async function syncExtras() {
  SYNC.lastExtrasAt = Date.now();
  let changed = false;
  let fresh = 0;
  const files = await ghList('inbox');
  for (const f of files) {
    if (f.type !== 'file' || !/\.json$/i.test(f.name)) continue;
    const known = S.inbox[f.name];
    if (known && known.sha === f.sha) continue;
    const file = await ghRead('inbox/' + f.name);
    if (!file) continue;
    const entry = parseInbox(file.text, f.name);
    if (!entry) continue;
    entry.sha = file.sha;
    if (known) {
      entry.decisions = known.decisions || {};
      entry.readAt = known.readAt || null;
      entry.importedAt = known.importedAt || entry.importedAt;
    } else {
      fresh++;
    }
    S.inbox[f.name] = entry;
    markAnswered(entry);
    changed = true;
  }
  const igStat = await ghStat('instagram/media.json');
  if (igStat && igStat.sha !== SYNC.igSha) {
    const file = await ghRead('instagram/media.json');
    if (file) {
      let data = null;
      try { data = JSON.parse(file.text); } catch (e) { data = null; }
      if (data && data.kind === 'studio-instagram') {
        await igSaveCache(data);
        if (igApply(data)) changed = true;
      }
      SYNC.igSha = file.sha;
    }
  }
  const stStat = await ghStat('instagram/status.json');
  if (stStat && stStat.sha !== SYNC.igStatusSha) {
    const file = await ghRead('instagram/status.json');
    if (file) {
      try { IG_STATUS = JSON.parse(file.text); } catch (e) { IG_STATUS = null; }
      try { await kvSet('igStatus', IG_STATUS); } catch (e) { /* ignore */ }
      SYNC.igStatusSha = file.sha;
    }
  }
  if (changed) {
    invalidateLeads();
    await save(true, true);
  }
  if (fresh) toast(fresh === 1 ? 'یک تحلیل تازه از Claude رسید' : faNum(fresh) + ' تحلیل تازه از Claude رسید');
  return changed;
}

/* ---------- اتصال، کد بازیابی، قطع اتصال ---------- */
function recoveryCode() {
  if (!SYNC) return '';
  const json = JSON.stringify({ o: SYNC.owner, r: SYNC.repo, t: SYNC.token });
  return 'studio1.' + utf8ToB64(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function parseConnectInput(text) {
  const t = String(text || '').trim().replace(/\s+/g, '');
  if (!t) return null;
  const m = t.match(/studio1\.([A-Za-z0-9_-]+)/);
  if (m) {
    try {
      let b = m[1].replace(/-/g, '+').replace(/_/g, '/');
      while (b.length % 4) b += '=';
      const o = JSON.parse(b64ToUtf8(b));
      if (o && o.t) return { token: o.t, owner: o.o || null, repo: o.r || null };
    } catch (e) {
      return null;
    }
    return null;
  }
  if (/^(github_pat_|ghp_|gho_|ghu_)[A-Za-z0-9_]+$/.test(t)) return { token: t, owner: null, repo: null };
  return null;
}

async function connectSync(input, repoName) {
  const p = parseConnectInput(input);
  if (!p) throw ghError('bad-input', 'bad-input');
  const user = await gh('GET', '/user', null, { token: p.token });
  const owner = p.owner || user.login;
  const repo = (repoName || p.repo || DATA_REPO_DEFAULT).trim();
  const info = await gh('GET', '/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo), null, { token: p.token });
  if (!info.private) throw ghError('public', 'public');
  if (info.permissions && info.permissions.push === false) throw ghError('noperm', 'noperm');
  SYNC = { owner, repo, token: p.token, branch: info.default_branch || 'main', connectedAt: new Date().toISOString(), lastSha: null, lastHash: null, igSha: null, igStatusSha: null };
  await saveSyncCfg();
  try { await ensureRepoDocs(); } catch (e) { console.warn('docs', e); }
  const ok = await syncNow({ extras: true, rerender: true });
  if (!ok) throw ghError(SYNC.lastError || 'sync', 'sync');
  return true;
}

async function disconnectSync() {
  SYNC = null;
  clearTimeout(_syncTimer);
  setSyncState('off');
  await saveSyncCfg();
}

async function ensureRepoDocs() {
  const docs = [['README.md', REPO_README], ['CLAUDE.md', REPO_CLAUDE]];
  for (const [path, text] of docs) {
    const st = await ghStat(path);
    if (!st) await ghWrite(path, text, undefined, 'راهنمای ریپوی داده‌ها');
  }
}

async function ghHistory() {
  const list = await gh('GET', repoPath('/commits?path=state.json&per_page=30'));
  return (list || []).map((c) => ({ sha: c.sha, date: (c.commit && (c.commit.committer || c.commit.author) || {}).date, msg: c.commit ? c.commit.message : '' }));
}

function syncWhenText() {
  if (!SYNC) return 'خاموش';
  if (_syncState === 'syncing') return 'در حال ارسال…';
  if (SYNC.lastError) return SYNC.lastError;
  if (!SYNC.lastPushAt && !SYNC.lastPullAt) return 'هنوز همگام نشده';
  const t = SYNC.lastPushAt || SYNC.lastPullAt;
  const mins = Math.round((Date.now() - new Date(t).getTime()) / 60000);
  if (mins < 1) return 'همین الان';
  if (mins < 60) return fmtNum(mins) + ' دقیقه پیش';
  if (mins < 48 * 60) return fmtNum(Math.round(mins / 60)) + ' ساعت پیش';
  return fmtNum(Math.round(mins / 1440)) + ' روز پیش';
}

function startSyncLoops() {
  if (SYNC) syncNow({ extras: true });
  setInterval(() => {
    if (SYNC && document.visibilityState === 'visible') syncNow({ extras: true });
  }, EXTRAS_EVERY);
  window.addEventListener('online', () => { if (SYNC) syncNow(); });
  document.addEventListener('visibilitychange', () => {
    if (!SYNC) return;
    if (document.visibilityState === 'hidden') syncNow();
    else if (Date.now() - (SYNC.lastExtrasAt || 0) > 2 * 60000) syncNow({ extras: true });
  });
}

/* ---------- تحلیل‌های Claude: صندوق پیشنهادها و سؤال‌ها ---------- */
const SUG_LABEL = {
  learning: 'درس',
  idea: 'ایده',
  snippet: 'هوک و CTA',
  update: 'اصلاح پست',
  note: 'یادداشت',
  snapshot: 'آمار',
  post: 'پست تازه',
  checklist: 'قاعده‌ی چک‌لیست',
};
const SNAP_FIELD_NAMES = {
  views: 'ویو', reach: 'ریچ', follows: 'فالوور', profileVisits: 'بازدید پروفایل', likes: 'لایک', comments: 'کامنت',
  shares: 'شیر', saves: 'سیو', reposts: 'ریپست', likesPct: 'لایک٪', commentsPct: 'کامنت٪', sharesPct: 'شیر٪', savesPct: 'سیو٪',
  repostsPct: 'ریپست٪', skipRate: 'اسکیپ‌ریت', avgWatch: 'واچ‌تایم', followersPct: 'فالوور٪', age2554: 'سن ۲۵ تا ۵۴٪', age1317: 'سن ۱۳ تا ۱۷٪',
};
const SNAP_SRC_KEYS = ['reels', 'explore', 'feed', 'stories', 'profile', 'other'];
const UPDATE_FIELDS = {
  title: 'عنوان', series: 'سری', goal: 'هدف', format: 'فرمت', pubType: 'نوع انتشار', style: 'سبک اجرا', hookType: 'نوع هوک',
  ctaType: 'نوع CTA', source: 'منبع ایده', location: 'محل ضبط', concerns: 'دغدغه‌ها', durationSec: 'مدت ویدیو', publishDate: 'تاریخ انتشار',
  publishTime: 'ساعت انتشار', caption: 'کپشن', priority: 'اولویت', stage: 'مرحله',
};

function _str(v, max) {
  if (v == null) return '';
  return String(v).slice(0, max || 4000).trim();
}

function _validISO(v) {
  const d = v ? new Date(v) : null;
  return d && !isNaN(d.getTime()) ? d.toISOString() : null;
}

function _validDate(v) {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(isoToDate(v).getTime()) ? v : null;
}

function _validTime(v) {
  return typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : null;
}

function parseInbox(text, key) {
  let o;
  try { o = JSON.parse(text); } catch (e) { return null; }
  if (!o || o.kind !== 'studio-inbox' || typeof o !== 'object') return null;
  const sugs = (Array.isArray(o.suggestions) ? o.suggestions : [])
    .filter((x) => x && typeof x === 'object')
    .map((x, i) => Object.assign({}, x, { id: _str(x.id || 's' + (i + 1), 60), type: x.type === 'tag' ? 'update' : x.type }))
    .filter((x) => SUG_LABEL[x.type])
    .slice(0, 400);
  return {
    key,
    id: _str(o.id || key, 120),
    title: _str(o.title, 200) || 'تحلیل Claude',
    createdAt: _validISO(o.createdAt) || new Date().toISOString(),
    answers: o.answers ? _str(o.answers, 80) : null,
    report: _str(o.report, 80000),
    suggestions: sugs,
    importedAt: new Date().toISOString(),
    readAt: null,
    decisions: {},
  };
}

function markAnswered(entry) {
  if (!entry.answers) return;
  const q = S.questions.find((x) => x.id === entry.answers);
  if (q && q.status !== 'answered') {
    q.status = 'answered';
    q.answerKey = entry.key;
    q.updatedAt = new Date().toISOString();
  }
}

function inboxList() {
  return Object.keys(S.inbox).map((k) => S.inbox[k]).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

function pendingCount(entry) {
  return entry.suggestions.filter((s) => !entry.decisions[s.id]).length;
}

function unreadInbox() {
  return inboxList().filter((e) => !e.readAt).length;
}

/* ---------- اعمال پیشنهادها ---------- */
function _listValue(listKey, v) {
  const t = _str(v, 80);
  if (!t) return null;
  const list = S.settings.lists[listKey] || (S.settings.lists[listKey] = []);
  if (list.indexOf(t) < 0) list.push(t);
  return t;
}

function _seriesId(v) {
  if (!v) return null;
  const sr = S.settings.series.find((s) => s.id === v || s.name === v || s.short === v);
  return sr ? sr.id : null;
}

function _idIn(list, v) {
  return list.some((x) => x.id === v) ? v : null;
}

function _num(v) {
  const n = parseNum(v);
  return n != null && Number.isFinite(n) && n >= 0 ? n : null;
}

function sanitizeSnap(src) {
  const s = {};
  if (!src || typeof src !== 'object') return s;
  for (const k in SNAP_FIELD_NAMES) {
    const v = _num(src[k]);
    if (v != null) s[k] = v;
  }
  if (src.src && typeof src.src === 'object') {
    const o = {};
    for (const k of SNAP_SRC_KEYS) {
      const v = _num(src.src[k]);
      if (v != null) o[k] = v;
    }
    if (Object.keys(o).length) s.src = o;
  }
  const t = _num(src.t);
  if (t != null) s.t = t;
  if (src.label) s.label = _str(src.label, 60);
  if (src.note) s.note = _str(src.note, 1000);
  return s;
}

function upsertSnapshot(it, clean, extra) {
  const now = new Date().toISOString();
  const existing = clean.t != null ? it.snapshots.find((x) => x.t === clean.t) : null;
  if (existing) {
    Object.assign(existing, clean, extra || {});
    if (clean.src) existing.src = Object.assign({}, existing.src || {}, clean.src);
    existing.updatedAt = now;
    return existing;
  }
  const snap = Object.assign({ id: uid('s'), takenAt: now, updatedAt: now, src: {} }, clean, extra || {});
  if (!snap.src) snap.src = {};
  insertSnapshot(it, snap);
  return snap;
}

function applyItemFields(it, set) {
  const done = [];
  for (const k in set || {}) {
    if (!UPDATE_FIELDS[k]) continue;
    const v = set[k];
    if (v === undefined) continue;
    let nv;
    if (k === 'series') nv = _seriesId(v);
    else if (k === 'goal') nv = v == null ? null : _idIn(GOALS, v);
    else if (k === 'format') nv = _idIn(FORMATS, v);
    else if (k === 'pubType') nv = _idIn(PUBTYPES, v);
    else if (k === 'priority') nv = _idIn(PRIORITIES, v);
    else if (k === 'stage') nv = _idIn(STAGES, v);
    else if (k === 'style') nv = _listValue('styles', v);
    else if (k === 'hookType') nv = _listValue('hookTypes', v);
    else if (k === 'ctaType') nv = _listValue('ctaTypes', v);
    else if (k === 'source') nv = _listValue('sources', v);
    else if (k === 'location') nv = _listValue('locations', v);
    else if (k === 'concerns') nv = (Array.isArray(v) ? v : [v]).map((c) => _listValue('concerns', c)).filter(Boolean);
    else if (k === 'durationSec') nv = _num(v);
    else if (k === 'publishDate') nv = _validDate(v);
    else if (k === 'publishTime') nv = v == null ? null : _validTime(v);
    else nv = _str(v, k === 'caption' ? 5000 : 300);
    if (nv === undefined || (nv === null && v != null && k !== 'goal')) continue;
    if (k === 'title' && !nv) continue;
    it[k] = nv;
    done.push(UPDATE_FIELDS[k]);
  }
  if (it.stage === 'published' && it.order == null) it.order = nextOrder();
  return done;
}

function applySuggestion(entry, s) {
  const now = new Date().toISOString();
  if (s.type === 'learning') {
    const text = _str(s.text, 3000);
    if (!text) throw new Error('متن درس خالیه');
    S.learnings.push({
      id: uid('e'), text, status: _idIn(L_STATUS, s.status) || 'hyp', category: s.category ? _listValue('lcats', s.category) : null,
      itemIds: (Array.isArray(s.itemIds) ? s.itemIds : []).filter((id) => itemById(id)), date: todayISO(), by: 'claude', createdAt: now, updatedAt: now,
    });
    return 'به دفترچه اضافه شد';
  }
  if (s.type === 'idea') {
    const title = _str(s.title, 300);
    if (!title) throw new Error('عنوان ایده خالیه');
    const it = newItem({ title, stage: 'idea', series: _seriesId(s.series) || 'other', notes: _str(s.notes, 5000), by: 'claude' });
    applyItemFields(it, { goal: s.goal, format: s.format || 'reel', concerns: s.concerns || [], source: s.source || 'ایده‌پردازی با Claude', priority: s.priority || 'mid', style: s.style, hookType: s.hookType, location: s.location });
    if (!s.goal) it.goal = null;
    if (s.hook) it.script.hook = _str(s.hook, 300);
    S.items.push(it);
    return 'به ایده‌ها اضافه شد';
  }
  if (s.type === 'snippet') {
    const text = _str(s.text, 600);
    if (!text) throw new Error('متن خالیه');
    const kind = _idIn(SNIP_KINDS, s.kind) || 'hook';
    if (S.snippets.some((x) => x.kind === kind && x.text === text)) return 'از قبل توی بانک بود';
    S.snippets.push({ id: uid('n'), kind, text, series: _seriesId(s.series), itemId: itemById(s.itemId) ? s.itemId : null, used: false, result: null, by: 'claude', createdAt: now, updatedAt: now });
    return 'به بانک اضافه شد';
  }
  if (s.type === 'checklist') {
    const text = _str(s.text, 300);
    if (!text) throw new Error('متن خالیه');
    if (!S.settings.checklist.some((c) => c.text === text)) S.settings.checklist.push({ id: uid('c'), text });
    return 'به چک‌لیست اضافه شد';
  }
  if (s.type === 'post') {
    const p = s.item || {};
    const title = _str(p.title, 300);
    if (!title) throw new Error('عنوان پست خالیه');
    const it = newItem({ title, stage: 'published', series: _seriesId(p.series) || 'other', notes: _str(p.notes, 5000), by: 'claude' });
    it.goal = null;
    applyItemFields(it, Object.assign({}, p, { title: undefined, series: undefined, notes: undefined, stage: 'published' }));
    it.order = nextOrder();
    (Array.isArray(s.snapshots) ? s.snapshots : []).forEach((x) => upsertSnapshot(it, sanitizeSnap(x), { by: 'claude' }));
    S.items.push(it);
    return 'پست ساخته شد';
  }
  const it = itemById(s.itemId);
  if (!it) throw new Error('این پست توی اپ پیدا نشد');
  if (s.type === 'update') {
    const done = applyItemFields(it, s.set || s.fields || {});
    if (!done.length) throw new Error('چیزی برای تغییر نبود');
    it.updatedAt = now;
    return 'به‌روز شد: ' + done.join('، ');
  }
  if (s.type === 'note') {
    const text = _str(s.text, 5000);
    if (!text) throw new Error('متن خالیه');
    it.notes = (it.notes ? it.notes + '\n\n' : '') + '[Claude، ' + fmtJ(todayISO(), { year: true }) + '] ' + text;
    it.updatedAt = now;
    return 'به یادداشت‌های پست اضافه شد';
  }
  if (s.type === 'snapshot') {
    const clean = sanitizeSnap(s.snapshot || s);
    if (!Object.keys(clean).some((k) => SNAP_FIELD_NAMES[k] || k === 'src')) throw new Error('عددی توی این آمار نیست');
    if (it.stage !== 'published') it.stage = 'published';
    if (it.order == null) it.order = nextOrder();
    upsertSnapshot(it, clean, { by: 'claude' });
    if (s.durationSec != null && _num(s.durationSec) != null) it.durationSec = _num(s.durationSec);
    it.updatedAt = now;
    return 'آمار ثبت شد';
  }
  throw new Error('نوع ناشناخته');
}

function decide(entry, s, d, note) {
  entry.decisions[s.id] = { d, at: new Date().toISOString(), r: note || '' };
}

function applyOne(entry, s) {
  try {
    const r = applySuggestion(entry, s);
    decide(entry, s, 'applied', r);
    return { ok: true, msg: r };
  } catch (e) {
    return { ok: false, msg: e.message || 'اعمال نشد' };
  }
}

/* ---------- نمایش ---------- */
function mdInline(t) {
  return esc(t)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

function mdLite(src) {
  const lines = String(src || '').replace(/\r/g, '').split('\n');
  let html = '';
  let list = null;
  let para = [];
  let table = null;
  const flushPara = () => {
    if (para.length) html += '<p>' + mdInline(para.join(' ')) + '</p>';
    para = [];
  };
  const flushList = () => {
    if (list) html += '</' + list + '>';
    list = null;
  };
  const flushTable = () => {
    if (!table) return;
    const rows = table.filter((r) => !r.every((c) => /^:?-{2,}:?$/.test(c)));
    if (rows.length) {
      html += '<div class="md-tw"><table class="md-t"><thead><tr>' + rows[0].map((c) => '<th>' + mdInline(c) + '</th>').join('') + '</tr></thead><tbody>' +
        rows.slice(1).map((r) => '<tr>' + r.map((c) => '<td>' + mdInline(c) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';
    }
    table = null;
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith('|')) {
      flushPara();
      flushList();
      const cells = line.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
      (table || (table = [])).push(cells);
      continue;
    }
    flushTable();
    if (!line) {
      flushPara();
      flushList();
      continue;
    }
    let m;
    if ((m = line.match(/^(#{1,4})\s+(.*)$/))) {
      flushPara();
      flushList();
      const lvl = m[1].length <= 2 ? 3 : 4;
      html += '<h' + lvl + ' class="md-h">' + mdInline(m[2]) + '</h' + lvl + '>';
      continue;
    }
    if ((m = line.match(/^[-*•]\s+(.*)$/))) {
      flushPara();
      if (list !== 'ul') {
        flushList();
        html += '<ul>';
        list = 'ul';
      }
      html += '<li>' + mdInline(m[1]) + '</li>';
      continue;
    }
    if ((m = line.match(/^[0-9۰-۹]+[.)]\s+(.*)$/))) {
      flushPara();
      if (list !== 'ol') {
        flushList();
        html += '<ol>';
        list = 'ol';
      }
      html += '<li>' + mdInline(m[1]) + '</li>';
      continue;
    }
    if ((m = line.match(/^>\s?(.*)$/))) {
      flushPara();
      flushList();
      html += '<blockquote>' + mdInline(m[1]) + '</blockquote>';
      continue;
    }
    flushList();
    para.push(line);
  }
  flushTable();
  flushPara();
  flushList();
  return html;
}

function _itemChip(id) {
  const it = id ? itemById(id) : null;
  if (!it) return '';
  return '<button type="button" class="lk" data-go="#/item/' + it.id + '"><span class="sdot" style="' + seriesVar(it.series) + '"></span>' + esc(it.title) + '</button>';
}

function _fieldValueText(k, v) {
  if (v == null || v === '') return 'خالی';
  if (k === 'series') return seriesById(_seriesId(v) || 'other').name;
  if (k === 'goal') return nameOf(GOALS, v) || String(v);
  if (k === 'format') return nameOf(FORMATS, v) || String(v);
  if (k === 'pubType') return nameOf(PUBTYPES, v) || String(v);
  if (k === 'stage') return nameOf(STAGES, v) || String(v);
  if (k === 'publishDate') return _validDate(v) ? fmtJ(v, { year: true }) : String(v);
  if (k === 'durationSec') return fmtNum(_num(v)) + ' ثانیه';
  if (Array.isArray(v)) return v.join('، ');
  return String(v);
}

function _snapSummary(x) {
  const c = sanitizeSnap(x);
  const parts = [];
  for (const k of ['views', 'reach', 'follows', 'saves', 'savesPct', 'shares', 'sharesPct', 'avgWatch', 'skipRate']) {
    if (c[k] == null) continue;
    const pct = /Pct$|skipRate/.test(k);
    parts.push(SNAP_FIELD_NAMES[k] + ' ' + (pct ? fmtPct(c[k]) : k === 'avgWatch' ? fmtNum(c[k], 1) + ' ث' : fmtNum(c[k])));
  }
  const when = c.t != null ? checkpointName(c.t, c.label) : c.label || 'ثبت دستی';
  return when + (parts.length ? ': ' + parts.join('، ') : '');
}

function sugBody(s) {
  if (s.type === 'learning') return '<p>' + esc(s.text) + '</p>' + (s.status ? '<span class="muted small">' + esc(nameOf(L_STATUS, s.status) || '') + '</span>' : '');
  if (s.type === 'idea') return '<p><b>' + esc(s.title) + '</b></p>' + (s.notes ? '<p class="muted small">' + esc(s.notes) + '</p>' : '') + (s.series ? seriesTag(_seriesId(s.series) || 'other') : '');
  if (s.type === 'snippet') return '<p>' + esc(s.text) + '</p><span class="muted small">' + esc(nameOf(SNIP_KINDS, s.kind) || 'هوک') + '</span>';
  if (s.type === 'checklist') return '<p>' + esc(s.text) + '</p>';
  if (s.type === 'note') return '<p>' + esc(s.text) + '</p>';
  if (s.type === 'update') {
    const set = s.set || s.fields || {};
    return '<ul class="sug-ul">' + Object.keys(set).filter((k) => UPDATE_FIELDS[k]).map((k) => '<li>' + esc(UPDATE_FIELDS[k]) + ': ' + esc(_fieldValueText(k, set[k])) + '</li>').join('') + '</ul>';
  }
  if (s.type === 'snapshot') return '<p>' + esc(_snapSummary(s.snapshot || s)) + '</p>';
  if (s.type === 'post') {
    const p = s.item || {};
    return '<p><b>' + esc(p.title || '') + '</b></p><p class="muted small">' + esc([p.publishDate && _validDate(p.publishDate) ? fmtJ(p.publishDate, { year: true }) : '', p.series ? seriesById(_seriesId(p.series) || 'other').name : ''].filter(Boolean).join('، ')) + '</p>' +
      (Array.isArray(s.snapshots) && s.snapshots.length ? '<p class="muted small">' + esc(s.snapshots.map(_snapSummary).join(' | ')) + '</p>' : '');
  }
  return '';
}

function sugCardHtml(entry, s) {
  const d = entry.decisions[s.id];
  const status = d ? (d.d === 'applied' ? badgeHtml('اعمال شد', 'good', 'check') : badgeHtml('رد شد')) : '';
  return '<article class="sug' + (d ? ' done' : '') + '" data-sid="' + esc(s.id) + '">' +
    ((s.itemId && itemById(s.itemId)) || status ? '<div class="sug-top">' + _itemChip(s.itemId) + status + '</div>' : '') +
    '<div class="sug-body">' + sugBody(s) + '</div>' +
    (s.why ? '<p class="sug-why">' + esc(s.why) + '</p>' : '') +
    (d && d.r ? '<p class="muted small">' + esc(d.r) + '</p>' : '') +
    (d ? '' : '<div class="sug-act"><button type="button" class="btn sm primary" data-apply="' + esc(s.id) + '">' + ic('check') + 'اعمال</button><button type="button" class="btn sm ghost" data-reject="' + esc(s.id) + '">رد</button></div>') +
    '</article>';
}

function viewClaude() {
  const list = inboxList();
  const open = S.questions.filter((q) => q.status !== 'answered').sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  let h = '<p class="muted small">تحلیل‌ها و پیشنهادهای Claude اینجا میاد. هر پیشنهاد رو بخون و اگه درست بود «اعمال» رو بزن تا به درس‌ها، ایده‌ها یا پست‌ها اضافه بشه.</p>';
  if (!SYNC) {
    h += '<div class="note warn">' + ic('cloud') + '<div><b>پشتیبان خودکار وصل نیست</b><p>بدون اتصال، تحلیل‌ها رو باید به‌صورت فایل از Claude بگیری و از «وارد کردن فایل» بازشون کنی.</p><button type="button" class="btn sm" data-go="#/backup">وصل کردن</button></div></div>';
  }
  h += '<div class="btn-row"><button type="button" class="btn sm primary" data-ask>' + ic('msg') + 'سؤال از Claude</button><button type="button" class="btn sm" data-full>' + ic('spark') + 'درخواست تحلیل کامل</button>' +
    (SYNC ? '<button type="button" class="btn sm ghost" data-pull>' + ic('refresh') + 'بروزرسانی</button>' : '<button type="button" class="btn sm ghost" data-imp>' + ic('upload') + 'وارد کردن فایل</button>') + '</div>';
  if (open.length) {
    h += '<section class="sec">' + secHead('در انتظار جواب') + '<div class="list">' + open.map((q) =>
      '<div class="row static"><span class="ric">' + ic('clock') + '</span><span class="rt"><b>' + esc(q.text) + '</b><span>' + fmtJ(dateToISO(new Date(q.createdAt))) + (q.itemId && itemById(q.itemId) ? '، درباره‌ی «' + esc(itemById(q.itemId).title) + '»' : '') + '</span>' +
      '<span class="row-actions"><button type="button" class="btn sm" data-copyq="' + q.id + '">' + ic('copy') + 'کپی پیام برای Claude</button><button type="button" class="btn sm ghost" data-delq="' + q.id + '">حذف</button></span></span></div>').join('') + '</div></section>';
  }
  if (!list.length) {
    h += emptyHtml('spark', 'هنوز تحلیلی نرسیده', 'یک سؤال بپرس یا «درخواست تحلیل کامل» رو بزن، پیام رو توی چت Claude بفرست؛ جواب همین‌جا میاد.');
  } else {
    h += '<section class="sec">' + secHead('تحلیل‌ها') + '<div class="cards">' + list.map((e) => {
      const p = pendingCount(e);
      return '<article class="icard" tabindex="0" role="link" data-go="#/claude/' + encodeURIComponent(e.key) + '">' +
        '<div class="icard-top">' + (e.readAt ? '' : badgeHtml('تازه', 'gold')) + (p ? badgeHtml(faNum(p) + ' پیشنهاد باز') : badgeHtml('همه بررسی شد', 'good')) +
        '<span class="icard-date">' + fmtJ(dateToISO(new Date(e.createdAt))) + '</span></div><h3>' + esc(e.title) + '</h3></article>';
    }).join('') + '</div></section>';
  }
  return {
    title: 'تحلیل‌های Claude',
    back: '/more',
    tab: 'more',
    html: h,
    fab: { icon: 'msg', label: 'سؤال از Claude', fn: () => askClaudeSheet() },
    mount: (root) => {
      root.addEventListener('click', async (e) => {
        if (e.target.closest('[data-ask]')) { askClaudeSheet(); return; }
        if (e.target.closest('[data-full]')) {
          askClaudeSheet({ text: 'یک تحلیل کامل از عملکرد پیج بده: چی جواب داده، چی نه، کدوم فرضیه‌های دفترچه با داده‌ها جور درمیان، و برای دو هفته‌ی آینده چی بسازم.' });
          return;
        }
        if (e.target.closest('[data-pull]')) {
          toast('در حال بروزرسانی…');
          const ok = await syncNow({ extras: true, rerender: true });
          if (!ok) toast(SYNC && SYNC.lastError ? SYNC.lastError : 'بروزرسانی نشد');
          return;
        }
        if (e.target.closest('[data-imp]')) { pickImportFile(); return; }
        const cq = e.target.closest('[data-copyq]');
        if (cq) {
          const q = S.questions.find((x) => x.id === cq.dataset.copyq);
          if (q) copyText(claudeMessage(q), 'پیام کپی شد؛ توی چت Claude بفرست');
          return;
        }
        const dq = e.target.closest('[data-delq]');
        if (dq) {
          const q = S.questions.find((x) => x.id === dq.dataset.delq);
          if (!q) return;
          S.questions = S.questions.filter((x) => x !== q);
          markDeleted(q.id);
          save();
          rerender();
        }
      });
    },
  };
}

function viewClaudeEntry(key) {
  const entry = S.inbox[key];
  if (!entry) return notFoundView('این تحلیل پیدا نشد.');
  if (!entry.readAt) {
    entry.readAt = new Date().toISOString();
    save();
  }
  const q = entry.answers ? S.questions.find((x) => x.id === entry.answers) : null;
  const pending = pendingCount(entry);
  const groups = {};
  entry.suggestions.forEach((s) => { (groups[s.type] || (groups[s.type] = [])).push(s); });
  let h = '<div class="claude-head"><h2>' + esc(entry.title) + '</h2><span class="muted small">' + fmtJ(dateToISO(new Date(entry.createdAt)), { weekday: true, year: true }) + '</span>' +
    (q ? '<div class="q-box">' + ic('msg') + '<span>' + esc(q.text) + '</span></div>' : '') + '</div>';
  if (entry.report) h += '<section class="md card">' + mdLite(entry.report) + '</section>';
  if (entry.suggestions.length) {
    h += '<section class="sec">' + secHead('پیشنهادها', pending ? '<button type="button" class="link" data-all>اعمال همه‌ی ' + faNum(pending) + ' پیشنهاد</button>' : '<span class="muted small">همه بررسی شد</span>') +
      Object.keys(SUG_LABEL).filter((t) => groups[t]).map((t) => '<div class="group-h">' + SUG_LABEL[t] + '<span>' + faNum(groups[t].length) + '</span></div><div class="cards">' + groups[t].map((s) => sugCardHtml(entry, s)).join('') + '</div>').join('') + '</section>';
  }
  return {
    title: 'تحلیل Claude',
    back: '/claude',
    tab: 'more',
    html: h,
    mount: (root) => {
      root.addEventListener('click', async (e) => {
        const ap = e.target.closest('[data-apply]');
        if (ap) {
          const s = entry.suggestions.find((x) => x.id === ap.dataset.apply);
          const r = applyOne(entry, s);
          if (r.ok) {
            invalidateLeads();
            save();
            toast(r.msg);
            rerender();
          } else toast(r.msg);
          return;
        }
        const rj = e.target.closest('[data-reject]');
        if (rj) {
          const s = entry.suggestions.find((x) => x.id === rj.dataset.reject);
          decide(entry, s, 'rejected');
          save();
          rerender();
          return;
        }
        if (e.target.closest('[data-all]')) {
          const ok = await confirmBox({ title: 'همه‌ی پیشنهادها اعمال بشه؟', text: faNum(pending) + ' پیشنهاد به درس‌ها، ایده‌ها و پست‌ها اضافه می‌شه. قبلش یک نسخه برای برگشت نگه داشته می‌شه.', ok: 'اعمال همه' });
          if (!ok) return;
          await keepSafetyCopy();
          let good = 0, bad = 0;
          for (const s of entry.suggestions) {
            if (entry.decisions[s.id]) continue;
            const r = applyOne(entry, s);
            if (r.ok) good++; else bad++;
          }
          invalidateLeads();
          save();
          toast(faNum(good) + ' پیشنهاد اعمال شد' + (bad ? '، ' + faNum(bad) + ' مورد نشد' : ''));
          rerender();
        }
      });
    },
  };
}

/* ---------- سؤال از Claude ---------- */
function claudeMessage(q) {
  const it = q.itemId ? itemById(q.itemId) : null;
  const about = it ? ' (درباره‌ی پست «' + it.title + '»)' : '';
  if (SYNC) {
    return 'توی استودیو محتوا یک سؤال تازه ثبت کردم (کد ' + q.id + ')' + about + ': «' + q.text + '»\n' +
      'داده‌ها رو از ریپوی ' + SYNC.owner + '/' + SYNC.repo + ' بخون، تحلیل کن و جواب و پیشنهادها رو توی پوشه‌ی inbox همون ریپو بنویس.';
  }
  return 'سؤال از استودیو محتوا (کد ' + q.id + ')' + about + ': «' + q.text + '»\n' +
    'فایل پشتیبان استودیو رو ضمیمه کردم. جواب و پیشنهادها رو به‌صورت یک فایل inbox (studio-inbox) بده تا توی اپ واردش کنم.';
}

function askClaudeSheet(preset) {
  preset = preset || {};
  const d = { text: preset.text || '', itemId: preset.itemId || null };
  const it = d.itemId ? itemById(d.itemId) : null;
  openSheet({
    title: 'سؤال از Claude',
    body: (it ? '<div class="lk-row">' + _itemChip(it.id) + '</div>' : '') +
      fieldHtml('سؤالت', taHtml('text', d.text, { rows: 4, af: true, ph: 'مثلاً: چرا ریلزهای آشپزی سیو کمتری گرفتن؟' })) +
      '<p class="fhint">سؤال توی اپ ثبت می‌شه. بعدش یک پیام آماده کپی می‌کنی و توی چت Claude می‌فرستی؛ جواب توی «تحلیل‌های Claude» میاد.</p>' +
      '<div class="sheet-actions"><button type="button" class="btn primary" data-save>ثبت و کپی پیام</button><button type="button" class="btn ghost" data-sclose>انصراف</button></div>',
    onMount: (b) => {
      bindForm(b, d);
      b.addEventListener('click', (e) => {
        if (!e.target.closest('[data-save]')) return;
        const text = (d.text || '').trim();
        if (!text) { toast('سؤالت رو بنویس'); return; }
        const now = new Date().toISOString();
        const q = { id: 'q-' + Date.now().toString(36), text, itemId: d.itemId, status: 'open', createdAt: now, updatedAt: now };
        S.questions.push(q);
        save();
        if (SYNC) syncNow();
        const msg = claudeMessage(q);
        copyText(msg, 'پیام کپی شد؛ توی چت Claude بفرست');
        closeSheet(() => questionSentSheet(q, msg));
      });
    },
  });
}

function questionSentSheet(q, msg) {
  openSheet({
    title: 'حالا توی چت Claude بفرست',
    body: '<p class="sheet-text">این پیام کپی شد. چت پروژه‌ی «کار و تولید محتوا کلینیک» رو توی اپ Claude باز کن و بفرستش.</p>' +
      '<div class="msg-box">' + esc(msg).replace(/\n/g, '<br>') + '</div>' +
      (SYNC ? '' : '<p class="sheet-text">چون پشتیبان خودکار وصل نیست، فایل پشتیبان رو هم باید همراهش بفرستی.</p>') +
      '<div class="sheet-actions"><button type="button" class="btn primary" data-copy>' + ic('copy') + 'کپی دوباره</button>' +
      (SYNC ? '' : '<button type="button" class="btn" data-share>' + ic('share') + 'فرستادن فایل</button>') + '</div>',
    onMount: (b) => {
      b.addEventListener('click', async (e) => {
        if (e.target.closest('[data-copy]')) copyText(msg, 'کپی شد');
        if (e.target.closest('[data-share]')) {
          const r = await shareBackup();
          if (r !== 'aborted') markBackedUp();
        }
      });
    },
    onClose: () => { if (location.hash.indexOf('#/claude') === 0) rerender(); },
  });
}

function importInboxText(text, name) {
  const entry = parseInbox(text, name || 'file-' + Date.now().toString(36) + '.json');
  if (!entry) return null;
  const key = 'file-' + entry.id.replace(/[^\w.-]+/g, '-');
  entry.key = key;
  if (S.inbox[key]) {
    entry.decisions = S.inbox[key].decisions || {};
    entry.readAt = S.inbox[key].readAt || null;
  }
  S.inbox[key] = entry;
  markAnswered(entry);
  save();
  return key;
}

/* ---------- اینستاگرام: آماری که گیت‌هاب اکشنز از API رسمی می‌گیرد ---------- */
let IG = null; // آخرین instagram/media.json
let IG_STATUS = null; // آخرین instagram/status.json

async function igLoadCache() {
  try { IG = (await kvGet('ig')) || null; } catch (e) { IG = null; }
  try { IG_STATUS = (await kvGet('igStatus')) || null; } catch (e) { IG_STATUS = null; }
}

async function igSaveCache(data) {
  IG = data;
  try { await kvSet('ig', data); } catch (e) { /* ignore */ }
}

function igTime(ts) {
  const d = new Date(String(ts || '').replace(/([+-]\d\d)(\d\d)$/, '$1:$2'));
  return isNaN(d.getTime()) ? null : d;
}

function igLocal(ts) {
  const d = igTime(ts);
  return d ? { date: dateToISO(d), time: pad2(d.getHours()) + ':' + pad2(d.getMinutes()) } : null;
}

function igFormat(m) {
  if (m.media_product_type === 'REELS') return 'reel';
  if (m.media_type === 'CAROUSEL_ALBUM') return 'carousel';
  if (m.media_product_type === 'STORY') return 'story';
  return 'post';
}

function igTitle(m) {
  const first = String(m.caption || '').split('\n').map((l) => l.replace(/#[^\s#]+/g, '').trim()).find((l) => l.length > 1) || '';
  const t = Array.from(first).slice(0, 70).join('');
  if (t) return t + (Array.from(first).length > 70 ? '…' : '');
  const loc = igLocal(m.timestamp);
  return 'پست ' + (loc ? fmtJ(loc.date, { year: true }) : 'اینستاگرام');
}

// تبدیل نام شاخص‌های API به فیلدهای فرم آمار
function igSnap(m) {
  const s = {};
  const map = { views: 'views', reach: 'reach', likes: 'likes', comments: 'comments', shares: 'shares', saved: 'saves', reposts: 'reposts', follows: 'follows', profile_visits: 'profileVisits' };
  for (const k in map) {
    const v = m[k];
    if (v != null && Number.isFinite(+v)) s[map[k]] = +v;
  }
  if (m.ig_reels_avg_watch_time != null && Number.isFinite(+m.ig_reels_avg_watch_time)) {
    const v = +m.ig_reels_avg_watch_time;
    s.avgWatch = Math.round((v > 600 ? v / 1000 : v) * 10) / 10;
  }
  if (m.reels_skip_rate != null && Number.isFinite(+m.reels_skip_rate)) {
    const v = +m.reels_skip_rate;
    s.skipRate = Math.round((v <= 1 ? v * 100 : v) * 10) / 10;
  }
  return s;
}

function upsertIgSnap(it, snap, at, isLatest) {
  if (isLatest) {
    const cur = it.snapshots.find((x) => x.igLatest);
    if (cur) it.snapshots = it.snapshots.filter((x) => x !== cur);
    insertSnapshot(it, Object.assign({ id: cur ? cur.id : uid('s'), takenAt: at || new Date().toISOString(), src: (cur && cur.src) || {}, label: 'آخرین آمار اینستاگرام', ig: true, igLatest: true }, snap));
    return;
  }
  const ex = it.snapshots.find((x) => x.t === snap.t && !x.igLatest);
  if (ex) {
    Object.assign(ex, snap);
    ex.ig = true;
    return;
  }
  insertSnapshot(it, Object.assign({ id: uid('s'), takenAt: at || new Date().toISOString(), src: {}, ig: true }, snap));
}

function igUpdateItem(it, m) {
  const sig = () => JSON.stringify([it.publishDate, it.publishTime, it.permalink, it.format, it.stage, it.caption, it.snapshots]);
  const before = sig();
  const loc = igLocal(m.timestamp);
  if (loc) {
    it.publishDate = loc.date;
    it.publishTime = loc.time;
  }
  if (m.permalink) it.permalink = m.permalink;
  it.format = igFormat(m);
  if (it.stage !== 'published') it.stage = 'published';
  if (it.order == null) it.order = nextOrder();
  if (!it.caption && m.caption) it.caption = String(m.caption).slice(0, 5000);
  const cps = m.checkpoints || {};
  for (const c in cps) {
    const cp = cps[c];
    if (!cp || !cp.m) continue;
    const snap = igSnap(cp.m);
    if (!Object.keys(snap).length) continue;
    snap.t = +c;
    upsertIgSnap(it, snap, cp.at, false);
  }
  if (m.latest && m.latest.m) {
    const snap = igSnap(m.latest.m);
    if (Object.keys(snap).length) {
      snap.t = Math.max(1, Math.round(m.latest.ageH || 0));
      upsertIgSnap(it, snap, m.latest.at, true);
    }
  }
  if (sig() !== before) {
    it.updatedAt = new Date().toISOString();
    return true;
  }
  return false;
}

const IG_STOP = ['کاروسل', 'ریلز', 'پست', 'سری', 'قسمت', 'اپیزود', 'نسخه', 'درباره', 'درباره‌ی', 'برای', 'رژیمی', 'رژیم', 'لاغری'];
function _tokens(s) {
  return String(s || '').replace(/[^\p{L}\p{N}\s\u200c]/gu, ' ').split(/\s+/).filter((w) => Array.from(w).length >= 3 && IG_STOP.indexOf(w) < 0);
}

function titleOverlap(title, caption) {
  const t = _tokens(title);
  if (!t.length) return 0;
  const cap = String(caption || '');
  return t.filter((w) => cap.indexOf(w) >= 0).length / t.length;
}

function igCandidates(m) {
  const loc = igLocal(m.timestamp);
  const pool = activeItems().filter((i) => isPublished(i) && !i.igId);
  return pool.map((i) => {
    let score = 0;
    let dd = null;
    if (loc && i.publishDate) {
      dd = Math.abs(diffDaysISO(loc.date, i.publishDate));
      score += dd === 0 ? 10 : dd === 1 ? 6 : dd <= 3 ? 2 : -6;
    }
    score += titleOverlap(i.title, m.caption) * 5;
    return { it: i, score, dd };
  }).filter((x) => x.score >= 1.5).sort((a, b) => b.score - a.score).slice(0, 4);
}

function igMediaList() {
  return IG && Array.isArray(IG.media) ? IG.media : [];
}

function igUnlinked() {
  const linked = new Set(S.items.filter((i) => i.igId).map((i) => i.igId));
  return igMediaList().filter((m) => !linked.has(m.id) && S.igIgnored.indexOf(m.id) < 0);
}

function igLink(it, m) {
  it.igId = m.id;
  S.igIgnored = S.igIgnored.filter((x) => x !== m.id);
  igUpdateItem(it, m);
  it.updatedAt = new Date().toISOString();
}

function igCreate(m) {
  const it = newItem({ title: igTitle(m), stage: 'published', series: 'other', format: igFormat(m), by: 'instagram' });
  it.goal = null;
  S.items.push(it);
  igLink(it, m);
  return it;
}

// پیوند خودکار فقط وقتی که در آن روز دقیقاً یک پست در اپ و یک پست در اینستاگرام هست
function igApply(data) {
  let changed = false;
  const media = Array.isArray(data.media) ? data.media : [];
  const byIg = new Map(S.items.filter((i) => i.igId).map((i) => [i.igId, i]));
  for (const m of media) {
    const it = byIg.get(m.id);
    if (it && igUpdateItem(it, m)) changed = true;
  }
  const unlinked = media.filter((m) => !byIg.has(m.id) && S.igIgnored.indexOf(m.id) < 0);
  const perDay = {};
  unlinked.forEach((m) => {
    const loc = igLocal(m.timestamp);
    if (loc) perDay[loc.date] = (perDay[loc.date] || 0) + 1;
  });
  for (const m of unlinked) {
    const loc = igLocal(m.timestamp);
    if (!loc || perDay[loc.date] !== 1) continue;
    const same = activeItems().filter((i) => isPublished(i) && !i.igId && i.publishDate === loc.date);
    if (same.length === 1) {
      igLink(same[0], m);
      changed = true;
    }
  }
  return changed;
}

function igFollowerDelta(it, hours) {
  const series = IG && Array.isArray(IG.followersSeries) ? IG.followersSeries : [];
  if (!it.publishDate || series.length < 2) return null;
  const t0 = isoToDate(it.publishDate, it.publishTime || '12:00').getTime();
  const near = (t) => {
    let best = null;
    for (const p of series) {
      const d = Math.abs(new Date(p.at).getTime() - t);
      if (d <= 6 * HOUR_MS && (!best || d < best.d)) best = { d, n: p.n };
    }
    return best;
  };
  const a = near(t0);
  const b = near(t0 + hours * HOUR_MS);
  return a && b ? b.n - a.n : null;
}

async function igDispatch() {
  if (!SYNC) throw ghError('no-sync', 'no-sync');
  await gh('POST', repoPath('/actions/workflows/instagram.yml/dispatches'), { ref: SYNC.branch || 'main' });
}

function igStatusHtml() {
  const st = IG_STATUS;
  if (!st) return '';
  const when = st.lastRunAt ? fmtWhen(dateToISO(new Date(st.lastRunAt)), pad2(new Date(st.lastRunAt).getHours()) + ':' + pad2(new Date(st.lastRunAt).getMinutes())) : '';
  let h = '';
  if (st.ok === false) {
    const msg = st.errorCode === 'no-token' ? 'توکن اینستاگرام هنوز توی Secrets گیت‌هاب ثبت نشده.' :
      st.errorCode === 'token' ? 'توکن اینستاگرام نامعتبره یا منقضی شده؛ یک توکن تازه بساز و جای IG_TOKEN بذار.' : 'آخرین دریافت خطا داد: ' + (st.error || '');
    h += '<div class="note warn">' + ic('alert') + '<div><b>دریافت از اینستاگرام کار نکرد</b><p>' + esc(msg) + (when ? ' (' + esc(when) + ')' : '') + '</p></div></div>';
  }
  (st.warnings || []).slice(0, 4).forEach((w) => {
    h += '<div class="note small">' + ic('info') + '<div>' + esc(w) + '</div></div>';
  });
  return h;
}

function viewInstagram() {
  let h = '';
  if (!SYNC) {
    h += emptyHtml('cloud', 'اول پشتیبان خودکار رو وصل کن', 'آمار اینستاگرام از طریق همون ریپوی خصوصی گیت‌هاب میاد.', '<button type="button" class="btn primary" data-go="#/backup">وصل کردن</button>');
    return { title: 'اینستاگرام', back: '/more', tab: 'more', html: h };
  }
  const media = igMediaList();
  if (!IG && !IG_STATUS) {
    h += '<div class="card"><div class="card-h"><b>اتصال اینستاگرام هنوز راه نیفتاده</b></div><p class="muted small">بعد از راه‌اندازی، گیت‌هاب هر ۳ ساعت آمار پست‌ها رو از API رسمی اینستاگرام می‌گیره و اپ خودش واردشون می‌کنه: تاریخ و ساعت دقیق انتشار، ویو، ریچ، لایک، کامنت، شیر، سیو، واچ‌تایم و اسکیپ‌ریت. فالوور جدید از هر ریلز رو اینستاگرام از این راه نمی‌ده.</p>' +
      '<button type="button" class="btn primary mt8" data-go="#/ig/setup">راهنمای راه‌اندازی</button></div>';
    return { title: 'اینستاگرام', back: '/more', tab: 'more', html: h };
  }
  const acc = (IG && IG.account) || (IG_STATUS && IG_STATUS.account) || {};
  const fetched = IG && IG.fetchedAt ? new Date(IG.fetchedAt) : null;
  h += '<div class="card"><div class="card-h"><b>' + esc(acc.username ? '@' + acc.username : 'اینستاگرام') + '</b>' +
    (fetched ? '<span class="muted small">آخرین دریافت: ' + esc(fmtWhen(dateToISO(fetched), pad2(fetched.getHours()) + ':' + pad2(fetched.getMinutes()))) + '</span>' : '') + '</div>' +
    '<div class="kpis three"><div class="kpi"><div class="kl">فالوور</div><div class="kv">' + fmtNum(acc.followers_count) + '</div></div>' +
    '<div class="kpi"><div class="kl">پست‌ها</div><div class="kv">' + fmtNum(media.length) + '</div></div>' +
    '<div class="kpi"><div class="kl">وصل‌شده</div><div class="kv">' + fmtNum(media.length - igUnlinked().length - S.igIgnored.length) + '</div></div></div>' +
    '<div class="btn-row"><button type="button" class="btn sm" data-dispatch>' + ic('refresh') + 'الان دریافت کن</button><button type="button" class="btn sm ghost" data-go="#/ig/setup">راهنما و تنظیمات</button></div></div>';
  h += igStatusHtml();
  const un = igUnlinked();
  if (un.length) {
    h += '<section class="sec">' + secHead('پست‌هایی که توی اپ نیستن یا وصل نشدن', '<button type="button" class="link" data-all>ساخت همه</button>') +
      '<p class="muted small">اگه پستی رو قبلاً توی اپ ثبت کردی، «وصل به…» رو بزن تا تکراری نشه. بقیه رو با «ساخت پست» اضافه کن؛ سری و برچسب‌هاشون رو بعداً تعیین کن یا از Claude بخواه پیشنهاد بده.</p><div class="cards">' +
      un.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || '')).map((m) => {
        const loc = igLocal(m.timestamp);
        const cands = igCandidates(m).slice(0, 2);
        return '<article class="icard ig-card" data-ig="' + esc(m.id) + '"><div class="icard-top">' + badgeHtml(nameOf(FORMATS, igFormat(m)) || 'پست') +
          '<span class="icard-date">' + (loc ? esc(fmtWhenG(loc.date, loc.time)) : '') + '</span></div><h3>' + esc(igTitle(m)) + '</h3>' +
          (m.latest && m.latest.m ? '<div class="stats-row">' + (m.latest.m.views != null ? statMini(fmtCompact(+m.latest.m.views), 'ویو') : '') + (m.latest.m.reach != null ? statMini(fmtCompact(+m.latest.m.reach), 'ریچ') : '') + (m.latest.m.saved != null ? statMini(fmtNum(+m.latest.m.saved), 'سیو') : '') + '</div>' : '') +
          '<div class="ig-act">' + cands.map((c) => '<button type="button" class="btn sm" data-link="' + esc(c.it.id) + '">' + ic('check') + 'وصل به «' + esc(Array.from(c.it.title).slice(0, 26).join('')) + '»</button>').join('') +
          '<button type="button" class="btn sm" data-pick>وصل به…</button><button type="button" class="btn sm" data-create>' + ic('plus') + 'ساخت پست</button><button type="button" class="btn sm ghost" data-ignore>نادیده</button></div></article>';
      }).join('') + '</div></section>';
  } else if (media.length) {
    h += '<p class="muted small center mt16">همه‌ی پست‌های اینستاگرام به پست‌های اپ وصل شدن.</p>';
  }
  const series = IG && Array.isArray(IG.followersSeries) ? IG.followersSeries : [];
  if (series.length > 1) {
    const byDay = {};
    series.forEach((p) => { byDay[dateToISO(new Date(p.at))] = p.n; });
    const days = Object.keys(byDay).sort().slice(-15);
    const rows = [];
    for (let i = days.length - 1; i > 0; i--) rows.push({ d: days[i], n: byDay[days[i]], delta: byDay[days[i]] - byDay[days[i - 1]] });
    if (rows.length) {
      h += '<section class="sec">' + secHead('فالوورهای پیج', '<span class="muted small">آخر هر روز</span>') + '<div class="list">' + rows.map((r) =>
        '<div class="row static"><span class="rt"><b>' + esc(fmtJShort(r.d)) + '</b></span><span class="rank-v">' + fmtNum(r.n) + '</span><span class="fdelta ' + (r.delta > 0 ? 'good' : r.delta < 0 ? 'bad' : '') + '">' + (r.delta > 0 ? '+' : '') + fmtNum(r.delta) + '</span></div>').join('') + '</div></section>';
    }
  }
  if (S.igIgnored.length) h += '<div class="center mt16"><button type="button" class="link" data-unignore>نمایش دوباره‌ی ' + faNum(S.igIgnored.length) + ' پست نادیده‌گرفته</button></div>';
  return {
    title: 'اینستاگرام',
    back: '/more',
    tab: 'more',
    html: h,
    mount: (root) => {
      root.addEventListener('click', async (e) => {
        if (e.target.closest('[data-dispatch]')) {
          try {
            await igDispatch();
            toast('درخواست فرستاده شد؛ چند دقیقه بعد آمار تازه میاد');
          } catch (err) {
            toast(err.status === 404 ? 'فایل زمان‌بندی اینستاگرام توی ریپو نیست؛ راهنما رو ببین' : syncErrorText(err));
          }
          return;
        }
        if (e.target.closest('[data-all]')) {
          const list = igUnlinked();
          const ok = await confirmBox({ title: 'ساخت ' + faNum(list.length) + ' پست؟', text: 'برای هر پست اینستاگرامی که وصل نشده، یک پست تازه با سری «سایر» ساخته می‌شه. اگه بعضی‌هاشون قبلاً توی اپ هستن، اول اون‌ها رو با «وصل به…» وصل کن.', ok: 'ساخت همه' });
          if (!ok) return;
          await keepSafetyCopy();
          list.forEach(igCreate);
          save();
          toast(faNum(list.length) + ' پست ساخته شد');
          rerender();
          return;
        }
        if (e.target.closest('[data-unignore]')) {
          S.igIgnored = [];
          save();
          rerender();
          return;
        }
        const card = e.target.closest('[data-ig]');
        if (!card) return;
        const m = igMediaList().find((x) => x.id === card.dataset.ig);
        if (!m) return;
        const ln = e.target.closest('[data-link]');
        if (ln) {
          const it = itemById(ln.dataset.link);
          if (it) {
            igLink(it, m);
            save();
            toast('به «' + it.title + '» وصل شد');
            rerender();
          }
          return;
        }
        if (e.target.closest('[data-pick]')) {
          const pool = activeItems().filter((i) => !i.igId).sort((a, b) => pubKey(b) - pubKey(a));
          const v = await pickOne({ title: 'وصل به کدوم پست؟', options: pool.map((i) => ({ value: i.id, label: i.title, sub: (isPublished(i) ? (i.publishDate ? fmtJ(i.publishDate) : 'منتشرشده، بدون تاریخ') : stageName(i.stage)), ci: seriesById(i.series).ci })) });
          if (!v) return;
          const it = itemById(v);
          igLink(it, m);
          save();
          toast('به «' + it.title + '» وصل شد');
          rerender();
          return;
        }
        if (e.target.closest('[data-create]')) {
          const it = igCreate(m);
          save();
          toast('پست «' + it.title + '» ساخته شد');
          rerender();
          return;
        }
        if (e.target.closest('[data-ignore]')) {
          if (S.igIgnored.indexOf(m.id) < 0) S.igIgnored.push(m.id);
          save();
          rerender();
        }
      });
    },
  };
}

function igSetupStep(n, title, body, done) {
  return '<li class="setup-step' + (done === true ? ' ok' : '') + '"><div class="ss-h"><span class="ss-n">' + (done === true ? ic('check') : faNum(n)) + '</span><b>' + title + '</b></div><div class="ss-b">' + body + '</div></li>';
}

function viewIgSetup() {
  const repoUrl = SYNC ? 'https://github.com/' + SYNC.owner + '/' + SYNC.repo : '';
  const wfUrl = SYNC ? repoUrl + '/new/' + encodeURIComponent(SYNC.branch || 'main') + '?filename=' + encodeURIComponent('.github/workflows/instagram.yml') + '&value=' + encodeURIComponent(REPO_WORKFLOW) : '#';
  const h = '<p class="muted small">یک بار راه‌اندازی می‌شه و بعدش همه‌چیز خودکاره. قدم ۱ رو باید با VPN انجام بدی.</p><ol class="setup">' +
    igSetupStep(1, 'ساخت اپ در Meta و گرفتن توکن اینستاگرام',
      '<p>متا ایران رو رسماً پشتیبانی نمی‌کنه؛ برای ساخت اپ توسعه‌دهنده به یک حساب فیسبوک نیاز داری و ممکنه متا حساب توسعه‌دهنده رو محدود کنه.</p><ol class="mini-steps">' +
      '<li>developers.facebook.com/apps رو باز کن و «Create app» رو بزن. نوع اپ رو «Business» انتخاب کن.</li>' +
      '<li>محصول «Instagram» رو اضافه کن و برو به «API setup with Instagram business login».</li>' +
      '<li>توی «Generate access tokens»، حساب DR.BAZRAFSHAN.FITLIFE رو اضافه کن، وارد اینستاگرام شو و توکن رو کپی کن.</li></ol>' +
      '<a class="btn sm" href="https://developers.facebook.com/apps" target="_blank" rel="noopener">باز کردن Meta for Developers</a>') +
    igSetupStep(2, 'ثبت دو Secret در ریپوی داده‌ها',
      '<p>صفحه‌ی Secrets رو باز کن و دو بار «New repository secret» بزن:</p><ul class="mini-steps"><li><code>IG_TOKEN</code>: توکنی که از متا گرفتی</li><li><code>STUDIO_PAT</code>: همون توکن گیت‌هابی که توی اپ گذاشتی (برای تمدید خودکار توکن اینستاگرام)</li></ul>' +
      '<div class="btn-row"><a class="btn sm" href="' + esc(repoUrl + '/settings/secrets/actions/new') + '" target="_blank" rel="noopener">باز کردن Secrets</a><button type="button" class="btn sm ghost" data-copytoken>' + ic('copy') + 'کپی توکن گیت‌هاب</button></div><div class="ss-st" data-st-secrets></div>') +
    igSetupStep(3, 'نصب فایل‌های دریافت خودکار',
      '<p>اسکریپت با یک لمس از همین‌جا نصب می‌شه. فایل زمان‌بندی رو گیت‌هاب فقط از صفحه‌ی خودش قبول می‌کنه: دکمه‌ی دوم رو بزن و توی صفحه‌ای که باز می‌شه «Commit changes» رو بزن.</p>' +
      '<div class="btn-row"><button type="button" class="btn sm" data-install>' + ic('download') + 'نصب اسکریپت</button><a class="btn sm" href="' + esc(wfUrl) + '" target="_blank" rel="noopener">ساخت فایل زمان‌بندی</a></div><div class="ss-st" data-st-files></div>') +
    igSetupStep(4, 'اولین دریافت',
      '<p>بعد از قدم‌های بالا این دکمه رو بزن. چند دقیقه بعد، آمار توی بخش اینستاگرام میاد و از اون به بعد هر ۳ ساعت خودکار به‌روز می‌شه.</p><button type="button" class="btn sm primary" data-dispatch>' + ic('refresh') + 'اولین دریافت</button>') +
    '</ol>';
  return {
    title: 'راه‌اندازی اینستاگرام',
    back: '/ig',
    tab: 'more',
    html: SYNC ? h : emptyHtml('cloud', 'اول پشتیبان خودکار رو وصل کن', '', '<button type="button" class="btn primary" data-go="#/backup">وصل کردن</button>'),
    mount: async (root) => {
      if (!SYNC) return;
      const check = async () => {
        const stS = root.querySelector('[data-st-secrets]');
        const stF = root.querySelector('[data-st-files]');
        try {
          const sec = await gh('GET', repoPath('/actions/secrets?per_page=50'));
          const names = (sec && sec.secrets ? sec.secrets : []).map((x) => x.name);
          stS.innerHTML = ['IG_TOKEN', 'STUDIO_PAT'].map((n) => '<span class="' + (names.indexOf(n) >= 0 ? 'ok-t' : 'no-t') + '">' + (names.indexOf(n) >= 0 ? '✓ ' : '✗ ') + n + '</span>').join('');
        } catch (e) {
          stS.textContent = '';
        }
        try {
          const a = await ghStat('scripts/instagram-sync.mjs');
          const b = await ghStat('.github/workflows/instagram.yml');
          stF.innerHTML = '<span class="' + (a ? 'ok-t' : 'no-t') + '">' + (a ? '✓' : '✗') + ' اسکریپت</span><span class="' + (b ? 'ok-t' : 'no-t') + '">' + (b ? '✓' : '✗') + ' فایل زمان‌بندی</span>';
        } catch (e) {
          stF.textContent = '';
        }
      };
      check();
      root.addEventListener('click', async (e) => {
        if (e.target.closest('[data-copytoken]')) { copyText(SYNC.token, 'توکن کپی شد؛ به‌عنوان STUDIO_PAT بذارش'); return; }
        if (e.target.closest('[data-install]')) {
          try {
            const st = await ghStat('scripts/instagram-sync.mjs');
            await ghWrite('scripts/instagram-sync.mjs', REPO_IG_SCRIPT, st ? st.sha : undefined, 'اسکریپت دریافت آمار اینستاگرام');
            toast('اسکریپت نصب شد');
            check();
          } catch (err) {
            toast(syncErrorText(err));
          }
          return;
        }
        if (e.target.closest('[data-dispatch]')) {
          try {
            await igDispatch();
            toast('درخواست فرستاده شد؛ چند دقیقه بعد بخش اینستاگرام رو ببین');
          } catch (err) {
            toast(err.status === 404 ? 'فایل زمان‌بندی هنوز ساخته نشده' : syncErrorText(err));
          }
        }
      });
    },
  };
}

/* ---------- مسیریابی و پوسته‌ی اپ ---------- */
let _navDepth = 0;
let _cur = null;

const ROUTES = [
  [/^\/?$/, () => viewHome()],
  [/^\/content$/, (m, q) => viewContent(q)],
  [/^\/item\/([^/]+)$/, (m, q) => viewItem(m[1], q)],
  [/^\/item\/([^/]+)\/stat\/([^/]+)$/, (m, q) => viewStatForm(m[1], m[2], q)],
  [/^\/calendar$/, (m, q) => viewCalendar(q)],
  [/^\/analysis$/, (m, q) => viewAnalysis(q)],
  [/^\/more$/, () => viewMore()],
  [/^\/funnel$/, (m, q) => viewFunnel(q)],
  [/^\/learnings$/, (m, q) => viewLearnings(q)],
  [/^\/snippets$/, (m, q) => viewSnippets(q)],
  [/^\/backup$/, () => viewBackup()],
  [/^\/help$/, () => viewHelp()],
  [/^\/settings$/, () => viewSettings()],
  [/^\/settings\/series$/, () => viewSeriesSettings()],
  [/^\/settings\/list\/(\w+)$/, (m) => viewListSettings(m[1])],
  [/^\/settings\/checklist$/, () => viewChecklistSettings()],
  [/^\/settings\/prompts$/, () => viewPromptSettings()],
  [/^\/claude$/, () => viewClaude()],
  [/^\/claude\/(.+)$/, (m) => viewClaudeEntry(decodeURIComponent(m[1]))],
  [/^\/ig$/, () => viewInstagram()],
  [/^\/ig\/setup$/, () => viewIgSetup()],
  [/^\/sync\/history$/, () => viewSyncHistory()],
];

function parseHash() {
  const h = (location.hash || '#/').slice(1) || '/';
  const i = h.indexOf('?');
  const path = i >= 0 ? h.slice(0, i) : h;
  const q = {};
  if (i >= 0) new URLSearchParams(h.slice(i + 1)).forEach((v, k) => { q[k] = v; });
  return { path, q };
}

function errorView(err) {
  return {
    title: 'خطا',
    back: '/',
    tab: '',
    html: emptyHtml('alert', 'این صفحه باز نشد', 'متن خطا: ' + esc(err && err.message ? err.message : String(err)) + '<br>اگه تکرار شد، یک پشتیبان بگیر و به Claude بگو.', '<button type="button" class="btn" data-go="#/">برگشت به خانه</button>'),
  };
}

function render(keepScroll) {
  const y = window.scrollY;
  const { path, q } = parseHash();
  let v = null;
  for (const [re, fn] of ROUTES) {
    const m = path.match(re);
    if (m) {
      try { v = fn(m, q); } catch (e) { console.error(e); v = errorView(e); }
      break;
    }
  }
  if (!v) v = viewHome();
  _cur = v;

  const tb = document.getElementById('topbar');
  tb.innerHTML =
    (v.back ? '<button type="button" class="icon-btn" data-nav-back aria-label="برگشت">' + ic('back') + '</button>' : '') +
    '<div class="tb-t"><h1>' + esc(v.title || '') + '</h1>' + (v.sub ? '<div class="tb-sub">' + esc(v.sub) + '</div>' : '') + '</div>' +
    (v.actions || []).map((a, i) => '<button type="button" class="icon-btn' + (a.sync ? ' sync-btn' : '') + '" data-tb="' + i + '" aria-label="' + esc(a.label) + '" title="' + esc(a.label) + '">' + ic(a.icon) +
      (a.sync ? '<span class="syncdot" data-syncdot data-state="' + _syncState + '"></span>' : '') + '</button>').join('');

  const main = document.getElementById('main');
  const view = document.createElement('div');
  view.className = 'view';
  view.innerHTML = v.html;
  main.replaceChildren(view);

  $$('#nav a').forEach((a) => {
    const on = a.dataset.tab === v.tab;
    a.classList.toggle('on', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  const fab = document.getElementById('fab');
  if (v.fab) {
    fab.hidden = false;
    fab.innerHTML = ic(v.fab.icon || 'plus');
    fab.setAttribute('aria-label', v.fab.label);
  } else fab.hidden = true;

  document.title = (v.title && v.title !== 'استودیو محتوا' ? v.title + ' | ' : '') + 'استودیو محتوا';
  if (v.mount) {
    try { v.mount(view); } catch (e) { console.error(e); }
  }
  mountCharts(view);
  autogrowAll(view);
  window.scrollTo(0, keepScroll ? y : 0);
}

function rerender() {
  render(true);
}

function go(hash) {
  if (_sheets.length) { closeSheet(() => go(hash)); return; }
  if (location.hash === hash || (hash === '#/' && !location.hash)) { rerender(); return; }
  _navDepth++;
  location.hash = hash;
}

function goBack() {
  if (_navDepth > 0) history.back();
  else location.replace('#' + (_cur && _cur.back ? _cur.back : '/'));
}

function setQuery(patch) {
  const { path, q } = parseHash();
  const nq = Object.assign({}, q, patch);
  for (const k in nq) if (nq[k] == null || nq[k] === '') delete nq[k];
  const qs = new URLSearchParams(nq).toString();
  history.replaceState(history.state, '', '#' + path + (qs ? '?' + qs : ''));
  render(true);
}

// المان «اقدام» زیر کلیک؛ اگر نزدیک‌ترین هدف یک لینک (data-go) باشد null برمی‌گرداند
function actEl(e) {
  const t = e.target.closest('[data-act],[data-go]');
  return t && t.dataset.act ? t : null;
}

window.addEventListener('hashchange', () => render(false));
window.addEventListener('popstate', () => {
  if (_lastPopWasSheet) { _lastPopWasSheet = false; return; }
  if (_navDepth > 0) _navDepth--;
});

document.addEventListener('click', (e) => {
  if (e.defaultPrevented) return;
  if (e.target.closest('[data-nav-back]')) { goBack(); return; }
  const tb = e.target.closest('[data-tb]');
  if (tb) { if (_cur && _cur.actions) _cur.actions[+tb.dataset.tb].fn(); return; }
  if (e.target.closest('#fab')) { if (_cur && _cur.fab) _cur.fab.fn(); return; }
  const t = e.target.closest('[data-go],[data-act],a[href^="#/"]');
  if (!t) return;
  if (t.dataset.go) { e.preventDefault(); go(t.dataset.go); return; }
  if (t.tagName === 'A' && !t.dataset.act) { e.preventDefault(); go(t.getAttribute('href')); }
});

// وقتی کیبورد باز است (تایپ در فیلد) نوار پایین پنهان می‌شود
const TYPING_SEL = 'input:not([type="checkbox"]):not([type="file"]), textarea, select';
document.addEventListener('focusin', (e) => {
  if (e.target.matches && e.target.matches(TYPING_SEL)) document.body.classList.add('typing');
});
document.addEventListener('focusout', () => {
  setTimeout(() => {
    const a = document.activeElement;
    if (!a || !a.matches || !a.matches(TYPING_SEL)) document.body.classList.remove('typing');
  }, 120);
});

// کارت‌هایی که لینک‌اند با کیبورد هم باز شوند
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const t = e.target;
  if (t && t.matches && t.matches('article[data-go], article[data-act]')) {
    e.preventDefault();
    t.click();
  }
});

window.addEventListener('scroll', () => {
  document.getElementById('topbar').classList.toggle('scrolled', window.scrollY > 4);
}, { passive: true });

/* ---------- فایل‌های ریپوی داده‌ها (ساخته‌شده از پوشه‌ی data-repo) ---------- */
const REPO_README = "# داده‌های استودیو محتوا\n\nاین ریپو **خصوصیه** و داده‌های اپ «استودیو محتوا» اینجا نگه داشته می‌شه. هیچ‌وقت Public نکنش.\n\n| فایل یا پوشه | چیه |\n|---|---|\n| `state.json` | همه‌ی داده‌های اپ. اپ بعد از هر تغییر خودش اینجا ذخیره‌شون می‌کنه. |\n| تاریخچه‌ی `state.json` | هر ذخیره یک نسخه‌ست. از داخل اپ: بیشتر ← پشتیبان‌گیری ← تاریخچه‌ی نسخه‌ها. |\n| `inbox/` | تحلیل‌ها و پیشنهادهای Claude. اپ خودش می‌خونه‌شون. |\n| `instagram/` | آماری که گیت‌هاب هر ۳ ساعت از اینستاگرام می‌گیره. |\n| `scripts/`، `.github/workflows/` | برنامه‌ی دریافت آمار اینستاگرام. |\n| `CLAUDE.md` | راهنمای Claude برای خوندن داده‌ها و نوشتن تحلیل. |\n\nدستی چیزی رو اینجا عوض نکن؛ همه‌ی تغییرها از داخل اپ انجام می‌شه.\n\n## Secrets اینستاگرام\n\nSettings ← Secrets and variables ← Actions ← New repository secret:\n\n- `IG_TOKEN`: توکن اینستاگرام که از Meta for Developers گرفتی.\n- `STUDIO_PAT`: همون توکن گیت‌هابی که توی اپ گذاشتی. باهاش توکن اینستاگرام هر هفته خودکار تمدید می‌شه.\n\nراهنمای قدم‌به‌قدم داخل خود اپه: بیشتر ← اینستاگرام ← راهنما و تنظیمات.\n\n## اگه گوشی گم شد\n\nتوکن گیت‌هاب اپ رو از github.com/settings/personal-access-tokens پاک کن و یک توکن تازه بساز.\n";
const REPO_CLAUDE = "# studio-data — instructions for Claude\n\nThis private repo holds the data of «استودیو محتوا», Dr. Mohammad Bazrafshan's Instagram content app\n(PWA: https://mbx3.github.io/content-studio/, code: mbx3/content-studio). He talks to you in Persian,\nin the Claude Project «کار و تولید محتوا کلینیک».\n\nThree writers, three areas. Stay in yours:\n\n| Path | Written by | Claude may |\n|---|---|---|\n| `state.json` | the app (auto-backup after every change) | read only |\n| `instagram/media.json`, `instagram/status.json` | GitHub Actions (`.github/workflows/instagram.yml`, `scripts/instagram-sync.mjs`) every 3 hours | read only |\n| `inbox/*.json` | **Claude** | add new files only |\n\nNever edit `state.json`: the app owns it and would overwrite or merge your edit unpredictably.\nEvery change you want in the app goes through an inbox suggestion that the user applies with one tap.\nNever read, print or commit secrets (`IG_TOKEN`, `STUDIO_PAT`).\n\n## Answering a request\n\n1. `add_repo mbx3/studio-data` with push access, clone it, load `state.json` (and `instagram/media.json` if present) with Python.\n2. Open questions the user asked from the app are in `data.questions` with `status: \"open\"`; the chat message quotes the question id (`q-…`).\n3. Read `data.inbox[*].decisions` first: it shows which of your earlier suggestions he applied or rejected. Don't repeat rejected ones.\n4. Compute with code, never by eye. Report the number of posts behind every comparison. With small groups (n ≤ 3), call it a hypothesis worth a Trial Reel, not a finding.\n5. Write **one new file** `inbox/YYYYMMDD-HHMM-<slug>.json` (UTC time) using the schema below. Set `answers` to the question id when answering one.\n6. Commit with message `تحلیل Claude: <title>`, `git pull --rebase`, push.\n7. In chat, give a short summary and tell him: «توی اپ: بیشتر ← تحلیل‌های Claude ← بروزرسانی».\n\nIf the repo isn't reachable (GitHub App not installed), produce the same JSON as a file in chat; he imports it from «وارد کردن از فایل».\n\n## Data model (`state.json` → `data`)\n\n`items[]` — posts and ideas:\n`id, title, series, stage (idea|script|shoot|edit|ready|published), goal (attract|trust|sell|null), format (reel|carousel|post|story), pubType (normal|trial|collab|collab2), style, hookType, ctaType, source, concerns[], location, priority (high|mid|low), notes, plannedDate, plannedTime, publishDate (YYYY-MM-DD, Tehran local), publishTime (HH:MM, or null = unknown), durationSec, script{hook,retention,body,cta,shots}, cover{text,notes}, caption, sources[{id,text,verified}], checklist{ruleId:true}, snapshots[], archived, igId, permalink, createdAt, updatedAt`\n\n`items[].snapshots[]` — one stats reading:\n`id, t (hours after publishing; null = unknown), label, takenAt, views, reach (Accounts reached: the denominator), follows, profileVisits, likes, comments, shares, saves, reposts, likesPct, commentsPct, sharesPct, savesPct, repostsPct (% of reach, as Instagram shows them), skipRate (%), avgWatch (seconds), followersPct (% of viewers who already followed), age2554, age1317 (%), src{reels, explore, feed, stories, profile, other} (% of views), note, ig (true = from the Instagram API), igLatest (the rolling latest API reading), by`\n\nOther collections:\n- `leads[]`: `date, type (dm|booking|visit|online), count, center, itemId, channel` — patient funnel, numbers only, no patient data.\n- `learnings[]`: `text, status (hyp|test|ok|no), category, itemIds[], date`.\n- `snippets[]`: `kind (hook|cta|retention|cover), text, series, itemId, used, result (good|bad|null)`.\n- `questions[]`: `id, text, itemId, status (open|answered), answerKey, createdAt`.\n- `inbox{key: {title, createdAt, report, suggestions, decisions{suggestionId: {d: applied|rejected, at, r}}}}`.\n- `settings.series[]`: `id, name, short`. Defaults: `qa` «۳۰ ثانیه، یک سوال», `sci` «علم رژیم», `fun` طنز و سرگرمی, `self` از خودم, `cook` آشپزخونه, `clinic` کولب کلینیک, `other` سایر.\n- `settings.lists`: `sources, concerns, styles, hookTypes, ctaTypes, locations, centers, channels, lcats` (learning categories).\n- `settings.checklist[]`, `settings.checkpoints` (hours, default 24/72/168/720), `settings.profile`, `settings.templates`.\n- `tomb{id: deletedAt}`: deleted records; ignore those ids.\n\n## Metrics (same definitions as the app)\n\n- Follow conversion = follows ÷ reach × 100. The page's key growth metric.\n- Save rate = savesPct, else saves ÷ reach × 100. Share and comment rates likewise.\n- Retention = avgWatch ÷ durationSec. Profile visits per 1,000 reach. Non-follower share = 100 − followersPct.\n- \"Latest\" = the last snapshot that has the value. Comparing at a fixed checkpoint (`t == 72` etc.) is fairer between old and new posts.\n- Exclude `pubType` collab/collab2 from page baselines by default: their views come from the clinic's page.\n- The Instagram API gives no follows or profile visits for Reels; those exist only where he entered them by hand.\n\n## Inbox file schema\n\n```json\n{\n  \"kind\": \"studio-inbox\",\n  \"version\": 1,\n  \"id\": \"20261027-0930-weekly\",\n  \"createdAt\": \"2026-10-27T09:30:00Z\",\n  \"title\": \"تحلیل هفتگی\",\n  \"answers\": \"q-xxxx\",\n  \"report\": \"## عنوان\\nمتن، - فهرست، 1. فهرست شماره‌دار، **پررنگ**، | جدول |، > نقل‌قول\",\n  \"suggestions\": [\n    { \"id\": \"s1\", \"type\": \"learning\", \"text\": \"…\", \"status\": \"hyp\", \"category\": \"فرمت\", \"itemIds\": [\"…\"], \"why\": \"…\" }\n  ]\n}\n```\n\nSuggestion types (every suggestion may carry `why`):\n\n| type | fields |\n|---|---|\n| `learning` | `text, status (hyp|test|ok|no), category?, itemIds?` |\n| `idea` | `title, series, goal?, notes?, concerns?, format?, hook?, source?, priority?, style?` |\n| `snippet` | `kind (hook|cta|retention|cover), text, series?, itemId?` |\n| `update` | `itemId, set{series, goal, format, pubType, style, hookType, ctaType, source, location, concerns, durationSec, publishDate, publishTime, title, caption, priority, stage}` |\n| `note` | `itemId, text` (appended to the post's notes) |\n| `snapshot` | `itemId, snapshot{t or label, views, reach, follows, …, src{…}}, durationSec?` |\n| `post` | `item{title, series, publishDate, publishTime?, pubType, format, durationSec?, style?, hookType?, ctaType?, goal?, caption?, notes?}, snapshots[]` |\n| `checklist` | `text` (a new pre-publish rule) |\n\nReuse existing list values (`settings.lists`) for style, hookType, ctaType, source, location, concerns and category whenever one fits; a new value is added to the list when applied.\nKeep `report` readable on a phone: short sections, small tables, no wall of text.\n\n## Insights screenshots\n\nWhen he sends screenshots of Instagram Insights, match each to a post (title or date → `itemId`), read the numbers exactly and skip anything unreadable.\nMap: Accounts reached → `reach`; Views → `views`; the percentages beside interactions → `*Pct`; average watch time → `avgWatch` in seconds; skip rate → `skipRate`; follows → `follows`; traffic sources → `src`; follower share → `followersPct`.\nSet `t` to the hours since publishing when known, else a `label`. Write `snapshot` suggestions, or `post` suggestions for posts the app doesn't have.\n\n## Voice and values\n\nPersian, conversational, concrete, tied to his own past numbers and his audience (adults 25–54 losing weight with diet or injections).\nScientific accuracy first, uncertainty disclosed, no patient shaming, no drug brand names in his own text.\nJudge ideas by whether they grow the page and bring patients (dm/booking leads), not by views alone.\n";
const REPO_WORKFLOW = "name: instagram\non:\n  schedule:\n    - cron: '17 */3 * * *'\n  workflow_dispatch:\npermissions:\n  contents: write\nconcurrency:\n  group: instagram\n  cancel-in-progress: false\njobs:\n  fetch:\n    runs-on: ubuntu-latest\n    timeout-minutes: 15\n    steps:\n      - uses: actions/checkout@v4\n        with:\n          fetch-depth: 0\n      - name: Fetch Instagram data\n        env:\n          IG_TOKEN: ${{ secrets.IG_TOKEN }}\n          STUDIO_PAT: ${{ secrets.STUDIO_PAT }}\n        run: node scripts/instagram-sync.mjs\n      - name: Commit\n        run: |\n          git config user.name \"studio-bot\"\n          git config user.email \"github-actions[bot]@users.noreply.github.com\"\n          git add instagram\n          if git diff --cached --quiet; then exit 0; fi\n          git commit -m \"instagram: $(date -u +%Y-%m-%dT%H:%MZ)\"\n          for i in 1 2 3 4 5; do\n            git pull --rebase origin \"${GITHUB_REF_NAME}\" && git push origin \"HEAD:${GITHUB_REF_NAME}\" && exit 0\n            sleep $((i * 5))\n          done\n          exit 1\n";
const REPO_IG_SCRIPT = "// دریافت آمار اینستاگرام برای «استودیو محتوا»\n// در GitHub Actions اجرا می‌شود (فایل .github/workflows/instagram.yml) و خروجی را در پوشه‌ی instagram/ می‌نویسد.\n// فقط از ماژول‌های خود Node استفاده می‌کند. Secrets: IG_TOKEN (اجباری)، STUDIO_PAT (برای تمدید خودکار توکن).\nimport fs from 'node:fs';\nimport path from 'node:path';\nimport { spawnSync } from 'node:child_process';\n\nconst TOKEN = (process.env.IG_TOKEN || '').trim();\nconst PAT = (process.env.STUDIO_PAT || '').trim();\nconst REPO = process.env.GITHUB_REPOSITORY || '';\nconst API_BASE = (process.env.IG_API_BASE || 'https://graph.instagram.com').replace(/\\/+$/, '');\nconst VERSION = process.env.IG_API_VERSION || 'v25.0';\nconst OUT = process.env.STUDIO_OUT || 'instagram';\nconst NOW = new Date(process.env.STUDIO_NOW || Date.now());\nconst HOUR = 3600000;\n\nconst CHECKPOINTS = [24, 72, 168, 720];\nconst WINDOW = { 24: 12, 72: 24, 168: 48, 720: 120 }; // اگر دیرتر از این برسیم، آن مقطع ثبت نمی‌شود\nconst RECENT_H = 45 * 24; // پست‌های تازه‌تر از این، هر بار به‌روز می‌شوند\nconst OLD_REFRESH_H = 7 * 24; // پست‌های قدیمی هفته‌ای یک بار\nconst MAX_MEDIA = 600;\n\nconst REELS_METRICS = ['views', 'reach', 'likes', 'comments', 'shares', 'saved', 'reposts', 'total_interactions', 'ig_reels_avg_watch_time', 'ig_reels_video_view_total_time', 'reels_skip_rate'];\nconst FEED_METRICS = ['views', 'reach', 'likes', 'comments', 'shares', 'saved', 'reposts', 'total_interactions', 'follows', 'profile_visits'];\n\nclass ApiError extends Error {\n  constructor(message, code, status) {\n    super(message);\n    this.code = code;\n    this.status = status;\n  }\n}\n\nconst sleep = (ms) => new Promise((r) => setTimeout(r, ms));\nconst round1 = (n) => Math.round(n * 10) / 10;\nconst isToken = (e) => e && (e.code === 190 || e.code === 102);\nconst isRate = (e) => e && [4, 17, 32, 613].includes(e.code);\n\nfunction readJSON(file, fallback) {\n  try {\n    return JSON.parse(fs.readFileSync(file, 'utf8'));\n  } catch (e) {\n    return fallback;\n  }\n}\n\nfunction writeJSON(file, data) {\n  fs.mkdirSync(path.dirname(file), { recursive: true });\n  fs.writeFileSync(file, JSON.stringify(data, null, 1) + '\\n');\n}\n\nfunction normTs(ts) {\n  return String(ts || '').replace(/([+-]\\d\\d)(\\d\\d)$/, '$1:$2');\n}\n\nasync function getJSON(url) {\n  for (let attempt = 0; attempt < 3; attempt++) {\n    let res;\n    try {\n      res = await fetch(url, { headers: { Accept: 'application/json' } });\n    } catch (e) {\n      if (attempt === 2) throw new ApiError('network: ' + e.message, 'network');\n      await sleep(2000 * (attempt + 1));\n      continue;\n    }\n    const text = await res.text();\n    let data = null;\n    try { data = JSON.parse(text); } catch (e) { data = null; }\n    if (res.ok && data && !data.error) return data;\n    if (res.status >= 500 && attempt < 2) {\n      await sleep(2000 * (attempt + 1));\n      continue;\n    }\n    const err = data && data.error ? data.error : { message: 'HTTP ' + res.status };\n    throw new ApiError(err.message || 'error', err.code, res.status);\n  }\n  throw new ApiError('unreachable', 'network');\n}\n\nfunction apiUrl(p, params) {\n  const url = new URL(API_BASE + '/' + VERSION + p);\n  for (const [k, v] of Object.entries(params || {})) url.searchParams.set(k, String(v));\n  url.searchParams.set('access_token', TOKEN);\n  return url.toString();\n}\n\nconst api = (p, params) => getJSON(apiUrl(p, params));\n\nasync function listMedia() {\n  const fields = 'id,caption,media_type,media_product_type,permalink,timestamp,thumbnail_url,like_count,comments_count';\n  let page = await api('/me/media', { fields, limit: 50 });\n  const out = [...(page.data || [])];\n  while (page.paging && page.paging.next && out.length < MAX_MEDIA) {\n    page = await getJSON(page.paging.next);\n    out.push(...(page.data || []));\n  }\n  return out;\n}\n\nfunction parseInsights(d) {\n  const out = {};\n  for (const row of (d && d.data) || []) {\n    let v = null;\n    if (Array.isArray(row.values) && row.values.length) v = row.values[0].value;\n    else if (row.total_value) v = row.total_value.value;\n    if (typeof v === 'number') out[row.name] = v;\n  }\n  return out;\n}\n\n// شاخصی که برای چند پست خطا بدهد و برای هیچ پستی جواب ندهد، تا یک هفته درخواست نمی‌شود\nconst failCount = {};\nconst okMetric = {};\nlet knownSkip = {};\nconst skipMetric = (kind, m) => (knownSkip[kind] || []).includes(m) || (failCount[kind + ':' + m] || 0) >= 3;\n\nasync function mediaInsights(m) {\n  const kind = m.media_product_type === 'REELS' ? 'REELS' : 'FEED';\n  const want = (kind === 'REELS' ? REELS_METRICS : FEED_METRICS).filter((x) => !skipMetric(kind, x));\n  if (!want.length) return {};\n  try {\n    const res = parseInsights(await api('/' + m.id + '/insights', { metric: want.join(',') }));\n    for (const k of Object.keys(res)) okMetric[kind + ':' + k] = true;\n    return res;\n  } catch (e) {\n    if (isToken(e) || isRate(e) || e.code === 'network') throw e;\n  }\n  const out = {};\n  for (const metric of want) {\n    try {\n      Object.assign(out, parseInsights(await api('/' + m.id + '/insights', { metric })));\n      okMetric[kind + ':' + metric] = true;\n    } catch (e) {\n      if (isToken(e) || isRate(e) || e.code === 'network') throw e;\n      failCount[kind + ':' + metric] = (failCount[kind + ':' + metric] || 0) + 1;\n    }\n  }\n  return out;\n}\n\nfunction dueCheckpoint(ageH, cps) {\n  return CHECKPOINTS.some((c) => ageH >= c && ageH < c + WINDOW[c] && !cps[c]);\n}\n\n// روزهای تقویمی به وقت تهران (UTC+03:30)\nconst TEHRAN = 3.5 * HOUR;\nfunction tehranDay(t) {\n  return new Date(t + TEHRAN).toISOString().slice(0, 10);\n}\nfunction tehranDayStart(dayStr) {\n  return Date.parse(dayStr + 'T00:00:00Z') - TEHRAN;\n}\n\nasync function fillDailyFollows(daily) {\n  const today = tehranDay(NOW.getTime());\n  const days = [];\n  const back = Object.keys(daily).length ? 4 : 30;\n  for (let i = back; i >= 1; i--) days.push(tehranDay(NOW.getTime() - i * 24 * HOUR));\n  days.push(today);\n  for (const day of days) {\n    const since = Math.floor(tehranDayStart(day) / 1000);\n    const until = Math.min(Math.floor(NOW.getTime() / 1000), since + 86400);\n    if (until <= since) continue;\n    const d = await api('/me/insights', { metric: 'follows_and_unfollows', period: 'day', metric_type: 'total_value', breakdown: 'follow_type', since, until });\n    const row = (d.data || [])[0];\n    if (!row || !row.total_value) continue;\n    const rec = { total: row.total_value.value != null ? row.total_value.value : null };\n    for (const b of row.total_value.breakdowns || []) {\n      for (const r of b.results || []) rec[(r.dimension_values || []).join('/') || 'value'] = r.value;\n    }\n    daily[day] = rec;\n  }\n  const keys = Object.keys(daily).sort();\n  while (keys.length > 400) delete daily[keys.shift()];\n}\n\nasync function maybeRefreshToken(status) {\n  if (!TOKEN || status.errorCode === 'token') return;\n  if (!status.tokenSeenAt) status.tokenSeenAt = NOW.toISOString();\n  const last = status.tokenRefreshedAt ? Date.parse(status.tokenRefreshedAt) : 0;\n  if (NOW.getTime() - last < 6 * 24 * HOUR) return;\n  if (!PAT) {\n    status.warnings.push('برای تمدید خودکار توکن اینستاگرام، STUDIO_PAT رو هم توی Secrets بذار؛ وگرنه توکن حدود ۶۰ روز بعد از ساختنش منقضی می‌شه.');\n    return;\n  }\n  if (!last && NOW.getTime() - Date.parse(status.tokenSeenAt) < 25 * HOUR) return; // توکن باید دست‌کم ۲۴ ساعت عمر داشته باشد\n  try {\n    const url = new URL(API_BASE + '/refresh_access_token');\n    url.searchParams.set('grant_type', 'ig_refresh_token');\n    url.searchParams.set('access_token', TOKEN);\n    const d = await getJSON(url.toString());\n    if (!d.access_token) throw new Error('پاسخ بدون توکن بود');\n    const r = spawnSync('gh', ['secret', 'set', 'IG_TOKEN', '--repo', REPO], { input: d.access_token, env: Object.assign({}, process.env, { GH_TOKEN: PAT }), encoding: 'utf8' });\n    if (r.status !== 0) throw new Error('ذخیره‌ی Secret نشد: ' + String(r.stderr || r.error || '').slice(0, 200));\n    status.tokenRefreshedAt = NOW.toISOString();\n    status.tokenExpiresAt = new Date(NOW.getTime() + (Number(d.expires_in) || 5184000) * 1000).toISOString();\n  } catch (e) {\n    status.warnings.push('تمدید توکن اینستاگرام انجام نشد: ' + e.message);\n  }\n}\n\nasync function main() {\n  const status = readJSON(path.join(OUT, 'status.json'), {});\n  const prev = readJSON(path.join(OUT, 'media.json'), {});\n  status.kind = 'studio-instagram-status';\n  status.lastRunAt = NOW.toISOString();\n  status.apiVersion = VERSION;\n  status.warnings = [];\n  const skipFresh = status.skipMetrics && status.skipMetrics.at && NOW.getTime() - Date.parse(status.skipMetrics.at) < 7 * 24 * HOUR;\n  knownSkip = skipFresh ? status.skipMetrics : {};\n  if (!TOKEN) {\n    // فقط بار اول نوشته می‌شود تا هر ۳ ساعت یک commit بی‌فایده ساخته نشود\n    if (status.errorCode !== 'no-token') {\n      Object.assign(status, { ok: false, errorCode: 'no-token', error: 'IG_TOKEN در Secrets ریپو نیست' });\n      writeJSON(path.join(OUT, 'status.json'), status);\n    }\n    console.log('IG_TOKEN is not set; nothing to do.');\n    return;\n  }\n  try {\n    const me = await api('/me', { fields: 'user_id,username,account_type,followers_count,follows_count,media_count' });\n    const media = await listMedia();\n    const prevById = new Map((prev.media || []).map((m) => [m.id, m]));\n    const out = [];\n    let fetched = 0;\n    let failed = 0;\n    let rateHit = false;\n    for (const m of media) {\n      const old = prevById.get(m.id) || {};\n      const ts = Date.parse(normTs(m.timestamp));\n      const ageH = (NOW.getTime() - ts) / HOUR;\n      const rec = {\n        id: m.id, caption: m.caption || '', media_type: m.media_type, media_product_type: m.media_product_type, permalink: m.permalink,\n        timestamp: m.timestamp, thumbnail_url: m.thumbnail_url || null, like_count: m.like_count, comments_count: m.comments_count,\n        checkpoints: old.checkpoints || {}, latest: old.latest || null,\n      };\n      const lastAt = old.latest ? Date.parse(old.latest.at) : 0;\n      const due = !rateHit && m.media_product_type !== 'STORY' && Number.isFinite(ageH) &&\n        (ageH < RECENT_H || !old.latest || (NOW.getTime() - lastAt) / HOUR >= OLD_REFRESH_H || dueCheckpoint(ageH, rec.checkpoints));\n      if (due) {\n        try {\n          const metrics = await mediaInsights(m);\n          if (Object.keys(metrics).length) {\n            const snap = { at: NOW.toISOString(), ageH: round1(ageH), m: metrics };\n            rec.latest = snap;\n            for (const c of CHECKPOINTS) if (ageH >= c && ageH < c + WINDOW[c] && !rec.checkpoints[c]) rec.checkpoints[c] = snap;\n            fetched++;\n          } else failed++;\n        } catch (e) {\n          if (isToken(e)) throw e;\n          if (isRate(e)) {\n            rateHit = true;\n            status.warnings.push('به سقف تعداد درخواست اینستاگرام رسیدیم؛ بقیه‌ی آمارها دفعه‌ی بعد گرفته می‌شن.');\n          } else failed++;\n        }\n      }\n      out.push(rec);\n    }\n    if (failed) status.warnings.push('آمار ' + failed + ' پست گرفته نشد.');\n    const series = Array.isArray(prev.followersSeries) ? prev.followersSeries : [];\n    if (typeof me.followers_count === 'number') {\n      const last = series[series.length - 1];\n      if (!last || last.n !== me.followers_count || NOW.getTime() - Date.parse(last.at) > 6 * HOUR) series.push({ at: NOW.toISOString(), n: me.followers_count });\n    }\n    const daily = prev.dailyFollows && typeof prev.dailyFollows === 'object' ? prev.dailyFollows : {};\n    if (!status.dailyAt || NOW.getTime() - Date.parse(status.dailyAt) > 12 * HOUR) {\n      try {\n        await fillDailyFollows(daily);\n        status.dailyAt = NOW.toISOString();\n      } catch (e) {\n        if (isToken(e)) throw e;\n        status.warnings.push('فالوورهای روزانه گرفته نشد: ' + e.message);\n      }\n    }\n    const account = { id: me.user_id || me.id, username: me.username, account_type: me.account_type, followers_count: me.followers_count, follows_count: me.follows_count, media_count: me.media_count };\n    writeJSON(path.join(OUT, 'media.json'), { kind: 'studio-instagram', version: 1, fetchedAt: NOW.toISOString(), account, media: out, followersSeries: series.slice(-3000), dailyFollows: daily });\n    Object.assign(status, { ok: true, errorCode: null, error: null, account, mediaCount: out.length, insightsFetched: fetched });\n    if (!skipFresh) {\n      const skip = { at: NOW.toISOString(), REELS: [], FEED: [] };\n      for (const key of Object.keys(failCount)) {\n        const [kind, metric] = key.split(':');\n        if (failCount[key] >= 2 && !okMetric[key]) skip[kind].push(metric);\n      }\n      status.skipMetrics = skip;\n    }\n    console.log('media: ' + out.length + ', insights fetched: ' + fetched + ', failed: ' + failed);\n  } catch (e) {\n    const code = isToken(e) ? 'token' : e.code === 'network' ? 'network' : isRate(e) ? 'rate' : 'api';\n    Object.assign(status, { ok: false, errorCode: code, error: String(e.message || e).slice(0, 300) });\n    console.log('error: ' + code + ' ' + e.message);\n  }\n  await maybeRefreshToken(status);\n  writeJSON(path.join(OUT, 'status.json'), status);\n}\n\nmain().catch((e) => {\n  console.error(e);\n  process.exitCode = 1;\n});\n";

/* ---------- راه‌اندازی ---------- */
function isDarkTheme() {
  const t = S && S.settings ? S.settings.theme : 'auto';
  return t === 'dark' || (t !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
}

function applyTheme() {
  const t = S.settings.theme;
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', isDarkTheme() ? '#171614' : '#EDEAE3');
}

/* ---------- نصب و به‌روزرسانی ---------- */
let _swReg = null;
let _updateRequested = false;

function showUpdateBanner() {
  const b = document.getElementById('update');
  if (!b) return;
  b.hidden = false;
}

function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return;
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    _swReg = reg;
    if (reg.waiting && navigator.serviceWorker.controller) showUpdateBanner();
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      if (!nw) return;
      nw.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) showUpdateBanner();
      });
    });
    setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
  }).catch((e) => console.warn('service worker', e));
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!_updateRequested) return;
    _updateRequested = false;
    location.reload();
  });
}

function applyUpdate() {
  if (_swReg && _swReg.waiting) {
    _updateRequested = true;
    flushSave();
    _swReg.waiting.postMessage('skipWaiting');
  } else {
    location.reload();
  }
}

async function checkForUpdate() {
  if (!_swReg) { toast('بررسی نسخه فقط روی نسخه‌ی منتشرشده روی گیت‌هاب کار می‌کنه'); return; }
  toast('در حال بررسی…');
  try {
    await _swReg.update();
    setTimeout(() => {
      if (_swReg.waiting || _swReg.installing) showUpdateBanner();
      else toast('نسخه‌ی فعلی، آخرین نسخه‌ست');
    }, 1500);
  } catch (e) {
    toast('به اینترنت وصل نیستی یا گیت‌هاب در دسترس نیست');
  }
}

async function doInstall() {
  if (!_installEvt) { toast('از منوی کروم «نصب برنامه» یا «افزودن به صفحه‌ی اصلی» رو بزن'); return; }
  _installEvt.prompt();
  try { await _installEvt.userChoice; } catch (e) { /* ignore */ }
  _installEvt = null;
  rerender();
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  _installEvt = e;
  if (_cur && _cur.tab === 'home') rerender();
});

window.addEventListener('appinstalled', () => {
  _installEvt = null;
  toast('اپ نصب شد');
  requestPersist();
  if (_cur && _cur.tab === 'home') rerender();
});

function renderNav() {
  const tabs = [['home', '#/', 'home', 'خانه'], ['content', '#/content', 'layers', 'محتوا'], ['calendar', '#/calendar', 'calendar', 'تقویم'], ['analysis', '#/analysis', 'chart', 'تحلیل'], ['more', '#/more', 'more', 'بیشتر']];
  document.getElementById('nav').innerHTML = tabs.map((t) => '<a href="' + t[1] + '" data-tab="' + t[0] + '"><span class="pill">' + ic(t[2]) + '</span><span>' + t[3] + '</span></a>').join('');
}

// میان‌برهای آیکون اپ (نگه‌داشتن انگشت روی آیکون)
function handleShortcut() {
  const { q } = parseHash();
  if (!q.do) return;
  history.replaceState(null, '', '#/');
  render(false);
  if (q.do === 'idea') ideaSheet();
  else if (q.do === 'stat') pickPostForStat();
  else if (q.do === 'lead') leadSheet();
}

async function boot() {
  await loadState();
  await loadSyncCfg();
  await igLoadCache();
  applyTheme();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
  renderNav();
  render(false);
  handleShortcut();
  document.getElementById('update-btn').addEventListener('click', applyUpdate);
  registerSW();
  requestPersist();
  startSyncLoops();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushSave();
    else if (_cur && _cur.tab === 'home' && !_sheets.length) rerender();
  });
  window.addEventListener('pagehide', flushSave);
}

boot().catch((e) => {
  console.error(e);
  document.getElementById('main').innerHTML = '<div class="empty"><h3>اپ باز نشد</h3><p>' + esc(e.message || e) + '</p></div>';
});
})();
