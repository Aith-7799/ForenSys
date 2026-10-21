// demo-nosql.mjs -- Live MongoDB Atlas NoSQL Demonstration for Faculty
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const uri = process.env.MONGODB_URI || process.env.DATABASE_URL;

async function runDemo() {
  console.log('='.repeat(70));
  console.log('  FORENSYS: LIVE NoSQL (MONGODB ATLAS CLUSTER) DEMONSTRATION');
  console.log('='.repeat(70));

  console.log('\n[1] Connecting to MongoDB Atlas Cloud Cluster...');
  const conn = await mongoose.connect(uri);
  const db = conn.connection.db;
  console.log(`[SUCCESS] Connected to Cloud Host: ${conn.connection.host}`);
  console.log(`[DATABASE] Active Database: ${db.databaseName}`);

  // 1. List Collections and counts
  console.log('\n[2] Collections in NoSQL Database:');
  const collections = await db.listCollections().toArray();
  for (const col of collections) {
    const count = await db.collection(col.name).countDocuments();
    console.log(`    - ${col.name.padEnd(28)} : ${count} documents`);
  }

  // 2. Demonstrate Polymorphic Document (Embedded Subdocuments)
  console.log('\n[3] NoSQL Document Model (Hierarchical & Embedded Subdocuments):');
  const sampleEvidence = await db.collection('evidences').findOne({ 'digital.mediaType': { $exists: true } });
  if (sampleEvidence) {
    console.log('Sample Digital Evidence Document (BSON JSON):');
    console.log(JSON.stringify(sampleEvidence, null, 2));
  }

  // 3. Demonstrate NoSQL Aggregation Pipeline
  console.log('\n[4] Executing MongoDB Aggregation Pipeline ($lookup + $group + $project):');
  const pipeline = [
    {
      $lookup: {
        from: 'evidences',
        localField: 'caseId',
        foreignField: 'caseId',
        as: 'evidenceItems',
      },
    },
    {
      $group: {
        _id: '$status',
        totalCases: { $sum: 1 },
        totalEvidenceItems: { $sum: { $size: '$evidenceItems' } },
      },
    },
    {
      $project: {
        _id: 0,
        caseStatus: '$_id',
        totalCases: 1,
        totalEvidenceItems: 1,
      },
    },
    { $sort: { totalCases: -1 } },
  ];

  const aggResult = await db.collection('cases').aggregate(pipeline).toArray();
  console.table(aggResult);

  // 4. Duplicate Evidence Alert Document
  console.log('\n[5] Cross-Case Duplicate Evidence Alert Document:');
  const alert = await db.collection('duplicateevidencealerts').findOne({});
  if (alert) {
    console.log(JSON.stringify(alert, null, 2));
  } else {
    console.log('No duplicate alerts recorded yet.');
  }

  console.log('\n' + '='.repeat(70));
  console.log('  NoSQL Cloud Demonstration Complete.');
  console.log('='.repeat(70));

  await mongoose.disconnect();
  process.exit(0);
}

runDemo().catch((err) => {
  console.error('[ERROR]', err);
  process.exit(1);
});
