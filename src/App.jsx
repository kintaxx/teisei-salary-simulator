import { useState, useMemo } from "react";

// ─────────────────────────────────────────────
// 定数
// ─────────────────────────────────────────────
const TOKYO_MIN_WAGE = 1163;

// 勤務体系定義
const WORK_SYSTEMS = {
  teikaku10: { id:"teikaku10", label:"定隔10", type:"kakujitsu", shifts:10, teisho:142.5, icon:"🌙", color:"#06b6d4" },
  teikaku8:  { id:"teikaku8",  label:"定隔8",  type:"kakujitsu", shifts:8,  teisho:114,   icon:"🌙", color:"#06b6d4" },
  teikaku4:  { id:"teikaku4",  label:"定隔4",  type:"kakujitsu", shifts:4,  teisho:57,    icon:"🌙", color:"#06b6d4" },
  teihi20:   { id:"teihi20",   label:"定昼20", type:"hirubi",    shifts:20, teisho:150,   icon:"☀️", color:"#f59e0b" },
  teihi16:   { id:"teihi16",   label:"定昼16", type:"hirubi",    shifts:16, teisho:120,   icon:"☀️", color:"#f59e0b" },
  teihi8:    { id:"teihi8",    label:"定昼8",  type:"hirubi",    shifts:8,  teisho:60,    icon:"☀️", color:"#f59e0b" },
  teiyo20:   { id:"teiyo20",   label:"定夜20", type:"yorubi",    shifts:20, teisho:150,   icon:"🌃", color:"#a78bfa" },
  teiyo16:   { id:"teiyo16",   label:"定夜16", type:"yorubi",    shifts:16, teisho:120,   icon:"🌃", color:"#a78bfa" },
  teiyo8:    { id:"teiyo8",    label:"定夜8",  type:"yorubi",    shifts:8,  teisho:60,    icon:"🌃", color:"#a78bfa" },
};

// シフト定義（始業・終業・深夜時間）
const SHIFTS = {
  kakujitsu: [
    { id:"AA", label:"AAシフト", start:5.5,  end:22.75, shinya:0.75,  display:"5:30 - 22:45" },
    { id:"A",  label:"Aシフト",  start:6.5,  end:23.75, shinya:1.75,  display:"6:30 - 23:45" },
    { id:"B",  label:"Bシフト",  start:7.5,  end:24.75, shinya:2.75,  display:"7:30 - 翌0:45" },
    { id:"D",  label:"Dシフト",  start:9.5,  end:26.75, shinya:4.75,  display:"9:30 - 翌2:45" },
    { id:"E",  label:"Eシフト",  start:11.0, end:28.25, shinya:6.25,  display:"11:00 - 翌4:15" },
    { id:"F",  label:"Fシフト",  start:12.5, end:29.75, shinya:7.0,   display:"12:30 - 翌5:45" },
    { id:"G",  label:"Gシフト",  start:13.5, end:30.75, shinya:7.0,   display:"13:30 - 翌6:45" },
    { id:"H",  label:"Hシフト",  start:15.0, end:32.25, shinya:7.0,   display:"15:00 - 翌8:15" },
    { id:"I",  label:"Iシフト",  start:16.0, end:33.25, shinya:7.0,   display:"16:00 - 翌9:15" },
  ],
  hirubi: [
    { id:"A",  label:"昼日勤A", start:6.0,  end:15.0, shinya:0, display:"6:00 - 15:00" },
    { id:"B",  label:"昼日勤B", start:7.5,  end:16.5, shinya:0, display:"7:30 - 16:30" },
  ],
  yorubi: [
    { id:"yo", label:"夜日勤",  start:17.5, end:26.5, shinya:4.5, display:"17:30 - 翌2:30" },
  ],
};

// 歩合率
const HOAI_RATE = { kakujitsu: 0.4532, hirubi: 0.4992, yorubi: 0.4450 };

// 手当単価（定時制：模範勤務手当なし）
const TEATE_RATE = {
  kakujitsu: { muijiko: 700, musiji: 200, leader: 1900 },
  hirubi:    { muijiko: 350, musiji: 100, leader: 1100 },
  yorubi:    { muijiko: 350, musiji: 100, leader: 1000 },
};

// ─────────────────────────────────────────────
// 計算ロジック
// ─────────────────────────────────────────────
function calcHoai(type, eiSales, adjustment) {
  const s = eiSales * adjustment;
  const total = s * HOAI_RATE[type];
  return { total };
}

function calcZangyo(hoaiTotal, totalHours, teisho, shinyaHours) {
  const zangyoTotal = Math.max(0, totalHours - teisho);
  const hourlyRate = totalHours > 0 ? hoaiTotal / totalHours : 0;
  const zangyoNormal = Math.min(zangyoTotal, 60);
  const zangyoOver60 = Math.max(0, zangyoTotal - 60);
  const zangyoPay = hourlyRate * 0.25 * zangyoNormal;
  const over60Pay = hourlyRate * 0.25 * zangyoOver60;
  const shinyaPay = hourlyRate * 0.25 * (shinyaHours || 0);
  const zangyoSubtotal = zangyoPay + over60Pay;
  return { zangyoHours: zangyoNormal, over60Hours: zangyoOver60, zangyoPay, over60Pay, shinyaPay, zangyoSubtotal, totalPay: zangyoSubtotal + shinyaPay };
}

