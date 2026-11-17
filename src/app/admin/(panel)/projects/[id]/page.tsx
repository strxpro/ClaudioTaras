import { notFound } from "next/navigation";
import crypto from "node:crypto";
import { db } from "@/lib/db";
import { getShots } from "@/lib/shots";
import type { Project } from "@/lib/types";
import { ProjectEditor } from "./project-editor";

function blank(): Project {
  return {
    id: `p-${crypto.randomUUID().slice(0, 8)}`,
    slug: "",
    name: "",
    client: "",
    year: new Date().getFullYear(),
    location: "",
    category: "website",
    status: "live",
    url: "",
    accent: "#2B2DF5",
    stack: [],
    tagline: {},
    summary: {},
    challenge: {},
    solution: {},
    role: {},
    features: [],
    results: [],
    media: { gallery: [] },
    featured: false,
    published: false,
    order: 999,
    updatedAt: new Date().toISOString(),
  };
}

export default async function EditProject({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = id === "new" ? blank() : await db.project(id);
  if (!project) notFound();
  const sh = id === "new" ? null : getShots(project);
  const preview = sh ? { shots: [...sh.desktop, ...sh.pages, ...sh.mobile, ...sh.extra], clips: sh.clips.length, logo: sh.logo?.src ?? null, logoTone: sh.logo?.tone ?? null } : null;
  return <ProjectEditor initial={project} isNew={id === "new"} preview={preview} />;
}
