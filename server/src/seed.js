// Demo data. Run with `npm run seed` from server/.
// It wipes existing demo users, projects, proofs, comments and activity, then recreates them.
//
// Demo logins (password for every account: demo1234)
//   designer: amara@studioverde.ng   (Studio Verde)
//   client:   tunde@lagosfoods.ng    (already joined to "Lagos Foods Q4 Campaign")
//   ifeoma@northhill.co has no account yet. The printed invite link is for her to sign up and join.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('./models/User');
const Project = require('./models/Project');
const Proof = require('./models/Proof');
const Comment = require('./models/Comment');
const Activity = require('./models/Activity');
const { UPLOAD_DIR } = require('./utils/upload');
const { connectDB } = require('./config/db');

const DEMO_PASSWORD = 'demo1234';
const FOREST = '#1f3d2b';
const AMBER = '#d99a2b';
const PAPER = '#faf8f4';
const RUST = '#a4502d';

// Designed placeholder proofs as SVG, so the demo shows real-looking work.
// These files are written by the seed script only. User uploads never accept SVG.
function proofSvg({ kicker, headline, sub, accent, shape }) {
  const mark =
    shape === 'circle'
      ? `<circle cx="860" cy="290" r="170" fill="${accent}"/>`
      : `<rect x="690" y="120" width="340" height="340" rx="26" fill="${accent}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
  <rect width="1200" height="800" fill="${PAPER}"/>
  <rect x="40" y="40" width="1120" height="720" fill="none" stroke="${FOREST}" stroke-opacity="0.18" stroke-width="2"/>
  ${mark}
  <text x="90" y="200" font-family="Georgia, serif" font-size="30" letter-spacing="4" fill="${RUST}">${kicker}</text>
  <text x="90" y="380" font-family="Georgia, serif" font-size="96" fill="${FOREST}">${headline[0]}</text>
  <text x="90" y="480" font-family="Georgia, serif" font-size="96" fill="${FOREST}">${headline[1]}</text>
  <text x="90" y="600" font-family="Helvetica, Arial, sans-serif" font-size="32" fill="#4a5249">${sub}</text>
  <text x="90" y="710" font-family="Helvetica, Arial, sans-serif" font-size="20" fill="#7a7f75">Studio Verde · draft for review</text>
</svg>`;
}

function writeProofFile(filename, svg) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), svg, 'utf8');
  return fs.statSync(path.join(UPLOAD_DIR, filename)).size;
}

function makeProofRecord({ project, title, version, status, decidedAt, kind, seedName, svg }) {
  const filename = `${seedName}.svg`;
  const size = writeProofFile(filename, svg);
  return {
    project: project._id,
    title,
    version,
    status,
    decidedAt,
    file: { filename, originalName: `${title.toLowerCase().replace(/\s+/g, '-')}.svg`, mimetype: 'image/svg+xml', size },
    _kind: kind
  };
}

