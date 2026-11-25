// Bind an OKR editor to one workspace, assessment, HRBP and saved record version.
export function hrbpOkrSource(s,a){const e=a.hrbpOkrEvaluation;return JSON.stringify([s.pilotWorkspace?.id||'company',a.id,a.employeeId,a.hrbpId,a.assessmentScope,e?.at||'',e?.score??null]);}
