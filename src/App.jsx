import { useState, useMemo } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine
} from "recharts";

// ─────────────────────────────────────────────
// 定数
// ─────────────────────────────────────────────
const DEFAULT_ADJUSTMENT = 0.9832; // デフォルト運賃改定係数

const WORK_TYPES = {
  kakujitsu: {
    id: "kakujitsu", label: "隔日勤務", icon: "🌙",
    teisho: 171, perShift: 14.25, stdShifts: 12,
    color: "#4f8ef7", light: "#a5c8ff", bg: "rgba(79,142,247,0.12)",
    desc: "1乗務14.25h × 12回 = 171h/月",
    mihan: { musiji: 200, muijiko: 700, leader: 1900 },
    mohan: 3000, minShifts: 9,
    startHour: 7, kyukei: 3.0,
  },
  hirubi: {
    id: "hirubi", label: "昼日勤", icon: "☀️",
    teisho: 165, perShift: 7.5, stdShifts: 22,
    color: "#f7a24f", light: "#ffd6a0", bg: "rgba(247,162,79,0.12)",
    desc: "1乗務7.5h × 22日 = 165h/月",
    mihan: { musiji: 100, muijiko: 350, leader: 1100 },
    mohan: 3300, minShifts: 17,
    startHour: 7, kyukei: 1.5,
  },
  yorubi: {
    id: "yorubi", label: "夜日勤", icon: "🌃",
    teisho: 165, perShift: 7.5, stdShifts: 22,
    color: "#4fc98e", light: "#a0f0c8", bg: "rgba(79,201,142,0.12)",
    desc: "1乗務7.5h × 22日 = 165h/月",
    mihan: { musiji: 100, muijiko: 350, leader: 1000 },
    mohan: 3000, minShifts: 17,
    startHour: 18, kyukei: 1.5,
  },
};

// ─────────────────────────────────────────────
// 定数：東京都最低賃金（2024年度）
// ─────────────────────────────────────────────
const TOKYO_MIN_WAGE = 1163; // 円/h ※最新値は確認のこと

// 最低賃金保障額を計算（第16条）
// 保障額 = 最賃 × 総実労働時間 + 最賃 × 残業時間 × 0.25 + 最賃 × 深夜時間 × 0.25
function calcMinWageHosho(totalHours, zangyoHours, shinyaHours) {
  return Math.ceil(
    TOKYO_MIN_WAGE * totalHours
    + TOKYO_MIN_WAGE * zangyoHours * 0.25
    + TOKYO_MIN_WAGE * shinyaHours * 0.25
  );
}

// ─────────────────────────────────────────────
// 深夜時間自動計算（22:00〜翌5:00）
// ─────────────────────────────────────────────
function calcShinyaAuto(workType, totalHours, startHourOverride) {
  const wt = WORK_TYPES[workType];
  if (!wt || totalHours <= 0) return 0;
  const startHour = startHourOverride !== undefined ? startHourOverride : wt.startHour;
  const kyukei = wt.kyukei || 0;

  // 1乗務あたりの労働時間
  const perShiftRodo = totalHours / wt.stdShifts;
  // 拘束時間 = 1乗務の労働時間 + 休憩時間
  const kosoku = perShiftRodo + kyukei;
  // 退勤時刻（拘束終了）
  const endHour = startHour + kosoku;

  // 深夜帯 22:00〜翌5:00 = 22〜29
  const shinyaStart = 22;
  const shinyaEnd = 29;
  const overlapStart = Math.max(startHour, shinyaStart);
  const overlapEnd = Math.min(endHour, shinyaEnd);
  // 1乗務の深夜時間 × 乗務数
  const shinyaPerShift = Math.max(0, overlapEnd - overlapStart);
  const totalShinya = shinyaPerShift * wt.stdShifts;
  return Math.round(totalShinya * 100) / 100;
}

// 退勤時刻を表示用文字列に変換
function endTimeLabel(workType, totalHours, startHourOverride) {
  const wt = WORK_TYPES[workType];
  if (!wt || totalHours <= 0) return "";
  const sh = startHourOverride !== undefined ? startHourOverride : wt.startHour;
  const kyukei = wt.kyukei || 0;
  // 1乗務の拘束時間 = 総労働÷乗務数 + 休憩
  const perShiftRodo = totalHours / wt.stdShifts;
  const endHour = sh + perShiftRodo + kyukei;
  const h = Math.floor(endHour % 24);
  const m = Math.round((endHour % 1) * 60);
  const mm = String(m).padStart(2, "0");
  const hh = String(h).padStart(2, "0");
  return endHour >= 24 ? `翌${hh}:${mm}` : `${hh}:${mm}`;
}

// ─────────────────────────────────────────────
// 給与計算ロジック
// ─────────────────────────────────────────────
function calcHoai(type, eiSales, adjustment) {
  const s = eiSales * adjustment;
  if (type === "kakujitsu") {
    const baseA = s * 0.4144;
    const baseB = s > 420000 ? (Math.min(s, 1000000) - 420000) * 0.1905 : 0;
    return { baseA, baseB, total: baseA + baseB };
  }
  if (type === "hirubi") {
    const baseA = s * 0.4580;
    const baseB = s > 378000 ? (Math.min(s, 748000) - 378000) * 0.1405 : 0;
    const baseC = s > 748000 ? (s - 748000) * 0.1220 : 0;
    return { baseA, baseB, baseC, total: baseA + baseB + baseC };
  }
  const baseA = s * 0.3798;
  const baseB = s > 420000 ? (s - 420000) * 0.2095 : 0;
  return { baseA, baseB, total: baseA + baseB };
}

function calcZangyo(hoaiTotal, totalHours, teisho, shinyaHours) {
  const zangyoTotal = Math.max(0, totalHours - teisho);
  const hourlyRate = hoaiTotal / totalHours;
  if (zangyoTotal === 0) {
    // 残業なしでも深夜割増は発生する
    const shinyaPay = hourlyRate * 0.25 * (shinyaHours || 0);
    return { zangyoHours: 0, over60Hours: 0, zangyoPay: 0, over60Pay: 0, shinyaPay, zangyoSubtotal: 0, totalPay: shinyaPay };
  }
  const zangyoNormal = Math.min(zangyoTotal, 60);
  const zangyoOver60 = Math.max(0, zangyoTotal - 60);
  const zangyoPay  = hourlyRate * 0.25 * zangyoNormal;
  const over60Pay  = hourlyRate * 0.25 * zangyoOver60;
  const shinyaPay  = hourlyRate * 0.25 * (shinyaHours || 0);
  const zangyoSubtotal = zangyoPay + over60Pay;
  return {
    zangyoHours: zangyoNormal,
    over60Hours: zangyoOver60,
    zangyoPay,
    over60Pay,
    shinyaPay,
    zangyoSubtotal,
    totalPay: zangyoSubtotal + shinyaPay,
  };
}

function calcTeateZangyo(teateAmount, teisho, zangyoHours, shinyaHours) {
  if (teateAmount <= 0) return { zangyoPay: 0, shinyaPay: 0, total: 0 };
  const base = teateAmount / teisho;
  const zangyoPay = base * 1.25 * zangyoHours;
  const shinyaPay = base * 0.25 * shinyaHours;
  return { zangyoPay, shinyaPay, total: zangyoPay + shinyaPay };
}


// ─────────────────────────────────────────────
// グラフ用パレット
// ─────────────────────────────────────────────
const TEISHO_GRAPH = { kakujitsu: 171, hirubi: 165, yorubi: 165 };
const minWageGraph = (type) => TOKYO_MIN_WAGE * TEISHO_GRAPH[type];

const PALETTE = {
  kakujitsu: { base: "#3b82f6", addA: "#93c5fd", addB: "#dbeafe", label: "隔日勤務" },
  hirubi:    { base: "#f97316", addA: "#fdba74", addB: "#ffedd5", label: "昼日勤" },
  yorubi:    { base: "#10b981", addA: "#6ee7b7", addB: "#d1fae5", label: "夜日勤" },
};


// ─────────────────────────────────────────────
// 定数
// ─────────────────────────────────────────────

// 各勤務形態の所定労働時間（残業なし想定）

// 最低賃金保障額（残業・深夜なし想定）

