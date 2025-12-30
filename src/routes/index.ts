import { Router } from "express";
import calendarRoutes from "./calendar.routes";
import aiRoutes from "./ai.routes";
import dashboardRoutes from "./dashboard.routes";
import projectsRoutes from "./projects.routes";
import tasksRoutes from "./tasks.routes";
import usersRoutes from "./users.routes";

const router = Router();

// Protected routes (require authentication)
router.use("/users", usersRoutes);
router.use("/projects", projectsRoutes);
router.use("/tasks", tasksRoutes);
router.use("/calendar", calendarRoutes);
router.use("/ai", aiRoutes);
router.use("/dashboard", dashboardRoutes);

export default router;


