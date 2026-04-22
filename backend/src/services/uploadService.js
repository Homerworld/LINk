const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const BUCKET = process.env.AWS_S3_BUCKET;

const uploadToS3 = async (buffer, key, contentType) => {
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }));
  return `https://${BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
};

exports.uploadKycDocument = async (file, userId, type) => {
  const ext = file.originalname.split('.').pop();
  const key = `kyc/${userId}/${type}-${uuidv4()}.${ext}`;
  return uploadToS3(file.buffer, key, file.mimetype);
};

exports.uploadPortfolioImage = async (file, userId) => {
  const ext = file.originalname.split('.').pop();
  const key = `portfolio/${userId}/${uuidv4()}.${ext}`;
  return uploadToS3(file.buffer, key, file.mimetype);
};

exports.uploadProfilePhoto = async (file, userId) => {
  const ext = file.originalname.split('.').pop();
  const key = `profiles/${userId}/${uuidv4()}.${ext}`;
  return uploadToS3(file.buffer, key, file.mimetype);
};

exports.uploadDisputeEvidence = async (file, userId, disputeId) => {
  const ext = file.originalname.split('.').pop();
  const key = `disputes/${disputeId}/${userId}-${uuidv4()}.${ext}`;
  const url = await uploadToS3(file.buffer, key, file.mimetype);
  return { url, key };
};

exports.uploadRecording = async (buffer, jobId, type) => {
  const key = `recordings/${jobId}/${type}-${uuidv4()}.webm`;
  const url = await uploadToS3(buffer, key, 'audio/webm');
  return { url, key };
};

exports.deleteFromS3 = async (key) => {
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
  } catch (err) {
    logger.error('S3 delete error', err);
  }
};
