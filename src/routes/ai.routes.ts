import { Router } from "express";
import { clerkAuthenticate } from "../middleware/clerkAuth";
import { generateProjectDescription } from "../controllers/aiController";

const router = Router();

router.post("/project-description", clerkAuthenticate, generateProjectDescription);

export default router;
