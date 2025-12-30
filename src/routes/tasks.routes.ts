import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler";
import { clerkAuthenticate } from "../middleware/clerkAuth";
import {
  assignUserToTask,
  createTask,
  deleteTask,
  getTaskById,
  listTaskAssignments,
  listTasks,
  updateTask,
  unassignUserFromTask,
} from "../controllers/tasksController";

const router = Router();

// All task routes require authentication
router.use(clerkAuthenticate);

// Task CRUD
router.get("/", asyncHandler(listTasks));
router.post("/", asyncHandler(createTask));
router.get("/:taskId", asyncHandler(getTaskById));
router.put("/:taskId", asyncHandler(updateTask));
router.delete("/:taskId", asyncHandler(deleteTask));

// Task assignments
router.get("/:taskId/assignments", asyncHandler(listTaskAssignments));
router.post("/:taskId/assignments", asyncHandler(assignUserToTask));
router.delete("/:taskId/assignments/:userId", asyncHandler(unassignUserFromTask));

export default router;
