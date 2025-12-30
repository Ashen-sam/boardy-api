import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler";
import { clerkAuthenticate } from "../middleware/clerkAuth";
import { getCalendarData } from "../controllers/calendarController";

const router = Router();

// All calendar routes require authentication
router.use(clerkAuthenticate);

router.get("/", asyncHandler(getCalendarData));

export default router;

