import type { Request, Response } from "express";
import { supabase } from "../config/supabaseClient";
import { sendBatchProjectInvites } from "../services/emailService";

// ✅ OPTIMIZED: Reduced from 3-4 queries to 2 queries (most efficient for this use case)
export const listProjects = async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ success: false, message: "User not authenticated" });
  }

  // Query 1: Get projects owned by user
  const { data: ownedProjects, error: ownedError } = await supabase
    .from("projects")
    .select(`
      project_id,
      project_uuid,
      name,
      description,
      status,
      priority,
      start_date,
      end_date,
      owner_id,
      created_at
    `)
    .eq("owner_id", userId)
    .order("project_id", { ascending: true });

  if (ownedError) {
    return res.status(400).json({ success: false, error: ownedError });
  }

  // Query 2: Get projects where user is a member
  const { data: memberProjects, error: memberError } = await supabase
    .from("project_members")
    .select(`
      projects:project_uuid (
        project_id,
        project_uuid,
        name,
        description,
        status,
        priority,
        start_date,
        end_date,
        owner_id,
        created_at
      )
    `)
    .eq("user_id", userId);

  if (memberError) {
    return res.status(400).json({ success: false, error: memberError });
  }

  // Merge and deduplicate projects by UUID
  const projectMap = new Map<string, any>();

  // Add owned projects
  for (const project of ownedProjects || []) {
    projectMap.set(project.project_uuid, project);
  }

  // Add member projects (skip duplicates)
  for (const item of memberProjects || []) {
    const project = (item as any).projects;
    if (project && !projectMap.has(project.project_uuid)) {
      projectMap.set(project.project_uuid, project);
    }
  }

  // Get all unique project UUIDs
  const projectUuids = Array.from(projectMap.keys());

  if (projectUuids.length === 0) {
    return res.json({ success: true, projects: [] });
  }

  // Single batch query to get all members for all projects
  const { data: allMembers } = await supabase
    .from("project_members")
    .select("project_uuid, member_email")
    .in("project_uuid", projectUuids);

  // Group members by project_uuid
  const membersByProject = new Map<string, string[]>();
  for (const member of allMembers || []) {
    if (!membersByProject.has(member.project_uuid)) {
      membersByProject.set(member.project_uuid, []);
    }
    membersByProject.get(member.project_uuid)!.push(member.member_email);
  }

  // Transform response
  const projectsWithMembers = Array.from(projectMap.values()).map((project) => ({
    project_id: project.project_id,
    project_uuid: project.project_uuid,
    name: project.name,
    description: project.description,
    status: project.status,
    priority: project.priority,
    start_date: project.start_date,
    end_date: project.end_date,
    owner_id: project.owner_id,
    created_at: project.created_at,
    memberEmails: membersByProject.get(project.project_uuid) ?? [],
  }));

  // Sort by project_id
  projectsWithMembers.sort((a, b) => a.project_id - b.project_id);

  return res.json({ success: true, projects: projectsWithMembers });
};

// ✅ OPTIMIZED: Reduced from 3 queries to 1 query - Now uses UUID
export const getProjectById = async (req: Request, res: Response) => {
  const uuid = req.params.projectId; // This should be a UUID now
  const userId = req.user?.userId;

  if (!userId) {
    return res.status(401).json({ success: false, message: "User not authenticated" });
  }

  // Single query with authorization check using UUID
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select(`
      *,
      project_members(member_email, role, user_id)
    `)
    .eq("project_uuid", uuid)
    .single();

  if (projectError || !project) {
    return res.status(404).json({ success: false, message: "Project not found" });
  }

  // Check authorization in-memory (faster than DB query)
  const isOwner = project.owner_id === userId;
  const isMember = project.project_members?.some((m: any) => m.user_id === userId);

  if (!isOwner && !isMember) {
    return res.status(403).json({
      success: false,
      message: "Access denied. You are not a member of this project."
    });
  }

  // Transform response
  const projectWithMembers = {
    project_id: project.project_id,
    project_uuid: project.project_uuid,
    name: project.name,
    description: project.description,
    status: project.status,
    priority: project.priority,
    start_date: project.start_date,
    end_date: project.end_date,
    owner_id: project.owner_id,
    created_at: project.created_at,
    memberEmails: project.project_members?.map((m: any) => m.member_email).filter(Boolean) ?? [],
  };

  return res.json({ success: true, project: projectWithMembers });
};

