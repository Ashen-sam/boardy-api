-- -- =============================================
-- -- ENUM TYPES
-- -- =============================================
-- DO $$
-- BEGIN
--   IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'project_status') THEN
--     CREATE TYPE project_status AS ENUM ('On track', 'Off track', 'At risk');
--   END IF;

--   IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'project_priority') THEN
--     CREATE TYPE project_priority AS ENUM ('low', 'medium', 'high', 'critical');
--   END IF;

--   IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'member_role') THEN
--     CREATE TYPE member_role AS ENUM ('owner', 'admin', 'editor', 'viewer');
--   END IF;
-- END $$;




-- -- =============================================
-- -- TABLES
-- -- =============================================

-- CREATE TABLE IF NOT EXISTS users (
--   user_id BIGSERIAL PRIMARY KEY,
--   name VARCHAR(100) NOT NULL,
--   email VARCHAR(150) UNIQUE NOT NULL,
--   password VARCHAR(255) NOT NULL,
--   created_at TIMESTAMP DEFAULT NOW()
-- );

-- CREATE TABLE IF NOT EXISTS projects (
--   project_id BIGSERIAL PRIMARY KEY,
--   name VARCHAR(150) NOT NULL,
--   description TEXT,
--   status project_status NOT NULL DEFAULT 'On track',
--   priority project_priority NOT NULL DEFAULT 'medium',
--   start_date DATE NOT NULL,
--   end_date DATE NOT NULL,
--   owner_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
--   created_at TIMESTAMP DEFAULT NOW()
-- );

-- CREATE TABLE IF NOT EXISTS project_members (
--   project_id BIGINT REFERENCES projects(project_id) ON DELETE CASCADE,
--   user_id BIGINT REFERENCES users(user_id) ON DELETE CASCADE,
--   member_email VARCHAR(150),
--   role member_role NOT NULL DEFAULT 'viewer',
--   added_at TIMESTAMP DEFAULT NOW(),
--   PRIMARY KEY (project_id, user_id)
-- );

-- CREATE TABLE IF NOT EXISTS tasks (
--   task_id BIGSERIAL PRIMARY KEY,
--   project_id BIGINT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
--   name VARCHAR(200) NOT NULL,
--   description TEXT,
--   status project_status NOT NULL DEFAULT 'On track',
--   priority project_priority NOT NULL DEFAULT 'medium',
--   due_date DATE,
--   created_by BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
--   created_at TIMESTAMP DEFAULT NOW()
-- );

-- CREATE TABLE IF NOT EXISTS task_assignments (
--   task_id BIGINT REFERENCES tasks(task_id) ON DELETE CASCADE,
--   user_id BIGINT REFERENCES users(user_id) ON DELETE CASCADE,
--   assigned_at TIMESTAMP DEFAULT NOW(),
--   PRIMARY KEY (task_id, user_id)
-- );

-- -- Products (your extra table)
-- CREATE TABLE IF NOT EXISTS products (
--   id bigint generated always as identity primary key,
--   name text not null,
--   price numeric not null,
--   created_at timestamp with time zone default now()
-- );


