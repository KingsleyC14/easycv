# EasyCV

A full-stack web application for tailoring CVs to job specifications using OpenRouter (Claude 3 Opus), React, and Supabase.

## Project Structure

- `frontend/`: React application with Tailwind CSS.
- `backend/`: Server-side logic, potentially Supabase Functions or API routes.
- `supabase/`: Supabase migrations and schema definitions.

## Setup Instructions

### 1. Environment Variables

Create a `.env` file in the root of the project with the following (replace with your actual keys):

```
SUPABASE_URL=YOUR_SUPABASE_URL
SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
OPENROUTER_API_KEY=YOUR_OPENROUTER_API_KEY
```

### 2. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

### 3. Supabase Setup (using Supabase CLI)

1.  **Initialize Supabase (if not already done):**
    ```bash
    supabase init
    ```
2.  **Link to your Supabase project:**
    ```bash
    supabase login
    supabase link --project-ref YOUR_SUPABASE_PROJECT_REF
    ```
3.  **Run migrations:**
    ```bash
    supabase db push
    ```

## Database Schema (`cv_submissions` table)

I will define the schema for the `cv_submissions` table in the `supabase/migrations` directory later.

```sql
CREATE TABLE cv_submissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    original_cv_url TEXT NOT NULL,
    job_spec_text TEXT,
    tailored_cv TEXT,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## Development

Further instructions for development will be added as the project progresses.
