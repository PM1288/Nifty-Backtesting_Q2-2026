/** Exports source rows, never only visible cells. Preserve zero and decimal strings. */
export function evidenceCsv(rows:Record<string,unknown>[]) {
 const keys=[...new Set(rows.flatMap(r=>Object.keys(r)))];
 const cell=(v:unknown)=>{let s=v==null?"":typeof v==="object"?JSON.stringify(v):String(v);if(/^[=+@\t\r-]/.test(s)&&!/^[-+]?\d+(\.\d+)?$/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
 return [keys.map(cell).join(","),...rows.map(r=>keys.map(k=>cell(r[k])).join(","))].join("\r\n");
}
