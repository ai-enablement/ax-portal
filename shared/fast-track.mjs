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
  return fields.filter(([key]) => !String(ardLite?.[key] || "").trim()).map(([, label]) => label);
}

export function isFastTrack(state) {
  return state?.fastTrack?.requested === true;
}
