export const FAST_TRACK_EXTERNAL_FACTORS = [
  { value: "AUDIT", label: "감사 대응" },
  { value: "REGULATION", label: "법규·제도 시행일" },
  { value: "CONTRACT", label: "외부 계약 마감" },
  { value: "OTHER_EXTERNAL", label: "기타 외부 기한" },
];

export const FAST_TRACK_STATUSES = {
  REQUESTED: "REQUESTED",
  QUALIFIED: "QUALIFIED",
  REJECTED: "REJECTED",
  GF_APPROVED: "GF_APPROVED",
  TEMPORARY: "TEMPORARY",
  REGULARIZED: "REGULARIZED",
};

export function fastTrackRequestGaps(fastTrack) {
  if (!fastTrack?.requested) return [];
  const factor = FAST_TRACK_EXTERNAL_FACTORS.some((item) => item.value === fastTrack.externalFactor);
  const deadline = /^\d{4}-\d{2}-\d{2}$/.test(String(fastTrack.externalDeadline || ""));
  return [
    ...(!factor ? ["외부 기한 유형"] : []),
    ...(!deadline ? ["외부 명시 기한"] : []),
    ...(!String(fastTrack.externalReason || "").trim() ? ["긴급 사유와 외부 근거"] : []),
  ];
}

export function ardLiteGaps(ardLite) {
  const fields = [
    ["definition", "한 줄 정의"],
    ["outOfScope", "Out of Scope"],
    ["autonomy", "자율성 수준"],
    ["successCriteria", "성공 기준"],
    ["prohibitedActions", "금칙 목록"],
    ["emergencyReasonAndDeadline", "긴급 사유와 기한"],
  ];
  return fields.filter(([key]) => !String(ardLite?.[key] || "").trim() || /^(미정|미입력|TBD|확인 필요|추후 작성)[.\s]*$/i.test(String(ardLite?.[key]||''))).map(([, label]) => label);
}

export function isFastTrack(state) {
  return state?.fastTrack?.requested === true;
}

export const ARD_LITE_SECTIONS = [
  ['definition','한 줄 정의'],['outOfScope','Out of Scope'],['autonomy','자율성 수준'],
  ['successCriteria','성공 기준'],['prohibitedActions','금칙 목록'],['emergencyReasonAndDeadline','긴급 사유와 기한'],
];
export const ARD_LITE_TEMPLATE = '# 최소 요구정의서 [ARD-Lite]\n\n'+ARD_LITE_SECTIONS.map(([,label],i)=>`## ${i+1}. ${label}\n\n`).join('\n');
export function parseArdLiteMarkdown(markdown) {
  const result={};let key=null;
  for(const line of markdown.replace(/\r\n/g,'\n').split('\n')) {
    const heading=line.match(/^#{1,2}\s+(.+)$/);
    if(heading){key=ARD_LITE_SECTIONS.find(([,label])=>heading[1].toLowerCase().includes(label.toLowerCase()))?.[0]||null;continue;}
    if(key)result[key]=[result[key]||'',line].join('\n').trim();
  }
  return result;
}
export function ardLiteDocumentComplete(project) {
  const record=project.markdownDocuments?.ARD_LITE?.phases?.fast_track_requirements;
  return Boolean(record?.id&&record.version>0&&record.status==='complete'&&!ardLiteGaps(project.ardLite).length);
}
