import { standardDocuments, stageDocumentCodes, sectionHasContent } from "../shared/standard-documents.mjs";

// Called inside the project transaction, after the project row has been locked.
// Keep each standard document and its versions separate; never replace a legacy version.
export async function persistStandardDocuments(client, project, stage, record, actorId) {
  const allowed = stageDocumentCodes[stage];
  if (!allowed || record.schemaVersion !== 2) return;
  for (const code of allowed) {
    const draft = record.documents?.[code];
    if (!draft) continue;
    const definition = standardDocuments[code];
    if (!draft.fields || typeof draft.fields !== "object" || Array.isArray(draft.fields)) throw new Error("Invalid standard document fields.");
    if (draft.status === "complete" && !definition.sections.every(section => sectionHasContent(section, draft.fields))) {
      throw new Error(`${code}: required document fields are incomplete.`);
    }
    const payload = JSON.stringify({ schemaVersion: 2, documentType: code, ...draft, legacyValues: record.legacyValues || record.values || [] });
    const status = draft.status === "complete" ? "completed" : "draft";
    const doc = (await client.query(
      `insert into agent_portal.documents
         (project_id,document_type,document_code,document_title,document_status,current_version,author_id)
       values ($1,$2,$3,$4,$5,1,$6)
       on conflict (project_id,document_type) do update set
         document_status=excluded.document_status,updated_at=now()
       returning id`,
      [project.id, code, `${project.project_code}-${code}`, definition.title, status, actorId],
    )).rows[0];
    const latest = (await client.query(
      `select version_number, structured_content=$2::jsonb as unchanged
       from agent_portal.document_versions where document_id=$1
       order by version_number desc limit 1`, [doc.id, payload],
    )).rows[0];
    if (latest?.unchanged) continue;
    const version = Number(latest?.version_number || 0) + 1;
    await client.query(
      `insert into agent_portal.document_versions
         (document_id,version_number,structured_content,change_summary,created_by)
       values ($1,$2,$3::jsonb,$4,$5)`,
      [doc.id, version, payload, `${code} 표준 양식 ${status === "completed" ? "작성 완료" : "임시 저장"}`, actorId],
    );
    await client.query(`update agent_portal.documents set current_version=$2,updated_at=now() where id=$1`, [doc.id, version]);
  }
}
