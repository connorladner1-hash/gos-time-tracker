// GOS Time Tracker — Daily Auto Email (server-side)
// Runs daily at midnight UTC (7 PM Central) via Vercel cron

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_KEY;

function localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function thisWeekRange() {
  const now = new Date();
  const ct = new Date(now.getTime() - 6*60*60*1000);
  const day = ct.getDay();
  const daysSinceMon = day === 0 ? 6 : day - 1;
  const mon = new Date(ct); mon.setDate(ct.getDate() - daysSinceMon);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  return { start: localDateStr(mon), end: localDateStr(sun) };
}
function fmtTime(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  let h = d.getHours(), m = d.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2,"0")} ${ampm}`;
}
function fmtDur(ms) {
  if (!ms || ms <= 0) return "0h 0m";
  const totalMin = Math.floor(ms / 60000);
  return `${Math.floor(totalMin/60)}h ${totalMin%60}m`;
}
function calcOvertimeWork(sessions, weekDays) {
  const FRI5PM_DAY = weekDays.find(d => new Date(d+"T12:00:00").getDay() === 5);
  const fri5pmTs = FRI5PM_DAY ? new Date(FRI5PM_DAY+"T17:00:00").getTime() : null;
  let regMs = 0, autoOtMs = 0;
  sessions.forEach(s => {
    if (!s.clock_in || !s.clock_out) return;
    const inTs = new Date(s.clock_in).getTime();
    const outTs = new Date(s.clock_out).getTime();
    const netMs = Math.max(0, outTs - inTs);
    if (!fri5pmTs) { regMs += netMs; return; }
    if (outTs <= fri5pmTs) { regMs += netMs; }
    else if (inTs >= fri5pmTs) { autoOtMs += netMs; }
    else { regMs += Math.max(0, fri5pmTs - inTs); autoOtMs += Math.max(0, outTs - fri5pmTs); }
  });
  const FORTY_MS = 40*3600000;
  let regularMs, weeklyOtMs;
  if (regMs > FORTY_MS) { regularMs = FORTY_MS; weeklyOtMs = regMs - FORTY_MS; }
  else { regularMs = regMs; weeklyOtMs = 0; }
  return { regularMs, otMs: autoOtMs + weeklyOtMs };
}
function calcOvertimeTravel(sessions, weekDays) {
  const FRI5PM_DAY = weekDays.find(d => new Date(d+"T12:00:00").getDay() === 5);
  const fri5pmTs = FRI5PM_DAY ? new Date(FRI5PM_DAY+"T17:00:00").getTime() : null;
  let regHrs = 0, autoOtHrs = 0;
  sessions.forEach(s => {
    const th = parseFloat(s.travel_hours) || 0;
    if (!th) return;
    const inTs = s.clock_in ? new Date(s.clock_in).getTime() : null;
    if (!fri5pmTs || !inTs) { regHrs += th; return; }
    if (inTs >= fri5pmTs) autoOtHrs += th; else regHrs += th;
  });
  const FORTY_HRS = 40;
  let regularHrs, weeklyOtHrs;
  if (regHrs > FORTY_HRS) { regularHrs = FORTY_HRS; weeklyOtHrs = regHrs - FORTY_HRS; }
  else { regularHrs = regHrs; weeklyOtHrs = 0; }
  return { regularHrs, otHrs: autoOtHrs + weeklyOtHrs };
}
function buildEmailBody(allData, employees, start, end) {
  const sd = new Date(start+"T00:00:00"), ed = new Date(end+"T23:59:59");
  const days = [];
  const cur = new Date(sd);
  while (cur <= ed) { days.push(localDateStr(cur)); cur.setDate(cur.getDate()+1); }
  const dayLabels = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const empMap = {};
  allData.forEach(r => {
    if (!empMap[r.employee_name]) empMap[r.employee_name] = {work:{},lunch:{},travel:{},sessions:[],issues:[]};
    const d = new Date(r.session_date+"T12:00:00");
    if (d < sd || d > ed) return;
    const k = r.session_date;
    if (!empMap[r.employee_name].work[k]) empMap[r.employee_name].work[k] = 0;
    if (!empMap[r.employee_name].lunch[k]) empMap[r.employee_name].lunch[k] = 0;
    if (!empMap[r.employee_name].travel[k]) empMap[r.employee_name].travel[k] = 0;
    if (r.clock_in && r.clock_out) {
      const ci = new Date(r.clock_in).getTime(), co = new Date(r.clock_out).getTime();
      empMap[r.employee_name].work[k] += Math.max(0, co - ci);
      empMap[r.employee_name].lunch[k] += (r.lunch_minutes || 0);
      empMap[r.employee_name].sessions.push(r);
    }
    if (r.travel_hours) empMap[r.employee_name].travel[k] += (parseFloat(r.travel_hours)||0);
  });
  const activeEmps = Object.keys(empMap);
  const inactiveEmps = employees.filter(e => !activeEmps.includes(e));
  inactiveEmps.forEach(e => { empMap[e] = {work:{},lunch:{},travel:{},sessions:[],issues:[]}; });
  const allEmps = [...activeEmps,...inactiveEmps].sort((a,b) => a.localeCompare(b));
  const COL=7, NAMECOL=20;
  const pad = (s,n) => String(s).slice(0,n).padEnd(n);
  const lpad = (s,n) => String(s).slice(0,n).padStart(n);
  const line = (char,len) => char.repeat(len);
  const TOTALW = NAMECOL+1+(COL+1)*days.length+COL+2;
  const sep = line("═",TOTALW), thin = line("─",TOTALW);
  const startFmt = new Date(start+"T12:00:00").toLocaleDateString([],{weekday:"long",month:"short",day:"numeric",year:"numeric"});
  const endFmt = new Date(end+"T12:00:00").toLocaleDateString([],{weekday:"long",month:"short",day:"numeric",year:"numeric"});
  const activeCount = allEmps.filter(e => activeEmps.includes(e)).length;
  let body = "";
  body += sep+"\n";
  body += "     GULF OFFICE SYSTEMS — WEEKLY TIMESHEET REPORT\n";
  body += `     Pay Period: ${startFmt} – ${endFmt}\n`;
  body += `     Generated: ${new Date().toLocaleString("en-US",{timeZone:"America/Chicago"})}\n`;
  body += `     Employees Reporting: ${activeCount} of ${allEmps.length}\n`;
  body += sep+"\n\n";
  const makeHeader = () => { let h=pad("Employee",NAMECOL)+" "; days.forEach(d=>{h+=lpad(d.slice(5),COL)+" ";}); h+=lpad("Total",COL); return h; };
  const makeSubHeader = () => { let h=pad("",NAMECOL)+" "; days.forEach(d=>{const dt=new Date(d+"T12:00:00"); h+=lpad(dayLabels[dt.getDay()],COL)+" ";}); h+=lpad("",COL); return h; };
  let companyNetMs=0,companyLunchMin=0,companyTH=0,companyRegMs=0,companyOtMs=0,companyRegTH=0,companyOtTH=0;
  const issues=[];
  // WORK HOURS
  body += "WORK HOURS\n"+makeSubHeader()+"\n"+makeHeader()+"\n"+thin+"\n";
  allEmps.forEach(name => {
    const em=empMap[name]; let row=pad(name,NAMECOL)+" "; let total=0;
    days.forEach(d=>{const ms=em.work[d]||0; total+=ms; row+=lpad(ms>0?fmtDur(ms):"—",COL)+" ";});
    row+=lpad(fmtDur(total),COL); companyNetMs+=total; body+=row+"\n";
  });
  body+=thin+"\n";
  let totRow=pad("TOTAL",NAMECOL)+" "; let grandTotal=0;
  days.forEach(d=>{let dt=0; allEmps.forEach(n=>{dt+=(empMap[n].work[d]||0);}); grandTotal+=dt; totRow+=lpad(dt>0?fmtDur(dt):"—",COL)+" ";});
  body+=totRow+lpad(fmtDur(grandTotal),COL)+"\n\n";
  // LUNCH HOURS
  body += "LUNCH HOURS\n"+makeSubHeader()+"\n"+makeHeader()+"\n"+thin+"\n";
  allEmps.forEach(name => {
    const em=empMap[name]; let row=pad(name,NAMECOL)+" "; let totalMin=0;
    days.forEach(d=>{const min=em.lunch[d]||0; totalMin+=min; row+=lpad(min>0?fmtDur(min*60000):"—",COL)+" ";});
    row+=lpad(fmtDur(totalMin*60000),COL); companyLunchMin+=totalMin; body+=row+"\n";
  });
  body+=thin+"\n";
  let lTotRow=pad("TOTAL",NAMECOL)+" "; let lGrand=0;
  days.forEach(d=>{let dt=0; allEmps.forEach(n=>{dt+=(empMap[n].lunch[d]||0);}); lGrand+=dt; lTotRow+=lpad(dt>0?fmtDur(dt*60000):"—",COL)+" ";});
  body+=lTotRow+lpad(fmtDur(lGrand*60000),COL)+"\n\n";
  // TRAVEL HOURS
  body += "TRAVEL HOURS\n"+makeSubHeader()+"\n"+makeHeader()+"\n"+thin+"\n";
  allEmps.forEach(name => {
    const em=empMap[name]; let row=pad(name,NAMECOL)+" "; let total=0;
    days.forEach(d=>{const hrs=em.travel[d]||0; total+=hrs; row+=lpad(hrs>0?hrs.toFixed(1)+"h":"—",COL)+" ";});
    row+=lpad(total>0?total.toFixed(1)+" hrs":"0 hrs",COL); companyTH+=total; body+=row+"\n";
  });
  body+=thin+"\n";
  let tTotRow=pad("TOTAL",NAMECOL)+" "; let tGrand=0;
  days.forEach(d=>{let dt=0; allEmps.forEach(n=>{dt+=(empMap[n].travel[d]||0);}); tGrand+=dt; tTotRow+=lpad(dt>0?dt.toFixed(1)+"h":"—",COL)+" ";});
  body+=tTotRow+lpad(tGrand.toFixed(1)+" hrs",COL)+"\n\n";
  // OVERTIME
  const OTCOL=10;
  const otHeader=pad("Employee",NAMECOL)+" "+lpad("Regular",OTCOL)+" "+lpad("Overtime",OTCOL)+" "+lpad("OT Hours",OTCOL);
  const otThin="─".repeat(NAMECOL+1+OTCOL+1+OTCOL+1+OTCOL+2);
  body+="OVERTIME (Work)\n"+otHeader+"\n"+otThin+"\n";
  allEmps.forEach(name=>{
    const em=empMap[name]; const {regularMs,otMs}=calcOvertimeWork(em.sessions,days);
    companyRegMs+=regularMs; companyOtMs+=otMs;
    if(regularMs===0&&otMs===0) return;
    body+=pad(name,NAMECOL)+" "+lpad(fmtDur(regularMs),OTCOL)+" "+lpad(fmtDur(otMs),OTCOL)+" "+lpad(fmtDur(otMs),OTCOL)+"\n";
  });
  body+=otThin+"\n"+pad("TOTAL",NAMECOL)+" "+lpad(fmtDur(companyRegMs),OTCOL)+" "+lpad(fmtDur(companyOtMs),OTCOL)+" "+lpad(fmtDur(companyOtMs),OTCOL)+"\n\n";
  body+="OVERTIME (Travel)\n"+otHeader+"\n"+otThin+"\n";
  allEmps.forEach(name=>{
    const em=empMap[name]; const {regularHrs,otHrs}=calcOvertimeTravel(em.sessions,days);
    companyRegTH+=regularHrs; companyOtTH+=otHrs;
    if(regularHrs===0&&otHrs===0) return;
    body+=pad(name,NAMECOL)+" "+lpad(regularHrs.toFixed(1)+"h",OTCOL)+" "+lpad(otHrs.toFixed(1)+"h",OTCOL)+" "+lpad(otHrs.toFixed(1)+"h",OTCOL)+"\n";
  });
  body+=otThin+"\n"+pad("TOTAL",NAMECOL)+" "+lpad(companyRegTH.toFixed(1)+"h",OTCOL)+" "+lpad(companyOtTH.toFixed(1)+"h",OTCOL)+" "+lpad(companyOtTH.toFixed(1)+"h",OTCOL)+"\n\n";
  // WEEKLY TOTALS
  body+=sep+"\n WEEKLY TOTALS\n"+thin+"\n";
  body+=` Total Regular Work Hours:    ${fmtDur(companyRegMs)}\n`;
  body+=` Total Overtime Work Hours:   ${fmtDur(companyOtMs)}\n`;
  body+=` Total Lunch Hours:           ${fmtDur(companyLunchMin*60000)}\n`;
  body+=` Total Regular Travel Hours:  ${companyRegTH.toFixed(1)} hrs\n`;
  body+=` Total Overtime Travel Hours: ${companyOtTH.toFixed(1)} hrs\n`;
  body+=` Employees Active This Week:  ${activeCount} of ${allEmps.length}\n`;
  body+=sep+"\n";
  return body;
}
async function sbGet(table, params="") {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
    headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" }
  });
  if (!r.ok) throw new Error(`Supabase GET ${table} failed: ${r.status}`);
  return r.json();
}
async function sbInsert(table, data) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", "Prefer": "return=representation" },
    body: JSON.stringify(data)
  });
  if (!r.ok) { const t = await r.text(); throw new Error(`Supabase INSERT ${table} failed: ${t}`); }
  return r.json();
}
async function sendEmail({ serviceId, templateId, publicKey, toEmail, csvContent, weekStart, weekEnd }) {
  const privateKey = process.env.EMAILJS_PRIVATE_KEY;
  const r = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      service_id: serviceId, template_id: templateId, user_id: publicKey, accessToken: privateKey,
      template_params: { to_email: toEmail, employee: "All Employees", week_start: weekStart, week_end: weekEnd, csv_data: csvContent, excel_link: "", sent_at: new Date().toLocaleString("en-US",{timeZone:"America/Chicago"}) }
    })
  });
  if (!r.ok) { const t = await r.text(); throw new Error(`EmailJS error ${r.status}: ${t}`); }
}
export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: "Unauthorized" });
  try {
    const { start, end } = thisWeekRange();
    const weekKey = start;
    let alreadySent = false;
    try { const existing = await sbGet("email_sends", `week_key=eq.${weekKey}&select=id`); alreadySent = existing.length > 0; } catch(e) {}
    if (alreadySent) return res.status(200).json({ message: `Already sent for week ${weekKey}.` });
    let emailCfg = { serviceId: process.env.EMAILJS_SERVICE_ID||"", templateId: process.env.EMAILJS_TEMPLATE_ID||"", publicKey: process.env.EMAILJS_PUBLIC_KEY||"", managerEmail: process.env.EMAILJS_TO_EMAIL||"", autoSendEnabled: true };
    try { const settings = await sbGet("email_settings","select=*&limit=1"); if(settings.length>0){ const s=settings[0]; emailCfg={serviceId:s.service_id||emailCfg.serviceId,templateId:s.template_id||emailCfg.templateId,publicKey:s.public_key||emailCfg.publicKey,managerEmail:s.manager_email||emailCfg.managerEmail,autoSendEnabled:s.auto_send_enabled!==false}; } } catch(e) {}
    if (!emailCfg.autoSendEnabled) return res.status(200).json({ message: "Auto-send disabled." });
    if (!emailCfg.serviceId||!emailCfg.templateId||!emailCfg.publicKey||!emailCfg.managerEmail) return res.status(400).json({ error: "EmailJS not configured." });
    const [sessions, employeeRows] = await Promise.all([
      sbGet("sessions", `session_date=gte.${start}&session_date=lte.${end}&order=session_date,employee_name`),
      sbGet("employees", "select=name&order=name")
    ]);
    const employees = employeeRows.map(e => e.name);
    const body = buildEmailBody(sessions, employees, start, end);
    await sendEmail({ serviceId: emailCfg.serviceId, templateId: emailCfg.templateId, publicKey: emailCfg.publicKey, toEmail: emailCfg.managerEmail, csvContent: body, weekStart: start, weekEnd: end });
    try { await sbInsert("email_sends", { week_key: weekKey, sent_at: new Date().toISOString(), session_count: sessions.length }); } catch(e) {}
    return res.status(200).json({ success: true, message: `Email sent to ${emailCfg.managerEmail}`, weekStart: start, weekEnd: end, sessionCount: sessions.length });
  } catch (err) {
    console.error("daily-email error:", err);
    return res.status(500).json({ error: err.message });
  }
}
