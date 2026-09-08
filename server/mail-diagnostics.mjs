const stages={
  MAIL_FLOW_URL_INVALID:'flow_url',
  MANAGED_IDENTITY_UNAVAILABLE:'identity_settings',
  MANAGED_IDENTITY_URL_INVALID:'identity_settings',
  MANAGED_IDENTITY_TOKEN_FAILED:'identity_token',
  MANAGED_IDENTITY_REQUEST_FAILED:'identity_token',
  MANAGED_IDENTITY_RESPONSE_INVALID:'identity_token',
  MANAGED_IDENTITY_TOKEN_MISSING:'identity_token',
};
export class MailDiagnosticError extends Error {
  constructor(code,httpStatus) {super(code);this.httpStatus=httpStatus;}
}
export function safeMailDiagnostic(error) {
  // Never return provider bodies, arbitrary exception messages, URLs or tokens.
  const code=error instanceof MailDiagnosticError && stages[error.message]?error.message:'MAIL_INTERNAL_ERROR';
  const result={stage:stages[code]||'mail_server',code};
  if(error instanceof MailDiagnosticError && Number.isInteger(error.httpStatus) && error.httpStatus>=100 && error.httpStatus<=599) result.httpStatus=error.httpStatus;
  return result;
}
