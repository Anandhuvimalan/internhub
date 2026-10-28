"use client";

import { useState, useSyncExternalStore } from "react";
import { ActionForm, SubmitButton } from "./forms";
import { submitTaskAction } from "@/app/actions";

const subscribe = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

type FileRef = { storageKey: string; fileName: string; sizeBytes: number; mimeType: string };

/**
 * Files go browser → object storage directly via a presigned URL issued by
 * /api/v1/tasks/:id/uploads; only the resulting key is sent with the form.
 */
export function SubmissionForm({ taskId, storageEnabled, resubmission }: { taskId: string; storageEnabled: boolean; resubmission: boolean }) {
  const ready = useSyncExternalStore(subscribe, clientReady, serverReady);
  const [files, setFiles] = useState<FileRef[]>([]);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onPick(list: FileList | null) {
    if (!list) return;
    if (files.length + list.length > 10) { setErr("Attach at most 10 files"); return; }
    setErr(null);
    setUploading(true);
    try {
      for (const f of Array.from(list)) {
        const res = await fetch(`/api/v1/tasks/${taskId}/uploads`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileName: f.name, mimeType: f.type || "application/octet-stream", sizeBytes: f.size }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error?.message ?? "Upload not allowed");
        const put = await fetch(body.uploadUrl, { method: "PUT", body: f, headers: { "Content-Type": f.type } });
        if (!put.ok) throw new Error(`Upload failed for ${f.name}`);
        setFiles((prev) => [...prev, { storageKey: body.storageKey, fileName: f.name, sizeBytes: f.size, mimeType: f.type }]);
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <ActionForm action={submitTaskAction}>
      <input type="hidden" name="taskId" value={taskId} />
      <input type="hidden" name="files" value={JSON.stringify(files)} />
      <label className="block">
        <span className="label">GitHub repository</span>
        <input name="githubUrl" className="input" placeholder="https://github.com/you/repo" />
      </label>
      <label className="block">
        <span className="label">Link (Drive, Power BI, deployed URL…)</span>
        <input name="linkUrl" className="input" placeholder="https://" />
      </label>
      {storageEnabled && (
        <div>
          <label htmlFor="submission-files" className="label">Files (max 50 MB each; downloads wait for malware scanning)</label>
          <input id="submission-files" type="file" multiple disabled={!ready || uploading} onChange={(e) => onPick(e.target.files)} className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-line file:bg-surface-2 file:px-3 file:py-1.5 file:text-sm" />
          <noscript><p>File uploads require JavaScript. You can still submit a link.</p></noscript>
          {uploading && <p className="mt-1 text-xs text-muted">Uploading…</p>}
          {files.map((f) => (
            <p key={f.storageKey} className="mt-1 text-xs text-ok">✓ {f.fileName}</p>
          ))}
          {err && <p role="alert" className="mt-1 text-xs text-danger">{err}</p>}
        </div>
      )}
      <label className="block">
        <span className="label">{resubmission ? "What did you change?" : "Notes for the reviewer"}</span>
        <textarea name="note" rows={3} className="input" />
      </label>
      <SubmitButton disabled={uploading} pendingLabel="Submitting…">{resubmission ? "Resubmit for review" : "Submit for review"}</SubmitButton>
    </ActionForm>
  );
}
