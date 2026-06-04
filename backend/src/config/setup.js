const bcrypt = require('bcryptjs');
const { collection, queryDocs, addDoc, setDoc } = require('./firebase');
const logger = require('../utils/logger');

const SERVICES = [
  { name: 'Hair Braiding', category: 'Beauty' },
  { name: 'Hair Weaving', category: 'Beauty' },
  { name: 'Makeup Artist', category: 'Beauty' },
  { name: 'Nail Technician', category: 'Beauty' },
  { name: 'Barbing', category: 'Beauty' },
  { name: 'Lash Extensions', category: 'Beauty' },
  { name: 'Tailor', category: 'Fashion' },
  { name: 'Dry Cleaning', category: 'Fashion' },
  { name: 'Shoe Cobbler', category: 'Fashion' },
  { name: 'Plumber', category: 'Home Services' },
  { name: 'Electrician', category: 'Home Services' },
  { name: 'Carpenter', category: 'Home Services' },
  { name: 'AC Repair', category: 'Home Services' },
  { name: 'Generator Repair', category: 'Home Services' },
  { name: 'Painter', category: 'Home Services' },
  { name: 'Cleaner', category: 'Home Services' },
  { name: 'Fumigation', category: 'Home Services' },
  { name: 'Mechanic', category: 'Automotive' },
  { name: 'Car Wash', category: 'Automotive' },
  { name: 'Auto Electrician', category: 'Automotive' },
  { name: 'Vulcanizer', category: 'Automotive' },
  { name: 'Private Tutor', category: 'Education' },
  { name: 'Photographer', category: 'Creative' },
  { name: 'Videographer', category: 'Creative' },
  { name: 'Event DJ', category: 'Creative' },
  { name: 'Catering', category: 'Food' },
  { name: 'Waiter / Waitress', category: 'Food' },
  { name: 'Personal Trainer', category: 'Fitness' },
  { name: 'Dispatch Rider', category: 'Logistics' },
  { name: 'Security Guard', category: 'Security' },
];

const seedServices = async () => {
  const existing = await queryDocs('services', [], null, 1);
  if (existing.length > 0) {
    logger.info('Services already seeded');
    return;
  }
  for (const service of SERVICES) {
    await addDoc('services', { ...service, isActive: true, usageCount: 0 });
  }
  logger.info(`${SERVICES.length} services seeded`);
};

const seedAdmin = async () => {
  const phone = process.env.ADMIN_PHONE;
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME || 'Link Admin';

  if (!phone || !password) {
    logger.warn('ADMIN_PHONE and ADMIN_PASSWORD not set — skipping admin seed');
    return;
  }

  const existing = await queryDocs('users', [['phone', '==', phone], ['role', '==', 'admin']], null, 1);
  if (existing.length > 0) {
    logger.info(`Admin already exists: ${phone}`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await addDoc('users', {
    role: 'admin',
    fullName: name,
    phone,
    phoneVerified: true,
    passwordHash,
    isActive: true,
  });

  logger.info(`✓ Admin created: ${phone}`);
};

const setup = async () => {
  logger.info('Running setup...');
  await seedServices();
  await seedAdmin();
  logger.info('Setup complete');
};

module.exports = setup;
