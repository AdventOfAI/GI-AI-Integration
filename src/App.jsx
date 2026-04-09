import { useState, useRef, useEffect } from "react";

// ─── CASE STUDY DATA ────────────────────────────────────────────────────────

const TRIANGLE = {
  years: [2019, 2020, 2021, 2022, 2023],
  devPeriods: ["12m", "24m", "36m", "48m", "60m"],
  paid: [
    [1050, 1890, 2310, 2500, 2575],
    [1150, 2050, 2500, 2700, null],
    [1280, 2300, 2800, null, null],
    [1420, 2520, null, null, null],
    [1600, null, null, null, null],
  ],
  earnedPremium: [4200, 4500, 4800, 5100, 5500],
  aprioriELR: 0.70,
};

// Age-to-age CDFs (calculated from triangle)
const CDFs = [1.7878, 1.2196, 1.0811, 1.0300, 1.0150]; // last is tail
const CDF_LABELS = ["12→24", "24→36", "36→48", "48→60", "60+tail"];

function getCDFtoUlt(devIdx) {
  // devIdx = 0 means at 12m, 4 means at 60m
  let cdf = 1.0;
  for (let i = devIdx; i < CDFs.length; i++) cdf *= CDFs[i];
  return cdf;
}

// Chain ladder projections
const CL_ULTIMATES = TRIANGLE.years.map((_, ay) => {
  const latestDevIdx = 4 - ay; // how many periods we have
  const latestVal = TRIANGLE.paid[ay][latestDevIdx];
  return Math.round(latestVal * getCDFtoUlt(latestDevIdx + 1));
});
const CL_IBNR = TRIANGLE.years.map((_, ay) => {
  const latestDevIdx = 4 - ay;
  const latestPaid = TRIANGLE.paid[ay][latestDevIdx];
  return CL_ULTIMATES[ay] - latestPaid;
});

// BF IBNR
const BF_IBNR = TRIANGLE.years.map((_, ay) => {
  const latestDevIdx = 4 - ay;
  const cdfToUlt = getCDFtoUlt(latestDevIdx + 1);
  const pctUnpaid = 1 - 1 / cdfToUlt;
  const aPrioriUlt = TRIANGLE.earnedPremium[ay] * TRIANGLE.aprioriELR;
  return Math.round(aPrioriUlt * pctUnpaid);
});

// Latest diagonal
const LATEST_PAID = TRIANGLE.years.map((_, ay) => TRIANGLE.paid[ay][4 - ay]);

// Projections for full triangle
function getProjected(ay, dev) {
  const data = TRIANGLE.paid[ay][dev];
  if (data !== null) return { value: data, projected: false };
  const latestDevIdx = 4 - ay;
  const latestVal = TRIANGLE.paid[ay][latestDevIdx];
  let proj = latestVal;
  for (let d = latestDevIdx + 1; d <= dev; d++) proj *= CDFs[d - 1];
  return { value: Math.round(proj), projected: true };
}

// ─── REINSURANCE DATA ────────────────────────────────────────────────────────

const RI_YEAR = 2023;
const GROSS_PREMIUM = 5500;
const GROSS_CLAIMS_ATTRITIONAL = 2200;
const LARGE_CLAIMS = [
  { id: "A", gross: 350 },
  { id: "B", gross: 480 },
  { id: "C", gross: 520 },
  { id: "D", gross: 393 },
];
const GROSS_CLAIMS_TOTAL = GROSS_CLAIMS_ATTRITIONAL + LARGE_CLAIMS.reduce((s, c) => s + c.gross, 0);

// QS: 25% cession, 30% ceding commission
const QS_CESSION = 0.25;
const QS_COMM_RATE = 0.30;
const QS_CEDED_PREMIUM = Math.round(GROSS_PREMIUM * QS_CESSION);
const QS_CEDING_COMM = Math.round(QS_CEDED_PREMIUM * QS_COMM_RATE);
const QS_NET_PREMIUM = GROSS_PREMIUM - QS_CEDED_PREMIUM + QS_CEDING_COMM;
const QS_CEDED_CLAIMS = Math.round(GROSS_CLAIMS_TOTAL * QS_CESSION);
const QS_NET_CLAIMS = GROSS_CLAIMS_TOTAL - QS_CEDED_CLAIMS;

// XL: $400k xs $400k per risk
const XL_RETENTION = 400;
const XL_LIMIT = 400;
const XL_PREMIUM = 250;
const XL_LARGE = LARGE_CLAIMS.map((c) => {
  const ri = Math.min(Math.max(c.gross - XL_RETENTION, 0), XL_LIMIT);
  return { ...c, riRecovery: ri, net: c.gross - ri };
});
const XL_RECOVERY_LARGE = XL_LARGE.reduce((s, c) => s + c.riRecovery, 0);
const XL_NET_CLAIMS = GROSS_CLAIMS_TOTAL - XL_RECOVERY_LARGE;
const XL_NET_PREMIUM = GROSS_PREMIUM - XL_PREMIUM;

// ─── CAPITAL DATA ────────────────────────────────────────────────────────────

const CAP = {
  netEarnedPremium: QS_NET_PREMIUM,
  netOCL: Math.round((CL_IBNR.reduce((s, v) => s + v, 0)) * (1 - QS_CESSION)),
  insuranceConcentration: 300,
  assets: {
    equities: { value: 2000, charge_pct: 0.20 },
    bonds: { value: 5000, charge_pct: 0.03 },
    property: { value: 1000, charge_pct: 0.15 },
    cash: { value: 500, charge_pct: 0.00 },
  },
  opRiskRate: 0.03,
  diversificationBenefit: 200,
  availableCapital: 3200,
};