async function run() {
  await connectDB(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/client-proofing');

  // Clear demo data (and only what the seed owns).
  await Promise.all([User.deleteMany({}), Project.deleteMany({}), Proof.deleteMany({}), Comment.deleteMany({}), Activity.deleteMany({})]);
  if (fs.existsSync(UPLOAD_DIR)) {
    for (const f of fs.readdirSync(UPLOAD_DIR)) {
      if (f.startsWith('seed-') && f.endsWith('.svg')) fs.unlinkSync(path.join(UPLOAD_DIR, f));
    }
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const designer = await User.create({
    name: 'Amara Eze',
    email: 'amara@studioverde.ng',
    passwordHash,
    role: 'designer',
    studioName: 'Studio Verde'
  });
  const tunde = await User.create({
    name: 'Tunde Bello',
    email: 'tunde@lagosfoods.ng',
    passwordHash,
    role: 'client'
  });

  // Project 1: client already joined, mixed statuses.
  const campaign = await Project.create({
    name: 'Lagos Foods Q4 Campaign',
    description: 'Launch set for the Q4 range: Instagram cards, a shelf poster and a price flyer.',
    designer: designer._id,
    client: tunde._id,
    clientName: 'Tunde Bello',
    clientEmail: 'tunde@lagosfoods.ng',
    inviteToken: crypto.randomBytes(18).toString('hex')
  });

  // Project 2: client not joined yet, invite link works.
  const northhill = await Project.create({
    name: 'Northhill Coffee Packaging',
    description: 'Bag label and sleeve concepts for the new single-origin line.',
    designer: designer._id,
    clientName: 'Ifeoma Okafor',
    clientEmail: 'ifeoma@northhill.co',
    inviteToken: crypto.randomBytes(18).toString('hex')
  });

  const proofSpecs = [
    {
      project: campaign,
      title: 'Instagram card: launch week',
      version: 2,
      status: 'revision',
      decidedAt: new Date(Date.now() - 2 * 3600 * 1000),
      seedName: 'seed-campaign-card',
      svg: proofSvg({ kicker: 'NOW IN EVERY STORE', headline: ['Taste', 'the season'], sub: 'Jollof, suya and pepper soup. Ready in stores this week.', accent: AMBER, shape: 'circle' }),
      comments: [
        { by: tunde, kind: 'revision', body: 'Can the price line be bigger? Customers missed it last time.', minsAgo: 180 },
        { by: designer, kind: 'comment', body: 'Got it. I will push the price up and keep the headline the same size.', minsAgo: 150 }
      ]
    },
    {
      project: campaign,
      title: 'Shelf poster A2',
      version: 1,
      status: 'approved',
      decidedAt: new Date(Date.now() - 26 * 3600 * 1000),
      seedName: 'seed-campaign-poster',
      svg: proofSvg({ kicker: 'Q4 RANGE', headline: ['Bold', 'flavours'], sub: 'Shelf poster, A2 portrait. Colour approved.', accent: FOREST, shape: 'square' }),
      comments: [
        { by: tunde, kind: 'approved', body: 'Looks great. Approved for print.', minsAgo: 26 * 60 }
      ]
    },
    {
      project: campaign,
      title: 'Price flyer',
      version: 1,
      status: 'pending',
      decidedAt: null,
      seedName: 'seed-campaign-flyer',
      svg: proofSvg({ kicker: 'PRICE GUIDE', headline: ['This week', 'only'], sub: 'Flyer with the new price list. Please check the naira figures.', accent: AMBER, shape: 'circle' }),
      comments: []
    },
    {
      project: northhill,
      title: 'Bag label: concept A',
      version: 1,
      status: 'pending',
      decidedAt: null,
      seedName: 'seed-northhill-label-a',
      svg: proofSvg({ kicker: 'SINGLE ORIGIN', headline: ['Ibadan', 'roast'], sub: 'Concept A. Bold serif, cream stock.', accent: FOREST, shape: 'square' }),
      comments: []
    },
    {
      project: northhill,
      title: 'Bag label: concept B',
      version: 1,
      status: 'pending',
      decidedAt: null,
      seedName: 'seed-northhill-label-b',
      svg: proofSvg({ kicker: 'SINGLE ORIGIN', headline: ['Dark', 'morning'], sub: 'Concept B. Amber accent for the origin tag.', accent: AMBER, shape: 'circle' }),
      comments: []
    }
  ];

  const createdProofs = [];
  for (const spec of proofSpecs) {
    const record = makeProofRecord({ ...spec, project: spec.project });
    const proof = await Proof.create({
      project: record.project,
      title: record.title,
      version: record.version,
      status: record.status,
      decidedAt: record.decidedAt,
      file: record.file
    });
    createdProofs.push({ proof, spec });
  }

  const byTitle = Object.fromEntries(createdProofs.map(({ proof }) => [proof.title, proof]));

  // Comments, timestamped in the past so the thread reads in order.
  for (const { proof, spec } of createdProofs) {
    for (const c of spec.comments) {
      const createdAt = new Date(Date.now() - c.minsAgo * 60 * 1000);
      await Comment.create({
        proof: proof._id,
        project: proof.project,
        author: c.by._id,
        authorName: c.by.name,
        authorRole: c.by.role,
        kind: c.kind,
        body: c.body,
        createdAt
      });
    }
  }

  // Activity feed, roughly in the order things happened.
  const activity = [
    { project: campaign, type: 'project_created', actor: designer, message: 'Amara Eze created Lagos Foods Q4 Campaign', minsAgo: 60 * 24 * 4 },
    { project: campaign, type: 'client_joined', actor: tunde, message: 'Tunde Bello joined the project', minsAgo: 60 * 24 * 3 },
    { project: campaign, type: 'proof_uploaded', actor: designer, message: 'Amara Eze uploaded Shelf poster A2', proof: byTitle['Shelf poster A2'], minsAgo: 60 * 24 * 3 },
    { project: campaign, type: 'proof_approved', actor: tunde, message: 'Tunde Bello approved Shelf poster A2', proof: byTitle['Shelf poster A2'], minsAgo: 60 * 26 },
    { project: campaign, type: 'proof_uploaded', actor: designer, message: 'Amara Eze uploaded Instagram card: launch week', proof: byTitle['Instagram card: launch week'], minsAgo: 60 * 6 },
    { project: campaign, type: 'proof_revision', actor: tunde, message: 'Tunde Bello requested changes on Instagram card: launch week', proof: byTitle['Instagram card: launch week'], minsAgo: 180 },
    { project: campaign, type: 'comment_added', actor: designer, message: 'Amara Eze replied on Instagram card: launch week', proof: byTitle['Instagram card: launch week'], minsAgo: 150 },
    { project: campaign, type: 'proof_uploaded', actor: designer, message: 'Amara Eze uploaded Price flyer', proof: byTitle['Price flyer'], minsAgo: 40 },
    { project: northhill, type: 'project_created', actor: designer, message: 'Amara Eze created Northhill Coffee Packaging', minsAgo: 60 * 24 },
    { project: northhill, type: 'proof_uploaded', actor: designer, message: 'Amara Eze uploaded Bag label: concept A', proof: byTitle['Bag label: concept A'], minsAgo: 60 * 20 },
    { project: northhill, type: 'proof_uploaded', actor: designer, message: 'Amara Eze uploaded Bag label: concept B', proof: byTitle['Bag label: concept B'], minsAgo: 60 * 19 }
  ];
  for (const a of activity) {
    await Activity.create({
      project: a.project._id,
      proof: a.proof ? a.proof._id : undefined,
      actor: a.actor._id,
      type: a.type,
      message: a.message,
      createdAt: new Date(Date.now() - a.minsAgo * 60 * 1000)
    });
  }

  console.log('Seeded demo data.');
  console.log(`Designer: amara@studioverde.ng / ${DEMO_PASSWORD}`);
  console.log(`Client:   tunde@lagosfoods.ng / ${DEMO_PASSWORD}`);
  console.log(`Invite:   ${process.env.CLIENT_URL || 'http://localhost:5173'}/invite/${northhill.inviteToken} (ifeoma@northhill.co has no account yet; she signs up through this link)`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Seed failed', err);
  process.exit(1);
});
