import type { Request, Response } from "express";
import { supabase } from "../config/supabaseClient";
import { sendBatchProjectInvites } from "../services/emailService";
import type { AddProjectMemberRequest, UpdateProjectMemberRequest, MemberRole } from "../types/database";

/**
 * List all members of a project
 */
export const listProjectMembers = async (req: Request, res: Response) => {
  const projectUuid = req.params.projectId;
  const userId = req.user?.userId;

  if (!userId) {
    return res.status(401).json({ success: false, message: "User not authenticated" });
  }

  // Verify user has access to the project
  const { data: project } = await supabase
    .from("projects")
    .select("owner_id, project_members!inner(user_id)")
    .eq("project_uuid", projectUuid)
    .single();

  if (!project) {
    return res.status(404).json({ success: false, message: "Project not found" });
  }

  const isOwner = (project as any).owner_id === userId;
  const isMember = (project as any).project_members?.some((m: any) => m.user_id === userId);

  if (!isOwner && !isMember) {
    return res.status(403).json({
      success: false,
      message: "Access denied. You are not a member of this project."
    });
  }

  const { data, error } = await supabase
    .from("project_members")
    .select(`
      id,
      project_uuid,
      user_id,
      member_email,
      role,
      added_at,
      users:user_id(name, email, avatar_url)
    `)
    .eq("project_uuid", projectUuid)
    .order("added_at", { ascending: true });

  if (error) {
    return res.status(400).json({ success: false, error });
  }

  return res.json({
    success: true,
    members: data?.map(m => ({
      id: m.id,
      project_uuid: m.project_uuid,
      user_id: m.user_id,
      member_email: m.member_email,
      role: m.role,
      added_at: m.added_at,
      user: (m as any).users,
    })) || [],
  });
};

/**
 * Add a member to a project
 */
export const addProjectMember = async (req: Request, res: Response) => {
  const projectUuid = req.params.projectId;
  const userId = req.user?.userId;
  const body = req.body as AddProjectMemberRequest;

  if (!userId) {
    return res.status(401).json({ success: false, message: "User not authenticated" });
  }

  if (!body.member_email) {
    return res.status(400).json({ success: false, message: "member_email is required" });
  }

  // Verify user has permission to add members (owner or admin)
  const { data: project } = await supabase
    .from("projects")
    .select("owner_id, project_uuid, name, description")
    .eq("project_uuid", projectUuid)
    .single();

  if (!project) {
    return res.status(404).json({ success: false, message: "Project not found" });
  }

  const isOwner = project.owner_id === userId;

  if (!isOwner) {
    // Check if user is admin
    const { data: member } = await supabase
      .from("project_members")
      .select("role")
      .eq("project_uuid", projectUuid)
      .eq("user_id", userId)
      .single();

    if (!member || (member.role !== "admin" && member.role !== "owner")) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Only project owners and admins can add members."
      });
    }
  }

  const memberEmail = body.member_email.trim().toLowerCase();
  const role = (body.role || "viewer") as MemberRole;

  // Check if member already exists
  const { data: existing } = await supabase
    .from("project_members")
    .select("id")
    .eq("project_uuid", projectUuid)
    .eq("member_email", memberEmail)
    .single();

  if (existing) {
    return res.status(409).json({
      success: false,
      message: "Member already exists in this project"
    });
  }

  // Look up user by email
  const { data: user } = await supabase
    .from("users")
    .select("user_id")
    .eq("email", memberEmail)
    .single();

  const { data: newMember, error } = await supabase
    .from("project_members")
    .insert({
      project_uuid: projectUuid,
      user_id: user?.user_id || null,
      member_email: memberEmail,
      role,
    })
    .select(`
      id,
      project_uuid,
      user_id,
      member_email,
      role,
      added_at,
      users:user_id(name, email, avatar_url)
    `)
    .single();

  if (error) {
    return res.status(400).json({ success: false, error });
  }

  // Send invitation email if user doesn't exist in system
  if (!user) {
    try {
      const { data: inviter } = await supabase
        .from("users")
        .select("name, email")
        .eq("user_id", userId)
        .single();

      const inviterName = inviter?.name || inviter?.email || "A team member";

      sendBatchProjectInvites([memberEmail], {
        projectName: project.name || "Untitled Project",
        projectDescription: project.description || undefined,
        inviterName,
        projectId: projectUuid,
      }).catch((err) => {
        console.error("Failed to send invitation email:", err);
      });
    } catch (emailError) {
      console.error("Failed to send invitation email:", emailError);
    }
  }

  return res.status(201).json({
    success: true,
    member: {
      ...newMember,
      user: (newMember as any).users,
    },
  });
};

