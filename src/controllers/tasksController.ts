import type { Request, Response } from "express";
import { supabase } from "../config/supabaseClient";
import type { CreateTaskRequest, UpdateTaskRequest, Task } from "../types/database";

/**
 * List tasks - optionally filtered by project
 * Users can only see tasks from projects they're members of
 */
export const listTasks = async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const projectUuid = req.query.projectUuid ? String(req.query.projectUuid) : undefined;

  if (!userId) {
    return res.status(401).json({ success: false, message: "User not authenticated" });
  }

  // If project UUID is provided, verify user has access to that project
  if (projectUuid) {
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
  }

  // Build query
  let query = supabase
    .from("tasks")
    .select(`
      task_id,
      project_uuid,
      title,
      description,
      status,
      priority,
      due_date,
      created_by,
      created_at,
      updated_at,
      projects:project_uuid(name)
    `)
    .order("task_id", { ascending: false });

  if (projectUuid) {
    query = query.eq("project_uuid", projectUuid);
  } else {
    // If no project filter, only show tasks from projects user is a member of
    // Get all project UUIDs user has access to
    const { data: userProjects } = await supabase
      .from("project_members")
      .select("project_uuid")
      .eq("user_id", userId);

    const { data: ownedProjects } = await supabase
      .from("projects")
      .select("project_uuid")
      .eq("owner_id", userId);

    const projectUuids = new Set<string>();
    userProjects?.forEach(p => projectUuids.add(p.project_uuid));
    ownedProjects?.forEach(p => projectUuids.add(p.project_uuid));

    if (projectUuids.size > 0) {
      query = query.in("project_uuid", Array.from(projectUuids));
    } else {
      // User has no projects, return empty
      return res.json({ success: true, tasks: [] });
    }
  }

  const { data: tasks, error } = await query;

  if (error) {
    return res.status(400).json({ success: false, error });
  }

  // Get assignments for all tasks
  if (tasks && tasks.length > 0) {
    const taskIds = tasks.map(t => t.task_id);
    const { data: assignments } = await supabase
      .from("task_assignments")
      .select("task_id, user_id, users:user_id(name, email)")
      .in("task_id", taskIds);

    // Group assignments by task_id
    const assignmentsByTask = new Map<number, any[]>();
    assignments?.forEach(assignment => {
      if (!assignmentsByTask.has(assignment.task_id)) {
        assignmentsByTask.set(assignment.task_id, []);
      }
      assignmentsByTask.get(assignment.task_id)!.push({
        user_id: assignment.user_id,
        name: (assignment as any).users?.name,
        email: (assignment as any).users?.email,
      });
    });

    // Add assignments to tasks
    const tasksWithAssignments = tasks.map(task => ({
      ...task,
      assignees: assignmentsByTask.get(task.task_id) || [],
    }));

    return res.json({ success: true, tasks: tasksWithAssignments });
  }

  return res.json({ success: true, tasks: tasks || [] });
};

/**
 * Get task by ID
 */
export const getTaskById = async (req: Request, res: Response) => {
  const taskId = Number(req.params.taskId);
  const userId = req.user?.userId;

  if (isNaN(taskId)) {
    return res.status(400).json({ success: false, message: "Invalid task ID" });
  }

  if (!userId) {
    return res.status(401).json({ success: false, message: "User not authenticated" });
  }

  const { data: task, error } = await supabase
    .from("tasks")
    .select(`
      task_id,
      project_uuid,
      title,
      description,
      status,
      priority,
      due_date,
      created_by,
      created_at,
      updated_at,
      projects:project_uuid(name, owner_id, project_members!inner(user_id))
    `)
    .eq("task_id", taskId)
    .single();

  if (error || !task) {
    return res.status(404).json({ success: false, message: "Task not found" });
  }

  // Verify user has access to the project
  const project = (task as any).projects;
  if (!project) {
    return res.status(404).json({ success: false, message: "Project not found" });
  }

  const isOwner = project.owner_id === userId;
  const isMember = project.project_members?.some((m: any) => m.user_id === userId);

  if (!isOwner && !isMember) {
    return res.status(403).json({
      success: false,
      message: "Access denied. You are not a member of this project."
    });
  }

  // Get assignments
  const { data: assignments } = await supabase
    .from("task_assignments")
    .select("task_id, user_id, assigned_at, users:user_id(name, email)")
    .eq("task_id", taskId);

  const taskWithAssignments = {
    task_id: task.task_id,
    project_uuid: task.project_uuid,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    due_date: task.due_date,
    created_by: task.created_by,
    created_at: task.created_at,
    updated_at: task.updated_at,
    assignees: assignments?.map(a => ({
      user_id: a.user_id,
      name: (a as any).users?.name,
      email: (a as any).users?.email,
      assigned_at: a.assigned_at,
    })) || [],
  };

  return res.json({ success: true, task: taskWithAssignments });
};

/**
 * Create task
 */