const premRiskCharge = Math.round(CAP.netEarnedPremium * 0.15);
const resRiskCharge = Math.round(CAP.netOCL * 0.09);
const insuranceRiskTotal = premRiskCharge + resRiskCharge + CAP.insuranceConcentration;
const assetCharges = Object.entries(CAP.assets).map(([k, v]) => ({
  name: k,
  value: v.value,
  rate: v.charge_pct,
  charge: Math.round(v.value * v.charge_pct),
}));
const assetRiskTotal = assetCharges.reduce((s, a) => s + a.charge, 0);
const opRiskCharge = Math.round(CAP.netEarnedPremium * CAP.opRiskRate);
const PCA = insuranceRiskTotal + assetRiskTotal + opRiskCharge - CAP.diversificationBenefit;
const coverageRatio = (CAP.availableCapital / PCA).toFixed(2);

// ─── AI CONTEXT ──────────────────────────────────────────────────────────────

const AI_SYSTEM_PROMPT = `You are an expert GI actuary and Deloitte consultant. You are analysing the following case study alongside the user.

CASE STUDY: Australian motor/property insurance book, valuation date 31 Dec 2023.

RESERVING (Chain Ladder & BF):
- 5x5 paid claims triangle, AYs 2019-2023
- Latest diagonal paid ($000s): 2019=2575, 2020=2700, 2021=2800, 2022=2520, 2023=1600. Total paid: ${LATEST_PAID.reduce((s,v)=>s+v,0).toLocaleString()}
- Chain ladder CDFs: 12→24: 1.7878, 24→36: 1.2196, 36→48: 1.0811, 48→60: 1.0300, tail: 1.0150
- Chain Ladder ultimates ($000s): ${CL_ULTIMATES.map((v,i)=>`${TRIANGLE.years[i]}=${v.toLocaleString()}`).join(', ')}
- Chain Ladder IBNR ($000s): ${CL_IBNR.map((v,i)=>`${TRIANGLE.years[i]}=${v.toLocaleString()}`).join(', ')}. Total CL IBNR: ${CL_IBNR.reduce((s,v)=>s+v,0).toLocaleString()}
- BF method (70% a priori ELR): IBNR by AY: ${BF_IBNR.map((v,i)=>`${TRIANGLE.years[i]}=${v.toLocaleString()}`).join(', ')}. Total BF IBNR: ${BF_IBNR.reduce((s,v)=>s+v,0).toLocaleString()}
- CL vs BF difference: ${(CL_IBNR.reduce((s,v)=>s+v,0) - BF_IBNR.reduce((s,v)=>s+v,0)).toLocaleString()} (CL higher)

REINSURANCE (2023 accident year, $000s):
- Gross written premium: 5,500. Gross claims: ${GROSS_CLAIMS_TOTAL.toLocaleString()} (attritional: 2,200; large: ${LARGE_CLAIMS.map(c=>`Claim ${c.id}=$${c.gross}k`).join(', ')})
- Gross loss ratio: ${(GROSS_CLAIMS_TOTAL/GROSS_PREMIUM*100).toFixed(1)}%
- Quota Share (25% cession, 30% comm): ceded premium=1375, ceding comm=413, net premium=${QS_NET_PREMIUM.toLocaleString()}, net claims=${QS_NET_CLAIMS.toLocaleString()}, net LR=${(QS_NET_CLAIMS/QS_NET_PREMIUM*100).toFixed(1)}%
- XL ($400k xs $400k per risk, RI premium=250): recoveries on Claims B=$80k, C=$120k; total recovery=${XL_RECOVERY_LARGE.toLocaleString()}, net claims=${XL_NET_CLAIMS.toLocaleString()}, net LR=${(XL_NET_CLAIMS/XL_NET_PREMIUM*100).toFixed(1)}%

CAPITAL (APRA GPS 110 PCA, $000s):
- Insurance risk: premium risk=${premRiskCharge.toLocaleString()} (15%×net EP), reserve risk=${resRiskCharge.toLocaleString()} (9%×net OCL), concentration=300. Subtotal: ${insuranceRiskTotal.toLocaleString()}
- Asset risk: equities=${assetCharges[0].charge.toLocaleString()}, bonds=${assetCharges[1].charge.toLocaleString()}, property=${assetCharges[2].charge.toLocaleString()}, cash=0. Subtotal: ${assetRiskTotal.toLocaleString()}
- Operational risk: ${opRiskCharge.toLocaleString()} (3%×net EP)
- Diversification benefit: -200
- PCA (Prescribed Capital Amount): ${PCA.toLocaleString()}
- Available capital: 3,200. Capital Coverage Ratio: ${coverageRatio}x
- Internal target: 1.25x. Status: ${parseFloat(coverageRatio) >= 1.25 ? 'ABOVE TARGET' : 'BELOW TARGET'}

The user is an actuarial data scientist at Deloitte, upskilling in GI. They want to eventually build an AI that can run or augment this process. Be precise with numbers, reference the case study data directly, and give practical insights relevant to a consultant who will automate/augment this workflow.`;

// ─── STYLES ──────────────────────────────────────────────────────────────────