/**
 * Update a project member's role
 */
export const updateProjectMember = async (req: Request, res: Response) => {
  const projectUuid = req.params.projectId;
  const memberId = Number(req.params.memberId);
  const userId = req.user?.userId;
  const body = req.body as UpdateProjectMemberRequest;

  if (isNaN(memberId)) {
    return res.status(400).json({ success: false, message: "Invalid member ID" });
  }

  if (!userId) {
    return res.status(401).json({ success: false, message: "User not authenticated" });
  }

  if (!body.role) {
    return res.status(400).json({ success: false, message: "role is required" });
  }

  // Verify user has permission to update members (owner or admin)
  const { data: project } = await supabase
    .from("projects")
    .select("owner_id")
    .eq("project_uuid", projectUuid)
    .single();

  if (!project) {
    return res.status(404).json({ success: false, message: "Project not found" });
  }

  const isOwner = project.owner_id === userId;

  if (!isOwner) {
    // Check if user is admin
    const { data: member } = await supabase
      .from("project_members")
      .select("role")
      .eq("project_uuid", projectUuid)
      .eq("user_id", userId)
      .single();

    if (!member || (member.role !== "admin" && member.role !== "owner")) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Only project owners and admins can update member roles."
      });
    }
  }

  // Verify member exists
  const { data: existingMember } = await supabase
    .from("project_members")
    .select("id, role")
    .eq("id", memberId)
    .eq("project_uuid", projectUuid)
    .single();

  if (!existingMember) {
    return res.status(404).json({ success: false, message: "Member not found" });
  }

  // Update member role
  const { data: updatedMember, error } = await supabase
    .from("project_members")
    .update({ role: body.role as MemberRole })
    .eq("id", memberId)
    .select(`
      id,
      project_uuid,
      user_id,
      member_email,
      role,
      added_at,
      users:user_id(name, email, avatar_url)
    `)
    .single();

  if (error) {
    return res.status(400).json({ success: false, error });
  }

  return res.json({
    success: true,
    member: {
      ...updatedMember,
      user: (updatedMember as any).users,
    },
  });
};

/**
 * Remove a member from a project
 */
export const removeProjectMember = async (req: Request, res: Response) => {
  const projectUuid = req.params.projectId;
  const memberId = Number(req.params.memberId);
  const userId = req.user?.userId;

  if (isNaN(memberId)) {
    return res.status(400).json({ success: false, message: "Invalid member ID" });
  }

  if (!userId) {
    return res.status(401).json({ success: false, message: "User not authenticated" });
  }

  // Verify user has permission to remove members (owner or admin)
  const { data: project } = await supabase
    .from("projects")
    .select("owner_id")
    .eq("project_uuid", projectUuid)
    .single();

  if (!project) {
    return res.status(404).json({ success: false, message: "Project not found" });
  }

  const isOwner = project.owner_id === userId;

  if (!isOwner) {
    // Check if user is admin
    const { data: member } = await supabase
      .from("project_members")
      .select("role")
      .eq("project_uuid", projectUuid)
      .eq("user_id", userId)
      .single();

    if (!member || (member.role !== "admin" && member.role !== "owner")) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Only project owners and admins can remove members."
      });
    }
  }

  // Verify member exists
  const { data: existingMember } = await supabase
    .from("project_members")
    .select("id")
    .eq("id", memberId)
    .eq("project_uuid", projectUuid)
    .single();

  if (!existingMember) {
    return res.status(404).json({ success: false, message: "Member not found" });
  }

  // Remove member
  const { error } = await supabase
    .from("project_members")
    .delete()
    .eq("id", memberId)
    .eq("project_uuid", projectUuid);

  if (error) {
    return res.status(400).json({ success: false, error });
  }

  return res.json({ success: true, message: "Member removed from project" });
};

