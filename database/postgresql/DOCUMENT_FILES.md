# Document attachments

Apply `20260903_document_files.sql` once as the schema owner in `hyebin_db` before deploying the attachment feature. The app role must not receive schema-owner or superuser privileges. This migration has not been applied by the UI work.

- File bytes: `agent_portal.document_files.content` (`bytea`). File name, MIME, size, project, document, field and uploader are stored alongside them.
- Document text, ordered content blocks, tables and file IDs remain in the existing project state and `document_versions.structured_content` (`jsonb`). File bytes are not duplicated in JSON or audit versions.
- Limit: 5 MiB/file, 100 MiB/project. PNG/JPEG/WebP may be displayed inline. PDF, DOCX, XLSX, PPTX, TXT and CSV are download-only. SVG, HTML, executables and other file types are rejected.
- Upload checks authenticated identity, assigned-developer/admin access, document stage, extension/signature and byte count. Downloads require current project-read access. Responses are private/no-store and nosniff.
- Removing a block removes the document reference, not the stored bytes. Previous document versions can still reference the file. Do not purge rows without an agreed retention policy and checking historical references. Files uploaded but not saved in a document also count toward the project quota.
- There is no malware scanning service integrated. Use your organization's endpoint scanning policies and add a quarantine/scanning service before broad external uploads. Office archive validation is a file-family check, not antivirus scanning.
- Include this table in PostgreSQL backup/restore and capacity monitoring. For large or frequent files, migrate the binary content to a private Azure Blob container and retain metadata/object keys in PostgreSQL. The download endpoint should continue to check project permission; do not expose a public blob URL.

References:
- https://www.postgresql.org/docs/current/datatype-binary.html
- https://learn.microsoft.com/en-us/azure/storage/blobs/storage-blobs-overview

Local QA at port 4182 is DB-disconnected. Its uploaded files are in process memory only and disappear on restart; this is not a production persistence test.
