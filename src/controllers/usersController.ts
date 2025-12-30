import { clerkClient } from "@clerk/clerk-sdk-node";
import type { Request, Response } from "express";
import { supabase } from "../config/supabaseClient";
import type { CreateUserRequest, UpdateUserRequest, User } from "../types/database";
//usersController.ts
/**
 * List all users
 */
export const listUsers = async (_req: Request, res: Response) => {
  const { data, error } = await supabase
    .from("users")
    .select("user_id, clerk_user_id, name, email, avatar_url, created_at, updated_at")
    .order("user_id", { ascending: true });

  if (error) {
    return res.status(400).json({ success: false, error });
  }
  return res.json({ success: true, users: data || [] });
};

/**
 * Get user by ID
 */
export const getUserById = async (req: Request, res: Response) => {
  const id = Number(req.params.userId);
  
  if (isNaN(id)) {
    return res.status(400).json({ success: false, message: "Invalid user ID" });
  }

  const { data, error } = await supabase
    .from("users")
    .select("user_id, clerk_user_id, name, email, avatar_url, created_at, updated_at")
    .eq("user_id", id)
    .single();

  if (error || !data) {
    return res.status(404).json({ success: false, message: "User not found" });
  }

  return res.json({ success: true, user: data });
};

/**
 * Get user by Clerk ID
 */
export const getUserByClerkId = async (req: Request, res: Response) => {
  const clerkId = req.params.clerkId;

  const { data, error } = await supabase
    .from("users")
    .select("user_id, clerk_user_id, name, email, avatar_url, created_at, updated_at")
    .eq("clerk_user_id", clerkId)
    .single();

  if (error || !data) {
    return res.status(404).json({ success: false, message: "User not found" });
  }

  return res.json({ success: true, user: data });
};

/**
 * Create user (sync from Clerk)
 * This is typically called automatically by the auth middleware,
 * but can be used for manual syncing
 */
export const createUser = async (req: Request, res: Response) => {
  const body = req.body as CreateUserRequest;

  if (!body.clerk_user_id || !body.name || !body.email) {
    return res.status(400).json({ 
      success: false, 
      message: "clerk_user_id, name, and email are required" 
    });
  }

  // Verify Clerk user exists
  try {
    await clerkClient.users.getUser(body.clerk_user_id);
  } catch (error) {
    return res.status(400).json({ 
      success: false, 
      message: "Invalid Clerk user ID" 
    });
  }

  // Check if user already exists
  const { data: existing } = await supabase
    .from("users")
    .select("user_id")
    .eq("clerk_user_id", body.clerk_user_id)
    .single();

  if (existing) {
    return res.status(409).json({ 
      success: false, 
      message: "User already exists" 
    });
  }

  const { data, error } = await supabase
    .from("users")
    .insert({
      clerk_user_id: body.clerk_user_id,
      name: body.name,
      email: body.email.toLowerCase(),
      avatar_url: body.avatar_url || null,
    })
    .select("user_id, clerk_user_id, name, email, avatar_url, created_at, updated_at")
    .single();

  if (error) {
    return res.status(400).json({ success: false, error });
  }

  return res.status(201).json({ success: true, user: data });
};

/**
 * Update user profile
 * Users can only update their own profile
 */
export const updateUser = async (req: Request, res: Response) => {
  const id = Number(req.params.userId);
  const userId = req.user?.userId;

  if (isNaN(id)) {
    return res.status(400).json({ success: false, message: "Invalid user ID" });
  }

  // Users can only update their own profile
  if (userId !== id) {
    return res.status(403).json({ 
      success: false, 
      message: "You can only update your own profile" 
    });
  }

  const body = req.body as UpdateUserRequest;
  const patch: Partial<User> = {};

  if (body.name !== undefined) patch.name = body.name;
  if (body.email !== undefined) patch.email = body.email.toLowerCase();
  if (body.avatar_url !== undefined) patch.avatar_url = body.avatar_url;

  if (Object.keys(patch).length === 0) {
    return res.status(400).json({ 
      success: false, 
      message: "No fields to update" 
    });
  }

  const { data, error } = await supabase
    .from("users")
    .update(patch)
    .eq("user_id", id)
    .select("user_id, clerk_user_id, name, email, avatar_url, created_at, updated_at")
    .single();

  if (error) {
    return res.status(400).json({ success: false, error });
  }

  return res.json({ success: true, user: data });
};

/**
 * Delete user
 * Only the user themselves can delete their account
 */
export const deleteUser = async (req: Request, res: Response) => {
  const id = Number(req.params.userId);
  const userId = req.user?.userId;

  if (isNaN(id)) {
    return res.status(400).json({ success: false, message: "Invalid user ID" });
  }

  // Users can only delete their own account
  if (userId !== id) {
    return res.status(403).json({ 
      success: false, 
      message: "You can only delete your own account" 
    });
  }

  const { error } = await supabase
    .from("users")
    .delete()
    .eq("user_id", id);

  if (error) {
    return res.status(400).json({ success: false, error });
  }

  return res.json({ success: true, message: "User deleted successfully" });
};

/**
 * Search users by email
 */
export const searchUsersByEmail = async (req: Request, res: Response) => {
  const query = String(req.query.q || "").trim();

  if (!query) {
    return res.json({ success: true, users: [] });
  }

  const { data, error } = await supabase
    .from("users")
    .select("user_id, name, email, avatar_url")
    .ilike("email", `%${query}%`)
    .limit(10);

  if (error) {
    return res.status(400).json({ success: false, error });
  }

  return res.json({ success: true, users: data || [] });
};

/**
 * Get current user profile
 */
export const getCurrentUser = async (req: Request, res: Response) => {
  const userId = req.user?.userId;

  if (!userId) {
    return res.status(401).json({ success: false, message: "User not authenticated" });
  }

  const { data, error } = await supabase
    .from("users")
    .select("user_id, clerk_user_id, name, email, avatar_url, created_at, updated_at")
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    return res.status(404).json({ success: false, message: "User not found" });
  }

  return res.json({ success: true, user: data });
};
