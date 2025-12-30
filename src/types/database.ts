// Type definitions matching the Supabase database schema

export type ProjectStatus = 'On track' | 'Off track' | 'At risk' | 'Completed';
export type ProjectPriority = 'Low' | 'Medium' | 'High' | 'Critical';
export type MemberRole = 'owner' | 'admin' | 'editor' | 'viewer';

// Users table
export interface User {
  user_id: number;
  clerk_user_id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

// Projects table
export interface Project {
  project_id: number;
  project_uuid: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  priority: ProjectPriority;
  start_date: string; // DATE format
  end_date: string; // DATE format
  owner_id: number;
  created_at: string;
  updated_at: string;
}

// Project members table
export interface ProjectMember {
  id: number;
  project_uuid: string;
  user_id: number | null;
  member_email: string;
  role: MemberRole;
  added_at: string;
}

// Tasks table
export interface Task {
  task_id: number;
  project_uuid: string;
  title: string;
  description: string | null;
  status: ProjectStatus;
  priority: ProjectPriority;
  due_date: string | null; // DATE format
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

// Task assignments table
export interface TaskAssignment {
  task_id: number;
  user_id: number;
  assigned_at: string;
}

// Request/Response types
export interface CreateUserRequest {
  clerk_user_id: string;
  name: string;
  email: string;
  avatar_url?: string;
}

export interface UpdateUserRequest {
  name?: string;
  email?: string;
  avatar_url?: string;
}

export interface CreateProjectRequest {
  name: string;
  description?: string;
  status?: ProjectStatus;
  priority?: ProjectPriority;
  start_date: string;
  end_date: string;
  memberEmails?: string[];
}

export interface UpdateProjectRequest {
  name?: string;
  description?: string;
  status?: ProjectStatus;
  priority?: ProjectPriority;
  start_date?: string;
  end_date?: string;
  memberEmails?: string[];
}

export interface CreateTaskRequest {
  project_uuid: string;
  title: string;
  description?: string;
  status?: ProjectStatus;
  priority?: ProjectPriority;
  due_date?: string;
  assigned_user_ids?: number[];
}

export interface UpdateTaskRequest {
  title?: string;
  description?: string;
  status?: ProjectStatus;
  priority?: ProjectPriority;
  due_date?: string;
  assigned_user_ids?: number[];
}

export interface AddProjectMemberRequest {
  member_email: string;
  role?: MemberRole;
}

export interface UpdateProjectMemberRequest {
  role?: MemberRole;
}

