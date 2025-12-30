import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler";
import { clerkAuthenticate } from "../middleware/clerkAuth";
import {
  listUsers,
  getUserById,
  getUserByClerkId,
  createUser,
  updateUser,
  deleteUser,
  searchUsersByEmail,
  getCurrentUser,
} from "../controllers/usersController";

const router = Router();

// All user routes require authentication
router.use(clerkAuthenticate);

// Get current user profile
router.get("/me", asyncHandler(getCurrentUser));

// Search users by email
router.get("/search", asyncHandler(searchUsersByEmail));

// List all users
router.get("/", asyncHandler(listUsers));

// Get user by Clerk ID
router.get("/clerk/:clerkId", asyncHandler(getUserByClerkId));

// Get user by internal ID
router.get("/:userId", asyncHandler(getUserById));

// Create user (sync from Clerk)
router.post("/", asyncHandler(createUser));

// Update user profile (users can only update themselves)
router.put("/:userId", asyncHandler(updateUser));

// Delete user (users can only delete themselves)
router.delete("/:userId", asyncHandler(deleteUser));

export default router;
