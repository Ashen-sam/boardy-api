import type { Request, Response, NextFunction } from "express";
import { createClerkClient } from "@clerk/clerk-sdk-node";
import { env } from "../config/env";
import { supabase } from "../config/supabaseClient";
//clerkAuth.ts middleware for Clerk authentication
// Clerk user type
export interface ClerkUser {
  clerkUserId: string;
  userId: number;
  email: string;
  name: string;
}

// Extend Express Request to include Clerk user info
declare global {
  namespace Express {
    interface Request {
      clerkUserId?: string;
      userId?: number; // Internal user_id from database
      user?: ClerkUser;
    }
  }
}

/**
 * Clerk authentication middleware
 * Verifies the Clerk session token and syncs user to database
 */
export const clerkAuthenticate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, message: "No token provided" });
    }

    const token = authHeader.substring(7); // Remove "Bearer " prefix

    // Verify token with Clerk
    const clerk = createClerkClient({ secretKey: env.CLERK_SECRET_KEY });
    let session;
    try {
      session = await clerk.verifyToken(token);
    } catch (error) {
      return res.status(401).json({ success: false, message: "Invalid token" });
    }

    if (!session || !session.sub) {
      return res.status(401).json({ success: false, message: "Invalid token" });
    }

    const clerkUserId = session.sub;

    // Get or create user in database
    let { data: user, error: userError } = await supabase
      .from("users")
      .select("user_id, clerk_user_id, name, email")
      .eq("clerk_user_id", clerkUserId)
      .single();

    if (userError || !user) {
      // User doesn't exist in database, fetch from Clerk and create
      try {
        const clerkUser = await clerk.users.getUser(clerkUserId);
        
        const newUser = {
          clerk_user_id: clerkUserId,
          name: clerkUser.firstName && clerkUser.lastName 
            ? `${clerkUser.firstName} ${clerkUser.lastName}`.trim()
            : clerkUser.username || clerkUser.emailAddresses[0]?.emailAddress || "Unknown",
          email: clerkUser.emailAddresses[0]?.emailAddress || "",
          avatar_url: clerkUser.imageUrl || null,
        };

        const { data: createdUser, error: createError } = await supabase
          .from("users")
          .insert(newUser)
          .select("user_id, clerk_user_id, name, email")
          .single();

        if (createError || !createdUser) {
          console.error("Failed to create user:", createError);
          return res.status(500).json({ 
            success: false, 
            message: "Failed to sync user with database" 
          });
        }

        user = createdUser;
      } catch (clerkError) {
        console.error("Failed to fetch user from Clerk:", clerkError);
        return res.status(401).json({ 
          success: false, 
          message: "Failed to verify user" 
        });
      }
    }

    // Set user info on request
    req.clerkUserId = clerkUserId;
    req.userId = user.user_id;
    req.user = {
      clerkUserId: user.clerk_user_id,
      userId: user.user_id,
      email: user.email,
      name: user.name,
    };

    // Set Clerk user ID for RLS policies (if using Supabase RLS)
    // Note: This requires setting the session variable in Supabase
    // For now, we'll use service role key which bypasses RLS
    
    next();
  } catch (error) {
    console.error("Authentication error:", error);
    return res.status(401).json({ 
      success: false, 
      message: "Invalid or expired token" 
    });
  }
};

