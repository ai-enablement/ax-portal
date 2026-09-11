export const isDraftProjectCode = code => /^DRAFT-[a-f0-9]{32}$/.test(String(code));
export const isProjectCode = code => /^\d{4}-\d{3,}$/.test(String(code)) || isDraftProjectCode(code);
export const projectCodeLabel = code => isDraftProjectCode(code) ? 'INT 작성 중 · 번호 미부여' : code;
