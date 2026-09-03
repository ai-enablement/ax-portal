"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, ChatCircleText, FileText, Plus, Trash } from "@phosphor-icons/react";
import { hydrateStandardDocuments, sectionHasContent, stageDocumentCodes, standardDocuments } from "../shared/standard-documents.mjs";
import type { DocumentField, FieldValue, StandardStageRecord } from "../shared/standard-documents.mjs";
import "./standard-documents.css";
import DirectStageDocuments from "./direct-stage-documents";
import DocumentContentEditor from "./document-content-editor";
import { contentText } from "../shared/document-content.mjs";
import type { OperationsProject } from "../shared/project-classification.mjs";

export default function StandardDocumentWorkspace({ project, stage, record, canEdit, onSave, onGallerySubmit, people = [] }: {
  project: OperationsProject & { no: string; name: string; intakeAnswers?: string[] };
  people?: {id:string;name:string}[];
  stage: number;
  record?: StandardStageRecord;
  canEdit: boolean;
  onGallerySubmit?: () => void;
  onSave: (record: StandardStageRecord) => Promise<boolean | void> | void;
}) {
  const [storedDraft, setDraft] = useState(() => hydrateStandardDocuments(stage, record, project));
  const draft = hydrateStandardDocuments(stage, storedDraft, project);
  const [code, setCode] = useState(stageDocumentCodes[stage][0]);
  const [active, setActive] = useState<number | null>(null);
  const [selectedField, setSelectedField] = useState("");
  const [answer, setAnswer] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [dirty, setDirty] = useState(false);
  const [uploads, setUploads] = useState(0);
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (stage === 5 || stage === 7) return;
    if (active !== null) panel.current?.querySelector(".standard-active-section")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    else panel.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [active, stage]);
  const definition = standardDocuments[code];
  const document = draft.documents[code];
  const completed = definition.sections.filter((section) => document.completedSections.includes(section.id)).length;
  const progress = Math.round(completed / definition.sections.length * 100);
  const section = active === null ? null : definition.sections[active];
  const guideFields = section?.fields.filter((field) => ["text", "textarea", "date", "select"].includes(field.kind)) || [];
  const fieldKey = selectedField || (guideFields[0] && `${section!.id}.${guideFields[0].id}`) || "";
  const fieldLabel = guideFields.find((field) => `${section?.id}.${field.id}` === fieldKey)?.label || "";

  const updateField = (key: string, value: FieldValue) => {
    setDraft((previous) => {
      const doc = previous.documents[code];
      return { ...previous, documents: { ...previous.documents, [code]: { ...doc, fields: { ...doc.fields, [key]: value }, status: "draft", completedSections: doc.completedSections.filter((id) => !key.startsWith(`${id}.`)) } } };
    });
    setDirty(true); setFeedback("");
  };
  const selectSection = (index: number) => { setActive(active === index ? null : index); setSelectedField(""); setAnswer(""); };
  const save = async (complete: boolean) => {
    if (uploads) { setFeedback("파일 업로드가 끝난 뒤 저장해 주세요."); return; }
    const allValid = definition.sections.every((item) => sectionHasContent(item, document.fields));
    if (complete && !allValid) { setFeedback("각 항목을 모두 입력해 주세요. 해당하지 않는 항목은 ‘해당 없음’과 사유를 적어 주세요."); return; }
    const next = structuredClone(draft);
    if (complete) { next.documents[code].status = "complete"; next.documents[code].completedSections = definition.sections.map((item) => item.id); }
    next.values = record?.values || [];
    next.status = stageDocumentCodes[stage].every((item) => next.documents[item].status === "complete") ? "complete" : "draft";
    next.updatedAt = new Date().toISOString();
    setSaving(true); setFeedback("");
    try {
      const success = await onSave(next);
      if (success === false) throw new Error("DB 저장에 실패했습니다. 입력 내용은 유지되어 다시 저장할 수 있습니다.");
      setDraft(next); setDirty(false); setFeedback(complete ? `${code} 문서를 저장했습니다.` : "임시 저장했습니다.");
    } catch (error) { setFeedback(error instanceof Error ? error.message : "저장하지 못했습니다."); }
    finally { setSaving(false); }
  };
  const sendAnswer = () => {
    if (!canEdit || !fieldKey || !answer.trim()) return;
    const text = answer.trim();
    const field = guideFields.find((item) => `${section!.id}.${item.id}` === fieldKey)!;
    if (field.kind === "select" && !field.options.includes(text)) { setFeedback("선택 항목은 왼쪽 목록에서 골라 주세요."); return; }
    if (field.kind === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(text)) { setFeedback("날짜는 YYYY-MM-DD 형식으로 입력해 주세요."); return; }
    updateField(fieldKey, text);
    setDraft((previous) => ({ ...previous, documents: { ...previous.documents, [code]: { ...previous.documents[code], messages: [...previous.documents[code].messages, { role: "user", text, field: fieldKey }, { role: "guide", text: `${fieldLabel} 항목에 반영했습니다. 저장 버튼을 눌러 DB에 보관하세요.`, field: fieldKey }] } } }));
    setAnswer("");
  };
  const renderField = (field: DocumentField, sectionId = section?.id || "") => {
    const key = `${sectionId}.${field.id}`;
    const value = document.fields[key];
    const id = `${project.no}-${code}-${key}`;
    if (code === "OPS" && sectionId === "owners" && ["type","track","autonomy","owner","operator","knowledgeOwner"].includes(field.id)) return <label className="standard-field" key={key} htmlFor={id}><span>{field.label}</span>{field.kind === "select" ? <select id={id} value={String(value || "")} disabled><option value="">원본 문서에서 선택해 주세요</option>{field.options.map(option => <option key={option}>{option}</option>)}</select> : <input id={id} readOnly value={String(value || "")} placeholder="원본에서 담당자를 지정해 주세요" />}<small>자동 연결 항목 · FEA / ARD / 프로젝트 배정 / DEP에서 변경합니다.</small></label>;
    if (code === "DEP" && key === "readiness.knowledgeOwner") {
      const name = contentText(value);
      return <label className="standard-field" key={key} htmlFor={id}><span>지식갱신 담당자</span><select id={id} value={name} disabled={!canEdit || saving} onChange={e=>updateField(key,e.target.value)}><option value="">담당자를 선택해 주세요</option>{name && !people.some(person=>person.name===name) && <option value={name}>{name} (기존 지정)</option>}{people.map(person=><option key={person.id} value={person.name}>{person.name}</option>)}</select><small>지정한 이름이 운영 대장에 자동 반영됩니다.</small></label>;
    }
    if (field.kind === "rich" || field.kind === "files" || (stage >= 5 && field.kind === "textarea")) return <DocumentContentEditor key={key} label={field.label} value={value} project={project.no} code={code} field={key} filesOnly={field.kind === "files"} disabled={!canEdit || saving} onChange={value=>updateField(key,value)} onBusy={busy=>setUploads(n=>Math.max(0,n+(busy?1:-1)))}/>;
    if (field.kind === "checklist") return <fieldset className="standard-checklist" key={key}><legend>{field.label}</legend>{field.options.map((label, i) => <label key={label}><input type="checkbox" disabled={!canEdit || saving} checked={Boolean((value as boolean[] || [])[i])} onChange={(event) => { const values = field.options.map((_, j) => Boolean((value as boolean[] || [])[j])); values[i] = event.target.checked; updateField(key, values); }} />{label}</label>)}</fieldset>;
    if (field.kind.endsWith("-table")) {
      const columns = field.kind === "change-table" ? ["변경번호", "일자", "유형", "변경 내용", "사유", "재평가 결과", "승인", "변경 전", "변경 후", "승인 근거"] : field.kind === "fr-table" ? ["ID", "기능", "입력 → 에이전트 행동 → 출력", "우선순위"] : ["실패 유형", "예시", "피해", "대응"];
      const rows = (Array.isArray(value) ? value : []) as Record<string, string>[];
      return <div key={key} className="standard-table-field"><b>{field.label}</b><div className="ard-table-wrap"><table className="ard-table"><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}<th>행</th></tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{columns.map((column) => <td key={column}>{column === "우선순위" ? <select aria-label={`${field.label} ${index + 1} ${column}`} disabled={!canEdit || saving} value={row[column] || ""} onChange={(e) => updateField(key, rows.map((r, i) => i === index ? { ...r, [column]: e.target.value } : r))}><option value="">선택</option>{["M", "S", "C"].map((p) => <option key={p}>{p}</option>)}</select> : <textarea aria-label={`${field.label} ${index + 1} ${column}`} disabled={!canEdit || saving} value={row[column] || ""} onChange={(e) => updateField(key, rows.map((r, i) => i === index ? { ...r, [column]: e.target.value } : r))} />}</td>)}<td><button type="button" aria-label={`${field.label} ${index + 1}행 삭제`} disabled={!canEdit || saving} onClick={() => updateField(key, rows.filter((_, i) => i !== index))}><Trash size={16} /></button></td></tr>)}</tbody></table></div>{canEdit && <button type="button" className="secondary" disabled={saving} onClick={() => updateField(key, [...rows, Object.fromEntries(columns.map((column) => [column, column === "ID" ? `FR-${String(rows.length + 1).padStart(2, "0")}` : ""]))])}><Plus size={15} /> 행 추가</button>}</div>;
    }
    return <label className="standard-field" key={key} htmlFor={id}><span>{field.label}</span>{field.kind === "select" ? <select id={id} disabled={!canEdit || saving} value={String(value || "")} onChange={(event) => updateField(key, event.target.value)}><option value="">선택해 주세요</option>{field.options.map((option) => <option key={option}>{option}</option>)}</select> : field.kind === "text" || field.kind === "date" ? <input id={id} type={field.kind} disabled={!canEdit || saving} value={String(value || "")} onChange={(event) => updateField(key, event.target.value)} /> : <textarea id={id} disabled={!canEdit || saving} value={String(value || "")} placeholder={`${field.label} 내용을 입력하세요.`} onChange={(event) => updateField(key, event.target.value)} />}</label>;
  };
  if (stage === 5 || stage === 7 || stage === 9) return <DirectStageDocuments
    project={project} stage={stage} draft={draft} code={code} canEdit={canEdit}
    onGallerySubmit={onGallerySubmit}
    saving={saving || uploads > 0} dirty={dirty} feedback={feedback} renderField={renderField}
    onCodeChange={setCode} onSave={save}
    onSectionComplete={(id) => {
      setDraft(previous => ({ ...previous, documents: { ...previous.documents, [code]: { ...previous.documents[code], completedSections: [...new Set([...previous.documents[code].completedSections, id])] } } }));
      setDirty(true);
    }}
  />;
  return <div className="standard-document-shell">
    {stageDocumentCodes[stage].length > 1 && <nav className="standard-document-tabs" aria-label="단계별 문서">{stageDocumentCodes[stage].map((item) => <button type="button" key={item} className={code === item ? "active" : ""} onClick={() => { setCode(item); setActive(null); setSelectedField(""); setAnswer(""); }}>{standardDocuments[item].title}[{item}]</button>)}</nav>}
    <div className="intake-result-layout draft standard-document-workspace">
      <section ref={panel} className="intake-document ard-document selectable-document" aria-label={`${definition.title} 표준 양식`}>
        <header><div><small>{project.no}-{code} · {code === "ARD" ? "AGENT REQUIREMENTS DEFINITION" : "STANDARD DOCUMENT"}</small><h3>{definition.title}[{code}]</h3><p>{code === "ARD" ? "G1 승인 범위를 개발·평가 가능한 요구사항으로 구체화합니다." : "원래 문서의 항목별로 작성하고 근거와 검토 내용을 함께 기록합니다."}</p></div><div><span className="pill purple">{canEdit ? dirty ? "작성 중 · 저장 필요" : document.status === "complete" ? "작성 완료" : "작성 중" : "조회 전용"}</span><strong>{progress}%</strong></div></header>
        {draft.legacyValues?.some(Boolean) && <details className="standard-legacy"><summary>기존 간이 양식 입력 내용 · 원본 보존</summary>{draft.legacyValues.map((text, index) => <p key={index}>{text || "미입력"}</p>)}<small>내용을 확인해 알맞은 표준 항목에 옮겨 작성해 주세요.</small></details>}
        <nav className="ard-section-nav" aria-label={`${code} 문서 항목`}>{definition.sections.map((item, index) => { const done = document.completedSections.includes(item.id); return <button type="button" key={item.id} className={active === index ? "active" : ""} aria-expanded={active === index} onClick={() => selectSection(index)}><span className={`section-check ${done ? "complete" : "pending"}`}>{done ? <Check size={14} weight="bold" /> : <FileText size={14} />}</span><div><small>{String(index + 1).padStart(2, "0")}</small><b>{item.title}</b><p>{item.description}</p></div><em>{done ? "작성 완료" : "입력 필요"}</em><ArrowRight size={14} /></button>; })}</nav>
        {section && <section className="standard-active-section" aria-label={section.title}><div className="ard-section-head"><span>{String(active! + 1).padStart(2, "0")}</span><div><b>{section.title}</b><small>{section.description}</small></div></div>{section.fields.map(field => renderField(field))}{canEdit && <button type="button" className="secondary" disabled={!sectionHasContent(section, document.fields) || saving} onClick={() => { setDraft((previous) => ({ ...previous, documents: { ...previous.documents, [code]: { ...previous.documents[code], completedSections: [...new Set([...previous.documents[code].completedSections, section.id])] } } })); setDirty(true); setActive(null); }}>이 항목 작성 완료</button>}</section>}
        <footer><span role="status">{feedback || (dirty ? "변경사항을 저장해 주세요." : "항목별 입력 내용과 작성 상태를 DB에 저장합니다.")}</span>{canEdit && <div><button type="button" className="secondary" disabled={saving} onClick={() => void save(false)}>{saving ? "저장 중…" : "임시 저장"}</button><button type="button" disabled={saving} onClick={() => void save(true)}>문서 작성 완료 <ArrowRight size={14} /></button></div>}</footer>
      </section>
      <aside className="intake-chat" aria-label="표준 문서 작성 가이드"><header><ChatCircleText size={30} weight="duotone" /><div><strong>{code === "ARD" ? "요구 정의 작성 가이드" : `${code} 작성 가이드`}</strong><small>항목 선택 → 답변 입력 → 문서에 반영</small></div></header><div className="chat-progress"><span style={{ width: `${progress}%` }} /></div><div className="intake-chat-history"><div className="chat-message agent"><small>작성 가이드</small><p>{section ? `${section.title}: ${section.description}. 아래에서 반영할 항목을 선택해 답변해 주세요.` : "왼쪽에서 작성할 항목을 선택해 주세요. 직접 입력하거나 이곳에 답변하면 해당 항목에 반영됩니다. 자동 분석이나 생성이 아닌 항목별 입력 도우미입니다."}</p></div>{document.messages.map((message, index) => <div key={index} className={`chat-message ${message.role === "user" ? "user" : "agent"}`}><small>{message.role === "user" ? "나" : "작성 가이드"}</small><p>{message.text}</p></div>)}{project.intakeAnswers?.some(Boolean) && <details className="standard-intake-reference"><summary>요구 접수서 참고</summary>{project.intakeAnswers.slice(0, 4).map((text, index) => text && <p key={index}>{text}</p>)}</details>}</div><footer><label className="standard-guide-target">반영할 항목<select value={fieldKey} disabled={!canEdit || !section || saving} onChange={(e) => setSelectedField(e.target.value)}>{!guideFields.length && <option value="">왼쪽 문서 항목을 선택하세요</option>}{guideFields.map((field) => <option key={field.id} value={`${section!.id}.${field.id}`}>{field.label}</option>)}</select></label><div><textarea aria-label="문서 항목 답변" value={answer} disabled={!canEdit || !fieldKey || saving} onChange={(e) => setAnswer(e.target.value)} placeholder="답변을 입력하세요" /><button type="button" aria-label="답변 반영" disabled={!canEdit || !fieldKey || !answer.trim() || saving} onClick={sendAnswer}><ArrowRight size={17} /></button></div></footer></aside>
    </div>
  </div>;
}