// ✅ OPTIMIZED: Batch operations, proper error handling - Now with UUID
export const createProject = async (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  const userId = req.user?.userId;

  const memberEmailsRaw = body.memberEmails;
  const memberEmails =
    Array.isArray(memberEmailsRaw) && memberEmailsRaw.every((e) => typeof e === "string")
      ? Array.from(new Set(memberEmailsRaw.map((e) => e.trim().toLowerCase()).filter(Boolean)))
      : undefined;

  const { memberEmails: _ignored, ...projectPayload } = body;

  // Create project (UUID is auto-generated by database)
  const { data: projectRows, error: projectError } = await supabase
    .from("projects")
    .insert(projectPayload)
    .select();

  if (projectError) {
    return res.status(400).json({ success: false, error: projectError });
  }

  const project = projectRows?.[0] as {
    project_id?: number;
    project_uuid?: string;
    name?: string;
    description?: string
  } | undefined;

  const projectUuid = project?.project_uuid;

  if (!projectUuid) {
    return res.status(500).json({ success: false, message: "Project created but missing project_uuid" });
  }

  if (!memberEmails || memberEmails.length === 0) {
    return res.status(201).json({ success: true, project });
  }

  // ✅ OPTIMIZED: Single batch query instead of individual lookups
  const { data: users, error: usersError } = await supabase
    .from("users")
    .select("user_id,email")
    .in("email", memberEmails);

  if (usersError) {
    await supabase.from("projects").delete().eq("project_uuid", projectUuid);
    return res.status(400).json({ success: false, error: usersError });
  }

  const foundByEmail = new Map<string, number>();
  for (const u of users ?? []) {
    if (u?.email && u?.user_id) {
      foundByEmail.set(String(u.email).toLowerCase(), Number(u.user_id));
    }
  }

  // ✅ OPTIMIZED: Batch insert all members at once using UUID
  const memberRows = memberEmails.map((email) => ({
    project_id: project.project_id,  // Keep for backward compatibility
    project_uuid: projectUuid,        // Primary identifier
    user_id: foundByEmail.get(email) || null,
    member_email: email,
    role: "viewer" as const,
  }));

  const { error: membersError } = await supabase
    .from("project_members")
    .insert(memberRows);

  if (membersError) {
    await supabase.from("projects").delete().eq("project_uuid", projectUuid);
    return res.status(400).json({ success: false, error: membersError });
  }

  // ✅ Send emails asynchronously (non-blocking)
  if (memberEmails.length > 0) {
    const { data: inviter } = await supabase
      .from("users")
      .select("name, email")
      .eq("user_id", userId)
      .single();

    const inviterName = inviter?.name || inviter?.email || "A team member";

    sendBatchProjectInvites(memberEmails, {
      projectName: project.name || "Untitled Project",
      projectDescription: project.description,
      inviterName,
      projectId: projectUuid,
    }).catch((error) => {
      console.error("❌ Failed to send invitation emails:", error);
    });
  }

  return res.status(201).json({
    success: true,
    project,
    membersAdded: memberRows.length,
    emailsSent: memberEmails.length,
  });
};

