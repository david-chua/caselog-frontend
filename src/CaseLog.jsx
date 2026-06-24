import { useState, useEffect, useRef, useCallback } from "react";
import {
  Search, Plus, X, Trash2, Upload, FileText, Download,
  Circle, Link2, ArrowRight, LayoutList, BookOpenText, ChevronDown, ChevronUp, Table2,
} from "lucide-react";

// ── Constants ────────────────────────────────────────────────────────────────

const PRIORITY_OPTS = [
  { id: "p1", short: "P1", label: "P1 — System Outage",    color: "#D7263D" },
  { id: "p2", short: "P2", label: "P2 — Critical Impact",  color: "#FA660F" },
  { id: "p3", short: "P3", label: "P3 — Major Impact",     color: "#F2A93B" },
  { id: "p4", short: "P4", label: "P4 — Moderate Impact",  color: "#9AA0A6" },
];

const STATUS_OPTS = [
  { id: "c0", label: "C0 — No Resolution" },
  { id: "c1", label: "C1 — New" },
  { id: "c2", label: "C2 — Assigned" },
  { id: "c4", label: "C4 — Rapid Response" },
  { id: "c5a", label: "C5 — Dev Complete" },
  { id: "c5b", label: "C5 — Dev Evaluation" },
  { id: "c5c", label: "C5 — Dev Scheduled" },
  { id: "c5d", label: "C5 — Mitigation Provided" },
  { id: "c5e", label: "C5 — Product Backlog" },
  { id: "c6",  label: "C6 — Solution Provided" },
  { id: "c7",  label: "C7 — Closed" },
];

const CASE_REASON_OPTS = [
  "Defect", "Technical Issue", "Product Enhancement",
  "Usage Question/Documentation", "Invalid Case", "Patch",
];

const CASE_SUBREASON_OPTS = [
  "Administration", "Broken Functionality", "Configuration", "Connectivity",
  "Crash", "Customization", "Data Inconsistency", "Install",
  "Metadata Inconsistency", "Performance", "Security Concern", "ENG troubleshooting",
];

const ENVIRONMENT_OPTS = ["DEV", "UAT", "PROD"];

const CASE_SKILL_OPTS = ["Client", "Server", "Web", "SDK", "MCP", "Infra"];

// ── Theme ────────────────────────────────────────────────────────────────────
const INK        = "#161616";
const PAPER      = "#F2F2F0";
const CARD       = "#FFFFFF";
const LINE       = "#E1E1DF";
const ACCENT     = "#FA660F";
const ACCENT_DARK = "#D9560A";
const ACCENT_SOFT = "#FFF0E6";
const MUTED      = "#8C8C8C";
const HEADER_BG  = "#161616";
const SECTION_BG = "#F8F8F7";

// ── Helpers ──────────────────────────────────────────────────────────────────
function priorityMeta(id) { return PRIORITY_OPTS.find(p => p.id === id) || PRIORITY_OPTS[3]; }
function statusMeta(id)   { return STATUS_OPTS.find(s => s.id === id)   || STATUS_OPTS[1]; }
function pad4(n) { return String(n).padStart(4, "0"); }
function uid()   { return Math.random().toString(36).slice(2,10) + Date.now().toString(36); }
function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { month:"short", day:"numeric", year:"numeric", hour:"numeric", minute:"2-digit" });
}
function formatBytes(b) {
  if (!b) return "0 KB";
  const kb = b/1024;
  return kb < 1024 ? `${kb.toFixed(kb<10?1:0)} KB` : `${(kb/1024).toFixed(1)} MB`;
}

const emptyCase = () => ({
  // Case Info
  serviceNowId: "", account: "", contact: "",
  caseReason: "", caseSubreason: "", priority: "p4", status: "c1",
  productVersion: "", productUpdate: "", environment: "", caseOwner: "",
  // Case Details
  subject: "", description: "", planToResolve: "",
  // Details
  expectedBehavior: "", stepsToReproduce: "", troubleshootingSteps: "",
  businessImpact: "", statusSummary: "", nextMilestone: "", caseSkill: "",
  // Resolution
  resolutionCode: "", resolutionNotes: "",
});

// ── PDF Extraction via Claude API ─────────────────────────────────────────────
async function extractFromPdf(base64Data) {
  const systemPrompt = `You are a data extraction assistant for a customer case logging tool.
You will receive a PDF document (could be a case report, support ticket export, email, or any document).
Extract whatever fields you can find and return ONLY a valid JSON object with these optional keys (only include keys where you found real values):

- serviceNowId: ticket/case number like CS0012345, INC0048213, SCS0001234
- account: company or account name that opened the case
- contact: individual contact person / representative from the account
- caseReason: one of exactly: "Defect", "Technical Issue", "Product Enhancement", "Usage Question/Documentation", "Invalid Case", "Patch"
- caseSubreason: one of exactly: "Administration", "Broken Functionality", "Configuration", "Connectivity", "Crash", "Customization", "Data Inconsistency", "Install", "Metadata Inconsistency", "Performance", "Security Concern", "ENG troubleshooting"
- priority: one of "p1","p2","p3","p4" (1/Critical/Outage=p1, 2/High=p2, 3/Moderate/Medium=p3, 4/Low/Planning=p4)
- status: one of "c0","c1","c2","c4","c5a","c5b","c5c","c5d","c5e","c6","c7" (map: New/Open=c1, Assigned=c2, Closed=c7, Resolved/Solution Provided=c6, otherwise c1)
- productVersion: version string of the product
- productUpdate: update or patch number
- environment: one of "DEV","UAT","PROD"
- caseOwner: name of the case owner or assigned agent
- subject: short description / title / subject of the issue
- description: technical description of the issue
- planToResolve: plan to resolve text
- expectedBehavior: what the expected behavior should be
- stepsToReproduce: steps to reproduce the issue
- troubleshootingSteps: troubleshooting steps taken
- businessImpact: business or user impact description
- statusSummary: current status summary
- nextMilestone: next milestone date as YYYY-MM-DD if found
- caseSkill: one of "Client","Server","Web","SDK","MCP","Infra"
- resolutionCode: resolution code
- resolutionNotes: resolution notes

Return ONLY the JSON object, no markdown fences, no explanation.`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{
        role: "user",
        content: [{
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: base64Data }
        }, {
          type: "text",
          text: "Please extract all case fields you can find from this document and return them as a JSON object."
        }]
      }]
    })
  });
  if (!response.ok) throw new Error(`API error ${response.status}`);
  const data = await response.json();
  const raw = data.content?.find(b => b.type === "text")?.text || "{}";
  return JSON.parse(raw.replace(/```json|```/g, "").trim());
}

// ── Customer Directory ────────────────────────────────────────────────────────
function buildDirectory(cases) {
  const map = new Map();
  for (const c of cases) {
    const name = (c.account || "").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (!map.has(key)) map.set(key, { name, ids: [] });
    map.get(key).ids.push(c.id);
  }
  const sorted = Array.from(map.values()).sort((a,b) => a.name.localeCompare(b.name));
  const byLetter = {};
  for (const cust of sorted) {
    const ch = cust.name[0]?.toUpperCase() || "#";
    const letter = /[A-Z]/.test(ch) ? ch : "#";
    if (!byLetter[letter]) byLetter[letter] = [];
    byLetter[letter].push(cust);
  }
  return byLetter;
}
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

// ── Shared UI Primitives ──────────────────────────────────────────────────────
const inputStyle = {
  padding: "8px 10px", borderRadius: "7px", border: `1px solid ${LINE}`,
  fontSize: "13px", fontFamily: "'IBM Plex Sans', sans-serif",
  color: INK, background: "#fff", width: "100%",
};
const monoStyle = { ...inputStyle, fontFamily: "'IBM Plex Mono', monospace" };

function Field({ label, children, half }) {
  return (
    <label style={{ display:"flex", flexDirection:"column", gap:"5px",
      fontSize:"12px", fontWeight:600, color:"#4A5560",
      flex: half ? "1 1 180px" : "1 1 100%" }}>
      {label}
      {children}
    </label>
  );
}

function SectionCard({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ border:`1px solid ${LINE}`, borderRadius:"10px", overflow:"hidden", marginBottom:"16px" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ width:"100%", display:"flex", alignItems:"center", justifyContent:"space-between",
          padding:"10px 14px", background: SECTION_BG, border:"none", cursor:"pointer",
          fontFamily:"'Space Grotesk', sans-serif", fontWeight:700, fontSize:"13px", color: INK }}>
        {title}
        {open ? <ChevronUp size={15} color={MUTED}/> : <ChevronDown size={15} color={MUTED}/>}
      </button>
      {open && <div style={{ padding:"14px", background: CARD, display:"flex", flexWrap:"wrap", gap:"12px" }}>{children}</div>}
    </div>
  );
}