export const createTask = async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const body = req.body as CreateTaskRequest;

  if (!userId) {
    return res.status(401).json({ success: false, message: "User not authenticated" });
  }

  if (!body.project_uuid || !body.title) {
    return res.status(400).json({
      success: false,
      message: "project_uuid and title are required"
    });
  }

  // Verify user has access to the project
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("owner_id, project_members!inner(user_id)")
    .eq("project_uuid", body.project_uuid)
    .single();

  if (projectError || !project) {
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

  // Create task
  const taskData: Partial<Task> = {
    project_uuid: body.project_uuid,
    title: body.title,
    description: body.description || null,
    status: body.status || "On track",
    priority: body.priority || "Medium",
    due_date: body.due_date || null,
    created_by: userId,
  };

  const { data: task, error: taskError } = await supabase
    .from("tasks")
    .insert(taskData)
    .select()
    .single();

  if (taskError || !task) {
    return res.status(400).json({ success: false, error: taskError });
  }

  // Assign users if provided
  if (body.assigned_user_ids && body.assigned_user_ids.length > 0) {
    const assignments = body.assigned_user_ids.map(userId => ({
      task_id: task.task_id,
      user_id: userId,
    }));

    const { error: assignError } = await supabase
      .from("task_assignments")
      .insert(assignments);

    if (assignError) {
      console.error("Failed to assign users to task:", assignError);
      // Don't fail the request, just log the error
    }
  }

  return res.status(201).json({ success: true, task });
};

/**
 * Update task
 */
export const updateTask = async (req: Request, res: Response) => {
  const taskId = Number(req.params.taskId);
  const userId = req.user?.userId;
  const body = req.body as UpdateTaskRequest;

  if (isNaN(taskId)) {
    return res.status(400).json({ success: false, message: "Invalid task ID" });
  }

  if (!userId) {
    return res.status(401).json({ success: false, message: "User not authenticated" });
  }

  // Get existing task and verify access
  const { data: existingTask, error: fetchError } = await supabase
    .from("tasks")
    .select(`
      task_id,
      project_uuid,
      projects:project_uuid(owner_id, project_members!inner(user_id))
    `)
    .eq("task_id", taskId)
    .single();

  if (fetchError || !existingTask) {
    return res.status(404).json({ success: false, message: "Task not found" });
  }

  // Verify user has access to the project
  const project = (existingTask as any).projects;
  const isOwner = project?.owner_id === userId;
  const isMember = project?.project_members?.some((m: any) => m.user_id === userId);

  if (!isOwner && !isMember) {
    return res.status(403).json({
      success: false,
      message: "Access denied. You are not a member of this project."
    });
  }

  // Update task fields
  const updateData: Partial<Task> = {};
  if (body.title !== undefined) updateData.title = body.title;
  if (body.description !== undefined) updateData.description = body.description;
  if (body.status !== undefined) updateData.status = body.status;
  if (body.priority !== undefined) updateData.priority = body.priority;
  if (body.due_date !== undefined) updateData.due_date = body.due_date || null;

  if (Object.keys(updateData).length === 0 && !body.assigned_user_ids) {
    return res.status(400).json({ success: false, message: "No fields to update" });
  }

  let updatedTask = existingTask;

  if (Object.keys(updateData).length > 0) {
    const { data: task, error: updateError } = await supabase
      .from("tasks")
      .update(updateData)
      .eq("task_id", taskId)
      .select()
      .single();

    if (updateError) {
      return res.status(400).json({ success: false, error: updateError });
    }

    if (task) {
      updatedTask = task;
    }
  }

  // Update assignments if provided
  if (body.assigned_user_ids !== undefined) {
    // Delete existing assignments
    await supabase
      .from("task_assignments")
      .delete()
      .eq("task_id", taskId);

    // Insert new assignments
    if (body.assigned_user_ids.length > 0) {
      const assignments = body.assigned_user_ids.map(uid => ({
        task_id: taskId,
        user_id: uid,
      }));

      const { error: assignError } = await supabase
        .from("task_assignments")
        .insert(assignments);

      if (assignError) {
        console.error("Failed to update task assignments:", assignError);
        // Don't fail the request
      }
    }
  }

  return res.json({ success: true, task: updatedTask });
};

/**
 * Delete task
 */
export const deleteTask = async (req: Request, res: Response) => {
  const taskId = Number(req.params.taskId);
  const userId = req.user?.userId;

  if (isNaN(taskId)) {
    return res.status(400).json({ success: false, message: "Invalid task ID" });
  }

  if (!userId) {
    return res.status(401).json({ success: false, message: "User not authenticated" });
  }

  // Get task and verify access
  const { data: task, error: fetchError } = await supabase
    .from("tasks")
    .select(`
      task_id,
      project_uuid,
      projects:project_uuid(owner_id, project_members!inner(user_id))
    `)
    .eq("task_id", taskId)
    .single();

  if (fetchError || !task) {
    return res.status(404).json({ success: false, message: "Task not found" });
  }

  // Verify user has access to the project
  const project = (task as any).projects;
  const isOwner = project?.owner_id === userId;
  const isMember = project?.project_members?.some((m: any) => m.user_id === userId);

  if (!isOwner && !isMember) {
    return res.status(403).json({
      success: false,
      message: "Access denied. You are not a member of this project."
    });
  }

  // Delete task (assignments will be deleted automatically via CASCADE)
  const { error } = await supabase
    .from("tasks")
    .delete()
    .eq("task_id", taskId);

  if (error) {
    return res.status(400).json({ success: false, error });
  }

  return res.json({ success: true, message: "Task deleted successfully" });
};

