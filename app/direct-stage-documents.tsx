"use client";
import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { ArrowRight, CaretDown, Check, X } from "@phosphor-icons/react";
import { sectionHasContent, standardDocuments, stageDocumentCodes } from "../shared/standard-documents.mjs";
import type { DocumentField, StandardDocument, StandardStageRecord } from "../shared/standard-documents.mjs";
import "./direct-stage-documents.css";
import DocumentOutput from "./document-output";
import { contentText } from "../shared/document-content.mjs";

type Props = {
  project: { no: string; name: string; developerNames?: string[]; historicalDocuments?: Record<string, StandardStageRecord> };
  stage: number;
  draft: StandardStageRecord & { documents: Record<string, StandardDocument> };
  code: string;
  canEdit: boolean;
  allowPartialSave?: boolean;
  saving: boolean;
  dirty: boolean;
  feedback: string;
  renderField: (field: DocumentField, sectionId: string) => ReactNode;
  onCodeChange: (code: string) => void;
  onSave: (complete: boolean) => Promise<void>;
  onSectionComplete: (id: string) => void;
  onGallerySubmit?: () => void;
};

export default function DirectStageDocuments(props: Props) {
  const { project, stage, draft, code, canEdit, saving, dirty, feedback, renderField, onCodeChange, onSave, onSectionComplete } = props;
  const [expanded, setExpanded] = useState("architecture");
  const [preview, setPreview] = useState(false);
  const releaseDialog = useRef<HTMLDialogElement>(null);
  const referenceDialog = useRef<HTMLDialogElement>(null);
  const definition = standardDocuments[code];
  const document = draft.documents[code];
  const progress = (key: string) => Math.round(100 * standardDocuments[key].sections.filter(s => draft.documents[key].completedSections.includes(s.id)).length / standardDocuments[key].sections.length);
  const dep = draft.documents.DEP;
  const depChecks = Array.isArray(dep?.fields["readiness.checks"]) ? dep.fields["readiness.checks"] as boolean[] : [];
  const value = (key: string) => contentText(dep?.fields[key]) || "미입력";
  const switchDoc = (key: string) => { onCodeChange(key); setExpanded(standardDocuments[key].sections[0].id); };
  const legacy = draft.legacyValues?.some(Boolean) && <details className="direct-legacy"><summary>기존 입력 내용 보기 · 원본 보존</summary>{draft.legacyValues.map((v, i) => <p key={i}>{v || "미입력"}</p>)}</details>;
  const footer = <footer className="direct-savebar"><span role="status">{feedback || (dirty ? "변경사항이 있습니다. 저장해 주세요." : canEdit ? "개발 담당자 작성 문서 · 직접 입력 후 저장해 주세요." : "조회 전용 · 개발 담당자 작성 문서")}</span><div>{canEdit && <><button className="secondary" disabled={saving} onClick={() => void onSave(false)}>{saving ? "저장 중…" : "임시 저장"}</button><button className="primary" disabled={saving} onClick={() => void onSave(true)}>{props.allowPartialSave ? "이관 내용 저장" : "문서 작성 완료"}</button></>}{stage === 7 && <button className="secondary" disabled={saving} onClick={() => releaseDialog.current?.close()}>닫기</button>}</div></footer>;
  const tabs = <div className="direct-doc-tabs" role="tablist" aria-label={stage === 5 ? "설계·평가 산출문서" : stage === 9 ? "운영·개선 문서" : "배포·파일럿 문서"}>{stageDocumentCodes[stage].map((key, i) => <button key={key} role="tab" aria-selected={code === key} aria-controls={`direct-panel-${project.no}`} disabled={saving} className={key === code ? "active" : ""} onClick={() => switchDoc(key)}><span>{stage === 5 ? i + 1 : `${stage === 9 ? "⑦" : "⑥"}-${i + 1}`}</span><b>{standardDocuments[key].title}[{key}]</b>{stage === 5 && <small>{progress(key)}%</small>}</button>)}</div>;
  const sections = <div className={stage === 5 ? "direct-section-list" : "release-section-list"} id={`direct-panel-${project.no}`} role="tabpanel" aria-label={`${code} 입력 양식`}>
    {definition.sections.filter(section => code !== "OPS" || section.id !== "sunset" || document.fields["owners.status"] === "폐기").filter(section => code !== "CHG" || section.id === "history" || section.fields.some(f => Boolean(document.fields[`${section.id}.${f.id}`]))).map((section, i) => {
      const complete = document.completedSections.includes(section.id);
      const open = stage !== 5 || expanded === section.id;
      return <section className={`direct-section ${open ? "expanded" : ""}`} key={`${code}-${section.id}`}>
        {stage === 5 ? <button className="direct-section-toggle" aria-expanded={open} aria-controls={`section-${project.no}-${code}-${section.id}`} onClick={() => setExpanded(open ? "" : section.id)}><span className="section-number">{complete ? <Check size={16} /> : i + 1}</span><div><small>{String(i + 1).padStart(2, "0")}</small><b>{section.title}</b><p>{section.description}</p></div><em>{complete ? "작성 완료" : "작성 필요"}</em><CaretDown size={16} /></button> : <header className="release-section-heading"><span>{code === "DEP" ? String.fromCharCode(65 + i) : i + 1}</span><div><h3>{code === "DEP" ? ["배포 전 필수 확인", "배포 방식", "파일럿 결과 (G4 게이트)"][i] : section.title}</h3><p>{section.description}</p></div>{code === "DEP" && i === 0 && <b className="check-count">{depChecks.filter(Boolean).length} / 9 확인</b>}</header>}
        {open && <div className="direct-section-fields" id={`section-${project.no}-${code}-${section.id}`}>{code === "DEP" && section.id === "readiness" ? <>{section.fields.filter(field => field.kind === "checklist").map(field => renderField(field, section.id))}<details className="release-evidence"><summary>보안 검토·인수인계 확인 근거 입력</summary><div>{section.fields.filter(field => field.kind !== "checklist").map(field => renderField(field, section.id))}</div></details></> : section.fields.filter(field => field.id !== "rolloutPlan" || Boolean(document.fields[`${section.id}.${field.id}`])).map(field => renderField(field, section.id))}{canEdit && <button className="secondary section-complete" disabled={saving || !sectionHasContent(section, document.fields)} onClick={() => onSectionComplete(section.id)}>{complete ? "항목 작성 완료됨" : "이 항목 작성 완료"}</button>}</div>}
      </section>;
    })}
  </div>;
  if (stage === 9) return <div className="direct-stage-workspace"><section className="direct-workspace-card"><header className="direct-document-heading"><div><small>OPS · CHG · {project.no}</small><h2>{project.name}</h2><p>선택한 과제의 운영 기록과 개선 이력입니다.</p></div></header><div className="operations-gallery-bar"><div><b>운영·개선 문서</b><p>G4 승인 후 운영 상태인 과제에서 Gallery 등록을 신청할 수 있습니다.</p></div><button className="primary" disabled={!props.onGallerySubmit} onClick={props.onGallerySubmit}>Agent Gallery 등록 신청</button></div>{tabs}<div className="document-view-toggle"><button disabled={saving} onClick={()=>setPreview(!preview)}>{preview ? "문서 미리보기" : "작성·수정"}</button></div>{preview && canEdit ? sections : <DocumentOutput code={code} document={document}/>}<details className="direct-legacy"><summary>기존 상세 기록 · 원본 보존</summary>{legacy}{code==="CHG" && <DocumentOutput code="LEGACY" document={{...document,fields:Object.fromEntries(Object.entries(document.fields).filter(([key])=>!key.startsWith("history.")))}}/>}</details>{footer}</section></div>;
  if (stage === 5) return <div className="direct-stage-workspace">
    <div className="document-process"><div><span>기준</span><div><b>에이전트 요구사항 정의서[ARD]</b><small>범위·자율성·성공 기준·실패 시나리오</small></div></div><ArrowRight size={18}/><div className="parallel-docs"><small className="parallel-label">병렬</small>{["DES", "EVP"].map((key,i) => <div key={key}><span>{i+1}</span><div><b>{standardDocuments[key].title}[{key}]</b><small>{i === 0 ? "개발하며 계속 갱신" : "개발과 동시에 준비"}</small></div></div>)}</div><ArrowRight size={18}/><div><span>3</span><div><b>평가 결과 보고서[EVR]</b><small>1차 개발 완료 후 실행</small></div></div></div>
    <section className="direct-workspace-card"><header className="direct-workspace-heading"><div><small>PARALLEL DOCUMENT WORKSPACE</small><h2>설계·평가 산출문서</h2><p>에이전트 요구사항 정의서[ARD] 기준을 바꾸지 않고 설계서[DES]·평가 계획서[EVP]·평가 결과 보고서[EVR]를 병렬로 작성합니다.</p></div><button className="secondary" onClick={() => referenceDialog.current?.showModal()}>에이전트 요구사항 정의서[ARD] 기준 보기</button></header>{tabs}<header className="direct-document-heading"><div><span className="direct-status">{document.status === "complete" ? "작성 완료" : canEdit ? "작성 중" : "조회 전용"}</span><h3>{project.no}-{code} · {definition.title}[{code}]</h3><p>담당 {project.developerNames?.join(" · ") || "미배정"}{dirty ? " · 저장 필요" : ""}</p></div><strong>{progress(code)}%</strong></header>{legacy}{sections}{footer}</section>
    <dialog ref={referenceDialog} aria-label="에이전트 요구사항 정의서 기준" className="direct-reference-dialog"><header><h2>에이전트 요구사항 정의서[ARD] 기준</h2><button aria-label="ARD 기준 닫기" onClick={() => referenceDialog.current?.close()}><X size={20}/></button></header><div>{standardDocuments.ARD.sections.map(s => <section key={s.id}><h3>{s.title}</h3>{s.fields.map(f => { const saved = project.historicalDocuments?.["3"]?.documents?.ARD?.fields[`${s.id}.${f.id}`]; return <div key={f.id}><b>{f.label}</b><p>{Array.isArray(saved) ? saved.map(row => typeof row === "object" ? Object.values(row).join(" · ") : String(row)).join("\n") : String(saved || "미입력")}</p></div>; })}</section>)}</div></dialog>
  </div>;
  return <div className="direct-stage-workspace"><section className="direct-pilot-summary"><header><div><h2>배포 준비 · 파일럿 · 인수인계</h2><p>DEP A항목은 G3 이전에 완료하고, G3 승인 뒤 파일럿 결과와 운영 인수를 기록합니다.</p></div><span className="direct-status">파일럿 {draft.status === "complete" ? "작성 완료" : "진행"}</span></header><div className="pilot-checks">{[[0,"ARD 성공 기준 통과"],[3,"로그·모니터링 설정"],[4,"사용자 가이드[UG] 준비"],[8,"지식 최신성 책임자 지정"]].map(([index,label]) => <label key={index}><input type="checkbox" checked={Boolean(depChecks[Number(index)])} disabled/><div><b>{label}</b><small>{depChecks[Number(index)] ? "확인 완료" : "확인 필요"}</small></div></label>)}</div><dl className="pilot-metrics">{[["파일럿 대상","pilot.pilotAudience"],["기간","pilot.pilotPeriod"],["만족도","results.pilotSatisfaction"],["오류 신고","results.pilotErrors"]].map(([label,key]) => <div key={key}><dt>{label}</dt><dd>{value(key)}</dd></div>)}</dl><button className="pilot-open secondary" onClick={() => { switchDoc("DEP"); releaseDialog.current?.showModal(); }}>배포 체크리스트[DEP] · 사용자 가이드[UG] {canEdit ? "작성·수정" : "보기"}</button>{dirty && <p className="pilot-unsaved">저장하지 않은 변경사항이 있습니다. 문서에서 저장을 완료해 주세요.</p>}</section>
    <dialog ref={releaseDialog} aria-label="배포 체크리스트·사용자 가이드 편집" className="release-edit-dialog" onCancel={event => { if (saving) event.preventDefault(); }}><header className="release-dialog-heading"><div><small>{project.no} · RELEASE &amp; PILOT DOCUMENTS</small><h2>{definition.title}[{code}]</h2><p>{code === "DEP" ? "배포 준비 점검, 파일럿 결과와 인수인계 내용을 기록합니다." : "사용자에게 전달할 사용 범위, 방법과 문의 정보를 작성합니다."}</p></div><button aria-label="배포 문서 닫기" disabled={saving} onClick={() => releaseDialog.current?.close()}><X size={20}/></button></header>{tabs}<div className="document-view-toggle"><button disabled={saving} onClick={() => setPreview(!preview)}>{preview ? "작성 화면" : "문서 미리보기"}</button></div><div className="release-dialog-body">{legacy}{preview || !canEdit ? <DocumentOutput code={code} document={document}/> : sections}</div>{footer}</dialog>
  </div>;
}