/**
 * Bulk add members to a project
 */
export const bulkAddProjectMembers = async (req: Request, res: Response) => {
  const projectUuid = req.params.projectId;
  const userId = req.user?.userId;
  const { memberEmails, defaultRole } = req.body as {
    memberEmails?: string[];
    defaultRole?: MemberRole;
  };

  if (!userId) {
    return res.status(401).json({ success: false, message: "User not authenticated" });
  }

  if (!memberEmails || !Array.isArray(memberEmails) || memberEmails.length === 0) {
    return res.status(400).json({
      success: false,
      message: "memberEmails array is required and must not be empty"
    });
  }

  // Verify user has permission to add members
  const { data: project } = await supabase
    .from("projects")
    .select("owner_id, project_uuid, name, description")
    .eq("project_uuid", projectUuid)
    .single();

  if (!project) {
    return res.status(404).json({ success: false, message: "Project not found" });
  }

  const isOwner = project.owner_id === userId;

  if (!isOwner) {
    const { data: member } = await supabase
      .from("project_members")
      .select("role")
      .eq("project_uuid", projectUuid)
      .eq("user_id", userId)
      .single();

    if (!member || (member.role !== "admin" && member.role !== "owner")) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Only project owners and admins can add members."
      });
    }
  }

  // Clean and deduplicate emails
  const cleanEmails = Array.from(
    new Set(memberEmails.map(e => e.trim().toLowerCase()).filter(Boolean))
  );

  if (cleanEmails.length === 0) {
    return res.status(400).json({
      success: false,
      message: "No valid email addresses provided"
    });
  }

  // Get existing members to avoid duplicates
  const { data: existingMembers } = await supabase
    .from("project_members")
    .select("member_email")
    .eq("project_uuid", projectUuid);

  const existingEmailSet = new Set(
    (existingMembers || []).map(m => m.member_email.toLowerCase())
  );

  // Filter out existing members
  const newEmails = cleanEmails.filter(e => !existingEmailSet.has(e));

  if (newEmails.length === 0) {
    return res.status(409).json({
      success: false,
      message: "All provided emails are already members of this project"
    });
  }

  // Look up users by email
  const { data: users } = await supabase
    .from("users")
    .select("user_id, email")
    .in("email", newEmails);

  const userByEmail = new Map<string, number>();
  users?.forEach(u => {
    if (u.email) {
      userByEmail.set(u.email.toLowerCase(), u.user_id);
    }
  });

  // Prepare member rows
  const role = defaultRole || "viewer";
  const memberRows = newEmails.map(email => ({
    project_uuid: projectUuid,
    user_id: userByEmail.get(email) || null,
    member_email: email,
    role,
  }));

  // Insert members
  const { data: insertedMembers, error } = await supabase
    .from("project_members")
    .insert(memberRows)
    .select(`
      id,
      project_uuid,
      user_id,
      member_email,
      role,
      added_at
    `);

  if (error) {
    return res.status(400).json({ success: false, error });
  }

  // Send invitation emails to users not in system
  const emailsToInvite = newEmails.filter(e => !userByEmail.has(e));
  if (emailsToInvite.length > 0) {
    try {
      const { data: inviter } = await supabase
        .from("users")
        .select("name, email")
        .eq("user_id", userId)
        .single();

      const inviterName = inviter?.name || inviter?.email || "A team member";

      sendBatchProjectInvites(emailsToInvite, {
        projectName: project.name || "Untitled Project",
        projectDescription: project.description || undefined,
        inviterName,
        projectId: projectUuid,
      }).catch((err) => {
        console.error("Failed to send invitation emails:", err);
      });
    } catch (emailError) {
      console.error("Failed to send invitation emails:", emailError);
    }
  }

  return res.status(201).json({
    success: true,
    membersAdded: insertedMembers?.length || 0,
    emailsSent: emailsToInvite.length,
    members: insertedMembers || [],
  });
};