const S = {
  wrap: {
    fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
    background: "#0a0e14",
    color: "#c9d1d9",
    minHeight: "100vh",
    fontSize: "12px",
    lineHeight: 1.6,
  },
  header: {
    padding: "16px 20px 12px",
    borderBottom: "1px solid #21262d",
    background: "#0d1117",
  },
  title: {
    fontSize: "15px",
    fontWeight: 600,
    color: "#e6edf3",
    letterSpacing: "0.04em",
    textTransform: "uppercase",
  },
  subtitle: { fontSize: "11px", color: "#6e7681", marginTop: 2 },
  tabs: {
    display: "flex",
    borderBottom: "1px solid #21262d",
    background: "#0d1117",
    padding: "0 20px",
  },
  tab: (active) => ({
    padding: "10px 16px",
    cursor: "pointer",
    fontSize: "11px",
    fontWeight: 500,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: active ? "#58a6ff" : "#6e7681",
    borderBottom: active ? "2px solid #58a6ff" : "2px solid transparent",
    marginBottom: "-1px",
    transition: "color 0.15s",
  }),
  body: { padding: "20px" },
  section: { marginBottom: 28 },
  sectionTitle: {
    fontSize: "10px",
    fontWeight: 600,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "#58a6ff",
    marginBottom: 10,
    paddingBottom: 6,
    borderBottom: "1px solid #21262d",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: "11px",
  },
  th: {
    padding: "6px 10px",
    background: "#161b22",
    color: "#8b949e",
    fontWeight: 500,
    textAlign: "right",
    borderBottom: "1px solid #21262d",
    fontSize: "10px",
    letterSpacing: "0.05em",
  },
  thLeft: {
    padding: "6px 10px",
    background: "#161b22",
    color: "#8b949e",
    fontWeight: 500,
    textAlign: "left",
    borderBottom: "1px solid #21262d",
    fontSize: "10px",
    letterSpacing: "0.05em",
  },
  td: {
    padding: "5px 10px",
    borderBottom: "1px solid #161b22",
    textAlign: "right",
    color: "#c9d1d9",
  },
  tdLeft: {
    padding: "5px 10px",
    borderBottom: "1px solid #161b22",
    textAlign: "left",
    color: "#8b949e",
  },
  projected: {
    padding: "5px 10px",
    borderBottom: "1px solid #161b22",
    textAlign: "right",
    color: "#3fb950",
    fontStyle: "italic",
  },
  ibnrCell: {
    padding: "5px 10px",
    borderBottom: "1px solid #161b22",
    textAlign: "right",
    color: "#f0883e",
    fontWeight: 600,
  },
  totalRow: {
    padding: "6px 10px",
    borderTop: "1px solid #30363d",
    textAlign: "right",
    color: "#e6edf3",
    fontWeight: 600,
    background: "#161b22",
  },
  totalRowLeft: {
    padding: "6px 10px",
    borderTop: "1px solid #30363d",
    textAlign: "left",
    color: "#e6edf3",
    fontWeight: 600,
    background: "#161b22",
  },
  callout: (color) => ({
    background: "#161b22",
    border: `1px solid ${color}33`,
    borderLeft: `3px solid ${color}`,
    borderRadius: 4,
    padding: "10px 14px",
    marginBottom: 12,
    fontSize: "11px",
    color: "#c9d1d9",
  }),
  metric: {
    display: "inline-block",
    background: "#161b22",
    border: "1px solid #30363d",
    borderRadius: 4,
    padding: "8px 14px",
    marginRight: 10,
    marginBottom: 10,
  },
  metricLabel: { fontSize: "9px", color: "#6e7681", textTransform: "uppercase", letterSpacing: "0.08em" },
  metricValue: (color) => ({ fontSize: "18px", fontWeight: 700, color: color || "#e6edf3", lineHeight: 1.2 }),
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 },
  grid3: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 },
  chatWrap: {
    background: "#0d1117",
    border: "1px solid #21262d",
    borderRadius: 6,
    display: "flex",
    flexDirection: "column",
    height: 480,
  },
  chatHistory: {
    flex: 1,
    overflowY: "auto",
    padding: "14px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  msgUser: {
    alignSelf: "flex-end",
    background: "#1f3a5f",
    border: "1px solid #1e4080",
    borderRadius: "8px 8px 2px 8px",
    padding: "8px 12px",
    maxWidth: "80%",
    fontSize: "12px",
    color: "#cae0ff",
  },
  msgAI: {
    alignSelf: "flex-start",
    background: "#161b22",
    border: "1px solid #30363d",
    borderRadius: "8px 8px 8px 2px",
    padding: "8px 12px",
    maxWidth: "90%",
    fontSize: "12px",
    color: "#c9d1d9",
    whiteSpace: "pre-wrap",
  },
  chatInput: {
    display: "flex",
    borderTop: "1px solid #21262d",
    padding: 10,
    gap: 8,
  },
  input: {
    flex: 1,
    background: "#161b22",
    border: "1px solid #30363d",
    borderRadius: 4,
    padding: "7px 10px",
    color: "#e6edf3",
    fontSize: "12px",
    fontFamily: "inherit",
    outline: "none",
  },
  sendBtn: (disabled) => ({
    background: disabled ? "#21262d" : "#1f6feb",
    color: disabled ? "#6e7681" : "#e6edf3",
    border: "none",
    borderRadius: 4,
    padding: "7px 16px",
    cursor: disabled ? "not-allowed" : "pointer",
    fontSize: "11px",
    fontWeight: 600,
    fontFamily: "inherit",
    letterSpacing: "0.05em",
    textTransform: "uppercase",
  }),
  legend: {
    display: "flex",
    gap: 16,
    marginTop: 8,
    fontSize: "10px",
    color: "#6e7681",
  },
  legendItem: (color) => ({ display: "flex", alignItems: "center", gap: 5, color }),
  dot: (color) => ({
    width: 8,
    height: 8,
    borderRadius: 2,
    background: color,
    display: "inline-block",
  }),
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const fmt = (v) => v?.toLocaleString() ?? "–";
const pct = (v) => `${(v * 100).toFixed(1)}%`;
const fmtK = (v) => `$${fmt(v)}k`;

// ─── TABS ─────────────────────────────────────────────────────────────────────