// ✅ Update project using UUID
export const updateProject = async (req: Request, res: Response) => {
  const uuid = req.params.projectId; // This should be a UUID now
  const userId = req.user?.userId;
  const body = req.body as Record<string, unknown>;

  if (!userId) {
    return res.status(401).json({ success: false, message: "User not authenticated" });
  }

  // First, verify the project exists and user has permission
  const { data: existingProject, error: checkError } = await supabase
    .from("projects")
    .select("project_id, project_uuid, owner_id, name, description")
    .eq("project_uuid", uuid)
    .single();

  if (checkError || !existingProject) {
    return res.status(404).json({ success: false, message: "Project not found" });
  }

  // Check authorization
  const isOwner = existingProject.owner_id === userId;

  if (!isOwner) {
    // Check if user is a member
    const { data: memberCheck } = await supabase
      .from("project_members")
      .select("user_id")
      .eq("project_uuid", uuid)
      .eq("user_id", userId)
      .single();

    if (!memberCheck) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You don't have permission to update this project."
      });
    }
  }

  const memberEmailsRaw = body.memberEmails;
  const memberEmails =
    Array.isArray(memberEmailsRaw) && memberEmailsRaw.every((e) => typeof e === "string")
      ? Array.from(new Set(memberEmailsRaw.map((e) => e.trim().toLowerCase()).filter(Boolean)))
      : undefined;

  const { memberEmails: _ignored, ...projectPayload } = body;

  // Filter out fields that shouldn't be updated directly
  const allowedFields = [
    'name',
    'description',
    'status',
    'priority',
    'start_date',
    'end_date'
  ];

  const filteredPayload: Record<string, unknown> = {};
  for (const key of allowedFields) {
    if (key in projectPayload) {
      filteredPayload[key] = projectPayload[key];
    }
  }

  // Update project fields if there are any to update
  let project = existingProject;

  if (Object.keys(filteredPayload).length > 0) {
    const { data: projectRows, error: projectError } = await supabase
      .from("projects")
      .update(filteredPayload)
      .eq("project_uuid", uuid)
      .select();

    if (projectError) {
      console.error("Update error:", projectError);
      return res.status(400).json({ success: false, error: projectError });
    }

    if (projectRows && projectRows.length > 0) {
      project = projectRows[0];
    } else {
      // Fallback: fetch current project
      const { data: refetchedProject } = await supabase
        .from("projects")
        .select("*")
        .eq("project_uuid", uuid)
        .single();

      if (refetchedProject) {
        project = refetchedProject;
      }
    }
  }

  // Update members if provided
  if (memberEmails !== undefined) {
    // Get existing members before deleting
    const { data: existingMembers } = await supabase
      .from("project_members")
      .select("member_email")
      .eq("project_uuid", uuid);

    const existingEmailSet = new Set(
      (existingMembers || []).map((m) => m.member_email.toLowerCase())
    );

    // Delete existing members
    const { error: deleteError } = await supabase
      .from("project_members")
      .delete()
      .eq("project_uuid", uuid);

    if (deleteError) {
      return res.status(400).json({ success: false, error: deleteError });
    }

    if (memberEmails.length > 0) {
      // Batch lookup users
      const { data: users } = await supabase
        .from("users")
        .select("user_id,email")
        .in("email", memberEmails);

      const foundByEmail = new Map<string, number>();
      for (const u of users ?? []) {
        if (u?.email && u?.user_id) {
          foundByEmail.set(String(u.email).toLowerCase(), Number(u.user_id));
        }
      }

      // Insert new members using UUID
      const memberRows = memberEmails.map((email) => ({
        project_uuid: uuid,
        user_id: foundByEmail.get(email) || null,
        member_email: email,
        role: "viewer" as const,
      }));

      const { error: membersError } = await supabase
        .from("project_members")
        .insert(memberRows);

      if (membersError) {
        return res.status(400).json({ success: false, error: membersError });
      }

      // Send invitations to NEW members only (non-blocking)
      const newMembers = memberEmails.filter(
        (email) => !existingEmailSet.has(email.toLowerCase())
      );

      if (newMembers.length > 0) {
        // Fire and forget - don't wait for emails
        (async () => {
          try {
            const { data: inviter } = await supabase
              .from("users")
              .select("name, email")
              .eq("user_id", userId)
              .single();

            const inviterName = inviter?.name || inviter?.email || "A team member";

            await sendBatchProjectInvites(newMembers, {
              projectName: project.name || "Untitled Project",
              projectDescription: project.description || undefined,
              inviterName,
              projectId: uuid,
            });
          } catch (error) {
            console.error("❌ Failed to send invitation emails:", error);
          }
        })();
      }
    }
  }

  // Get final member list
  const { data: members } = await supabase
    .from("project_members")
    .select("member_email")
    .eq("project_uuid", uuid);

  const projectWithMembers = {
    ...project,
    memberEmails: members?.map((m) => m.member_email) ?? [],
  };

  return res.json({ success: true, project: projectWithMembers });
};

