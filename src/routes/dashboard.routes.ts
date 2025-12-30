import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler";
import { clerkAuthenticate } from "../middleware/clerkAuth";
import { getDashboardData } from "../controllers/dashboardController";

const router = Router();

// All dashboard routes require authentication
router.use(clerkAuthenticate);

router.get("/", asyncHandler(getDashboardData));

export default router;