// ─────────────────────────────────────────────
// 歩合計算（3段階すべて分解して返す）
// ─────────────────────────────────────────────
function calcBreakdown(type, eiSalesYen) {
  const s = eiSalesYen * DEFAULT_ADJUSTMENT;

  if (type === "kakujitsu") {
    const baseA = s * 0.4144;
    const baseB = s > 420000 ? (Math.min(s, 1000000) - 420000) * 0.1905 : 0;
    return { baseA, baseB, baseC: 0, total: baseA + baseB };
  }
  if (type === "hirubi") {
    const baseA = s * 0.4580;
    const baseB = s > 378000 ? (Math.min(s, 748000) - 378000) * 0.1405 : 0;
    const baseC = s > 748000 ? (s - 748000) * 0.1220 : 0;
    return { baseA, baseB, baseC, total: baseA + baseB + baseC };
  }
  // yorubi
  const baseA = s * 0.3798;
  const baseB = s > 420000 ? (s - 420000) * 0.2095 : 0;
  return { baseA, baseB, baseC: 0, total: baseA + baseB };
}

// ─────────────────────────────────────────────
// データ生成（10万〜110万　5万刻み）
// ─────────────────────────────────────────────
function generateData() {
  const rows = [];
  for (let man = 10; man <= 110; man += 5) {
    const yen = man * 10000;
    const k = calcBreakdown("kakujitsu", yen);
    const h = calcBreakdown("hirubi",    yen);
    const y = calcBreakdown("yorubi",    yen);

    const mwK = minWageGraph("kakujitsu") / 10000;
    const mwH = minWageGraph("hirubi")    / 10000;
    const mwY = minWageGraph("yorubi")    / 10000;

    const toM = (v) => Math.round(v / 100) / 100; // 万円・小数2桁

    rows.push({
      ei: man,
      // 隔日
      k_base:  toM(k.baseA),
      k_addA:  toM(k.baseB),
      k_addB:  toM(k.baseC),
      k_min:   mwK,
      // 昼勤
      h_base:  toM(h.baseA),
      h_addA:  toM(h.baseB),
      h_addB:  toM(h.baseC),
      h_min:   mwH,
      // 夜勤
      y_base:  toM(y.baseA),
      y_addA:  toM(y.baseB),
      y_addB:  toM(y.baseC),
      y_min:   mwY,
    });
  }
  return rows;
}

// ─────────────────────────────────────────────
// カラーパレット
// ─────────────────────────────────────────────


