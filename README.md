# Client Proofing System

A proof review tool for designers and their clients. Designers upload graphics (PNG, JPG, GIF, WEBP, PDF) to a project. Clients see each proof full-size, then approve it or request changes with a note. Every proof has its own feedback thread, and each project has an activity feed. It replaces the WhatsApp back-and-forth.

## Features

- Designer dashboard with projects, status counts and an invite-pending flag.
- Create a project, then invite the client by email or share a single invite link.
- Upload proofs (images and PDFs) with multer. Files go to Cloudinary when configured, otherwise to local disk.
- Client view: full-size proof, approve, or request changes with a required note.
- Threaded comments per proof, with approval and revision entries kept in the thread.
- Status badges on every proof: Pending, Approved, Revision.
- Per-project activity feed: uploads, joins, decisions, comments.
- JWT auth with two roles (designer, client). Clients only see projects they joined.
- Upload safety: only PNG, JPG, GIF, WEBP and PDF are accepted. SVG is blocked because it can carry script. Served files send `nosniff` and a restrictive Content-Security-Policy.
- Light editorial design: warm off-white paper, deep forest green, amber accents, Sora UI type, Newsreader for headings.
- Custom logo mark (a proof sheet with an amber approval seal) in the header, auth screens, and as the favicon (SVG, 32px PNG, Apple touch icon).
- Custom 404 page in the same visual language.
- Landing page, seed script with demo data, ESLint on both client and server.

## Stack

- Client: React 18, Vite 5, React Router 6
- Server: Node.js, Express 4, Mongoose 8, JWT, multer, bcryptjs
- Database: MongoDB (local or Atlas)
- Lint: ESLint (flat config) in both `client/` and `server/`

## Setup

You need Node.js 18 or newer and a MongoDB instance (local, or a free Atlas cluster).

1. Install dependencies from the project root:

   ```
   npm run install:all
   ```

2. Create the server environment file and set the values:

   ```
   cp server/.env.example server/.env
   ```

   Set `JWT_SECRET` to a long random string. Set `MONGODB_URI` to your database. The default `mongodb://127.0.0.1:27017/client-proofing` works with a local MongoDB.

3. Optional client env file (only needed if the API is hosted somewhere other than the dev proxy):

   ```
   cp client/.env.example client/.env
   ```

4. Load the demo data (wipes and recreates the demo records):

   ```
   npm run seed
   ```

5. Run both ends:

   ```
   npm run dev
   ```

   The app runs at http://localhost:5173 and the API at http://localhost:5000.

## Demo logins

Password for all demo accounts: `demo1234`

- Designer: amara@studioverde.ng (Studio Verde). Has two projects.
- Client: tunde@lagosfoods.ng (joined to "Lagos Foods Q4 Campaign", with approved and revision decisions in the thread).
- Ifeoma Okafor (ifeoma@northhill.co) has no account yet. The seed prints her invite link. Open it, sign up as a client, and you join "Northhill Coffee Packaging".

## Project layout

```
client/   React (Vite) app: landing, auth, invite, dashboard, project, proof viewer
server/   Node API (plain http module, no Express): auth, projects, uploads, proofs, comments, activity; seed.js
```

API routes (all under `/api`):

- `POST /auth/register`, `POST /auth/login`, `GET /auth/me`
- `GET /projects`, `POST /projects`, `GET /projects/:id`
- `POST /projects/:id/invite`, `GET /projects/invite/:token`, `POST /projects/join`
- `GET /projects/:id/proofs`, `POST /projects/:id/proofs` (multipart upload)
- `GET /projects/:id/activity`
- `POST /uploads` (designer, multipart field `file`), `DELETE /uploads/:publicId` (designer, refused while a proof still uses the file)
- `GET /proofs/:id`, `GET /proofs/:id/file`, `PATCH /proofs/:id/decision`
- `GET /proofs/:id/comments`, `POST /proofs/:id/comments`

## Cloudinary uploads

Proof files can go to Cloudinary instead of local disk.

1. Create a free account at cloudinary.com. On the dashboard, copy the cloud name, API key and API secret.
2. Open `server/.env` and replace the three `CLOUDINARY_*` placeholder values. Optionally change `CLOUDINARY_FOLDER` (default `client-proofing`).
3. Restart the server. Uploads now go to Cloudinary as authenticated assets, which are not publicly reachable.

How it works:

- The server keeps the upload in memory, streams it to Cloudinary, and stores the public id, format and `storage: 'cloudinary'` on the proof.
- `GET /api/proofs/:id/file` checks the user's access first, then redirects to a signed Cloudinary URL. The signature is generated on the server, so the raw asset URL never leaves the API.
- Leave the placeholder values in place (or remove them) and uploads stay on local disk. Old local proofs keep working either way.
- PDFs are uploaded with `resource_type: image`. I have not verified that PDF viewing works end to end on Cloudinary. Test a PDF upload with real credentials before relying on it.

## Brand assets

- `client/src/components/LogoMark.jsx` is the header mark. `client/public/favicon.svg` uses the same geometry.
- `client/public/favicon-32.png`, `apple-touch-icon.png` and `icon-512.png` are rendered from the SVG. Re-render them if you change the mark.

## Server internals (no Express)

The server runs on Node's built-in `http` module. Express, multer, cors and express-rate-limit are gone.

- `server/src/http/server.js` handles CORS (origin from `CLIENT_URL`, preflight answered with 204), body parsing, routing and the error handler.
- `server/src/http/router.js` is a small router with `get`, `post`, `patch` and `delete`, and `:param` segments.
- `server/src/http/body.js` parses JSON bodies (100kb limit) and `multipart/form-data` by hand. File size is capped by `MAX_UPLOAD_MB`.
- `server/src/http/respond.js` adds `res.json`, `res.status`, `res.redirect` and file streaming with ETag, 304 and byte-range support.
- `server/src/middleware/rateLimit.js` is an in-memory limiter on the auth routes (40 attempts per 15 minutes per IP). It resets when the server restarts. Use a shared store if you run more than one instance.

Error responses and status codes are the same as before, so the client needs no changes.

Quick check after starting the server: `curl http://localhost:5000/api/health`

## Notes

- Uploads are stored in `server/uploads/` unless Cloudinary is configured. Local files are streamed from disk, not held in memory. Back this folder up if you deploy.
- Cloudinary is optional. See the next section.
- The seed writes its placeholder proofs as SVG files. Those are generated by the seed only. User uploads never accept SVG.
- Change `JWT_SECRET` before deploying anywhere public.

## Deploying to Vercel

The backend runs as a Vercel serverless function (`api/[...route].js`). `vercel.json` maps `/api/*` to it and builds the React client.

Set these in the Vercel dashboard (Project -> Settings -> Environment Variables):
- `MONGODB_URI` - your MongoDB connection string (Atlas works)
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` - required for uploads on Vercel
- `JWT_SECRET` - a long random string

Important: local disk storage does NOT persist on Vercel serverless (the filesystem is read-only and ephemeral). On a deployment, file uploads only work with the Cloudinary variables set; uploads fail with a 503 explaining this if they are missing. On localhost, uploads fall back to `server/uploads/` and work without Cloudinary.

Deploy: push the repo to GitHub and import it in Vercel, or run `vercel` from the project root.
