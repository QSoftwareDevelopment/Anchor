// components/project-card.tsx
import Link from "next/link";

export type ProjectRow = {
  id: string;
  name: string;
  status: string;
  kill_criteria: string | null;
  goals?: { outcome: string } | null;
  owner_name?: string | null;
  tasks: { id: string; status: string }[];
};

export default function ProjectCard({ project }: { project: ProjectRow }) {
  const done = project.tasks.filter((t) => t.status === "done").length;
  const open = project.tasks.filter(
    (t) => t.status === "planned" || t.status === "scheduled"
  ).length;

  return (
    <Link
      href={`/plan/projects/${project.id}`}
      className="block rounded-qa border border-qa-line bg-white p-4 transition-colors hover:border-qa-line-strong"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-semibold leading-snug">{project.name}</h3>
        <span className="shrink-0 rounded-full bg-qa-surface px-2.5 py-0.5 text-xs font-medium text-qa-text-2">
          {project.status}
        </span>
      </div>
      <p className="mt-1 text-sm text-qa-text-2">
        {project.goals?.outcome ? `${project.goals.outcome} · ` : ""}
        {project.owner_name ? `${project.owner_name} · ` : ""}
        <span className="font-mono">{done} done / {open} open</span>
      </p>
      {project.kill_criteria && (
        <p className="mt-2 text-xs text-qa-text-2">
          Kill criteria: {project.kill_criteria}
        </p>
      )}
    </Link>
  );
}
