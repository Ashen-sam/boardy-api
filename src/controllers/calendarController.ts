import type { Request, Response } from "express";
import { supabase } from "../config/supabaseClient";

export const getCalendarData = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    const userEmail = req.user?.email;

    if (!userId || !userEmail) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { start_date, end_date } = req.query;

    let ownedProjectsQuery = supabase
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
      .eq("owner_id", userId);

    if (start_date && end_date) {
      ownedProjectsQuery = ownedProjectsQuery
        .gte("end_date", String(start_date))
        .lte("start_date", String(end_date));
    }

    const { data: ownedProjects, error: ownedError } = await ownedProjectsQuery;

    if (ownedError) {
      console.error("Error fetching owned projects:", ownedError);
      return res.status(500).json({ success: false, error: "Failed to fetch owned projects" });
    }

    let memberProjectsQuery = supabase
      .from("project_members")
      .select(`
        project_uuid,
        role,
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

    const { data: memberProjects, error: memberError } = await memberProjectsQuery;

    if (memberError) {
      console.error("Error fetching member projects:", memberError);
      return res.status(500).json({ success: false, error: "Failed to fetch member projects" });
    }

    const ownedProjectUuids = ownedProjects?.map((p) => p.project_uuid) || [];
    const memberProjectUuids =
      memberProjects
        ?.map((m) => {
          const project = (m.projects as unknown) as { project_uuid: string } | null | undefined;
          return project?.project_uuid;
        })
        .filter((uuid): uuid is string => typeof uuid === "string") || [];
    const allProjectUuids = [...new Set([...ownedProjectUuids, ...memberProjectUuids])];

    if (allProjectUuids.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          projects: [],
          tasks: [],
          summary: {
            totalProjects: 0,
            ownedProjects: 0,
            memberProjects: 0,
            totalTasks: 0,
            assignedTasks: 0,
          },
        },
      });
    }

    // ✅ Fetch assigned tasks WITHOUT nested filtering
    let assignedTasksQuery = supabase
      .from("task_assignments")
      .select(`
        task_id,
        assigned_at,
        tasks:task_id (
          task_id,
          project_uuid,
          title,
          description,
          status,
          priority,
          due_date,
          created_at
        )
      `)
      .eq("user_id", userId);

    const { data: assignedTasksRaw, error: tasksError } = await assignedTasksQuery;

    if (tasksError) {
      console.error("Error fetching assigned tasks:", tasksError);
      return res.status(500).json({ success: false, error: "Failed to fetch assigned tasks" });
    }

    // ✅ Filter in JavaScript instead
    const assignedTasks = assignedTasksRaw?.filter(at => {
      const task = at.tasks as any;
      return task && allProjectUuids.includes(task.project_uuid);
    }) || [];

    let projectTasksQuery = supabase
      .from("tasks")
      .select(`
        task_id,
        project_uuid,
        title,
        description,
        status,
        priority,
        due_date,
        created_at
      `)
      .in("project_uuid", allProjectUuids);

    if (start_date && end_date) {
      projectTasksQuery = projectTasksQuery
        .gte("due_date", String(start_date))
        .lte("due_date", String(end_date))
        .not("due_date", "is", null);
    }

    const { data: projectTasks, error: projectTasksError } = await projectTasksQuery;

    if (projectTasksError) {
      console.error("Error fetching project tasks:", projectTasksError);
      return res.status(500).json({ success: false, error: "Failed to fetch project tasks" });
    }

    const projectsMap = new Map();
    [...(ownedProjects || []), ...memberProjects.map(m => m.projects).filter(Boolean)].forEach(p => {
      if (p && typeof p === 'object' && 'project_uuid' in p) {
        projectsMap.set(p.project_uuid, {
          project_id: p.project_id,
          project_uuid: p.project_uuid,
          name: p.name
        });
      }
    });

    const formattedProjects = [
      ...(ownedProjects || []).map((p) => ({
        ...p,
        role: "owner",
        isOwner: true,
      })),
      ...(memberProjects || [])
        .map((m) => {
          const project = (m.projects as unknown) as
            | {
              project_id: number;
              project_uuid: string;
              name: string;
              description: string | null;
              status: string;
              priority: string;
              start_date: string;
              end_date: string;
              owner_id: number;
              created_at: string;
            }
            | null
            | undefined;
          if (!project) return null;
          return {
            ...project,
            role: m.role,
            isOwner: false,
          };
        })
        .filter((p): p is NonNullable<typeof p> => p !== null),
    ];

    const uniqueProjects = formattedProjects.reduce((acc: any[], project: any) => {
      const existing = acc.find((p) => p.project_uuid === project.project_uuid);
      if (!existing) {
        acc.push(project);
      } else if (project.isOwner) {
        const index = acc.findIndex((p) => p.project_uuid === project.project_uuid);
        acc[index] = project;
      }
      return acc;
    }, []);

    const formattedAssignedTasks =
      assignedTasks
        ?.map((at) => {
          const task = (at.tasks as unknown) as
            | {
              task_id: number;
              project_uuid: string;
              title: string;
              description: string | null;
              status: string;
              priority: string;
              due_date: string | null;
              created_at: string;
            }
            | null
            | undefined;
          if (!task) return null;
          return {
            ...task,
            name: task.title,
            projects: projectsMap.get(task.project_uuid) || null,
            assigned_at: at.assigned_at,
            isAssigned: true,
          };
        })
        .filter((t): t is NonNullable<typeof t> => t !== null) || [];

    const allTasks = [
      ...formattedAssignedTasks,
      ...(projectTasks?.map((t) => ({
        ...t,
        name: t.title,
        projects: projectsMap.get(t.project_uuid) || null,
        isAssigned: false,
      })) || []),
    ];

    const uniqueTasks = allTasks.reduce((acc: any[], task: any) => {
      const existing = acc.find((t) => t.task_id === task.task_id);
      if (!existing) {
        acc.push(task);
      } else if (task.isAssigned) {
        const index = acc.findIndex((t) => t.task_id === task.task_id);
        acc[index] = task;
      }
      return acc;
    }, []);

    return res.status(200).json({
      success: true,
      data: {
        projects: uniqueProjects,
        tasks: uniqueTasks,
        summary: {
          totalProjects: uniqueProjects.length,
          ownedProjects: ownedProjects?.length || 0,
          memberProjects: memberProjects?.length || 0,
          totalTasks: uniqueTasks.length,
          assignedTasks: formattedAssignedTasks.length,
        },
      },
    });
  } catch (error) {
    console.error("Error in getCalendarData:", error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
};