// ── PDF Import Component ──────────────────────────────────────────────────────
function PdfImport({ onApply, showToast, collapsible }) {
  const [open, setOpen]       = useState(!collapsible);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [error, setError]     = useState(null);
  const [fileName, setFileName] = useState("");
  const inputRef = useRef(null);

  const FIELD_LABELS = {
    serviceNowId:"ServiceNow ID", account:"Account", contact:"Contact",
    caseReason:"Case Reason", caseSubreason:"Case Subreason",
    priority:"Priority", status:"Status", productVersion:"Product Version",
    productUpdate:"Product Update", environment:"Environment", caseOwner:"Case Owner",
    subject:"Subject", description:"Description", planToResolve:"Plan to Resolve",
    expectedBehavior:"Expected Behavior", stepsToReproduce:"Steps to Reproduce",
    troubleshootingSteps:"Troubleshooting Steps", businessImpact:"Business Impact",
    statusSummary:"Status Summary", nextMilestone:"Next Milestone",
    caseSkill:"Case Skill", resolutionCode:"Resolution Code", resolutionNotes:"Resolution Notes",
  };

  const displayValue = (k, v) => {
    if (k === "priority") return priorityMeta(v)?.label || v;
    if (k === "status")   return statusMeta(v)?.label   || v;
    if (typeof v === "string" && v.length > 100) return v.slice(0, 100) + "…";
    return v;
  };

  const handleFile = async (file) => {
    if (!file || file.type !== "application/pdf") { showToast("Please select a PDF file"); return; }
    if (file.size > 30 * 1024 * 1024) { showToast("PDF too large (max 30MB)"); return; }
    setFileName(file.name);
    setLoading(true); setError(null); setPreview(null);
    try {
      const base64 = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result.split(",")[1]);
        r.onerror = rej;
        r.readAsDataURL(file);
      });
      const parsed = await extractFromPdf(base64);
      if (!parsed || Object.keys(parsed).length === 0) {
        setError("No recognizable fields found in this PDF. Make sure it contains case information.");
      } else {
        setPreview(parsed);
      }
    } catch(e) {
      setError("Extraction failed: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleApply = () => {
    if (!preview) return;
    onApply(preview);
    const filled = Object.keys(preview).map(k => FIELD_LABELS[k] || k).join(", ");
    showToast(`Extracted: ${filled}`);
    setPreview(null); setFileName(""); setError(null);
    if (collapsible) setOpen(false);
  };

  if (collapsible && !open) {
    return (
      <button className="cl-btn-ghost" onClick={() => setOpen(true)}
        style={{ display:"flex", alignItems:"center", gap:"6px", background:"transparent",
          border:`1px solid ${LINE}`, borderRadius:"8px", padding:"8px 12px",
          fontSize:"12.5px", fontWeight:600, color: ACCENT, cursor:"pointer",
          fontFamily:"inherit", marginBottom:"16px" }}>
        <Upload size={14}/> Import from PDF
      </button>
    );
  }

  return (
    <div style={{ border:`1.5px solid ${ACCENT}`, background: ACCENT_SOFT,
      borderRadius:"10px", padding:"14px", marginBottom:"18px" }}>
      <div style={{ display:"flex", alignItems:"center", gap:"8px", marginBottom:"8px" }}>
        <FileText size={15} color={ACCENT}/>
        <span style={{ fontSize:"13px", fontWeight:700, color: INK }}>Import from PDF</span>
        {collapsible && (
          <button onClick={() => { setOpen(false); setPreview(null); setError(null); setFileName(""); }}
            style={{ marginLeft:"auto", background:"transparent", border:"none", color: MUTED, cursor:"pointer", display:"flex" }}>
            <X size={14}/>
          </button>
        )}
      </div>

      {!preview ? (
        <>
          <div style={{ fontSize:"12px", color:"#5A5A58", marginBottom:"10px", lineHeight:"1.6" }}>
            Upload a PDF (case export, support doc, email printout) — Claude AI will extract all recognizable case fields automatically.
          </div>

          <div
            className="cl-dropzone"
            onClick={() => !loading && inputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add("dragover"); }}
            onDragLeave={e => e.currentTarget.classList.remove("dragover")}
            onDrop={e => { e.preventDefault(); e.currentTarget.classList.remove("dragover"); handleFile(e.dataTransfer.files[0]); }}
            style={{ border:`1.5px dashed ${loading ? MUTED : ACCENT}`, borderRadius:"8px",
              padding:"20px", textAlign:"center", cursor: loading ? "default" : "pointer",
              background:"#fff", transition:"all 0.15s" }}>
            {loading ? (
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:"10px" }}>
                <div style={{ width:24, height:24, border:"3px solid rgba(250,102,15,0.25)",
                  borderTopColor: ACCENT, borderRadius:"50%", animation:"cl-spin 0.7s linear infinite" }}/>
                <div style={{ fontSize:"13px", color: MUTED }}>Extracting fields from <strong>{fileName}</strong>…</div>
              </div>
            ) : fileName && !error ? (
              <div style={{ fontSize:"13px", color: MUTED }}>
                <FileText size={18} style={{ marginBottom:4 }} color={ACCENT}/>
                <div><strong>{fileName}</strong> — <span style={{ color: ACCENT, cursor:"pointer" }} onClick={e => { e.stopPropagation(); setFileName(""); }}>change</span></div>
              </div>
            ) : (
              <>
                <Upload size={20} color={ACCENT} style={{ marginBottom:6 }}/>
                <div style={{ fontSize:"13px", color: INK, fontWeight:600 }}>Drop a PDF here or click to browse</div>
                <div style={{ fontSize:"11px", color: MUTED, marginTop:4 }}>Max 30MB · PDF only</div>
              </>
            )}
            <input ref={inputRef} type="file" accept="application/pdf"
              onChange={e => { handleFile(e.target.files[0]); e.target.value = ""; }}
              style={{ display:"none" }}/>
          </div>

          {error && (
            <div style={{ fontSize:"12px", color:"#D7263D", marginTop:"8px", padding:"8px 10px",
              background:"#FEF0F0", borderRadius:"6px", border:"1px solid #F5C2C7" }}>
              {error}
            </div>
          )}
        </>
      ) : (
        <>
          <div style={{ fontSize:"12px", color:"#5A5A58", marginBottom:"10px" }}>
            <strong>{Object.keys(preview).length} fields</strong> extracted from <em>{fileName}</em>. Review below, then apply to the case.
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:"5px", marginBottom:"12px",
            maxHeight:"260px", overflowY:"auto" }} className="cl-scroll">
            {Object.entries(preview).map(([k, v]) => (
              <div key={k} style={{ display:"flex", gap:"10px", alignItems:"flex-start",
                padding:"6px 10px", background:"#fff", borderRadius:"6px",
                border:`1px solid ${LINE}`, fontSize:"12.5px" }}>
                <span style={{ fontWeight:600, color: MUTED, minWidth:"130px", flexShrink:0 }}>{FIELD_LABELS[k] || k}</span>
                <span style={{ color: INK, wordBreak:"break-word" }}>{displayValue(k, v)}</span>
              </div>
            ))}
          </div>
          <div style={{ display:"flex", gap:"8px", justifyContent:"flex-end" }}>
            <button className="cl-btn-ghost" onClick={() => { setPreview(null); setError(null); }}
              style={{ background:"transparent", border:`1px solid ${LINE}`, borderRadius:"8px",
                padding:"7px 12px", fontSize:"12.5px", fontWeight:600, cursor:"pointer",
                fontFamily:"inherit", color:"#4A5560" }}>
              ← Try again
            </button>
            <button className="cl-btn-primary" onClick={handleApply}
              style={{ display:"flex", alignItems:"center", gap:"6px", background: ACCENT, color:"#fff",
                border:"none", borderRadius:"8px", padding:"7px 14px",
                fontSize:"12.5px", fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}>
              <Upload size={13}/> Apply to case
            </button>
          </div>
        </>
      )}
      <style>{`@keyframes cl-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Excel → Cases mapper ──────────────────────────────────────────────────────
// Maps common Excel column header variations to case field keys.
const HEADER_MAP = {
  // serviceNowId
  "servicenow id":     "serviceNowId", "servicenow":    "serviceNowId",
  "snow id":           "serviceNowId", "case id":       "serviceNowId",
  "ticket id":         "serviceNowId", "ticket number": "serviceNowId",
  "case number":       "serviceNowId", "number":        "serviceNowId",
  "id":                "serviceNowId", "snow#":         "serviceNowId",
  "incident id":       "serviceNowId", "incident number":"serviceNowId",
  // account
  "account":           "account",      "company":       "account",
  "organization":      "account",      "org":           "account",
  "account name":      "account",
  // contact
  "contact":           "contact",      "contact name":  "contact",
  "caller":            "contact",      "representative":"contact",
  "rep":               "contact",
  // case reason
  "case reason":       "caseReason",   "reason":        "caseReason",
  // case subreason
  "case subreason":    "caseSubreason","subreason":     "caseSubreason",
  "sub reason":        "caseSubreason",
  // priority
  "priority":          "priority",     "priority level": "priority",
  "p":                 "priority",
  // status
  "status":            "status",       "state":         "status",
  // product version
  "product version":   "productVersion","version":      "productVersion",
  // product update
  "product update":    "productUpdate", "update":       "productUpdate",
  // environment
  "environment":       "environment",  "env":           "environment",
  // case owner
  "case owner":        "caseOwner",    "owner":         "caseOwner",
  "assigned to":       "caseOwner",    "agent":         "caseOwner",
  // subject
  "subject":           "subject",      "short description":"subject",
  "title":             "subject",      "issue":         "subject",
  // description
  "description":       "description",  "details":       "description",
  // plan to resolve
  "plan to resolve":   "planToResolve","plan":          "planToResolve",
  // expected behavior
  "expected behavior": "expectedBehavior", "expected":  "expectedBehavior",
  // steps to reproduce
  "steps to reproduce":"stepsToReproduce","steps":      "stepsToReproduce",
  "reproduce steps":   "stepsToReproduce",
  // troubleshooting steps
  "troubleshooting steps":"troubleshootingSteps","troubleshooting":"troubleshootingSteps",
  // business impact — covers all common variations
  "business impact":        "businessImpact",
  "business/user impact":   "businessImpact",
  "business / user impact": "businessImpact",
  "user impact":            "businessImpact",
  "business user impact":   "businessImpact",
  "impact":                 "businessImpact",
  // status summary
  "status summary":    "statusSummary", "summary":      "statusSummary",
  // next milestone
  "next milestone":    "nextMilestone", "milestone":    "nextMilestone",
  "milestone date":    "nextMilestone",
  // case skill
  "case skill":        "caseSkill",    "skill":         "caseSkill",
  // resolution code
  "resolution code":   "resolutionCode","res code":     "resolutionCode",
  // resolution notes
  "resolution notes":  "resolutionNotes","resolution":  "resolutionNotes",
};

function normalizePriorityVal(raw) {
  if (raw === null || raw === undefined || raw === "") return "p4";
  // Handle numeric cell values from Excel (SheetJS may give numbers)
  if (typeof raw === "number") {
    if (raw === 1) return "p1";
    if (raw === 2) return "p2";
    if (raw === 3) return "p3";
    return "p4";
  }
  const s = String(raw).toLowerCase().trim().replace(/\s+/g, " ");
  // Strip leading number + dash patterns like "1 - " or "1-" to get the label
  const stripped = s.replace(/^\d+\s*[-–—]\s*/, "");
  // Match by number prefix first (most reliable)
  if (s.startsWith("1") || s.startsWith("p1")) return "p1";
  if (s.startsWith("2") || s.startsWith("p2")) return "p2";
  if (s.startsWith("3") || s.startsWith("p3")) return "p3";
  if (s.startsWith("4") || s.startsWith("p4")) return "p4";
  // Match by keyword in full string or stripped label
  const all = s + " " + stripped;
  if (all.includes("outage") || all.includes("sev1") || all.includes("sev 1")) return "p1";
  if (all.includes("critical") || all.includes("high") || all.includes("sev2") || all.includes("sev 2")) return "p2";
  if (all.includes("major") || all.includes("medium") || all.includes("moderate") || all.includes("sev3") || all.includes("sev 3")) return "p3";
  if (all.includes("low") || all.includes("minor") || all.includes("planning") || all.includes("sev4") || all.includes("sev 4")) return "p4";
  return "p4";
}

function normalizeStatusVal(raw) {
  if (!raw) return "c1";
  const s = String(raw).toLowerCase().replace(/\s+/g, "");
  if (s.startsWith("c0") || s.includes("noresolution")) return "c0";
  if (s.startsWith("c1") || s === "new" || s === "open") return "c1";
  if (s.startsWith("c2") || s === "assigned") return "c2";
  if (s.startsWith("c4") || s.includes("rapid")) return "c4";
  if (s.includes("devcomplete")) return "c5a";
  if (s.includes("devevaluation") || s.includes("evaluation")) return "c5b";
  if (s.includes("devscheduled") || s.includes("scheduled")) return "c5c";
  if (s.includes("mitigation")) return "c5d";
  if (s.includes("backlog")) return "c5e";
  if (s.startsWith("c5")) return "c5a";
  if (s.startsWith("c6") || s.includes("solution")) return "c6";
  if (s.startsWith("c7") || s === "closed") return "c7";
  if (s.includes("resolved")) return "c6";
  if (s.includes("progress") || s.includes("inprogress")) return "c2";
  return "c1";
}

function normalizeEnvVal(raw) {
  if (!raw) return "";
  const s = String(raw).toUpperCase().trim();
  if (s === "DEV" || s === "DEVELOPMENT") return "DEV";
  if (s === "UAT" || s === "STAGING" || s === "TEST") return "UAT";
  if (s === "PROD" || s === "PRODUCTION") return "PROD";
  return "";
}

function normalizeCaseReasonVal(raw) {
  if (!raw) return "";
  const s = String(raw).trim().toLowerCase();
  return CASE_REASON_OPTS.find(o => o.toLowerCase() === s) ||
         CASE_REASON_OPTS.find(o => o.toLowerCase().includes(s)) || "";
}

function normalizeCaseSubreasonVal(raw) {
  if (!raw) return "";
  const s = String(raw).trim().toLowerCase();
  return CASE_SUBREASON_OPTS.find(o => o.toLowerCase() === s) ||
         CASE_SUBREASON_OPTS.find(o => o.toLowerCase().includes(s)) || "";
}

function normalizeCaseSkillVal(raw) {
  if (!raw) return "";
  const s = String(raw).trim().toLowerCase();
  return CASE_SKILL_OPTS.find(o => o.toLowerCase() === s) || "";
}

function parseExcelRows(workbook) {
  const XLSX = window._XLSX;
  const allRows = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    for (const row of rows) {
      const normalized = {};
      for (const [col, val] of Object.entries(row)) {
        // Strip BOM, non-breaking spaces, extra whitespace, special chars before lookup
        const cleanCol = col
          .replace(/^\uFEFF/, "")           // BOM
          .replace(/\u00A0/g, " ")          // non-breaking space → regular space
          .replace(/[*_#\[\]]/g, "")        // markdown-like chars some Excel exports add
          .toLowerCase()
          .trim();
        const key = HEADER_MAP[cleanCol];
        if (key) normalized[key] = val;
      }
      // Only include rows that have at least one recognizable non-empty field
      if (Object.values(normalized).some(v => String(v).trim())) allRows.push(normalized);
    }
  }
  return allRows;
}

function rowToCase(row) {
  const base = emptyCase();
  return {
    ...base,
    serviceNowId:    String(row.serviceNowId  || "").trim(),
    account:         String(row.account        || "").trim(),
    contact:         String(row.contact        || "").trim(),
    caseReason:      normalizeCaseReasonVal(row.caseReason),
    caseSubreason:   normalizeCaseSubreasonVal(row.caseSubreason),
    priority:        normalizePriorityVal(row.priority),
    status:          normalizeStatusVal(row.status),
    productVersion:  String(row.productVersion || "").trim(),
    productUpdate:   String(row.productUpdate  || "").trim(),
    environment:     normalizeEnvVal(row.environment),
    caseOwner:       String(row.caseOwner      || "").trim(),
    subject:         String(row.subject        || "").trim(),
    description:     String(row.description    || "").trim(),
    planToResolve:   String(row.planToResolve  || "").trim(),
    expectedBehavior:  String(row.expectedBehavior   || "").trim(),
    stepsToReproduce:  String(row.stepsToReproduce   || "").trim(),
    troubleshootingSteps: String(row.troubleshootingSteps || "").trim(),
    businessImpact:  String(row.businessImpact  || "").trim(),
    statusSummary:   String(row.statusSummary   || "").trim(),
    nextMilestone:   String(row.nextMilestone   || "").trim(),
    caseSkill:       normalizeCaseSkillVal(row.caseSkill),
    resolutionCode:  String(row.resolutionCode  || "").trim(),
    resolutionNotes: String(row.resolutionNotes || "").trim(),
  };
}

// ── Excel Import Page ─────────────────────────────────────────────────────────
function ExcelImportPage({ cases: existingCases, onImport, showToast }) {
  const [loading, setLoading]   = useState(false);
  const [rows, setRows]         = useState(null); // parsed preview rows
  const [fileName, setFileName] = useState("");
  const [error, setError]       = useState(null);
  const [xlibReady, setXlibReady] = useState(!!window._XLSX);
  const [selected, setSelected] = useState(null); // set of row indices to import
  const [importing, setImporting] = useState(false);
  const inputRef = useRef(null);

  // Load SheetJS lazily
  useEffect(() => {
    if (window._XLSX) { setXlibReady(true); return; }
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
    script.onload = () => { window._XLSX = window.XLSX; setXlibReady(true); };
    script.onerror = () => setError("Couldn't load Excel parser library. Check your connection.");
    document.head.appendChild(script);
  }, []);

  const handleFile = async (file) => {
    if (!file) return;
    const ext = file.name.split(".").pop().toLowerCase();
    if (!["xlsx","xls","csv","ods"].includes(ext)) {
      setError("Unsupported file type. Please use .xlsx, .xls, .csv, or .ods");
      return;
    }
    setFileName(file.name); setLoading(true); setError(null); setRows(null); setSelected(null);
    try {
      const ab = await file.arrayBuffer();
      const wb = window._XLSX.read(ab, { type: "array" });
      const parsed = parseExcelRows(wb);
      if (parsed.length === 0) {
        setError("No recognizable columns found. Make sure your headers match the expected field names (Account, Subject, Priority, Status, etc.).");
      } else {
        setRows(parsed);
        setSelected(new Set(parsed.map((_, i) => i)));
      }
    } catch(e) {
      setError("Failed to parse file: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleRow = (i) => {
    setSelected(prev => {
      const s = new Set(prev);
      if (s.has(i)) s.delete(i); else s.add(i);
      return s;
    });
  };

  const toggleAll = () => {
    if (!rows) return;
    setSelected(prev => prev.size === rows.length ? new Set() : new Set(rows.map((_,i) => i)));
  };

  const handleImport = async () => {
    if (!rows || !selected?.size) return;
    setImporting(true);
    const toCreate = rows.filter((_, i) => selected.has(i));
    await onImport(toCreate);
    showToast(`${toCreate.length} case${toCreate.length===1?"":"s"} imported`);
    setRows(null); setFileName(""); setSelected(null);
    setImporting(false);
  };

  const mappedFieldCount = (row) => Object.values(row).filter(v => String(v).trim()).length;

  // Build a set of existing serviceNowIds for duplicate detection
  const existingSnowIds = new Set(
    existingCases.map(c => (c.serviceNowId||"").trim().toLowerCase()).filter(Boolean)
  );

  // Column preview — figure out which fields are actually present
  const presentFields = rows ? (() => {
    const keys = new Set();
    rows.forEach(r => Object.keys(r).forEach(k => { if (String(r[k]).trim()) keys.add(k); }));
    return Array.from(keys);
  })() : [];

  const FIELD_LABELS = {
    serviceNowId:"ServiceNow ID", account:"Account", contact:"Contact",
    caseReason:"Case Reason", caseSubreason:"Subreason", priority:"Priority",
    status:"Status", productVersion:"Product Ver.", productUpdate:"Product Upd.",
    caseOwner:"Owner", subject:"Subject",
    description:"Description", planToResolve:"Plan to Resolve",
    expectedBehavior:"Expected Behavior", stepsToReproduce:"Steps to Reproduce",
    troubleshootingSteps:"Troubleshooting", businessImpact:"Business Impact",
    statusSummary:"Status Summary", nextMilestone:"Next Milestone",
    caseSkill:"Skill", resolutionCode:"Res. Code", resolutionNotes:"Res. Notes",
  };

  return (
    <div style={{ flex:1, overflowY:"auto", padding:"22px" }} className="cl-scroll">
      <div style={{ maxWidth:"900px" }}>
        <h2 style={{ fontFamily:"'Space Grotesk',sans-serif", fontSize:"19px", fontWeight:700, margin:"0 0 4px" }}>
          Import from Excel
        </h2>
        <p style={{ fontSize:"13px", color: MUTED, marginTop:0, marginBottom:"18px", lineHeight:"1.6" }}>
          Upload an <strong>.xlsx</strong>, <strong>.xls</strong>, or <strong>.csv</strong> file.
          Each row becomes a case. Column headers are matched flexibly — see the template for supported names.
        </p>

        {/* Template download hint */}
        <div style={{ display:"flex", alignItems:"center", gap:"10px", padding:"10px 14px",
          background: CARD, border:`1px solid ${LINE}`, borderRadius:"8px", marginBottom:"18px",
          fontSize:"12.5px", color:"#4A5560" }}>
          <Table2 size={16} color={ACCENT}/>
          <span>Supported columns: <strong>ID</strong>, <strong>Account</strong>, <strong>Subject</strong>, <strong>Priority</strong>, <strong>Status</strong>, <strong>Contact</strong>, <strong>Case Reason</strong>, <strong>Case Subreason</strong>, <strong>Business/User Impact</strong>, <strong>Product Version</strong>, <strong>Description</strong>, and more.</span>
        </div>

        {/* Upload zone */}
        {!rows && (
          <div
            className="cl-dropzone"
            onClick={() => !loading && xlibReady && inputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add("dragover"); }}
            onDragLeave={e => e.currentTarget.classList.remove("dragover")}
            onDrop={e => { e.preventDefault(); e.currentTarget.classList.remove("dragover"); handleFile(e.dataTransfer.files[0]); }}
            style={{ border:`2px dashed ${LINE}`, borderRadius:"10px", padding:"36px 20px",
              textAlign:"center", cursor: loading||!xlibReady ? "default" : "pointer",
              background: CARD, transition:"all 0.15s", marginBottom:"16px" }}>
            {loading ? (
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:"10px" }}>
                <div style={{ width:28, height:28, border:"3px solid rgba(250,102,15,0.2)",
                  borderTopColor: ACCENT, borderRadius:"50%", animation:"cl-spin 0.7s linear infinite" }}/>
                <div style={{ fontSize:"13px", color: MUTED }}>Parsing <strong>{fileName}</strong>…</div>
              </div>
            ) : !xlibReady ? (
              <div style={{ color: MUTED, fontSize:"13px" }}>Loading Excel parser…</div>
            ) : (
              <>
                <Table2 size={28} color={ACCENT} style={{ marginBottom:"8px" }}/>
                <div style={{ fontSize:"14px", fontWeight:600, color: INK }}>Drop your spreadsheet here or click to browse</div>
                <div style={{ fontSize:"12px", color: MUTED, marginTop:"4px" }}>.xlsx · .xls · .csv · .ods</div>
              </>
            )}
            <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv,.ods,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={e => { handleFile(e.target.files[0]); e.target.value=""; }}
              style={{ display:"none" }}/>
          </div>
        )}

        {error && (
          <div style={{ fontSize:"12.5px", color:"#D7263D", padding:"10px 12px",
            background:"#FEF0F0", borderRadius:"8px", border:"1px solid #F5C2C7", marginBottom:"14px" }}>
            {error}
          </div>
        )}

        {/* Preview table */}
        {rows && (
          <div>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
              marginBottom:"10px", flexWrap:"wrap", gap:"8px" }}>
              <div style={{ fontSize:"13px", fontWeight:600, color: INK }}>
                <span style={{ color: ACCENT }}>{rows.length}</span> rows found in <em>{fileName}</em>
                {(() => {
                  const dupes = rows.filter(r => r.serviceNowId && existingSnowIds.has(String(r.serviceNowId).trim().toLowerCase())).length;
                  const news = rows.length - dupes;
                  return <span style={{ color: MUTED, fontWeight:400 }}>
                    {" · "}{news > 0 && <>{news} new</>}{news > 0 && dupes > 0 && ", "}{dupes > 0 && <>{dupes} will overwrite existing</>}
                    {selected?.size !== rows.length && ` · ${selected?.size} selected`}
                  </span>;
                })()}
              </div>
              <div style={{ display:"flex", gap:"8px", alignItems:"center" }}>
                <button className="cl-btn-ghost" onClick={() => { setRows(null); setFileName(""); setSelected(null); setError(null); }}
                  style={{ background:"transparent", border:`1px solid ${LINE}`, borderRadius:"7px",
                    padding:"6px 12px", fontSize:"12px", fontWeight:600, cursor:"pointer", fontFamily:"inherit", color:"#4A5560" }}>
                  ← Change file
                </button>
                <button className="cl-btn-primary" onClick={handleImport}
                  disabled={!selected?.size || importing}
                  style={{ display:"flex", alignItems:"center", gap:"6px",
                    background: selected?.size && !importing ? ACCENT : "#D8D6D2",
                    color:"#fff", border:"none", borderRadius:"7px",
                    padding:"7px 14px", fontSize:"12.5px", fontWeight:600,
                    cursor: selected?.size && !importing ? "pointer" : "default", fontFamily:"inherit" }}>
                  {importing
                    ? <><div style={{ width:13,height:13,border:"2px solid rgba(255,255,255,0.3)",borderTopColor:"#fff",borderRadius:"50%",animation:"cl-spin 0.7s linear infinite" }}/> Importing…</>
                    : <><Upload size={13}/> Import {selected?.size || 0} case{selected?.size===1?"":"s"}</>}
                </button>
              </div>
            </div>

            <div style={{ overflowX:"auto", border:`1px solid ${LINE}`, borderRadius:"10px",
              background: CARD, marginBottom:"12px" }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:"12px" }}>
                <thead>
                  <tr style={{ background: SECTION_BG, borderBottom:`2px solid ${LINE}` }}>
                    <th style={{ padding:"8px 10px", textAlign:"center", width:"40px", borderRight:`1px solid ${LINE}` }}>
                      <input type="checkbox" checked={selected?.size === rows.length}
                        onChange={toggleAll} style={{ cursor:"pointer" }}/>
                    </th>
                    <th style={{ padding:"8px 10px", textAlign:"left", fontFamily:"'IBM Plex Mono',monospace", color: MUTED, borderRight:`1px solid ${LINE}`, whiteSpace:"nowrap" }}>#</th>
                    <th style={{ padding:"8px 10px", textAlign:"left", fontWeight:700, color:"#4A5560", whiteSpace:"nowrap", borderRight:`1px solid ${LINE}` }}>Action</th>
                    {presentFields.map(f => (
                      <th key={f} style={{ padding:"8px 10px", textAlign:"left", fontWeight:700,
                        color:"#4A5560", whiteSpace:"nowrap", borderRight:`1px solid ${LINE}` }}>
                        {FIELD_LABELS[f] || f}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => {
                    const pr = priorityMeta(row.priority);
                    const isSelected = selected?.has(i);
                    const isDupe = row.serviceNowId && existingSnowIds.has(String(row.serviceNowId).trim().toLowerCase());
                    return (
                      <tr key={i}
                        onClick={() => toggleRow(i)}
                        style={{ borderBottom:`1px solid ${LINE}`,
                          background: isSelected ? (isDupe ? "#FFF8F0" : ACCENT_SOFT) : "#fff",
                          cursor:"pointer", transition:"background 0.1s",
                          opacity: isSelected ? 1 : 0.45 }}>
                        <td style={{ padding:"7px 10px", textAlign:"center", borderRight:`1px solid ${LINE}` }}
                          onClick={e => { e.stopPropagation(); toggleRow(i); }}>
                          <input type="checkbox" checked={isSelected} onChange={() => toggleRow(i)} style={{ cursor:"pointer" }}/>
                        </td>
                        <td style={{ padding:"7px 10px", fontFamily:"'IBM Plex Mono',monospace",
                          color: MUTED, borderRight:`1px solid ${LINE}`, whiteSpace:"nowrap" }}>
                          {i + 1}
                        </td>
                        <td style={{ padding:"7px 10px", borderRight:`1px solid ${LINE}`, whiteSpace:"nowrap" }}>
                          <span style={{ fontSize:"10px", fontWeight:700, padding:"2px 7px", borderRadius:"4px",
                            background: isDupe ? "#FFF0DD" : "#E6F5EC",
                            color: isDupe ? "#B45309" : "#2D6A4F" }}>
                            {isDupe ? "↻ Update" : "+ New"}
                          </span>
                        </td>
                        {presentFields.map(f => (
                          <td key={f} style={{ padding:"7px 10px", borderRight:`1px solid ${LINE}`,
                            maxWidth:"180px", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                            {f === "priority"
                              ? <span style={{ fontWeight:700, color: pr.color, fontFamily:"'IBM Plex Mono',monospace", fontSize:"11px" }}>{pr.short}</span>
                              : f === "status"
                                ? <span style={{ fontSize:"11px", color: MUTED }}>{statusMeta(row.status).label}</span>
                                : String(row[f] || "—")}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ fontSize:"11.5px", color: MUTED }}>
              Click rows to toggle · <span style={{ color:"#B45309" }}>↻ Update</span> rows overwrite existing cases with the same ID · <span style={{ color:"#2D6A4F" }}>+ New</span> rows create new cases
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Case Form (shared by New + Edit) ─────────────────────────────────────────
function CaseForm({ data, onChange, readOnly }) {
  const set = (k) => (e) => !readOnly && onChange({ [k]: e.target.value });

  const roStyle = readOnly ? {
    background: "#F8F8F7",
    color: INK,
    cursor: "default",
    userSelect: "text",
  } : {};

  const inp = { ...inputStyle, ...roStyle };
  const mono = { ...monoStyle, ...roStyle };
  const ta = (h) => ({ ...inputStyle, ...roStyle, minHeight: h, resize: readOnly ? "none" : "vertical", lineHeight:"1.5" });

  return (
    <div>
      {/* ── Case Info ── */}
      <SectionCard title="Case Info">
        <Field label="ServiceNow ID" half>
          <input className="cl-input" style={mono} value={data.serviceNowId} onChange={set("serviceNowId")} placeholder="e.g. CS0012345" readOnly={readOnly}/>
        </Field>
        <Field label="Case Owner" half>
          <input className="cl-input" style={inp} value={data.caseOwner} onChange={set("caseOwner")} placeholder="Assignee name" readOnly={readOnly}/>
        </Field>
        <Field label="Account" half>
          <input className="cl-input" style={inp} value={data.account} onChange={set("account")} placeholder="Company name" readOnly={readOnly}/>
        </Field>
        <Field label="Contact" half>
          <input className="cl-input" style={inp} value={data.contact} onChange={set("contact")} placeholder="Contact person" readOnly={readOnly}/>
        </Field>
        <Field label="Case Reason" half>
          <select className="cl-select" style={inp} value={data.caseReason} onChange={set("caseReason")} disabled={readOnly}>
            <option value="">— Select —</option>
            {CASE_REASON_OPTS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </Field>
        <Field label="Case Subreason" half>
          <select className="cl-select" style={inp} value={data.caseSubreason} onChange={set("caseSubreason")} disabled={readOnly}>
            <option value="">— Select —</option>
            {CASE_SUBREASON_OPTS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </Field>
        <Field label="Product Version" half>
          <input className="cl-input" style={inp} value={data.productVersion} onChange={set("productVersion")} placeholder="e.g. 2024.1.0" readOnly={readOnly}/>
        </Field>
        <Field label="Product Update" half>
          <input className="cl-input" style={inp} value={data.productUpdate} onChange={set("productUpdate")} placeholder="e.g. Update 3" readOnly={readOnly}/>
        </Field>
      </SectionCard>

      {/* ── Case Details ── */}
      <SectionCard title="Case Details">
        <Field label="Subject">
          <input className="cl-input" style={{ ...inp, fontWeight:600 }} value={data.subject} onChange={set("subject")} placeholder="Main headline of the case" readOnly={readOnly}/>
        </Field>
        <Field label="Description">
          <textarea className="cl-textarea" style={ta("100px")} value={data.description} onChange={set("description")} placeholder="Technical description of the issue" readOnly={readOnly}/>
        </Field>
        <Field label="Plan to Resolve">
          <textarea className="cl-textarea" style={ta("80px")} value={data.planToResolve} onChange={set("planToResolve")} placeholder="Describe the plan to resolve this case" readOnly={readOnly}/>
        </Field>
      </SectionCard>

      {/* ── Details ── */}
      <SectionCard title="Details" defaultOpen={false}>
        <Field label="Expected Behavior">
          <textarea className="cl-textarea" style={ta("80px")} value={data.expectedBehavior} onChange={set("expectedBehavior")} placeholder="What should have happened?" readOnly={readOnly}/>
        </Field>
        <Field label="Steps to Reproduce">
          <textarea className="cl-textarea" style={ta("90px")} value={data.stepsToReproduce} onChange={set("stepsToReproduce")} placeholder="Step-by-step instructions to reproduce the issue" readOnly={readOnly}/>
        </Field>
        <Field label="Troubleshooting Steps">
          <textarea className="cl-textarea" style={ta("80px")} value={data.troubleshootingSteps} onChange={set("troubleshootingSteps")} placeholder="Steps already taken to troubleshoot" readOnly={readOnly}/>
        </Field>
        <Field label="Business / User Impact">
          <textarea className="cl-textarea" style={ta("80px")} value={data.businessImpact} onChange={set("businessImpact")} placeholder="Describe the business or user impact" readOnly={readOnly}/>
        </Field>
        <Field label="Status Summary">
          <textarea className="cl-textarea" style={ta("70px")} value={data.statusSummary} onChange={set("statusSummary")} placeholder="Current status summary" readOnly={readOnly}/>
        </Field>
        <Field label="Case Skill" half>
          <select className="cl-select" style={inp} value={data.caseSkill} onChange={set("caseSkill")} disabled={readOnly}>
            <option value="">— Select —</option>
            {CASE_SKILL_OPTS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </Field>
      </SectionCard>

      {/* ── Resolution ── */}
      <SectionCard title="Resolution Information" defaultOpen={false}>
        <Field label="Resolution Code" half>
          <input className="cl-input" style={inp} value={data.resolutionCode} onChange={set("resolutionCode")} placeholder="Resolution code" readOnly={readOnly}/>
        </Field>
        <Field label="Resolution Notes">
          <textarea className="cl-textarea" style={ta("80px")} value={data.resolutionNotes} onChange={set("resolutionNotes")} placeholder="Notes on how the case was resolved" readOnly={readOnly}/>
        </Field>
      </SectionCard>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────

// Point this at your backend. Change to your server's address if not local.
const API = (typeof window !== "undefined" && window.CASELOG_API_URL)
  ? window.CASELOG_API_URL
  : "http://localhost:3001/api";

async function apiFetch(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export default function CaseLog() {
  const [cases, setCases]           = useState([]);
  const [loaded, setLoaded]         = useState(false);
  const [apiError, setApiError]     = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch]         = useState("");
  const [showNew, setShowNew]       = useState(false);
  const [draft, setDraft]           = useState(emptyCase());
  const [mobileView, setMobileView] = useState("list");
  const [toast, setToast]           = useState(null);
  const [page, setPage]             = useState("log");
  const [directoryLetter, setDirectoryLetter] = useState(null);
  const fileInputRef                = useRef(null);
  const [uploading, setUploading]   = useState(false);

  // ── Load all cases on mount ──
  useEffect(() => {
    apiFetch("/cases")
      .then(data => {
        setCases(data);
        if (data.length) setSelectedId(data[0].id);
        setLoaded(true);
      })
      .catch(e => {
        setApiError(e.message);
        setLoaded(true);
      });
  }, []);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2600); };

  const filtered = cases.filter(c => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (c.account||"").toLowerCase().includes(q)
      || (c.contact||"").toLowerCase().includes(q)
      || (c.subject||"").toLowerCase().includes(q)
      || (c.serviceNowId||"").toLowerCase().includes(q)
      || String(c.number).includes(q);
  });

  const selected = cases.find(c => c.id === selectedId) || null;

  const goToCase = (id) => { setPage("log"); setShowNew(false); setSelectedId(id); setMobileView("detail"); };

  // ── Create case ──
  const createCase = async () => {
    if (!draft.account.trim() && !draft.subject.trim()) {
      showToast("Please add at least an Account or Subject"); return;
    }
    try {
      const newCase = await apiFetch("/cases", {
        method: "POST",
        body: {
          ...draft,
          id: uid(),
          account: draft.account.trim(),
          subject: draft.subject.trim(),
          attachments: [],
          relatedCaseIds: [],
        },
      });
      setCases(prev => [newCase, ...prev]);
      setDraft(emptyCase()); setShowNew(false); setSelectedId(newCase.id); setMobileView("detail");
      showToast(`Case #${pad4(newCase.number)} created`);
    } catch(e) { showToast("Failed to create case: " + e.message); }
  };

  // ── Update case (debounced in detail panel, or immediate) ──
  const updateCase = async (id, patch) => {
    try {
      const updated = await apiFetch(`/cases/${id}`, { method: "PATCH", body: patch });
      setCases(prev => prev.map(c => c.id === id ? { ...c, ...updated } : c));
    } catch(e) { showToast("Save failed: " + e.message); }
  };

  // ── Delete case ──
  const deleteCase = async (id) => {
    try {
      await apiFetch(`/cases/${id}`, { method: "DELETE" });
      setCases(prev => {
        const next = prev.filter(c => c.id !== id)
          .map(c => c.relatedCaseIds?.includes(id)
            ? { ...c, relatedCaseIds: c.relatedCaseIds.filter(r => r !== id) } : c);
        if (selectedId === id) { setSelectedId(next.length ? next[0].id : null); setMobileView("list"); }
        return next;
      });
      showToast("Case deleted");
    } catch(e) { showToast("Delete failed: " + e.message); }
  };

  // ── Bulk import (Excel) — uses /cases/bulk for server-side dedup ──
  const bulkCreateCases = async (rowData) => {
    try {
      const { created, updated } = await apiFetch("/cases/bulk", { method: "POST", body: rowData });
      // Reload full list to reflect server state
      const fresh = await apiFetch("/cases");
      setCases(fresh);
      const parts = [];
      if (created) parts.push(`${created} case${created === 1 ? "" : "s"} created`);
      if (updated) parts.push(`${updated} updated`);
      showToast(parts.join(", "));
      if (fresh.length) { setSelectedId(fresh[0].id); setPage("log"); setMobileView("detail"); }
    } catch(e) { showToast("Import failed: " + e.message); }
  };

  // ── Link / unlink related cases ──
  const linkRelatedCase = async (aId, bId) => {
    if (aId === bId) return;
    const caseA = cases.find(c => c.id === aId);
    const caseB = cases.find(c => c.id === bId);
    if (!caseA || !caseB) return;
    try {
      const [updA, updB] = await Promise.all([
        apiFetch(`/cases/${aId}`, { method: "PATCH", body: { relatedCaseIds: [...new Set([...(caseA.relatedCaseIds||[]), bId])] }}),
        apiFetch(`/cases/${bId}`, { method: "PATCH", body: { relatedCaseIds: [...new Set([...(caseB.relatedCaseIds||[]), aId])] }}),
      ]);
      setCases(prev => prev.map(c => c.id === aId ? { ...c, ...updA } : c.id === bId ? { ...c, ...updB } : c));
    } catch(e) { showToast("Link failed: " + e.message); }
  };

  const unlinkRelatedCase = async (aId, bId) => {
    const caseA = cases.find(c => c.id === aId);
    const caseB = cases.find(c => c.id === bId);
    if (!caseA || !caseB) return;
    try {
      const [updA, updB] = await Promise.all([
        apiFetch(`/cases/${aId}`, { method: "PATCH", body: { relatedCaseIds: (caseA.relatedCaseIds||[]).filter(r => r !== bId) }}),
        apiFetch(`/cases/${bId}`, { method: "PATCH", body: { relatedCaseIds: (caseB.relatedCaseIds||[]).filter(r => r !== aId) }}),
      ]);
      setCases(prev => prev.map(c => c.id === aId ? { ...c, ...updA } : c.id === bId ? { ...c, ...updB } : c));
    } catch(e) { showToast("Unlink failed: " + e.message); }
  };

  // ── Attachments ──
  const handleFiles = async (files) => {
    if (!selected || !files?.length) return;
    setUploading(true);
    const newAttachments = [];
    for (const file of Array.from(files)) {
      if (file.size > 20 * 1024 * 1024) { showToast(`"${file.name}" too large (max 20MB)`); continue; }
      try {
        const data = await new Promise((res, rej) => {
          const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file);
        });
        const attId = uid();
        const att = await apiFetch(`/cases/${selected.id}/attachments`, {
          method: "POST",
          body: { attId, name: file.name, type: file.type || "application/octet-stream", size: file.size, data, addedAt: new Date().toISOString() },
        });
        newAttachments.push(att);
      } catch(e) { showToast(`Couldn't attach "${file.name}": ${e.message}`); }
    }
    if (newAttachments.length) {
      setCases(prev => prev.map(c => c.id === selected.id
        ? { ...c, attachments: [...(c.attachments||[]), ...newAttachments] } : c));
      showToast(`${newAttachments.length === 1 ? "Attachment" : `${newAttachments.length} attachments`} added`);
    }
    setUploading(false);
  };

  const removeAttachment = async (attId) => {
    if (!selected) return;
    try {
      await apiFetch(`/cases/${selected.id}/attachments/${attId}`, { method: "DELETE" });
      setCases(prev => prev.map(c => c.id === selected.id
        ? { ...c, attachments: (c.attachments||[]).filter(a => a.attId !== attId) } : c));
    } catch(e) { showToast("Remove failed: " + e.message); }
  };

  const openAttachment = async (attId, name) => {
    try {
      const att = await apiFetch(`/cases/${selected.id}/attachments/${attId}`);
      const a = document.createElement("a"); a.href = att.data; a.download = name; a.target = "_blank";
      document.body.appendChild(a); a.click(); a.remove();
    } catch(e) { showToast("Couldn't load attachment"); }
  };

  const directory = buildDirectory(cases);

  return (
    <div style={{ fontFamily:"'IBM Plex Sans', sans-serif", background: PAPER, color: INK,
      minHeight:"640px", height:"100%", display:"flex", flexDirection:"column",
      borderRadius:"12px", overflow:"hidden", border:`1px solid ${LINE}`, position:"relative" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
        * { box-sizing: border-box; }
        .cl-scroll::-webkit-scrollbar { width: 6px; }
        .cl-scroll::-webkit-scrollbar-thumb { background: #D8D6D2; border-radius: 4px; }
        .cl-row:hover { background: #FAF6F2 !important; }
        .cl-btn-primary:hover { background: ${ACCENT_DARK} !important; }
        .cl-btn-ghost:hover { background: #ECECEA !important; }
        .cl-nav-tab:hover { color: #fff !important; }
        .cl-input:focus, .cl-textarea:focus, .cl-select:focus { outline:none; border-color:${ACCENT}!important; box-shadow:0 0 0 3px rgba(250,102,15,0.12); }
        .cl-dropzone.dragover { border-color: ${ACCENT}!important; background: ${ACCENT_SOFT}!important; }
        .cl-chip:hover { border-color: ${ACCENT}!important; }
        .cl-letter:hover:not(:disabled) { border-color: ${ACCENT}!important; color: ${ACCENT}!important; }
        .cl-cust-row:hover { background: ${ACCENT_SOFT}!important; }
        @media (max-width: 760px) {
          .cl-sidebar { width:100%!important; border-right:none!important; }
          .cl-detail  { width:100%!important; }
          .cl-hide-mobile { display:none!important; }
        }
        @media (min-width:761px) { .cl-back-btn { display:none!important; } }
        @keyframes cl-spin { to { transform: rotate(360deg); } }
      `}</style>

      {apiError && (
        <div style={{ padding:"10px 18px", background:"#D7263D", color:"#fff", fontSize:"13px",
          display:"flex", alignItems:"center", gap:"10px" }}>
          <span style={{ fontWeight:700 }}>⚠ Backend unreachable:</span> {apiError}.
          Make sure the server is running at <code style={{ background:"rgba(255,255,255,0.2)", padding:"1px 6px", borderRadius:"4px" }}>{API}</code>
          — see <strong>README.md</strong> for setup instructions.
        </div>
      )}

      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", gap:"12px", padding:"12px 18px",
        borderBottom:`3px solid ${ACCENT}`, background: HEADER_BG, color:"#fff", flexWrap:"wrap" }}>
        <span style={{ fontFamily:"'Space Grotesk',sans-serif", fontWeight:700, fontSize:"19px", letterSpacing:"0.02em" }}>
          Case Log
        </span>
        <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:"11px", color:"#A3A3A1" }}>
          {cases.length} {cases.length===1?"case":"cases"}
        </span>

        <div style={{ display:"flex", gap:"4px" }}>
          {[["log","Cases",LayoutList],["directory","Customer Directory",BookOpenText],["import","Import Excel",Table2]].map(([p,label,Icon]) => (
            <button key={p} className="cl-nav-tab" onClick={() => setPage(p)}
              style={{ display:"flex", alignItems:"center", gap:"5px",
                background: page===p ? ACCENT : "transparent",
                color: page===p ? "#fff" : "#C7C7C5",
                border:"none", borderRadius:"7px", padding:"7px 11px",
                fontSize:"12.5px", fontWeight:600, fontFamily:"inherit", cursor:"pointer", transition:"background 0.15s, color 0.15s" }}>
              <Icon size={14}/> {label}
            </button>
          ))}
        </div>

        {page === "log" && <>
          <div style={{ flex:1, minWidth:"180px", position:"relative" }}>
            <Search size={15} style={{ position:"absolute", left:"10px", top:"50%", transform:"translateY(-50%)", color: MUTED }}/>
            <input className="cl-input" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search account, subject, ServiceNow ID…"
              style={{ width:"100%", padding:"8px 10px 8px 32px", borderRadius:"8px",
                border:`1px solid ${LINE}`, background:"#fff", fontSize:"13px", fontFamily:"inherit", color: INK }}/>
          </div>
          <button className="cl-btn-primary" onClick={() => { setShowNew(true); setDraft(emptyCase()); setMobileView("detail"); }}
            style={{ display:"flex", alignItems:"center", gap:"5px", background: ACCENT, color:"#fff",
              border:"none", borderRadius:"8px", padding:"8px 13px", fontSize:"13px", fontWeight:600,
              fontFamily:"inherit", cursor:"pointer", transition:"background 0.15s", whiteSpace:"nowrap" }}>
            <Plus size={15}/> New case
          </button>
        </>}
        {page === "directory" && <div style={{ flex:1 }}/>}
      </div>

      {/* Body */}
      {page === "log" ? (
        <div style={{ display:"flex", flex:1, minHeight:0 }}>
          {/* Sidebar */}
          <div className={`cl-sidebar cl-scroll ${mobileView==="detail" ? "cl-hide-mobile" : ""}`}
            style={{ width:"290px", flexShrink:0, borderRight:`1px solid ${LINE}`,
              overflowY:"auto", background: CARD, display:"flex", flexDirection:"column" }}>
            {!loaded && <div style={{ padding:"20px", color: MUTED, fontSize:"13px" }}>Loading…</div>}
            {loaded && filtered.length === 0 && (
              <div style={{ padding:"32px 16px", color: MUTED, fontSize:"13px", textAlign:"center" }}>
                {cases.length === 0
                  ? <><div style={{ fontSize:"28px", marginBottom:"8px" }}>🗂️</div>No cases yet.<br/>Click <b>New case</b> to start.</>
                  : <>No cases match "{search}".</>}
              </div>
            )}
            {filtered.map(c => {
              const pr = priorityMeta(c.priority);
              const isSelected = c.id === selectedId && !showNew;
              return (
                <div key={c.id} className="cl-row"
                  onClick={() => { setShowNew(false); setSelectedId(c.id); setMobileView("detail"); }}
                  style={{ padding:"11px 12px", cursor:"pointer", borderBottom:`1px solid ${LINE}`,
                    background: isSelected ? ACCENT_SOFT : "transparent", borderLeft:`4px solid ${pr.color}` }}>
                  <div style={{ display:"flex", justifyContent:"space-between", gap:"6px" }}>
                    <span style={{ fontWeight:600, fontSize:"13px", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                      {c.account || c.contact || "Untitled"}
                    </span>
                    <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:"11px", color: MUTED, flexShrink:0 }}>
                      №{pad4(c.number)}
                    </span>
                  </div>
                  <div style={{ fontSize:"12px", color:"#4A5560", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", marginTop:"2px" }}>
                    {c.subject || "(no subject)"}
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:"6px", marginTop:"5px", flexWrap:"wrap" }}>
                    {c.priority && <span style={{ fontSize:"10px", fontWeight:700, color: pr.color, fontFamily:"'IBM Plex Mono',monospace" }}>{pr.short}</span>}
                    {c.serviceNowId && <span style={{ fontSize:"10px", color: MUTED, fontFamily:"'IBM Plex Mono',monospace" }}>{c.serviceNowId}</span>}
                    {c.caseReason && <span style={{ fontSize:"10px", color: MUTED }}>{c.caseReason}</span>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Detail panel */}
          <div className={`cl-detail cl-scroll ${mobileView==="list" ? "cl-hide-mobile" : ""}`}
            style={{ flex:1, overflowY:"auto", display:"block" }}>
            {showNew
              ? <NewCasePanel draft={draft} setDraft={setDraft}
                  onCancel={() => { setShowNew(false); setMobileView("list"); }}
                  onSave={createCase} nextNumber={counter} showToast={showToast}/>
              : selected
                ? <CaseDetailPanel key={selected.id} caseItem={selected} allCases={cases}
                    onUpdate={patch => updateCase(selected.id, patch)}
                    onDelete={() => deleteCase(selected.id)}
                    onBack={() => setMobileView("list")}
                    fileInputRef={fileInputRef}
                    onFiles={handleFiles} uploading={uploading}
                    onRemoveAttachment={removeAttachment}
                    onOpenAttachment={openAttachment}
                    onLinkCase={otherId => linkRelatedCase(selected.id, otherId)}
                    onUnlinkCase={otherId => unlinkRelatedCase(selected.id, otherId)}
                    onNavigateCase={goToCase}
                    showToast={showToast}/>
                : <div style={{ height:"100%", display:"flex", alignItems:"center", justifyContent:"center",
                    color: MUTED, fontSize:"14px", flexDirection:"column", gap:"8px", padding:"40px" }}>
                    <FileText size={32} style={{ opacity:0.35 }}/>
                    Select a case or create a new one.
                  </div>}
          </div>
        </div>
      ) : page === "import" ? (
        <ExcelImportPage cases={cases} onImport={bulkCreateCases} showToast={showToast}/>
      ) : (
        <CustomerDirectory directory={directory} activeLetter={directoryLetter}
          onSelectLetter={setDirectoryLetter}
          onViewAll={() => { setSearch(""); setPage("log"); setMobileView("list"); }}
          onSelectCustomer={(name, ids) => { setSearch(name); if (ids.length) goToCase(ids[0]); else setPage("log"); }}/>
      )}

      {toast && (
        <div style={{ position:"absolute", bottom:"16px", left:"50%", transform:"translateX(-50%)",
          background: INK, color:"#fff", padding:"8px 16px", borderRadius:"8px",
          fontSize:"13px", fontFamily:"inherit", boxShadow:"0 4px 16px rgba(0,0,0,0.18)", zIndex:50, whiteSpace:"nowrap" }}>
          {toast}
        </div>
      )}
    </div>
  );
}

// ── New Case Panel ────────────────────────────────────────────────────────────
function NewCasePanel({ draft, setDraft, onCancel, onSave, nextNumber, showToast }) {
  const applyPdf = (parsed) => setDraft(d => ({ ...d, ...parsed }));
  return (
    <div style={{ padding:"20px 22px 60px", maxWidth:"760px" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"16px" }}>
        <div>
          <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:"11px", color: MUTED }}>CASE №{pad4(nextNumber)}</div>
          <h2 style={{ fontFamily:"'Space Grotesk',sans-serif", fontSize:"19px", margin:"2px 0 0", fontWeight:700 }}>New case</h2>
        </div>
        <button className="cl-btn-ghost" onClick={onCancel}
          style={{ background:"transparent", border:`1px solid ${LINE}`, borderRadius:"8px", padding:"7px", cursor:"pointer", color: MUTED, display:"flex" }}>
          <X size={15}/>
        </button>
      </div>

      <PdfImport onApply={applyPdf} showToast={showToast} collapsible={false}/>

      <CaseForm data={draft} onChange={patch => setDraft(d => ({ ...d, ...patch }))}/>

      <div style={{ display:"flex", gap:"10px", marginTop:"16px" }}>
        <button className="cl-btn-primary" onClick={onSave}
          style={{ background: ACCENT, color:"#fff", border:"none", borderRadius:"8px",
            padding:"10px 18px", fontSize:"13.5px", fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}>
          Save case
        </button>
        <button className="cl-btn-ghost" onClick={onCancel}
          style={{ background:"transparent", border:`1px solid ${LINE}`, borderRadius:"8px",
            padding:"10px 18px", fontSize:"13.5px", fontWeight:600, cursor:"pointer", fontFamily:"inherit", color:"#4A5560" }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Case Detail Panel ─────────────────────────────────────────────────────────
function CaseDetailPanel({ caseItem, allCases, onUpdate, onDelete, onBack,
  fileInputRef, onFiles, uploading, onRemoveAttachment, onOpenAttachment,
  onLinkCase, onUnlinkCase, onNavigateCase, showToast }) {

  const [editing, setEditing]             = useState(false);
  const [localData, setLocalData]         = useState({ ...caseItem });
  const [savedData, setSavedData]         = useState({ ...caseItem });
  const [dragOver, setDragOver]           = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving]               = useState(false);
  const [relatedQuery, setRelatedQuery]   = useState("");
  const [relatedFocused, setRelatedFocused] = useState(false);

  // Reset when switching cases
  useEffect(() => {
    setEditing(false);
    setLocalData({ ...caseItem });
    setSavedData({ ...caseItem });
    setConfirmDelete(false);
    setRelatedQuery("");
  }, [caseItem.id]);

  // Sync read-only view when server data changes (link/unlink) but don't overwrite in-progress edits
  useEffect(() => {
    if (!editing) {
      setLocalData({ ...caseItem });
      setSavedData({ ...caseItem });
    }
  }, [caseItem.updatedAt]);

  const startEdit = () => {
    setSavedData({ ...caseItem });
    setLocalData({ ...caseItem });
    setEditing(true);
  };

  const discardEdit = () => {
    setLocalData({ ...savedData });
    setEditing(false);
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      await onUpdate(localData);
      setSavedData({ ...localData });
      setEditing(false);
      showToast("Case saved");
    } catch(e) {
      showToast("Save failed — please try again");
    } finally {
      setSaving(false);
    }
  };

  const applyPdf = (parsed) => {
    if (!editing) setEditing(true);
    setLocalData(d => ({ ...d, ...parsed }));
  };

  const relatedIds = caseItem.relatedCaseIds || [];
  const relatedCases = relatedIds.map(id => allCases.find(c => c.id === id)).filter(Boolean);
  const q = relatedQuery.trim().toLowerCase();
  const matches = q ? allCases.filter(c =>
    c.id !== caseItem.id && !relatedIds.includes(c.id) &&
    ((c.account||"").toLowerCase().includes(q) || (c.subject||"").toLowerCase().includes(q) ||
     (c.serviceNowId||"").toLowerCase().includes(q) || String(c.number).includes(q))
  ).slice(0, 6) : [];

  return (
    <div style={{ padding:"18px 22px 60px", maxWidth:"760px" }}>

      {/* Header row */}
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:"12px", marginBottom:"14px" }}>
        <div>
          <button onClick={onBack} className="cl-btn-ghost cl-back-btn"
            style={{ display:"inline-flex", alignItems:"center", gap:"4px", background:"transparent",
              border:"none", color: MUTED, fontSize:"12px", cursor:"pointer", padding:"0 0 4px", fontFamily:"inherit" }}>
            ← Back
          </button>
          <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:"11px", color: MUTED }}>
            CASE №{pad4(caseItem.number)} · {formatDate(caseItem.createdAt)}
          </div>
        </div>
        <div style={{ display:"flex", gap:"8px", alignItems:"center" }}>
          {!editing && (
            <button onClick={() => confirmDelete ? onDelete() : setConfirmDelete(true)}
              onBlur={() => setConfirmDelete(false)}
              style={{ display:"flex", alignItems:"center", gap:"5px",
                background: confirmDelete ? "#D7263D" : "transparent",
                border:`1px solid ${confirmDelete ? "#D7263D" : LINE}`,
                color: confirmDelete ? "#fff" : MUTED, borderRadius:"8px",
                padding:"7px 11px", fontSize:"12px", fontWeight:600, cursor:"pointer", fontFamily:"inherit", whiteSpace:"nowrap" }}>
              <Trash2 size={13}/> {confirmDelete ? "Confirm delete" : "Delete"}
            </button>
          )}
          {!editing ? (
            <button onClick={startEdit}
              style={{ display:"flex", alignItems:"center", gap:"5px", background: ACCENT, color:"#fff",
                border:"none", borderRadius:"8px", padding:"7px 14px",
                fontSize:"12px", fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}>
              ✏ Edit case
            </button>
          ) : (
            <>
              <button onClick={discardEdit}
                style={{ background:"transparent", border:`1px solid ${LINE}`, color:"#4A5560",
                  borderRadius:"8px", padding:"7px 12px", fontSize:"12px", fontWeight:600,
                  cursor:"pointer", fontFamily:"inherit" }}>
                ✕ Discard
              </button>
              <button onClick={saveEdit} disabled={saving}
                style={{ display:"flex", alignItems:"center", gap:"5px",
                  background: saving ? "#D8D6D2" : "#1A7A4A", color:"#fff", border:"none",
                  borderRadius:"8px", padding:"7px 14px", fontSize:"12px", fontWeight:600,
                  cursor: saving ? "default" : "pointer", fontFamily:"inherit", whiteSpace:"nowrap" }}>
                {saving
                  ? <><div style={{ width:12, height:12, border:"2px solid rgba(255,255,255,0.3)", borderTopColor:"#fff", borderRadius:"50%", animation:"cl-spin 0.7s linear infinite" }}/> Saving…</>
                  : "✓ Save changes"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Editing banner */}
      {editing && (
        <div style={{ display:"flex", alignItems:"center", gap:"10px", padding:"10px 14px",
          background:"#FFF8E6", border:`1px solid #F2A93B`, borderRadius:"8px",
          marginBottom:"14px", fontSize:"12.5px", color:"#7A5C00" }}>
          <span>✏</span>
          <span><strong>Editing mode</strong> — make your changes below, then click <strong>Save changes</strong> to confirm or <strong>Discard</strong> to cancel.</span>
        </div>
      )}

      {/* PDF Import */}
      <PdfImport onApply={applyPdf} showToast={showToast} collapsible={true}/>

      {/* Case fields — pass readOnly when not editing */}
      <CaseForm data={localData} onChange={patch => setLocalData(d => ({ ...d, ...patch }))} readOnly={!editing}/>

      {/* Sticky save bar */}
      {editing && (
        <div style={{ position:"sticky", bottom:"16px", display:"flex", justifyContent:"flex-end",
          gap:"8px", marginTop:"16px" }}>
          <button onClick={discardEdit}
            style={{ background:"#fff", border:`1px solid ${LINE}`, color:"#4A5560",
              borderRadius:"8px", padding:"9px 16px", fontSize:"13px", fontWeight:600,
              cursor:"pointer", fontFamily:"inherit", boxShadow:"0 2px 8px rgba(0,0,0,0.12)" }}>
            ✕ Discard
          </button>
          <button onClick={saveEdit} disabled={saving}
            style={{ background: saving ? "#D8D6D2" : "#1A7A4A", color:"#fff", border:"none",
              borderRadius:"8px", padding:"9px 16px", fontSize:"13px", fontWeight:600,
              cursor: saving ? "default" : "pointer", fontFamily:"inherit",
              boxShadow:"0 2px 8px rgba(0,0,0,0.18)", whiteSpace:"nowrap" }}>
            {saving ? "Saving…" : "✓ Save changes"}
          </button>
        </div>
      )}

      {/* Related Cases */}
      <div style={{ marginBottom:"20px" }}>
        <div style={{ fontFamily:"'Space Grotesk',sans-serif", fontWeight:700, fontSize:"13px",
          padding:"9px 13px", background: SECTION_BG, borderRadius:"10px 10px 0 0",
          border:`1px solid ${LINE}`, borderBottom:"none" }}>
          Related Cases {relatedCases.length ? `(${relatedCases.length})` : ""}
        </div>
        <div style={{ border:`1px solid ${LINE}`, borderRadius:"0 0 10px 10px", padding:"12px", background: CARD }}>
          <div style={{ position:"relative", marginBottom:"8px" }}>
            <Link2 size={14} style={{ position:"absolute", left:"10px", top:"50%", transform:"translateY(-50%)", color: MUTED }}/>
            <input className="cl-input" style={{ ...inputStyle, paddingLeft:"30px" }}
              value={relatedQuery} onChange={e => setRelatedQuery(e.target.value)}
              onFocus={() => setRelatedFocused(true)} onBlur={() => setTimeout(() => setRelatedFocused(false), 150)}
              placeholder="Link by account, subject, case #, or ServiceNow ID"/>
            {relatedFocused && matches.length > 0 && (
              <div style={{ position:"absolute", top:"calc(100% + 4px)", left:0, right:0, background:"#fff",
                border:`1px solid ${LINE}`, borderRadius:"8px", boxShadow:"0 6px 18px rgba(0,0,0,0.08)", zIndex:10, overflow:"hidden" }}>
                {matches.map(m => (
                  <div key={m.id} onClick={() => { onLinkCase(m.id); setRelatedQuery(""); }}
                    onMouseDown={e => e.preventDefault()}
                    style={{ padding:"8px 12px", cursor:"pointer", fontSize:"13px",
                      borderBottom:`1px solid ${LINE}`, display:"flex", alignItems:"center", gap:"8px" }}>
                    <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:"11px", color: priorityMeta(m.priority).color, fontWeight:700 }}>
                      №{pad4(m.number)}
                    </span>
                    <span style={{ fontWeight:600 }}>{m.account || m.contact || "Untitled"}</span>
                    <span style={{ color: MUTED, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>— {m.subject}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          {relatedCases.length > 0 ? (
            <div style={{ display:"flex", flexDirection:"column", gap:"6px" }}>
              {relatedCases.map(r => (
                <div key={r.id} className="cl-chip"
                  style={{ display:"flex", alignItems:"center", gap:"8px", padding:"8px 10px",
                    border:`1px solid ${LINE}`, borderRadius:"7px", background:"#fff", fontSize:"12.5px" }}>
                  <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:"11px", color: priorityMeta(r.priority).color, fontWeight:700, flexShrink:0 }}>
                    №{pad4(r.number)}
                  </span>
                  <div onClick={() => onNavigateCase(r.id)} style={{ flex:1, minWidth:0, cursor:"pointer" }}>
                    <div style={{ whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", fontWeight:500 }}>
                      {r.account || r.contact || "Untitled"} — {r.subject || "(no subject)"}
                    </div>
                    <div style={{ fontSize:"11px", color: MUTED }}>{statusMeta(r.status).label}</div>
                  </div>
                  <button onClick={() => onNavigateCase(r.id)}
                    style={{ background:"transparent", border:"none", color: ACCENT, cursor:"pointer", display:"flex", padding:"3px" }}>
                    <ArrowRight size={14}/>
                  </button>
                  <button onClick={() => onUnlinkCase(r.id)}
                    style={{ background:"transparent", border:"none", color:"#D7263D", cursor:"pointer", display:"flex", padding:"3px" }}>
                    <X size={14}/>
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize:"12px", color: MUTED, fontStyle:"italic" }}>
              Link this to a related or predecessor case.
            </div>
          )}
        </div>
      </div>

      {/* Attachments */}
      <div>
        <div style={{ fontFamily:"'Space Grotesk',sans-serif", fontWeight:700, fontSize:"13px",
          padding:"9px 13px", background: SECTION_BG, borderRadius:"10px 10px 0 0",
          border:`1px solid ${LINE}`, borderBottom:"none" }}>
          Attachments {caseItem.attachments?.length ? `(${caseItem.attachments.length})` : ""}
        </div>
        <div style={{ border:`1px solid ${LINE}`, borderRadius:"0 0 10px 10px", padding:"12px", background: CARD }}>
          <div className={`cl-dropzone ${dragOver ? "dragover" : ""}`}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); onFiles(e.dataTransfer.files); }}
            onClick={() => fileInputRef.current?.click()}
            style={{ border:`1.5px dashed ${LINE}`, borderRadius:"8px", padding:"18px",
              textAlign:"center", cursor:"pointer", color: MUTED, fontSize:"13px",
              background:"#FAFAF9", transition:"all 0.15s" }}>
            <Upload size={17} style={{ marginBottom:"5px" }}/>
            <div>{uploading ? "Uploading…" : "Drop files here or click to browse"}</div>
            <div style={{ fontSize:"11px", marginTop:"2px" }}>Max 4.5MB per file</div>
            <input ref={fileInputRef} type="file" multiple
              onChange={e => { onFiles(e.target.files); e.target.value = ""; }}
              style={{ display:"none" }}/>
          </div>
          {caseItem.attachments?.length > 0 && (
            <div style={{ marginTop:"8px", display:"flex", flexDirection:"column", gap:"5px" }}>
              {caseItem.attachments.map(a => (
                <div key={a.attId} style={{ display:"flex", alignItems:"center", gap:"8px",
                  padding:"8px 10px", border:`1px solid ${LINE}`, borderRadius:"7px", background:"#fff", fontSize:"12.5px" }}>
                  <FileText size={15} style={{ color: MUTED, flexShrink:0 }}/>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", fontWeight:500 }}>{a.name}</div>
                    <div style={{ fontSize:"11px", color: MUTED }}>{formatBytes(a.size)}</div>
                  </div>
                  <button onClick={() => onOpenAttachment(a.attId, a.name)}
                    style={{ background:"transparent", border:"none", color: ACCENT, cursor:"pointer", display:"flex", padding:"3px" }}>
                    <Download size={14}/>
                  </button>
                  <button onClick={() => onRemoveAttachment(a.attId)}
                    style={{ background:"transparent", border:"none", color:"#D7263D", cursor:"pointer", display:"flex", padding:"3px" }}>
                    <X size={14}/>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ fontSize:"10.5px", color: MUTED, marginTop:"14px", fontFamily:"'IBM Plex Mono',monospace" }}>
        Last updated {formatDate(caseItem.updatedAt)}
      </div>
    </div>
  );
}

// ── Customer Directory ────────────────────────────────────────────────────────
function CustomerDirectory({ directory, activeLetter, onSelectLetter, onSelectCustomer, onViewAll }) {
  const total = Object.values(directory).reduce((s, l) => s + l.length, 0);
  const allCustomers = Object.values(directory).flat().sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div style={{ flex:1, overflowY:"auto", padding:"22px" }} className="cl-scroll">
      <div style={{ marginBottom:"16px" }}>
        <h2 style={{ fontFamily:"'Space Grotesk',sans-serif", fontSize:"19px", fontWeight:700, margin:0 }}>Customer Directory</h2>
        <div style={{ fontSize:"13px", color: MUTED, marginTop:"3px" }}>
          {total} {total===1?"account":"accounts"} on file
        </div>
      </div>

      <div style={{ display:"flex", gap:"5px", flexWrap:"wrap", marginBottom:"18px", alignItems:"center" }}>
        {/* All button */}
        <button
          onClick={() => { onSelectLetter(null); }}
          style={{ height:"34px", padding:"0 10px", borderRadius:"7px",
            border:`1px solid ${!activeLetter ? ACCENT : LINE}`,
            background: !activeLetter ? ACCENT : "#fff",
            color: !activeLetter ? "#fff" : INK,
            fontFamily:"'Space Grotesk',sans-serif", fontWeight:700, fontSize:"13px",
            cursor:"pointer", transition:"all 0.12s" }}>
          All
        </button>

        <div style={{ width:"1px", height:"24px", background: LINE, margin:"0 2px" }}/>

        {LETTERS.map(letter => {
          const has = !!directory[letter]?.length;
          const isActive = activeLetter === letter;
          return (
            <button key={letter} className="cl-letter" disabled={!has}
              onClick={() => onSelectLetter(letter)}
              style={{ width:"34px", height:"34px", borderRadius:"7px",
                border:`1px solid ${isActive ? ACCENT : LINE}`,
                background: isActive ? ACCENT : has ? "#fff" : "#F5F5F4",
                color: isActive ? "#fff" : has ? INK : "#C7C7C5",
                fontFamily:"'Space Grotesk',sans-serif", fontWeight:700, fontSize:"13px",
                cursor: has ? "pointer" : "default", transition:"all 0.12s" }}>
              {letter}
            </button>
          );
        })}
      </div>

      {/* All accounts view */}
      {!activeLetter && (
        <div>
          {total === 0 ? (
            <div style={{ color: MUTED, fontSize:"13.5px", padding:"30px 0", textAlign:"center" }}>
              No accounts yet — cases you create will appear here.
            </div>
          ) : (
            <>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"12px" }}>
                <div style={{ fontFamily:"'Space Grotesk',sans-serif", fontSize:"15px", fontWeight:700, color: INK }}>
                  All Accounts
                </div>
                <button onClick={onViewAll}
                  style={{ display:"flex", alignItems:"center", gap:"5px", background:"transparent",
                    border:`1px solid ${LINE}`, borderRadius:"7px", padding:"6px 12px",
                    fontSize:"12px", fontWeight:600, color: ACCENT, cursor:"pointer", fontFamily:"inherit" }}>
                  View all cases <ArrowRight size={13}/>
                </button>
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:"7px" }}>
                {allCustomers.map(cust => (
                  <CustomerRow key={cust.name} cust={cust} onSelect={onSelectCustomer}/>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Filtered by letter */}
      {activeLetter && (
        <div>
          <div style={{ fontFamily:"'Space Grotesk',sans-serif", fontSize:"26px", fontWeight:700, color: ACCENT, marginBottom:"10px" }}>
            {activeLetter}
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:"7px" }}>
            {(directory[activeLetter]||[]).map(cust => (
              <CustomerRow key={cust.name} cust={cust} onSelect={onSelectCustomer}/>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CustomerRow({ cust, onSelect }) {
  return (
    <div className="cl-cust-row"
      onClick={() => onSelect(cust.name, cust.ids)}
      style={{ display:"flex", alignItems:"center", gap:"10px", padding:"11px 13px",
        background: CARD, border:`1px solid ${LINE}`, borderRadius:"8px",
        cursor:"pointer", transition:"background 0.12s" }}>
      <div style={{ width:"32px", height:"32px", borderRadius:"7px", background: ACCENT_SOFT,
        color: ACCENT, display:"flex", alignItems:"center", justifyContent:"center",
        fontFamily:"'Space Grotesk',sans-serif", fontWeight:700, fontSize:"14px", flexShrink:0 }}>
        {cust.name[0].toUpperCase()}
      </div>
      <div style={{ flex:1, fontWeight:600, fontSize:"13.5px" }}>{cust.name}</div>
      <div style={{ fontSize:"12px", color: MUTED, fontFamily:"'IBM Plex Mono',monospace", flexShrink:0 }}>
        {cust.ids.length} {cust.ids.length===1?"case":"cases"}
      </div>
      <ArrowRight size={14} color={MUTED}/>
    </div>
  );
}