/**
 * List task assignments
 */
export const listTaskAssignments = async (req: Request, res: Response) => {
  const taskId = Number(req.params.taskId);
  const userId = req.user?.userId;

  if (isNaN(taskId)) {
    return res.status(400).json({ success: false, message: "Invalid task ID" });
  }

  if (!userId) {
    return res.status(401).json({ success: false, message: "User not authenticated" });
  }

  // Verify user has access to the task's project
  const { data: task } = await supabase
    .from("tasks")
    .select("project_uuid, projects:project_uuid(owner_id, project_members!inner(user_id))")
    .eq("task_id", taskId)
    .single();

  if (!task) {
    return res.status(404).json({ success: false, message: "Task not found" });
  }

  const project = (task as any).projects;
  const isOwner = project?.owner_id === userId;
  const isMember = project?.project_members?.some((m: any) => m.user_id === userId);

  if (!isOwner && !isMember) {
    return res.status(403).json({
      success: false,
      message: "Access denied. You are not a member of this project."
    });
  }

  const { data, error } = await supabase
    .from("task_assignments")
    .select("task_id, user_id, assigned_at, users:user_id(name, email, avatar_url)")
    .eq("task_id", taskId);

  if (error) {
    return res.status(400).json({ success: false, error });
  }

  return res.json({
    success: true,
    assignees: data?.map(a => ({
      task_id: a.task_id,
      user_id: a.user_id,
      assigned_at: a.assigned_at,
      user: (a as any).users,
    })) || [],
  });
};

/**
 * Assign user to task
 */
export const assignUserToTask = async (req: Request, res: Response) => {
  const taskId = Number(req.params.taskId);
  const userId = req.user?.userId;
  const { user_id } = req.body as { user_id?: number };

  if (isNaN(taskId)) {
    return res.status(400).json({ success: false, message: "Invalid task ID" });
  }

  if (!userId) {
    return res.status(401).json({ success: false, message: "User not authenticated" });
  }

  if (!user_id) {
    return res.status(400).json({ success: false, message: "user_id is required" });
  }

  // Verify user has access to the task's project
  const { data: task } = await supabase
    .from("tasks")
    .select("project_uuid, projects:project_uuid(owner_id, project_members!inner(user_id))")
    .eq("task_id", taskId)
    .single();

  if (!task) {
    return res.status(404).json({ success: false, message: "Task not found" });
  }

  const project = (task as any).projects;
  const isOwner = project?.owner_id === userId;
  const isMember = project?.project_members?.some((m: any) => m.user_id === userId);

  if (!isOwner && !isMember) {
    return res.status(403).json({
      success: false,
      message: "Access denied. You are not a member of this project."
    });
  }

  // Check if assignment already exists
  const { data: existing } = await supabase
    .from("task_assignments")
    .select("task_id, user_id")
    .eq("task_id", taskId)
    .eq("user_id", user_id)
    .single();

  if (existing) {
    return res.status(409).json({
      success: false,
      message: "User is already assigned to this task"
    });
  }

  const { data, error } = await supabase
    .from("task_assignments")
    .insert({ task_id: taskId, user_id })
    .select("task_id, user_id, assigned_at, users:user_id(name, email)")
    .single();

  if (error) {
    return res.status(400).json({ success: false, error });
  }

  return res.status(201).json({ success: true, assignment: data });
};

/**
 * Remove user from task
 */
export const unassignUserFromTask = async (req: Request, res: Response) => {
  const taskId = Number(req.params.taskId);
  const userIdToRemove = Number(req.params.userId);
  const userId = req.user?.userId;

  if (isNaN(taskId) || isNaN(userIdToRemove)) {
    return res.status(400).json({ success: false, message: "Invalid task ID or user ID" });
  }

  if (!userId) {
    return res.status(401).json({ success: false, message: "User not authenticated" });
  }

  // Verify user has access to the task's project
  const { data: task } = await supabase
    .from("tasks")
    .select("project_uuid, projects:project_uuid(owner_id, project_members!inner(user_id))")
    .eq("task_id", taskId)
    .single();

  if (!task) {
    return res.status(404).json({ success: false, message: "Task not found" });
  }

  const project = (task as any).projects;
  const isOwner = project?.owner_id === userId;
  const isMember = project?.project_members?.some((m: any) => m.user_id === userId);

  if (!isOwner && !isMember) {
    return res.status(403).json({
      success: false,
      message: "Access denied. You are not a member of this project."
    });
  }

  const { error } = await supabase
    .from("task_assignments")
    .delete()
    .eq("task_id", taskId)
    .eq("user_id", userIdToRemove);

  if (error) {
    return res.status(400).json({ success: false, error });
  }

  return res.json({ success: true, message: "User unassigned from task" });
};