// ✅ Delete project using UUID
export const deleteProject = async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const singleUuid = req.params.projectId; // This should be a UUID now

  // Safely handle req.body.projectIds (now projectUuids)
  const projectIdsBody = req.body || {};
  const { projectIds } = projectIdsBody as { projectIds?: string[] };

  if (!userId) {
    return res.status(401).json({ success: false, message: "User not authenticated" });
  }

  // Determine if single or bulk delete
  const uuidsToDelete = projectIds && Array.isArray(projectIds) && projectIds.length > 0
    ? projectIds
    : [singleUuid];

  // Verify user owns all projects
  const { data: projects, error: fetchError } = await supabase
    .from("projects")
    .select("project_id, project_uuid, owner_id")
    .in("project_uuid", uuidsToDelete);

  if (fetchError) {
    return res.status(400).json({ success: false, error: fetchError });
  }

  const unauthorizedProjects = projects?.filter(p => p.owner_id !== userId) || [];

  if (unauthorizedProjects.length > 0) {
    return res.status(403).json({
      success: false,
      message: "Access denied. You can only delete projects you own."
    });
  }

  // Delete projects
  const { error } = await supabase
    .from("projects")
    .delete()
    .in("project_uuid", uuidsToDelete);

  if (error) {
    return res.status(400).json({ success: false, error });
  }

  return res.json({
    success: true,
    deletedCount: uuidsToDelete.length
  });
};

// ✅ List project members using UUID
export const listProjectMembers = async (req: Request, res: Response) => {
  const projectUuid = req.params.projectId;

  const { data, error } = await supabase
    .from("project_members")
    .select("project_uuid,user_id,role,added_at,users:user_id(name,email)")
    .eq("project_uuid", projectUuid);

  if (error) return res.status(400).json({ success: false, error });
  return res.json({ success: true, members: data || [] });
};

// ✅ Add project member using UUID
export const addProjectMember = async (req: Request, res: Response) => {
  const projectUuid = req.params.projectId; // This should be a UUID now
  const { user_id, role } = req.body as { user_id?: number; role?: string };

  if (!user_id) {
    return res.status(400).json({ success: false, message: "user_id is required" });
  }

  const { data, error } = await supabase
    .from("project_members")
    .insert({ project_uuid: projectUuid, user_id, role })
    .select();

  if (error) return res.status(400).json({ success: false, error });
  return res.status(201).json({ success: true, member: data?.[0] });
};

// ✅ Send project invites using UUID
export const sendProjectInvites = async (req: Request, res: Response) => {
  const projectUuid = req.params.projectId; // This should be a UUID now
  const userId = req.user?.userId;
  const { memberEmails } = req.body as { memberEmails?: string[] };

  if (!userId) {
    return res.status(401).json({ success: false, message: "User not authenticated" });
  }

  if (!memberEmails || !Array.isArray(memberEmails) || memberEmails.length === 0) {
    return res.status(400).json({ success: false, message: "memberEmails array is required" });
  }

  // ✅ OPTIMIZED: Single query with members included
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select(`
      project_id,
      project_uuid,
      name,
      description,
      owner_id,
      project_members(user_id)
    `)
    .eq("project_uuid", projectUuid)
    .single();

  if (projectError || !project) {
    return res.status(404).json({ success: false, message: "Project not found" });
  }

  // Check authorization in-memory
  const isOwner = project.owner_id === userId;
  const isMember = project.project_members?.some((m: any) => m.user_id === userId);

  if (!isOwner && !isMember) {
    return res.status(403).json({
      success: false,
      message: "Access denied. Only project owners or members can send invites."
    });
  }

  const cleanEmails = Array.from(
    new Set(memberEmails.map((e) => e.trim().toLowerCase()).filter(Boolean))
  );

  if (cleanEmails.length === 0) {
    return res.status(400).json({ success: false, message: "No valid email addresses provided" });
  }

  const { data: inviter } = await supabase
    .from("users")
    .select("name,email")
    .eq("user_id", userId)
    .single();

  const inviterName = inviter?.name || inviter?.email || "A team member";

  try {
    await sendBatchProjectInvites(cleanEmails, {
      projectName: project.name || "Untitled Project",
      projectDescription: project.description,
      inviterName,
      projectId: projectUuid,
    });

    return res.json({
      success: true,
      message: "Invitations sent successfully",
      emailsSent: cleanEmails.length,
    });
  } catch (error) {
    console.error("Failed to send invitation emails:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to send invitation emails",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};