function ReservingTab() {
  const totalCLIBNR = CL_IBNR.reduce((s, v) => s + v, 0);
  const totalBFIBNR = BF_IBNR.reduce((s, v) => s + v, 0);

  return (
    <div style={S.body}>
      <div style={S.callout("#58a6ff")}>
        <b style={{ color: "#58a6ff" }}>Motor / property book — paid claims development ($000s)</b>
        <br />Chain Ladder and Bornhuetter-Ferguson compared. Diagonal highlighted. Projections shown in green.
      </div>

      <div style={S.section}>
        <div style={S.sectionTitle}>Paid claims development triangle</div>
        <table style={S.table}>
          <thead>
            <tr>
              <th style={S.thLeft}>AY</th>
              {TRIANGLE.devPeriods.map((d) => <th key={d} style={S.th}>{d}</th>)}
              <th style={{ ...S.th, color: "#f0883e" }}>CDF→Ult</th>
              <th style={{ ...S.th, color: "#3fb950" }}>Ultimate (CL)</th>
              <th style={{ ...S.th, color: "#f0883e" }}>IBNR (CL)</th>
            </tr>
          </thead>
          <tbody>
            {TRIANGLE.years.map((yr, ay) => {
              const latestDevIdx = 4 - ay;
              const cdfToUlt = getCDFtoUlt(latestDevIdx + 1);
              return (
                <tr key={yr}>
                  <td style={S.tdLeft}>{yr}</td>
                  {[0, 1, 2, 3, 4].map((dev) => {
                    const isDiag = dev === latestDevIdx;
                    const { value, projected } = getProjected(ay, dev);
                    const style = isDiag
                      ? { ...S.td, color: "#e6edf3", fontWeight: 700, background: "#1c2128" }
                      : projected
                      ? S.projected
                      : S.td;
                    return <td key={dev} style={style}>{fmt(value)}</td>;
                  })}
                  <td style={{ ...S.td, color: "#8b949e", fontSize: "10px" }}>{cdfToUlt.toFixed(4)}×</td>
                  <td style={{ ...S.td, color: "#3fb950", fontWeight: 600 }}>{fmt(CL_ULTIMATES[ay])}</td>
                  <td style={S.ibnrCell}>{fmt(CL_IBNR[ay])}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td style={S.totalRowLeft}>Total</td>
              {[0, 1, 2, 3, 4].map((d) => <td key={d} style={S.totalRow}></td>)}
              <td style={S.totalRow}></td>
              <td style={{ ...S.totalRow, color: "#3fb950" }}>{fmt(CL_ULTIMATES.reduce((s, v) => s + v, 0))}</td>
              <td style={{ ...S.totalRow, color: "#f0883e" }}>{fmt(totalCLIBNR)}</td>
            </tr>
          </tfoot>
        </table>
        <div style={S.legend}>
          <span style={S.legendItem("#e6edf3")}><span style={S.dot("#1c2128")} />latest diagonal</span>
          <span style={S.legendItem("#3fb950")}><span style={S.dot("#3fb950")} />chain ladder projection</span>
          <span style={S.legendItem("#f0883e")}><span style={S.dot("#f0883e")} />IBNR</span>
        </div>
      </div>

      <div style={S.section}>
        <div style={S.sectionTitle}>Age-to-age development factors (CDFs)</div>
        <table style={S.table}>
          <thead>
            <tr>
              {CDF_LABELS.map((l) => <th key={l} style={S.th}>{l}</th>)}
            </tr>
          </thead>
          <tbody>
            <tr>
              {CDFs.map((c, i) => (
                <td key={i} style={{ ...S.td, color: "#a5d6ff", fontWeight: 600 }}>{c.toFixed(4)}×</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div style={S.grid2}>
        <div style={S.section}>
          <div style={S.sectionTitle}>Bornhuetter-Ferguson IBNR (ELR = 70%)</div>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.thLeft}>AY</th>
                <th style={S.th}>Earned Prem</th>
                <th style={S.th}>A Priori Ult</th>
                <th style={S.th}>% Unpaid</th>
                <th style={{ ...S.th, color: "#d2a8ff" }}>BF IBNR</th>
              </tr>
            </thead>
            <tbody>
              {TRIANGLE.years.map((yr, ay) => {
                const latestDevIdx = 4 - ay;
                const cdfToUlt = getCDFtoUlt(latestDevIdx + 1);
                const pctUnpaid = 1 - 1 / cdfToUlt;
                const aPrioriUlt = TRIANGLE.earnedPremium[ay] * TRIANGLE.aprioriELR;
                return (
                  <tr key={yr}>
                    <td style={S.tdLeft}>{yr}</td>
                    <td style={S.td}>{fmt(TRIANGLE.earnedPremium[ay])}</td>
                    <td style={S.td}>{fmt(Math.round(aPrioriUlt))}</td>
                    <td style={S.td}>{pct(pctUnpaid)}</td>
                    <td style={{ ...S.td, color: "#d2a8ff", fontWeight: 600 }}>{fmt(BF_IBNR[ay])}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td style={S.totalRowLeft}>Total</td>
                <td style={S.totalRow}>{fmt(TRIANGLE.earnedPremium.reduce((s, v) => s + v, 0))}</td>
                <td style={S.totalRow}></td>
                <td style={S.totalRow}></td>
                <td style={{ ...S.totalRow, color: "#d2a8ff" }}>{fmt(totalBFIBNR)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div style={S.section}>
          <div style={S.sectionTitle}>Method comparison</div>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.thLeft}>AY</th>
                <th style={{ ...S.th, color: "#f0883e" }}>CL IBNR</th>
                <th style={{ ...S.th, color: "#d2a8ff" }}>BF IBNR</th>
                <th style={S.th}>Δ</th>
              </tr>
            </thead>
            <tbody>
              {TRIANGLE.years.map((yr, ay) => {
                const diff = CL_IBNR[ay] - BF_IBNR[ay];
                return (
                  <tr key={yr}>
                    <td style={S.tdLeft}>{yr}</td>
                    <td style={{ ...S.td, color: "#f0883e" }}>{fmt(CL_IBNR[ay])}</td>
                    <td style={{ ...S.td, color: "#d2a8ff" }}>{fmt(BF_IBNR[ay])}</td>
                    <td style={{ ...S.td, color: diff > 0 ? "#f0883e" : "#3fb950" }}>{diff > 0 ? "+" : ""}{fmt(diff)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td style={S.totalRowLeft}>Total</td>
                <td style={{ ...S.totalRow, color: "#f0883e" }}>{fmt(totalCLIBNR)}</td>
                <td style={{ ...S.totalRow, color: "#d2a8ff" }}>{fmt(totalBFIBNR)}</td>
                <td style={{ ...S.totalRow, color: totalCLIBNR > totalBFIBNR ? "#f0883e" : "#3fb950" }}>
                  {totalCLIBNR > totalBFIBNR ? "+" : ""}{fmt(totalCLIBNR - totalBFIBNR)}
                </td>
              </tr>
            </tfoot>
          </table>
          <div style={{ ...S.callout("#f0883e"), marginTop: 12 }}>
            <b>Observation:</b> CL and BF are within ${fmt(Math.abs(totalCLIBNR - totalBFIBNR))}k of each other — a stable, well-developed book. CL is slightly higher, driven by 2023 immaturity. For AY 2023 specifically, BF is the more credible estimate given only 12m of development.
          </div>
        </div>
      </div>

      <div style={S.grid3}>
        {[
          { label: "Total IBNR (CL)", val: fmtK(totalCLIBNR), color: "#f0883e" },
          { label: "Total IBNR (BF)", val: fmtK(totalBFIBNR), color: "#d2a8ff" },
          { label: "Total Paid", val: fmtK(LATEST_PAID.reduce((s, v) => s + v, 0)), color: "#e6edf3" },
          { label: "CL Ultimate", val: fmtK(CL_ULTIMATES.reduce((s, v) => s + v, 0)), color: "#3fb950" },
          { label: "% Still to Develop", val: pct(totalCLIBNR / CL_ULTIMATES.reduce((s, v) => s + v, 0)), color: "#f0883e" },
          { label: "2023 % Undeveloped", val: pct(CL_IBNR[4] / CL_ULTIMATES[4]), color: "#f0883e" },
        ].map((m) => (
          <div key={m.label} style={S.metric}>
            <div style={S.metricLabel}>{m.label}</div>
            <div style={S.metricValue(m.color)}>{m.val}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReinsuranceTab() {
  const grossLR = GROSS_CLAIMS_TOTAL / GROSS_PREMIUM;
  const qsNetLR = QS_NET_CLAIMS / QS_NET_PREMIUM;
  const xlNetLR = XL_NET_CLAIMS / XL_NET_PREMIUM;

  return (
    <div style={S.body}>
      <div style={S.callout("#3fb950")}>
        <b style={{ color: "#3fb950" }}>2023 accident year — reinsurance program analysis ($000s)</b>
        <br />Comparing Quota Share (25% cession) vs Excess of Loss ($400k xs $400k) on same gross claims base.
      </div>

      <div style={S.section}>
        <div style={S.sectionTitle}>Gross position (pre-reinsurance)</div>
        <table style={S.table}>
          <thead>
            <tr>
              <th style={S.thLeft}>Claim</th>
              <th style={S.th}>Gross loss ($k)</th>
              <th style={S.th}>Type</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={S.tdLeft}>Attritional pool</td>
              <td style={S.td}>{fmt(GROSS_CLAIMS_ATTRITIONAL)}</td>
              <td style={{ ...S.td, color: "#6e7681" }}>many small</td>
            </tr>
            {LARGE_CLAIMS.map((c) => (
              <tr key={c.id}>
                <td style={S.tdLeft}>Claim {c.id}</td>
                <td style={S.td}>{fmt(c.gross)}</td>
                <td style={{ ...S.td, color: c.gross > XL_RETENTION ? "#f0883e" : "#6e7681" }}>
                  {c.gross > XL_RETENTION ? "▲ above XL retention" : "below retention"}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td style={S.totalRowLeft}>Total gross claims</td>
              <td style={S.totalRow}>{fmt(GROSS_CLAIMS_TOTAL)}</td>
              <td style={S.totalRow}></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div style={S.grid2}>
        <div style={S.section}>
          <div style={S.sectionTitle}>Quota share — 25% cession / 30% commission</div>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.thLeft}>Item</th>
                <th style={S.th}>Gross</th>
                <th style={S.th}>Ceded (25%)</th>
                <th style={S.th}>Net</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={S.tdLeft}>Written premium</td>
                <td style={S.td}>{fmt(GROSS_PREMIUM)}</td>
                <td style={{ ...S.td, color: "#f0883e" }}>{fmt(QS_CEDED_PREMIUM)}</td>
                <td style={{ ...S.td, color: "#3fb950" }}>{fmt(GROSS_PREMIUM - QS_CEDED_PREMIUM)}</td>
              </tr>
              <tr>
                <td style={S.tdLeft}>Ceding commission</td>
                <td style={S.td}>–</td>
                <td style={{ ...S.td, color: "#3fb950" }}>+{fmt(QS_CEDING_COMM)}</td>
                <td style={{ ...S.td, color: "#3fb950" }}>+{fmt(QS_CEDING_COMM)}</td>
              </tr>
              <tr>
                <td style={S.tdLeft}>Claims</td>
                <td style={S.td}>{fmt(GROSS_CLAIMS_TOTAL)}</td>
                <td style={{ ...S.td, color: "#3fb950" }}>{fmt(QS_CEDED_CLAIMS)}</td>
                <td style={{ ...S.td, color: "#f0883e" }}>{fmt(QS_NET_CLAIMS)}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td style={S.totalRowLeft}>Net premium (post-comm)</td>
                <td style={S.totalRow}></td>
                <td style={S.totalRow}></td>
                <td style={{ ...S.totalRow, color: "#3fb950" }}>{fmt(QS_NET_PREMIUM)}</td>
              </tr>
              <tr>
                <td style={{ ...S.totalRowLeft, borderTop: "none" }}>Net loss ratio</td>
                <td style={{ ...S.totalRow, borderTop: "none", color: "#f0883e" }}>{pct(grossLR)}</td>
                <td style={{ ...S.totalRow, borderTop: "none" }}></td>
                <td style={{ ...S.totalRow, borderTop: "none", color: "#3fb950" }}>{pct(qsNetLR)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div style={S.section}>
          <div style={S.sectionTitle}>XL — $400k xs $400k per risk</div>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.thLeft}>Claim</th>
                <th style={S.th}>Gross</th>
                <th style={S.th}>Retained</th>
                <th style={{ ...S.th, color: "#3fb950" }}>RI Recovery</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={S.tdLeft}>Attritional</td>
                <td style={S.td}>{fmt(GROSS_CLAIMS_ATTRITIONAL)}</td>
                <td style={S.td}>{fmt(GROSS_CLAIMS_ATTRITIONAL)}</td>
                <td style={{ ...S.td, color: "#6e7681" }}>0</td>
              </tr>
              {XL_LARGE.map((c) => (
                <tr key={c.id}>
                  <td style={S.tdLeft}>Claim {c.id} ({fmt(c.gross)})</td>
                  <td style={S.td}>{fmt(c.gross)}</td>
                  <td style={S.td}>{fmt(c.net)}</td>
                  <td style={{ ...S.td, color: c.riRecovery > 0 ? "#3fb950" : "#6e7681", fontWeight: c.riRecovery > 0 ? 600 : 400 }}>
                    {c.riRecovery > 0 ? fmt(c.riRecovery) : "0"}
                  </td>
                </tr>
              ))}
              <tr>
                <td style={S.tdLeft}>RI Premium cost</td>
                <td style={S.td}></td>
                <td style={{ ...S.td, color: "#f0883e" }}>-{fmt(XL_PREMIUM)}</td>
                <td style={S.td}></td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td style={S.totalRowLeft}>Total</td>
                <td style={{ ...S.totalRow, color: "#f0883e" }}>{fmt(GROSS_CLAIMS_TOTAL)}</td>
                <td style={S.totalRow}>{fmt(XL_NET_CLAIMS)}</td>
                <td style={{ ...S.totalRow, color: "#3fb950" }}>{fmt(XL_RECOVERY_LARGE)}</td>
              </tr>
              <tr>
                <td style={{ ...S.totalRowLeft, borderTop: "none" }}>Net loss ratio</td>
                <td style={{ ...S.totalRow, borderTop: "none", color: "#f0883e" }}>{pct(grossLR)}</td>
                <td style={{ ...S.totalRow, borderTop: "none", color: "#3fb950" }}>{pct(xlNetLR)}</td>
                <td style={{ ...S.totalRow, borderTop: "none" }}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div style={S.section}>
        <div style={S.sectionTitle}>Program comparison summary</div>
        <table style={S.table}>
          <thead>
            <tr>
              <th style={S.thLeft}>Metric</th>
              <th style={S.th}>Gross</th>
              <th style={{ ...S.th, color: "#a5d6ff" }}>Quota Share</th>
              <th style={{ ...S.th, color: "#3fb950" }}>XL Only</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["Net earned premium", fmtK(GROSS_PREMIUM), fmtK(QS_NET_PREMIUM), fmtK(XL_NET_PREMIUM)],
              ["Net claims", fmtK(GROSS_CLAIMS_TOTAL), fmtK(QS_NET_CLAIMS), fmtK(XL_NET_CLAIMS)],
              ["Net loss ratio", pct(grossLR), pct(qsNetLR), pct(xlNetLR)],
              ["RI cost (net)", "—", fmtK(QS_CEDED_PREMIUM - QS_CEDING_COMM), fmtK(XL_PREMIUM)],
              ["Largest net claim", fmtK(Math.max(...LARGE_CLAIMS.map(c=>c.gross))), fmtK(Math.round(Math.max(...LARGE_CLAIMS.map(c=>c.gross)) * (1-QS_CESSION))), fmtK(Math.min(XL_RETENTION, Math.max(...XL_LARGE.map(c=>c.net))))],
              ["Volatility reduction", "base", "Pro-rata across all claims", "Tail-only (≥$400k)"],
            ].map(([label, gross, qs, xl]) => (
              <tr key={label}>
                <td style={S.tdLeft}>{label}</td>
                <td style={S.td}>{gross}</td>
                <td style={{ ...S.td, color: "#a5d6ff" }}>{qs}</td>
                <td style={{ ...S.td, color: "#3fb950" }}>{xl}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ ...S.callout("#d2a8ff"), marginTop: 12 }}>
          <b>Key insight:</b> QS reduces overall volatility proportionally but is expensive (net cost ${fmt(QS_CEDED_PREMIUM - QS_CEDING_COMM)}k). XL is cheaper (${fmt(XL_PREMIUM)}k) but only protects the tail — attritional deterioration passes through entirely. Most programs combine both: QS to reduce capital consumption on the premium risk charge, XL for cat/large loss protection.
        </div>
      </div>
    </div>
  );
}

function CapitalTab() {
  return (
    <div style={S.body}>
      <div style={S.callout("#f0883e")}>
        <b style={{ color: "#f0883e" }}>APRA GPS 110 — Prescribed Capital Amount (PCA) calculation ($000s)</b>
        <br />Post-QS reinsurance position. Internal target: 1.25× PCA. ICAAP overlay not shown.
      </div>

      <div style={S.grid2}>
        <div>
          <div style={S.section}>
            <div style={S.sectionTitle}>Insurance risk charge</div>
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.thLeft}>Component</th>
                  <th style={S.th}>Base ($k)</th>
                  <th style={S.th}>Rate</th>
                  <th style={{ ...S.th, color: "#f0883e" }}>Charge ($k)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={S.tdLeft}>Premium risk</td>
                  <td style={S.td}>{fmt(CAP.netEarnedPremium)}</td>
                  <td style={S.td}>15.0%</td>
                  <td style={S.ibnrCell}>{fmt(premRiskCharge)}</td>
                </tr>
                <tr>
                  <td style={S.tdLeft}>Reserve risk</td>
                  <td style={S.td}>{fmt(CAP.netOCL)}</td>
                  <td style={S.td}>9.0%</td>
                  <td style={S.ibnrCell}>{fmt(resRiskCharge)}</td>
                </tr>
                <tr>
                  <td style={S.tdLeft}>Cat concentration</td>
                  <td style={{ ...S.td, color: "#6e7681" }}>scenario</td>
                  <td style={{ ...S.td, color: "#6e7681" }}>—</td>
                  <td style={S.ibnrCell}>{fmt(CAP.insuranceConcentration)}</td>
                </tr>
              </tbody>
              <tfoot>
                <tr>
                  <td style={S.totalRowLeft}>Insurance subtotal</td>
                  <td style={S.totalRow}></td>
                  <td style={S.totalRow}></td>
                  <td style={{ ...S.totalRow, color: "#f0883e" }}>{fmt(insuranceRiskTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div style={S.section}>
            <div style={S.sectionTitle}>Asset risk charge</div>
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.thLeft}>Asset class</th>
                  <th style={S.th}>Value ($k)</th>
                  <th style={S.th}>Rate</th>
                  <th style={{ ...S.th, color: "#f0883e" }}>Charge ($k)</th>
                </tr>
              </thead>
              <tbody>
                {assetCharges.map((a) => (
                  <tr key={a.name}>
                    <td style={S.tdLeft}>{a.name.charAt(0).toUpperCase() + a.name.slice(1)}</td>
                    <td style={S.td}>{fmt(a.value)}</td>
                    <td style={S.td}>{pct(a.rate)}</td>
                    <td style={S.ibnrCell}>{fmt(a.charge)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td style={S.totalRowLeft}>Asset subtotal</td>
                  <td style={S.totalRow}>{fmt(Object.values(CAP.assets).reduce((s, a) => s + a.value, 0))}</td>
                  <td style={S.totalRow}></td>
                  <td style={{ ...S.totalRow, color: "#f0883e" }}>{fmt(assetRiskTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div>
          <div style={S.section}>
            <div style={S.sectionTitle}>PCA waterfall</div>
            <table style={S.table}>
              <tbody>
                {[
                  ["Insurance risk", fmt(insuranceRiskTotal), "#f0883e"],
                  ["Asset risk", fmt(assetRiskTotal), "#f0883e"],
                  ["Operational risk (3%)", fmt(opRiskCharge), "#f0883e"],
                  ["Diversification benefit", `(${fmt(CAP.diversificationBenefit)})`, "#3fb950"],
                ].map(([label, val, color]) => (
                  <tr key={label}>
                    <td style={{ ...S.tdLeft, paddingLeft: 20 }}>{label}</td>
                    <td style={{ ...S.td, color }}>{val}</td>
                  </tr>
                ))}
                <tr>
                  <td style={{ ...S.totalRowLeft, fontSize: 13, color: "#e6edf3" }}>
                    Prescribed Capital Amount (PCA)
                  </td>
                  <td style={{ ...S.totalRow, fontSize: 16, color: "#f0883e" }}>{fmt(PCA)}</td>
                </tr>
                <tr>
                  <td style={{ ...S.tdLeft, paddingTop: 12, color: "#8b949e" }}>Available capital (Tier 1)</td>
                  <td style={{ ...S.td, paddingTop: 12, color: "#3fb950" }}>{fmt(CAP.availableCapital)}</td>
                </tr>
                <tr>
                  <td style={{ ...S.totalRowLeft }}>Capital Coverage Ratio</td>
                  <td style={{ ...S.totalRow, color: parseFloat(coverageRatio) >= 1.25 ? "#3fb950" : "#f85149", fontSize: 18 }}>
                    {coverageRatio}×
                  </td>
                </tr>
                <tr>
                  <td style={{ ...S.tdLeft, color: "#6e7681" }}>Internal target (1.25×)</td>
                  <td style={{ ...S.td, color: parseFloat(coverageRatio) >= 1.25 ? "#3fb950" : "#f85149" }}>
                    {parseFloat(coverageRatio) >= 1.25 ? "✓ ABOVE TARGET" : "✗ BELOW TARGET"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div style={S.section}>
            <div style={S.sectionTitle}>Risk charge composition</div>
            {[
              { label: "Insurance risk", val: insuranceRiskTotal, total: PCA + CAP.diversificationBenefit, color: "#f0883e" },
              { label: "Asset risk", val: assetRiskTotal, total: PCA + CAP.diversificationBenefit, color: "#a5d6ff" },
              { label: "Operational risk", val: opRiskCharge, total: PCA + CAP.diversificationBenefit, color: "#d2a8ff" },
            ].map((r) => {
              const barPct = r.val / (PCA + CAP.diversificationBenefit) * 100;
              return (
                <div key={r.label} style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 10, color: "#8b949e" }}>
                    <span>{r.label}</span>
                    <span style={{ color: r.color }}>{fmt(r.val)} ({barPct.toFixed(1)}%)</span>
                  </div>
                  <div style={{ background: "#21262d", borderRadius: 3, height: 6 }}>
                    <div style={{ width: `${barPct}%`, background: r.color, borderRadius: 3, height: 6 }} />
                  </div>
                </div>
              );
            })}
            <div style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 10, color: "#3fb950" }}>
                <span>Diversification benefit</span>
                <span>-{fmt(CAP.diversificationBenefit)}</span>
              </div>
            </div>
          </div>

          <div style={S.callout("#3fb950")}>
            <b>Capital headroom:</b> At {coverageRatio}×, the insurer has ${fmt(CAP.availableCapital - Math.round(PCA * 1.25))}k of capital above its 1.25× internal target. A stress scenario adding 20% to reserves would cost ~${fmt(Math.round(CAP.netOCL * 0.20 * 0.09))}k in additional capital charge — well within current headroom.
          </div>
        </div>
      </div>

      <div style={S.section}>
        <div style={S.sectionTitle}>Sensitivity: capital coverage under stress</div>
        <table style={S.table}>
          <thead>
            <tr>
              <th style={S.thLeft}>Stress scenario</th>
              <th style={S.th}>Reserve shock</th>
              <th style={S.th}>Prem risk shock</th>
              <th style={S.th}>PCA impact ($k)</th>
              <th style={S.th}>New PCA ($k)</th>
              <th style={S.th}>CCR</th>
            </tr>
          </thead>
          <tbody>
            {[
              { label: "Base case", resShock: 0, premShock: 0 },
              { label: "+10% reserves", resShock: 0.10, premShock: 0 },
              { label: "+20% reserves", resShock: 0.20, premShock: 0 },
              { label: "+15% prem risk", resShock: 0, premShock: 0.15 },
              { label: "Combined stress", resShock: 0.20, premShock: 0.15 },
            ].map((s) => {
              const newResCharge = Math.round(resRiskCharge * (1 + s.resShock));
              const newPremCharge = Math.round(premRiskCharge * (1 + s.premShock));
              const newPCA = newResCharge + newPremCharge + CAP.insuranceConcentration + assetRiskTotal + opRiskCharge - CAP.diversificationBenefit;
              const delta = newPCA - PCA;
              const ccr = (CAP.availableCapital / newPCA).toFixed(2);
              return (
                <tr key={s.label}>
                  <td style={S.tdLeft}>{s.label}</td>
                  <td style={{ ...S.td, color: s.resShock ? "#f0883e" : "#6e7681" }}>{s.resShock ? `+${pct(s.resShock)}` : "—"}</td>
                  <td style={{ ...S.td, color: s.premShock ? "#f0883e" : "#6e7681" }}>{s.premShock ? `+${pct(s.premShock)}` : "—"}</td>
                  <td style={{ ...S.td, color: delta > 0 ? "#f0883e" : "#6e7681" }}>{delta > 0 ? `+${fmt(delta)}` : "—"}</td>
                  <td style={S.td}>{fmt(newPCA)}</td>
                  <td style={{ ...S.td, color: parseFloat(ccr) >= 1.25 ? "#3fb950" : parseFloat(ccr) >= 1.0 ? "#f0883e" : "#f85149", fontWeight: 600 }}>{ccr}×</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AITab() {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: `Case study loaded. I have full visibility over the reserving triangle, reinsurance program, and capital model.

Some things you can ask me:
  • "Why is BF more credible than chain ladder for AY 2023?"
  • "What happens to the capital position if we switch to XL only?"
  • "Walk me through how to automate the chain ladder in Python"
  • "What should I flag in a reserving report for this book?"
  • "How would IFRS 17 change the reserve presentation?"`,
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const histRef = useRef(null);

  useEffect(() => {
    if (histRef.current) histRef.current.scrollTop = histRef.current.scrollHeight;
  }, [messages]);

  async function send() {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput("");
    setMessages((m) => [...m, { role: "user", content: userMsg }]);
    setLoading(true);
    try {
      const history = [...messages, { role: "user", content: userMsg }];
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          system: AI_SYSTEM_PROMPT,
          messages: history.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        const msg =
          data.error?.message ||
          (typeof data.error === "string" ? data.error : null) ||
          (Array.isArray(data.error) ? data.error.map((e) => e.message).join(" ") : null) ||
          JSON.stringify(data);
        throw new Error(msg);
      }
      const reply = data.content?.find((c) => c.type === "text")?.text || "No response.";
      setMessages((m) => [...m, { role: "assistant", content: reply }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", content: `Error: ${e.message}` }]);
    }
    setLoading(false);
  }

  return (
    <div style={S.body}>
      <div style={S.callout("#58a6ff")}>
        <b style={{ color: "#58a6ff" }}>AI Analyst</b> — context-aware across all three models. Ask anything about the numbers, methodology, or automation.
      </div>
      <div style={S.chatWrap}>
        <div ref={histRef} style={S.chatHistory}>
          {messages.map((m, i) => (
            <div key={i} style={m.role === "user" ? S.msgUser : S.msgAI}>
              {m.content}
            </div>
          ))}
          {loading && (
            <div style={{ ...S.msgAI, color: "#6e7681", fontStyle: "italic" }}>
              analysing...
            </div>
          )}
        </div>
        <div style={S.chatInput}>
          <input
            style={S.input}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Ask about the case study, methodology, or how to automate this..."
          />
          <button style={S.sendBtn(loading || !input.trim())} onClick={send} disabled={loading || !input.trim()}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── APP ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [tab, setTab] = useState("reserving");
  const tabs = [
    { id: "reserving", label: "Reserving" },
    { id: "reinsurance", label: "Reinsurance" },
    { id: "capital", label: "Capital" },
    { id: "ai", label: "⬡ AI Analyst" },
  ];

  return (
    <div style={S.wrap}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
      <div style={S.header}>
        <div style={S.title}>GI Actuarial Models Dashboard</div>
        <div style={S.subtitle}>Motor / Property · Australia · Valuation: 31 Dec 2023 · All figures $000s AUD</div>
      </div>
      <div style={S.tabs}>
        {tabs.map((t) => (
          <div key={t.id} style={S.tab(tab === t.id)} onClick={() => setTab(t.id)}>
            {t.label}
          </div>
        ))}
      </div>
      {tab === "reserving" && <ReservingTab />}
      {tab === "reinsurance" && <ReinsuranceTab />}
      {tab === "capital" && <CapitalTab />}
      {tab === "ai" && <AITab />}
    </div>
  );
}