function calcTeateZangyo(teateAmount, teisho, zangyoHours, shinyaHours) {
  if (teateAmount <= 0) return { zangyoPay: 0, shinyaPay: 0, total: 0 };
  const base = teateAmount / teisho;
  return { zangyoPay: base * 1.25 * zangyoHours, shinyaPay: base * 0.25 * shinyaHours, total: base * 1.25 * zangyoHours + base * 0.25 * shinyaHours };
}

function calcMinWage(totalHours, zangyoHours, shinyaHours) {
  return Math.ceil(TOKYO_MIN_WAGE * totalHours + TOKYO_MIN_WAGE * zangyoHours * 0.25 + TOKYO_MIN_WAGE * shinyaHours * 0.25);
}

// ─────────────────────────────────────────────
// フォーマット
// ─────────────────────────────────────────────
const fmt  = n => Math.round(n).toLocaleString("ja-JP") + "円";
const fmtM = n => (Math.round(n / 100) / 100).toFixed(2) + "万円";
const fmtH = n => parseFloat(n).toFixed(1);

// ─────────────────────────────────────────────
// UIパーツ
// ─────────────────────────────────────────────
const AC = "#10b981"; // アクセントカラー（エメラルド）

function Toggle({ value, onChange, labelOn, labelOff, colorOn="#ff6b6b", colorOff="#10b981" }) {
  return (
    <div style={{ display:"flex", gap:6 }}>
      {[{v:true,label:labelOn,color:colorOn},{v:false,label:labelOff,color:colorOff}].map(o => (
        <button key={String(o.v)} onClick={() => onChange(o.v)} style={{
          flex:1, padding:"9px 0", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer",
          border: value===o.v ? `2px solid ${o.color}` : "2px solid rgba(255,255,255,0.09)",
          background: value===o.v ? `${o.color}22` : "rgba(255,255,255,0.03)",
          color: value===o.v ? o.color : "rgba(180,210,190,0.38)",
          transition:"all 0.18s",
        }}>{o.label}</button>
      ))}
    </div>
  );
}

function NumInput({ value, onChange, unit, placeholder, color, note }) {
  return (
    <div>
      <div style={{ position:"relative" }}>
        <input type="number" value={value} onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          style={{
            width:"100%", padding:"12px 52px 12px 14px", borderRadius:10, boxSizing:"border-box",
            border:`1.5px solid ${value ? (color||AC)+"99" : "rgba(255,255,255,0.1)"}`,
            background:"rgba(0,0,0,0.35)", color:"#e8f5ee", fontSize:16, fontWeight:600,
            outline:"none", appearance:"none", transition:"border 0.2s",
          }} />
        <span style={{
          position:"absolute", right:12, top:"50%", transform:"translateY(-50%)",
          color: value ? (color||AC) : "rgba(160,210,180,0.28)", fontSize:12, fontWeight:700, pointerEvents:"none",
        }}>{unit}</span>
      </div>
      {note && <div style={{ marginTop:5, fontSize:10, color:"rgba(140,200,170,0.42)", paddingLeft:2 }}>{note}</div>}
    </div>
  );
}

function Card({ title, icon, children, color, done }) {
  return (
    <div style={{
      marginBottom:14, borderRadius:16, overflow:"hidden",
      border:`1px solid ${done ? (color||AC)+"55" : "rgba(255,255,255,0.08)"}`,
      background:"rgba(255,255,255,0.022)", transition:"border 0.3s",
    }}>
      <div style={{
        padding:"10px 16px", display:"flex", alignItems:"center", gap:8,
        borderBottom:"1px solid rgba(255,255,255,0.055)",
        background: done ? `${color||AC}12` : "transparent",
      }}>
        <span style={{ fontSize:14 }}>{icon}</span>
        <span style={{ fontSize:11, fontWeight:700, letterSpacing:"0.08em",
          color: done ? (color||AC) : "rgba(160,210,180,0.5)" }}>{title}</span>
        {done && <span style={{ marginLeft:"auto", fontSize:11, color: color||AC }}>✓</span>}
      </div>
      <div style={{ padding:"14px 16px" }}>{children}</div>
    </div>
  );
}

function Lbl({ text, hint }) {
  return (
    <div style={{ marginBottom:7 }}>
      <span style={{ fontSize:12, color:"rgba(185,220,200,0.7)" }}>{text}</span>
      {hint && <span style={{ fontSize:10, color:"rgba(140,200,170,0.38)", marginLeft:6 }}>{hint}</span>}
    </div>
  );
}