// ─────────────────────────────────────────────
// カスタムツールチップ
// ─────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label, mode }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;

  const sections = mode === "all"
    ? [
        { key: "kakujitsu", label: "隔日勤務", color: PALETTE.kakujitsu.base },
        { key: "hirubi",    label: "昼日勤",   color: PALETTE.hirubi.base },
        { key: "yorubi",    label: "夜日勤",   color: PALETTE.yorubi.base },
      ]
    : [{ key: mode, label: PALETTE[mode].label, color: PALETTE[mode].base }];

  const prefix = { kakujitsu: "k", hirubi: "h", yorubi: "y" };

  return (
    <div style={{
      background: "rgba(8,12,28,0.97)",
      border: "1px solid rgba(255,255,255,0.12)",
      borderRadius: 12, padding: "14px 18px",
      fontSize: 12, color: "#e2e8f0", minWidth: 200,
    }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: "#fbbf24", marginBottom: 10 }}>
        営収 {label}万円
      </div>
      {sections.map(sec => {
        const p = prefix[sec.key];
        const base = d[`${p}_base`] || 0;
        const addA = d[`${p}_addA`] || 0;
        const addB = d[`${p}_addB`] || 0;
        const minW = d[`${p}_min`]  || 0;
        const total = Math.round((base + addA + addB) * 100) / 100;
        const hosho = Math.max(0, Math.round((minW - total) * 100) / 100);
        return (
          <div key={sec.key} style={{ marginBottom: 10 }}>
            <div style={{ color: sec.color, fontWeight: 700, marginBottom: 4 }}>{sec.label}</div>
            <div style={{ paddingLeft: 8, lineHeight: 1.9 }}>
              <div style={{ display:"flex", justifyContent:"space-between", gap:16 }}>
                <span style={{ color: "rgba(200,210,240,0.6)" }}>歩合A</span>
                <span style={{ color: sec.color }}>{base}万円</span>
              </div>
              {addA > 0 && (
                <div style={{ display:"flex", justifyContent:"space-between", gap:16 }}>
                  <span style={{ color: "rgba(200,210,240,0.6)" }}>歩合B</span>
                  <span style={{ color: PALETTE[sec.key].addA === "#dbeafe" ? "#93c5fd" : PALETTE[sec.key].addA }}>{addA}万円</span>
                </div>
              )}
              {addB > 0 && (
                <div style={{ display:"flex", justifyContent:"space-between", gap:16 }}>
                  <span style={{ color: "rgba(200,210,240,0.6)" }}>歩合C</span>
                  <span style={{ color: "#c4b5fd" }}>{addB}万円</span>
                </div>
              )}
              <div style={{ display:"flex", justifyContent:"space-between", gap:16, borderTop:"1px solid rgba(255,255,255,0.08)", paddingTop:3 }}>
                <span style={{ color: "rgba(200,210,240,0.6)" }}>歩合計</span>
                <span style={{ fontWeight:700, color:"#fff" }}>{total}万円</span>
              </div>
              <div style={{ display:"flex", justifyContent:"space-between", gap:16 }}>
                <span style={{ color: "rgba(200,210,240,0.6)" }}>最低賃金保障</span>
                <span style={{ color:"#f59e0b" }}>{minW}万円</span>
              </div>
              {hosho > 0 && (
                <div style={{ display:"flex", justifyContent:"space-between", gap:16 }}>
                  <span style={{ color:"#ff6b6b" }}>⚠ 補填額</span>
                  <span style={{ color:"#ff6b6b", fontWeight:700 }}>+{hosho}万円</span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ─────────────────────────────────────────────
// 1勤務チャート
// ─────────────────────────────────────────────
function SingleChart({ type, data }) {
  const p  = { kakujitsu:"k", hirubi:"h", yorubi:"y" }[type];
  const pal = PALETTE[type];
  const thresholds = {
    kakujitsu: [{ x:42, label:"42万" }],
    hirubi:    [{ x:37.8, label:"37.8万" }, { x:74.8, label:"74.8万" }],
    yorubi:    [{ x:42, label:"42万" }],
  }[type];

  return (
    <div style={{
      background: "rgba(255,255,255,0.03)",
      border: `1px solid ${pal.base}33`,
      borderRadius: 16, padding: "16px 12px 8px",
    }}>
      <div style={{ marginBottom: 10, paddingLeft: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: pal.base }}>{pal.label}</div>
        <div style={{ fontSize: 10, color: "rgba(180,200,240,0.4)", marginTop: 2 }}>
          所定労働時間 {TEISHO_GRAPH[type]}h ／ 最低賃金保障 {(minWageGraph(type)/10000).toFixed(2)}万円
        </div>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={data} margin={{ top:8, right:16, left:0, bottom:20 }}>
          <defs>
            <linearGradient id={`g_${p}_base`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={pal.base} stopOpacity={0.7} />
              <stop offset="95%" stopColor={pal.base} stopOpacity={0.1} />
            </linearGradient>
            <linearGradient id={`g_${p}_addA`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={pal.addA} stopOpacity={0.6} />
              <stop offset="95%" stopColor={pal.addA} stopOpacity={0.05} />
            </linearGradient>
            <linearGradient id={`g_${p}_addB`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#a78bfa"  stopOpacity={0.55} />
              <stop offset="95%" stopColor="#a78bfa"  stopOpacity={0.03} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis dataKey="ei" tickFormatter={v=>`${v}万`}
            stroke="rgba(200,210,240,0.25)" tick={{ fill:"rgba(200,210,240,0.55)", fontSize:10 }}
            label={{ value:"営収（万円）", position:"insideBottom", offset:-12, fill:"rgba(180,200,240,0.35)", fontSize:10 }} />
          <YAxis tickFormatter={v=>`${v}万`}
            stroke="rgba(200,210,240,0.25)" tick={{ fill:"rgba(200,210,240,0.55)", fontSize:10 }} />
          <Tooltip content={<CustomTooltip mode={type} />} />
          {thresholds.map(t => (
            <ReferenceLine key={t.x} x={t.x} stroke="rgba(255,255,255,0.18)" strokeDasharray="5 3"
              label={{ value:t.label, position:"top", fill:"rgba(255,220,80,0.7)", fontSize:9 }} />
          ))}
          {/* 最低賃金ライン */}
          <ReferenceLine y={(minWageGraph(type)/10000).toFixed(2)}
            stroke="#f59e0b" strokeDasharray="6 3" strokeWidth={1.5}
            label={{ value:"最低賃金保障", position:"right", fill:"#f59e0b", fontSize:9 }} />
          <Area type="monotone" dataKey={`${p}_base`} name="歩合A"
            stackId={p} stroke={pal.base} strokeWidth={2} fill={`url(#g_${p}_base)`} />
          <Area type="monotone" dataKey={`${p}_addA`} name="歩合B"
            stackId={p} stroke={pal.addA} strokeWidth={1.5} fill={`url(#g_${p}_addA)`} />
          {type === "hirubi" && (
            <Area type="monotone" dataKey={`${p}_addB`} name="歩合C"
              stackId={p} stroke="#a78bfa" strokeWidth={1.5} fill={`url(#g_${p}_addB)`} />
          )}
          <Legend wrapperStyle={{ fontSize:11, paddingTop:8, color:"rgba(200,210,240,0.65)" }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─────────────────────────────────────────────
// 比較チャート
// ─────────────────────────────────────────────
function CompareChart({ data }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.03)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 16, padding: "16px 12px 8px",
    }}>
      <div style={{ marginBottom: 10, paddingLeft: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: "#e2e8f0" }}>3勤務　歩合合計　比較</div>
        <div style={{ fontSize: 10, color: "rgba(180,200,240,0.4)", marginTop: 2 }}>
          同じ営収でどれだけ差が出るか
        </div>
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={data} margin={{ top:8, right:16, left:0, bottom:20 }}>
          <defs>
            {["kakujitsu","hirubi","yorubi"].map(t => (
              <linearGradient key={t} id={`gc_${t}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={PALETTE[t].base} stopOpacity={0.45} />
                <stop offset="95%" stopColor={PALETTE[t].base} stopOpacity={0.03} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis dataKey="ei" tickFormatter={v=>`${v}万`}
            stroke="rgba(200,210,240,0.25)" tick={{ fill:"rgba(200,210,240,0.55)", fontSize:10 }}
            label={{ value:"営収（万円）", position:"insideBottom", offset:-12, fill:"rgba(180,200,240,0.35)", fontSize:10 }} />
          <YAxis tickFormatter={v=>`${v}万`}
            stroke="rgba(200,210,240,0.25)" tick={{ fill:"rgba(200,210,240,0.55)", fontSize:10 }} />
          <Tooltip content={<CustomTooltip mode="all" />} />
          <ReferenceLine y={(minWageGraph("kakujitsu")/10000).toFixed(2)}
            stroke="#f59e0b" strokeDasharray="5 3" strokeWidth={1}
            label={{ value:"最賃保障(隔日)", position:"right", fill:"#f59e0b", fontSize:9 }} />
          <ReferenceLine y={(minWageGraph("hirubi")/10000).toFixed(2)}
            stroke="#fbbf24" strokeDasharray="5 3" strokeWidth={1}
            label={{ value:"最賃保障(日勤)", position:"right", fill:"#fbbf24", fontSize:9 }} />
          {["kakujitsu","hirubi","yorubi"].map(t => {
            const p = { kakujitsu:"k", hirubi:"h", yorubi:"y" }[t];
            // 合計キーを動的計算（recharts用に合計フィールドを追加）
            return (
              <Area key={t} type="monotone"
                dataKey={d => Math.round((( d[`${p}_base`]||0)+(d[`${p}_addA`]||0)+(d[`${p}_addB`]||0))*100)/100}
                name={PALETTE[t].label}
                stroke={PALETTE[t].base} strokeWidth={2.5}
                fill={`url(#gc_${t})`}
              />
            );
          })}
          <Legend wrapperStyle={{ fontSize:11, paddingTop:8, color:"rgba(200,210,240,0.65)" }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─────────────────────────────────────────────
// 凡例説明
// ─────────────────────────────────────────────
function LegendInfo() {
  const items = [
    { color: "#3b82f6", label: "隔日　歩合A", desc: "× 41.44%" },
    { color: "#93c5fd", label: "隔日　歩合B", desc: "42万円超 × 19.05%" },
    { color: "#f97316", label: "昼勤　歩合A", desc: "× 45.80%" },
    { color: "#fdba74", label: "昼勤　歩合B", desc: "37.8万円超 × 14.05%" },
    { color: "#a78bfa", label: "昼勤　歩合C", desc: "74.8万円超 × 12.20%" },
    { color: "#10b981", label: "夜勤　歩合A", desc: "× 37.98%" },
    { color: "#6ee7b7", label: "夜勤　歩合B", desc: "42万円超 × 20.95%" },
    { color: "#f59e0b", label: "最低賃金保障ライン", desc: `${TOKYO_MIN_WAGE}円/h × 所定時間` },
  ];
  return (
    <div style={{
      background: "rgba(255,255,255,0.025)",
      border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 14, padding: "14px 16px",
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(180,200,240,0.55)", marginBottom: 10, letterSpacing:"0.1em" }}>
        COLOR LEGEND
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 20px" }}>
        {items.map(item => (
          <div key={item.label} style={{ display:"flex", alignItems:"center", gap:8 }}>
            <div style={{
              width: 12, height: 12, borderRadius: 3, flexShrink:0,
              background: item.color,
              boxShadow: `0 0 6px ${item.color}88`,
            }} />
            <div>
              <div style={{ fontSize: 11, color: "#d1d9f0", fontWeight:600 }}>{item.label}</div>
              <div style={{ fontSize: 10, color: "rgba(160,180,220,0.45)" }}>{item.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// メイン
// ─────────────────────────────────────────────
function SalaryGraph() {
  const [tab, setTab] = useState("all");
  const data = useMemo(() => generateData(), []);

  const tabs = [
    { id:"all",       label:"3勤務比較",  color:"#e879f9" },
    { id:"kakujitsu", label:"隔日勤務",   color:"#3b82f6" },
    { id:"hirubi",    label:"昼日勤",     color:"#f97316" },
    { id:"yorubi",    label:"夜日勤",     color:"#10b981" },
  ];

  return (
    <div style={{
      minHeight:"100vh",
      background:"radial-gradient(ellipse at 20% 10%, #0c1628 0%, #050810 60%, #060a0c 100%)",
      fontFamily:"'Noto Sans JP','Hiragino Kaku Gothic ProN',sans-serif",
      color:"#e2e8f0", padding:"24px 14px 48px",
    }}>
      {/* ヘッダー */}
      <div style={{ textAlign:"center", marginBottom:28 }}>
        <div style={{ fontSize:10, letterSpacing:"0.35em", color:"rgba(160,200,160,0.3)", marginBottom:6 }}>
          ASUKA TAXI COUNTRY
        </div>
        <h1 style={{
          margin:0, fontSize:22, fontWeight:900, letterSpacing:"0.05em",
          background:"linear-gradient(100deg,#3b82f6 0%,#a78bfa 40%,#f97316 70%,#10b981 100%)",
          WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent",
        }}>
          歩合給グラフ
        </h1>
        <div style={{ fontSize:11, color:"rgba(160,185,220,0.38)", marginTop:4 }}>
          営収 10万〜110万円　／　歩合A・歩合B・歩合C・最低賃金保障
        </div>
      </div>

      <div style={{ maxWidth:900, margin:"0 auto" }}>

        {/* タブ */}
        <div style={{ display:"flex", gap:8, marginBottom:20, flexWrap:"wrap", justifyContent:"center" }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding:"9px 20px", borderRadius:40, cursor:"pointer", fontSize:13, fontWeight:700,
              border: tab===t.id ? `2px solid ${t.color}` : "2px solid rgba(255,255,255,0.08)",
              background: tab===t.id ? `${t.color}22` : "rgba(255,255,255,0.03)",
              color: tab===t.id ? t.color : "rgba(180,200,240,0.45)",
              transition:"all 0.18s",
            }}>{t.label}</button>
          ))}
        </div>

        {/* グラフ */}
        {tab === "all" ? (
          <>
            <CompareChart data={data} />
            <div style={{ marginTop:16 }}>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginTop:16 }}>
                {["kakujitsu","hirubi","yorubi"].map(t => (
                  <SingleChart key={t} type={t} data={data} />
                ))}
              </div>
            </div>
          </>
        ) : (
          <SingleChart type={tab} data={data} />
        )}

        {/* 凡例 */}
        <div style={{ marginTop:16 }}>
          <LegendInfo />
        </div>

        {/* 注記 */}
        <div style={{ marginTop:16, fontSize:10, color:"rgba(110,130,170,0.3)", lineHeight:2, textAlign:"center" }}>
          ※ 営収に運賃改定係数 0.9832（デフォルト）を乗じた後の金額で計算<br />
          ※ 残業・深夜割増・各種手当は含まない（歩合A・B・Cのみ）<br />
          ※ 最低賃金保障は残業・深夜なし想定（東京都 {TOKYO_MIN_WAGE}円/h）
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// UIパーツ
// ─────────────────────────────────────────────
const fmt  = n => Math.round(n).toLocaleString("ja-JP") + "円";
const fmtM = n => (Math.round(n / 100) / 100).toFixed(2) + "万円";
const fmtH = n => parseFloat(n).toFixed(1);

function Toggle({ value, onChange, labelOn, labelOff, colorOn = "#ff6b6b", colorOff = "#4fc98e" }) {
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {[{ v: true, label: labelOn, color: colorOn }, { v: false, label: labelOff, color: colorOff }].map(o => (
        <button key={String(o.v)} onClick={() => onChange(o.v)} style={{
          flex: 1, padding: "9px 0", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer",
          border: value === o.v ? `2px solid ${o.color}` : "2px solid rgba(255,255,255,0.09)",
          background: value === o.v ? `${o.color}22` : "rgba(255,255,255,0.03)",
          color: value === o.v ? o.color : "rgba(180,200,240,0.38)",
          transition: "all 0.18s",
        }}>{o.label}</button>
      ))}
    </div>
  );
}

function NumInput({ value, onChange, unit, placeholder, color, note }) {
  return (
    <div>
      <div style={{ position: "relative" }}>
        <input type="number" value={value} onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          style={{
            width: "100%", padding: "12px 52px 12px 14px", borderRadius: 10, boxSizing: "border-box",
            border: `1.5px solid ${value ? (color || "#4f8ef7") + "99" : "rgba(255,255,255,0.1)"}`,
            background: "rgba(0,0,0,0.35)", color: "#e8eaf0", fontSize: 16, fontWeight: 600,
            outline: "none", appearance: "none", transition: "border 0.2s",
          }} />
        <span style={{
          position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
          color: value ? (color || "#4f8ef7") : "rgba(180,200,240,0.28)", fontSize: 12, fontWeight: 700, pointerEvents: "none",
        }}>{unit}</span>
      </div>
      {note && <div style={{ marginTop: 5, fontSize: 10, color: "rgba(150,170,210,0.42)", paddingLeft: 2 }}>{note}</div>}
    </div>
  );
}

function Card({ title, icon, children, color, done }) {
  return (
    <div style={{
      marginBottom: 14, borderRadius: 16, overflow: "hidden",
      border: `1px solid ${done ? (color || "#4f8ef7") + "55" : "rgba(255,255,255,0.08)"}`,
      background: "rgba(255,255,255,0.022)", transition: "border 0.3s",
    }}>
      <div style={{
        padding: "10px 16px", display: "flex", alignItems: "center", gap: 8,
        borderBottom: "1px solid rgba(255,255,255,0.055)",
        background: done ? `${color || "#4f8ef7"}12` : "transparent",
      }}>
        <span style={{ fontSize: 14 }}>{icon}</span>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
          color: done ? (color || "#4f8ef7") : "rgba(180,200,240,0.5)" }}>{title}</span>
        {done && <span style={{ marginLeft: "auto", fontSize: 11, color: color || "#4f8ef7" }}>✓</span>}
      </div>
      <div style={{ padding: "14px 16px" }}>{children}</div>
    </div>
  );
}

function Lbl({ text, hint }) {
  return (
    <div style={{ marginBottom: 7 }}>
      <span style={{ fontSize: 12, color: "rgba(185,200,235,0.7)" }}>{text}</span>
      {hint && <span style={{ fontSize: 10, color: "rgba(145,165,205,0.38)", marginLeft: 6 }}>{hint}</span>}
    </div>
  );
}

function RRow({ label, value, color = "#e8eaf0", bold, indent, sub, zero }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "flex-end",
      padding: indent ? "4px 0 4px 14px" : "5px 0",
      borderBottom: "1px solid rgba(255,255,255,0.04)",
      opacity: zero ? 0.3 : 1,
    }}>
      <span style={{ fontSize: indent ? 11 : 12, color: "rgba(188,203,233,0.62)" }}>
        {label}
        {sub && <span style={{ fontSize: 10, color: "rgba(155,175,215,0.33)", marginLeft: 5 }}>{sub}</span>}
      </span>
      <span style={{ fontSize: bold ? 14 : 12, fontWeight: bold ? 800 : 500, color, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────
// メイン
// ─────────────────────────────────────────────
export default function App() {
  const [mainTab,        setMainTab]        = useState("simulator"); // "simulator" | "graph"
  const [adjustInput,    setAdjustInput]    = useState("0.9832"); // 運賃改定係数
  const [workType,       setWorkType]       = useState(null);
  const [eiSalesInput,   setEiSalesInput]   = useState("");
  const [totalHoursInput,setTotalHoursInput]= useState("");
  const [actualShifts,   setActualShifts]   = useState("");
  const [yukyuInput,     setYukyuInput]     = useState("");   // 有給手当
  const [startHourInput, setStartHourInput] = useState(null); // 出勤時刻（null=デフォルト）
  const [jikoAri,        setJikoAri]        = useState(null);
  const [hanhanAri,      setHanhanAri]      = useState(null);
  const [mohanOK,        setMohanOK]        = useState(null);
  const [isLeader,       setIsLeader]       = useState(null);

  const wt         = workType ? WORK_TYPES[workType] : null;
  const adjustment = parseFloat(adjustInput) || DEFAULT_ADJUSTMENT;
  const eiSales    = parseFloat(eiSalesInput) * 10000 || 0;
  const totalHours = parseFloat(totalHoursInput) || 0;
  const shifts     = parseInt(actualShifts) || 0;
  const yukyuPay   = parseFloat(yukyuInput) || 0;  // 有給手当（円）

  // 深夜時間を自動計算
  const effectiveStart = startHourInput !== null ? startHourInput : (wt ? wt.startHour : null);
  const shinyaHours    = workType && totalHours > 0 ? calcShinyaAuto(workType, totalHours, effectiveStart) : 0;
  const endTimeStr     = workType && totalHours > 0 ? endTimeLabel(workType, totalHours, effectiveStart) : "";
  const zangyoTotal    = wt ? Math.max(0, totalHours - wt.teisho) : 0;
  const zangyoNormal   = Math.min(zangyoTotal, 60);
  const zangyoOver60   = Math.max(0, zangyoTotal - 60);

  const inputReady = workType && eiSales > 0 && totalHours > 0 && shifts > 0
    && jikoAri !== null && hanhanAri !== null && mohanOK !== null && isLeader !== null;

  const result = useMemo(() => {
    if (!inputReady || !wt) return null;
    const hoai  = calcHoai(workType, eiSales, adjustment);
    const shinya = shinyaHours;
    const zangyo = calcZangyo(hoai.total, totalHours, wt.teisho, shinya);
    const zan    = zangyoNormal + zangyoOver60;

    const mohanOKAll  = !jikoAri && !hanhanAri && mohanOK && shifts >= wt.minShifts;
    const mohanTeate  = mohanOKAll ? wt.mohan : 0;
    const mohanZ      = calcTeateZangyo(mohanTeate,  wt.teisho, zan, shinya);
    const muijiko     = !jikoAri  ? wt.mihan.muijiko * shifts : 0;
    const muijikoZ    = calcTeateZangyo(muijiko,  wt.teisho, zan, shinya);
    const musiji      = !hanhanAri ? wt.mihan.musiji  * shifts : 0;
    const musijiZ     = calcTeateZangyo(musiji,   wt.teisho, zan, shinya);
    const leader      = isLeader  ? wt.mihan.leader   * shifts : 0;
    const leaderZ     = calcTeateZangyo(leader,   wt.teisho, zan, shinya);

    const teateTotal  = mohanTeate + muijiko + musiji + leader;
    const teateZTotal = mohanZ.total + muijikoZ.total + musijiZ.total + leaderZ.total;

    // ── 有給手当
    const yukyu = yukyuPay;

    // ── 最低賃金保障（第16条）
    // 保障額 = 最賃 × 総労働時間 + 最賃 × 残業時間 × 0.25 + 最賃 × 深夜時間 × 0.25
    const minWageHosho = calcMinWageHosho(totalHours, zan, shinya);
    // 歩合+残業+手当+有給の合計（最賃比較対象）
    const beforeHosho  = hoai.total + zangyo.totalPay + teateTotal + teateZTotal + yukyu;
    // 最賃を下回る場合に補填
    const hoshoHojuu   = Math.max(0, minWageHosho - beforeHosho);
    const grandTotal   = beforeHosho + hoshoHojuu;

    return { hoai, zangyo, mohanOKAll, mohanTeate, mohanZ,
             muijiko, muijikoZ, musiji, musijiZ, leader, leaderZ,
             teateTotal, teateZTotal, yukyu,
             minWageHosho, hoshoHojuu, beforeHosho, grandTotal };
  }, [inputReady, workType, eiSales, totalHours, shinyaHours,
      shifts, jikoAri, hanhanAri, mohanOK, isLeader, yukyuPay, startHourInput]);

  const ac = wt?.color || "#4f8ef7";

  return (
    <div style={{
      minHeight: "100vh",
      background: "radial-gradient(ellipse at 15% 10%, #0c1622 0%, #060810 55%, #090f07 100%)",
      fontFamily: "'Noto Sans JP','Hiragino Kaku Gothic ProN',sans-serif",
      color: "#e8eaf0", padding: "22px 14px 60px",
    }}>

      {/* ヘッダー */}
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <div style={{ fontSize: 10, letterSpacing: "0.35em", color: "rgba(160,200,160,0.32)", marginBottom: 5 }}>
          ASUKA TAXI COUNTRY
        </div>
        <h1 style={{
          margin: 0, fontSize: 20, fontWeight: 900, letterSpacing: "0.05em",
          background: "linear-gradient(100deg,#4f8ef7 0%,#a0f0c8 45%,#f7a24f 100%)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        }}>飛鳥交通カンツリー　給与管理システム</h1>
        <div style={{ fontSize: 11, color: "rgba(155,180,215,0.35)", marginTop: 3 }}>
          TAⅡ型賃金規程　給与シミュレーター ＋ 歩合グラフ
        </div>
      </div>

      {/* メインタブ */}
      <div style={{ display: "flex", justifyContent: "center", gap: 10, marginBottom: 24 }}>
        {[
          { id: "simulator", label: "💰 給与シミュレーター", color: "#4f8ef7" },
          { id: "graph",     label: "📊 歩合グラフ",         color: "#e879f9" },
        ].map(t => (
          <button key={t.id} onClick={() => setMainTab(t.id)} style={{
            padding: "11px 26px", borderRadius: 40, cursor: "pointer",
            fontSize: 14, fontWeight: 700, transition: "all 0.2s",
            border: mainTab === t.id ? `2px solid ${t.color}` : "2px solid rgba(255,255,255,0.1)",
            background: mainTab === t.id ? `${t.color}22` : "rgba(255,255,255,0.03)",
            color: mainTab === t.id ? t.color : "rgba(180,200,240,0.45)",
          }}>{t.label}</button>
        ))}
      </div>

      {/* グラフタブ */}
      {mainTab === "graph" && <SalaryGraph />}

      {/* シミュレータータブ */}
      {mainTab === "simulator" && <div style={{ maxWidth: 540, margin: "0 auto" }}>

        {/* ── 運賃改定係数設定 ── */}
        <div style={{
          marginBottom: 14, borderRadius: 14, overflow: "hidden",
          border: `1px solid rgba(251,191,36,0.35)`,
          background: "rgba(251,191,36,0.06)",
        }}>
          <div style={{
            padding: "10px 16px", display: "flex", alignItems: "center", gap: 8,
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            background: "rgba(251,191,36,0.10)",
          }}>
            <span style={{ fontSize: 14 }}>⚙️</span>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "#fbbf24" }}>
              運賃改定係数（変更可能）
            </span>
          </div>
          <div style={{ padding: "12px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input
                type="number"
                value={adjustInput}
                onChange={e => setAdjustInput(e.target.value)}
                step="0.0001"
                style={{
                  width: 120, padding: "9px 12px", borderRadius: 10,
                  border: `1.5px solid rgba(251,191,36,0.6)`,
                  background: "rgba(0,0,0,0.35)", color: "#fbbf24",
                  fontSize: 16, fontWeight: 700, outline: "none", appearance: "none",
                }}
              />
              <div style={{ fontSize: 12, color: "rgba(200,215,255,0.55)", lineHeight: 1.7 }}>
                <div>現在の係数：<span style={{ color: "#fbbf24", fontWeight: 700 }}>{adjustment}</span></div>
                <div style={{ fontSize: 10, color: "rgba(180,195,230,0.38)" }}>
                  デフォルト：0.9832（令和5年11月20日改定）
                </div>
              </div>
              <button
                onClick={() => setAdjustInput("0.9832")}
                style={{
                  padding: "6px 12px", borderRadius: 8, cursor: "pointer",
                  border: "1px solid rgba(251,191,36,0.3)",
                  background: "rgba(251,191,36,0.1)", color: "#fbbf24",
                  fontSize: 11, fontWeight: 600,
                }}
              >リセット</button>
            </div>
          </div>
        </div>

        {/* ── STEP 1: 勤務形態 ── */}
        <Card title="STEP 1　勤務形態を選択" icon="📋" color={ac} done={!!workType}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {Object.values(WORK_TYPES).map(wk => {
              const sel = workType === wk.id;
              return (
                <button key={wk.id} onClick={() => { setWorkType(wk.id); setStartHourInput(null); }} style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
                  borderRadius: 12, cursor: "pointer", textAlign: "left", transition: "all 0.2s",
                  border: sel ? `2px solid ${wk.color}` : "2px solid rgba(255,255,255,0.07)",
                  background: sel ? wk.bg : "rgba(255,255,255,0.02)",
                }}>
                  <span style={{ fontSize: 22 }}>{wk.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: sel ? wk.color : "#d5dcf0" }}>{wk.label}</div>
                    <div style={{ fontSize: 10, color: "rgba(155,175,215,0.42)", marginTop: 2 }}>
                      {wk.desc}　／　出勤 {workType === wk.id && effectiveStart !== undefined ? `${Math.floor(effectiveStart)}:${effectiveStart % 1 === 0.5 ? "30" : "00"}` : `${wk.startHour}:00`}
                    </div>
                  </div>
                  <div style={{
                    width: 16, height: 16, borderRadius: "50%", flexShrink: 0, fontSize: 9,
                    display: "flex", alignItems: "center", justifyContent: "center", color: "#fff",
                    border: `2px solid ${sel ? wk.color : "rgba(255,255,255,0.14)"}`,
                    background: sel ? wk.color : "transparent",
                  }}>{sel && "✓"}</div>
                </button>
              );
            })}
          </div>
        </Card>

        {/* ── STEP 2: 基本数値 ── */}
        <Card title="STEP 2　基本数値を入力" icon="🔢" color={ac}
          done={eiSales > 0 && totalHours > 0 && shifts > 0}>
          <div style={{ display: "grid", gap: 14 }}>

            {/* 月間営収 */}
            <div>
              <Lbl text="月間営収" hint="税抜・消費税相当額控除後" />
              <NumInput value={eiSalesInput} onChange={setEiSalesInput}
                unit="万円" placeholder="例：50" color={ac} />
            </div>

            {/* 出勤時刻選択ダイヤル */}
            {wt && (
              <div>
                <Lbl text="出勤時刻"
                  hint={`デフォルト：${wt.startHour}:00　変更可能`} />
                <div style={{
                  display: "flex", gap: 4, flexWrap: "wrap",
                }}>
                  {(wt.id === "yorubi"
                    ? [17, 17.5, 18, 18.5, 19, 19.5]
                    : [5, 5.5, 6, 6.5, 7, 7.5, 8]
                  ).map(h => {
                    const hh = Math.floor(h);
                    const mm = h % 1 === 0.5 ? "30" : "00";
                    const label = `${hh}:${mm}`;
                    const isDefault = h === wt.startHour;
                    const isSelected = startHourInput === h || (startHourInput === null && isDefault);
                    return (
                      <button key={h} onClick={() => setStartHourInput(h)} style={{
                        padding: "7px 10px", borderRadius: 8, cursor: "pointer",
                        fontSize: 12, fontWeight: isSelected ? 700 : 400,
                        border: isSelected
                          ? `2px solid ${wt.color || '#4f8ef7'}`
                          : "2px solid rgba(255,255,255,0.1)",
                        background: isSelected ? `${wt.color || '#4f8ef7'}22` : "rgba(255,255,255,0.03)",
                        color: isSelected ? (wt.color || '#4f8ef7') : "rgba(180,200,240,0.45)",
                        transition: "all 0.15s",
                        position: "relative",
                      }}>
                        {label}
                        {isDefault && (
                          <span style={{
                            position: "absolute", top: -5, right: -4,
                            fontSize: 7, background: wt.color || '#4f8ef7',
                            color: "#fff", borderRadius: 3, padding: "1px 3px",
                            lineHeight: 1.2,
                          }}>初期</span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {startHourInput !== null && startHourInput !== wt.startHour && (
                  <div style={{ marginTop:5, fontSize:10, color:"#fbbf24", paddingLeft:2 }}>
                    ⚠ デフォルト（{wt.startHour}:00）から変更中
                    <button onClick={() => setStartHourInput(null)} style={{
                      marginLeft:8, fontSize:9, padding:"1px 6px", borderRadius:4,
                      border:"1px solid rgba(251,191,36,0.4)",
                      background:"rgba(251,191,36,0.1)", color:"#fbbf24", cursor:"pointer",
                    }}>リセット</button>
                  </div>
                )}
              </div>
            )}

            {/* 月間総労働時間 */}
            <div>
              <Lbl text="月間総労働時間"
                hint={wt ? `所定 ${wt.teisho}h 超が残業` : "勤務形態を先に選択"} />
              <NumInput value={totalHoursInput} onChange={setTotalHoursInput}
                unit="時間" placeholder={wt ? `所定 ${wt.teisho}h` : "—"} color={ac} />

              {/* 退勤・残業・深夜 バッジ */}
              {wt && totalHours > 0 && (
                <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                  {/* 退勤時刻 */}
                  <div style={{
                    padding: "7px 8px", borderRadius: 8, textAlign: "center",
                    background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)",
                  }}>
                    <div style={{ fontSize: 9, color: "rgba(160,180,220,0.45)", marginBottom: 2 }}>退勤時刻</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#e8eaf0" }}>{endTimeStr}</div>
                  </div>
                  {/* 残業時間 */}
                  <div style={{
                    padding: "7px 8px", borderRadius: 8, textAlign: "center",
                    background: zangyoTotal > 0 ? "rgba(251,191,36,0.09)" : "rgba(79,201,142,0.07)",
                    border: `1px solid ${zangyoTotal > 0 ? "rgba(251,191,36,0.22)" : "rgba(79,201,142,0.18)"}`,
                  }}>
                    <div style={{ fontSize: 9, color: "rgba(160,180,220,0.45)", marginBottom: 2 }}>残業時間</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: zangyoTotal > 0 ? "#fbbf24" : "#4fc98e" }}>
                      {fmtH(zangyoTotal)}h
                    </div>
                  </div>
                  {/* 深夜時間（自動） */}
                  <div style={{
                    padding: "7px 8px", borderRadius: 8, textAlign: "center",
                    background: shinyaHours > 0 ? "rgba(99,102,241,0.1)" : "rgba(255,255,255,0.04)",
                    border: `1px solid ${shinyaHours > 0 ? "rgba(99,102,241,0.25)" : "rgba(255,255,255,0.08)"}`,
                  }}>
                    <div style={{ fontSize: 9, color: "rgba(160,180,220,0.45)", marginBottom: 2 }}>深夜時間 🤖自動</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: shinyaHours > 0 ? "#818cf8" : "rgba(180,200,240,0.35)" }}>
                      {fmtH(shinyaHours)}h
                    </div>
                  </div>
                </div>
              )}
              {zangyoOver60 > 0 && (
                <div style={{ marginTop: 6, padding: "5px 10px", borderRadius: 7, fontSize: 10,
                  background: "rgba(255,80,80,0.08)", border: "1px solid rgba(255,80,80,0.2)", color: "#ff8c8c" }}>
                  ⚠ 60時間超残業 {fmtH(zangyoOver60)}h — 割増率が上がります（+25%追加）
                </div>
              )}
            </div>

            {/* 実乗務回数 */}
            <div>
              <Lbl text="実乗務回数"
                hint={wt ? `標準 ${wt.stdShifts}回 ／ 模範手当条件 ${wt.minShifts}回以上` : ""} />
              <NumInput value={actualShifts} onChange={setActualShifts}
                unit="回" placeholder={wt ? `標準 ${wt.stdShifts}回` : "—"} color={ac} />
              {wt && shifts > 0 && shifts < wt.minShifts && (
                <div style={{ marginTop: 5, fontSize: 10, color: "#ff8c8c", paddingLeft: 2 }}>
                  ⚠ 模範勤務手当の最低乗務数（{wt.minShifts}回）未満 → 模範手当は対象外
                </div>
              )}
            </div>

            {/* 有給手当 */}
            <div>
              <Lbl text="有給手当" hint="有給取得がない月は0円のまま" />
              <NumInput value={yukyuInput} onChange={setYukyuInput}
                unit="円" placeholder="例：12000" color="#e879f9"
                note="健康保険標準報酬日額 × 2労働日分（隔日）または1労働日分（日勤）" />
            </div>
          </div>
        </Card>

        {/* ── STEP 3: 事故・違反・手当 ── */}
        <Card title="STEP 3　事故・違反・手当の状況" icon="⚖️" color={ac}
          done={jikoAri !== null && hanhanAri !== null && mohanOK !== null && isLeader !== null}>
          <div style={{ display: "grid", gap: 12 }}>

            {/* 事故 */}
            <div style={{
              padding: "12px 14px", borderRadius: 10,
              background: jikoAri === true ? "rgba(255,80,80,0.08)" : jikoAri === false ? "rgba(79,201,142,0.06)" : "rgba(255,255,255,0.03)",
              border: `1px solid ${jikoAri === true ? "rgba(255,80,80,0.25)" : jikoAri === false ? "rgba(79,201,142,0.18)" : "rgba(255,255,255,0.07)"}`,
            }}>
              <Lbl text="🚨 今月、有責事故がありましたか？（過失50%以上）" />
              <Toggle value={jikoAri} onChange={setJikoAri} labelOn="あり ❌" labelOff="なし ✅" />
              {jikoAri && (
                <div style={{ marginTop: 7, fontSize: 10, color: "#ff8c8c" }}>
                  → 無事故手当・模範勤務手当が不支給になります
                </div>
              )}
            </div>

            {/* 違反 */}
            <div style={{
              padding: "12px 14px", borderRadius: 10,
              background: hanhanAri === true ? "rgba(255,150,50,0.08)" : hanhanAri === false ? "rgba(79,201,142,0.06)" : "rgba(255,255,255,0.03)",
              border: `1px solid ${hanhanAri === true ? "rgba(255,150,50,0.25)" : hanhanAri === false ? "rgba(79,201,142,0.18)" : "rgba(255,255,255,0.07)"}`,
            }}>
              <Lbl text="⚠️ 今月、交通違反・苦情等がありましたか？" />
              <Toggle value={hanhanAri} onChange={setHanhanAri} labelOn="あり ❌" labelOff="なし ✅" />
              {hanhanAri && (
                <div style={{ marginTop: 7, fontSize: 10, color: "#f59e0b" }}>
                  → 無違反手当・模範勤務手当が不支給になります
                </div>
              )}
            </div>

            {/* 模範勤務その他条件 */}
            <div style={{
              padding: "12px 14px", borderRadius: 10,
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.07)",
              opacity: (jikoAri || hanhanAri) ? 0.42 : 1,
            }}>
              <Lbl text="⭐ 模範勤務のその他条件を満たしていますか？"
                hint="拘束時間違反なし・出番変更なし等" />
              <Toggle value={mohanOK} onChange={setMohanOK}
                labelOn="満たしていない" labelOff="満たしている"
                colorOn="#666" colorOff="#4f8ef7" />
            </div>

            {/* リーダー */}
            <div style={{
              padding: "12px 14px", borderRadius: 10,
              background: isLeader ? "rgba(168,85,247,0.08)" : "rgba(255,255,255,0.03)",
              border: `1px solid ${isLeader ? "rgba(168,85,247,0.25)" : "rgba(255,255,255,0.07)"}`,
            }}>
              <Lbl text="👑 リーダーに任命されていますか？" />
              <Toggle value={isLeader} onChange={setIsLeader}
                labelOn="はい" labelOff="いいえ"
                colorOn="#a855f7" colorOff="#555" />
              {isLeader && wt && (
                <div style={{ marginTop: 7, fontSize: 10, color: "#a855f7" }}>
                  → {wt.mihan.leader.toLocaleString()}円/乗務 × {shifts || "?"}回 が加算されます
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* ── 結果 ── */}
        {result && wt && (
          <div style={{
            borderRadius: 20, overflow: "hidden",
            border: `1.5px solid ${wt.color}55`,
            background: "rgba(7,10,22,0.9)",
            backdropFilter: "blur(14px)",
          }}>
            {/* 結果ヘッダー */}
            <div style={{
              background: `linear-gradient(135deg,${wt.color}20,transparent)`,
              padding: "16px 20px 12px",
              borderBottom: "1px solid rgba(255,255,255,0.07)",
            }}>
              <div style={{ fontSize: 10, color: wt.color, letterSpacing: "0.2em", marginBottom: 3 }}>RESULT — 給与内訳</div>
              <div style={{ fontSize: 11, color: "rgba(165,185,225,0.5)", lineHeight: 1.7 }}>
                {wt.label}　{Math.floor(effectiveStart)}:{effectiveStart % 1 === 0.5 ? "30" : "00"}出勤 → 退勤 <span style={{ color: "#e8eaf0" }}>{endTimeStr}</span><br />
                営収 <span style={{ color: "#fbbf24" }}>{eiSalesInput}万円</span>　
                総労働 <span style={{ color: "#fbbf24" }}>{totalHoursInput}h</span>　
                深夜 <span style={{ color: "#818cf8" }}>{fmtH(shinyaHours)}h（自動）</span>　
                乗務 <span style={{ color: "#fbbf24" }}>{actualShifts}回</span>
              </div>
            </div>

            <div style={{ padding: "16px 20px" }}>

              {/* ① 歩合給 */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, color: wt.color, letterSpacing: "0.14em", marginBottom: 6 }}>① 積算歩合給</div>
                <RRow label="歩合A（基礎歩合）" value={fmt(result.hoai.baseA)} color={wt.color} indent />
                <RRow label="歩合B（積算歩合）" value={fmt(result.hoai.baseB || 0)} color={wt.light} indent
                  zero={!result.hoai.baseB}
                  sub={!result.hoai.baseB ? "閾値未達" : workType==="kakujitsu" ? "42万超×19.05%" : workType==="hirubi" ? "37.8万超×14.05%" : "42万超×20.95%"} />
                {workType === "hirubi" && (result.hoai.baseC || 0) > 0 && (
                  <RRow label="歩合C（積算歩合）" value={fmt(result.hoai.baseC)} color="#c084fc" indent
                    sub="74.8万超×12.20%" />
                )}
                <RRow label="歩合給　小計" value={fmtM(result.hoai.total)} color={wt.color} bold />
              </div>

              {/* ② 残業手当・深夜手当（歩合ベース） */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, letterSpacing: "0.14em", marginBottom: 6,
                  color: result.zangyo.totalPay > 0 ? "#fbbf24" : "rgba(180,200,240,0.22)" }}>
                  ② 時間外割増（歩合給ベース）
                </div>
                {/* 残業手当 */}
                <div style={{ fontSize: 10, color: "#fbbf24", paddingLeft: 4, marginBottom: 3 }}>▌ 残業手当</div>
                {result.zangyo.zangyoSubtotal === 0 ? (
                  <div style={{ fontSize: 11, color: "rgba(130,150,190,0.32)", paddingLeft: 12, marginBottom: 6 }}>残業なし（0円）</div>
                ) : (
                  <>
                    <RRow label={`通常残業割増（${fmtH(result.zangyo.zangyoHours)}h × 25%）`}
                      value={fmt(result.zangyo.zangyoPay)} color="#fbbf24" indent />
                    {result.zangyo.over60Hours > 0 && (
                      <RRow label={`60h超割増（${fmtH(result.zangyo.over60Hours)}h × 追加25%）`}
                        value={fmt(result.zangyo.over60Pay)} color="#ff6b6b" indent />
                    )}
                    <RRow label="残業手当　小計" value={fmt(result.zangyo.zangyoSubtotal)} color="#fbbf24" bold />
                  </>
                )}
                {/* 深夜手当 */}
                <div style={{ fontSize: 10, color: "#818cf8", paddingLeft: 4, marginTop: 8, marginBottom: 3 }}>▌ 深夜手当</div>
                {result.zangyo.shinyaPay === 0 ? (
                  <div style={{ fontSize: 11, color: "rgba(130,150,190,0.32)", paddingLeft: 12, marginBottom: 6 }}>深夜時間なし（0円）</div>
                ) : (
                  <RRow label={`深夜割増（${fmtH(shinyaHours)}h × 25%）`}
                    value={fmt(result.zangyo.shinyaPay)} color="#818cf8" indent />
                )}
                {/* 小計 */}
                <RRow label="残業手当＋深夜手当　小計" value={fmtM(result.zangyo.totalPay)} color="#fbbf24" bold />
              </div>

              {/* ③ 各種手当 */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, color: "#c084fc", letterSpacing: "0.14em", marginBottom: 6 }}>③ 各種手当（手当①）</div>

                <RRow label={`模範勤務手当${!result.mohanOKAll ? "（不支給）" : ""}`}
                  value={fmt(result.mohanTeate)} indent
                  color={result.mohanTeate > 0 ? "#c084fc" : "#555"}
                  zero={result.mohanTeate === 0}
                  sub={!result.mohanOKAll
                    ? jikoAri ? "事故あり" : hanhanAri ? "違反あり" : shifts < wt.minShifts ? "乗務数不足" : "条件未達"
                    : "月額固定"} />
                {result.mohanTeate > 0 && result.mohanZ.total > 0 && (
                  <RRow label="　└ 残業・深夜割増" value={fmt(result.mohanZ.total)} color="#d8b4fe" indent />
                )}

                <RRow label={`無事故手当${jikoAri ? "（不支給）" : ""}`}
                  value={fmt(result.muijiko)} indent
                  color={result.muijiko > 0 ? "#4fc98e" : "#555"}
                  zero={result.muijiko === 0}
                  sub={jikoAri ? "事故あり" : `${wt.mihan.muijiko.toLocaleString()}円×${shifts}回`} />
                {result.muijiko > 0 && result.muijikoZ.total > 0 && (
                  <RRow label="　└ 残業・深夜割増" value={fmt(result.muijikoZ.total)} color="#a0f0c8" indent />
                )}

                <RRow label={`無違反手当${hanhanAri ? "（不支給）" : ""}`}
                  value={fmt(result.musiji)} indent
                  color={result.musiji > 0 ? "#38bdf8" : "#555"}
                  zero={result.musiji === 0}
                  sub={hanhanAri ? "違反あり" : `${wt.mihan.musiji.toLocaleString()}円×${shifts}回`} />
                {result.musiji > 0 && result.musijiZ.total > 0 && (
                  <RRow label="　└ 残業・深夜割増" value={fmt(result.musijiZ.total)} color="#7dd3fc" indent />
                )}

                <RRow label={`リーダー手当${!isLeader ? "（非該当）" : ""}`}
                  value={fmt(result.leader)} indent
                  color={result.leader > 0 ? "#a855f7" : "#555"}
                  zero={result.leader === 0}
                  sub={isLeader ? `${wt.mihan.leader.toLocaleString()}円×${shifts}回` : ""} />
                {result.leader > 0 && result.leaderZ.total > 0 && (
                  <RRow label="　└ 残業・深夜割増" value={fmt(result.leaderZ.total)} color="#c4b5fd" indent />
                )}

                <RRow label="各種手当　小計（割増含む）"
                  value={fmtM(result.teateTotal + result.teateZTotal)} color="#c084fc" bold />
              </div>

              {/* ④ 有給手当 */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, color: "#e879f9", letterSpacing: "0.14em", marginBottom: 6 }}>④ 有給手当</div>
                {result.yukyu === 0 ? (
                  <div style={{ fontSize: 11, color: "rgba(130,150,190,0.32)", paddingLeft: 12 }}>今月は有給取得なし（0円）</div>
                ) : (
                  <RRow label="有給手当" value={fmt(result.yukyu)} color="#e879f9" indent
                    sub="健康保険標準報酬日額ベース" />
                )}
              </div>

              {/* ⑤ 最低賃金保障（第16条） */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10,
                  color: result.hoshoHojuu > 0 ? "#ff6b6b" : "rgba(180,200,240,0.22)",
                  letterSpacing: "0.14em", marginBottom: 6 }}>
                  ⑤ 最低賃金保障（第16条）
                </div>
                <RRow label={`最低賃金保障額（${TOKYO_MIN_WAGE}円/h）`}
                  value={fmt(result.minWageHosho)} color="rgba(180,200,240,0.45)" indent
                  sub={`${totalHours}h×${TOKYO_MIN_WAGE} + 残業${fmtH(zangyoTotal)}h×0.25 + 深夜${fmtH(shinyaHours)}h×0.25`} />
                {result.hoshoHojuu > 0 ? (
                  <>
                    <RRow label="歩合+手当+有給の合計" value={fmt(result.beforeHosho)} color="rgba(180,200,240,0.45)" indent />
                    <RRow label="⚠ 最低賃金補填額" value={fmt(result.hoshoHojuu)} color="#ff6b6b" bold />
                    <div style={{ marginTop: 6, padding: "6px 10px", borderRadius: 7, fontSize: 10,
                      background: "rgba(255,80,80,0.08)", border: "1px solid rgba(255,80,80,0.2)", color: "#ff8c8c" }}>
                      給与合計が最低賃金保障額を下回るため {fmt(result.hoshoHojuu)} が補填されます
                    </div>
                  </>
                ) : (
                  <RRow label="判定" value="✅ 最低賃金クリア" color="#4fc98e" indent />
                )}
              </div>

              {/* 総支給 */}
              <div style={{
                padding: "16px 18px", borderRadius: 14,
                background: `linear-gradient(135deg,${wt.color}18,rgba(255,255,255,0.03))`,
                border: `1.5px solid ${wt.color}55`,
              }}>
                <div style={{ fontSize: 10, color: "rgba(175,195,230,0.4)", marginBottom: 10, letterSpacing: "0.1em" }}>
                  TOTAL　歩合給 ＋ 残業割増 ＋ 各種手当 ＋ 有給 ＋ 最賃保障
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ lineHeight: 1.9 }}>
                    <div style={{ fontSize: 11, color: "rgba(155,175,215,0.45)" }}>① {fmtM(result.hoai.total)}</div>
                    <div style={{ fontSize: 11, color: "rgba(155,175,215,0.45)" }}>
                      ② 残業 {fmtM(result.zangyo.zangyoSubtotal)} ＋ 深夜 {fmtM(result.zangyo.shinyaPay)}
                    </div>
                    <div style={{ fontSize: 11, color: "rgba(155,175,215,0.45)" }}>③ {fmtM(result.teateTotal + result.teateZTotal)}</div>
                    {result.yukyu > 0 && <div style={{ fontSize: 11, color: "rgba(155,175,215,0.45)" }}>④ {fmtM(result.yukyu)}</div>}
                    {result.hoshoHojuu > 0 && <div style={{ fontSize: 11, color: "#ff8c8c" }}>⑤ 最賃補填 {fmt(result.hoshoHojuu)}</div>}
                  </div>
                  <div style={{
                    fontSize: 30, fontWeight: 900, color: wt.color,
                    textShadow: `0 0 28px ${wt.color}88`,
                    fontVariantNumeric: "tabular-nums",
                  }}>
                    {fmtM(result.grandTotal)}
                  </div>
                </div>
              </div>

              {/* 歩合率表示 */}
              <div style={{
                marginTop: 10, padding: "12px 18px", borderRadius: 12,
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.08)",
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                <div>
                  <div style={{ fontSize: 12, color: "rgba(185,200,235,0.55)", marginBottom: 4 }}>
                    営業収入に対する給与総額の割合
                  </div>
                  <div style={{ fontSize: 10, color: "rgba(160,180,220,0.4)" }}>
                    給与総額 {fmtM(result.grandTotal)} ÷ 営収 {fmtM(eiSales)}
                  </div>
                </div>
                <span style={{
                  fontSize: 22, fontWeight: 900, letterSpacing: "0.04em",
                  fontVariantNumeric: "tabular-nums", color: wt.color,
                  textShadow: `0 0 20px ${wt.color}66`,
                }}>
                  {eiSales > 0 ? ((result.grandTotal / eiSales) * 100).toFixed(2) : "0.00"}%
                </span>
              </div>

              {/* 詳細内訳 */}
              <details style={{ marginTop: 12 }}>
                <summary style={{ fontSize: 10, color: "rgba(135,155,195,0.32)", cursor: "pointer", userSelect: "none" }}>
                  詳細計算内訳を表示
                </summary>
                <div style={{
                  marginTop: 8, padding: "10px 12px", borderRadius: 8,
                  background: "rgba(0,0,0,0.45)", fontSize: 10, color: "rgba(155,175,215,0.48)", lineHeight: 2.1,
                }}>
                  <div>【出勤時刻】{Math.floor(effectiveStart)}:{effectiveStart % 1 === 0.5 ? "30" : "00"} → 退勤 {endTimeStr}（総労働 {totalHours}h）</div>
                  <div>【深夜自動計算】22:00〜翌5:00 と重複 = {fmtH(shinyaHours)}h</div>
                  <div>【営収調整】{(eiSales/10000).toFixed(1)}万 × {adjustment} = {(eiSales*adjustment/10000).toFixed(2)}万</div>
                  <div>【歩合A】× {workType==="hirubi"?"45.80%":workType==="kakujitsu"?"41.44%":"37.98%"}
                    = {fmt(result.hoai.baseA)}</div>
                  {(result.hoai.baseB||0) > 0 && <div>【歩合B】閾値超過分 = {fmt(result.hoai.baseB)}</div>}
                  {(result.hoai.baseC||0) > 0 && <div>【歩合C】74.8万超分 = {fmt(result.hoai.baseC)}</div>}
                  <div>【時給ベース】{fmt(result.hoai.total)} ÷ {totalHours}h
                    = {Math.round(result.hoai.total/totalHours)}円/h</div>
                  {zangyoTotal > 0 && <div>【残業】{totalHours}h - {wt.teisho}h = {fmtH(zangyoTotal)}h</div>}
                  <div>【模範勤務】{result.mohanOKAll ? fmt(result.mohanTeate) : "不支給"}</div>
                  <div>【無事故】{jikoAri ? "不支給" : fmt(result.muijiko)}</div>
                  <div>【無違反】{hanhanAri ? "不支給" : fmt(result.musiji)}</div>
                  <div>【リーダー】{isLeader ? fmt(result.leader) : "非該当"}</div>
                  <div>【有給手当】{result.yukyu > 0 ? fmt(result.yukyu) : "なし（0円）"}</div>
                  <div>【最低賃金保障額】{fmt(result.minWageHosho)}（{TOKYO_MIN_WAGE}円/h）</div>
                  <div>【最賃補填】{result.hoshoHojuu > 0 ? fmt(result.hoshoHojuu) : "補填なし"}</div>
                </div>
              </details>
            </div>
          </div>
        )}

        {!inputReady && workType && (
          <div style={{
            marginTop: 8, padding: "12px 16px", borderRadius: 12,
            background: "rgba(255,255,255,0.025)", border: "1px dashed rgba(255,255,255,0.09)",
            fontSize: 11, color: "rgba(145,165,205,0.38)", textAlign: "center",
          }}>
            全項目を入力・選択すると給与が自動計算されます
          </div>
        )}

        <div style={{ marginTop: 22, fontSize: 10, color: "rgba(105,125,165,0.28)", lineHeight: 1.9, textAlign: "center" }}>
          ※ 深夜時間は出勤固定時刻と総労働時間から自動計算（22:00〜翌5:00）<br />
          ※ 計算対象：歩合給・時間外割増・手当①・有給手当・最低賃金保障（第16条）<br />
          ※ 服務手当・研修手当・内勤手当②③・手当④は含まれません<br />
          ※ 東京都最低賃金は {TOKYO_MIN_WAGE}円/h を使用（変更時はソース内定数を更新）
        </div>
      </div>}
    </div>
  );
}
