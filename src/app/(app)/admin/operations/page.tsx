import Link from "next/link";
import { pageUser } from "@/server/page-guard";
import { operationsOverview } from "@/server/operations";
import { Card, PageHeader, Stat, Empty } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms";
import { operationAction } from "./actions";
export const metadata = { title: "Operations" };
export default async function Operations() {
  const data = await operationsOverview(await pageUser("settings:manage"));
  return <><PageHeader title="Operations" subtitle="Investigate failed background work and verify historical files. Refresh to see worker progress." />
    <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4"><Stat value={data.failed} label="Failed jobs" tone={data.failed ? "danger" : "default"} /><Stat value={data.overdue} label="Jobs delayed over 5 minutes" /><Stat value={data.scanning} label="Files awaiting scan" /><Stat value={data.infected} label="Files blocked by validation" /></div>
    <div className="space-y-6"><Card title="Failed jobs (oldest 50)"><p className="mb-4 text-sm text-muted">Resolve the provider or scanner issue before retrying. Email retries may send a duplicate notification. Job payloads and provider error details are kept private.</p>
    {data.failures.length ? data.failures.map(job => <div key={job.id} className="mb-4 border-b border-line pb-4"><p className="mb-2 text-sm">{job.type} · {job.attempts} attempts</p><ActionForm action={operationAction}><input type="hidden" name="id" value={job.id} /><input type="hidden" name="operation" value="retry" /><SubmitButton variant="ghost">Retry failed job</SubmitButton></ActionForm></div>) : <Empty title="No failed jobs" />}</Card>
    <Card title="Historical files awaiting verification (oldest 50)"><p className="mb-4 text-sm text-muted">Verify each object’s existence, size and content type, then queue malware scanning. No file is marked clean by this action.</p>
    {data.historical.length ? data.historical.map(file => <div key={file.id} className="mb-4 border-b border-line pb-4"><Link href={`/tasks/${file.submission.taskId}`} className="link">{file.fileName}</Link><ActionForm action={operationAction}><input type="hidden" name="id" value={file.id} /><input type="hidden" name="operation" value="reconcile" /><SubmitButton variant="ghost">Verify and queue scan</SubmitButton></ActionForm></div>) : <Empty title="No unverified historical files" />}</Card></div></>;
}