function RRow({ label, value, color="#e8f5ee", bold, indent, sub, zero }) {
  return (
    <div style={{
      display:"flex", justifyContent:"space-between", alignItems:"flex-end",
      padding: indent ? "4px 0 4px 14px" : "5px 0",
      borderBottom:"1px solid rgba(255,255,255,0.04)",
      opacity: zero ? 0.3 : 1,
    }}>
      <span style={{ fontSize: indent ? 11 : 12, color:"rgba(170,215,190,0.62)" }}>
        {label}
        {sub && <span style={{ fontSize:10, color:"rgba(140,190,165,0.33)", marginLeft:5 }}>{sub}</span>}
      </span>
      <span style={{ fontSize: bold ? 14 : 12, fontWeight: bold ? 800 : 500, color, fontVariantNumeric:"tabular-nums" }}>
        {value}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────
// メイン
// ─────────────────────────────────────────────
export default function TeiseiSimulator() {
  const [adjustInput,  setAdjustInput]  = useState("1.0000");
  const [workSystem,   setWorkSystem]   = useState(null);
  const [shiftId,      setShiftId]      = useState(null);
  const [eiSalesInput, setEiSalesInput] = useState("");
  const [totalHoursInput, setTotalHoursInput] = useState("");
  const [actualShifts, setActualShifts] = useState("");
  const [yukyuInput,   setYukyuInput]   = useState("");
  const [jikoAri,      setJikoAri]      = useState(null);
  const [hanhanAri,    setHanhanAri]    = useState(null);
  const [isLeader,     setIsLeader]     = useState(null);

  const ws = workSystem ? WORK_SYSTEMS[workSystem] : null;
  const adjustment = parseFloat(adjustInput) || 1.0;
  const eiSales    = parseFloat(eiSalesInput) * 10000 || 0;
  const totalHours = parseFloat(totalHoursInput) || 0;
  const shifts     = parseInt(actualShifts) || 0;
  const yukyuPay   = parseFloat(yukyuInput) || 0;

  // シフト一覧
  const shiftList = ws ? SHIFTS[ws.type] : [];
  const selectedShift = shiftList.find(s => s.id === shiftId) || null;

  // 深夜時間（シフトから固定値）
  const shinyaHours = selectedShift ? selectedShift.shinya : 0;

  // 残業時間
  const zangyoTotal = ws ? Math.max(0, totalHours - ws.teisho) : 0;
  const zangyoNormal = Math.min(zangyoTotal, 60);
  const zangyoOver60 = Math.max(0, zangyoTotal - 60);

  const inputReady = workSystem && shiftId && eiSales > 0 && totalHours > 0 && shifts > 0
    && jikoAri !== null && hanhanAri !== null && isLeader !== null;

  const result = useMemo(() => {
    if (!inputReady || !ws) return null;
    const hoai   = calcHoai(ws.type, eiSales, adjustment);
    const shinya = shinyaHours;
    const zangyo = calcZangyo(hoai.total, totalHours, ws.teisho, shinya);
    const zan    = zangyoNormal + zangyoOver60;

    const muijiko  = !jikoAri  ? TEATE_RATE[ws.type].muijiko  * shifts : 0;
    const musiji   = !hanhanAri ? TEATE_RATE[ws.type].musiji  * shifts : 0;
    const leader   = isLeader  ? TEATE_RATE[ws.type].leader   * shifts : 0;
    const muijikoZ = calcTeateZangyo(muijiko,  ws.teisho, zan, shinya);
    const musijiZ  = calcTeateZangyo(musiji,   ws.teisho, zan, shinya);
    const leaderZ  = calcTeateZangyo(leader,   ws.teisho, zan, shinya);

    const teateTotal  = muijiko + musiji + leader;
    const teateZTotal = muijikoZ.total + musijiZ.total + leaderZ.total;
    const yukyu = yukyuPay;

    const minWageHosho = calcMinWage(totalHours, zan, shinya);
    const beforeHosho  = hoai.total + zangyo.totalPay + teateTotal + teateZTotal + yukyu;
    const hoshoHojuu   = Math.max(0, minWageHosho - beforeHosho);
    const grandTotal   = beforeHosho + hoshoHojuu;

    return { hoai, zangyo, muijiko, muijikoZ, musiji, musijiZ, leader, leaderZ,
             teateTotal, teateZTotal, yukyu, minWageHosho, hoshoHojuu, beforeHosho, grandTotal };
  }, [inputReady, workSystem, shiftId, eiSales, totalHours, shinyaHours,
      shifts, jikoAri, hanhanAri, isLeader, yukyuPay, adjustment]);

  const accentColor = ws?.color || AC;

  return (
    <div style={{
      minHeight:"100vh",
      background:"radial-gradient(ellipse at 15% 10%, #052e1a 0%, #030c08 55%, #071a12 100%)",
      fontFamily:"'Noto Sans JP','Hiragino Kaku Gothic ProN',sans-serif",
      color:"#e8f5ee", padding:"22px 14px 60px",
    }}>

      {/* ヘッダー */}
      <div style={{ textAlign:"center", marginBottom:26 }}>
        <div style={{
          display:"inline-block", padding:"4px 16px", borderRadius:20, marginBottom:8,
          background:"rgba(16,185,129,0.15)", border:"1px solid rgba(16,185,129,0.3)",
          fontSize:10, letterSpacing:"0.3em", color:"#10b981",
        }}>
          定時制乗務員賃金規程（TAⅡ型）
        </div>
        <h1 style={{
          margin:0, fontSize:22, fontWeight:900, letterSpacing:"0.05em",
          background:"linear-gradient(100deg, #10b981 0%, #34d399 40%, #6ee7b7 70%, #a7f3d0 100%)",
          WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent",
        }}>定時制　給与シミュレーター</h1>
        <div style={{ fontSize:11, color:"rgba(134,200,170,0.38)", marginTop:4 }}>
          歩合給 ＋ 残業割増 ＋ 深夜手当 ＋ 各種手当
        </div>
      </div>

      <div style={{ maxWidth:540, margin:"0 auto" }}>

        {/* 運賃改定係数 */}
        <div style={{
          marginBottom:14, borderRadius:14, overflow:"hidden",
          border:"1px solid rgba(251,191,36,0.35)",
          background:"rgba(251,191,36,0.06)",
        }}>
          <div style={{
            padding:"10px 16px", display:"flex", alignItems:"center", gap:8,
            borderBottom:"1px solid rgba(255,255,255,0.06)",
            background:"rgba(251,191,36,0.10)",
          }}>
            <span style={{ fontSize:14 }}>⚙️</span>
            <span style={{ fontSize:11, fontWeight:700, letterSpacing:"0.08em", color:"#fbbf24" }}>
              運賃改定係数（変更可能）
            </span>
          </div>
          <div style={{ padding:"12px 16px" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <input type="number" value={adjustInput} onChange={e => setAdjustInput(e.target.value)}
                step="0.0001"
                style={{
                  width:120, padding:"9px 12px", borderRadius:10,
                  border:"1.5px solid rgba(251,191,36,0.6)",
                  background:"rgba(0,0,0,0.35)", color:"#fbbf24",
                  fontSize:16, fontWeight:700, outline:"none", appearance:"none",
                }} />
              <div style={{ fontSize:12, color:"rgba(200,215,255,0.55)", lineHeight:1.7 }}>
                <div>現在の係数：<span style={{ color:"#fbbf24", fontWeight:700 }}>{adjustment}</span></div>
                <div style={{ fontSize:10, color:"rgba(180,195,230,0.38)" }}>
                  デフォルト：1.0000（定時制は係数なし）
                </div>
              </div>
              <button onClick={() => setAdjustInput("1.0000")} style={{
                padding:"6px 12px", borderRadius:8, cursor:"pointer",
                border:"1px solid rgba(251,191,36,0.3)",
                background:"rgba(251,191,36,0.1)", color:"#fbbf24",
                fontSize:11, fontWeight:600,
              }}>リセット</button>
            </div>
          </div>
        </div>

        {/* STEP1: 勤務体系選択 */}
        <Card title="STEP 1　勤務体系を選択" icon="📋" color={accentColor} done={!!workSystem}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
            {Object.values(WORK_SYSTEMS).map(wk => {
              const sel = workSystem === wk.id;
              return (
                <button key={wk.id} onClick={() => { setWorkSystem(wk.id); setShiftId(null); }} style={{
                  padding:"10px 8px", borderRadius:10, cursor:"pointer", textAlign:"center",
                  border: sel ? `2px solid ${wk.color}` : "2px solid rgba(255,255,255,0.07)",
                  background: sel ? `${wk.color}22` : "rgba(255,255,255,0.02)",
                  transition:"all 0.2s",
                }}>
                  <div style={{ fontSize:18, marginBottom:3 }}>{wk.icon}</div>
                  <div style={{ fontSize:13, fontWeight:700, color: sel ? wk.color : "#d0ead8" }}>{wk.label}</div>
                  <div style={{ fontSize:9, color:"rgba(140,200,170,0.45)", marginTop:2 }}>
                    {wk.shifts}乗務・{wk.teisho}h
                  </div>
                </button>
              );
            })}
          </div>
        </Card>

        {/* STEP2: シフト選択 */}
        <Card title="STEP 2　シフトを選択" icon="🕐" color={accentColor} done={!!shiftId}>
          {!workSystem ? (
            <div style={{ fontSize:12, color:"rgba(140,200,170,0.35)", textAlign:"center", padding:"8px 0" }}>
              先に勤務体系を選択してください
            </div>
          ) : (
            <div>
              <Lbl text="シフト" hint="始業・終業時刻を確認してください" />
              <select
                value={shiftId || ""}
                onChange={e => setShiftId(e.target.value)}
                style={{
                  width:"100%", padding:"12px 14px", borderRadius:10, boxSizing:"border-box",
                  border:`1.5px solid ${shiftId ? accentColor+"99" : "rgba(255,255,255,0.1)"}`,
                  background:"rgba(0,0,0,0.45)", color: shiftId ? "#e8f5ee" : "rgba(160,200,180,0.4)",
                  fontSize:14, fontWeight:600, outline:"none", cursor:"pointer",
                  appearance:"none",
                }}
              >
                <option value="" disabled>▼ シフトを選択</option>
                {shiftList.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.label}　{s.display}
                  </option>
                ))}
              </select>

              {selectedShift && (
                <div style={{
                  marginTop:10, padding:"10px 14px", borderRadius:10,
                  background:`${accentColor}12`, border:`1px solid ${accentColor}33`,
                  display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8,
                }}>
                  <div style={{ textAlign:"center" }}>
                    <div style={{ fontSize:9, color:"rgba(140,200,170,0.45)", marginBottom:2 }}>始業</div>
                    <div style={{ fontSize:13, fontWeight:700, color:"#e8f5ee" }}>{selectedShift.display.split(" - ")[0]}</div>
                  </div>
                  <div style={{ textAlign:"center" }}>
                    <div style={{ fontSize:9, color:"rgba(140,200,170,0.45)", marginBottom:2 }}>終業</div>
                    <div style={{ fontSize:13, fontWeight:700, color:"#e8f5ee" }}>{selectedShift.display.split(" - ")[1]}</div>
                  </div>
                  <div style={{ textAlign:"center" }}>
                    <div style={{ fontSize:9, color:"rgba(140,200,170,0.45)", marginBottom:2 }}>深夜時間 🤖</div>
                    <div style={{ fontSize:13, fontWeight:700, color:"#818cf8" }}>{selectedShift.shinya}h</div>
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>

        {/* STEP3: 基本数値 */}
        <Card title="STEP 3　基本数値を入力" icon="🔢" color={accentColor}
          done={eiSales > 0 && totalHours > 0 && shifts > 0}>
          <div style={{ display:"grid", gap:12 }}>
            <div>
              <Lbl text="月間営収" hint="税抜・消費税相当額控除後" />
              <NumInput value={eiSalesInput} onChange={setEiSalesInput} unit="万円" placeholder="例：40" color={accentColor} />
            </div>
            <div>
              <Lbl text="月間総労働時間"
                hint={ws ? `所定 ${ws.teisho}h 超が残業` : "勤務体系を先に選択"} />
              <NumInput value={totalHoursInput} onChange={setTotalHoursInput}
                unit="時間" placeholder={ws ? `所定 ${ws.teisho}h` : "—"} color={accentColor} />
              {ws && totalHours > 0 && (
                <div style={{
                  marginTop:6, padding:"6px 10px", borderRadius:7, fontSize:11,
                  background: zangyoTotal > 0 ? "rgba(255,180,50,0.08)" : "rgba(16,185,129,0.08)",
                  border:`1px solid ${zangyoTotal > 0 ? "rgba(255,180,50,0.2)" : "rgba(16,185,129,0.2)"}`,
                  color: zangyoTotal > 0 ? "#fbbf24" : "#10b981",
                }}>
                  {zangyoTotal === 0 ? "✅ 残業なし" :
                   zangyoOver60 > 0 ? `⚠️ 残業 ${fmtH(zangyoTotal)}h（うち60h超：${fmtH(zangyoOver60)}h）` :
                   `⏱ 残業 ${fmtH(zangyoTotal)}h`}
                </div>
              )}
            </div>
            <div>
              <Lbl text="実乗務回数"
                hint={ws ? `所定 ${ws.shifts}乗務` : ""} />
              <NumInput value={actualShifts} onChange={setActualShifts}
                unit="回" placeholder={ws ? `所定 ${ws.shifts}回` : "—"} color={accentColor} />
            </div>
            <div>
              <Lbl text="有給手当" hint="有給取得がない月は0円のまま" />
              <NumInput value={yukyuInput} onChange={setYukyuInput}
                unit="円" placeholder="例：12000" color="#e879f9"
                note="健康保険標準報酬日額ベース" />
            </div>
          </div>
        </Card>

        {/* STEP4: 事故・違反・手当 */}
        <Card title="STEP 4　事故・違反・手当の状況" icon="⚖️" color={accentColor}
          done={jikoAri !== null && hanhanAri !== null && isLeader !== null}>
          <div style={{ display:"grid", gap:12 }}>

            <div style={{
              padding:"12px 14px", borderRadius:10,
              background: jikoAri === true ? "rgba(255,80,80,0.08)" : jikoAri === false ? "rgba(16,185,129,0.06)" : "rgba(255,255,255,0.03)",
              border:`1px solid ${jikoAri === true ? "rgba(255,80,80,0.25)" : jikoAri === false ? "rgba(16,185,129,0.18)" : "rgba(255,255,255,0.07)"}`,
            }}>
              <Lbl text="🚨 今月、有責事故がありましたか？（過失50%以上）" />
              <Toggle value={jikoAri} onChange={setJikoAri} labelOn="あり ❌" labelOff="なし ✅" />
              {jikoAri && <div style={{ marginTop:7, fontSize:10, color:"#ff8c8c" }}>→ 無事故手当が不支給になります</div>}
            </div>

            <div style={{
              padding:"12px 14px", borderRadius:10,
              background: hanhanAri === true ? "rgba(255,150,50,0.08)" : hanhanAri === false ? "rgba(16,185,129,0.06)" : "rgba(255,255,255,0.03)",
              border:`1px solid ${hanhanAri === true ? "rgba(255,150,50,0.25)" : hanhanAri === false ? "rgba(16,185,129,0.18)" : "rgba(255,255,255,0.07)"}`,
            }}>
              <Lbl text="⚠️ 今月、交通違反・苦情等がありましたか？" />
              <Toggle value={hanhanAri} onChange={setHanhanAri} labelOn="あり ❌" labelOff="なし ✅" />
              {hanhanAri && <div style={{ marginTop:7, fontSize:10, color:"#f59e0b" }}>→ 無違反手当が不支給になります</div>}
            </div>

            <div style={{
              padding:"12px 14px", borderRadius:10,
              background: isLeader ? "rgba(168,85,247,0.08)" : "rgba(255,255,255,0.03)",
              border:`1px solid ${isLeader ? "rgba(168,85,247,0.25)" : "rgba(255,255,255,0.07)"}`,
            }}>
              <Lbl text="👑 リーダーに任命されていますか？" />
              <Toggle value={isLeader} onChange={setIsLeader}
                labelOn="はい" labelOff="いいえ"
                colorOn="#a855f7" colorOff="#555" />
              {isLeader && ws && (
                <div style={{ marginTop:7, fontSize:10, color:"#a855f7" }}>
                  → {TEATE_RATE[ws.type].leader.toLocaleString()}円/乗務 × {shifts || "?"}回
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* 結果 */}
        {result && ws && selectedShift && (
          <div style={{
            borderRadius:20, overflow:"hidden",
            border:"1.5px solid rgba(16,185,129,0.45)",
            background:"rgba(3,12,8,0.92)",
            backdropFilter:"blur(14px)",
          }}>
            {/* 結果ヘッダー */}
            <div style={{
              background:"linear-gradient(135deg, rgba(16,185,129,0.18), transparent)",
              padding:"16px 20px 12px",
              borderBottom:"1px solid rgba(255,255,255,0.07)",
            }}>
              <div style={{ fontSize:10, color:"#10b981", letterSpacing:"0.2em", marginBottom:3 }}>RESULT — 給与内訳</div>
              <div style={{ fontSize:11, color:"rgba(150,210,180,0.55)", lineHeight:1.8 }}>
                {ws.label}　{selectedShift.label}（{selectedShift.display}）<br />
                営収 <span style={{ color:"#fbbf24" }}>{eiSalesInput}万円</span>　
                総労働 <span style={{ color:"#fbbf24" }}>{totalHoursInput}h</span>　
                深夜 <span style={{ color:"#818cf8" }}>{fmtH(shinyaHours)}h（固定）</span>　
                乗務 <span style={{ color:"#fbbf24" }}>{actualShifts}回</span>
              </div>
            </div>

            <div style={{ padding:"16px 20px" }}>

              {/* ① 歩合給 */}
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:10, color:"#10b981", letterSpacing:"0.14em", marginBottom:6 }}>① 歩合給</div>
                <RRow label={`歩合給（営収 × 係数${adjustment} × ${(HOAI_RATE[ws.type]*100).toFixed(2)}%）`}
                  value={fmt(result.hoai.total)} color="#10b981" indent />
                <RRow label="歩合給　小計" value={fmtM(result.hoai.total)} color="#10b981" bold />
              </div>

              {/* ② 残業・深夜手当 */}
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:10, color:"#fbbf24", letterSpacing:"0.14em", marginBottom:6 }}>
                  ② 時間外割増（歩合給ベース）
                </div>
                <div style={{ fontSize:10, color:"#fbbf24", paddingLeft:4, marginBottom:3 }}>▌ 残業手当</div>
                {result.zangyo.zangyoSubtotal === 0 ? (
                  <div style={{ fontSize:11, color:"rgba(130,180,150,0.32)", paddingLeft:12, marginBottom:6 }}>残業なし（0円）</div>
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
                <div style={{ fontSize:10, color:"#818cf8", paddingLeft:4, marginTop:8, marginBottom:3 }}>▌ 深夜手当</div>
                {result.zangyo.shinyaPay === 0 ? (
                  <div style={{ fontSize:11, color:"rgba(130,180,150,0.32)", paddingLeft:12, marginBottom:6 }}>深夜時間なし（0円）</div>
                ) : (
                  <RRow label={`深夜割増（${fmtH(shinyaHours)}h × 25%）`}
                    value={fmt(result.zangyo.shinyaPay)} color="#818cf8" indent />
                )}
                <RRow label="残業手当＋深夜手当　小計" value={fmtM(result.zangyo.totalPay)} color="#fbbf24" bold />
              </div>

              {/* ③ 各種手当 */}
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:10, color:"#c084fc", letterSpacing:"0.14em", marginBottom:6 }}>③ 各種手当（手当①）</div>

                <RRow label={`無事故手当${jikoAri ? "（不支給）" : ""}`}
                  value={fmt(result.muijiko)} indent
                  color={result.muijiko > 0 ? "#4fc98e" : "#555"}
                  zero={result.muijiko === 0}
                  sub={jikoAri ? "事故あり" : ws ? `${TEATE_RATE[ws.type].muijiko.toLocaleString()}円×${shifts}回` : ""} />
                {result.muijiko > 0 && result.muijikoZ.total > 0 && (
                  <RRow label="　└ 残業・深夜割増" value={fmt(result.muijikoZ.total)} color="#a0f0c8" indent />
                )}

                <RRow label={`無違反手当${hanhanAri ? "（不支給）" : ""}`}
                  value={fmt(result.musiji)} indent
                  color={result.musiji > 0 ? "#38bdf8" : "#555"}
                  zero={result.musiji === 0}
                  sub={hanhanAri ? "違反あり" : ws ? `${TEATE_RATE[ws.type].musiji.toLocaleString()}円×${shifts}回` : ""} />
                {result.musiji > 0 && result.musijiZ.total > 0 && (
                  <RRow label="　└ 残業・深夜割増" value={fmt(result.musijiZ.total)} color="#7dd3fc" indent />
                )}

                <RRow label={`リーダー手当${!isLeader ? "（非該当）" : ""}`}
                  value={fmt(result.leader)} indent
                  color={result.leader > 0 ? "#a855f7" : "#555"}
                  zero={result.leader === 0}
                  sub={isLeader && ws ? `${TEATE_RATE[ws.type].leader.toLocaleString()}円×${shifts}回` : ""} />
                {result.leader > 0 && result.leaderZ.total > 0 && (
                  <RRow label="　└ 残業・深夜割増" value={fmt(result.leaderZ.total)} color="#c4b5fd" indent />
                )}

                <RRow label="各種手当　小計（割増含む）"
                  value={fmtM(result.teateTotal + result.teateZTotal)} color="#c084fc" bold />
              </div>

              {/* ④ 有給手当 */}
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:10, color:"#e879f9", letterSpacing:"0.14em", marginBottom:6 }}>④ 有給手当</div>
                {result.yukyu === 0 ? (
                  <div style={{ fontSize:11, color:"rgba(130,180,150,0.32)", paddingLeft:12 }}>今月は有給取得なし（0円）</div>
                ) : (
                  <RRow label="有給手当" value={fmt(result.yukyu)} color="#e879f9" indent />
                )}
              </div>

              {/* ⑤ 最低賃金保障 */}
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:10,
                  color: result.hoshoHojuu > 0 ? "#ff6b6b" : "rgba(160,210,180,0.22)",
                  letterSpacing:"0.14em", marginBottom:6 }}>
                  ⑤ 最低賃金保障（第16条）
                </div>
                <RRow label={`最低賃金保障額（${TOKYO_MIN_WAGE}円/h）`}
                  value={fmt(result.minWageHosho)} color="rgba(160,200,180,0.45)" indent
                  sub={`${totalHours}h×${TOKYO_MIN_WAGE} + 残業${fmtH(zangyoTotal)}h×0.25 + 深夜${fmtH(shinyaHours)}h×0.25`} />
                {result.hoshoHojuu > 0 ? (
                  <>
                    <RRow label="⚠ 最低賃金補填額" value={fmt(result.hoshoHojuu)} color="#ff6b6b" bold />
                    <div style={{ marginTop:6, padding:"6px 10px", borderRadius:7, fontSize:10,
                      background:"rgba(255,80,80,0.08)", border:"1px solid rgba(255,80,80,0.2)", color:"#ff8c8c" }}>
                      給与合計が最低賃金保障額を下回るため補填されます
                    </div>
                  </>
                ) : (
                  <RRow label="判定" value="✅ 最低賃金クリア" color="#10b981" indent />
                )}
              </div>

              {/* 総支給 */}
              <div style={{
                padding:"16px 18px", borderRadius:14,
                background:"linear-gradient(135deg, rgba(16,185,129,0.18), rgba(255,255,255,0.03))",
                border:"1.5px solid rgba(16,185,129,0.45)",
              }}>
                <div style={{ fontSize:10, color:"rgba(150,210,180,0.4)", marginBottom:10, letterSpacing:"0.1em" }}>
                  TOTAL　歩合給 ＋ 残業手当 ＋ 深夜手当 ＋ 各種手当 ＋ 有給 ＋ 最賃保障
                </div>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <div style={{ lineHeight:1.9 }}>
                    <div style={{ fontSize:11, color:"rgba(140,200,170,0.45)" }}>① {fmtM(result.hoai.total)}</div>
                    <div style={{ fontSize:11, color:"rgba(140,200,170,0.45)" }}>
                      ② 残業 {fmtM(result.zangyo.zangyoSubtotal)} ＋ 深夜 {fmtM(result.zangyo.shinyaPay)}
                    </div>
                    <div style={{ fontSize:11, color:"rgba(140,200,170,0.45)" }}>③ {fmtM(result.teateTotal + result.teateZTotal)}</div>
                    {result.yukyu > 0 && <div style={{ fontSize:11, color:"rgba(140,200,170,0.45)" }}>④ {fmtM(result.yukyu)}</div>}
                    {result.hoshoHojuu > 0 && <div style={{ fontSize:11, color:"#ff8c8c" }}>⑤ 最賃補填 {fmt(result.hoshoHojuu)}</div>}
                  </div>
                  <div style={{
                    fontSize:30, fontWeight:900, color:"#10b981",
                    textShadow:"0 0 28px rgba(16,185,129,0.88)",
                    fontVariantNumeric:"tabular-nums",
                  }}>
                    {fmtM(result.grandTotal)}
                  </div>
                </div>
              </div>

              {/* 給与総額÷営収 */}
              <div style={{
                marginTop:10, padding:"12px 18px", borderRadius:12,
                background:"rgba(16,185,129,0.06)",
                border:"1px solid rgba(16,185,129,0.2)",
                display:"flex", justifyContent:"space-between", alignItems:"center",
              }}>
                <div>
                  <div style={{ fontSize:12, color:"rgba(150,210,180,0.55)", marginBottom:3 }}>
                    営業収入に対する給与総額の割合
                  </div>
                  <div style={{ fontSize:10, color:"rgba(130,190,160,0.4)" }}>
                    給与総額 {fmtM(result.grandTotal)} ÷ 営収 {fmtM(eiSales)}
                  </div>
                </div>
                <div style={{
                  fontSize:22, fontWeight:900, color:"#10b981",
                  textShadow:"0 0 20px rgba(16,185,129,0.66)",
                  fontVariantNumeric:"tabular-nums",
                }}>
                  {eiSales > 0 ? ((result.grandTotal / eiSales) * 100).toFixed(2) : "0.00"}%
                </div>
              </div>

              {/* 詳細内訳 */}
              <details style={{ marginTop:12 }}>
                <summary style={{ fontSize:10, color:"rgba(120,180,150,0.32)", cursor:"pointer", userSelect:"none" }}>
                  詳細計算内訳を表示
                </summary>
                <div style={{
                  marginTop:8, padding:"10px 12px", borderRadius:8,
                  background:"rgba(0,0,0,0.45)", fontSize:10, color:"rgba(140,190,165,0.5)", lineHeight:2.1,
                }}>
                  <div>【シフト】{selectedShift.label}（{selectedShift.display}）深夜{shinyaHours}h固定</div>
                  <div>【営収調整】{eiSalesInput}万 × {adjustment} = {(eiSales * adjustment / 10000).toFixed(2)}万</div>
                  <div>【歩合給】× {(HOAI_RATE[ws.type]*100).toFixed(2)}% = {fmt(result.hoai.total)}</div>
                  <div>【時給ベース】{fmt(result.hoai.total)} ÷ {totalHours}h = {totalHours > 0 ? Math.round(result.hoai.total / totalHours) : 0}円/h</div>
                  {zangyoTotal > 0 && <div>【残業】{totalHours}h - {ws.teisho}h = {fmtH(zangyoTotal)}h</div>}
                  <div>【無事故】{jikoAri ? "不支給" : fmt(result.muijiko)}</div>
                  <div>【無違反】{hanhanAri ? "不支給" : fmt(result.musiji)}</div>
                  <div>【リーダー】{isLeader ? fmt(result.leader) : "非該当"}</div>
                  <div>【有給手当】{result.yukyu > 0 ? fmt(result.yukyu) : "なし"}</div>
                  <div>【最低賃金保障額】{fmt(result.minWageHosho)}（{TOKYO_MIN_WAGE}円/h）</div>
                  <div>【最賃補填】{result.hoshoHojuu > 0 ? fmt(result.hoshoHojuu) : "補填なし"}</div>
                </div>
              </details>
            </div>
          </div>
        )}

        {!inputReady && workSystem && (
          <div style={{
            marginTop:8, padding:"12px 16px", borderRadius:12,
            background:"rgba(255,255,255,0.02)", border:"1px dashed rgba(16,185,129,0.15)",
            fontSize:11, color:"rgba(130,190,160,0.38)", textAlign:"center",
          }}>
            全項目を入力・選択すると給与が自動計算されます
          </div>
        )}

        <div style={{ marginTop:22, fontSize:10, color:"rgba(90,140,115,0.28)", lineHeight:1.9, textAlign:"center" }}>
          ※ 深夜時間はシフトの固定値を使用（22:00〜翌5:00）<br />
          ※ 計算対象：歩合給・時間外割増・手当①・有給手当・最低賃金保障（第16条）<br />
          ※ 模範勤務手当は定時制の対象外<br />
          ※ 公休出勤は適用しない（第12条）
        </div>
      </div>
    </div>
  );
}
