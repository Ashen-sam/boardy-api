import type { Request, Response } from "express";
import { supabase } from "../config/supabaseClient";
//dashboardController.ts controller for dashboard data
export const getDashboardData = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: "User not authenticated" });
    }

    const [ownedProjectsResult, memberProjectsResult] = await Promise.all([
      supabase.from("projects").select("project_uuid").eq("owner_id", userId),
      supabase
        .from("project_members")
        .select("project_uuid")
        .eq("user_id", userId),
    ]);

    if (ownedProjectsResult.error || memberProjectsResult.error) {
      return res.status(500).json({
        success: false,
        message: "Failed to fetch user projects",
      });
    }

    const ownedProjectUuids = (ownedProjectsResult.data || []).map((p) => p.project_uuid);
    const memberProjectUuids = (memberProjectsResult.data || []).map((p) => p.project_uuid);
    const allProjectUuids = [...new Set([...ownedProjectUuids, ...memberProjectUuids])];

    if (allProjectUuids.length === 0) {
      return res.json({
        success: true,
        data: {
          completedProjects: 0,
          totalProjects: 0,
          totalTeamMembers: 0,
          recentTasks: [],
          upcomingDeadlines: [],
          stats: {
            projectsByStatus: {},
            tasksByStatus: {},
            projectsByPriority: {},
          },
        },
      });
    }

    const { data: allProjects, error: projectsError } = await supabase
      .from("projects")
      .select("project_id, project_uuid, name, status, priority, end_date, owner_id, created_at")
      .in("project_uuid", allProjectUuids);

    if (projectsError) {
      return res.status(500).json({
        success: false,
        message: "Failed to fetch projects",
        error: projectsError,
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const completedProjects = (allProjects || []).filter((project) => {
      const endDate = new Date(project.end_date);
      endDate.setHours(0, 0, 0, 0);
      return endDate < today;
    });

    const { data: allMembers, error: membersError } = await supabase
      .from("project_members")
      .select("member_email, user_id")
      .in("project_uuid", allProjectUuids);

    if (membersError) {
      return res.status(500).json({
        success: false,
        message: "Failed to fetch team members",
        error: membersError,
      });
    }

    const uniqueUserIds = new Set<number>();
    const memberEmails = new Set<string>();

    (allProjects || []).forEach((project) => {
      if (project.owner_id) {
        uniqueUserIds.add(project.owner_id);
      }
    });

    (allMembers || []).forEach((member) => {
      if (member.user_id) {
        uniqueUserIds.add(member.user_id);
      }
      if (member.member_email) {
        memberEmails.add(member.member_email.toLowerCase());
      }
    });

    const memberEmailsArray = Array.from(memberEmails);
    let totalTeamMembers = uniqueUserIds.size;

    if (memberEmailsArray.length > 0) {
      const { data: usersByEmail } = await supabase
        .from("users")
        .select("user_id, email")
        .in("email", memberEmailsArray);

      (usersByEmail || []).forEach((user) => {
        if (user.user_id) {
          uniqueUserIds.add(user.user_id);
        }
      });

      const emailsWithAccounts = new Set((usersByEmail || []).map((u) => u.email?.toLowerCase()));
      const emailsWithoutAccounts = memberEmailsArray.filter((email) => !emailsWithAccounts.has(email));

      totalTeamMembers = uniqueUserIds.size + emailsWithoutAccounts.length;
    }

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // ✅ FIXED: Fetch tasks WITHOUT nested project join first
    const { data: recentTasksRaw, error: recentTasksError } = await supabase
      .from("tasks")
      .select("task_id, project_uuid, title, description, status, priority, due_date, created_at")
      .in("project_uuid", allProjectUuids)
      .gte("created_at", sevenDaysAgo.toISOString())
      .order("created_at", { ascending: false })
      .limit(10);

    if (recentTasksError) {
      return res.status(500).json({
        success: false,
        message: "Failed to fetch recent tasks",
        error: recentTasksError,
      });
    }

    const fourteenDaysFromNow = new Date();
    fourteenDaysFromNow.setDate(fourteenDaysFromNow.getDate() + 14);

    // ✅ FIXED: Fetch tasks WITHOUT nested project join first
    const { data: upcomingTasksRaw, error: upcomingTasksError } = await supabase
      .from("tasks")
      .select("task_id, project_uuid, title, description, status, priority, due_date, created_at")
      .in("project_uuid", allProjectUuids)
      .lte("due_date", fourteenDaysFromNow.toISOString().split("T")[0])
      .gte("due_date", today.toISOString().split("T")[0])
      .not("due_date", "is", null)
      .order("due_date", { ascending: true })
      .limit(10);

    if (upcomingTasksError) {
      return res.status(500).json({
        success: false,
        message: "Failed to fetch upcoming deadlines",
        error: upcomingTasksError,
      });
    }

    const { data: allTasks } = await supabase
      .from("tasks")
      .select("status, priority")
      .in("project_uuid", allProjectUuids);

    // ✅ Create projects map for efficient lookup
    const projectsMap = new Map();
    (allProjects || []).forEach((p) => {
      projectsMap.set(p.project_uuid, {
        project_id: p.project_id,
        project_uuid: p.project_uuid,
        name: p.name
      });
    });

    const projectsByStatus: Record<string, number> = {};
    const tasksByStatus: Record<string, number> = {};
    const projectsByPriority: Record<string, number> = {};

    (allProjects || []).forEach((project) => {
      projectsByStatus[project.status] = (projectsByStatus[project.status] || 0) + 1;
      projectsByPriority[project.priority] = (projectsByPriority[project.priority] || 0) + 1;
    });

    (allTasks || []).forEach((task) => {
      tasksByStatus[task.status] = (tasksByStatus[task.status] || 0) + 1;
    });

    // ✅ FIXED: Map project info from projectsMap
    const formattedRecentTasks = (recentTasksRaw || []).map((task) => ({
      task_id: task.task_id,
      project_id: projectsMap.get(task.project_uuid)?.project_id,
      project_uuid: task.project_uuid,
      name: task.title, // ✅ Map title to name
      description: task.description,
      status: task.status,
      priority: task.priority,
      due_date: task.due_date,
      created_at: task.created_at,
      project: projectsMap.get(task.project_uuid) || null,
    }));

    // ✅ FIXED: Map project info from projectsMap
    const formattedUpcomingDeadlines = (upcomingTasksRaw || []).map((task) => ({
      task_id: task.task_id,
      project_id: projectsMap.get(task.project_uuid)?.project_id,
      project_uuid: task.project_uuid,
      name: task.title, // ✅ Map title to name
      description: task.description,
      status: task.status,
      priority: task.priority,
      due_date: task.due_date,
      created_at: task.created_at,
      project: projectsMap.get(task.project_uuid) || null,
    }));

    return res.json({
      success: true,
      data: {
        completedProjects: completedProjects.length,
        totalProjects: allProjects?.length || 0,
        totalTeamMembers,
        recentTasks: formattedRecentTasks,
        upcomingDeadlines: formattedUpcomingDeadlines,
        stats: {
          projectsByStatus,
          tasksByStatus,
          projectsByPriority,
        },
      },
    });
  } catch (error) {
    console.error("Error in getDashboardData:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};