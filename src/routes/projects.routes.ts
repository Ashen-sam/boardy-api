import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler";
import { clerkAuthenticate } from "../middleware/clerkAuth";
import {
  addProjectMember,
  createProject,
  deleteProject,
  getProjectById,
  listProjectMembers,
  listProjects,
  sendProjectInvites,
  updateProject,
} from "../controllers/projectsController";
import {
  addProjectMember as addMember,
  updateProjectMember,
  removeProjectMember,
  bulkAddProjectMembers,
} from "../controllers/projectMembersController";

const router = Router();

// All project routes require authentication
router.use(clerkAuthenticate);

// Project CRUD
router.get("/", asyncHandler(listProjects));
router.post("/", asyncHandler(createProject));
router.get("/:projectId", asyncHandler(getProjectById));
router.put("/:projectId", asyncHandler(updateProject));
router.delete("/:projectId", asyncHandler(deleteProject));

// Project members (using dedicated controller)
router.get("/:projectId/members", asyncHandler(listProjectMembers));
router.post("/:projectId/members", asyncHandler(addMember));
router.post("/:projectId/members/bulk", asyncHandler(bulkAddProjectMembers));
router.put("/:projectId/members/:memberId", asyncHandler(updateProjectMember));
router.delete("/:projectId/members/:memberId", asyncHandler(removeProjectMember));

// Legacy routes (for backward compatibility)
router.post("/:projectId/invites", asyncHandler(sendProjectInvites));

export default router;
